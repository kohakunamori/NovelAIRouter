import { Worker } from "bullmq";
import { GenerationJobStatus } from "@prisma/client";
import type { GenerationParams } from "@novelai-router/shared";
import { prisma } from "../db.js";
import { getRuntimeConfig } from "../runtimeConfig.js";
import { redis } from "../redis.js";
import { debitGenerationCost } from "../billing/billing.js";
import {
  clearTransientGenerationReferences,
  loadTransientGenerationReferences,
} from "./transientGenerationStore.js";
import type {
  NovelAiAccountTestResult,
  NovelAiProvider,
  NovelAiResolvedAssets,
} from "../novelai/NovelAiProvider.js";
import { acquireNovelAiAccountLease, type NovelAiAccountLease } from "../novelai/accountPool.js";
import { createNovelAiProvider } from "../novelai/providerFactory.js";
import { ensureGenerationParams } from "../policies/policyEngine.js";
import { generationEventBus, nowIso } from "./eventBus.js";
import type { GenerationJobData } from "./generationQueue.js";
import {
  createOwnedAssetFromBuffer,
  deleteOwnedAsset,
  loadOwnedAssetsMap,
  readAssetBuffer,
  serializeAsset,
} from "../assetsService.js";

export function createGenerationWorker(provider: NovelAiProvider = createNovelAiProvider()) {
  const runtimeConfig = getRuntimeConfig();

  return new Worker<GenerationJobData>(
    "generation",
    async (job) => {
      await processGenerationJob(job.data.generationJobId, provider);
    },
    {
      connection: redis,
      concurrency: runtimeConfig.generationConcurrency,
    },
  );
}

