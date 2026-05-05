export type CharacterKind = "female" | "male" | "other"
export type CharacterTab = "prompt" | "undesired"
export type PromptEditorTab = "prompt" | "undesired"
export type PromptSettingsTab = "settings" | "prompt-chunks"
export type MobilePanel = "settings" | "history" | null
export type WorkspaceStage = "gallery" | "generating" | "single-result" | "result-grid" | "variations" | "enhance"
export type CharacterPositionMode = "ai_choice" | "adjust" | "custom"
export type PreciseReferenceKind = "character_style" | "character" | "style"
export type UploadSlotKey = "baseImage" | "vibeTransfer" | "preciseReference"
export type NovelAIImageEditorMode = "edit" | "inpaint"
export type GenerationRunKind = "generate" | "variations" | "upscale" | "enhance"
export type GenerationResultRole = "primary" | "original" | "variation" | "upscaled" | "enhanced"
export type NovelAIUpscaleFactor = 2 | 4

export interface QuickstartSample {
  id: string
  imageSrc: string
  previewImageSrc: string
  prompt: string
  undesiredPrompt: string
  width: number
  height: number
  cost: number
}

export interface PromptStat {
  label: string
  value: string
}

export interface NovelAIImageAsset {
  id: string
  src: string
  fileName: string | null
  origin: "sample" | "upload" | "canvas" | "result"
}

export type BaseImageSource =
  | { kind: "none" }
  | {
      kind: "upload" | "canvas" | "result"
      asset: NovelAIImageAsset
    }

export interface CharacterPromptState {
  id: string
  name: string
  type: CharacterKind
  prompt: string
  undesiredPrompt: string
  activeTab: CharacterTab
  isExpanded: boolean
  enabled: boolean
  tokens: number
  positionMode: CharacterPositionMode
  positionCell: number | null
}

export interface CharacterTemplate {
  id: CharacterKind
  label: string
  prompt: string
  undesiredPrompt: string
}

export interface VibeReference {
  id: string
  asset: NovelAIImageAsset
  identifier: string
  referenceStrength: number
  informationExtracted: number
}

export interface PreciseReference {
  id: string
  asset: NovelAIImageAsset
  enabled: boolean
  kind: PreciseReferenceKind
  strength: number
  fidelity: number
}

export interface VibeTransferState {
  normalizeReferenceStrengthValues: boolean
  references: VibeReference[]
}

export interface PreciseReferenceState {
  references: PreciseReference[]
}

export interface Img2ImgSettings {
  strength: number
  noise: number
}

export interface ImagePreset {
  id: string
  group: "NORMAL" | "LARGE" | "WALLPAPER" | "SMALL" | "CUSTOM"
  label: string
  menuLabel: string
  width: number
  height: number
}

export interface ImageModelOption {
  id: string
  group: "new" | "legacy"
  label: string
  description: string
}

export interface PromptChunkCategory {
  id: string
  name: string
  color: string
}

export interface PromptChunk {
  id: string
  name: string
  content: string
  color: string
  categoryId: string | null
}

export interface PromptChunkLibrary {
  categories: PromptChunkCategory[]
  chunks: PromptChunk[]
}

export interface GenerationSettingsSnapshot {
  addQualityTags: boolean
  baseImageSource: BaseImageSource
  basePrompt: string
  characters: CharacterPromptState[]
  guidance: number
  height: number
  highlightEmphasis: boolean
  imageCount: number
  img2img: Img2ImgSettings
  imageModelId: string
  imagePresetId: string
  noiseSchedule: string
  preciseReferences: PreciseReferenceState
  promptGuidanceRescale: number
  sampler: string
  seed: string
  steps: number
  undesiredPreset: string
  undesiredPrompt: string
  varietyPlus: boolean
  vibeTransfer: VibeTransferState
  width: number
}

export interface GenerationResult {
  id: string
  asset: NovelAIImageAsset
  width: number
  height: number
  role: GenerationResultRole
  label: string | null
}

export interface GenerationRun {
  id: string
  kind: GenerationRunKind
  createdAtLabel: string
  cost: number
  settingsSnapshot: GenerationSettingsSnapshot
  results: GenerationResult[]
  sourceRunId: string | null
  sourceResultId: string | null
}

export interface EnhanceDraft {
  sourceRunId: string
  sourceResultId: string
  scale: "1x" | "1.5x"
  magnitude: 1 | 2 | 3
  showAdvanced: boolean
  strength: number
  noise: number
}

export interface QuickstartPromptUndoSnapshot {
  selectedSample: QuickstartSample
  basePrompt: string
  undesiredPrompt: string
  imagePresetId: string
  width: number
  height: number
}

export interface NovelAIWorkspaceDocument {
  selectedSample: QuickstartSample
  basePrompt: string
  undesiredPrompt: string
  promptAttached: boolean
  addQualityTags: boolean
  undesiredPreset: string
  highlightEmphasis: boolean
  baseImageSource: BaseImageSource
  img2img: Img2ImgSettings
  characters: CharacterPromptState[]
  imageModelId: string
  imagePresetId: string
  width: number
  height: number
  imageCount: number
  steps: number
  guidance: number
  varietyPlus: boolean
  seed: string
  sampler: string
  promptGuidanceRescale: number
  noiseSchedule: string
  vibeTransfer: VibeTransferState
  preciseReferences: PreciseReferenceState
  historyRuns: GenerationRun[]
  selectedRunId: string | null
  selectedResultId: string | null
  enhanceDraft: EnhanceDraft | null
}

export type ManagedGenerationStatus = "QUEUED" | "WAITING_FOR_RESULT_CONSUMER" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED"

export interface GenerationIntermediateFrame {
  outputIndex: number
  stepIndex: number
  totalSteps: number | null
  sigma: number | null
  providerGenerationId: string | null
  mimeType: string
  imageBase64: string
  receivedAt: string
}

export interface NovelAIWorkspaceUiState {
  promptEditorTab: PromptEditorTab
  promptTagSuggestionMode: "default" | "furry"
  promptSettingsOpen: boolean
  promptSettingsTab: PromptSettingsTab
  disableTagSuggestions: boolean
  imageEditorOpen: boolean
  imageEditorMode: NovelAIImageEditorMode
  imageEditorBrushSize: number
  addCharacterMenuOpen: boolean
  imageModelMenuOpen: boolean
  advancedImageSettingsOpen: boolean
  aiSettingsAdvancedOpen: boolean
  undesiredPresetMenuOpen: boolean
  imagePresetMenuOpen: boolean
  samplerMenuOpen: boolean
  noiseScheduleMenuOpen: boolean
  copiedSampleId: string | null
  quickstartPromptUndoSnapshot: QuickstartPromptUndoSnapshot | null
  activeMobilePanel: MobilePanel
  historyRailHidden: boolean
  requestErrorMessage: string | null
  generationJobStatus: ManagedGenerationStatus | null
  generationProgressMessage: string | null
  generationIntermediateFrames: GenerationIntermediateFrame[]
  generationTargetImageCount: number
  generationTargetWidth: number
  generationTargetHeight: number
  stage: WorkspaceStage
}

export interface NovelAIWorkspaceState {
  document: NovelAIWorkspaceDocument
  ui: NovelAIWorkspaceUiState
}
