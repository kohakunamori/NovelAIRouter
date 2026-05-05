import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  estimateGenerationAnlas,
  generationDetailResponseSchema,
  generationHistoryDetailResponseSchema,
  generationHistoryListResponseSchema,
  generationListResponseSchema,
  generationParamsSchema,
  generationRequestSchema,
  isNovelAiRequest,
  novelAiRequestToGenerationRequest,
  normalizeGenerationRequest,
  submittedGenerationRequestSchema,
  supportedNovelAiRequestSchema,
  supportedNovelAiRequestToGenerationRequest,
  type GenerationEvent,
  type GenerationParams,
  type GenerationRequest,
  type NovelAiParameters,
  type NovelAiRequest,
  type SubmittedGenerationRequest,
  type SupportedNovelAiRequest,
} from "@novelai-router/shared";
import { currentUser, requireAdmin, requireAuth } from "../auth/guards.js";
import { getPlatformSettings } from "../billing/billing.js";
import { buildAllowedOrigins, getCorsHeaders } from "../cors.js";
import { env } from "../env.js";
import { getNovelAiReadiness } from "../novelai/readiness.js";
import { prisma } from "../db.js";
import { badRequest, notFound } from "../errors.js";
import { applyParameterPolicies } from "../policies/policyEngine.js";
import { loadApplicablePolicies } from "../policies/policyStore.js";
import { binaryStorage } from "../storage/index.js";
import {
  createOwnedAssetFromBuffer,
  loadOwnedAssetsMap,
  serializeAsset,
} from "../assetsService.js";
import { enqueueGeneration } from "./generationQueue.js";
import { generationEventBus, nowIso } from "./eventBus.js";
import {
  storeTransientGenerationReferences,
  type TransientGenerationReferences,
} from "./transientGenerationStore.js";

const jobParamsSchema = z.object({ jobId: z.string().min(1) });
const resultParamsSchema = z.object({ jobId: z.string().min(1), index: z.coerce.number().int().nonnegative() });
const allowedOrigins = buildAllowedOrigins(env.WEB_ORIGIN);

type GenerationJobRecord = Prisma.GenerationJobGetPayload<{}>;
type GenerationJobSummaryRecord = Prisma.GenerationJobGetPayload<{
  include: { outputs: { select: { id: true } } };
}>;
type GenerationJobDetailRecord = Prisma.GenerationJobGetPayload<{
  include: { outputs: { include: { asset: true } } };
}>;
type InboundGenerationSubmission = GenerationRequest | SupportedNovelAiRequest;

type ParsedGenerationSubmission = {
  submittedParams: SubmittedGenerationRequest;
  policyRequest: GenerationRequest;
  references: TransientGenerationReferences;
};
type UploadedImagePart = {
  fieldname: string;
  mimeType: string;
  originalFilename: string | null;
  buffer: Buffer;
};

