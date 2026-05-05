import {
  generationParamsSchema,
  generationRequestSchema,
  normalizeGenerationRequest,
  type GenerationModel,
  type GenerationParams,
  type GenerationRequest,
} from "./generation.js";

export type GenerationAnlasEstimate = {
  estimatedAnlas: number;
  normalizedParams: GenerationParams;
  breakdown: {
    basePerImage: number;
    featurePerImage: number;
    imageCount: number;
    totalBeforeCeil: number;
    zeroCostEligible: boolean;
  };
};

const ZERO_ANLAS_MAX_PIXELS = 1024 * 1024;

const modelMultiplierMap: Record<GenerationModel, number> = {
  "nai-diffusion-3": 0.9,
  "nai-diffusion-furry-3": 0.95,
  "nai-diffusion-4-curated-preview": 0.96,
  "nai-diffusion-4-full": 1.04,
  "nai-diffusion-4-5-curated": 1,
  "nai-diffusion-4-5-full": 1.08,
};

export function estimateGenerationAnlas(input: GenerationRequest | GenerationParams): GenerationAnlasEstimate {
  const normalizedParams = normalizeEstimatorInput(input);
  const areaFactor = (normalizedParams.width * normalizedParams.height) / (1024 * 1024);
  const modelMultiplier = modelMultiplierMap[normalizedParams.model];
  const qualityMultiplier = normalizedParams.promptOptions.qualityToggle ? 1 : 0.95;
  const ucModifier = normalizedParams.promptOptions.ucPreset * 0.25;
  const operation = normalizedParams.operation;
  const hasImageGuidance = Boolean(normalizedParams.baseImage)
    || normalizedParams.vibeTransfers.length > 0
    || normalizedParams.preciseReferences.length > 0
    || operation.kind !== "generate";
  const zeroCostEligible = operation.kind === "generate"
    && !hasImageGuidance
    && (normalizedParams.width * normalizedParams.height) <= ZERO_ANLAS_MAX_PIXELS
    && normalizedParams.steps <= 28;

  const basePerImage = areaFactor * ((normalizedParams.steps * 0.61) + 3.58) * modelMultiplier * qualityMultiplier;
  const operationFeaturePerImage = operation.kind === "variations"
    ? 2.8 + (operation.strength * 2.4) + (operation.noise * 1.2)
    : operation.kind === "enhance"
      ? 3.2 + (operation.upscaleAmount * 1.5) + (operation.magnitude * 1.6) + (operation.strength * 1.4) + (operation.noise * 1.1)
      : operation.kind === "upscale"
        ? 2.4 + (operation.factor * 1.8)
        : 0;
  const featurePerImage =
    operationFeaturePerImage +
    (normalizedParams.baseImage ? 2.4 + (normalizedParams.baseImage.strength * 2.1) : 0) +
    normalizedParams.vibeTransfers.reduce((sum, reference) => sum + 1.8 + (reference.strength * 2.8), 0) +
    normalizedParams.preciseReferences.reduce(
      (sum, reference) => sum + 2.2 + (reference.strength * 2.6) + ((1 - reference.secondaryStrength) * 1.8) + (reference.prompt.length > 0 ? 0.4 : 0),
      0,
    ) +
    ucModifier;

  const billableImageCount = zeroCostEligible ? Math.max(normalizedParams.imageCount - 1, 0) : normalizedParams.imageCount;
  const totalBeforeCeil = (basePerImage + featurePerImage) * billableImageCount;

  return {
    estimatedAnlas: totalBeforeCeil <= 0 ? 0 : Math.max(1, Math.ceil(totalBeforeCeil)),
    normalizedParams,
    breakdown: {
      basePerImage,
      featurePerImage,
      imageCount: normalizedParams.imageCount,
      totalBeforeCeil,
      zeroCostEligible,
    },
  };
}

function normalizeEstimatorInput(input: GenerationRequest | GenerationParams) {
  const params = generationParamsSchema.safeParse(input);
  if (params.success) return params.data;
  return normalizeGenerationRequest(generationRequestSchema.parse(input));
}
