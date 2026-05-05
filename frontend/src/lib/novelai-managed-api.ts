import type {
  CharacterPromptState,
  EnhanceDraft,
  GenerationResult,
  NovelAIImageAsset,
  NovelAIUpscaleFactor,
  NovelAIWorkspaceDocument,
} from "@/types/novelai"

export const managedSamplerMap = {
  "Euler Ancestral": "k_euler_ancestral",
  Euler: "k_euler",
  "DPM++ 2S Ancestral": "k_dpmpp_2s_ancestral",
  "DPM++ 2M SDE": "k_dpmpp_2m_sde",
  "DPM++ 2M": "k_dpmpp_2m",
  "DPM++ SDE": "k_dpmpp_sde",
} as const

export const managedNoiseScheduleMap = {
  "karras (recommended)": "karras",
  exponential: "exponential",
  polyexponential: "polyexponential",
} as const

export type ManagedSamplerValue = (typeof managedSamplerMap)[keyof typeof managedSamplerMap]
export type ManagedNoiseScheduleValue = (typeof managedNoiseScheduleMap)[keyof typeof managedNoiseScheduleMap]

type ManagedSeededMultipartKind = "generate" | "variations" | "enhance"

type ManagedPromptOptions = {
  qualityToggle: true
  ucPreset: 0
}

type ManagedReferenceOptions = {
  normalizeStrengthValues: boolean
}

type ManagedCharacterPrompt = {
  prompt: string
  uc?: string
  center?: {
    x: number
    y: number
  }
  enabled: true
}

type ManagedVibeTransfer = {
  strength: number
  informationExtracted: 0 | 1
  enabled: true
}

type ManagedPreciseReference = {
  prompt: string
  strength: number
  secondaryStrength: number
  fidelity: number
  kind: "character_style" | "character" | "style"
  informationExtracted: 0 | 1
  enabled: true
}

type ManagedBaseRequestPayload = {
  prompt: string
  negativePrompt: string
  model: string
  width: number
  height: number
  steps: number
  scale: number
  sampler: ManagedSamplerValue
  seed: number
  imageCount: number
  promptOptions: ManagedPromptOptions
  referenceOptions: ManagedReferenceOptions
  providerParameters: {
    cfg_rescale: number
    noise_schedule: ManagedNoiseScheduleValue
    image_format: "png"
    stream: "msgpack"
  }
  characterPrompts: ManagedCharacterPrompt[]
  vibeTransfers: ManagedVibeTransfer[]
  preciseReferences: ManagedPreciseReference[]
}

export interface ManagedGenerateRequestPayload extends ManagedBaseRequestPayload {
  operation: {
    kind: "generate"
  }
  baseImage: {
    strength: number
    enabled: true
  } | null
}

export interface ManagedImg2ImgRequestPayload extends ManagedBaseRequestPayload {
  operation:
    | {
        kind: "variations"
        sourceAssetId: null
        strength: number
        noise: number
        addOriginalImage: true
        colorCorrect: false
        extraNoiseSeed: number
        imageCacheSecretKey: null
      }
    | {
        kind: "enhance"
        sourceAssetId: null
        upscaleAmount: number
        magnitude: number
        strength: number
        noise: number
      }
  baseImage: null
}

export interface ManagedUpscaleRequestPayload {
  input: ""
  model: string
  action: "img2img"
  parameters: {
    image: string
    upscale_factor: NovelAIUpscaleFactor
  }
}

export type ManagedGenerationRequestPayload = ManagedGenerateRequestPayload | ManagedImg2ImgRequestPayload

export type ManagedGenerationSubmission =
  | {
      kind: ManagedSeededMultipartKind
      endpoint: "/api/generations"
      method: "POST"
      body: FormData
      payload: ManagedGenerationRequestPayload
      seed: number
    }
  | {
      kind: "upscale"
      endpoint: "/api/generations"
      method: "POST"
      body: FormData
      payload: ManagedUpscaleRequestPayload
    }

