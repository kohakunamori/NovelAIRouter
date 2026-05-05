"use client"

import { useEffect, useMemo, useReducer, useRef } from "react"

import {
  buildRandomPrompt,
  characterTemplates,
  defaultBasePrompt,
  defaultUndesiredPrompt,
  imageModelOptions,
  imagePresets,
  noiseScheduleOptions,
  qualityTagPrefix,
  quickstartSamples,
  samplerOptions,
  supportsNovelAICharacterPrompts,
  supportsNovelAIPreciseReference,
  undesiredPresetMap,
} from "@/lib/novelai-demo-data"
import { estimateNovelAIGenerateAnlas } from "@/lib/novelai-anlas-estimator"
import {
  buildManagedEnhanceSubmission,
  buildManagedGenerateSubmission,
  buildManagedUpscaleSubmission,
  buildManagedVariationsSubmission,
  getEnhanceDimensions,
} from "@/lib/novelai-managed-api"
import { appendPromptFragment, estimatePromptTokens } from "@/lib/utils"
import type {
  BaseImageSource,
  CharacterPromptState,
  CharacterTemplate,
  GenerationIntermediateFrame,
  GenerationResult,
  GenerationRun,
  GenerationSettingsSnapshot,
  ManagedGenerationStatus,
  MobilePanel,
  NovelAIImageAsset,
  NovelAIImageEditorMode,
  NovelAIUpscaleFactor,
  NovelAIWorkspaceDocument,
  NovelAIWorkspaceState,
  PreciseReference,
  PreciseReferenceKind,
  PromptEditorTab,
  PromptSettingsTab,
  QuickstartPromptUndoSnapshot,
  QuickstartSample,
  UploadSlotKey,
  VibeReference,
} from "@/types/novelai"

export interface NovelAIWorkspaceActions {
  setBasePrompt: (value: string) => void
  setUndesiredPrompt: (value: string) => void
  setPromptEditorTab: (value: PromptEditorTab) => void
  togglePromptTagSuggestionMode: () => void
  setPromptAttached: (value: boolean) => void
  togglePromptSettings: () => void
  closePromptSettings: () => void
  setPromptSettingsTab: (value: PromptSettingsTab) => void
  toggleQualityTags: () => void
  toggleDisableTagSuggestions: () => void
  toggleHighlightEmphasis: () => void
  setUndesiredPreset: (value: string) => void
  selectSample: (sample: QuickstartSample) => void
  randomizePrompt: () => void
  toggleAddCharacterMenu: () => void
  closeAddCharacterMenu: () => void
  toggleImageModelMenu: () => void
  closeImageModelMenu: () => void
  setImageModel: (modelId: string) => void
  addCharacter: (template: CharacterTemplate) => void
  removeCharacter: (id: string) => void
  moveCharacterUp: (id: string) => void
  moveCharacterDown: (id: string) => void
  toggleCharacterExpanded: (id: string) => void
  toggleCharacterEnabled: (id: string) => void
  setCharacterTab: (id: string, tab: CharacterPromptState["activeTab"]) => void
  setCharacterPrompt: (id: string, value: string) => void
  setCharacterUndesiredPrompt: (id: string, value: string) => void
  setCharacterPositionMode: (id: string, value: CharacterPromptState["positionMode"]) => void
  setCharacterPositionCell: (id: string, value: number | null) => void
  setUpload: (key: UploadSlotKey, file: File | null) => void
  setUploadPreview: (key: UploadSlotKey, fileName: string, previewUrl: string) => void
  removeUpload: (key: UploadSlotKey, id?: string) => void
  setImg2ImgStrength: (value: number) => void
  setImg2ImgNoise: (value: number) => void
  toggleVibeNormalize: () => void
  setVibeReferenceStrength: (id: string, value: number) => void
  setVibeReferenceInformation: (id: string, value: number) => void
  setPreciseReferenceEnabled: (id: string, value: boolean) => void
  setPreciseReferenceKind: (id: string, value: PreciseReferenceKind) => void
  setPreciseReferenceStrength: (id: string, value: number) => void
  setPreciseReferenceFidelity: (id: string, value: number) => void
  openImageEditor: (mode?: NovelAIImageEditorMode) => void
  closeImageEditor: () => void
  setImageEditorBrushSize: (value: number) => void
  toggleUndesiredPresetMenu: () => void
  toggleImagePresetMenu: () => void
  closeImagePresetMenu: () => void
  setImagePreset: (presetId: string) => void
  setWidth: (value: number) => void
  setHeight: (value: number) => void
  swapDimensions: () => void
  setImageCount: (value: number) => void
  setSteps: (value: number) => void
  setGuidance: (value: number) => void
  toggleVarietyPlus: () => void
  setSeed: (value: string) => void
  toggleSamplerMenu: () => void
  setSampler: (value: string) => void
  setPromptGuidanceRescale: (value: number) => void
  toggleNoiseScheduleMenu: () => void
  setNoiseSchedule: (value: string) => void
  toggleAdvancedImageSettings: () => void
  toggleAiSettingsAdvanced: () => void
  toggleHistoryRailHidden: () => void
  openMobilePanel: (value: MobilePanel) => void
  closeMobilePanel: () => void
  generate: () => void
  selectRun: (runId: string, resultId?: string) => void
  applyHistorySettings: (runId: string) => void
  clearHistory: () => void
  clearRequestError: () => void
  undoQuickstartPromptSelection: () => void
  backToGallery: () => void
  startEnhance: () => void
  cancelEnhance: () => void
  setEnhanceScale: (value: "1x" | "1.5x") => void
  setEnhanceMagnitude: (value: 1 | 2 | 3) => void
  toggleEnhanceAdvanced: () => void
  applyEnhance: () => void
  createVariations: () => void
  upscaleSelectedResult: (factor: NovelAIUpscaleFactor) => void
  useSelectedResultAsBaseImage: () => void
  useSelectedResultAsPreciseReference: () => void
}

const initialSample = quickstartSamples[0]

const initialDocument: NovelAIWorkspaceDocument = {
  selectedSample: initialSample,
  basePrompt: defaultBasePrompt,
  undesiredPrompt: defaultUndesiredPrompt,
  promptAttached: true,
  addQualityTags: true,
  undesiredPreset: "Heavy",
  highlightEmphasis: true,
  baseImageSource: { kind: "none" },
  img2img: {
    strength: 0.7,
    noise: 0,
  },
  characters: [],
  imageModelId: "nai-diffusion-4-5-curated",
  imagePresetId: "normal-portrait",
  width: initialSample.width,
  height: initialSample.height,
  imageCount: 1,
  steps: 28,
  guidance: 7,
  varietyPlus: false,
  seed: "N/A",
  sampler: samplerOptions[0],
  promptGuidanceRescale: 0,
  noiseSchedule: noiseScheduleOptions[0],
  vibeTransfer: {
    normalizeReferenceStrengthValues: true,
    references: [],
  },
  preciseReferences: {
    references: [],
  },
  historyRuns: [],
  selectedRunId: null,
  selectedResultId: null,
  enhanceDraft: null,
}

const initialState: NovelAIWorkspaceState = {
  document: initialDocument,
  ui: {
    promptEditorTab: "prompt",
    promptTagSuggestionMode: "default",
    promptSettingsOpen: false,
    promptSettingsTab: "settings",
    disableTagSuggestions: false,
    imageEditorOpen: false,
    imageEditorMode: "inpaint",
    imageEditorBrushSize: 4,
    addCharacterMenuOpen: false,
    imageModelMenuOpen: false,
    advancedImageSettingsOpen: false,
    aiSettingsAdvancedOpen: false,
    undesiredPresetMenuOpen: false,
    imagePresetMenuOpen: false,
    samplerMenuOpen: false,
    noiseScheduleMenuOpen: false,
    copiedSampleId: null,
    quickstartPromptUndoSnapshot: null,
    activeMobilePanel: null,
    historyRailHidden: false,
    requestErrorMessage: null,
    generationJobStatus: null,
    generationProgressMessage: null,
    generationIntermediateFrames: [],
    generationTargetImageCount: initialDocument.imageCount,
    generationTargetWidth: initialDocument.width,
    generationTargetHeight: initialDocument.height,
    stage: "gallery",
  },
}

const workspaceSettingsStorageKey = "novelai-workspace-settings"
export const novelAIImageEditorBrushMin = 4
export const novelAIImageEditorBrushMax = 50

export function clampNovelAIImageEditorBrushSize(value: number) {
  if (!Number.isFinite(value)) {
    return novelAIImageEditorBrushMin
  }

  return Math.min(Math.max(Math.round(value), novelAIImageEditorBrushMin), novelAIImageEditorBrushMax)
}

interface PersistedWorkspaceSettingsDocument {
  addQualityTags: boolean
  basePrompt: string
  characters: CharacterPromptState[]
  guidance: number
  height: number
  highlightEmphasis: boolean
  imageCount: number
  imageModelId: string
  imagePresetId: string
  img2img: {
    noise: number
    strength: number
  }
  noiseSchedule: string
  promptAttached: boolean
  promptGuidanceRescale: number
  sampler: string
  seed: string
  steps: number
  undesiredPreset: string
  undesiredPrompt: string
  varietyPlus: boolean
  vibeTransfer: {
    normalizeReferenceStrengthValues: boolean
  }
  width: number
}

