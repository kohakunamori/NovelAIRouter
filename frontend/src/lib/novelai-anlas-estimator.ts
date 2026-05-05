import type { NovelAIWorkspaceDocument } from "@/types/novelai"

const ZERO_ANLAS_MAX_PIXELS = 1024 * 1024
const DEFAULT_MODEL_ID = "nai-diffusion-4-5-curated"
const BASE_IMAGE_SURCHARGE = 2.4
const BASE_IMAGE_STRENGTH_MULTIPLIER = 2.1
const VIBE_TRANSFER_ENCODING_SURCHARGE = 2

const modelMultiplierMap = {
  "nai-diffusion-4-5-curated": 1,
  "nai-diffusion-4-5-full": 1.08,
  "nai-diffusion-4-curated": 0.96,
  "nai-diffusion-4-full": 1.04,
  "nai-diffusion-anime-v3": 0.9,
  "nai-diffusion-furry-v3": 0.95,
} as const

export interface NovelAIAnlasEstimate {
  total: number
  basePerImage: number
  featurePerImage: number
  billableImageCount: number
  zeroCostEligible: boolean
  tags: string[]
}

export function estimateNovelAIGenerateAnlas(document: NovelAIWorkspaceDocument): NovelAIAnlasEstimate {
  const enabledPreciseReferences = document.preciseReferences.references.filter((reference) => reference.enabled)
  const vibeTransferCount = document.vibeTransfer.references.length
  const hasBaseImage = document.baseImageSource.kind !== "none"
  const totalPixels = document.width * document.height
  const areaFactor = totalPixels / ZERO_ANLAS_MAX_PIXELS
  const modelMultiplier = modelMultiplierMap[document.imageModelId as keyof typeof modelMultiplierMap] ?? 1
  const zeroCostEligible = !hasBaseImage && vibeTransferCount === 0 && enabledPreciseReferences.length === 0 && totalPixels <= ZERO_ANLAS_MAX_PIXELS && document.steps <= 28
  const basePerImage = areaFactor * ((document.steps * 0.61) + 3.58) * modelMultiplier
  const featurePerImage =
    (hasBaseImage ? BASE_IMAGE_SURCHARGE + (document.img2img.strength * BASE_IMAGE_STRENGTH_MULTIPLIER) : 0) +
    (vibeTransferCount * VIBE_TRANSFER_ENCODING_SURCHARGE) +
    enabledPreciseReferences.reduce((sum, reference) => sum + 2.2 + (reference.strength * 2.6) + ((1 - reference.fidelity) * 1.8), 0)
  const billableImageCount = zeroCostEligible ? Math.max(document.imageCount - 1, 0) : document.imageCount
  const totalBeforeCeil = (basePerImage + featurePerImage) * billableImageCount

  return {
    total: totalBeforeCeil <= 0 ? 0 : Math.max(1, Math.ceil(totalBeforeCeil)),
    basePerImage,
    featurePerImage,
    billableImageCount,
    zeroCostEligible,
    tags: buildEstimateTags({
      document,
      enabledPreciseReferenceCount: enabledPreciseReferences.length,
      hasBaseImage,
      totalPixels,
      vibeTransferCount,
      zeroCostEligible,
    }),
  }
}

function buildEstimateTags(args: {
  document: NovelAIWorkspaceDocument
  enabledPreciseReferenceCount: number
  hasBaseImage: boolean
  totalPixels: number
  vibeTransferCount: number
  zeroCostEligible: boolean
}) {
  const { document, enabledPreciseReferenceCount, hasBaseImage, totalPixels, vibeTransferCount, zeroCostEligible } = args
  const tags: string[] = []

  if (zeroCostEligible) {
    tags.push(document.imageCount > 1 ? "1st image free" : "Free baseline")
  }

  if (document.imageCount > 1) {
    tags.push(`${document.imageCount} images`)
  }

  if (document.steps > 28) {
    tags.push(`${document.steps} steps`)
  }

  if (totalPixels > ZERO_ANLAS_MAX_PIXELS) {
    tags.push(`${document.width}×${document.height}`)
  }

  if (document.imageModelId !== DEFAULT_MODEL_ID) {
    tags.push(formatModelTag(document.imageModelId))
  }

  if (hasBaseImage) {
    tags.push("Base Image")
  }

  if (vibeTransferCount > 0) {
    tags.push(`Vibe Transfer ×${vibeTransferCount}`)
  }

  if (enabledPreciseReferenceCount > 0) {
    tags.push(`Precise Reference ×${enabledPreciseReferenceCount}`)
  }

  return tags
}

function formatModelTag(modelId: string) {
  if (modelId === "nai-diffusion-4-5-full") {
    return "V4.5 Full"
  }

  if (modelId === "nai-diffusion-4-curated") {
    return "V4 Curated"
  }

  if (modelId === "nai-diffusion-4-full") {
    return "V4 Full"
  }

  if (modelId === "nai-diffusion-anime-v3") {
    return "Anime V3"
  }

  if (modelId === "nai-diffusion-furry-v3") {
    return "Furry V3"
  }

  return "Model modifier"
}