async function processGenerationJob(generationJobId: string, provider: NovelAiProvider) {
  let lease: NovelAiAccountLease | undefined;
  let heartbeat: NodeJS.Timeout | undefined;
  let intermediateOutputCount = 0;
  let intermediateOutputSseBytes = 0;

  try {
    const dbJob = await prisma.generationJob.findUnique({ where: { id: generationJobId } });
    if (!dbJob) throw new Error(`Generation job ${generationJobId} not found`);
    const normalizedParams = ensureGenerationParams(dbJob.normalizedParamsJson);
    const resolvedAssets = await resolveGenerationAssets(generationJobId, dbJob.userId, normalizedParams);

    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: { status: GenerationJobStatus.RUNNING, startedAt: new Date() },
    });
    generationEventBus.publish({
      type: "running",
      jobId: generationJobId,
      at: nowIso(),
      normalizedParams: normalizedParams as GenerationParams,
    });

    generationEventBus.publish({ type: "provider_progress", jobId: generationJobId, at: nowIso(), message: "Acquiring NovelAI account lease" });
    lease = await acquireNovelAiAccountLease(generationJobId);
    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: { novelAiAccountId: lease.accountId },
    });
    heartbeat = setInterval(() => {
      void lease?.heartbeat();
    }, getRuntimeConfig().novelAiAccountLeaseHeartbeatMs);
    generationEventBus.publish({ type: "provider_progress", jobId: generationJobId, at: nowIso(), message: "NovelAI account lease acquired" });

    const abortController = new AbortController();
    const beforeHealthCheck = lease
      ? await provider.healthCheckAccount({ accountId: lease.accountId, credential: lease.credential, signal: abortController.signal })
      : null;
    if (lease && beforeHealthCheck) {
      await syncNovelAiAccountRemoteState(lease.accountId, beforeHealthCheck);
    }
    const anlasBefore = beforeHealthCheck?.remote?.anlasBalance ?? null;

    const result = await provider.generate({
      jobId: generationJobId,
      params: normalizedParams,
      resolvedAssets,
      signal: abortController.signal,
      ...(lease ? { accountId: lease.accountId, credential: lease.credential } : {}),
      onProgress: (message) => {
        generationEventBus.publish({ type: "provider_progress", jobId: generationJobId, at: nowIso(), message });
      },
      onIntermediateFrame: async (frame) => {
        const event = {
          type: "intermediate_output_ready" as const,
          jobId: generationJobId,
          at: nowIso(),
          outputIndex: frame.outputIndex,
          stepIndex: frame.stepIndex,
          mimeType: frame.mimeType,
          imageBase64: frame.buffer.toString("base64"),
          totalSteps: frame.totalSteps,
          sigma: frame.sigma,
          providerGenerationId: frame.providerGenerationId,
        };
        intermediateOutputCount += 1;
        intermediateOutputSseBytes += estimateSseEventBytes(event);
        generationEventBus.publish(event);
      },
    });

    if (result.images.length === 0) {
      throw new Error("Provider completed without any output images");
    }

    for (const [index, image] of result.images.entries()) {
      const output = await persistGeneratedOutput({
        generationJobId,
        userId: dbJob.userId,
        index,
        mimeType: result.mimeType,
        buffer: image,
      });

      generationEventBus.publish({
        type: "output_ready",
        jobId: generationJobId,
        at: nowIso(),
        outputIndex: index,
        outputCount: result.images.length,
        mimeType: output.asset.mimeType,
        asset: serializeAsset(output.asset),
      });
    }

    await clearTransientGenerationReferences(generationJobId);
    await lease?.markSuccess();

    const actualNovelAiAnlas = await resolveActualNovelAiAnlas(provider, lease, abortController.signal, anlasBefore, result.actualNovelAiAnlas);
    const multiplier = Number(dbJob.platformMultiplierSnapshot ?? 1);
    const { billedPlatformUnits } = await debitGenerationCost({
      userId: dbJob.userId,
      generationJobId,
      actualNovelAiAnlas,
      multiplier,
    });

    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: {
        status: GenerationJobStatus.SUCCEEDED,
        novelAiRequestId: result.requestId,
        actualNovelAiAnlas,
        resultMimeType: result.mimeType,
        intermediateOutputCount,
        intermediateOutputSseBytes,
        billedPlatformUnits,
        completedAt: new Date(),
      },
    });

    generationEventBus.publish({
      type: "billing_recorded",
      jobId: generationJobId,
      at: nowIso(),
      actualNovelAiAnlas,
      platformMultiplierSnapshot: multiplier,
      billedPlatformUnits,
    });
    generationEventBus.publish({
      type: "succeeded",
      jobId: generationJobId,
      at: nowIso(),
      status: "SUCCEEDED",
      errorCode: null,
      errorMessage: null,
    });
  } catch (error) {
    await clearTransientGenerationReferences(generationJobId);
    await lease?.markFailure(error);
    const message = error instanceof Error ? error.message : "Generation failed";
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : "GENERATION_FAILED";

    await prisma.generationJob.updateMany({
      where: { id: generationJobId },
      data: {
        status: GenerationJobStatus.FAILED,
        intermediateOutputCount,
        intermediateOutputSseBytes,
        errorCode: code,
        errorMessage: message,
        completedAt: new Date(),
      },
    });
    generationEventBus.publish({
      type: "failed",
      jobId: generationJobId,
      at: nowIso(),
      status: "FAILED",
      errorCode: code,
      errorMessage: message,
    });
    throw error;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    await lease?.release();
  }
}

async function persistGeneratedOutput(input: {
  generationJobId: string;
  userId: string;
  index: number;
  mimeType: string;
  buffer: Buffer;
}) {
  const asset = await createOwnedAssetFromBuffer({
    userId: input.userId,
    kind: "GENERATED_IMAGE",
    mimeType: input.mimeType,
    buffer: input.buffer,
    originalFilename: defaultOutputFilename(input.generationJobId, input.index, input.mimeType),
    prefix: "generated",
  });

  try {
    await prisma.generationOutput.create({
      data: {
        generationJobId: input.generationJobId,
        assetId: asset.id,
        index: input.index,
      },
    });
    return { asset };
  } catch (error) {
    await deleteOwnedAsset(asset);
    throw error;
  }
}

function defaultOutputFilename(generationJobId: string, index: number, mimeType: string) {
  if (mimeType === "image/png") return `${generationJobId}-${index + 1}.png`;
  if (mimeType === "image/jpeg") return `${generationJobId}-${index + 1}.jpg`;
  return null;
}