interface PersistedWorkspaceSettings {
  version: 1
  document: PersistedWorkspaceSettingsDocument
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function buildPersistedWorkspaceSettings(document: NovelAIWorkspaceDocument): PersistedWorkspaceSettings {
  return {
    version: 1,
    document: {
      addQualityTags: document.addQualityTags,
      basePrompt: document.basePrompt,
      characters: cloneCharacters(document.characters),
      guidance: document.guidance,
      height: document.height,
      highlightEmphasis: document.highlightEmphasis,
      imageCount: document.imageCount,
      imageModelId: document.imageModelId,
      imagePresetId: document.imagePresetId,
      img2img: {
        noise: document.img2img.noise,
        strength: document.img2img.strength,
      },
      noiseSchedule: document.noiseSchedule,
      promptAttached: document.promptAttached,
      promptGuidanceRescale: document.promptGuidanceRescale,
      sampler: document.sampler,
      seed: document.seed,
      steps: document.steps,
      undesiredPreset: document.undesiredPreset,
      undesiredPrompt: document.undesiredPrompt,
      varietyPlus: document.varietyPlus,
      vibeTransfer: {
        normalizeReferenceStrengthValues: document.vibeTransfer.normalizeReferenceStrengthValues,
      },
      width: document.width,
    },
  }
}

function parsePersistedWorkspaceSettings(value: string): PersistedWorkspaceSettings | null {
  try {
    const parsedValue = JSON.parse(value) as unknown
    if (!isRecord(parsedValue) || parsedValue.version !== 1 || !isRecord(parsedValue.document)) {
      return null
    }

    const document = parsedValue.document
    const parsedCharacters = Array.isArray(document.characters) ? document.characters : []
    const characters = parsedCharacters
      .map((character, index) => {
        if (!isRecord(character)) {
          return null
        }

        const prompt = typeof character.prompt === "string" ? character.prompt : ""
        const rawUndesiredPrompt = typeof character.undesiredPrompt === "string" ? character.undesiredPrompt : ""
        const undesiredPrompt = rawUndesiredPrompt === defaultUndesiredPrompt ? "" : rawUndesiredPrompt
        const type = character.type === "female" || character.type === "male" || character.type === "other" ? character.type : "female"
        const activeTab = character.activeTab === "undesired" ? "undesired" : "prompt"
        const positionMode =
          character.positionMode === "adjust" || character.positionMode === "custom" || character.positionMode === "ai_choice"
            ? character.positionMode
            : "ai_choice"
        const positionCell = typeof character.positionCell === "number" ? character.positionCell : null

        const parsedCharacter: CharacterPromptState = {
          activeTab,
          enabled: character.enabled !== false,
          id: typeof character.id === "string" ? character.id : `character-persisted-${index}`,
          isExpanded: false,
          name: typeof character.name === "string" ? character.name : `Character ${index + 1}`,
          positionCell,
          positionMode,
          prompt,
          tokens: estimatePromptTokens(prompt),
          type,
          undesiredPrompt,
        }

        return parsedCharacter
      })
      .filter((character): character is CharacterPromptState => character !== null)

    const img2img = isRecord(document.img2img) ? document.img2img : null
    const vibeTransfer = isRecord(document.vibeTransfer) ? document.vibeTransfer : null

    return {
      version: 1,
      document: {
        addQualityTags: document.addQualityTags !== false,
        basePrompt: typeof document.basePrompt === "string" ? document.basePrompt : initialDocument.basePrompt,
        characters,
        guidance: typeof document.guidance === "number" ? document.guidance : initialDocument.guidance,
        height: typeof document.height === "number" ? document.height : initialDocument.height,
        highlightEmphasis: document.highlightEmphasis !== false,
        imageCount: typeof document.imageCount === "number" ? document.imageCount : initialDocument.imageCount,
        imageModelId: typeof document.imageModelId === "string" ? document.imageModelId : initialDocument.imageModelId,
        imagePresetId: typeof document.imagePresetId === "string" ? document.imagePresetId : initialDocument.imagePresetId,
        img2img: {
          noise: img2img && typeof img2img.noise === "number" ? img2img.noise : initialDocument.img2img.noise,
          strength: img2img && typeof img2img.strength === "number" ? img2img.strength : initialDocument.img2img.strength,
        },
        noiseSchedule: typeof document.noiseSchedule === "string" ? document.noiseSchedule : initialDocument.noiseSchedule,
        promptAttached: document.promptAttached !== false,
        promptGuidanceRescale:
          typeof document.promptGuidanceRescale === "number" ? document.promptGuidanceRescale : initialDocument.promptGuidanceRescale,
        sampler: typeof document.sampler === "string" ? document.sampler : initialDocument.sampler,
        seed: typeof document.seed === "string" ? document.seed : initialDocument.seed,
        steps: typeof document.steps === "number" ? document.steps : initialDocument.steps,
        undesiredPreset: typeof document.undesiredPreset === "string" ? document.undesiredPreset : initialDocument.undesiredPreset,
        undesiredPrompt: typeof document.undesiredPrompt === "string" ? document.undesiredPrompt : initialDocument.undesiredPrompt,
        varietyPlus: document.varietyPlus === true,
        vibeTransfer: {
          normalizeReferenceStrengthValues:
            vibeTransfer && typeof vibeTransfer.normalizeReferenceStrengthValues === "boolean"
              ? vibeTransfer.normalizeReferenceStrengthValues
              : initialDocument.vibeTransfer.normalizeReferenceStrengthValues,
        },
        width: typeof document.width === "number" ? document.width : initialDocument.width,
      },
    }
  } catch {
    return null
  }
}

type Action =
  | { type: "select-sample"; sample: QuickstartSample }
  | { type: "set-copied-sample"; id: string | null }
  | { type: "undo-quickstart-prompt-selection" }
  | { type: "set-base-prompt"; value: string }
  | { type: "set-undesired-prompt"; value: string }
  | { type: "set-prompt-editor-tab"; value: PromptEditorTab }
  | { type: "toggle-prompt-tag-suggestion-mode" }
  | { type: "set-prompt-attached"; value: boolean }
  | { type: "toggle-prompt-settings" }
  | { type: "close-prompt-settings" }
  | { type: "set-prompt-settings-tab"; value: PromptSettingsTab }
  | { type: "toggle-quality-tags" }
  | { type: "toggle-disable-tag-suggestions" }
  | { type: "toggle-highlight-emphasis" }
  | { type: "set-undesired-preset"; value: string }
  | { type: "toggle-add-character-menu" }
  | { type: "close-add-character-menu" }
  | { type: "toggle-image-model-menu" }
  | { type: "close-image-model-menu" }
  | { type: "set-image-model"; modelId: string }
  | { type: "toggle-undesired-preset-menu" }
  | { type: "toggle-image-preset-menu" }
  | { type: "close-image-preset-menu" }
  | { type: "add-character"; template: CharacterTemplate }
  | { type: "remove-character"; id: string }
  | { type: "move-character"; id: string; direction: "up" | "down" }
  | { type: "toggle-character-expanded"; id: string }
  | { type: "toggle-character-enabled"; id: string }
  | { type: "set-character-tab"; id: string; tab: CharacterPromptState["activeTab"] }
  | { type: "set-character-prompt"; id: string; value: string }
  | { type: "set-character-undesired-prompt"; id: string; value: string }
  | { type: "set-character-position-mode"; id: string; value: CharacterPromptState["positionMode"] }
  | { type: "set-character-position-cell"; id: string; value: number | null }
  | { type: "set-base-image-source"; source: BaseImageSource }
  | { type: "add-vibe-reference"; reference: VibeReference }
  | { type: "add-precise-reference"; reference: PreciseReference }
  | { type: "remove-upload"; key: UploadSlotKey; id?: string }
  | { type: "set-img2img-strength"; value: number }
  | { type: "set-img2img-noise"; value: number }
  | { type: "toggle-vibe-normalize" }
  | { type: "set-vibe-reference-strength"; id: string; value: number }
  | { type: "set-vibe-reference-information"; id: string; value: number }
  | { type: "set-precise-reference-enabled"; id: string; value: boolean }
  | { type: "set-precise-reference-kind"; id: string; value: PreciseReferenceKind }
  | { type: "set-precise-reference-strength"; id: string; value: number }
  | { type: "set-precise-reference-fidelity"; id: string; value: number }
  | { type: "open-image-editor"; mode: NovelAIImageEditorMode }
  | { type: "close-image-editor" }
  | { type: "set-image-editor-brush-size"; value: number }
  | { type: "set-image-preset"; presetId: string }
  | { type: "set-width"; value: number }
  | { type: "set-height"; value: number }
  | { type: "swap-dimensions" }
  | { type: "set-image-count"; value: number }
  | { type: "set-steps"; value: number }
  | { type: "set-guidance"; value: number }
  | { type: "toggle-variety-plus" }
  | { type: "set-seed"; value: string }
  | { type: "toggle-sampler-menu" }
  | { type: "set-sampler"; value: string }
  | { type: "set-prompt-guidance-rescale"; value: number }
  | { type: "toggle-noise-schedule-menu" }
  | { type: "set-noise-schedule"; value: string }
  | { type: "toggle-advanced-image-settings" }
  | { type: "toggle-ai-settings-advanced" }
  | { type: "restore-persisted-settings"; document: PersistedWorkspaceSettingsDocument }
  | { type: "set-request-error"; message: string }
  | { type: "clear-request-error" }
  | { type: "start-generating"; imageCount: number; width: number; height: number }
  | { type: "set-generation-job-status"; status: ManagedGenerationStatus }
  | { type: "set-generation-progress-message"; message: string | null }
  | { type: "upsert-generation-intermediate-frame"; frame: GenerationIntermediateFrame }
  | { type: "set-stage"; stage: NovelAIWorkspaceState["ui"]["stage"] }
  | { type: "toggle-history-rail-hidden" }
  | { type: "open-mobile-panel"; value: MobilePanel }
  | { type: "close-mobile-panel" }
  | { type: "commit-run"; run: GenerationRun; stage: NovelAIWorkspaceState["ui"]["stage"] }
  | { type: "select-run"; runId: string; resultId?: string }
  | { type: "apply-history-settings"; runId: string }
  | { type: "clear-history" }
  | { type: "back-to-gallery" }
  | { type: "start-enhance" }
  | { type: "cancel-enhance" }
  | { type: "set-enhance-scale"; value: "1x" | "1.5x" }
  | { type: "set-enhance-magnitude"; value: 1 | 2 | 3 }
  | { type: "toggle-enhance-advanced" }

function cloneCharacters(characters: CharacterPromptState[]) {
  return characters.map((character) => ({ ...character }))
}

function cloneImageAsset(asset: NovelAIImageAsset): NovelAIImageAsset {
  return { ...asset }
}

function cloneBaseImageSource(source: BaseImageSource): BaseImageSource {
  if (source.kind === "none") {
    return source
  }

  return {
    ...source,
    asset: cloneImageAsset(source.asset),
  }
}

function cloneVibeReferences(references: VibeReference[]) {
  return references.map((reference) => ({
    ...reference,
    asset: cloneImageAsset(reference.asset),
  }))
}

function clonePreciseReferences(references: PreciseReference[]) {
  return references.map((reference) => ({
    ...reference,
    asset: cloneImageAsset(reference.asset),
  }))
}

function cloneSnapshot(snapshot: GenerationSettingsSnapshot): GenerationSettingsSnapshot {
  return {
    ...snapshot,
    baseImageSource: cloneBaseImageSource(snapshot.baseImageSource),
    characters: cloneCharacters(snapshot.characters),
    vibeTransfer: {
      normalizeReferenceStrengthValues: snapshot.vibeTransfer.normalizeReferenceStrengthValues,
      references: cloneVibeReferences(snapshot.vibeTransfer.references),
    },
    preciseReferences: {
      references: clonePreciseReferences(snapshot.preciseReferences.references),
    },
  }
}

function prependPromptSegment(baseValue: string, prefix: string) {
  const trimmedBaseValue = baseValue.trim()
  if (!prefix) {
    return trimmedBaseValue
  }
  if (!trimmedBaseValue) {
    return prefix
  }
  return `${prefix}, ${trimmedBaseValue}`
}

function buildEffectiveUndesiredPrompt(undesiredPrompt: string, undesiredPreset: string) {
  const presetPrefix = undesiredPresetMap[undesiredPreset] ?? ""
  return prependPromptSegment(undesiredPrompt, presetPrefix)
}

function buildEffectiveBasePrompt(basePrompt: string, addQualityTags: boolean) {
  return addQualityTags ? appendPromptFragment(basePrompt, qualityTagPrefix) : basePrompt.trim()
}

function findMatchingImagePresetId(width: number, height: number) {
  return imagePresets.find((preset) => preset.id !== "custom" && preset.width === width && preset.height === height)?.id ?? "custom"
}

function moveCharacter(characters: CharacterPromptState[], id: string, direction: "up" | "down") {
  const index = characters.findIndex((character) => character.id === id)
  if (index === -1) {
    return characters
  }

  const targetIndex = direction === "up" ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= characters.length) {
    return characters
  }