interface ManagedSubmissionBaseArgs {
  document: NovelAIWorkspaceDocument
  prompt: string
  undesiredPrompt: string
}

interface ManagedSourceSubmissionArgs extends ManagedSubmissionBaseArgs {
  result: GenerationResult
}

function hasOwnKey<T extends object>(value: T, key: PropertyKey): key is keyof T {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function createRandomSeed(): number {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return values[0] ?? 0
}

function decrementSeed(value: number): number {
  return (value - 1) >>> 0
}

function getManagedSamplerValue(value: string): ManagedSamplerValue {
  if (!hasOwnKey(managedSamplerMap, value)) {
    throw new Error(`Unsupported sampler: ${value}`)
  }

  return managedSamplerMap[value]
}

function getManagedNoiseScheduleValue(value: string): ManagedNoiseScheduleValue {
  if (!hasOwnKey(managedNoiseScheduleMap, value)) {
    throw new Error(`Unsupported noise schedule: ${value}`)
  }

  return managedNoiseScheduleMap[value]
}

function normalizeManagedModel(value: string) {
  if (value === "nai-diffusion-4-curated") {
    return "nai-diffusion-4-curated-preview"
  }

  if (value === "nai-diffusion-anime-v3") {
    return "nai-diffusion-3"
  }

  if (value === "nai-diffusion-furry-v3") {
    return "nai-diffusion-furry-3"
  }

  return value
}

function getCharacterCenter(character: CharacterPromptState) {
  if (character.positionMode === "ai_choice" || character.positionCell === null) {
    return undefined
  }

  const column = character.positionCell % 5
  const row = Math.floor(character.positionCell / 5)

  return {
    x: Number(((column + 0.5) / 5).toFixed(2)),
    y: Number(((row + 0.5) / 5).toFixed(2)),
  }
}

function toManagedInformationExtracted(value: number): 0 | 1 {
  return value >= 0.5 ? 1 : 0
}

function buildManagedCharacterPrompts(document: NovelAIWorkspaceDocument): ManagedCharacterPrompt[] {
  return document.characters
    .filter((character) => character.enabled && character.prompt.trim().length > 0)
    .map((character) => {
      const center = getCharacterCenter(character)
      return {
        prompt: character.prompt.trim(),
        ...(character.undesiredPrompt.trim() ? { uc: character.undesiredPrompt.trim() } : {}),
        ...(center ? { center } : {}),
        enabled: true as const,
      }
    })
}

function buildManagedVibeTransfers(document: NovelAIWorkspaceDocument): ManagedVibeTransfer[] {
  return document.vibeTransfer.references.map((reference) => ({
    strength: reference.referenceStrength,
    informationExtracted: toManagedInformationExtracted(reference.informationExtracted),
    enabled: true,
  }))
}

function buildManagedPreciseReferences(document: NovelAIWorkspaceDocument): ManagedPreciseReference[] {
  return document.preciseReferences.references
    .filter((reference) => reference.enabled)
    .map((reference) => ({
      prompt: "",
      strength: reference.strength,
      secondaryStrength: Math.max(0, Math.min(1.5, 1 - reference.fidelity)),
      fidelity: reference.fidelity,
      kind: reference.kind,
      informationExtracted: 1,
      enabled: true,
    }))
}

function buildManagedBasePayload(args: {
  document: NovelAIWorkspaceDocument
  prompt: string
  negativePrompt: string
  width: number
  height: number
  seed: number
  imageCount: number
}): ManagedBaseRequestPayload {
  const { document, height, imageCount, negativePrompt, prompt, seed, width } = args

  return {
    prompt,
    negativePrompt,
    model: normalizeManagedModel(document.imageModelId),
    width,
    height,
    steps: document.steps,
    scale: document.guidance,
    sampler: getManagedSamplerValue(document.sampler),
    seed,
    imageCount,
    promptOptions: {
      qualityToggle: true,
      ucPreset: 0,
    },
    referenceOptions: {
      normalizeStrengthValues: document.vibeTransfer.normalizeReferenceStrengthValues,
    },
    providerParameters: {
      cfg_rescale: document.promptGuidanceRescale,
      noise_schedule: getManagedNoiseScheduleValue(document.noiseSchedule),
      image_format: "png",
      stream: "msgpack",
    },
    characterPrompts: buildManagedCharacterPrompts(document),
    vibeTransfers: buildManagedVibeTransfers(document),
    preciseReferences: buildManagedPreciseReferences(document),
  }
}

function appendMultipartRequestPayload(formData: FormData, payload: ManagedGenerationRequestPayload | ManagedUpscaleRequestPayload) {
  formData.append("request", JSON.stringify(payload))
}

function getImageExtension(mimeType: string) {
  if (mimeType === "image/png") {
    return "png"
  }

  if (mimeType === "image/jpeg") {
    return "jpg"
  }

  if (mimeType === "image/webp") {
    return "webp"
  }

  if (mimeType === "image/gif") {
    return "gif"
  }

  return "png"
}

async function fetchAssetBlob(asset: NovelAIImageAsset) {
  const response = await fetch(asset.src)
  if (!response.ok) {
    throw new Error(`Failed to load image asset: ${asset.src}`)
  }

  const blob = await response.blob()
  if (!blob.type.startsWith("image/")) {
    throw new Error(`Unsupported asset MIME type: ${blob.type || "unknown"}`)
  }

  return blob
}

async function createFileFromAsset(asset: NovelAIImageAsset, fallbackName: string) {
  const blob = await fetchAssetBlob(asset)
  const fileName = asset.fileName ?? `${fallbackName}.${getImageExtension(blob.type)}`
  return new File([blob], fileName, { type: blob.type || "image/png" })
}

async function appendVibeTransferFiles(document: NovelAIWorkspaceDocument, formData: FormData) {
  for (const [index, reference] of document.vibeTransfer.references.entries()) {
    const fieldName = `vibeTransfer${index}`
    formData.append(fieldName, await createFileFromAsset(reference.asset, fieldName))
  }
}

async function appendPreciseReferenceFiles(document: NovelAIWorkspaceDocument, formData: FormData) {
  const enabledReferences = document.preciseReferences.references.filter((reference) => reference.enabled)

  for (const [index, reference] of enabledReferences.entries()) {
    const fieldName = `preciseReference${index}`
    formData.append(fieldName, await createFileFromAsset(reference.asset, fieldName))
  }
}

async function appendBaseImage(document: NovelAIWorkspaceDocument, formData: FormData) {
  if (document.baseImageSource.kind === "none") {
    return false
  }

  formData.append("baseImage", await createFileFromAsset(document.baseImageSource.asset, "base-image"))
  return true
}

export function getEnhanceDimensions(result: GenerationResult, draft: EnhanceDraft) {
  const scaleMultiplier = draft.scale === "1.5x" ? 1.5 : 1
  return {
    width: Math.round(result.width * scaleMultiplier),
    height: Math.round(result.height * scaleMultiplier),
  }
}

export function resolveManagedSeed(value: string) {
  const normalizedValue = value.trim()

  if (!normalizedValue || normalizedValue.toUpperCase() === "N/A") {
    return createRandomSeed()
  }

  const parsedValue = Number(normalizedValue)
  if (!Number.isInteger(parsedValue) || parsedValue < 0 || parsedValue > 0xffffffff) {
    throw new Error(`Invalid seed value: ${value}`)
  }

  return parsedValue >>> 0
}

export async function buildManagedGenerateSubmission(args: ManagedSubmissionBaseArgs): Promise<ManagedGenerationSubmission> {
  const { document, prompt, undesiredPrompt } = args
  const seed = resolveManagedSeed(document.seed)
  const body = new FormData()
  const hasBaseImage = await appendBaseImage(document, body)
  await appendVibeTransferFiles(document, body)
  await appendPreciseReferenceFiles(document, body)

  const payload: ManagedGenerateRequestPayload = {
    ...buildManagedBasePayload({
      document,
      prompt,
      negativePrompt: undesiredPrompt,
      width: document.width,
      height: document.height,
      seed,
      imageCount: document.imageCount,
    }),
    operation: {
      kind: "generate",
    },
    baseImage: hasBaseImage
      ? {
          strength: document.img2img.strength,
          enabled: true,
        }
      : null,
  }

  appendMultipartRequestPayload(body, payload)

  return {
    kind: "generate",
    endpoint: "/api/generations",
    method: "POST",
    body,
    payload,
    seed,
  }
}

export async function buildManagedVariationsSubmission(args: ManagedSourceSubmissionArgs): Promise<ManagedGenerationSubmission> {
  const { document, prompt, result, undesiredPrompt } = args
  const seed = resolveManagedSeed(document.seed)
  const body = new FormData()
  body.append("image", await createFileFromAsset(result.asset, "variation-source"))
  await appendVibeTransferFiles(document, body)
  await appendPreciseReferenceFiles(document, body)

  const payload: ManagedImg2ImgRequestPayload = {
    ...buildManagedBasePayload({
      document,
      prompt,
      negativePrompt: undesiredPrompt,
      width: document.width,
      height: document.height,
      seed,
      imageCount: 3,
    }),
    operation: {
      kind: "variations",
      sourceAssetId: null,
      strength: 0.8,
      noise: 0.1,
      addOriginalImage: true,
      colorCorrect: false,
      extraNoiseSeed: decrementSeed(seed),
      imageCacheSecretKey: null,
    },
    baseImage: null,
  }

  appendMultipartRequestPayload(body, payload)

  return {
    kind: "variations",
    endpoint: "/api/generations",
    method: "POST",
    body,
    payload,
    seed,
  }
}

export async function buildManagedEnhanceSubmission(
  args: ManagedSourceSubmissionArgs & { draft: EnhanceDraft }
): Promise<ManagedGenerationSubmission> {
  const { document, draft, prompt, result, undesiredPrompt } = args
  const seed = resolveManagedSeed(document.seed)
  const dimensions = getEnhanceDimensions(result, draft)
  const body = new FormData()
  body.append("image", await createFileFromAsset(result.asset, "enhance-source"))
  await appendVibeTransferFiles(document, body)
  await appendPreciseReferenceFiles(document, body)

  const payload: ManagedImg2ImgRequestPayload = {
    ...buildManagedBasePayload({
      document,
      prompt,
      negativePrompt: undesiredPrompt,
      width: dimensions.width,
      height: dimensions.height,
      seed,
      imageCount: 1,
    }),
    operation: {
      kind: "enhance",
      sourceAssetId: null,
      upscaleAmount: draft.scale === "1.5x" ? 1.5 : 1,
      magnitude: draft.magnitude,
      strength: draft.strength,
      noise: draft.noise,
    },
    baseImage: null,
  }

  appendMultipartRequestPayload(body, payload)

  return {
    kind: "enhance",
    endpoint: "/api/generations",
    method: "POST",
    body,
    payload,
    seed,
  }
}

export async function buildManagedUpscaleSubmission(args: {
  factor: NovelAIUpscaleFactor
  model: string
  result: GenerationResult
}): Promise<ManagedGenerationSubmission> {
  const { factor, model, result } = args
  const body = new FormData()
  body.append("image", await createFileFromAsset(result.asset, "upscale-source"))

  const payload: ManagedUpscaleRequestPayload = {
    input: "",
    model: normalizeManagedModel(model),
    action: "img2img",
    parameters: {
      image: "image",
      upscale_factor: factor,
    },
  }

  appendMultipartRequestPayload(body, payload)

  return {
    kind: "upscale",
    endpoint: "/api/generations",
    method: "POST",
    body,
    payload,
  }
}