async function resolveGenerationAssets(jobId: string, userId: string, params: GenerationParams): Promise<NovelAiResolvedAssets> {
  const references = await loadTransientGenerationReferences(jobId);
  const sourceImage = await resolveSourceImage(userId, params);
  const baseImage = params.baseImage && references?.baseImage
    ? {
        mimeType: references.baseImage.mimeType,
        originalFilename: references.baseImage.originalFilename,
        buffer: Buffer.from(references.baseImage.base64, "base64"),
        strength: params.baseImage.strength,
      }
    : null;
  const providerParameters = params.providerParameters as Record<string, unknown>;
  const hasDirectVibeReferences = countDirectProviderReferences(
    providerParameters.reference_image_multiple,
    providerParameters.reference_image_multiple_cached,
  ) > 0;
  const hasDirectPreciseReferences = countDirectProviderReferences(
    providerParameters.director_reference_images,
    providerParameters.director_reference_images_cached,
  ) > 0;

  return {
    sourceImage,
    baseImage,
    vibeTransfers: params.vibeTransfers.flatMap((reference, index) => {
      const image = references?.vibeTransfers[index];
      if (!image) {
        if (hasDirectVibeReferences) return [];
        throw new Error(`Vibe transfer ${index + 1} was not available for generation`);
      }
      return [{
        mimeType: image.mimeType,
        originalFilename: image.originalFilename,
        buffer: Buffer.from(image.base64, "base64"),
        strength: reference.strength,
        informationExtracted: reference.informationExtracted,
      }];
    }),
    preciseReferences: params.preciseReferences.flatMap((reference, index) => {
      const image = references?.preciseReferences[index];
      if (!image) {
        if (hasDirectPreciseReferences) return [];
        throw new Error(`Precise reference ${index + 1} was not available for generation`);
      }
      return [{
        mimeType: image.mimeType,
        originalFilename: image.originalFilename,
        buffer: Buffer.from(image.base64, "base64"),
        prompt: reference.prompt,
        strength: reference.strength,
        secondaryStrength: reference.secondaryStrength,
        informationExtracted: reference.informationExtracted,
      }];
    }),
  };
}

async function resolveSourceImage(userId: string, params: GenerationParams) {
  if (params.operation.kind === "generate" || !params.operation.sourceAssetId) return null;

  const assets = await loadOwnedAssetsMap(userId, [params.operation.sourceAssetId]);
  const sourceAsset = assets.get(params.operation.sourceAssetId);
  if (!sourceAsset) {
    throw new Error(`Source asset ${params.operation.sourceAssetId} was not available for generation`);
  }

  return {
    mimeType: sourceAsset.mimeType,
    originalFilename: sourceAsset.originalFilename,
    buffer: await readAssetBuffer(sourceAsset),
  };
}

function countDirectProviderReferences(...values: unknown[]) {
  return values.reduce<number>((max, value) => Array.isArray(value) ? Math.max(max, value.length) : max, 0);
}

function estimateSseEventBytes(event: { type: string }) {
  return Buffer.byteLength(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`, "utf8");
}

async function resolveActualNovelAiAnlas(
  provider: NovelAiProvider,
  lease: NovelAiAccountLease | undefined,
  signal: AbortSignal,
  anlasBefore: number | null,
  actualNovelAiAnlas: number | null,
) {
  if (actualNovelAiAnlas !== null) return actualNovelAiAnlas;
  if (!lease) {
    throw new Error("NovelAI Anlas usage could not be determined for billing");
  }

  const after = await provider.healthCheckAccount({ accountId: lease.accountId, credential: lease.credential, signal });
  await syncNovelAiAccountRemoteState(lease.accountId, after);
  const anlasAfter = after.remote?.anlasBalance ?? null;
  if (anlasBefore === null || anlasAfter === null) {
    throw new Error("NovelAI subscription balance could not be read for billing");
  }

  return Math.max(anlasBefore - anlasAfter, 0);
}

async function syncNovelAiAccountRemoteState(accountId: string, result: NovelAiAccountTestResult) {
  await prisma.novelAiAccount.update({
    where: { id: accountId },
    data: {
      lastCheckedAt: new Date(),
      remoteAccountLabel: result.remote?.accountLabel ?? null,
      remoteAnlasBalance: result.remote?.anlasBalance ?? null,
      remoteTier: result.remote?.tier ?? null,
      remoteActive: result.remote?.active ?? null,
      remoteUnlimitedImageGeneration: result.remote?.unlimitedImageGeneration ?? null,
      remoteMaxPriorityActions: result.remote?.maxPriorityActions ?? null,
      remoteFixedTrainingStepsLeft: result.remote?.fixedTrainingStepsLeft ?? null,
      remotePurchasedTrainingSteps: result.remote?.purchasedTrainingSteps ?? null,
    },
  });
}