  const next = [...characters]
  const [item] = next.splice(index, 1)
  next.splice(targetIndex, 0, item)
  return next
}

function createDerivedAsset(asset: NovelAIImageAsset, suffix: string): NovelAIImageAsset {
  return {
    id: `${asset.id}-${suffix}`,
    src: asset.src,
    fileName: asset.fileName,
    origin: "result",
  }
}

function createAssetFromUpload(fileName: string, src: string, origin: NovelAIImageAsset["origin"]): NovelAIImageAsset {
  return {
    id: `${origin}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    src,
    fileName,
    origin,
  }
}

function buildCharacterName(template: CharacterTemplate, nextIndex: number) {
  return `Character ${nextIndex}`
}

function buildQuickstartPromptUndoSnapshot(document: NovelAIWorkspaceDocument): QuickstartPromptUndoSnapshot {
  return {
    selectedSample: document.selectedSample,
    basePrompt: document.basePrompt,
    undesiredPrompt: document.undesiredPrompt,
    imagePresetId: document.imagePresetId,
    width: document.width,
    height: document.height,
  }
}

function buildCharacterState(template: CharacterTemplate, nextIndex: number): CharacterPromptState {
  return {
    id: `character-${Date.now()}-${nextIndex}`,
    name: buildCharacterName(template, nextIndex),
    type: template.id,
    prompt: template.prompt,
    undesiredPrompt: template.undesiredPrompt,
    activeTab: "prompt",
    isExpanded: true,
    enabled: true,
    tokens: estimatePromptTokens(template.prompt),
    positionMode: "ai_choice",
    positionCell: null,
  }
}

function buildSettingsSnapshot(document: NovelAIWorkspaceDocument): GenerationSettingsSnapshot {
  return {
    addQualityTags: document.addQualityTags,
    baseImageSource: cloneBaseImageSource(document.baseImageSource),
    basePrompt: document.basePrompt,
    characters: cloneCharacters(document.characters),
    guidance: document.guidance,
    height: document.height,
    highlightEmphasis: document.highlightEmphasis,
    imageCount: document.imageCount,
    img2img: {
      ...document.img2img,
    },
    imageModelId: document.imageModelId,
    imagePresetId: document.imagePresetId,
    noiseSchedule: document.noiseSchedule,
    preciseReferences: {
      references: clonePreciseReferences(document.preciseReferences.references),
    },
    promptGuidanceRescale: document.promptGuidanceRescale,
    sampler: document.sampler,
    seed: document.seed,
    steps: document.steps,
    undesiredPreset: document.undesiredPreset,
    undesiredPrompt: document.undesiredPrompt,
    varietyPlus: document.varietyPlus,
    vibeTransfer: {
      normalizeReferenceStrengthValues: document.vibeTransfer.normalizeReferenceStrengthValues,
      references: cloneVibeReferences(document.vibeTransfer.references),
    },
    width: document.width,
  }
}

function restoreDocumentFromSnapshot(document: NovelAIWorkspaceDocument, snapshot: GenerationSettingsSnapshot): NovelAIWorkspaceDocument {
  return {
    ...document,
    addQualityTags: snapshot.addQualityTags,
    baseImageSource: cloneBaseImageSource(snapshot.baseImageSource),
    basePrompt: snapshot.basePrompt,
    characters: cloneCharacters(snapshot.characters),
    img2img: {
      ...snapshot.img2img,
    },
    guidance: snapshot.guidance,
    height: snapshot.height,
    highlightEmphasis: snapshot.highlightEmphasis,
    imageCount: snapshot.imageCount,
    imageModelId: snapshot.imageModelId,
    imagePresetId: snapshot.imagePresetId,
    noiseSchedule: snapshot.noiseSchedule,
    preciseReferences: {
      references: clonePreciseReferences(snapshot.preciseReferences.references),
    },
    promptGuidanceRescale: snapshot.promptGuidanceRescale,
    sampler: snapshot.sampler,
    seed: snapshot.seed,
    steps: snapshot.steps,
    undesiredPreset: snapshot.undesiredPreset,
    undesiredPrompt: snapshot.undesiredPrompt,
    varietyPlus: snapshot.varietyPlus,
    vibeTransfer: {
      normalizeReferenceStrengthValues: snapshot.vibeTransfer.normalizeReferenceStrengthValues,
      references: cloneVibeReferences(snapshot.vibeTransfer.references),
    },
    width: snapshot.width,
  }
}

function restoreDocumentFromPersistedSettings(
  document: NovelAIWorkspaceDocument,
  persistedDocument: PersistedWorkspaceSettingsDocument
): NovelAIWorkspaceDocument {
  return {
    ...document,
    addQualityTags: persistedDocument.addQualityTags,
    basePrompt: persistedDocument.basePrompt,
    characters: cloneCharacters(persistedDocument.characters),
    guidance: persistedDocument.guidance,
    height: persistedDocument.height,
    highlightEmphasis: persistedDocument.highlightEmphasis,
    imageCount: persistedDocument.imageCount,
    imageModelId: persistedDocument.imageModelId,
    imagePresetId: persistedDocument.imagePresetId,
    img2img: {
      ...persistedDocument.img2img,
    },
    noiseSchedule: persistedDocument.noiseSchedule,
    promptAttached: persistedDocument.promptAttached,
    promptGuidanceRescale: persistedDocument.promptGuidanceRescale,
    sampler: persistedDocument.sampler,
    seed: persistedDocument.seed,
    steps: persistedDocument.steps,
    undesiredPreset: persistedDocument.undesiredPreset,
    undesiredPrompt: persistedDocument.undesiredPrompt,
    varietyPlus: persistedDocument.varietyPlus,
    vibeTransfer: {
      ...document.vibeTransfer,
      normalizeReferenceStrengthValues: persistedDocument.vibeTransfer.normalizeReferenceStrengthValues,
    },
    width: persistedDocument.width,
  }
}

function createRun(args: {
  kind: GenerationRun["kind"]
  sourceRunId?: string | null
  sourceResultId?: string | null
  settingsSnapshot: GenerationSettingsSnapshot
  results: GenerationResult[]
  cost: number
}): GenerationRun {
  return {
    id: `run-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    kind: args.kind,
    createdAtLabel: `${args.results[0]?.width ?? args.settingsSnapshot.width} × ${args.results[0]?.height ?? args.settingsSnapshot.height}`,
    cost: args.cost,
    settingsSnapshot: cloneSnapshot(args.settingsSnapshot),
    results: args.results.map((result) => ({
      ...result,
      asset: cloneImageAsset(result.asset),
    })),
    sourceRunId: args.sourceRunId ?? null,
    sourceResultId: args.sourceResultId ?? null,
  }
}

interface ManagedGenerationAssetSummary {
  id: string
  kind: string
  mimeType: string
  byteSize: number
  originalFilename: string | null
  contentPath: string
  createdAt: string
}

interface ManagedGenerationOutput {
  index: number
  asset: ManagedGenerationAssetSummary
}

interface ManagedGenerationJob {
  id: string
  status: ManagedGenerationStatus
  estimatedNovelAiAnlas: number | null
  actualNovelAiAnlas: number | null
  billedPlatformUnits: number | null
  resultMimeType: string | null
  outputCount: number
  errorCode: string | null
  errorMessage: string | null
  outputs: ManagedGenerationOutput[]
}

interface ManagedGenerationEventBase {
  type: string
  jobId: string
  at: string
}

