import { z } from "zod";
import { assetSummarySchema } from "./assets.js";

const seedSchema = z.coerce.number().int().min(0).max(4_294_967_295);
const optionalSeedRequestSchema = z.union([seedSchema, z.null()]);
const providerParametersSchema = z.record(z.string(), z.unknown());

export const samplerSchema = z.string().trim().min(1);

export const modelSchema = z.enum([
  "nai-diffusion-3",
  "nai-diffusion-furry-3",
  "nai-diffusion-4-curated-preview",
  "nai-diffusion-4-full",
  "nai-diffusion-4-5-curated",
  "nai-diffusion-4-5-full",
]);

export const promptOptionsRequestSchema = z.object({
  qualityToggle: z.boolean().optional(),
  ucPreset: z.coerce.number().int().min(0).max(5).optional(),
});

export const promptOptionsSchema = z.object({
  qualityToggle: z.boolean(),
  ucPreset: z.number().int().min(0).max(5),
});

export const referenceOptionsRequestSchema = z.object({
  normalizeStrengthValues: z.boolean().optional(),
});

export const referenceOptionsSchema = z.object({
  normalizeStrengthValues: z.boolean(),
});

const providerEnvelopeRequestSchema = z.object({
  useNewSharedTrial: z.boolean().optional(),
  recaptchaToken: z.string().trim().min(1).nullable().optional(),
});

const providerEnvelopeSchema = z.object({
  useNewSharedTrial: z.boolean().nullable(),
  recaptchaToken: z.string().trim().min(1).nullable(),
});

export const baseImageRequestSchema = z.object({
  strength: z.coerce.number().min(0.01).max(1).optional(),
  enabled: z.boolean().optional(),
});

export const baseImageSchema = z.object({
  strength: z.number().min(0.01).max(1),
  enabled: z.boolean(),
});

export const characterPromptCenterRequestSchema = z.object({
  x: z.coerce.number().min(0).max(1).optional(),
  y: z.coerce.number().min(0).max(1).optional(),
});

export const characterPromptCenterSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const characterPromptRequestSchema = z.object({
  prompt: z.string().trim().max(2000),
  negativePrompt: z.string().max(2000).optional(),
  center: characterPromptCenterRequestSchema.optional(),
  enabled: z.boolean().optional(),
});

export const characterPromptSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  negativePrompt: z.string().max(2000),
  center: characterPromptCenterSchema,
  enabled: z.boolean(),
});