export async function generationRoutes(app: FastifyInstance) {
  app.post("/api/generations", { preHandler: requireAuth }, async (request) => {
    const user = currentUser(request);
    const submission = await parseGenerationSubmission(request, user.id);
    await assertReferencedAssetsOwnedByUser(user.id, submission.policyRequest);
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) throw notFound("User not found");

    const policies = await loadApplicablePolicies(user.id, user.role);
    const policyDecision = applyParameterPolicies(submission.policyRequest, policies, { userId: user.id, role: user.role });
    if (!policyDecision.accepted || !policyDecision.normalizedParams) {
      throw badRequest("GENERATION_PARAMS_REJECTED", "Generation parameters were rejected by policy", policyDecision);
    }

    const estimate = estimateGenerationAnlas(policyDecision.normalizedParams);
    if (estimate.estimatedAnlas > 0 && dbUser.balance < estimate.estimatedAnlas) {
      throw badRequest(
        "INSUFFICIENT_BALANCE",
        `Estimated generation cost is ${estimate.estimatedAnlas} Anlas, but user balance is ${dbUser.balance}.`,
        {
          estimatedAnlas: estimate.estimatedAnlas,
          balance: dbUser.balance,
        },
      );
    }

    assertInlineReferenceAlignment(policyDecision.normalizedParams, submission.references);

    const activeAccountCount = await prisma.novelAiAccount.count({ where: { status: "ACTIVE" } });
    const readiness = getNovelAiReadiness({
      activeAccountCount,
    });
    if (!readiness.readyForRealGeneration) {
      throw badRequest("REAL_PROVIDER_NOT_READY", `Real NovelAI generation is blocked: ${readiness.blockers.join("; ")}`);
    }

    const settings = await getPlatformSettings();
    const generationJob = await prisma.generationJob.create({
      data: {
        userId: user.id,
        status: "QUEUED",
        submittedParamsJson: toJson(submission.submittedParams),
        normalizedParamsJson: toJson(policyDecision.normalizedParams),
        policyVersion: policyDecision.policyVersion,
        policyDecisionJson: toJson(policyDecision),
        estimatedNovelAiAnlas: estimate.estimatedAnlas,
        platformMultiplierSnapshot: settings.anlasMultiplier,
      },
    });

    await storeTransientGenerationReferences(generationJob.id, submission.references);
    await enqueueGeneration(generationJob.id);

    generationEventBus.publish({ type: "queued", jobId: generationJob.id, at: nowIso(), position: null });
    generationEventBus.publish({ type: "policy_applied", jobId: generationJob.id, at: nowIso(), decision: policyDecision });

    return { jobId: generationJob.id };
  });

  app.get("/api/generations", { preHandler: requireAuth }, async (request) => {
    const user = currentUser(request);
    const jobs = await prisma.generationJob.findMany({
      where: { userId: user.id },
      include: { outputs: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return generationListResponseSchema.parse({ jobs: jobs.map(serializeGenerationStatus) });
  });

  app.get("/api/generations/:jobId", { preHandler: requireAuth }, async (request) => {
    const user = currentUser(request);
    const params = jobParamsSchema.parse(request.params);
    const job = await requireOwnedJobDetail(params.jobId, user.id);
    return generationDetailResponseSchema.parse({ job: serializeGenerationDetail(job) });
  });

  app.get("/api/history", { preHandler: requireAdmin }, async () => {
    const jobs = await prisma.generationJob.findMany({
      include: { outputs: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return generationHistoryListResponseSchema.parse({ jobs: jobs.map(serializeAdminGenerationRecord) });
  });

  app.get("/api/history/:jobId", { preHandler: requireAdmin }, async (request) => {
    const params = jobParamsSchema.parse(request.params);
    const job = await requireJobRecordDetail(params.jobId);
    return generationHistoryDetailResponseSchema.parse({ job: serializeAdminGenerationDetail(job) });
  });

  app.get("/api/generations/:jobId/events", { preHandler: requireAuth }, async (request, reply) => {
    const user = currentUser(request);
    const params = jobParamsSchema.parse(request.params);
    const job = await requireOwnedJobDetail(params.jobId, user.id);

    reply.hijack();
    reply.raw.writeHead(200, {
      ...getCorsHeaders(request.headers.origin, allowedOrigins),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: GenerationEvent) => {
      if (reply.raw.writableEnded) return;
      reply.raw.write(`event: ${event.type}\n`);
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const cleanup = () => {
      clearInterval(keepAlive);
      unsubscribe();
      if (!reply.raw.writableEnded) reply.raw.end();
    };

    const unsubscribe = generationEventBus.subscribe(params.jobId, (event) => {
      send(event);
      if (event.type === "succeeded" || event.type === "failed" || event.type === "cancelled") cleanup();
    });

    const keepAlive = setInterval(() => {
      if (!reply.raw.writableEnded) reply.raw.write(": keepalive\n\n");
    }, 15_000);

    request.raw.on("close", cleanup);
    replayPersistedOutputEvents(job).forEach(send);
    send(snapshotEvent(job));
  });

  app.get("/api/generations/:jobId/results/:index", { preHandler: requireAuth }, async (request, reply) => {
    const user = currentUser(request);
    const params = resultParamsSchema.parse(request.params);
    await requireOwnedJob(params.jobId, user.id);
    const output = await prisma.generationOutput.findUnique({
      where: {
        generationJobId_index: {
          generationJobId: params.jobId,
          index: params.index,
        },
      },
      include: { asset: true },
    });
    if (!output) {
      throw badRequest("RESULT_NOT_AVAILABLE", "Generation does not have a result available for this output index yet");
    }

    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.type(output.asset.mimeType);
    return reply.send(binaryStorage.createReadStream(output.asset.storageKey));
  });
}

async function parseGenerationSubmission(request: Parameters<FastifyInstance["post"]>[1] extends never ? never : any, userId: string): Promise<ParsedGenerationSubmission> {
  if (!request.isMultipart()) {
    const submittedParams = parseInboundSubmittedGenerationRequest(request.body);
    return prepareParsedSubmission(submittedParams, userId, new Map());
  }

  let rawRequest: unknown = null;
  const fileParts = new Map<string, UploadedImagePart[]>();

  for await (const part of request.parts()) {
    if (part.type === "file") {
      if (!part.mimetype.startsWith("image/")) {
        throw badRequest("UNSUPPORTED_ASSET_TYPE", `Unsupported image MIME type: ${part.mimetype}`);
      }
      const buffer = await part.toBuffer();
      const entry: UploadedImagePart = {
        fieldname: part.fieldname,
        mimeType: part.mimetype,
        originalFilename: part.filename ?? null,
        buffer,
      };
      const bucket = fileParts.get(part.fieldname) ?? [];
      bucket.push(entry);
      fileParts.set(part.fieldname, bucket);
      continue;
    }

    if (part.fieldname === "request") {
      try {
        rawRequest = JSON.parse(String(part.value));
      } catch {
        throw badRequest("INVALID_GENERATION_REQUEST", "Generation request metadata was not valid JSON");
      }
    }
  }

  if (!rawRequest) {
    throw badRequest("GENERATION_REQUEST_MISSING", "Generation request metadata was missing from multipart submission");
  }

  const submittedParams = parseInboundSubmittedGenerationRequest(rawRequest);
  return prepareParsedSubmission(submittedParams, userId, fileParts);
}

function parseInboundSubmittedGenerationRequest(value: unknown): InboundGenerationSubmission {
  if (looksLikeNovelAiRequest(value)) {
    const parsed = supportedNovelAiRequestSchema.safeParse(value);
    if (!parsed.success) {
      throw badRequest("UNSUPPORTED_NOVELAI_REQUEST", "Only verified NovelAI request shapes are supported", parsed.error.issues);
    }
    return parsed.data;
  }

  return generationRequestSchema.parse(value);
}

async function prepareParsedSubmission(
  submittedParams: InboundGenerationSubmission,
  userId: string,
  fileParts: Map<string, UploadedImagePart[]>,
): Promise<ParsedGenerationSubmission> {
  if (isSupportedNovelAiInboundRequest(submittedParams)) {
    const hydrated = hydrateNovelAiRequest(submittedParams, fileParts);
    try {
      return {
        submittedParams: hydrated,
        policyRequest: supportedNovelAiRequestToGenerationRequest(hydrated),
        references: emptyTransientReferences(),
      };
    } catch (error) {
      throw badRequest(
        "UNSUPPORTED_NOVELAI_REQUEST",
        error instanceof Error ? error.message : "Only verified NovelAI request shapes are supported",
      );
    }
  }

  return prepareLegacySubmission(submittedParams, userId, fileParts);
}

async function prepareLegacySubmission(
  submittedParams: GenerationRequest,
  userId: string,
  fileParts: Map<string, UploadedImagePart[]>,
): Promise<ParsedGenerationSubmission> {
  const sourceImage = pickFirstFile(fileParts, "sourceImage", "source-image", "image");
  let policyRequest = submittedParams;

  if (submittedParams.operation && submittedParams.operation.kind !== "generate" && !submittedParams.operation.sourceAssetId && sourceImage) {
    const sourceAsset = await createOwnedAssetFromBuffer({
      userId,
      kind: "REFERENCE_IMAGE",
      mimeType: sourceImage.mimeType,
      buffer: sourceImage.buffer,
      originalFilename: sourceImage.originalFilename,
      prefix: "assets",
    });

    policyRequest = generationRequestSchema.parse({
      ...submittedParams,
      operation: {
        ...submittedParams.operation,
        sourceAssetId: sourceAsset.id,
      },
    });
  }

  const vibeTransfers = collectIndexedFiles(fileParts, /^(?:vibeTransfer)(\d+)$/);
  const preciseReferences = collectIndexedFiles(fileParts, /^(?:preciseReference)(\d+)$/);
  const baseImage = pickFirstFile(fileParts, "baseImage");

  const references: TransientGenerationReferences = {
    baseImage: policyRequest.baseImage && baseImage ? toTransientImage(baseImage, { strength: 0 }) : null,
    vibeTransfers: compactIndexedArray(vibeTransfers).map((image, index) => ({
      ...toTransientImage(image, { strength: 0, informationExtracted: true }),
      strength: policyRequest.vibeTransfers?.[index]?.strength ?? 0.65,
      informationExtracted: policyRequest.vibeTransfers?.[index]?.informationExtracted ?? true,
    })),
    preciseReferences: compactIndexedArray(preciseReferences).map((image, index) => ({
      ...toTransientImage(image, { prompt: "", strength: 0, secondaryStrength: 0, informationExtracted: true }),
      prompt: policyRequest.preciseReferences?.[index]?.prompt ?? "",
      strength: policyRequest.preciseReferences?.[index]?.strength ?? 0.55,
      secondaryStrength: policyRequest.preciseReferences?.[index]?.secondaryStrength ?? 0.35,
      informationExtracted: policyRequest.preciseReferences?.[index]?.informationExtracted ?? true,
    })),
  };

  return {
    submittedParams,
    policyRequest,
    references,
  };
}

function hydrateNovelAiRequest(submittedParams: SupportedNovelAiRequest, fileParts: Map<string, UploadedImagePart[]>) {
  const parameters = structuredCloneParameters(submittedParams.parameters);

  const directImage = resolveDirectImageParameter(parameters.image, fileParts, submittedParams.action === "generate"
    ? ["image", "baseImage", "base-image"]
    : ["image", "sourceImage", "source-image"]);
  if (directImage) {
    parameters.image = directImage;
  }

  const directMask = resolveDirectImageParameter(parameters.mask, fileParts, ["mask"]);
  if (directMask) {
    parameters.mask = directMask;
  }

  const vibeImages = parameters.reference_image_multiple?.map((entry) => resolveImageReference(entry, fileParts) ?? entry)
    ?? collectSequentialBase64Images(fileParts, /^(?:vibeTransfer)(\d+)$/, /^(?:ref_multiple_)(\d+)$/);
  if (vibeImages.length > 0) {
    parameters.reference_image_multiple = vibeImages;
  }

  const preciseImages = parameters.director_reference_images?.map((entry) => resolveImageReference(entry, fileParts) ?? entry)
    ?? collectSequentialBase64Images(fileParts, /^(?:preciseReference)(\d+)$/, /^(?:director_ref_)(\d+)$/);
  if (preciseImages.length > 0) {
    parameters.director_reference_images = preciseImages;
  }

  return supportedNovelAiRequestSchema.parse({
    ...submittedParams,
    parameters,
  });
}

function isSupportedNovelAiInboundRequest(value: InboundGenerationSubmission): value is SupportedNovelAiRequest {
  return looksLikeNovelAiRequest(value);
}

function looksLikeNovelAiRequest(value: unknown): value is NovelAiRequest {
  return Boolean(value) && typeof value === "object" && "input" in (value as Record<string, unknown>) && "parameters" in (value as Record<string, unknown>);
}

function resolveDirectImageParameter(value: unknown, fileParts: Map<string, UploadedImagePart[]>, fallbackNames: string[]) {
  if (typeof value === "string") {
    const matched = pickFirstFile(fileParts, value);
    if (matched) return matched.buffer.toString("base64");
    if (value.trim().length > 0) return value;
  }

  const fallback = pickFirstFile(fileParts, ...fallbackNames);
  return fallback ? fallback.buffer.toString("base64") : null;
}

function resolveImageReference(value: string, fileParts: Map<string, UploadedImagePart[]>) {
  const matched = pickFirstFile(fileParts, value);
  return matched ? matched.buffer.toString("base64") : null;
}

function collectSequentialBase64Images(fileParts: Map<string, UploadedImagePart[]>, ...patterns: RegExp[]) {
  const indexed = patterns.flatMap((pattern) => collectIndexedFiles(fileParts, pattern));
  return compactIndexedArray(indexed).map((entry) => entry.buffer.toString("base64"));
}

function collectIndexedFiles(fileParts: Map<string, UploadedImagePart[]>, pattern: RegExp) {
  const indexed: Array<UploadedImagePart | undefined> = [];
  for (const [fieldname, parts] of fileParts.entries()) {
    const match = fieldname.match(pattern);
    if (!match) continue;
    const index = Number.parseInt(match[1] ?? "", 10);
    if (!Number.isFinite(index)) continue;
    indexed[index] = parts[0];
  }
  return indexed;
}

function pickFirstFile(fileParts: Map<string, UploadedImagePart[]>, ...names: string[]) {
  for (const name of names) {
    const entry = fileParts.get(name)?.[0];
    if (entry) return entry;
  }
  return null;
}

function compactIndexedArray<T>(values: Array<T | undefined>) {
  return values.filter((value): value is T => Boolean(value));
}

function toTransientImage<T extends Record<string, unknown>>(image: UploadedImagePart, extra: T) {
  return {
    mimeType: image.mimeType,
    originalFilename: image.originalFilename,
    base64: image.buffer.toString("base64"),
    ...extra,
  };
}

function structuredCloneParameters<T>(parameters: T): T {
  return JSON.parse(JSON.stringify(parameters)) as T;
}

function emptyTransientReferences(): TransientGenerationReferences {
  return {
    baseImage: null,
    vibeTransfers: [],
    preciseReferences: [],
  };
}

function assertInlineReferenceAlignment(params: z.infer<typeof generationParamsSchema>, references: TransientGenerationReferences) {
  const rawParameters = params.providerParameters as Record<string, unknown>;
  const rawBaseImage = hasProviderImageValue(rawParameters.image) && params.operation.kind === "generate";
  const rawVibeCount = countReferenceEntries(rawParameters.reference_image_multiple, rawParameters.reference_image_multiple_cached);
  const rawPreciseCount = countReferenceEntries(rawParameters.director_reference_images, rawParameters.director_reference_images_cached);

  if (params.baseImage && !references.baseImage && !rawBaseImage) {
    throw badRequest("BASE_IMAGE_MISSING", "Base image metadata was submitted without an image payload");
  }
  if (!params.baseImage && references.baseImage) {
    throw badRequest("BASE_IMAGE_UNUSED", "A base image file was uploaded without matching request metadata");
  }

  const expectedVibeCount = references.vibeTransfers.length > 0 ? references.vibeTransfers.length : rawVibeCount;
  if (params.vibeTransfers.length !== expectedVibeCount) {
    throw badRequest("VIBE_TRANSFER_COUNT_MISMATCH", "Vibe transfer metadata and image payloads did not match");
  }

  const expectedPreciseCount = references.preciseReferences.length > 0 ? references.preciseReferences.length : rawPreciseCount;
  if (params.preciseReferences.length !== expectedPreciseCount) {
    throw badRequest("PRECISE_REFERENCE_COUNT_MISMATCH", "Precise reference metadata and image payloads did not match");
  }
}

function hasProviderImageValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function countReferenceEntries(...values: unknown[]) {
  return values.reduce<number>((max, value) => Array.isArray(value) ? Math.max(max, value.length) : max, 0);
}

async function assertReferencedAssetsOwnedByUser(userId: string, request: GenerationRequest) {
  const assetIds = collectReferencedAssetIds(request);
  if (assetIds.length === 0) return;

  const assets = await loadOwnedAssetsMap(userId, assetIds);
  for (const assetId of assetIds) {
    const asset = assets.get(assetId);
    if (!asset) continue;
    if (!asset.mimeType.startsWith("image/")) {
      throw badRequest("INVALID_SOURCE_ASSET", `Referenced asset ${assetId} is not an image`);
    }
  }
}

function collectReferencedAssetIds(request: GenerationRequest) {
  if (!request.operation || request.operation.kind === "generate" || !request.operation.sourceAssetId) return [] as string[];
  return [request.operation.sourceAssetId];
}

async function requireOwnedJob(jobId: string, userId: string) {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job || job.userId !== userId) throw notFound("Generation job not found");
  return job;
}

async function requireOwnedJobDetail(jobId: string, userId: string) {
  const job = await prisma.generationJob.findUnique({
    where: { id: jobId },
    include: { outputs: { include: { asset: true }, orderBy: { index: "asc" } } },
  });
  if (!job || job.userId !== userId) throw notFound("Generation job not found");
  return job;
}

async function requireJobRecordDetail(jobId: string) {
  const job = await prisma.generationJob.findUnique({
    where: { id: jobId },
    include: { outputs: { include: { asset: true }, orderBy: { index: "asc" } } },
  });
  if (!job) throw notFound("Generation job not found");
  return job;
}

function snapshotEvent(job: GenerationJobRecord): GenerationEvent {
  const at = nowIso();
  if (job.status === "RUNNING" && job.normalizedParamsJson) {
    return { type: "running", jobId: job.id, at, normalizedParams: normalizePersistedParams(job.normalizedParamsJson) };
  }
  if (job.status === "SUCCEEDED") {
    return { type: "succeeded", jobId: job.id, at, status: "SUCCEEDED", errorCode: null, errorMessage: null };
  }
  if (job.status === "FAILED") {
    return { type: "failed", jobId: job.id, at, status: "FAILED", errorCode: job.errorCode, errorMessage: job.errorMessage };
  }
  if (job.status === "CANCELLED") {
    return { type: "cancelled", jobId: job.id, at, status: "CANCELLED", errorCode: job.errorCode, errorMessage: job.errorMessage };
  }
  return { type: "queued", jobId: job.id, at, position: null };
}

function replayPersistedOutputEvents(job: GenerationJobDetailRecord): GenerationEvent[] {
  const outputCount = job.outputs.length;
  if (outputCount === 0) return [];

  return job.outputs
    .slice()
    .sort((left, right) => left.index - right.index)
    .map((output) => ({
      type: "output_ready" as const,
      jobId: job.id,
      at: output.createdAt.toISOString(),
      outputIndex: output.index,
      outputCount,
      mimeType: output.asset.mimeType,
      asset: serializeAsset(output.asset),
    }));
}

function serializeGenerationStatus(job: GenerationJobSummaryRecord | GenerationJobDetailRecord) {
  const submittedParams = submittedGenerationRequestSchema.parse(stripNulls(job.submittedParamsJson));

  return {
    id: job.id,
    status: job.status,
    submittedParams,
    normalizedParams: job.normalizedParamsJson ? normalizePersistedParams(job.normalizedParamsJson) : null,
    estimatedNovelAiAnlas: job.estimatedNovelAiAnlas,
    actualNovelAiAnlas: job.actualNovelAiAnlas,
    billedPlatformUnits: job.billedPlatformUnits,
    resultMimeType: job.resultMimeType,
    outputCount: job.outputs.length,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

function serializeGenerationDetail(job: GenerationJobDetailRecord) {
  return {
    ...serializeGenerationStatus(job),
    outputs: job.outputs
      .slice()
      .sort((left, right) => left.index - right.index)
      .map((output) => ({
        index: output.index,
        asset: serializeAsset(output.asset),
      })),
  };
}

function serializeAdminGenerationRecord(job: GenerationJobSummaryRecord) {
  return {
    ...serializeGenerationStatus(job),
    novelAiAccountId: job.novelAiAccountId,
    platformMultiplierSnapshot: job.platformMultiplierSnapshot ? Number(job.platformMultiplierSnapshot) : null,
  };
}

function serializeAdminGenerationDetail(job: GenerationJobDetailRecord) {
  return {
    ...serializeGenerationDetail(job),
    novelAiAccountId: job.novelAiAccountId,
    platformMultiplierSnapshot: job.platformMultiplierSnapshot ? Number(job.platformMultiplierSnapshot) : null,
  };
}

function normalizePersistedParams(value: unknown) {
  const stripped = stripNulls(value);
  const normalized = generationParamsSchema.safeParse(stripped);
  if (normalized.success) return normalized.data;

  const submitted = submittedGenerationRequestSchema.parse(stripped);
  const request = isNovelAiRequest(submitted)
    ? novelAiRequestToGenerationRequest(submitted)
    : submitted;
  return normalizeGenerationRequest(request);
}

function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => stripNulls(entry));
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(record)) {
    if (nestedValue === null) continue;
    next[key] = stripNulls(nestedValue);
  }
  return next;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