interface ManagedIntermediateOutputReadyEvent extends ManagedGenerationEventBase {
  type: "intermediate_output_ready"
  outputIndex: number
  stepIndex: number
  totalSteps: number | null
  sigma: number | null
  providerGenerationId: string | null
  mimeType: string
  imageBase64: string
}

type ManagedGenerationEvent =
  | (ManagedGenerationEventBase & { type: "queued"; position: number | null })
  | (ManagedGenerationEventBase & { type: "policy_applied" })
  | (ManagedGenerationEventBase & { type: "waiting_for_result_consumer" })
  | (ManagedGenerationEventBase & { type: "running" })
  | (ManagedGenerationEventBase & { type: "provider_progress"; message: string })
  | ManagedIntermediateOutputReadyEvent
  | (ManagedGenerationEventBase & { type: "output_ready"; outputIndex: number; outputCount: number })
  | (ManagedGenerationEventBase & { type: "billing_recorded" })
  | (ManagedGenerationEventBase & { type: "succeeded" | "failed" | "cancelled"; status: ManagedGenerationStatus; errorCode: string | null; errorMessage: string | null })

const managedGenerationEventNames = [
  "queued",
  "policy_applied",
  "waiting_for_result_consumer",
  "running",
  "provider_progress",
  "intermediate_output_ready",
  "output_ready",
  "billing_recorded",
  "succeeded",
  "failed",
  "cancelled",
] as const

function createManagedResultAsset(jobId: string, output: ManagedGenerationOutput): NovelAIImageAsset {
  return {
    id: output.asset.id,
    src: `/api/generations/${jobId}/results/${output.index}`,
    fileName: output.asset.originalFilename,
    origin: "result",
  }
}

function getManagedRunCost(job: ManagedGenerationJob, fallbackCost: number) {
  return job.actualNovelAiAnlas ?? job.estimatedNovelAiAnlas ?? fallbackCost
}

function getRequestErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return "Request failed."
}

function buildIntermediateProgressMessage(frame: GenerationIntermediateFrame) {
  const displayStep = frame.stepIndex + 1
  if (frame.totalSteps) {
    return `Step ${Math.min(displayStep, frame.totalSteps)} / ${frame.totalSteps}`
  }

  return `Step ${displayStep}`
}

function getGenerationEventTerminalMessage(status: ManagedGenerationStatus) {
  if (status === "SUCCEEDED") {
    return "Completed"
  }

  if (status === "CANCELLED") {
    return "Cancelled"
  }

  return "Failed"
}

