import { createHmac, randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { inflateRawSync } from "node:zlib";
import sharp from "sharp";
import { FormData, ProxyAgent, fetch as undiciFetch } from "undici";
import {
  generationDefaults,
  novelAiCredentialPayloadSchema,
  suggestTagsResponseSchema,
  type GenerationOperation,
  type GenerationParams,
  type NovelAiCredentialPayload,
} from "@novelai-router/shared";
import { getRuntimeConfig } from "../runtimeConfig.js";
import type {
  NovelAiAccountTestInput,
  NovelAiAccountTestResult,
  NovelAiGenerateInput,
  NovelAiProvider,
  NovelAiSuggestTagsInput,
} from "./NovelAiProvider.js";
import { decodeNovelAiMsgpackImageStream } from "./msgpackImageStream.js";
import { NovelAiProviderError, providerNotConfigured } from "./providerErrors.js";

type FetchLike = typeof undiciFetch;

type NovelAiRequestEnvelope = {
  input: string;
  model: string;
  action: string;
  parameters: Record<string, unknown>;
  use_new_shared_trial?: true;
  recaptcha_token?: string;
};

export class RealNovelAiProvider implements NovelAiProvider {
  constructor(private readonly transport: FetchLike = undiciFetch) {}

  async generate(input: NovelAiGenerateInput) {
    if (!input.accountId || !input.credential) {
      throw providerNotConfigured("A leased NovelAI account credential is required for the real provider");
    }

    const credential = novelAiCredentialPayloadSchema.parse(input.credential);
    if (input.params.operation.kind === "upscale") {
      return this.upscale(input, credential);
    }
    const encodedVibeTokens = await this.encodeVibeTokens(input.params, input.resolvedAssets, credential);
    const preparedAssets = await prepareMultipartAssets(input.resolvedAssets, encodedVibeTokens);
    const requestBody = await buildOperationRequestBody(input.params, input.resolvedAssets, preparedAssets);
    const requiresMultipart = requiresMultipartUpload(preparedAssets);
    const body = requiresMultipart
      ? buildOperationFormDataFromPreparedAssets(requestBody, input.resolvedAssets, preparedAssets)
      : JSON.stringify(requestBody);

    const response = await this.fetchWithTimeout("https://image.novelai.net/ai/generate-image-stream", {
      method: "POST",
      body,
      headers: {
        ...buildAuthHeaders(credential),
        ...(requiresMultipart ? {} : { "Content-Type": "application/json" }),
        "x-correlation-id": toCorrelationId(input.jobId),
        "x-initiated-at": new Date().toISOString(),
      },
      signal: input.signal,
      ...buildRuntimeProxyDispatcher(),
    }, getRuntimeConfig().novelAiHttpTimeoutMs);

    mapNovelAiHttpError(response.status);
    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => "");
      const suffix = errorText ? `: ${errorText.slice(0, 500)}` : "";
      throw new NovelAiProviderError("PROVIDER_HTTP_ERROR", `NovelAI request failed with ${response.status}${suffix}`, true);
    }

    input.onProgress?.("Real NovelAI response stream opened");

    const images = "msgpack_stream" === "msgpack_stream"
      ? await decodeNovelAiMsgpackImageStream(ReadableFromWeb(response.body), {
          ...(input.onProgress ? { onProgress: input.onProgress } : {}),
          ...(input.onIntermediateFrame ? { onIntermediateFrame: input.onIntermediateFrame } : {}),
        })
      : [Buffer.from(await response.arrayBuffer())];

    return {
      requestId: response.headers.get("x-request-id") ?? `${input.accountId}-${input.jobId}`,
      mimeType: "image/png",
      actualNovelAiAnlas: null,
      images,
    };
  }

  async suggestTags(input: NovelAiSuggestTagsInput) {
    const credential = input.credential ? novelAiCredentialPayloadSchema.parse(input.credential) : null;
    const url = new URL(getSuggestTagsUrl());
    url.searchParams.set("model", mapNovelAiModel(input.model));
    url.searchParams.set("prompt", input.prompt);

    const response = await this.fetchWithTimeout(url.toString(), {
      method: "GET",
      headers: {
        ...(credential ? buildAuthHeaders(credential) : {}),
        "Content-Type": "application/json",
      },
      signal: input.signal,
      ...buildRuntimeProxyDispatcher(),
    }, getRuntimeConfig().novelAiHttpTimeoutMs);

    mapNovelAiHttpError(response.status);
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const suffix = errorText ? `: ${errorText.slice(0, 500)}` : "";
      throw new NovelAiProviderError("PROVIDER_HTTP_ERROR", `NovelAI suggest-tags request failed with ${response.status}${suffix}`, true);
    }

    const payload = suggestTagsResponseSchema.parse(await response.json());
    return { tags: payload.tags };
  }

  async dryRunAccountTest(input: NovelAiAccountTestInput): Promise<NovelAiAccountTestResult> {
    const credential = novelAiCredentialPayloadSchema.parse(input.credential);
    buildAuthHeaders(credential);
    buildGenerateRequestBody(generationDefaults, emptyPreparedAssets());

    return {
      ok: true,
      message: "Dry run completed locally. No network request was sent and the credential was not sent remotely.",
      safety: {
        networkUsed: false,
        credentialSent: false,
        mayConsumeAnlas: false,
        anlasConsumed: null,
      },
      remote: {
        accountLabel: null,
        anlasBalance: null,
        requestId: null,
      },
    };
  }

  async healthCheckAccount(input: NovelAiAccountTestInput): Promise<NovelAiAccountTestResult> {
    const healthCheckUrl = getRuntimeHealthCheckUrl();

    const credential = novelAiCredentialPayloadSchema.parse(input.credential);
    const response = await this.fetchWithTimeout(healthCheckUrl, {
      method: "GET",
      headers: {
        ...buildAuthHeaders(credential),
        "Content-Type": "application/json",
      },
      signal: input.signal,
      ...buildRuntimeProxyDispatcher(),
    }, getRuntimeConfig().novelAiTestTimeoutMs);

    mapNovelAiHttpError(response.status);
    if (!response.ok) {
      throw new NovelAiProviderError("PROVIDER_HTTP_ERROR", `NovelAI health check failed with ${response.status}`, true);
    }

    const remote = await readSubscriptionJson(response);
    return {
      ok: true,
      message: "Health check completed through the configured NovelAI account info endpoint.",
      safety: {
        networkUsed: true,
        credentialSent: true,
        mayConsumeAnlas: false,
        anlasConsumed: null,
      },
      remote: {
        accountLabel: remote.accountLabel,
        anlasBalance: remote.anlasBalance,
        requestId: response.headers.get("x-request-id"),
        tier: remote.tier,
        active: remote.active,
        unlimitedImageGeneration: remote.unlimitedImageGeneration,
        maxPriorityActions: remote.maxPriorityActions,
        fixedTrainingStepsLeft: remote.fixedTrainingStepsLeft,
        purchasedTrainingSteps: remote.purchasedTrainingSteps,
      },
    };
  }

  async smokeTestAccount(input: NovelAiAccountTestInput): Promise<NovelAiAccountTestResult> {
    const before = await this.healthCheckAccount(input);
    const result = await this.generate({
      jobId: `smoke-${input.accountId}`,
      params: smokeTestParams(),
      resolvedAssets: emptyResolvedAssets(),
      signal: input.signal,
      accountId: input.accountId,
      credential: input.credential,
    });

    void result.images;

    const after = await this.healthCheckAccount(input);
    const beforeBalance = before.remote?.anlasBalance ?? null;
    const afterBalance = after.remote?.anlasBalance ?? null;
    const anlasConsumed = beforeBalance !== null && afterBalance !== null ? Math.max(beforeBalance - afterBalance, 0) : null;

    if (anlasConsumed !== null && anlasConsumed > 5) {
      throw new NovelAiProviderError(
        "SMOKE_TEST_EXCEEDED_MAX_ANLAS",
        `Smoke test consumed ${anlasConsumed} Anlas which exceeds configured maximum ${5}`,
        false,
      );
    }

    return {
      ok: true,
      message: "Smoke test completed and may have consumed NovelAI Anlas.",
      safety: {
        networkUsed: true,
        credentialSent: true,
        mayConsumeAnlas: true,
        anlasConsumed,
      },
      remote: {
        accountLabel: after.remote?.accountLabel ?? null,
        anlasBalance: after.remote?.anlasBalance ?? null,
        requestId: result.requestId,
      },
    };
  }

  private async upscale(input: NovelAiGenerateInput, credential: NovelAiCredentialPayload) {
    const operation = input.params.operation;
    if (operation.kind !== "upscale") {
      throw new Error("Upscale payload builder received a non-upscale operation");
    }

    const sourceImageBuffer = input.resolvedAssets.sourceImage?.buffer ?? null;
    const image = sourceImageBuffer?.toString("base64")
      ?? readProviderImageField(input.params.providerParameters.image);
    if (!image) {
      throw new Error("Upscale requires a source image payload");
    }

    const dimensions = await resolveUpscaleDimensions(sourceImageBuffer ?? decodeProviderImage(image), input.params.width, input.params.height);
    const response = await this.fetchWithTimeout(getUpscaleUrl(), {
      method: "POST",
      body: JSON.stringify({ image, width: dimensions.width, height: dimensions.height, scale: operation.factor }),
      headers: {
        ...buildAuthHeaders(credential),
        "Content-Type": "application/json",
        "x-correlation-id": toCorrelationId(input.jobId),
        "x-initiated-at": new Date().toISOString(),
      },
      signal: input.signal,
      ...buildRuntimeProxyDispatcher(),
    }, getRuntimeConfig().novelAiHttpTimeoutMs);

    mapNovelAiHttpError(response.status);
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const suffix = errorText ? `: ${errorText.slice(0, 500)}` : "";
      throw new NovelAiProviderError("PROVIDER_HTTP_ERROR", `NovelAI upscale request failed with ${response.status}${suffix}`, true);
    }

    input.onProgress?.("Real NovelAI upscale response received");

    const archive = Buffer.from(await response.arrayBuffer());
    const outputs = decodeZipImages(archive);
    if (outputs.length === 0) {
      throw new NovelAiProviderError("PROVIDER_HTTP_ERROR", "NovelAI upscale response did not contain any images", true);
    }

    const mimeType = outputs[0]?.mimeType ?? "image/png";
    return {
      requestId: response.headers.get("x-request-id") ?? `${input.accountId}-${input.jobId}`,
      mimeType,
      actualNovelAiAnlas: null,
      images: outputs.map((output) => output.buffer),
    };
  }

  private async encodeVibeTokens(
    params: GenerationParams,
    resolvedAssets: NovelAiGenerateInput["resolvedAssets"],
    credential: NovelAiCredentialPayload,
  ) {
    if (resolvedAssets.vibeTransfers.length === 0) return [] as string[];

    const mappedModel = mapNovelAiModel(params.model);
    const url = getEncodeVibeUrl();
    const tokens: string[] = [];

    for (const reference of resolvedAssets.vibeTransfers) {
      const response = await this.fetchWithTimeout(url, {
        method: "POST",
        headers: {
          ...buildAuthHeaders(credential),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: reference.buffer.toString("base64"),
          information_extracted: reference.informationExtracted ? 1 : 0,
          model: mappedModel,
        }),
        ...buildRuntimeProxyDispatcher(),
      }, getRuntimeConfig().novelAiHttpTimeoutMs);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        const suffix = errorText ? `: ${errorText.slice(0, 500)}` : "";
        throw new NovelAiProviderError("PROVIDER_HTTP_ERROR", `NovelAI vibe encoding failed with ${response.status}${suffix}`, true);
      }

      tokens.push(Buffer.from(await response.arrayBuffer()).toString("base64"));
    }

    return tokens;
  }

  private async fetchWithTimeout(input: string, init: Parameters<FetchLike>[1], timeoutMs: number) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const abort = () => controller.abort();
    init?.signal?.addEventListener("abort", abort, { once: true });

    try {
      return await this.transport(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (isAbortError(error)) {
        const reason = timedOut || init?.signal?.aborted ? `timed out after ${timeoutMs}ms` : "was aborted";
        throw new NovelAiProviderError(
          "PROVIDER_TIMEOUT",
          `NovelAI request ${reason}. Check novelAiProxyUrl or increase the configured NovelAI timeout.`,
          true,
        );
      }

      if (error instanceof Error) {
        const detail = getNetworkErrorDetail(error);
        const suffix = detail ? ` (${detail})` : "";
        throw new NovelAiProviderError(
          "PROVIDER_NETWORK_ERROR",
          `NovelAI network request failed${suffix}. Check novelAiProxyUrl and network connectivity.`,
          true,
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
      init?.signal?.removeEventListener("abort", abort);
    }
  }
}

function buildAuthHeaders(credential: NovelAiCredentialPayload) {
  const headers: Record<string, string> = {
    ...(credential.headers ?? {}),
  };

  if (credential.token) headers.Authorization = `Bearer ${credential.token}`;
  if (credential.cookie) headers.Cookie = credential.cookie;
  return headers;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function getNetworkErrorDetail(error: Error) {
  if ("cause" in error && error.cause && typeof error.cause === "object") {
    const code = "code" in error.cause && typeof error.cause.code === "string" ? error.cause.code : null;
    const message = "message" in error.cause && typeof error.cause.message === "string" ? error.cause.message : null;
    return code ?? message ?? error.message;
  }

  return error.message;
}

function toCorrelationId(seed: string) {
  const cleaned = seed.replace(/[^a-z0-9]/gi, "");
  return (cleaned.slice(0, 6) || "na1gen").padEnd(6, "0");
}

export async function buildGenerateFormData(
  params: GenerationParams,
  resolvedAssets: NovelAiGenerateInput["resolvedAssets"],
  encodedVibeTokens: string[] = [],
) {
  const preparedAssets = await prepareMultipartAssets(resolvedAssets, encodedVibeTokens);
  return buildOperationFormDataFromPreparedAssets(buildGenerateRequestBody(params, preparedAssets), resolvedAssets, preparedAssets);
}

function buildOperationFormDataFromPreparedAssets(
  requestBody: NovelAiRequestEnvelope,
  resolvedAssets: NovelAiGenerateInput["resolvedAssets"],
  preparedAssets: PreparedMultipartAssets,
) {
  const form = new FormData();
  appendPreparedMultipartAssets(form, resolvedAssets, preparedAssets);
  form.set("request", new Blob([JSON.stringify(requestBody)], { type: "application/json" }), "blob");
  return form;
}

async function buildOperationRequestBody(
  params: GenerationParams,
  resolvedAssets: NovelAiGenerateInput["resolvedAssets"],
  preparedAssets: PreparedMultipartAssets,
): Promise<NovelAiRequestEnvelope> {
  switch (params.operation.kind) {
    case "generate":
      return buildGenerateRequestBody(params, preparedAssets);
    case "variations":
      return buildVariationsRequestBody(params, resolvedAssets, preparedAssets);
    case "enhance":
      return buildEnhanceRequestBody(params, resolvedAssets, preparedAssets);
    case "upscale":
      throw new Error("Upscale requests are handled through the dedicated NovelAI upscale endpoint");
  }
}

export function buildGenerateRequestBody(params: GenerationParams, resolvedAssets: PreparedMultipartAssets): NovelAiRequestEnvelope {
  const model = mapNovelAiModel(params.model);
  return buildEnvelope(params, model, "generate", {
    ...buildCommonParameters(params, model, resolvedAssets),
    add_original_image: true,
    inpaintImg2ImgStrength: params.baseImage?.strength ?? readProviderNumber(params.providerParameters.inpaintImg2ImgStrength) ?? 1,
  });
}

async function buildVariationsRequestBody(
  params: GenerationParams,
  resolvedAssets: NovelAiGenerateInput["resolvedAssets"],
  preparedAssets: PreparedMultipartAssets,
): Promise<NovelAiRequestEnvelope> {
  const image = preparedAssets.sourceImageField ?? readProviderImageField(params.providerParameters.image);
  if (!image) {
    throw new Error("Variations require a source image payload");
  }

  const operation = params.operation;
  if (operation.kind !== "variations") {
    throw new Error("Variations payload builder received a non-variations operation");
  }
  const model = mapNovelAiModel(params.model);
  const dimensions = resolvedAssets.sourceImage
    ? await resolveSourceDimensions(resolvedAssets.sourceImage.buffer, 1, params.width, params.height)
    : { width: params.width, height: params.height };
  return buildEnvelope(params, model, "img2img", {
    ...buildCommonParameters(params, model, preparedAssets, { ...dimensions, imageCount: params.imageCount }),
    image,
    add_original_image: operation.addOriginalImage,
    strength: operation.strength,
    noise: operation.noise,
    color_correct: operation.colorCorrect,
    extra_noise_seed: operation.extraNoiseSeed,
    ...(operation.imageCacheSecretKey ? { image_cache_secret_key: operation.imageCacheSecretKey } : {}),
    inpaintImg2ImgStrength: operation.strength,
  });
}

async function buildEnhanceRequestBody(
  params: GenerationParams,
  resolvedAssets: NovelAiGenerateInput["resolvedAssets"],
  preparedAssets: PreparedMultipartAssets,
): Promise<NovelAiRequestEnvelope> {
  const image = preparedAssets.sourceImageField ?? readProviderImageField(params.providerParameters.image);
  if (!image) {
    throw new Error("Enhance requires a source image payload");
  }

  const operation = params.operation;
  if (operation.kind !== "enhance") {
    throw new Error("Enhance payload builder received a non-enhance operation");
  }
  const model = mapNovelAiModel(params.model);
  const dimensions = resolvedAssets.sourceImage
    ? await resolveSourceDimensions(resolvedAssets.sourceImage.buffer, operation.upscaleAmount, params.width, params.height)
    : { width: params.width, height: params.height };
  return buildEnvelope(params, model, "img2img", {
    ...buildCommonParameters(params, model, preparedAssets, { ...dimensions, imageCount: 1 }),
    image,
    add_original_image: false,
    strength: operation.strength,
    noise: operation.noise,
    magnitude: operation.magnitude,
    upscale_amount: operation.upscaleAmount,
    inpaintImg2ImgStrength: operation.strength,
  });
}

function buildEnvelope(
  params: GenerationParams,
  model: string,
  action: string,
  parameters: Record<string, unknown>,
): NovelAiRequestEnvelope {
  const body: NovelAiRequestEnvelope = {
    input: params.prompt,
    model,
    action,
    parameters,
  };

  if (params.providerEnvelope.useNewSharedTrial ?? false) {
    body.use_new_shared_trial = true;
  }
  return body;
}

function buildCommonParameters(
  params: GenerationParams,
  model: string,
  preparedAssets: PreparedMultipartAssets,
  overrides: {
    width?: number;
    height?: number;
    imageCount?: number;
  } = {},
) {
  const rawParameters = sanitizeProviderParameters(params.providerParameters);
  const characterPrompts = params.characterPrompts.map((entry) => ({
    prompt: entry.prompt,
    uc: entry.negativePrompt,
    center: entry.center,
    enabled: entry.enabled,
  }));
  const v4CharacterCaptions = params.characterPrompts.map((entry) => ({
    char_caption: entry.prompt,
    centers: [{ x: entry.center.x, y: entry.center.y }],
  }));
  const v4NegativeCaptions = params.characterPrompts.map((entry) => ({
    char_caption: entry.negativePrompt,
    centers: [{ x: entry.center.x, y: entry.center.y }],
  }));
  const preciseReferenceDescriptions = params.preciseReferences.map((entry) => ({
    caption: {
      base_caption: entry.prompt,
      char_captions: [],
    },
    legacy_uc: false,
  }));
  const preciseReferenceInformationExtracted = params.preciseReferences.map((entry) => entry.informationExtracted ? 1 : 0);
  const preciseReferenceStrengths = params.preciseReferences.map((entry) => entry.strength);
  const preciseReferenceSecondaryStrengths = params.preciseReferences.map((entry) => entry.secondaryStrength);

  return {
    ...rawParameters,
    params_version: readProviderInt(rawParameters.params_version) ?? 3,
    width: overrides.width ?? params.width,
    height: overrides.height ?? params.height,
    scale: params.scale,
    sampler: params.sampler,
    steps: params.steps,
    n_samples: overrides.imageCount ?? params.imageCount,
    ucPreset: params.promptOptions.ucPreset,
    qualityToggle: params.promptOptions.qualityToggle,
    autoSmea: readProviderBoolean(rawParameters.autoSmea) ?? false,
    dynamic_thresholding: readProviderBoolean(rawParameters.dynamic_thresholding) ?? false,
    controlnet_strength: readProviderNumber(rawParameters.controlnet_strength) ?? 1,
    legacy: readProviderBoolean(rawParameters.legacy) ?? false,
    cfg_rescale: readProviderNumber(rawParameters.cfg_rescale) ?? 0,
    noise_schedule: readProviderString(rawParameters.noise_schedule) ?? "karras",
    legacy_v3_extend: readProviderBoolean(rawParameters.legacy_v3_extend) ?? false,
    skip_cfg_above_sigma: readProviderNullableNumber(rawParameters.skip_cfg_above_sigma),
    use_coords: readProviderBoolean(rawParameters.use_coords) ?? true,
    normalize_reference_strength_multiple: params.referenceOptions.normalizeStrengthValues,
    seed: params.seed,
    negative_prompt: params.negativePrompt,
    image_format: readProviderString(rawParameters.image_format) ?? "png",
    characterPrompts,
    ...(preparedAssets.baseImageField ? { image: preparedAssets.baseImageField } : {}),
    ...(preparedAssets.vibeTransferParts.length > 0
      ? {
          reference_image_multiple_cached: preparedAssets.vibeTransferParts.map((part) => ({
            cache_secret_key: part.cacheSecretKey,
            data: part.formField,
          })),
          reference_strength_multiple: params.vibeTransfers.map((reference) => reference.strength),
        }
      : {}),
    ...(preparedAssets.preciseReferenceParts.length > 0
      ? {
          director_reference_images_cached: preparedAssets.preciseReferenceParts.map((part) => ({
            cache_secret_key: part.cacheSecretKey,
            data: part.formField,
          })),
          director_reference_descriptions: preciseReferenceDescriptions,
          director_reference_information_extracted: preciseReferenceInformationExtracted,
          director_reference_strength_values: preciseReferenceStrengths,
          director_reference_secondary_strength_values: preciseReferenceSecondaryStrengths,
        }
      : {}),
    ...(isV4Model(model) && rawParameters.v4_prompt === undefined
      ? {
          v4_prompt: {
            caption: {
              base_caption: params.prompt,
              char_captions: v4CharacterCaptions,
            },
            use_coords: readProviderBoolean(rawParameters.use_coords) ?? true,
            use_order: true,
            legacy_uc: false,
          },
        }
      : {}),
    ...(isV4Model(model) && rawParameters.v4_negative_prompt === undefined
      ? {
          v4_negative_prompt: {
            caption: {
              base_caption: params.negativePrompt,
              char_captions: v4NegativeCaptions,
            },
            use_coords: readProviderBoolean(rawParameters.use_coords) ?? true,
            use_order: false,
            legacy_uc: false,
          },
        }
      : {}),
    ...(isV4Model(model) && rawParameters.legacy_uc === undefined ? { legacy_uc: false } : {}),
    ...(rawParameters.stream === undefined && "msgpack_stream" === "msgpack_stream" ? { stream: "msgpack" } : {}),
  };
}

function sanitizeProviderParameters(parameters: GenerationParams["providerParameters"]) {
  const sanitized = { ...parameters };
  delete sanitized.width;
  delete sanitized.height;
  delete sanitized.scale;
  delete sanitized.sampler;
  delete sanitized.steps;
  delete sanitized.n_samples;
  delete sanitized.ucPreset;
  delete sanitized.qualityToggle;
  delete sanitized.normalize_reference_strength_multiple;
  delete sanitized.seed;
  delete sanitized.negative_prompt;
  delete sanitized.characterPrompts;
  delete sanitized.reference_strength_multiple;
  delete sanitized.director_reference_descriptions;
  delete sanitized.director_reference_information_extracted;
  delete sanitized.director_reference_strength_values;
  delete sanitized.director_reference_secondary_strength_values;
  delete sanitized.add_original_image;
  delete sanitized.strength;
  delete sanitized.noise;
  delete sanitized.color_correct;
  delete sanitized.extra_noise_seed;
  delete sanitized.image_cache_secret_key;
  delete sanitized.magnitude;
  delete sanitized.upscale_amount;
  delete sanitized.upscale_factor;
  delete sanitized.inpaintImg2ImgStrength;
  return sanitized;
}

function readProviderBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function readProviderNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readProviderInt(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function readProviderNullableNumber(value: unknown) {
  if (value === null) return null;
  return readProviderNumber(value) ?? null;
}

function readProviderString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readProviderImageField(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function decodeProviderImage(image: string) {
  const normalized = image.includes(",") ? image.slice(image.indexOf(",") + 1) : image;
  return Buffer.from(normalized, "base64");
}

async function resolveUpscaleDimensions(buffer: Buffer, fallbackWidth: number, fallbackHeight: number) {
  const metadata = await sharp(buffer).metadata();
  return {
    width: metadata.width ?? fallbackWidth,
    height: metadata.height ?? fallbackHeight,
  };
}

async function resolveSourceDimensions(buffer: Buffer, multiplier: number, fallbackWidth: number, fallbackHeight: number) {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ? alignDimension(metadata.width * multiplier) : fallbackWidth;
  const height = metadata.height ? alignDimension(metadata.height * multiplier) : fallbackHeight;
  return { width, height };
}

function alignDimension(value: number) {
  const aligned = Math.max(64, Math.round(value / 64) * 64);
  return Math.min(aligned, 4096);
}

function smokeTestParams(): GenerationParams {
  return {
    ...generationDefaults,
    prompt: "1girl, simple background, masterpiece, best quality, no text",
    negativePrompt: "blurry, lowres, bad quality, text, watermark",
    width: 832,
    height: 1216,
    steps: 8,
    scale: 5,
  };
}

function mapNovelAiModel(model: GenerationParams["model"]) {
  if (model === "nai-diffusion-4-curated-preview") return "nai-diffusion-4-curated-preview";
  if (model === "nai-diffusion-4-full") return "nai-diffusion-4-full";
  if (model === "nai-diffusion-4-5-curated") return "nai-diffusion-4-5-curated";
  if (model === "nai-diffusion-4-5-full") return "nai-diffusion-4-5-full";
  if (model === "nai-diffusion-3") return "nai-diffusion-3";
  if (model === "nai-diffusion-furry-3") return "nai-diffusion-furry-3";
  return model;
}

function isV4Model(model: string) {
  return model.startsWith("nai-diffusion-4");
}

const multipartCacheSecret = randomBytes(32);
const directorReferenceTargets = [
  { width: 1024, height: 1536 },
  { width: 1536, height: 1024 },
  { width: 1472, height: 1472 },
] as const;

type PreparedMultipartPart = {
  cacheSecretKey: string;
  data: string;
  formField: string;
  contentType: string;
};

type PreparedMultipartAssets = {
  sourceImageField: string | null;
  baseImageField: string | null;
  vibeTransferParts: PreparedMultipartPart[];
  preciseReferenceParts: PreparedMultipartPart[];
};

function requiresMultipartUpload(preparedAssets: PreparedMultipartAssets) {
  return preparedAssets.sourceImageField !== null
    || preparedAssets.baseImageField !== null
    || preparedAssets.vibeTransferParts.length > 0
    || preparedAssets.preciseReferenceParts.length > 0;
}

async function prepareMultipartAssets(
  resolvedAssets: NovelAiGenerateInput["resolvedAssets"],
  encodedVibeTokens: string[],
): Promise<PreparedMultipartAssets> {
  const sourceImageField = resolvedAssets.sourceImage ? "source-image" : null;
  const baseImageField = resolvedAssets.baseImage ? "base-image" : null;
  const vibeTransferParts = encodedVibeTokens.map((token, index) => createCachedMultipartPart(
    `ref_multiple_${index}`,
    token,
    "application/octet-stream",
  ));
  const preciseReferenceParts = await Promise.all(
    resolvedAssets.preciseReferences.map(async (reference, index) => createCachedMultipartPart(
      `director_ref_${index}`,
      await prepareDirectorReferenceImage(reference.buffer),
      "image/png",
    )),
  );

  return {
    sourceImageField,
    baseImageField,
    vibeTransferParts,
    preciseReferenceParts,
  };
}

function createCachedMultipartPart(formField: string, data: string, contentType: string): PreparedMultipartPart {
  return {
    cacheSecretKey: createCacheSecretKey(data),
    data,
    formField,
    contentType,
  };
}

function createCacheSecretKey(data: string) {
  return createHmac("sha256", multipartCacheSecret).update(data).digest("hex");
}

async function prepareDirectorReferenceImage(buffer: Buffer) {
  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Director reference image dimensions could not be determined");
  }

  const target = pickDirectorReferenceTarget(metadata.width, metadata.height);
  return (await sharp(buffer)
    .resize(target.width, target.height, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .png()
    .toBuffer()).toString("base64");
}

function pickDirectorReferenceTarget(width: number, height: number) {
  const aspectRatio = width / height;
  return directorReferenceTargets.reduce((best, candidate) => {
    const bestDistance = Math.abs((best.width / best.height) - aspectRatio);
    const candidateDistance = Math.abs((candidate.width / candidate.height) - aspectRatio);
    return candidateDistance < bestDistance ? candidate : best;
  });
}

function appendPreparedMultipartAssets(
  form: FormData,
  resolvedAssets: NovelAiGenerateInput["resolvedAssets"],
  preparedAssets: PreparedMultipartAssets,
) {
  if (resolvedAssets.sourceImage && preparedAssets.sourceImageField) {
    appendImagePart(form, preparedAssets.sourceImageField, resolvedAssets.sourceImage.buffer, resolvedAssets.sourceImage.mimeType);
  }

  if (resolvedAssets.baseImage && preparedAssets.baseImageField) {
    appendImagePart(form, preparedAssets.baseImageField, resolvedAssets.baseImage.buffer, resolvedAssets.baseImage.mimeType);
  }

  preparedAssets.vibeTransferParts.forEach((part) => {
    appendBase64Part(form, part.formField, part.data, part.contentType);
  });

  preparedAssets.preciseReferenceParts.forEach((part) => {
    appendBase64Part(form, part.formField, part.data, part.contentType);
  });
}

function appendBase64Part(form: FormData, fieldName: string, base64Data: string, contentType: string) {
  form.set(fieldName, new Blob([new Uint8Array(Buffer.from(base64Data, "base64"))], { type: contentType }));
  return fieldName;
}

function appendImagePart(form: FormData, baseName: string, buffer: Buffer, mimeType: string) {
  const extension = mimeType.split("/")[1] || "png";
  const fieldName = baseName;
  form.set(fieldName, new Blob([new Uint8Array(buffer)], { type: mimeType }), `${fieldName}.${extension}`);
  return fieldName;
}

function readAnlasHeader(headers: { get(name: string): string | null }) {
  const value = headers.get("x-novelai-anlas-cost") ?? headers.get("x-anlas-cost");
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.ceil(parsed) : null;
}

function mapNovelAiHttpError(status: number) {
  if (status === 401 || status === 403) {
    throw new NovelAiProviderError("PROVIDER_AUTH_FAILED", "NovelAI credential was rejected", false);
  }
  if (status === 429) {
    throw new NovelAiProviderError("PROVIDER_RATE_LIMITED", "NovelAI rate limit was reached", true);
  }
}

async function readSubscriptionJson(response: { json(): Promise<unknown>; headers: { get(name: string): string | null } }) {
  const data = await response.json().catch(() => null);
  if (!data || typeof data !== "object") {
    return {
      accountLabel: null,
      anlasBalance: null,
      tier: null,
      active: null,
      unlimitedImageGeneration: null,
      maxPriorityActions: null,
      fixedTrainingStepsLeft: null,
      purchasedTrainingSteps: null,
    };
  }

  const root = data as {
    subscription?: unknown;
    priority?: { maxPriorityActions?: number };
  };
  const rawSubscription = root.subscription && typeof root.subscription === "object" ? root.subscription : data;
  const record = rawSubscription as {
    tier?: number;
    active?: boolean;
    perks?: { unlimitedImageGeneration?: boolean; maxPriorityActions?: number };
    trainingStepsLeft?: { fixedTrainingStepsLeft?: number; purchasedTrainingSteps?: number };
  };
  const fixedTrainingStepsLeft = typeof record.trainingStepsLeft?.fixedTrainingStepsLeft === "number"
    ? record.trainingStepsLeft.fixedTrainingStepsLeft
    : null;
  const purchasedTrainingSteps = typeof record.trainingStepsLeft?.purchasedTrainingSteps === "number"
    ? record.trainingStepsLeft.purchasedTrainingSteps
    : null;
  const anlasBalance = fixedTrainingStepsLeft !== null || purchasedTrainingSteps !== null
    ? (fixedTrainingStepsLeft ?? 0) + (purchasedTrainingSteps ?? 0)
    : null;

  return {
    accountLabel: null,
    anlasBalance,
    tier: typeof record.tier === "number" ? record.tier : null,
    active: typeof record.active === "boolean" ? record.active : null,
    unlimitedImageGeneration: typeof record.perks?.unlimitedImageGeneration === "boolean" ? record.perks.unlimitedImageGeneration : null,
    maxPriorityActions: typeof root.priority?.maxPriorityActions === "number"
      ? root.priority.maxPriorityActions
      : typeof record.perks?.maxPriorityActions === "number"
        ? record.perks.maxPriorityActions
        : null,
    fixedTrainingStepsLeft,
    purchasedTrainingSteps,
  };
}

function emptyResolvedAssets(): NovelAiGenerateInput["resolvedAssets"] {
  return {
    sourceImage: null,
    baseImage: null,
    vibeTransfers: [],
    preciseReferences: [],
  };
}

function emptyPreparedAssets(): PreparedMultipartAssets {
  return {
    sourceImageField: null,
    baseImageField: null,
    vibeTransferParts: [],
    preciseReferenceParts: [],
  };
}

function decodeZipImages(archive: Buffer) {
  const eocdOffset = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocdOffset < 0) {
    throw new NovelAiProviderError("PROVIDER_HTTP_ERROR", "NovelAI upscale response was not a valid ZIP archive", true);
  }

  const entryCount = archive.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = archive.readUInt32LE(eocdOffset + 16);
  const outputs: Array<{ mimeType: string; buffer: Buffer }> = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) {
      throw new NovelAiProviderError("PROVIDER_HTTP_ERROR", "NovelAI upscale archive central directory was invalid", true);
    }

    const compressionMethod = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const fileNameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localHeaderOffset = archive.readUInt32LE(offset + 42);
    const fileName = archive.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    offset += 46 + fileNameLength + extraLength + commentLength;
    if (fileName.endsWith("/")) continue;

    if (archive.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new NovelAiProviderError("PROVIDER_HTTP_ERROR", "NovelAI upscale archive local header was invalid", true);
    }

    const localFileNameLength = archive.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const compressed = archive.subarray(dataStart, dataStart + compressedSize);
    const buffer = compressionMethod === 0
      ? compressed
      : compressionMethod === 8
        ? inflateRawSync(compressed)
        : (() => {
            throw new NovelAiProviderError("PROVIDER_HTTP_ERROR", `NovelAI upscale archive used unsupported ZIP compression method ${compressionMethod}`, true);
          })();
    outputs.push({
      mimeType: mimeTypeFromFilename(fileName),
      buffer,
    });
  }

  return outputs;
}

function mimeTypeFromFilename(fileName: string) {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  if (lowerName.endsWith(".webp")) return "image/webp";
  return "image/png";
}

function buildRuntimeProxyDispatcher() {
  const proxyUrl = getRuntimeConfig().novelAiProxyUrl;
  return proxyUrl ? { dispatcher: new ProxyAgent(proxyUrl) } : {};
}

function getRuntimeHealthCheckUrl() {
  const healthCheckUrl = getRuntimeConfig().novelAiHealthCheckUrl;
  if (!healthCheckUrl) {
    throw providerNotConfigured("NOVELAI_HEALTH_CHECK_URL is required for health checks");
  }
  return healthCheckUrl;
}

function getSuggestTagsUrl() {
  return "https://image.novelai.net/ai/generate-image/suggest-tags";
}

function getUpscaleUrl() {
  return "https://api.novelai.net/ai/upscale";
}

function getEncodeVibeUrl() {
  return "https://image.novelai.net/ai/encode-vibe";
}

function ReadableFromWeb(stream: NonNullable<Awaited<ReturnType<FetchLike>>["body"]>) {
  return Readable.fromWeb(stream);
}