export const vibeTransferRequestSchema = z.object({
  strength: z.coerce.number().min(0.1).max(1.5).optional(),
  informationExtracted: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const vibeTransferSchema = z.object({
  strength: z.number().min(0.1).max(1.5),
  informationExtracted: z.boolean(),
  enabled: z.boolean(),
});

export const preciseReferenceKindSchema = z.enum(["character_style", "character", "style"]);

export const preciseReferenceRequestSchema = z.object({
  prompt: z.string().trim().max(2000).optional(),
  strength: z.coerce.number().min(0.1).max(1.5).optional(),
  secondaryStrength: z.coerce.number().min(0).max(1.5).optional(),
  fidelity: z.coerce.number().min(0).max(1).optional(),
  kind: preciseReferenceKindSchema.optional(),
  informationExtracted: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const preciseReferenceSchema = z.object({
  prompt: z.string().max(2000),
  strength: z.number().min(0.1).max(1.5),
  secondaryStrength: z.number().min(0).max(1.5),
  fidelity: z.number().min(0).max(1),
  kind: preciseReferenceKindSchema,
  informationExtracted: z.boolean(),
  enabled: z.boolean(),
});

const enhanceUpscaleAmountSchema = z.number().positive().max(4);
const enhanceUpscaleAmountRequestSchema = z.coerce.number().pipe(enhanceUpscaleAmountSchema);
const enhanceMagnitudeSchema = z.number().nonnegative();
const enhanceMagnitudeRequestSchema = z.coerce.number().pipe(enhanceMagnitudeSchema);
const upscaleFactorSchema = z.union([z.literal(2), z.literal(4)]);
const upscaleFactorRequestSchema = z.coerce.number().int().pipe(upscaleFactorSchema);

const nullableSourceAssetIdSchema = z.string().min(1).nullable();
const sourceAssetIdRequestSchema = z.string().min(1).nullable().optional();

const generateOperationRequestSchema = z.object({
  kind: z.literal("generate"),
});

const generateOperationSchema = generateOperationRequestSchema;

const variationsOperationRequestSchema = z.object({
  kind: z.literal("variations"),
  sourceAssetId: sourceAssetIdRequestSchema,
  strength: z.coerce.number().min(0).max(1).optional(),
  noise: z.coerce.number().min(0).max(1).optional(),
  addOriginalImage: z.boolean().optional(),
  colorCorrect: z.boolean().optional(),
  extraNoiseSeed: optionalSeedRequestSchema.optional(),
  imageCacheSecretKey: z.string().trim().min(1).nullable().optional(),
});

const variationsOperationSchema = z.object({
  kind: z.literal("variations"),
  sourceAssetId: nullableSourceAssetIdSchema,
  strength: z.number().min(0).max(1),
  noise: z.number().min(0).max(1),
  addOriginalImage: z.boolean(),
  colorCorrect: z.boolean(),
  extraNoiseSeed: seedSchema,
  imageCacheSecretKey: z.string().trim().min(1).nullable(),
});

const enhanceOperationRequestSchema = z.object({
  kind: z.literal("enhance"),
  sourceAssetId: sourceAssetIdRequestSchema,
  upscaleAmount: enhanceUpscaleAmountRequestSchema.optional(),
  magnitude: enhanceMagnitudeRequestSchema.optional(),
  strength: z.coerce.number().min(0).max(1).optional(),
  noise: z.coerce.number().min(0).max(1).optional(),
});

const enhanceOperationSchema = z.object({
  kind: z.literal("enhance"),
  sourceAssetId: nullableSourceAssetIdSchema,
  upscaleAmount: enhanceUpscaleAmountSchema,
  magnitude: enhanceMagnitudeSchema,
  strength: z.number().min(0).max(1),
  noise: z.number().min(0).max(1),
});

const upscaleOperationRequestSchema = z.object({
  kind: z.literal("upscale"),
  sourceAssetId: sourceAssetIdRequestSchema,
  factor: upscaleFactorRequestSchema.optional(),
});

const upscaleOperationSchema = z.object({
  kind: z.literal("upscale"),
  sourceAssetId: nullableSourceAssetIdSchema,
  factor: upscaleFactorSchema,
});

export const generationOperationRequestSchema = z.union([
  generateOperationRequestSchema,
  variationsOperationRequestSchema,
  enhanceOperationRequestSchema,
  upscaleOperationRequestSchema,
]);

export const generationOperationSchema = z.union([
  generateOperationSchema,
  variationsOperationSchema,
  enhanceOperationSchema,
  upscaleOperationSchema,
]);

const generationRequestCommonSchema = z.object({
  prompt: z.string().trim().max(8000).optional(),
  negativePrompt: z.string().max(8000).optional(),
  model: modelSchema.optional(),
  width: z.coerce.number().int().optional(),
  height: z.coerce.number().int().optional(),
  steps: z.coerce.number().int().optional(),
  scale: z.coerce.number().optional(),
  sampler: samplerSchema.optional(),
  seed: optionalSeedRequestSchema.optional(),
  imageCount: z.coerce.number().int().min(1).max(8).optional(),
  promptOptions: promptOptionsRequestSchema.optional(),
  referenceOptions: referenceOptionsRequestSchema.optional(),
  baseImage: baseImageRequestSchema.nullable().optional(),
  characterPrompts: z.array(characterPromptRequestSchema).max(16).optional(),
  vibeTransfers: z.array(vibeTransferRequestSchema).max(16).optional(),
  preciseReferences: z.array(preciseReferenceRequestSchema).max(16).optional(),
  providerParameters: providerParametersSchema.optional(),
  providerEnvelope: providerEnvelopeRequestSchema.optional(),
});

export const legacyGenerationRequestSchema = generationRequestCommonSchema.extend({
  prompt: z.string().trim().min(1).max(8000),
  operation: generateOperationRequestSchema.optional(),
});

const canonicalGenerateRequestSchema = generationRequestCommonSchema.extend({
  prompt: z.string().trim().min(1).max(8000),
  operation: generateOperationRequestSchema,
});

const variationsGenerationRequestSchema = generationRequestCommonSchema.extend({
  operation: variationsOperationRequestSchema,
});

const enhanceGenerationRequestSchema = generationRequestCommonSchema.extend({
  operation: enhanceOperationRequestSchema,
});

const upscaleGenerationRequestSchema = generationRequestCommonSchema.extend({
  operation: upscaleOperationRequestSchema,
});

export const generationRequestSchema = z.union([
  legacyGenerationRequestSchema,
  canonicalGenerateRequestSchema,
  variationsGenerationRequestSchema,
  enhanceGenerationRequestSchema,
  upscaleGenerationRequestSchema,
]);

const novelAiCharacterPromptRequestSchema = z.object({
  prompt: z.string().trim().max(2000),
  uc: z.string().max(2000).optional(),
  center: characterPromptCenterRequestSchema.optional(),
  enabled: z.boolean().optional(),
});

const novelAiReferenceCacheEntrySchema = z.object({
  cache_secret_key: z.string().trim().min(1),
  data: z.string().trim().min(1),
}).passthrough();

const novelAiCaptionSchema = z.object({
  base_caption: z.string().max(8000).optional(),
  char_captions: z.array(z.unknown()).optional(),
}).passthrough();

const novelAiPromptCaptionSchema = z.object({
  caption: novelAiCaptionSchema.optional(),
  use_coords: z.boolean().optional(),
  use_order: z.boolean().optional(),
  legacy_uc: z.boolean().optional(),
}).passthrough();

const novelAiPreciseDescriptionSchema = z.object({
  caption: novelAiCaptionSchema.optional(),
  legacy_uc: z.boolean().optional(),
}).passthrough();

const novelAiParametersShape = {
  params_version: z.coerce.number().int().optional(),
  width: z.coerce.number().int().optional(),
  height: z.coerce.number().int().optional(),
  scale: z.coerce.number().optional(),
  sampler: samplerSchema.optional(),
  steps: z.coerce.number().int().optional(),
  n_samples: z.coerce.number().int().min(1).max(8).optional(),
  ucPreset: z.coerce.number().int().min(0).max(5).optional(),
  qualityToggle: z.boolean().optional(),
  autoSmea: z.boolean().optional(),
  dynamic_thresholding: z.boolean().optional(),
  controlnet_strength: z.coerce.number().optional(),
  legacy: z.boolean().optional(),
  add_original_image: z.boolean().optional(),
  cfg_rescale: z.coerce.number().optional(),
  noise_schedule: z.string().trim().min(1).optional(),
  legacy_v3_extend: z.boolean().optional(),
  skip_cfg_above_sigma: z.coerce.number().nullable().optional(),
  use_coords: z.boolean().optional(),
  legacy_uc: z.boolean().optional(),
  normalize_reference_strength_multiple: z.boolean().optional(),
  inpaintImg2ImgStrength: z.coerce.number().optional(),
  seed: optionalSeedRequestSchema.optional(),
  negative_prompt: z.string().max(8000).optional(),
  image_format: z.string().trim().min(1).optional(),
  stream: z.string().trim().min(1).optional(),
  image: z.string().optional(),
  mask: z.string().optional(),
  characterPrompts: z.array(novelAiCharacterPromptRequestSchema).optional(),
  reference_image_multiple: z.array(z.string()).optional(),
  reference_image_multiple_cached: z.array(novelAiReferenceCacheEntrySchema).optional(),
  reference_information_extracted_multiple: z.array(z.union([z.boolean(), z.coerce.number().int()])).optional(),
  reference_strength_multiple: z.array(z.coerce.number()).optional(),
  director_reference_images: z.array(z.string()).optional(),
  director_reference_images_cached: z.array(novelAiReferenceCacheEntrySchema).optional(),
  director_reference_descriptions: z.array(novelAiPreciseDescriptionSchema).optional(),
  director_reference_information_extracted: z.array(z.union([z.boolean(), z.coerce.number().int()])).optional(),
  director_reference_strength_values: z.array(z.coerce.number()).optional(),
  director_reference_secondary_strength_values: z.array(z.coerce.number()).optional(),
  v4_prompt: novelAiPromptCaptionSchema.optional(),
  v4_negative_prompt: novelAiPromptCaptionSchema.optional(),
  strength: z.coerce.number().min(0).max(1).optional(),
  noise: z.coerce.number().min(0).max(1).optional(),
  color_correct: z.boolean().optional(),
  extra_noise_seed: optionalSeedRequestSchema.optional(),
  image_cache_secret_key: z.string().trim().min(1).nullable().optional(),
  magnitude: z.coerce.number().nonnegative().optional(),
  upscale_amount: z.coerce.number().positive().optional(),
  upscale_factor: z.coerce.number().int().positive().optional(),
} as const;

export const novelAiParametersSchema = z.object(novelAiParametersShape).passthrough();

export const supportedNovelAiParametersSchema = z.object({
  ...novelAiParametersShape,
  upscale_factor: z.union([z.literal(2), z.literal(4)]).optional(),
}).strict();

const novelAiRequestShape = {
  input: z.string().max(8000),
  model: modelSchema,
  action: z.enum(["generate", "img2img"]),
  parameters: novelAiParametersSchema,
  use_new_shared_trial: z.boolean().optional(),
  recaptcha_token: z.string().trim().min(1).optional(),
  sourceAssetId: z.string().min(1).nullable().optional(),
} as const;

export const novelAiRequestSchema = z.object(novelAiRequestShape);

export const supportedNovelAiRequestSchema = z.object({
  ...novelAiRequestShape,
  parameters: supportedNovelAiParametersSchema,
}).strict();

export const submittedGenerationRequestSchema = z.union([
  generationRequestSchema,
  novelAiRequestSchema,
]);

export const generationParamsSchema = z.object({
  prompt: z.string().trim().max(8000),
  negativePrompt: z.string().max(8000),
  model: modelSchema,
  width: z.number().int().min(64).max(4096),
  height: z.number().int().min(64).max(4096),
  steps: z.number().int().min(1).max(150),
  scale: z.number().min(1).max(30),
  sampler: samplerSchema,
  seed: seedSchema,
  imageCount: z.number().int().min(1).max(8),
  promptOptions: promptOptionsSchema,
  referenceOptions: referenceOptionsSchema,
  baseImage: baseImageSchema.nullable(),
  characterPrompts: z.array(characterPromptSchema).max(16),
  vibeTransfers: z.array(vibeTransferSchema).max(16),
  preciseReferences: z.array(preciseReferenceSchema).max(16),
  providerParameters: providerParametersSchema,
  providerEnvelope: providerEnvelopeSchema,
  operation: generationOperationSchema,
});

export const generationDefaults: GenerationParams = {
  prompt: "",
  negativePrompt: "",
  model: "nai-diffusion-4-5-curated",
  width: 832,
  height: 1216,
  steps: 28,
  scale: 5,
  sampler: "k_euler_ancestral",
  seed: 0,
  imageCount: 1,
  promptOptions: {
    qualityToggle: true,
    ucPreset: 0,
  },
  referenceOptions: {
    normalizeStrengthValues: true,
  },
  baseImage: null,
  characterPrompts: [],
  vibeTransfers: [],
  preciseReferences: [],
  providerParameters: {},
  providerEnvelope: {
    useNewSharedTrial: null,
    recaptchaToken: null,
  },
  operation: { kind: "generate" },
};

export function normalizeGenerationRequest(request: GenerationRequest): GenerationParams {
  const operation = normalizeOperation(request);
  const prompt = (request.prompt ?? generationDefaults.prompt).trim();
  const negativePrompt = request.negativePrompt ?? generationDefaults.negativePrompt;
  const imageCount = normalizeImageCount(request.imageCount, operation.kind);
  const characterPrompts = normalizeCharacterPrompts(request);
  const vibeTransfers = normalizeVibeTransfers(request);
  const preciseReferences = normalizePreciseReferences(request);
  const seed = normalizeSeed(request.seed);

  return generationParamsSchema.parse({
    ...generationDefaults,
    ...request,
    prompt,
    negativePrompt,
    seed,
    imageCount,
    promptOptions: {
      ...generationDefaults.promptOptions,
      ...(request.promptOptions ?? {}),
    },
    referenceOptions: {
      ...generationDefaults.referenceOptions,
      ...(request.referenceOptions ?? {}),
    },
    baseImage: operation.kind === "generate" && request.baseImage && (request.baseImage.enabled ?? true)
      ? {
          strength: request.baseImage.strength ?? 0.7,
          enabled: true,
        }
      : null,
    characterPrompts,
    vibeTransfers,
    preciseReferences,
    providerParameters: request.providerParameters ?? {},
    providerEnvelope: {
      ...generationDefaults.providerEnvelope,
      ...(request.providerEnvelope ?? {}),
    },
    operation,
  });
}

export function isNovelAiRequest(request: SubmittedGenerationRequest): request is NovelAiRequest {
  return "input" in request && "parameters" in request;
}

export function novelAiRequestToGenerationRequest(request: NovelAiRequest): GenerationRequest {
  return convertNovelAiRequestToGenerationRequest(
    request,
    buildOperationFromNovelAiRequest(request.action, request.parameters, request.sourceAssetId ?? null),
  );
}

export function supportedNovelAiRequestToGenerationRequest(request: SupportedNovelAiRequest): GenerationRequest {
  return convertNovelAiRequestToGenerationRequest(request, buildSupportedOperationFromNovelAiRequest(request));
}

function convertNovelAiRequestToGenerationRequest(
  request: Pick<NovelAiRequest, "input" | "model" | "action" | "parameters" | "use_new_shared_trial" | "recaptcha_token" | "sourceAssetId">,
  operation: GenerationRequest["operation"],
): GenerationRequest {
  const parameters = request.parameters;

  return generationRequestSchema.parse({
    prompt: request.input,
    negativePrompt: parameters.negative_prompt ?? "",
    model: request.model,
    width: parameters.width ?? generationDefaults.width,
    height: parameters.height ?? generationDefaults.height,
    steps: parameters.steps ?? generationDefaults.steps,
    scale: parameters.scale ?? generationDefaults.scale,
    sampler: parameters.sampler ?? generationDefaults.sampler,
    seed: parameters.seed ?? null,
    imageCount: parameters.n_samples ?? generationDefaults.imageCount,
    promptOptions: {
      qualityToggle: parameters.qualityToggle ?? generationDefaults.promptOptions.qualityToggle,
      ucPreset: parameters.ucPreset ?? generationDefaults.promptOptions.ucPreset,
    },
    referenceOptions: {
      normalizeStrengthValues: parameters.normalize_reference_strength_multiple ?? generationDefaults.referenceOptions.normalizeStrengthValues,
    },
    baseImage: request.action === "generate" && hasProviderImage(parameters.image)
      ? {
          strength: toBaseImageStrength(parameters.inpaintImg2ImgStrength),
          enabled: true,
        }
      : null,
    characterPrompts: (parameters.characterPrompts ?? []).map((entry) => ({
      prompt: entry.prompt,
      negativePrompt: entry.uc ?? "",
      center: {
        x: entry.center?.x ?? 0.5,
        y: entry.center?.y ?? 0.5,
      },
      enabled: entry.enabled ?? true,
    })),
    vibeTransfers: buildVibeTransfersFromNovelAiParameters(parameters),
    preciseReferences: buildPreciseReferencesFromNovelAiParameters(parameters),
    providerParameters: parameters,
    providerEnvelope: {
      useNewSharedTrial: request.use_new_shared_trial,
      recaptchaToken: request.recaptcha_token ?? null,
    },
    operation,
  });
}

function buildVibeTransfersFromNovelAiParameters(parameters: NovelAiParameters) {
  const count = Math.max(
    parameters.reference_strength_multiple?.length ?? 0,
    parameters.reference_information_extracted_multiple?.length ?? 0,
    parameters.reference_image_multiple?.length ?? 0,
    parameters.reference_image_multiple_cached?.length ?? 0,
  );

  return Array.from({ length: count }, (_, index) => ({
    strength: parameters.reference_strength_multiple?.[index] ?? 0.65,
    informationExtracted: coerceInformationFlag(parameters.reference_information_extracted_multiple?.[index]),
    enabled: true,
  }));
}

function buildPreciseReferencesFromNovelAiParameters(parameters: NovelAiParameters) {
  const count = Math.max(
    parameters.director_reference_descriptions?.length ?? 0,
    parameters.director_reference_information_extracted?.length ?? 0,
    parameters.director_reference_strength_values?.length ?? 0,
    parameters.director_reference_secondary_strength_values?.length ?? 0,
    parameters.director_reference_images?.length ?? 0,
    parameters.director_reference_images_cached?.length ?? 0,
  );

  return Array.from({ length: count }, (_, index) => {
    const fidelity = normalizeFidelityFromSecondaryStrength(parameters.director_reference_secondary_strength_values?.[index]);
    return {
      prompt: parameters.director_reference_descriptions?.[index]?.caption?.base_caption ?? "",
      strength: parameters.director_reference_strength_values?.[index] ?? 0.55,
      secondaryStrength: parameters.director_reference_secondary_strength_values?.[index] ?? normalizeSecondaryStrengthFromFidelity(fidelity),
      fidelity,
      kind: "character_style" as const,
      informationExtracted: coerceInformationFlag(parameters.director_reference_information_extracted?.[index]),
      enabled: true,
    };
  });
}

function buildOperationFromNovelAiRequest(action: NovelAiAction, parameters: NovelAiParameters, sourceAssetId: string | null) {
  if (action === "generate") {
    return { kind: "generate" as const };
  }

  if (parameters.upscale_factor !== undefined) {
    return {
      kind: "upscale" as const,
      sourceAssetId,
      factor: normalizeUpscaleFactor(parameters.upscale_factor),
    };
  }

  if (parameters.upscale_amount !== undefined || parameters.magnitude !== undefined) {
    return {
      kind: "enhance" as const,
      sourceAssetId,
      upscaleAmount: parameters.upscale_amount ?? 1.5,
      magnitude: parameters.magnitude ?? 2,
      strength: parameters.strength ?? 0.5,
      noise: parameters.noise ?? 0,
    };
  }

  const variationSeed = parameters.seed === null || parameters.seed === undefined
    ? null
    : Math.max(0, Math.min(4_294_967_295, parameters.seed - 1));

  return {
    kind: "variations" as const,
    sourceAssetId,
    strength: parameters.strength ?? 0.8,
    noise: parameters.noise ?? 0.1,
    addOriginalImage: parameters.add_original_image ?? true,
    colorCorrect: parameters.color_correct ?? false,
    extraNoiseSeed: parameters.extra_noise_seed ?? variationSeed,
    imageCacheSecretKey: parameters.image_cache_secret_key ?? null,
  };
}

function buildSupportedOperationFromNovelAiRequest(request: SupportedNovelAiRequest) {
  const { action, parameters } = request;
  const sourceAssetId = request.sourceAssetId ?? null;
  const hasUpscaleMarkers = parameters.upscale_factor !== undefined;
  const hasEnhanceMarkers = parameters.upscale_amount !== undefined || parameters.magnitude !== undefined;
  const hasVariationMarkers = parameters.extra_noise_seed !== undefined
    || parameters.color_correct !== undefined
    || parameters.image_cache_secret_key !== undefined
    || parameters.add_original_image !== undefined;

  if (action === "generate") {
    if (hasUpscaleMarkers || hasEnhanceMarkers || hasVariationMarkers) {
      throw new Error("Only verified generate payloads are supported for action=generate");
    }
    return { kind: "generate" as const };
  }

  if (hasUpscaleMarkers) {
    if (hasEnhanceMarkers || hasVariationMarkers) {
      throw new Error("Mixed img2img mode markers are not supported");
    }
    return {
      kind: "upscale" as const,
      sourceAssetId,
      factor: normalizeUpscaleFactor(parameters.upscale_factor ?? 4),
    };
  }

  if (hasEnhanceMarkers) {
    return {
      kind: "enhance" as const,
      sourceAssetId,
      upscaleAmount: parameters.upscale_amount ?? 1.5,
      magnitude: parameters.magnitude ?? 2,
      strength: parameters.strength ?? 0.5,
      noise: parameters.noise ?? 0,
    };
  }

  if (!hasVariationMarkers) {
    throw new Error("Only verified variations, enhance, and x4 upscale img2img payloads are supported");
  }

  return buildOperationFromNovelAiRequest(action, parameters, sourceAssetId);
}

function normalizeCharacterPrompts(request: GenerationRequest) {
  return (request.characterPrompts ?? [])
    .map((entry) => ({
      prompt: entry.prompt.trim(),
      negativePrompt: entry.negativePrompt ?? "",
      center: {
        x: entry.center?.x ?? 0.5,
        y: entry.center?.y ?? 0.5,
      },
      enabled: entry.enabled ?? true,
    }))
    .filter((entry) => entry.enabled && entry.prompt.length > 0);
}

function normalizeVibeTransfers(request: GenerationRequest) {
  return (request.vibeTransfers ?? [])
    .map((entry) => ({
      strength: entry.strength ?? 0.65,
      informationExtracted: entry.informationExtracted ?? true,
      enabled: entry.enabled ?? true,
    }))
    .filter((entry) => entry.enabled);
}

function normalizePreciseReferences(request: GenerationRequest) {
  return (request.preciseReferences ?? [])
    .map((entry) => {
      const fidelity = entry.fidelity ?? normalizeFidelityFromSecondaryStrength(entry.secondaryStrength);
      return {
        prompt: entry.prompt?.trim() ?? "",
        strength: entry.strength ?? 0.55,
        secondaryStrength: entry.secondaryStrength ?? normalizeSecondaryStrengthFromFidelity(fidelity),
        fidelity,
        kind: entry.kind ?? "character_style",
        informationExtracted: entry.informationExtracted ?? true,
        enabled: entry.enabled ?? true,
      };
    })
    .filter((entry) => entry.enabled);
}

function normalizeUpscaleFactor(value: number): 2 | 4 {
  return upscaleFactorSchema.parse(value);
}

function normalizeOperation(request: GenerationRequest): GenerationOperation {
  const operation = request.operation;
  if (!operation || operation.kind === "generate") {
    return { kind: "generate" };
  }

  if (operation.kind === "variations") {
    return variationsOperationSchema.parse({
      ...operation,
      sourceAssetId: operation.sourceAssetId ?? null,
      extraNoiseSeed: normalizeSeed(operation.extraNoiseSeed),
      imageCacheSecretKey: operation.imageCacheSecretKey ?? null,
      strength: operation.strength ?? 0.8,
      noise: operation.noise ?? 0.1,
      addOriginalImage: operation.addOriginalImage ?? true,
      colorCorrect: operation.colorCorrect ?? false,
    });
  }

  if (operation.kind === "enhance") {
    return enhanceOperationSchema.parse({
      ...operation,
      sourceAssetId: operation.sourceAssetId ?? null,
      upscaleAmount: operation.upscaleAmount ?? 1.5,
      magnitude: operation.magnitude ?? 2,
      strength: operation.strength ?? 0.5,
      noise: operation.noise ?? 0,
    });
  }

  return upscaleOperationSchema.parse({
    ...operation,
    sourceAssetId: operation.sourceAssetId ?? null,
    factor: operation.factor ?? 4,
  });
}

function normalizeImageCount(imageCount: number | undefined, kind: GenerationOperation["kind"]) {
  if (kind === "enhance" || kind === "upscale") return 1;
  if (kind === "variations") return imageCount ?? 3;
  return imageCount ?? generationDefaults.imageCount;
}

function normalizeSeed(seed: number | null | undefined) {
  if (seed === null || seed === undefined) {
    return Math.floor(Math.random() * 4_294_967_296);
  }
  return seedSchema.parse(seed);
}

function normalizeFidelityFromSecondaryStrength(secondaryStrength: number | undefined) {
  const legacy = secondaryStrength ?? 0.35;
  return Math.max(0, Math.min(1, 1 - legacy));
}

function normalizeSecondaryStrengthFromFidelity(fidelity: number) {
  return Math.max(0, Math.min(1.5, 1 - fidelity));
}

function coerceInformationFlag(value: boolean | number | undefined) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  return true;
}

function toBaseImageStrength(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return 1;
  return Math.max(0.01, Math.min(1, value));
}

function hasProviderImage(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export const generationJobStatusSchema = z.enum([
  "QUEUED",
  "WAITING_FOR_RESULT_CONSUMER",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);

export const generatedOutputSchema = z.object({
  index: z.number().int().nonnegative(),
  asset: assetSummarySchema,
});

export const generationStatusSchema = z.object({
  id: z.string(),
  status: generationJobStatusSchema,
  submittedParams: submittedGenerationRequestSchema,
  normalizedParams: generationParamsSchema.nullable(),
  estimatedNovelAiAnlas: z.number().int().nullable(),
  actualNovelAiAnlas: z.number().int().nullable(),
  billedPlatformUnits: z.number().nullable(),
  resultMimeType: z.string().nullable(),
  outputCount: z.number().int().nonnegative(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});

export const generationDetailSchema = generationStatusSchema.extend({
  outputs: z.array(generatedOutputSchema),
});

export const adminGenerationRecordSchema = generationStatusSchema.extend({
  novelAiAccountId: z.string().nullable(),
  platformMultiplierSnapshot: z.number().nullable(),
});

export const adminGenerationDetailSchema = generationDetailSchema.extend({
  novelAiAccountId: z.string().nullable(),
  platformMultiplierSnapshot: z.number().nullable(),
});

export type Sampler = z.infer<typeof samplerSchema>;
export type GenerationModel = z.infer<typeof modelSchema>;
export type PromptOptions = z.infer<typeof promptOptionsSchema>;
export type ReferenceOptions = z.infer<typeof referenceOptionsSchema>;
export type ProviderEnvelope = z.infer<typeof providerEnvelopeSchema>;
export type BaseImage = z.infer<typeof baseImageSchema>;
export type CharacterPrompt = z.infer<typeof characterPromptSchema>;
export type VibeTransfer = z.infer<typeof vibeTransferSchema>;
export type PreciseReferenceKind = z.infer<typeof preciseReferenceKindSchema>;
export type PreciseReference = z.infer<typeof preciseReferenceSchema>;
export type GenerationOperationKind = z.infer<typeof generationOperationSchema>["kind"];
export type GenerateOperation = z.infer<typeof generateOperationSchema>;
export type VariationsOperation = z.infer<typeof variationsOperationSchema>;
export type EnhanceOperation = z.infer<typeof enhanceOperationSchema>;
export type UpscaleOperation = z.infer<typeof upscaleOperationSchema>;
export type GenerationOperation = z.infer<typeof generationOperationSchema>;
export type LegacyGenerationRequest = z.infer<typeof legacyGenerationRequestSchema>;
export type GenerationRequest = z.infer<typeof generationRequestSchema>;
export type NovelAiParameters = z.infer<typeof novelAiParametersSchema>;
export type SupportedNovelAiParameters = z.infer<typeof supportedNovelAiParametersSchema>;
export type NovelAiAction = z.infer<typeof novelAiRequestSchema>["action"];
export type NovelAiRequest = z.infer<typeof novelAiRequestSchema>;
export type SupportedNovelAiRequest = z.infer<typeof supportedNovelAiRequestSchema>;
export type SubmittedGenerationRequest = z.infer<typeof submittedGenerationRequestSchema>;
export type GenerationParams = z.infer<typeof generationParamsSchema>;
export type GenerationJobStatus = z.infer<typeof generationJobStatusSchema>;
export type GeneratedOutput = z.infer<typeof generatedOutputSchema>;
export type GenerationStatus = z.infer<typeof generationStatusSchema>;
export type GenerationDetail = z.infer<typeof generationDetailSchema>;
export type AdminGenerationRecord = z.infer<typeof adminGenerationRecordSchema>;
export type AdminGenerationDetail = z.infer<typeof adminGenerationDetailSchema>;