async function createManagedGenerationJob(submission: {
  endpoint: string
  method: string
  body: BodyInit
  headers?: Record<string, string>
}) {
  const response = await fetch(submission.endpoint, {
    method: submission.method,
    body: submission.body,
    headers: submission.headers,
    credentials: "same-origin",
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return (await response.json()) as { jobId: string }
}

async function fetchManagedGenerationJob(jobId: string) {
  const response = await fetch(`/api/generations/${jobId}`, {
    cache: "no-store",
    credentials: "same-origin",
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  const payload = (await response.json()) as { job: ManagedGenerationJob }
  return payload.job
}

function parseManagedGenerationEvent(message: MessageEvent<string>) {
  return JSON.parse(message.data) as ManagedGenerationEvent
}

function waitForManagedGenerationJobEvents(jobId: string, onEvent: (event: ManagedGenerationEvent) => void) {
  return new Promise<void>((resolve, reject) => {
    const eventSource = new EventSource(`/api/generations/${jobId}/events`, { withCredentials: true })
    let settled = false

    const settle = (callback: () => void) => {
      if (settled) {
        return
      }
      settled = true
      eventSource.close()
      callback()
    }

    const handleEvent = (message: MessageEvent<string>) => {
      try {
        const event = parseManagedGenerationEvent(message)
        onEvent(event)
        if (event.type === "succeeded" || event.type === "failed" || event.type === "cancelled") {
          settle(resolve)
        }
      } catch (error) {
        settle(() => reject(error instanceof Error ? error : new Error("Generation event stream returned an invalid event.")))
      }
    }

    managedGenerationEventNames.forEach((eventName) => {
      eventSource.addEventListener(eventName, handleEvent as EventListener)
    })

    eventSource.onerror = () => settle(() => reject(new Error(`Generation event stream for ${jobId} disconnected.`)))
  })
}

function getRunStage(run: GenerationRun | null): NovelAIWorkspaceState["ui"]["stage"] {
  if (!run) {
    return "gallery"
  }

  if (run.kind === "variations") {
    return "variations"
  }

  if (run.results.length > 1) {
    return "result-grid"
  }

  return "single-result"
}

function getSelectedRun(document: NovelAIWorkspaceDocument) {
  return document.historyRuns.find((run) => run.id === document.selectedRunId) ?? document.historyRuns[0] ?? null
}

function getSelectedResult(document: NovelAIWorkspaceDocument) {
  const selectedRun = getSelectedRun(document)
  if (!selectedRun) {
    return null
  }

  return selectedRun.results.find((result) => result.id === document.selectedResultId) ?? selectedRun.results[0] ?? null
}

function reducer(state: NovelAIWorkspaceState, action: Action): NovelAIWorkspaceState {
  switch (action.type) {
    case "select-sample":
      return {
        ...state,
        document: {
          ...state.document,
          selectedSample: action.sample,
          basePrompt: action.sample.prompt,
          undesiredPrompt: action.sample.undesiredPrompt,
          width: action.sample.width,
          height: action.sample.height,
          imagePresetId: "normal-portrait",
        },
        ui: {
          ...state.ui,
          copiedSampleId: action.sample.id,
          quickstartPromptUndoSnapshot: buildQuickstartPromptUndoSnapshot(state.document),
        },
      }
    case "set-copied-sample":
      return {
        ...state,
        ui: {
          ...state.ui,
          copiedSampleId: action.id,
        },
      }
    case "undo-quickstart-prompt-selection": {
      const snapshot = state.ui.quickstartPromptUndoSnapshot
      if (!snapshot) {
        return state
      }

      return {
        ...state,
        document: {
          ...state.document,
          selectedSample: snapshot.selectedSample,
          basePrompt: snapshot.basePrompt,
          undesiredPrompt: snapshot.undesiredPrompt,
          imagePresetId: snapshot.imagePresetId,
          width: snapshot.width,
          height: snapshot.height,
        },
        ui: {
          ...state.ui,
          copiedSampleId: null,
          quickstartPromptUndoSnapshot: null,
        },
      }
    }
    case "restore-persisted-settings":
      return {
        ...state,
        document: restoreDocumentFromPersistedSettings(state.document, action.document),
      }
    case "set-base-prompt":
      return {
        ...state,
        document: { ...state.document, basePrompt: action.value },
        ui: { ...state.ui, quickstartPromptUndoSnapshot: null },
      }
    case "set-undesired-prompt":
      return {
        ...state,
        document: { ...state.document, undesiredPrompt: action.value },
        ui: { ...state.ui, quickstartPromptUndoSnapshot: null },
      }
    case "set-prompt-editor-tab":
      return { ...state, ui: { ...state.ui, promptEditorTab: action.value } }
    case "toggle-prompt-tag-suggestion-mode":
      return {
        ...state,
        ui: {
          ...state.ui,
          promptTagSuggestionMode: state.ui.promptTagSuggestionMode === "default" ? "furry" : "default",
        },
      }
    case "set-prompt-attached":
      return { ...state, document: { ...state.document, promptAttached: action.value } }
    case "toggle-prompt-settings":
      return { ...state, ui: { ...state.ui, promptSettingsOpen: !state.ui.promptSettingsOpen } }
    case "close-prompt-settings":
      return { ...state, ui: { ...state.ui, promptSettingsOpen: false } }
    case "set-prompt-settings-tab":
      return { ...state, ui: { ...state.ui, promptSettingsTab: action.value } }
    case "toggle-quality-tags":
      return { ...state, document: { ...state.document, addQualityTags: !state.document.addQualityTags } }
    case "toggle-disable-tag-suggestions":
      return { ...state, ui: { ...state.ui, disableTagSuggestions: !state.ui.disableTagSuggestions } }
    case "toggle-highlight-emphasis":
      return { ...state, document: { ...state.document, highlightEmphasis: !state.document.highlightEmphasis } }
    case "set-undesired-preset":
      return {
        ...state,
        document: { ...state.document, undesiredPreset: action.value },
        ui: { ...state.ui, undesiredPresetMenuOpen: false },
      }
    case "toggle-add-character-menu":
      if (!supportsNovelAICharacterPrompts(state.document.imageModelId)) {
        return state
      }
      return { ...state, ui: { ...state.ui, addCharacterMenuOpen: !state.ui.addCharacterMenuOpen } }
    case "close-add-character-menu":
      return { ...state, ui: { ...state.ui, addCharacterMenuOpen: false } }
    case "toggle-image-model-menu":
      return { ...state, ui: { ...state.ui, imageModelMenuOpen: !state.ui.imageModelMenuOpen } }
    case "close-image-model-menu":
      return { ...state, ui: { ...state.ui, imageModelMenuOpen: false } }
    case "set-image-model":
      return {
        ...state,
        document: { ...state.document, imageModelId: action.modelId },
        ui: {
          ...state.ui,
          imageModelMenuOpen: false,
          addCharacterMenuOpen: supportsNovelAICharacterPrompts(action.modelId) ? state.ui.addCharacterMenuOpen : false,
        },
      }
    case "toggle-undesired-preset-menu":
      return { ...state, ui: { ...state.ui, undesiredPresetMenuOpen: !state.ui.undesiredPresetMenuOpen } }
    case "toggle-image-preset-menu":
      return { ...state, ui: { ...state.ui, imagePresetMenuOpen: !state.ui.imagePresetMenuOpen } }
    case "close-image-preset-menu":
      return { ...state, ui: { ...state.ui, imagePresetMenuOpen: false } }
    case "add-character": {
      if (!supportsNovelAICharacterPrompts(state.document.imageModelId)) {
        return state
      }
      const nextIndex = state.document.characters.length + 1
      const nextCharacter = buildCharacterState(action.template, nextIndex)
      return {
        ...state,
        document: {
          ...state.document,
          characters: state.document.characters.map((character) => ({ ...character, isExpanded: false })).concat(nextCharacter),
        },
        ui: {
          ...state.ui,
          addCharacterMenuOpen: false,
        },
      }
    }
    case "remove-character":
      return {
        ...state,
        document: {
          ...state.document,
          characters: state.document.characters.filter((character) => character.id !== action.id),
        },
      }
    case "move-character":
      return {
        ...state,
        document: {
          ...state.document,
          characters: moveCharacter(state.document.characters, action.id, action.direction),
        },
      }
    case "toggle-character-expanded":
      return {
        ...state,
        document: {
          ...state.document,
          characters: state.document.characters.map((character) =>
            character.id === action.id
              ? { ...character, isExpanded: !character.isExpanded }
              : { ...character, isExpanded: false }
          ),
        },
      }
    case "toggle-character-enabled":
      return {
        ...state,
        document: {
          ...state.document,
          characters: state.document.characters.map((character) =>
            character.id === action.id ? { ...character, enabled: !character.enabled } : character
          ),
        },
      }
    case "set-character-tab":
      return {
        ...state,
        document: {
          ...state.document,
          characters: state.document.characters.map((character) =>
            character.id === action.id ? { ...character, activeTab: action.tab, isExpanded: true } : character
          ),
        },
      }
    case "set-character-prompt":
      return {
        ...state,
        document: {
          ...state.document,
          characters: state.document.characters.map((character) =>
            character.id === action.id
              ? {
                  ...character,
                  prompt: action.value,
                  tokens: estimatePromptTokens(action.value),
                }
              : character
          ),
        },
      }
    case "set-character-undesired-prompt":
      return {
        ...state,
        document: {
          ...state.document,
          characters: state.document.characters.map((character) =>
            character.id === action.id ? { ...character, undesiredPrompt: action.value } : character
          ),
        },
      }
    case "set-character-position-mode":
      return {
        ...state,
        document: {
          ...state.document,
          characters: state.document.characters.map((character) =>
            character.id === action.id
              ? {
                  ...character,
                  positionMode: action.value,
                  positionCell: action.value === "ai_choice" ? null : character.positionCell,
                }
              : character
          ),
        },
      }
    case "set-character-position-cell":
      return {
        ...state,
        document: {
          ...state.document,
          characters: state.document.characters.map((character) =>
            character.id === action.id
              ? {
                  ...character,
                  positionCell: action.value,
                  positionMode: action.value === null ? "ai_choice" : "custom",
                }
              : character
          ),
        },
      }
    case "set-base-image-source":
      return {
        ...state,
        document: {
          ...state.document,
          baseImageSource: cloneBaseImageSource(action.source),
        },
      }
    case "add-vibe-reference":
      return {
        ...state,
        document: {
          ...state.document,
          vibeTransfer: {
            ...state.document.vibeTransfer,
            references: state.document.vibeTransfer.references.concat(action.reference),
          },
        },
      }
    case "add-precise-reference":
      if (!supportsNovelAIPreciseReference(state.document.imageModelId)) {
        return state
      }
      return {
        ...state,
        document: {
          ...state.document,
          preciseReferences: {
            references: state.document.preciseReferences.references.concat(action.reference),
          },
        },
      }
    case "remove-upload": {
      if (action.key === "baseImage") {
        return {
          ...state,
          document: {
            ...state.document,
            baseImageSource: { kind: "none" },
          },
        }
      }

      if (action.key === "vibeTransfer") {
        const nextReferences = action.id
          ? state.document.vibeTransfer.references.filter((reference) => reference.id !== action.id)
          : state.document.vibeTransfer.references.slice(0, -1)

        return {
          ...state,
          document: {
            ...state.document,
            vibeTransfer: {
              ...state.document.vibeTransfer,
              references: nextReferences,
            },
          },
        }
      }

      const nextReferences = action.id
        ? state.document.preciseReferences.references.filter((reference) => reference.id !== action.id)
        : state.document.preciseReferences.references.slice(0, -1)

      return {
        ...state,
        document: {
          ...state.document,
          preciseReferences: {
            references: nextReferences,
          },
        },
      }
    }
    case "set-img2img-strength":
      return {
        ...state,
        document: {
          ...state.document,
          img2img: {
            ...state.document.img2img,
            strength: action.value,
          },
        },
      }
    case "set-img2img-noise":
      return {
        ...state,
        document: {
          ...state.document,
          img2img: {
            ...state.document.img2img,
            noise: action.value,
          },
        },
      }
    case "toggle-vibe-normalize":
      return {
        ...state,
        document: {
          ...state.document,
          vibeTransfer: {
            ...state.document.vibeTransfer,
            normalizeReferenceStrengthValues: !state.document.vibeTransfer.normalizeReferenceStrengthValues,
          },
        },
      }
    case "set-vibe-reference-strength":
      return {
        ...state,
        document: {
          ...state.document,
          vibeTransfer: {
            ...state.document.vibeTransfer,
            references: state.document.vibeTransfer.references.map((reference) =>
              reference.id === action.id ? { ...reference, referenceStrength: action.value } : reference
            ),
          },
        },
      }
    case "set-vibe-reference-information":
      return {
        ...state,
        document: {
          ...state.document,
          vibeTransfer: {
            ...state.document.vibeTransfer,
            references: state.document.vibeTransfer.references.map((reference) =>
              reference.id === action.id ? { ...reference, informationExtracted: action.value } : reference
            ),
          },
        },
      }
    case "set-precise-reference-enabled":
      return {
        ...state,
        document: {
          ...state.document,
          preciseReferences: {
            references: state.document.preciseReferences.references.map((reference) =>
              reference.id === action.id ? { ...reference, enabled: action.value } : reference
            ),
          },
        },
      }
    case "set-precise-reference-kind":
      return {
        ...state,
        document: {
          ...state.document,
          preciseReferences: {
            references: state.document.preciseReferences.references.map((reference) =>
              reference.id === action.id ? { ...reference, kind: action.value } : reference
            ),
          },
        },
      }
    case "set-precise-reference-strength":
      return {
        ...state,
        document: {
          ...state.document,
          preciseReferences: {
            references: state.document.preciseReferences.references.map((reference) =>
              reference.id === action.id ? { ...reference, strength: action.value } : reference
            ),
          },
        },
      }
    case "set-precise-reference-fidelity":
      return {
        ...state,
        document: {
          ...state.document,
          preciseReferences: {
            references: state.document.preciseReferences.references.map((reference) =>
              reference.id === action.id ? { ...reference, fidelity: action.value } : reference
            ),
          },
        },
      }
    case "open-image-editor":
      return { ...state, ui: { ...state.ui, imageEditorOpen: true, imageEditorMode: action.mode, imageEditorBrushSize: action.mode === "edit" ? 20 : 4 } }
    case "close-image-editor":
      return { ...state, ui: { ...state.ui, imageEditorOpen: false } }
    case "set-image-editor-brush-size":
      return { ...state, ui: { ...state.ui, imageEditorBrushSize: Number.isFinite(action.value) ? Math.min(Math.max(Math.round(action.value), novelAIImageEditorBrushMin), 100) : novelAIImageEditorBrushMin } }
    case "set-image-preset": {
      const preset = imagePresets.find((item) => item.id === action.presetId)
      if (!preset) {
        return state
      }

      return {
        ...state,
        document: {
          ...state.document,
          imagePresetId: preset.id,
          width: preset.width,
          height: preset.height,
        },
        ui: {
          ...state.ui,
          imagePresetMenuOpen: false,
        },
      }
    }
    case "set-width": {
      const nextWidth = action.value
      const nextHeight = state.document.height
      return {
        ...state,
        document: {
          ...state.document,
          width: nextWidth,
          imagePresetId: findMatchingImagePresetId(nextWidth, nextHeight),
        },
      }
    }
    case "set-height": {
      const nextWidth = state.document.width
      const nextHeight = action.value
      return {
        ...state,
        document: {
          ...state.document,
          height: nextHeight,
          imagePresetId: findMatchingImagePresetId(nextWidth, nextHeight),
        },
      }
    }
    case "swap-dimensions": {
      const nextWidth = state.document.height
      const nextHeight = state.document.width
      return {
        ...state,
        document: {
          ...state.document,
          width: nextWidth,
          height: nextHeight,
          imagePresetId: findMatchingImagePresetId(nextWidth, nextHeight),
        },
      }
    }
    case "set-image-count":
      return { ...state, document: { ...state.document, imageCount: action.value } }
    case "set-steps":
      return { ...state, document: { ...state.document, steps: action.value } }
    case "set-guidance":
      return { ...state, document: { ...state.document, guidance: action.value } }
    case "toggle-variety-plus":
      return { ...state, document: { ...state.document, varietyPlus: !state.document.varietyPlus } }
    case "set-seed":
      return { ...state, document: { ...state.document, seed: action.value } }
    case "toggle-sampler-menu":
      return { ...state, ui: { ...state.ui, samplerMenuOpen: !state.ui.samplerMenuOpen } }
    case "set-sampler":
      return {
        ...state,
        document: { ...state.document, sampler: action.value },
        ui: { ...state.ui, samplerMenuOpen: false },
      }
    case "set-prompt-guidance-rescale":
      return { ...state, document: { ...state.document, promptGuidanceRescale: action.value } }
    case "toggle-noise-schedule-menu":
      return { ...state, ui: { ...state.ui, noiseScheduleMenuOpen: !state.ui.noiseScheduleMenuOpen } }
    case "set-noise-schedule":
      return {
        ...state,
        document: { ...state.document, noiseSchedule: action.value },
        ui: { ...state.ui, noiseScheduleMenuOpen: false },
      }
    case "toggle-advanced-image-settings":
      return { ...state, ui: { ...state.ui, advancedImageSettingsOpen: !state.ui.advancedImageSettingsOpen } }
    case "toggle-ai-settings-advanced":
      return { ...state, ui: { ...state.ui, aiSettingsAdvancedOpen: !state.ui.aiSettingsAdvancedOpen } }
    case "set-request-error":
      return { ...state, ui: { ...state.ui, requestErrorMessage: action.message } }
    case "clear-request-error":
      return { ...state, ui: { ...state.ui, requestErrorMessage: null } }
    case "start-generating":
      return {
        ...state,
        ui: {
          ...state.ui,
          activeMobilePanel: null,
          requestErrorMessage: null,
          generationJobStatus: "QUEUED",
          generationProgressMessage: "Queued",
          generationIntermediateFrames: [],
          generationTargetImageCount: action.imageCount,
          generationTargetWidth: action.width,
          generationTargetHeight: action.height,
          stage: "generating",
        },
      }
    case "set-generation-job-status":
      return {
        ...state,
        ui: {
          ...state.ui,
          generationJobStatus: action.status,
        },
      }
    case "set-generation-progress-message":
      return {
        ...state,
        ui: {
          ...state.ui,
          generationProgressMessage: action.message,
        },
      }
    case "upsert-generation-intermediate-frame": {
      const existingIndex = state.ui.generationIntermediateFrames.findIndex((frame) => frame.outputIndex === action.frame.outputIndex)
      const nextFrames = existingIndex === -1
        ? state.ui.generationIntermediateFrames.concat(action.frame)
        : state.ui.generationIntermediateFrames.map((frame, index) => index === existingIndex ? action.frame : frame)
      return {
        ...state,
        ui: {
          ...state.ui,
          generationJobStatus: "RUNNING",
          generationProgressMessage: buildIntermediateProgressMessage(action.frame),
          generationIntermediateFrames: nextFrames,
        },
      }
    }
    case "set-stage":
      return {
        ...state,
        ui: {
          ...state.ui,
          generationJobStatus: null,
          generationProgressMessage: null,
          generationIntermediateFrames: [],
          stage: action.stage,
        },
      }
    case "toggle-history-rail-hidden":
      return { ...state, ui: { ...state.ui, historyRailHidden: !state.ui.historyRailHidden } }
    case "open-mobile-panel":
      return { ...state, ui: { ...state.ui, activeMobilePanel: action.value } }
    case "close-mobile-panel":
      return {
        ...state,
        ui: {
          ...state.ui,
          activeMobilePanel: null,
          addCharacterMenuOpen: false,
          imageModelMenuOpen: false,
          undesiredPresetMenuOpen: false,
          imagePresetMenuOpen: false,
          samplerMenuOpen: false,
          noiseScheduleMenuOpen: false,
        },
      }
    case "commit-run":
      return {
        ...state,
        document: {
          ...state.document,
          historyRuns: [action.run, ...state.document.historyRuns],
          selectedRunId: action.run.id,
          selectedResultId: action.run.results[0]?.id ?? null,
          enhanceDraft: null,
        },
        ui: {
          ...state.ui,
          activeMobilePanel: null,
          requestErrorMessage: null,
          generationJobStatus: null,
          generationProgressMessage: null,
          generationIntermediateFrames: [],
          stage: action.stage,
        },
      }
    case "select-run": {
      const selectedRun = state.document.historyRuns.find((run) => run.id === action.runId) ?? null
      return {
        ...state,
        document: {
          ...state.document,
          selectedRunId: action.runId,
          selectedResultId: action.resultId ?? selectedRun?.results[0]?.id ?? null,
          enhanceDraft: null,
        },
        ui: {
          ...state.ui,
          stage: getRunStage(selectedRun),
        },
      }
    }
    case "apply-history-settings": {
      const selectedRun = state.document.historyRuns.find((run) => run.id === action.runId)
      if (!selectedRun) {
        return state
      }

      const snapshot = selectedRun.settingsSnapshot
      return {
        ...state,
        document: restoreDocumentFromSnapshot(state.document, snapshot),
      }
    }
    case "clear-history":
      return {
        ...state,
        document: {
          ...state.document,
          historyRuns: [],
          selectedRunId: null,
          selectedResultId: null,
          enhanceDraft: null,
        },
        ui: {
          ...state.ui,
          stage: "gallery",
        },
      }
    case "back-to-gallery":
      return {
        ...state,
        document: {
          ...state.document,
          enhanceDraft: null,
        },
        ui: {
          ...state.ui,
          stage: "gallery",
        },
      }
    case "start-enhance": {
      const selectedRun = getSelectedRun(state.document)
      const selectedResult = getSelectedResult(state.document)
      if (!selectedRun || !selectedResult) {
        return state
      }

      return {
        ...state,
        document: {
          ...state.document,
          enhanceDraft: {
            sourceRunId: selectedRun.id,
            sourceResultId: selectedResult.id,
            scale: "1x",
            magnitude: 2,
            showAdvanced: false,
            strength: 0.5,
            noise: 0,
          },
        },
        ui: {
          ...state.ui,
          stage: "enhance",
        },
      }
    }
    case "cancel-enhance": {
      const selectedRun = getSelectedRun(state.document)
      return {
        ...state,
        document: {
          ...state.document,
          enhanceDraft: null,
        },
        ui: {
          ...state.ui,
          stage: getRunStage(selectedRun),
        },
      }
    }
    case "set-enhance-scale":
      return state.document.enhanceDraft
        ? {
            ...state,
            document: {
              ...state.document,
              enhanceDraft: {
                ...state.document.enhanceDraft,
                scale: action.value,
              },
            },
          }
        : state
    case "set-enhance-magnitude":
      return state.document.enhanceDraft
        ? {
            ...state,
            document: {
              ...state.document,
              enhanceDraft: {
                ...state.document.enhanceDraft,
                magnitude: action.value,
              },
            },
          }
        : state
    case "toggle-enhance-advanced":
      return state.document.enhanceDraft
        ? {
            ...state,
            document: {
              ...state.document,
              enhanceDraft: {
                ...state.document.enhanceDraft,
                showAdvanced: !state.document.enhanceDraft.showAdvanced,
              },
            },
          }
        : state
    default:
      return state
  }
}

export function useNovelAIWorkspaceState() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const previewUrls = useRef<Record<string, string>>({})
  const hasLoadedPersistedSettings = useRef(false)

  const revokePreviewUrl = (assetId: string) => {
    const url = previewUrls.current[assetId]
    if (url?.startsWith("blob:")) {
      URL.revokeObjectURL(url)
    }
    delete previewUrls.current[assetId]
  }

  useEffect(() => {
    const urlsRef = previewUrls

    return () => {
      Object.keys(urlsRef.current).forEach((assetId) => {
        const url = urlsRef.current[assetId]
        if (url?.startsWith("blob:")) {
          URL.revokeObjectURL(url)
        }
        delete urlsRef.current[assetId]
      })
    }
  }, [])

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(workspaceSettingsStorageKey)
      const persistedSettings = storedValue ? parsePersistedWorkspaceSettings(storedValue) : null
      const frameId = window.requestAnimationFrame(() => {
        if (persistedSettings) {
          dispatch({ type: "restore-persisted-settings", document: persistedSettings.document })
        }
        hasLoadedPersistedSettings.current = true
      })

      return () => window.cancelAnimationFrame(frameId)
    } catch {
      hasLoadedPersistedSettings.current = true
    }
  }, [])

  useEffect(() => {
    if (!hasLoadedPersistedSettings.current) {
      return
    }

    window.localStorage.setItem(workspaceSettingsStorageKey, JSON.stringify(buildPersistedWorkspaceSettings(state.document)))
  }, [state.document])

  useEffect(() => {
    if (!state.ui.copiedSampleId) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      dispatch({ type: "set-copied-sample", id: null })
    }, 900)

    return () => window.clearTimeout(timeoutId)
  }, [state.ui.copiedSampleId])

  const selectedSample = state.document.selectedSample

  const selectedRun = useMemo(() => getSelectedRun(state.document), [state.document])

  const selectedResult = useMemo(() => getSelectedResult(state.document), [state.document])

  const effectiveBasePrompt = useMemo(
    () => buildEffectiveBasePrompt(state.document.basePrompt, state.document.addQualityTags),
    [state.document.basePrompt, state.document.addQualityTags]
  )

  const effectiveUndesiredPrompt = useMemo(
    () => buildEffectiveUndesiredPrompt(state.document.undesiredPrompt, state.document.undesiredPreset),
    [state.document.undesiredPrompt, state.document.undesiredPreset]
  )

  const handleGenerationEvent = (event: ManagedGenerationEvent) => {
    if (event.type === "queued") {
      dispatch({ type: "set-generation-job-status", status: "QUEUED" })
      dispatch({ type: "set-generation-progress-message", message: "Queued" })
      return
    }

    if (event.type === "policy_applied") {
      dispatch({ type: "set-generation-progress-message", message: "Generation policy applied" })
      return
    }

    if (event.type === "waiting_for_result_consumer") {
      dispatch({ type: "set-generation-job-status", status: "WAITING_FOR_RESULT_CONSUMER" })
      dispatch({ type: "set-generation-progress-message", message: "Preparing result stream" })
      return
    }

    if (event.type === "running") {
      dispatch({ type: "set-generation-job-status", status: "RUNNING" })
      dispatch({ type: "set-generation-progress-message", message: "Generation started" })
      return
    }

    if (event.type === "provider_progress") {
      dispatch({ type: "set-generation-progress-message", message: event.message })
      return
    }

    if (event.type === "intermediate_output_ready") {
      dispatch({
        type: "upsert-generation-intermediate-frame",
        frame: {
          imageBase64: event.imageBase64,
          mimeType: event.mimeType,
          outputIndex: event.outputIndex,
          providerGenerationId: event.providerGenerationId,
          receivedAt: event.at,
          sigma: event.sigma,
          stepIndex: event.stepIndex,
          totalSteps: event.totalSteps,
        },
      })
      return
    }

    if (event.type === "output_ready") {
      dispatch({ type: "set-generation-progress-message", message: `Output ${event.outputIndex + 1} / ${event.outputCount} ready` })
      return
    }

    if (event.type === "billing_recorded") {
      dispatch({ type: "set-generation-progress-message", message: "Recording Anlas usage" })
      return
    }

    dispatch({ type: "set-generation-job-status", status: event.status })
    dispatch({ type: "set-generation-progress-message", message: event.errorMessage ?? getGenerationEventTerminalMessage(event.status) })
  }

  const handleSelectSample = (sample: QuickstartSample) => {
    dispatch({ type: "select-sample", sample })

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(sample.prompt)
    }
  }

  const handleRandomize = () => {
    dispatch({ type: "set-base-prompt", value: buildRandomPrompt() })
  }

  const attachObjectUrl = (assetId: string, url: string) => {
    revokePreviewUrl(assetId)
    previewUrls.current[assetId] = url
  }

  const handleUpload = (key: UploadSlotKey, file: File | null) => {
    if (!file) {
      return
    }

    const previewUrl = URL.createObjectURL(file)

    if (key === "baseImage") {
      const previousSource = state.document.baseImageSource
      if (previousSource.kind !== "none") {
        revokePreviewUrl(previousSource.asset.id)
      }

      const asset = createAssetFromUpload(file.name, previewUrl, "upload")
      attachObjectUrl(asset.id, previewUrl)
      dispatch({
        type: "set-base-image-source",
        source: {
          kind: "upload",
          asset,
        },
      })
      return
    }

    if (key === "vibeTransfer") {
      const asset = createAssetFromUpload(file.name, previewUrl, "upload")
      attachObjectUrl(asset.id, previewUrl)
      dispatch({
        type: "add-vibe-reference",
        reference: {
          id: `vibe-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          asset,
          identifier: `${file.name.replace(/\.[^.]+$/, "").slice(0, 6)}-${file.name.length.toString(16)}`,
          referenceStrength: 0.6,
          informationExtracted: 1,
        },
      })
      return
    }

    if (!supportsNovelAIPreciseReference(state.document.imageModelId)) {
      URL.revokeObjectURL(previewUrl)
      return
    }

    const asset = createAssetFromUpload(file.name, previewUrl, "upload")
    attachObjectUrl(asset.id, previewUrl)
    dispatch({
      type: "add-precise-reference",
      reference: {
        id: `precise-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        asset,
        enabled: true,
        kind: "character_style",
        strength: 1,
        fidelity: 1,
      },
    })
  }

  const handleSetUploadPreview = (key: UploadSlotKey, fileName: string, previewUrl: string) => {
    if (key === "baseImage") {
      const previousSource = state.document.baseImageSource
      if (previousSource.kind !== "none") {
        revokePreviewUrl(previousSource.asset.id)
      }
    }

    const asset = createAssetFromUpload(fileName, previewUrl, key === "baseImage" ? "canvas" : "upload")
    attachObjectUrl(asset.id, previewUrl)

    if (key === "baseImage") {
      dispatch({
        type: "set-base-image-source",
        source: {
          kind: "canvas",
          asset,
        },
      })
    }
  }

  const handleRemoveUpload = (key: UploadSlotKey, id?: string) => {
    if (key === "baseImage") {
      const currentSource = state.document.baseImageSource
      if (currentSource.kind !== "none") {
        revokePreviewUrl(currentSource.asset.id)
      }
      dispatch({ type: "remove-upload", key })
      return
    }

    const referenceCollection =
      key === "vibeTransfer" ? state.document.vibeTransfer.references : state.document.preciseReferences.references
    const reference = id
      ? referenceCollection.find((item) => item.id === id)
      : referenceCollection[referenceCollection.length - 1]

    if (reference) {
      revokePreviewUrl(reference.asset.id)
    }

    dispatch({ type: "remove-upload", key, id })
  }

  const handleGenerate = () => {
    const previousStage = state.ui.stage
    dispatch({
      type: "start-generating",
      imageCount: state.document.imageCount,
      width: state.document.width,
      height: state.document.height,
    })

    void (async () => {
      try {
        const submission = await buildManagedGenerateSubmission({
          document: state.document,
          prompt: effectiveBasePrompt,
          undesiredPrompt: effectiveUndesiredPrompt,
        })
        const settingsSnapshot = {
          ...buildSettingsSnapshot(state.document),
          seed: submission.kind === "upscale" ? state.document.seed : String(submission.seed),
        }
        const { jobId } = await createManagedGenerationJob(submission)
        await waitForManagedGenerationJobEvents(jobId, handleGenerationEvent)
        const job = await fetchManagedGenerationJob(jobId)

        if (job.status !== "SUCCEEDED") {
          throw new Error(job.errorMessage ?? job.errorCode ?? `Generation job ended with status ${job.status}.`)
        }

        const run = createRun({
          kind: "generate",
          settingsSnapshot,
          results: job.outputs.map((output) => ({
            id: `${job.id}-output-${output.index}`,
            asset: createManagedResultAsset(job.id, output),
            width: settingsSnapshot.width,
            height: settingsSnapshot.height,
            role: "primary",
            label: null,
          })),
          cost: getManagedRunCost(job, estimateNovelAIGenerateAnlas(state.document).total),
        })

        dispatch({ type: "commit-run", run, stage: getRunStage(run) })
      } catch (error) {
        dispatch({ type: "set-stage", stage: previousStage })
        dispatch({ type: "set-request-error", message: getRequestErrorMessage(error) })
      }
    })()
  }

  const handleCreateVariations = () => {
    if (!selectedRun || !selectedResult) {
      return
    }

    const previousStage = state.ui.stage
    dispatch({
      type: "start-generating",
      imageCount: 3,
      width: state.document.width,
      height: state.document.height,
    })

    void (async () => {
      try {
        const submission = await buildManagedVariationsSubmission({
          document: state.document,
          prompt: effectiveBasePrompt,
          result: selectedResult,
          undesiredPrompt: effectiveUndesiredPrompt,
        })
        if (submission.kind === "upscale") {
          throw new Error("Unexpected upscale submission for variations.")
        }
        const settingsSnapshot = {
          ...buildSettingsSnapshot(state.document),
          seed: String(submission.seed),
        }
        const { jobId } = await createManagedGenerationJob(submission)
        await waitForManagedGenerationJobEvents(jobId, handleGenerationEvent)
        const job = await fetchManagedGenerationJob(jobId)

        if (job.status !== "SUCCEEDED") {
          throw new Error(job.errorMessage ?? job.errorCode ?? `Generation job ended with status ${job.status}.`)
        }

        const run = createRun({
          kind: "variations",
          settingsSnapshot,
          results: [
            {
              id: `${selectedResult.id}-variation-original`,
              asset: createDerivedAsset(selectedResult.asset, "variation-original"),
              width: selectedResult.width,
              height: selectedResult.height,
              role: "original" as const,
              label: "ORIGINAL",
            },
            ...job.outputs.map((output) => ({
              id: `${job.id}-output-${output.index}`,
              asset: createManagedResultAsset(job.id, output),
              width: settingsSnapshot.width,
              height: settingsSnapshot.height,
              role: "variation" as const,
              label: "x4",
            })),
          ],
          cost: getManagedRunCost(job, Math.max(selectedSample.cost, 28)),
          sourceRunId: selectedRun.id,
          sourceResultId: selectedResult.id,
        })

        dispatch({ type: "commit-run", run, stage: "variations" })
      } catch (error) {
        dispatch({ type: "set-stage", stage: previousStage })
        dispatch({ type: "set-request-error", message: getRequestErrorMessage(error) })
      }
    })()
  }

  const handleUpscaleSelectedResult = (factor: NovelAIUpscaleFactor) => {
    if (!selectedRun || !selectedResult) {
      return
    }

    const previousStage = state.ui.stage
    dispatch({
      type: "start-generating",
      imageCount: 1,
      width: selectedResult.width * factor,
      height: selectedResult.height * factor,
    })

    void (async () => {
      try {
        const submission = await buildManagedUpscaleSubmission({
          factor,
          model: state.document.imageModelId,
          result: selectedResult,
        })
        const settingsSnapshot = buildSettingsSnapshot(state.document)
        const { jobId } = await createManagedGenerationJob(submission)
        await waitForManagedGenerationJobEvents(jobId, handleGenerationEvent)
        const job = await fetchManagedGenerationJob(jobId)

        if (job.status !== "SUCCEEDED") {
          throw new Error(job.errorMessage ?? job.errorCode ?? `Generation job ended with status ${job.status}.`)
        }

        const run = createRun({
          kind: "upscale",
          settingsSnapshot,
          results: job.outputs.map((output) => ({
            id: `${job.id}-output-${output.index}`,
            asset: createManagedResultAsset(job.id, output),
            width: selectedResult.width * factor,
            height: selectedResult.height * factor,
            role: "upscaled",
            label: null,
          })),
          cost: getManagedRunCost(job, 7),
          sourceRunId: selectedRun.id,
          sourceResultId: selectedResult.id,
        })

        dispatch({ type: "commit-run", run, stage: "single-result" })
      } catch (error) {
        dispatch({ type: "set-stage", stage: previousStage })
        dispatch({ type: "set-request-error", message: getRequestErrorMessage(error) })
      }
    })()
  }

  const handleApplyEnhance = () => {
    if (!selectedRun || !selectedResult || !state.document.enhanceDraft) {
      return
    }

    const draft = state.document.enhanceDraft
    const dimensions = getEnhanceDimensions(selectedResult, draft)
    const previousStage = state.ui.stage
    dispatch({
      type: "start-generating",
      imageCount: 1,
      width: dimensions.width,
      height: dimensions.height,
    })

    void (async () => {
      try {
        const submission = await buildManagedEnhanceSubmission({
          document: state.document,
          draft,
          prompt: effectiveBasePrompt,
          result: selectedResult,
          undesiredPrompt: effectiveUndesiredPrompt,
        })
        if (submission.kind === "upscale") {
          throw new Error("Unexpected upscale submission for enhance.")
        }
        const settingsSnapshot = {
          ...buildSettingsSnapshot(state.document),
          seed: String(submission.seed),
        }
        const { jobId } = await createManagedGenerationJob(submission)
        await waitForManagedGenerationJobEvents(jobId, handleGenerationEvent)
        const job = await fetchManagedGenerationJob(jobId)

        if (job.status !== "SUCCEEDED") {
          throw new Error(job.errorMessage ?? job.errorCode ?? `Generation job ended with status ${job.status}.`)
        }

        const run = createRun({
          kind: "enhance",
          settingsSnapshot,
          results: job.outputs.map((output) => ({
            id: `${job.id}-output-${output.index}`,
            asset: createManagedResultAsset(job.id, output),
            width: dimensions.width,
            height: dimensions.height,
            role: "enhanced",
            label: null,
          })),
          cost: getManagedRunCost(job, 20),
          sourceRunId: selectedRun.id,
          sourceResultId: selectedResult.id,
        })

        dispatch({ type: "commit-run", run, stage: "single-result" })
      } catch (error) {
        dispatch({ type: "set-stage", stage: previousStage })
        dispatch({ type: "set-request-error", message: getRequestErrorMessage(error) })
      }
    })()
  }

  const handleUseSelectedResultAsBaseImage = () => {
    if (!selectedResult) {
      return
    }

    dispatch({
      type: "set-base-image-source",
      source: {
        kind: "result",
        asset: createDerivedAsset(selectedResult.asset, "base-image"),
      },
    })
  }

  const handleUseSelectedResultAsPreciseReference = () => {
    if (!selectedResult || !supportsNovelAIPreciseReference(state.document.imageModelId)) {
      return
    }

    dispatch({
      type: "add-precise-reference",
      reference: {
        id: `precise-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        asset: createDerivedAsset(selectedResult.asset, "precise-reference"),
        enabled: true,
        kind: "character_style",
        strength: 1,
        fidelity: 1,
      },
    })
  }

  const actions: NovelAIWorkspaceActions = {
    setBasePrompt: (value: string) => dispatch({ type: "set-base-prompt", value }),
    setUndesiredPrompt: (value: string) => dispatch({ type: "set-undesired-prompt", value }),
    setPromptEditorTab: (value: PromptEditorTab) => dispatch({ type: "set-prompt-editor-tab", value }),
    togglePromptTagSuggestionMode: () => dispatch({ type: "toggle-prompt-tag-suggestion-mode" }),
    setPromptAttached: (value: boolean) => dispatch({ type: "set-prompt-attached", value }),
    togglePromptSettings: () => dispatch({ type: "toggle-prompt-settings" }),
    closePromptSettings: () => dispatch({ type: "close-prompt-settings" }),
    setPromptSettingsTab: (value: PromptSettingsTab) => dispatch({ type: "set-prompt-settings-tab", value }),
    toggleQualityTags: () => dispatch({ type: "toggle-quality-tags" }),
    toggleDisableTagSuggestions: () => dispatch({ type: "toggle-disable-tag-suggestions" }),
    toggleHighlightEmphasis: () => dispatch({ type: "toggle-highlight-emphasis" }),
    setUndesiredPreset: (value: string) => dispatch({ type: "set-undesired-preset", value }),
    selectSample: handleSelectSample,
    randomizePrompt: handleRandomize,
    toggleAddCharacterMenu: () => dispatch({ type: "toggle-add-character-menu" }),
    closeAddCharacterMenu: () => dispatch({ type: "close-add-character-menu" }),
    toggleImageModelMenu: () => dispatch({ type: "toggle-image-model-menu" }),
    closeImageModelMenu: () => dispatch({ type: "close-image-model-menu" }),
    setImageModel: (modelId: string) => dispatch({ type: "set-image-model", modelId }),
    addCharacter: (template: CharacterTemplate) => dispatch({ type: "add-character", template }),
    removeCharacter: (id: string) => dispatch({ type: "remove-character", id }),
    moveCharacterUp: (id: string) => dispatch({ type: "move-character", id, direction: "up" }),
    moveCharacterDown: (id: string) => dispatch({ type: "move-character", id, direction: "down" }),
    toggleCharacterExpanded: (id: string) => dispatch({ type: "toggle-character-expanded", id }),
    toggleCharacterEnabled: (id: string) => dispatch({ type: "toggle-character-enabled", id }),
    setCharacterTab: (id: string, tab: CharacterPromptState["activeTab"]) => dispatch({ type: "set-character-tab", id, tab }),
    setCharacterPrompt: (id: string, value: string) => dispatch({ type: "set-character-prompt", id, value }),
    setCharacterUndesiredPrompt: (id: string, value: string) => dispatch({ type: "set-character-undesired-prompt", id, value }),
    setCharacterPositionMode: (id: string, value: CharacterPromptState["positionMode"]) => dispatch({ type: "set-character-position-mode", id, value }),
    setCharacterPositionCell: (id: string, value: number | null) => dispatch({ type: "set-character-position-cell", id, value }),
    setUpload: handleUpload,
    setUploadPreview: handleSetUploadPreview,
    removeUpload: handleRemoveUpload,
    setImg2ImgStrength: (value: number) => dispatch({ type: "set-img2img-strength", value }),
    setImg2ImgNoise: (value: number) => dispatch({ type: "set-img2img-noise", value }),
    toggleVibeNormalize: () => dispatch({ type: "toggle-vibe-normalize" }),
    setVibeReferenceStrength: (id: string, value: number) => dispatch({ type: "set-vibe-reference-strength", id, value }),
    setVibeReferenceInformation: (id: string, value: number) => dispatch({ type: "set-vibe-reference-information", id, value }),
    setPreciseReferenceEnabled: (id: string, value: boolean) => dispatch({ type: "set-precise-reference-enabled", id, value }),
    setPreciseReferenceKind: (id: string, value: PreciseReferenceKind) => dispatch({ type: "set-precise-reference-kind", id, value }),
    setPreciseReferenceStrength: (id: string, value: number) => dispatch({ type: "set-precise-reference-strength", id, value }),
    setPreciseReferenceFidelity: (id: string, value: number) => dispatch({ type: "set-precise-reference-fidelity", id, value }),
    openImageEditor: (mode: NovelAIImageEditorMode = "inpaint") => dispatch({ type: "open-image-editor", mode }),
    closeImageEditor: () => dispatch({ type: "close-image-editor" }),
    setImageEditorBrushSize: (value: number) => dispatch({ type: "set-image-editor-brush-size", value }),
    toggleUndesiredPresetMenu: () => dispatch({ type: "toggle-undesired-preset-menu" }),
    toggleImagePresetMenu: () => dispatch({ type: "toggle-image-preset-menu" }),
    closeImagePresetMenu: () => dispatch({ type: "close-image-preset-menu" }),
    setImagePreset: (presetId: string) => dispatch({ type: "set-image-preset", presetId }),
    setWidth: (value: number) => dispatch({ type: "set-width", value }),
    setHeight: (value: number) => dispatch({ type: "set-height", value }),
    swapDimensions: () => dispatch({ type: "swap-dimensions" }),
    setImageCount: (value: number) => dispatch({ type: "set-image-count", value }),
    setSteps: (value: number) => dispatch({ type: "set-steps", value }),
    setGuidance: (value: number) => dispatch({ type: "set-guidance", value }),
    toggleVarietyPlus: () => dispatch({ type: "toggle-variety-plus" }),
    setSeed: (value: string) => dispatch({ type: "set-seed", value }),
    toggleSamplerMenu: () => dispatch({ type: "toggle-sampler-menu" }),
    setSampler: (value: string) => dispatch({ type: "set-sampler", value }),
    setPromptGuidanceRescale: (value: number) => dispatch({ type: "set-prompt-guidance-rescale", value }),
    toggleNoiseScheduleMenu: () => dispatch({ type: "toggle-noise-schedule-menu" }),
    setNoiseSchedule: (value: string) => dispatch({ type: "set-noise-schedule", value }),
    toggleAdvancedImageSettings: () => dispatch({ type: "toggle-advanced-image-settings" }),
    toggleAiSettingsAdvanced: () => dispatch({ type: "toggle-ai-settings-advanced" }),
    toggleHistoryRailHidden: () => dispatch({ type: "toggle-history-rail-hidden" }),
    openMobilePanel: (value: MobilePanel) => dispatch({ type: "open-mobile-panel", value }),
    closeMobilePanel: () => dispatch({ type: "close-mobile-panel" }),
    generate: handleGenerate,
    selectRun: (runId: string, resultId?: string) => dispatch({ type: "select-run", runId, resultId }),
    applyHistorySettings: (runId: string) => dispatch({ type: "apply-history-settings", runId }),
    clearHistory: () => dispatch({ type: "clear-history" }),
    clearRequestError: () => dispatch({ type: "clear-request-error" }),
    undoQuickstartPromptSelection: () => dispatch({ type: "undo-quickstart-prompt-selection" }),
    backToGallery: () => dispatch({ type: "back-to-gallery" }),
    startEnhance: () => dispatch({ type: "start-enhance" }),
    cancelEnhance: () => dispatch({ type: "cancel-enhance" }),
    setEnhanceScale: (value: "1x" | "1.5x") => dispatch({ type: "set-enhance-scale", value }),
    setEnhanceMagnitude: (value: 1 | 2 | 3) => dispatch({ type: "set-enhance-magnitude", value }),
    toggleEnhanceAdvanced: () => dispatch({ type: "toggle-enhance-advanced" }),
    applyEnhance: handleApplyEnhance,
    createVariations: handleCreateVariations,
    upscaleSelectedResult: handleUpscaleSelectedResult,
    useSelectedResultAsBaseImage: handleUseSelectedResultAsBaseImage,
    useSelectedResultAsPreciseReference: handleUseSelectedResultAsPreciseReference,
  }

  return {
    actions,
    characterTemplates,
    effectiveBasePrompt,
    effectiveUndesiredPrompt,
    imageModelOptions,
    imagePresets,
    samplerOptions,
    selectedResult,
    selectedRun,
    selectedSample,
    state,
  }
}
