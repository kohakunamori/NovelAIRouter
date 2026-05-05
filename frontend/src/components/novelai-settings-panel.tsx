"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react"

import Image from "next/image"

import { Box, Brush, Crosshair, Droplets, Eraser, Image as LucideImageIcon, Lasso, Layers, Move3D, Palette, PaintBucket, Pipette, Redo2, Rotate3D, Scan, SlidersHorizontal, Undo2, FolderClosed, FolderPlus, KeyRound, Languages, LayoutDashboard, LogOut, Mars, Settings2, UserRound, Venus } from "lucide-react"

import { clampNovelAIImageEditorBrushSize, novelAIImageEditorBrushMax, novelAIImageEditorBrushMin, type NovelAIWorkspaceActions } from "@/lib/use-novelai-workspace-state"
import {
  getNovelAIPromptTokenLimit,
  initialPromptChunkCategories,
  initialPromptChunks,
  noiseScheduleOptions,
  qualityTagPrefix,
  supportsNovelAICharacterPrompts,
  supportsNovelAIPreciseReference,
  undesiredPresetMap,
  undesiredPresetOptions,
} from "@/lib/novelai-demo-data"
import {
  AnlasGemIcon,
  ChevronDownIcon,
  InfoCircleIcon,
  NovelAIArrowDownIcon,
  NovelAIArrowUpIcon,
  NovelAICheckIcon,
  NovelAIDetachIcon,
  NovelAIDiceIcon,
  NovelAIExportIcon,
  NovelAIImageCountIcon,
  NovelAIImportIcon,
  NovelAIHamburgerIcon,
  NovelAIPawIcon,
  NovelAIPenIcon,
  NovelAIPenTipIcon,
  NovelAIPreciseReferenceIcon,
  NovelAIPlusIcon,
  NovelAIResetIcon,
  NovelAISakuraIcon,
  NovelAITrashIcon,
  NovelAISettingsIcon,
  NovelAIThinCrossIcon,
  NovelAIVibeTransferIcon,
} from "@/components/icons"
import type { NovelAIAnlasEstimate } from "@/lib/novelai-anlas-estimator"
import { getPromptChunkLibrary, logout as logoutCurrentUser, updatePromptChunkLibrary } from "@/lib/novelai-admin-api"
import { novelAIUiLanguageOptions, useNovelAIUiLanguage, type NovelAIUiLanguage } from "@/lib/novelai-ui-language"
import { appendPromptFragment, cn, estimatePromptTokens } from "@/lib/utils"
import type { CharacterPromptState, CharacterTemplate, ImageModelOption, ImagePreset, NovelAIImageAsset, NovelAIImageEditorMode, NovelAIWorkspaceState, PromptChunk, PromptChunkCategory, PromptChunkLibrary, UploadSlotKey } from "@/types/novelai"

type NovelAIAccountState = "loading" | "anonymous" | "authenticated"

interface NovelAISettingsPanelContentProps {
  accountState: NovelAIAccountState
  actions: NovelAIWorkspaceActions
  anlas: number
  characterTemplates: CharacterTemplate[]
  desktopWidth?: number
  generateEstimate: NovelAIAnlasEstimate
  imageModelOptions: ImageModelOption[]
  imagePresets: ImagePreset[]
  isLooping?: boolean
  onCtrlGenerate?: () => void
  onRequestGenerate?: () => void
  samplerOptions: string[]
  state: NovelAIWorkspaceState
}

interface NovelAISettingsPanelProps extends NovelAISettingsPanelContentProps {
  accountState: NovelAIAccountState
  isAdmin: boolean
  isLooping: boolean
  onCtrlGenerate: () => void
  onLoggedOut: () => void
  onOpenLoginPanel: () => void
  onRequestGenerate: () => void
  onToggleShowStreamedImagesUnprocessed: () => void
  showStreamedImagesUnprocessed: boolean
}

type SuggestionField = "prompt" | "undesired"

interface TextInputChangeMeta {
  inputType: string | null
  isTrusted: boolean
}

interface PromptSuggestionOption {
  label: string
  confidence: number | null
}

interface PromptSuggestionsState {
  field: SuggestionField
  prompt: string
  suggestions: PromptSuggestionOption[]
  isLoading: boolean
}

interface PromptTokenMeterSegment {
  color: string
  id: string
  label: string
  tokens: number
}

interface PendingSuggestionRequest {
  field: SuggestionField
  fragment: string
  key: string
}

function isSuggestionRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function normalizeSuggestionConfidence(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null
  }

  if (value > 1) {
    return Math.max(0, Math.min(value / 100, 1))
  }

  return Math.max(0, Math.min(value, 1))
}

function normalizeSuggestionItem(item: unknown): PromptSuggestionOption | null {
  if (typeof item === "string") {
    return { label: item, confidence: null }
  }

  if (!isSuggestionRecord(item)) {
    return null
  }

  const label = item.label ?? item.tag ?? item.value ?? item.text
  if (typeof label !== "string") {
    return null
  }

  return {
    label,
    confidence: normalizeSuggestionConfidence(item.confidence ?? item.score ?? item.weight ?? item.probability),
  }
}

function sortPromptSuggestionsByConfidence(suggestions: PromptSuggestionOption[]) {
  return [...suggestions].sort((left, right) => {
    if (left.confidence === null && right.confidence === null) {
      return left.label.localeCompare(right.label)
    }

    if (left.confidence === null) {
      return 1
    }

    if (right.confidence === null) {
      return -1
    }

    if (left.confidence !== right.confidence) {
      return right.confidence - left.confidence
    }

    return left.label.localeCompare(right.label)
  })
}

function normalizePromptSuggestionsPayload(payload: unknown): PromptSuggestionOption[] {
  if (Array.isArray(payload)) {
    return sortPromptSuggestionsByConfidence(payload.map(normalizeSuggestionItem).filter((item): item is PromptSuggestionOption => Boolean(item)))
  }

  if (!isSuggestionRecord(payload)) {
    return []
  }

  const rawSuggestions = [payload.suggestions, payload.tags, payload.data, payload.results].find(Array.isArray) ?? []

  return sortPromptSuggestionsByConfidence(rawSuggestions.map(normalizeSuggestionItem).filter((item): item is PromptSuggestionOption => Boolean(item)))
}

type PromptChunkSyncStatus = "loading" | "saving" | "synced" | "local"

interface PromptChunkSyncState {
  label: string
  status: PromptChunkSyncStatus
}

type PromptChunkPanelMode =
  | { kind: "list" }
  | { kind: "new-category" }
  | { kind: "edit-category"; categoryId: string }
  | { kind: "new-chunk"; categoryId: string | null }
  | { kind: "edit-chunk"; chunkId: string }

const promptChunkStorageKey = "novelai.prompt-chunks.v1"
const promptChunkDragType = "application/x-novelai-prompt-chunk"
const promptChunkCategoryDragType = "application/x-novelai-prompt-category"
const defaultPromptChunkColor = "#6B7280"
const promptChunkRemoteSaveDelayMs = 600
const promptTokenBaseSegmentColor = "rgb(255, 255, 255)"
const promptTokenCharacterSegmentColors = [
  "rgb(151, 115, 255)",
  "rgb(86, 134, 135)",
  "rgb(245, 190, 120)",
  "rgb(232, 122, 170)",
]

const leftRailMenuCopy = {
  en: {
    account: "Account",
    accountSettings: "Account Settings",
    adminPage: "Admin Page",
    administrator: "Administrator",
    anonymousTrial: "Anonymous Trial",
    author: "Author",
    language: "Language",
    layoutSettings: "Layout Settings",
    login: "Log in",
    logout: "Logout",
    management: "Management",
    memberTrial: "Member Trial",
    settings: "Settings",
  },
  zh: {
    account: "账户",
    accountSettings: "账户设置",
    adminPage: "管理后台",
    administrator: "管理员",
    anonymousTrial: "匿名试用",
    author: "创作者",
    language: "语言",
    layoutSettings: "布局设置",
    login: "登录",
    logout: "退出登录",
    management: "管理",
    memberTrial: "会员试用",
    settings: "设置",
  },
} satisfies Record<NovelAIUiLanguage, Record<string, string>>

function buildDefaultPromptChunkLibrary(): PromptChunkLibrary {
  return {
    categories: initialPromptChunkCategories.map((category) => ({ ...category })),
    chunks: initialPromptChunks.map((chunk) => ({ ...chunk })),
  }
}

function normalizePromptChunkLibrary(value: unknown): PromptChunkLibrary | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const record = value as Record<string, unknown>
  const parsedCategories = Array.isArray(record.categories) ? record.categories : null
  const parsedChunks = Array.isArray(record.chunks) ? record.chunks : null
  if (!parsedCategories && !parsedChunks) {
    return null
  }

  const defaults = buildDefaultPromptChunkLibrary()
  const categoryIds = new Set<string>()
  const categories = parsedCategories
    ? parsedCategories
        .map((category) => {
          if (!category || typeof category !== "object") {
            return null
          }

          const categoryRecord = category as Record<string, unknown>
          if (typeof categoryRecord.id !== "string" || typeof categoryRecord.name !== "string") {
            return null
          }

          const name = categoryRecord.name.trim()
          if (!name || categoryIds.has(categoryRecord.id)) {
            return null
          }

          categoryIds.add(categoryRecord.id)
          return {
            color: normalizePromptChunkColor(typeof categoryRecord.color === "string" ? categoryRecord.color : defaultPromptChunkColor),
            id: categoryRecord.id,
            name,
          }
        })
        .filter((category): category is PromptChunkCategory => Boolean(category))
    : defaults.categories

  if (!parsedCategories) {
    categories.forEach((category) => categoryIds.add(category.id))
  }

  const chunkIds = new Set<string>()
  const chunks = parsedChunks
    ? parsedChunks
        .map((chunk) => {
          if (!chunk || typeof chunk !== "object") {
            return null
          }

          const chunkRecord = chunk as Record<string, unknown>
          if (typeof chunkRecord.id !== "string" || typeof chunkRecord.name !== "string" || typeof chunkRecord.content !== "string") {
            return null
          }

          const name = chunkRecord.name.trim()
          const content = chunkRecord.content.trim()
          if (!name || !content || chunkIds.has(chunkRecord.id)) {
            return null
          }

          const categoryId = typeof chunkRecord.categoryId === "string" && categoryIds.has(chunkRecord.categoryId) ? chunkRecord.categoryId : null
          chunkIds.add(chunkRecord.id)
          return {
            categoryId,
            color: normalizePromptChunkColor(typeof chunkRecord.color === "string" ? chunkRecord.color : defaultPromptChunkColor),
            content,
            id: chunkRecord.id,
            name,
          }
        })
        .filter((chunk): chunk is PromptChunk => Boolean(chunk))
    : defaults.chunks

  return { categories, chunks }
}

function readCachedPromptChunkLibrary() {
  try {
    const storedValue = window.localStorage.getItem(promptChunkStorageKey)
    if (!storedValue) {
      return null
    }

    return normalizePromptChunkLibrary(JSON.parse(storedValue))
  } catch {
    return null
  }
}

function writeCachedPromptChunkLibrary(library: PromptChunkLibrary) {
  try {
    window.localStorage.setItem(promptChunkStorageKey, JSON.stringify(library))
  } catch {
  }
}

function getPromptChunkSyncLabel(status: PromptChunkSyncStatus) {
  if (status === "loading") {
    return "Syncing"
  }

  if (status === "saving") {
    return "Saving"
  }

  return status === "synced" ? "Synced" : "Local demo"
}

export function NovelAISettingsPanel({ accountState, isAdmin, isLooping, anlas, desktopWidth = 435, onCtrlGenerate, onLoggedOut, onOpenLoginPanel, onToggleShowStreamedImagesUnprocessed, showStreamedImagesUnprocessed, ...props }: NovelAISettingsPanelProps) {
  const [isTopMenuOpen, setIsTopMenuOpen] = useState(false)
  const [isLayoutSettingsPanelOpen, setIsLayoutSettingsPanelOpen] = useState(false)
  const { language, setLanguage } = useNovelAIUiLanguage()

  const closeTopMenu = () => {
    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement) {
      activeElement.blur()
    }
    setIsTopMenuOpen(false)
  }

  const handleLogout = async () => {
    await logoutCurrentUser()
    onLoggedOut()
    closeTopMenu()
  }

  return (
    <>
      <aside className="flex h-screen shrink-0 flex-col bg-[rgb(25,27,49)] text-white" style={{ width: `${desktopWidth}px` }}>
        <div className="flex h-[49px] items-center border-b border-white/5 pl-3 pr-0">
          <button className="flex h-[49px] w-[57px] items-center justify-center text-white/95" type="button">
            <NovelAIPenTipIcon className="h-[21px] w-[18px] text-white" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center">
            <div className="flex items-center overflow-hidden rounded-l-[3px] border border-r-0 border-[rgb(34,37,63)] bg-[rgb(25,27,49)] px-[15px] py-[10px] text-[14px] leading-[21px] whitespace-nowrap">
              <span className="inline-flex items-center leading-[21px] font-semibold text-white">Anlas:</span>
              <span className="ml-[6px] flex items-center gap-[4px] leading-[21px] text-[rgb(245,243,194)]">
                <span className="relative top-px block font-heading text-[14px] leading-[21px] font-semibold">{anlas.toLocaleString()}</span>
                <AnlasGemIcon className="h-[10px] w-[10px] text-[rgb(245,243,194)]" />
              </span>
            </div>
            <button className="flex h-[43px] w-[46px] items-center justify-center border border-[rgb(34,37,63)] bg-[rgb(34,37,63)] text-white" type="button">
              <NovelAIPlusIcon className="h-[14px] w-[14px] text-white" />
            </button>
          </div>
          <div className="flex-1" />
          <button
            aria-controls="novelai-top-menu"
            aria-expanded={isTopMenuOpen}
            aria-label="toggle navigation menu"
            className={cn("flex h-[49px] w-12 items-center justify-center text-white transition-colors", isTopMenuOpen && "bg-[rgb(34,37,63)]")}
            onClick={() => setIsTopMenuOpen((current) => !current)}
            type="button"
          >
            <NovelAIHamburgerIcon className="h-4 w-[18px] text-white" />
          </button>
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            className={cn(
              "flex h-full min-h-0 flex-col transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
              isTopMenuOpen && "pointer-events-none translate-y-2 opacity-0"
            )}
          >
            <NovelAISettingsPanelContent accountState={accountState} anlas={anlas} isLooping={isLooping} onCtrlGenerate={onCtrlGenerate} {...props} />
          </div>
          <div
            aria-hidden={!isTopMenuOpen}
            className={cn(
              "absolute inset-0 z-10 origin-top overflow-hidden bg-[rgb(19,21,44)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              isTopMenuOpen
                ? "pointer-events-auto translate-y-0 scale-y-100 opacity-100 [clip-path:inset(0_0_0_0)]"
                : "pointer-events-none -translate-y-2 scale-y-[0.96] opacity-0 [clip-path:inset(0_0_100%_0)]"
            )}
            id="novelai-top-menu"
          >
            <NovelAILeftRailMenu
              accountState={accountState}
              isAdmin={isAdmin}
              language={language}
              onClose={closeTopMenu}
              onLogout={() => void handleLogout()}
              onOpenLayoutSettingsPanel={() => {
                setIsLayoutSettingsPanelOpen(true)
                closeTopMenu()
              }}
              onOpenLoginPanel={() => {
                onOpenLoginPanel()
                closeTopMenu()
              }}
              onSetLanguage={setLanguage}
            />
          </div>
        </div>
      </aside>
      <NovelAILayoutSettingsPanel
        onClose={() => setIsLayoutSettingsPanelOpen(false)}
        onToggleShowStreamedImagesUnprocessed={onToggleShowStreamedImagesUnprocessed}
        open={isLayoutSettingsPanelOpen}
        showStreamedImagesUnprocessed={showStreamedImagesUnprocessed}
      />
    </>
  )
}

function NovelAILeftRailMenu({
  accountState,
  isAdmin,
  language,
  onClose,
  onLogout,
  onOpenLayoutSettingsPanel,
  onOpenLoginPanel,
  onSetLanguage,
}: {
  accountState: NovelAIAccountState
  isAdmin: boolean
  language: NovelAIUiLanguage
  onClose: () => void
  onLogout: () => void
  onOpenLayoutSettingsPanel: () => void
  onOpenLoginPanel: () => void
  onSetLanguage: (language: NovelAIUiLanguage) => void
}) {
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false)
  const copy = leftRailMenuCopy[language]
  const activeLanguageOption = novelAIUiLanguageOptions.find((option) => option.id === language) ?? novelAIUiLanguageOptions[0]

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[rgb(19,21,44)]">
      <div className="scrollbar-thin flex-1 overflow-y-auto px-5 pb-20 pt-4">
        <div className="flex items-center gap-4 py-[10px]">
          <div className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full bg-[rgb(151,115,255)] text-white shadow-[0_0_0_2px_rgba(255,255,255,0.03)]">
            <UserRound className="h-[28px] w-[28px]" strokeWidth={2.05} />
          </div>
          <div className="min-w-0">
            <div className="font-heading text-[22px] leading-[33px] font-bold text-[rgb(245,243,194)]">{copy.author}</div>
            <div className="mt-[-3px] text-[16px] leading-6 font-semibold text-white/45">{accountState === "authenticated" ? (isAdmin ? copy.administrator : copy.memberTrial) : accountState === "anonymous" ? copy.anonymousTrial : " "}</div>
          </div>
        </div>

        <div className="mt-[14px] border-t border-[rgb(34,37,63)]" />

        <NovelAILeftRailMenuSection label={copy.account}>
          {accountState === "authenticated" ? (
            <>
              <NovelAILeftRailMenuItem icon={<Settings2 className="h-[16px] w-[16px]" strokeWidth={2.1} />} label={copy.accountSettings} onClick={onClose} />
              <NovelAILeftRailMenuItem icon={<LogOut className="h-[16px] w-[16px]" strokeWidth={2.1} />} label={copy.logout} onClick={onLogout} />
            </>
          ) : accountState === "anonymous" ? (
            <NovelAILeftRailMenuItem icon={<KeyRound className="h-[16px] w-[16px]" strokeWidth={2.1} />} label={copy.login} onClick={onOpenLoginPanel} />
          ) : null}
        </NovelAILeftRailMenuSection>

        <NovelAILeftRailMenuSection label={copy.settings}>
          <NovelAILeftRailMenuItem icon={<SlidersHorizontal className="h-[16px] w-[16px]" strokeWidth={2.1} />} label={copy.layoutSettings} onClick={onOpenLayoutSettingsPanel} />
        </NovelAILeftRailMenuSection>

        {isAdmin ? (
          <NovelAILeftRailMenuSection label={copy.management}>
            <NovelAILeftRailMenuItem
              icon={<LayoutDashboard className="h-[16px] w-[16px]" strokeWidth={2.1} />}
              label={copy.adminPage}
              href="/admin"
              onClick={onClose}
            />
          </NovelAILeftRailMenuSection>
        ) : null}

      </div>

      <div className="absolute right-5 bottom-4 z-10">
        <div className="relative">
          {isLanguageMenuOpen ? (
            <div className="absolute right-0 bottom-[46px] w-[150px] overflow-hidden rounded-[3px] border border-[rgb(46,50,82)] bg-[rgb(19,21,44)] py-1 shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
              {novelAIUiLanguageOptions.map((option) => (
                <button
                  className={cn("flex w-full items-center justify-between px-3 py-2 text-left text-[14px] leading-[21px] transition-colors hover:bg-[rgb(34,37,63)]", option.id === language ? "text-[rgb(245,243,194)]" : "text-white/75")}
                  key={option.id}
                  onClick={() => {
                    onSetLanguage(option.id)
                    setIsLanguageMenuOpen(false)
                  }}
                  type="button"
                >
                  <span>{option.label}</span>
                  <span className="text-[12px] text-white/40">{option.shortLabel}</span>
                </button>
              ))}
            </div>
          ) : null}
          <button
            aria-expanded={isLanguageMenuOpen}
            aria-haspopup="menu"
            aria-label={copy.language}
            className="inline-flex h-[38px] items-center gap-[7px] rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] px-[9px] text-[14px] leading-[21px] text-white/75 transition-colors hover:text-white"
            onClick={() => setIsLanguageMenuOpen((current) => !current)}
            type="button"
          >
            <Languages className="h-[14px] w-[14px]" strokeWidth={2.1} />
            <span>{activeLanguageOption.shortLabel}</span>
            <ChevronDownIcon className="h-[12px] w-[12px]" />
          </button>
        </div>
      </div>
    </div>
  )
}

function NovelAILayoutSettingsPanel({
  onClose,
  onToggleShowStreamedImagesUnprocessed,
  open,
  showStreamedImagesUnprocessed,
}: {
  onClose: () => void
  onToggleShowStreamedImagesUnprocessed: () => void
  open: boolean
  showStreamedImagesUnprocessed: boolean
}) {
  const [isVisible, setIsVisible] = useState(false)
  const streamedImagesDescription = showStreamedImagesUnprocessed
    ? "All streamed images will be shown unprocessed."
    : "In progress streamed images will be blurred and the first few steps will not be shown."
  const handleClose = useCallback(() => {
    setIsVisible(false)
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleClose, open])

  useEffect(() => {
    if (!open) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      setIsVisible(true)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [open])

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center px-4 py-4 sm:px-6" role="presentation">
      <button
        aria-label="close panel"
        className={`absolute inset-0 bg-[rgba(7,9,22,0.78)] backdrop-blur-[2px] transition-opacity duration-200 ${isVisible ? "opacity-100" : "opacity-0"}`}
        onClick={handleClose}
        type="button"
      />
      <div
        aria-labelledby="novelai-layout-settings-title"
        aria-modal="true"
        className={`relative z-[301] w-full max-w-[440px] rounded-[6px] border border-[rgba(52,57,96,0.94)] bg-[rgb(15,17,37)] p-6 text-white shadow-[0_36px_120px_rgba(0,0,0,0.55)] transition-[opacity,transform] duration-220 ease-out sm:p-7 ${isVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.985] opacity-0"}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button
          aria-label="close layout settings panel"
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white"
          onClick={handleClose}
          type="button"
        >
          <NovelAIThinCrossIcon className="h-3.5 w-3.5" />
        </button>

        <div className="space-y-4">
          <div>
            <div className="pr-10 text-[28px] leading-[38px] font-semibold text-white" id="novelai-layout-settings-title">Layout Settings</div>
            <div className="mt-1 text-[14px] leading-[21px] text-white/60">Configure how the image workspace presents generated output.</div>
          </div>

          <button
            aria-checked={showStreamedImagesUnprocessed}
            className="flex w-full items-start justify-between gap-4 rounded-[4px] border border-[rgb(44,48,82)] bg-[rgb(13,15,33)] px-4 py-4 text-left transition-colors hover:border-[rgb(64,70,116)]"
            onClick={onToggleShowStreamedImagesUnprocessed}
            role="switch"
            type="button"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-[22px] text-white">Show Streamed Images Unprocessed</span>
              <span className="mt-2 block text-[13px] leading-[20px] text-white/58">{streamedImagesDescription}</span>
            </span>
            <span className="mt-[1px] shrink-0">
              <OfficialSwitch checked={showStreamedImagesUnprocessed} />
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

function NovelAILeftRailMenuSection({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section className="mt-[14px]">
      <div className="py-[10px] text-[14px] leading-[1.5] font-semibold text-white/70">{label}</div>
      <div className="space-y-[10px]">{children}</div>
    </section>
  )
}

function NovelAILeftRailMenuItem({
  external = false,
  href,
  icon,
  label,
  onClick,
}: {
  external?: boolean
  href?: string
  icon: ReactNode
  label: string
  onClick?: () => void
}) {
  const className = "flex min-h-11 w-full shrink-0 items-center justify-between gap-[5px] rounded-[5px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] px-5 py-0 text-left text-[16px] font-semibold leading-6 text-white outline-[1px] outline-transparent transition-[background-color] duration-75 ease-in-out hover:bg-[rgb(29,31,56)]"

  if (href) {
    return (
      <a className={className} href={href} onClick={onClick} rel={external ? "noreferrer" : undefined} target={external ? "_blank" : undefined}>
        <span className="flex min-w-0 items-center gap-[15px]">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-white/80">{icon}</span>
          <span className="min-w-0 truncate">{label}</span>
        </span>
        <span aria-hidden="true" className="w-0 shrink-0" />
      </a>
    )
  }

  return (
    <button className={className} onClick={onClick} type="button">
      <span className="flex min-w-0 items-center gap-[15px]">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-white/80">{icon}</span>
        <span className="min-w-0 truncate">{label}</span>
      </span>
      <span aria-hidden="true" className="w-0 shrink-0" />
    </button>
  )
}

export function NovelAISettingsPanelContent({
  accountState,
  actions,
  characterTemplates,
  generateEstimate,
  imageModelOptions,
  imagePresets,
  isLooping,
  onCtrlGenerate,
  onRequestGenerate,
  samplerOptions,
  state,
}: NovelAISettingsPanelContentProps) {
  const document = state.document
  const ui = state.ui
  const selectedModel = imageModelOptions.find((model) => model.id === document.imageModelId) ?? imageModelOptions[0]
  const selectedPreset = imagePresets.find((preset) => preset.id === document.imagePresetId) ?? imagePresets[0]
  const isPromptTab = ui.promptEditorTab === "prompt"
  const supportsCharacterPrompts = supportsNovelAICharacterPrompts(document.imageModelId)
  const supportsPreciseReference = supportsNovelAIPreciseReference(document.imageModelId)
  const promptTokenLimit = getNovelAIPromptTokenLimit(document.imageModelId)
  const isGenerating = ui.stage === "generating"
  const undesiredPresetTooltipContent = undesiredPresetMap[document.undesiredPreset] ?? ""
  const [promptDraft, setPromptDraft] = useState(document.basePrompt)
  const [undesiredDraft, setUndesiredDraft] = useState(document.undesiredPrompt)
  const effectiveBasePromptForTokens = document.addQualityTags ? appendPromptFragment(promptDraft, qualityTagPrefix) : promptDraft.trim()
  const effectiveUndesiredPromptForTokens = [undesiredPresetTooltipContent, undesiredDraft.trim()].filter(Boolean).join(", ")
  const enabledCharacters = supportsCharacterPrompts ? document.characters.filter((character) => character.enabled) : []
  const basePromptTokens = estimatePromptTokens(effectiveBasePromptForTokens)
  const baseUndesiredPromptTokens = estimatePromptTokens(effectiveUndesiredPromptForTokens)
  const characterPromptSegments = enabledCharacters
    .map((character, index) => ({
      color: promptTokenCharacterSegmentColors[index % promptTokenCharacterSegmentColors.length],
      id: character.id,
      label: character.name,
      tokens: estimatePromptTokens(character.prompt),
    }))
    .filter((segment) => segment.tokens > 0)
  const characterUndesiredPromptSegments = enabledCharacters
    .map((character, index) => ({
      color: promptTokenCharacterSegmentColors[index % promptTokenCharacterSegmentColors.length],
      id: `${character.id}-undesired`,
      label: `${character.name} Undesired`,
      tokens: estimatePromptTokens(character.undesiredPrompt),
    }))
    .filter((segment) => segment.tokens > 0)
  const characterPromptTokens = characterPromptSegments.reduce((total, segment) => total + segment.tokens, 0)
  const characterUndesiredPromptTokens = characterUndesiredPromptSegments.reduce((total, segment) => total + segment.tokens, 0)
  const promptTokenSegments: PromptTokenMeterSegment[] = [
    { color: promptTokenBaseSegmentColor, id: "base-prompt", label: "Prompt", tokens: basePromptTokens },
    ...characterPromptSegments,
  ].filter((segment) => segment.tokens > 0)
  const undesiredPromptTokenSegments: PromptTokenMeterSegment[] = [
    { color: promptTokenBaseSegmentColor, id: "base-undesired", label: "Undesired Content", tokens: baseUndesiredPromptTokens },
    ...characterUndesiredPromptSegments,
  ].filter((segment) => segment.tokens > 0)
  const totalPromptTokens = basePromptTokens + characterPromptTokens
  const totalUndesiredPromptTokens = baseUndesiredPromptTokens + characterUndesiredPromptTokens
  const promptTokenProgress = {
    maxTokens: promptTokenLimit,
    percent: Math.min((totalPromptTokens / promptTokenLimit) * 100, 100),
    tokens: totalPromptTokens,
  }
  const undesiredPromptTokenProgress = {
    maxTokens: promptTokenLimit,
    percent: Math.min((totalUndesiredPromptTokens / promptTokenLimit) * 100, 100),
    tokens: totalUndesiredPromptTokens,
  }
  const [cursorPositions, setCursorPositions] = useState({ prompt: 0, undesired: 0 })
  const [promptSuggestionsState, setPromptSuggestionsState] = useState<PromptSuggestionsState>({ field: "prompt", prompt: "", suggestions: [], isLoading: false })
  const [dismissedSuggestionsKey, setDismissedSuggestionsKey] = useState<string | null>(null)
  const [isPromptChunkDragActive, setIsPromptChunkDragActive] = useState(false)
  const suppressNextSuggestionRequestRef = useRef(false)
  const suggestionRequestTimeoutRef = useRef<number | null>(null)
  const suggestionAbortControllerRef = useRef<AbortController | null>(null)
  const promptSectionRef = useRef<HTMLElement | null>(null)
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const undesiredTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const imageModelMenuRef = useRef<HTMLDivElement | null>(null)
  const imagePresetMenuRef = useRef<HTMLDivElement | null>(null)
  const addCharacterMenuRef = useRef<HTMLDivElement | null>(null)
  const promptSettingsButtonRef = useRef<HTMLButtonElement | null>(null)
  const mobilePromptSettingsRef = useRef<HTMLDivElement | null>(null)
  const desktopPromptSettingsRef = useRef<HTMLDivElement | null>(null)
  const [desktopPromptSettingsPosition, setDesktopPromptSettingsPosition] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    if (!ui.promptSettingsOpen || !promptSectionRef.current) {
      return
    }

    const promptSection = promptSectionRef.current
    const scroller = promptSection.closest(".scrollbar-thin")

    const updatePosition = () => {
      const rect = promptSection.getBoundingClientRect()
      const nextPosition = {
        left: Math.round(rect.right + 34),
        top: Math.round(rect.top + 2),
      }
      setDesktopPromptSettingsPosition((current) =>
        current && current.left === nextPosition.left && current.top === nextPosition.top ? current : nextPosition
      )
    }

    const frameId = window.requestAnimationFrame(updatePosition)
    window.addEventListener("resize", updatePosition)
    scroller?.addEventListener("scroll", updatePosition, { passive: true })

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener("resize", updatePosition)
      scroller?.removeEventListener("scroll", updatePosition)
    }
  }, [ui.promptSettingsOpen])

  useEffect(() => {
    if (!(ui.promptSettingsOpen || ui.imageModelMenuOpen || ui.imagePresetMenuOpen || ui.addCharacterMenuOpen)) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (ui.promptSettingsOpen) {
        const insidePromptSettings =
          promptSettingsButtonRef.current?.contains(target) ||
          mobilePromptSettingsRef.current?.contains(target) ||
          desktopPromptSettingsRef.current?.contains(target)

        if (!insidePromptSettings) {
          actions.closePromptSettings()
        }
      }

      if (ui.imageModelMenuOpen && !imageModelMenuRef.current?.contains(target)) {
        actions.closeImageModelMenu()
      }

      if (ui.imagePresetMenuOpen && !imagePresetMenuRef.current?.contains(target)) {
        actions.closeImagePresetMenu()
      }

      if (ui.addCharacterMenuOpen && !addCharacterMenuRef.current?.contains(target)) {
        actions.closeAddCharacterMenu()
      }
    }

    window.document.addEventListener("mousedown", handlePointerDown)
    return () => window.document.removeEventListener("mousedown", handlePointerDown)
  }, [actions, ui.addCharacterMenuOpen, ui.imageModelMenuOpen, ui.imagePresetMenuOpen, ui.promptSettingsOpen])

  useEffect(() => {
    const promptFocused = window.document.activeElement === promptTextareaRef.current
    if (promptFocused || document.basePrompt === promptDraft) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      cancelQueuedSuggestionRequest()
      setPromptDraft(document.basePrompt)
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [document.basePrompt, promptDraft])

  useEffect(() => {
    const undesiredFocused = window.document.activeElement === undesiredTextareaRef.current
    if (undesiredFocused || document.undesiredPrompt === undesiredDraft) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      cancelQueuedSuggestionRequest()
      setUndesiredDraft(document.undesiredPrompt)
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [document.undesiredPrompt, undesiredDraft])

  useEffect(() => {
    if (window.document.activeElement !== promptTextareaRef.current || promptDraft === document.basePrompt) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      actions.setBasePrompt(promptDraft)
    }, 140)

    return () => window.clearTimeout(timeoutId)
  }, [actions, document.basePrompt, promptDraft])

  useEffect(() => {
    if (window.document.activeElement !== undesiredTextareaRef.current || undesiredDraft === document.undesiredPrompt) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      actions.setUndesiredPrompt(undesiredDraft)
    }, 140)

    return () => window.clearTimeout(timeoutId)
  }, [actions, document.undesiredPrompt, undesiredDraft])

  const getSuggestionFragmentAtCursor = (value: string, cursor: number) => {
    const safeCursor = Math.min(Math.max(cursor, 0), value.length)
    const fragmentStart = value.lastIndexOf(",", Math.max(0, safeCursor - 1)) + 1
    const nextCommaIndex = value.indexOf(",", safeCursor)
    const fragmentEnd = nextCommaIndex === -1 ? value.length : nextCommaIndex
    return value.slice(fragmentStart, fragmentEnd).trim()
  }
  const buildSuggestionKey = (field: SuggestionField, fragment: string) => `${field}:${fragment}`
  const buildPendingSuggestionRequest = (field: SuggestionField, value: string, cursor: number) => {
    const fragment = getSuggestionFragmentAtCursor(value, cursor)
    if (!fragment) {
      return null
    }

    return {
      field,
      fragment,
      key: buildSuggestionKey(field, fragment),
    } satisfies PendingSuggestionRequest
  }
  const cancelQueuedSuggestionRequest = () => {
    if (suggestionRequestTimeoutRef.current !== null) {
      window.clearTimeout(suggestionRequestTimeoutRef.current)
      suggestionRequestTimeoutRef.current = null
    }

    suggestionAbortControllerRef.current?.abort()
    suggestionAbortControllerRef.current = null
  }
  const queueSuggestionRequest = (field: SuggestionField, value: string, cursor: number) => {
    const request = buildPendingSuggestionRequest(field, value, cursor)
    cancelQueuedSuggestionRequest()

    if (ui.disableTagSuggestions || isPromptChunkDragActive || !request || dismissedSuggestionsKey === request.key) {
      setPromptSuggestionsState((current) => (current.isLoading ? { ...current, isLoading: false } : current))
      return
    }

    const abortController = new AbortController()
    suggestionAbortControllerRef.current = abortController
    suggestionRequestTimeoutRef.current = window.setTimeout(async () => {
      setPromptSuggestionsState({ field: request.field, prompt: request.fragment, suggestions: [], isLoading: true })

      try {
        const response = await fetch(`/api/novelai/suggest-tags?model=${encodeURIComponent(promptSuggestionModelId)}&prompt=${encodeURIComponent(request.fragment)}`, {
          signal: abortController.signal,
        })
        const payload = await response.json()
        setPromptSuggestionsState({
          field: request.field,
          prompt: request.fragment,
          suggestions: normalizePromptSuggestionsPayload(payload).filter(
            (suggestion) => !request.fragment.toLowerCase().includes(suggestion.label.toLowerCase())
          ),
          isLoading: false,
        })
      } catch {
        if (!abortController.signal.aborted) {
          setPromptSuggestionsState({ field: request.field, prompt: request.fragment, suggestions: [], isLoading: false })
        }
      } finally {
        if (suggestionAbortControllerRef.current === abortController) {
          suggestionAbortControllerRef.current = null
        }
        suggestionRequestTimeoutRef.current = null
      }
    }, 320)
  }
  const replacePromptFragmentAtCursor = (value: string, fragment: string, cursor: number) => {
    const safeCursor = Math.min(Math.max(cursor, 0), value.length)
    const fragmentStart = value.lastIndexOf(",", Math.max(0, safeCursor - 1)) + 1
    const nextCommaIndex = value.indexOf(",", safeCursor)
    const fragmentEnd = nextCommaIndex === -1 ? value.length : nextCommaIndex
    const beforeText = value.slice(0, fragmentStart).trimEnd().replace(/,\s*$/, "")
    const afterText = value.slice(fragmentEnd).trim().replace(/^,\s*/, "")

    if (!beforeText && !afterText) {
      return `${fragment}, `
    }

    if (!beforeText) {
      return `${fragment}, ${afterText}`
    }

    if (!afterText) {
      return `${beforeText}, ${fragment}, `
    }

    return `${beforeText}, ${fragment}, ${afterText}`
  }
  const getPromptChunkInsertionAtCursor = (value: string, content: string, cursor: number) => {
    const fragment = content.trim().replace(/^,\s*/, "").replace(/,\s*$/, "")
    const safeCursor = Math.min(Math.max(cursor, 0), value.length)
    if (!fragment) {
      return {
        end: safeCursor,
        start: safeCursor,
        text: "",
      }
    }

    const left = value.slice(0, safeCursor)
    const right = value.slice(safeCursor)
    const leftHasContent = left.trim().length > 0
    const rightHasContent = right.trim().length > 0
    const leftCommaMatch = left.match(/,\s*$/)
    const rightCommaMatch = right.match(/^\s*,\s*/)

    const prefix = leftHasContent ? (leftCommaMatch ? (leftCommaMatch[0].includes(" ") ? "" : " ") : ", ") : ""
    const suffix = rightHasContent ? (rightCommaMatch ? "" : ", ") : ", "

    return {
      end: safeCursor,
      start: safeCursor,
      text: `${prefix}${fragment}${suffix}`,
    }
  }

  const insertPromptChunkAtCursor = (value: string, content: string, cursor: number) => {
    const insertion = getPromptChunkInsertionAtCursor(value, content, cursor)
    return `${value.slice(0, insertion.start)}${insertion.text}${value.slice(insertion.end)}`
  }
  const applySuggestionFromNativeEdit = (field: SuggestionField, suggestion: string) => {
    const textarea = field === "prompt" ? promptTextareaRef.current : undesiredTextareaRef.current
    if (!textarea) {
      return false
    }

    const currentValue = field === "prompt" ? promptDraft : undesiredDraft
    const cursor = field === "prompt" ? cursorPositions.prompt : cursorPositions.undesired
    const nextValue = replacePromptFragmentAtCursor(currentValue, suggestion, cursor)

    suppressNextSuggestionRequestRef.current = true
    textarea.focus()
    textarea.setSelectionRange(0, textarea.value.length)
    textarea.setRangeText(nextValue, 0, textarea.value.length, "end")
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, data: suggestion, inputType: "insertReplacementText" }))

    return true
  }
  const applyPromptChunkFromNativeEdit = (content: string, cursorOverride?: number) => {
    const textarea = promptTextareaRef.current
    if (!textarea) {
      return false
    }

    const cursor = cursorOverride ?? textarea.selectionStart ?? cursorPositions.prompt
    const insertion = getPromptChunkInsertionAtCursor(promptDraft, content, cursor)
    if (!insertion.text) {
      return false
    }

    suppressNextSuggestionRequestRef.current = true
    textarea.focus()
    textarea.setSelectionRange(insertion.start, insertion.end)
    textarea.setRangeText(insertion.text, insertion.start, insertion.end, "end")
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, data: insertion.text, inputType: "insertText" }))

    return true
  }
  const handleInsertPromptChunk = (content: string, cursorOverride?: number) => {
    actions.setPromptEditorTab("prompt")
    setDismissedSuggestionsKey(null)

    if (!applyPromptChunkFromNativeEdit(content, cursorOverride)) {
      cancelQueuedSuggestionRequest()
      setPromptDraft(insertPromptChunkAtCursor(promptDraft, content, cursorOverride ?? cursorPositions.prompt))
    }
  }

  const handleTogglePromptTagSuggestionMode = () => {
    setDismissedSuggestionsKey(null)
    actions.togglePromptTagSuggestionMode()
  }
  const handleAttachUndesiredContent = () => {
    actions.setPromptAttached(true)
    actions.setPromptEditorTab("undesired")
  }
  const handleDetachUndesiredContent = () => {
    actions.setPromptAttached(false)
    actions.setPromptEditorTab("prompt")
  }
  const showAttachedUndesiredTab = document.promptAttached
  const showPromptPane = isPromptTab || !document.promptAttached
  const showAttachedUndesiredPane = document.promptAttached && !isPromptTab
  const showDetachedUndesiredPane = !document.promptAttached
  const promptSuggestionModelId = ui.promptTagSuggestionMode === "furry" ? "nai-diffusion-furry-3" : document.imageModelId
  const promptSuggestionFragment = getSuggestionFragmentAtCursor(promptDraft, cursorPositions.prompt)
  const undesiredSuggestionFragment = getSuggestionFragmentAtCursor(undesiredDraft, cursorPositions.undesired)
  const promptSuggestionKey = promptSuggestionFragment ? buildSuggestionKey("prompt", promptSuggestionFragment) : null
  const undesiredSuggestionKey = undesiredSuggestionFragment ? buildSuggestionKey("undesired", undesiredSuggestionFragment) : null
  const promptSuggestions =
    !isPromptChunkDragActive &&
    !ui.disableTagSuggestions &&
    promptSuggestionFragment !== "" &&
    promptSuggestionKey !== null &&
    dismissedSuggestionsKey !== promptSuggestionKey &&
    promptSuggestionsState.field === "prompt" &&
    promptSuggestionsState.prompt === promptSuggestionFragment
      ? promptSuggestionsState.suggestions
      : []
  const promptSuggestionsLoading = Boolean(
    !isPromptChunkDragActive &&
    !ui.disableTagSuggestions &&
      promptSuggestionFragment !== "" &&
      promptSuggestionKey !== null &&
      dismissedSuggestionsKey !== promptSuggestionKey &&
      promptSuggestionsState.field === "prompt" &&
      promptSuggestionsState.prompt === promptSuggestionFragment &&
      promptSuggestionsState.isLoading
  )
  const undesiredSuggestions =
    !ui.disableTagSuggestions &&
    undesiredSuggestionFragment !== "" &&
    undesiredSuggestionKey !== null &&
    dismissedSuggestionsKey !== undesiredSuggestionKey &&
    promptSuggestionsState.field === "undesired" &&
    promptSuggestionsState.prompt === undesiredSuggestionFragment
      ? promptSuggestionsState.suggestions
      : []
  const undesiredSuggestionsLoading = Boolean(
    !ui.disableTagSuggestions &&
      undesiredSuggestionFragment !== "" &&
      undesiredSuggestionKey !== null &&
      dismissedSuggestionsKey !== undesiredSuggestionKey &&
      promptSuggestionsState.field === "undesired" &&
      promptSuggestionsState.prompt === undesiredSuggestionFragment &&
      promptSuggestionsState.isLoading
  )

  useEffect(() => {
    return () => cancelQueuedSuggestionRequest()
  }, [])

  return (
    <>
      <div className="scrollbar-thin flex-1 overflow-y-auto px-5 pb-5 pt-5">
        <div className="flex w-full justify-between p-[10px]">
          <span />
        </div>
        <div className="relative rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] p-[10px]" ref={imageModelMenuRef}>
          <button className="flex min-h-[61px] w-full items-center rounded-[3px] bg-[rgb(25,27,49)] text-left" onClick={actions.toggleImageModelMenu} type="button">
            <div className="min-w-0 flex-1 pr-3">
              <div className="font-heading text-[14px] font-bold leading-[21px]">{selectedModel.label}</div>
              <p className="mt-[1px] whitespace-pre-wrap text-[14px] leading-[21px] font-normal text-white">{selectedModel.description}</p>
            </div>
            <div className="flex shrink-0 items-center self-stretch border-l border-[rgb(34,37,63)] pl-3 text-white/90">
              <ChevronDownIcon className={cn("h-5 w-5 transition-transform duration-150", ui.imageModelMenuOpen && "rotate-180")} />
            </div>
          </button>
          {ui.imageModelMenuOpen ? (
            <div className="absolute left-[-1px] right-[-1px] top-[calc(100%+6px)] z-30 h-[308px] overflow-y-auto rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
              <div className="px-1 py-1">
              {(["new", "legacy"] as const).map((group) => {
                const models = imageModelOptions.filter((model) => model.group === group)
                if (models.length === 0) {
                  return null
                }

                return (
                  <div className="mb-[6px] last:mb-0" key={group}>
                    <div className="px-[7px] py-[3px] text-[10px] font-normal leading-4 tracking-[0.1em] text-white/45">{group === "new" ? "NEW" : "LEGACY"}</div>
                    {models.map((model) => (
                      <button
                        key={model.id}
                        className={cn(
                          "w-full rounded-[3px] px-3 py-2 text-left",
                          document.imageModelId === model.id ? "bg-[rgb(34,37,63)] text-white" : "text-white/85 hover:bg-white/5"
                        )}
                        onClick={() => actions.setImageModel(model.id)}
                        type="button"
                      >
                        <div className="flex items-center justify-between gap-3 text-[14px] leading-[21px]">
                          <span className="font-heading font-bold">{model.label}</span>
                          {document.imageModelId === model.id ? <NovelAICheckIcon className="h-[7px] w-[8px] shrink-0 text-white" /> : null}
                        </div>
                        <div className="mt-1 pr-6 text-[14px] leading-[21px] text-white/60">{model.description}</div>
                      </button>
                    ))}
                  </div>
                )
              })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-[18px] border-t border-[rgb(34,37,63)]" />

        <section className="relative mt-[18px] overflow-visible" ref={promptSectionRef}>
          <div className="flex items-center justify-between bg-[rgb(14,15,33)] px-[15px] pb-0 pt-[15px]">
            <div className="flex flex-row items-center justify-start">
              <div className="relative top-[-1px] left-[-5px] h-[26px]">
                <button className="flex h-[26px] w-[26px] items-center justify-center p-[5px] text-white" onClick={handleTogglePromptTagSuggestionMode} type="button">
                  {ui.promptTagSuggestionMode === "furry" ? <NovelAIPawIcon className="h-4 w-4 text-white" /> : <NovelAISakuraIcon className="h-4 w-4 text-white" />}
                </button>
              </div>
              {document.promptAttached ? (
                <div className={cn("flex h-[26px] items-center rounded-[3px] px-0 py-[2px] transition-opacity", isPromptTab ? "bg-[rgb(34,37,63)] opacity-100" : "opacity-50 hover:opacity-100")}>
                  <button className="px-[5px] py-0 text-[14px] leading-[21px] font-semibold text-white transition-colors" onClick={() => actions.setPromptEditorTab("prompt")} type="button">
                    Prompt
                  </button>
                </div>
              ) : (
                <div className="px-[5px] py-0 text-[14px] leading-[21px] font-semibold text-white">Prompt</div>
              )}
              {showAttachedUndesiredTab ? (
                <div className={cn("ml-[5px] flex h-[26px] items-center rounded-[3px] px-0 py-[2px] transition-opacity", !isPromptTab ? "bg-[rgb(34,37,63)] opacity-100" : "opacity-50 hover:opacity-100")}>
                  <button className="px-[5px] py-0 text-[14px] leading-[21px] font-semibold text-white transition-colors" onClick={() => actions.setPromptEditorTab("undesired")} type="button">
                    Undesired Content
                  </button>
                  {!isPromptTab ? (
                    <button className="ml-[5px] flex h-[26px] w-[26px] items-center justify-center rounded-[3px] p-[5px] text-white/70 hover:text-white" onClick={handleDetachUndesiredContent} type="button">
                      <NovelAIDetachIcon className="h-4 w-4 text-white" direction="down" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="relative flex flex-row items-center gap-[10px]">
              <button
                className={cn(
                  "flex h-[26px] w-[26px] items-center justify-center rounded-[3px] p-[5px]",
                  ui.promptSettingsOpen ? "bg-[rgb(34,37,63)] text-white" : "text-white/85 hover:text-white"
                )}
                onClick={actions.togglePromptSettings}
                ref={promptSettingsButtonRef}
                type="button"
              >
                <NovelAISettingsIcon className="h-4 w-4 text-white" />
              </button>
            </div>
          </div>

          {showPromptPane ? (
            <>
              <div className="prompt-input-box-prompt relative bg-[rgb(14,15,33)]">
                <PromptEditor
                  highlightEmphasis={document.highlightEmphasis}
                  onChange={(value, cursor) => {
                    setCursorPositions((current) => ({ ...current, prompt: cursor }))
                    const shouldTriggerSuggestionRequest = !suppressNextSuggestionRequestRef.current
                    suppressNextSuggestionRequestRef.current = false
                    if (shouldTriggerSuggestionRequest) {
                      queueSuggestionRequest("prompt", value, cursor)
                    } else {
                      cancelQueuedSuggestionRequest()
                    }
                    setPromptDraft(value)
                  }}
                  onChunkDragStateChange={setIsPromptChunkDragActive}
                  onChunkDrop={(content, cursor) => {
                    setCursorPositions((current) => ({ ...current, prompt: cursor }))
                    handleInsertPromptChunk(content, cursor)
                  }}
                  onCursorChange={(cursor) => {
                                    setCursorPositions((current) => ({ ...current, prompt: cursor }))
                  }}
                  onFocus={(cursor) => {
                                    setCursorPositions((current) => ({ ...current, prompt: cursor }))
                  }}
                  textareaRef={promptTextareaRef}
                  value={promptDraft}
                />
                <div className="bg-[rgb(14,15,33)] px-5 py-[10px]">
                  <div className="flex w-full items-center gap-[10px]">
                    <button className="flex h-[26px] w-[28px] items-center justify-center rounded-[3px] p-[6px] text-white" onClick={actions.randomizePrompt} type="button">
                      <NovelAIDiceIcon className="h-4 w-4 text-white" />
                    </button>
                    <div className="flex-1">
                      <PromptTokenMeter showText={false} tokens={promptTokenProgress.tokens} maxTokens={promptTokenProgress.maxTokens} percent={promptTokenProgress.percent} segments={promptTokenSegments} />
                    </div>
                  </div>
                  <div className="mt-[6px] flex items-center justify-between gap-3 text-[12.8px] leading-[19.2px] text-white/70">
                    <div>
                      {promptTokenProgress.tokens} / {promptTokenProgress.maxTokens} Tokens
                      {characterPromptTokens > 0 ? <span className="text-white/45"> · Prompt {basePromptTokens} + Characters {characterPromptTokens}</span> : null}
                    </div>
                    {document.addQualityTags ? (
                      <InlineHelpTooltip body={`, ${qualityTagPrefix}`} label="Quality Tags Enabled" title="Added to the end of the prompt:" textClassName="text-[12.8px] leading-[19.2px] text-white/70" />
                    ) : null}
                  </div>
                </div>
              </div>
              {promptSuggestionsLoading || promptSuggestions.length > 0 ? (
                <SuggestionsDock
                  isLoading={promptSuggestionsLoading}
                  onDismiss={() => {
                    if (promptSuggestionKey) {
                      setDismissedSuggestionsKey(promptSuggestionKey)
                    }
                  }}
                  onSelect={(suggestion) => {
                    setDismissedSuggestionsKey(null)
                                    if (!applySuggestionFromNativeEdit("prompt", suggestion)) {
                      cancelQueuedSuggestionRequest()
                      setPromptDraft(replacePromptFragmentAtCursor(promptDraft, suggestion, cursorPositions.prompt))
                    }
                  }}
                  suggestions={promptSuggestions}
                />
              ) : null}
            </>
          ) : null}

          {showAttachedUndesiredPane ? (
            <>
              <div className="bg-[rgb(14,15,33)] px-[15px] py-[10px]">
                <AutoGrowTextarea
                  className="w-full resize-none bg-transparent text-[16px] leading-[26px] text-white/90 outline-none placeholder:text-white/35"
                  highlightEmphasis={document.highlightEmphasis}
                  minHeight={146}
                  onChange={(value, cursor) => {
                    setCursorPositions((current) => ({ ...current, undesired: cursor }))
                    const shouldTriggerSuggestionRequest = !suppressNextSuggestionRequestRef.current
                    suppressNextSuggestionRequestRef.current = false
                    if (shouldTriggerSuggestionRequest) {
                      queueSuggestionRequest("undesired", value, cursor)
                    } else {
                      cancelQueuedSuggestionRequest()
                    }
                    setUndesiredDraft(value)
                  }}
                  onCursorChange={(cursor) => {
                    setCursorPositions((current) => ({ ...current, undesired: cursor }))
                  }}
                  onFocus={(cursor) => {
                    setCursorPositions((current) => ({ ...current, undesired: cursor }))
                  }}
                  textareaRef={undesiredTextareaRef}
                  value={undesiredDraft}
                />
              </div>
              <div className="bg-[rgb(14,15,33)] px-5 py-[10px]">
                <div className="flex w-full items-center gap-[10px]">
                  <div className="flex-1">
                    <PromptTokenMeter showText={false} tokens={undesiredPromptTokenProgress.tokens} maxTokens={undesiredPromptTokenProgress.maxTokens} percent={undesiredPromptTokenProgress.percent} segments={undesiredPromptTokenSegments} />
                  </div>
                </div>
                <div className="mt-[6px] flex items-center justify-between gap-3 text-[12.8px] leading-[19.2px] text-white/70">
                  <div>
                    {undesiredPromptTokenProgress.tokens} / {undesiredPromptTokenProgress.maxTokens} Tokens
                    {characterUndesiredPromptTokens > 0 ? <span className="text-white/45"> · UC {baseUndesiredPromptTokens} + Characters {characterUndesiredPromptTokens}</span> : null}
                  </div>
                  {document.undesiredPreset !== "None" && undesiredPresetTooltipContent ? (
                    <InlineHelpTooltip body={undesiredPresetTooltipContent} label="UC Preset Enabled" title="Added to the beginning of the UC:" textClassName="text-[12.8px] leading-[19.2px] text-white/70" />
                  ) : null}
                </div>
              </div>
              {undesiredSuggestionsLoading || undesiredSuggestions.length > 0 ? (
                <SuggestionsDock
                  isLoading={undesiredSuggestionsLoading}
                  onDismiss={() => {
                    if (undesiredSuggestionKey) {
                      setDismissedSuggestionsKey(undesiredSuggestionKey)
                    }
                  }}
                  onSelect={(suggestion) => {
                    setDismissedSuggestionsKey(null)
                    if (!applySuggestionFromNativeEdit("undesired", suggestion)) {
                      cancelQueuedSuggestionRequest()
                      setUndesiredDraft(replacePromptFragmentAtCursor(undesiredDraft, suggestion, cursorPositions.undesired))
                    }
                  }}
                  suggestions={undesiredSuggestions}
                />
              ) : null}
            </>
          ) : null}
          {showDetachedUndesiredPane ? (
            <>
              <div className="overflow-hidden rounded-[3px] bg-[rgb(14,15,33)]">
                <div className="flex items-center justify-between px-[15px] pb-0 pt-[15px]">
                  <div className="px-[5px] py-0 text-[14px] leading-[21px] font-semibold text-white">Undesired Content</div>
                  <button className="flex h-[26px] w-[26px] items-center justify-center rounded-[3px] p-[5px] text-white/70 hover:text-white" onClick={handleAttachUndesiredContent} type="button">
                    <NovelAIDetachIcon className="h-4 w-4 text-white" direction="up" emphasized />
                  </button>
                </div>
                <div className="bg-[rgb(14,15,33)] px-[15px] py-[10px]">
                  <AutoGrowTextarea
                    className="w-full resize-none bg-transparent text-[16px] leading-[26px] text-white/90 outline-none placeholder:text-white/35"
                    highlightEmphasis={document.highlightEmphasis}
                    minHeight={146}
                    onChange={(value, cursor) => {
                      setCursorPositions((current) => ({ ...current, undesired: cursor }))
                      const shouldTriggerSuggestionRequest = !suppressNextSuggestionRequestRef.current
                      suppressNextSuggestionRequestRef.current = false
                      if (shouldTriggerSuggestionRequest) {
                        queueSuggestionRequest("undesired", value, cursor)
                      } else {
                        cancelQueuedSuggestionRequest()
                      }
                      setUndesiredDraft(value)
                    }}
                    onCursorChange={(cursor) => {
                      setCursorPositions((current) => ({ ...current, undesired: cursor }))
                    }}
                    onFocus={(cursor) => {
                      setCursorPositions((current) => ({ ...current, undesired: cursor }))
                    }}
                    textareaRef={undesiredTextareaRef}
                    value={undesiredDraft}
                  />
                </div>
                <div className="bg-[rgb(14,15,33)] px-5 py-[10px]">
                  <div className="flex w-full items-center gap-[10px]">
                    <div className="flex-1">
                      <PromptTokenMeter showText={false} tokens={undesiredPromptTokenProgress.tokens} maxTokens={undesiredPromptTokenProgress.maxTokens} percent={undesiredPromptTokenProgress.percent} segments={undesiredPromptTokenSegments} />
                    </div>
                  </div>
                  <div className="mt-[6px] flex items-center justify-between gap-3 text-[12.8px] leading-[19.2px] text-white/70">
                    <div>
                      {undesiredPromptTokenProgress.tokens} / {undesiredPromptTokenProgress.maxTokens} Tokens
                      {characterUndesiredPromptTokens > 0 ? <span className="text-white/45"> · UC {baseUndesiredPromptTokens} + Characters {characterUndesiredPromptTokens}</span> : null}
                    </div>
                    {document.undesiredPreset !== "None" && undesiredPresetTooltipContent ? (
                      <InlineHelpTooltip body={undesiredPresetTooltipContent} label="UC Preset Enabled" title="Added to the beginning of the UC:" textClassName="text-[12.8px] leading-[19.2px] text-white/70" />
                    ) : null}
                  </div>
                </div>
              </div>
              {undesiredSuggestionsLoading || undesiredSuggestions.length > 0 ? (
                <SuggestionsDock
                  isLoading={undesiredSuggestionsLoading}
                  onDismiss={() => {
                    if (undesiredSuggestionKey) {
                      setDismissedSuggestionsKey(undesiredSuggestionKey)
                    }
                  }}
                  onSelect={(suggestion) => {
                    setDismissedSuggestionsKey(null)
                    if (!applySuggestionFromNativeEdit("undesired", suggestion)) {
                      cancelQueuedSuggestionRequest()
                      setUndesiredDraft(replacePromptFragmentAtCursor(undesiredDraft, suggestion, cursorPositions.undesired))
                    }
                  }}
                  suggestions={undesiredSuggestions}
                />
              ) : null}
            </>
          ) : null}

          {ui.promptSettingsOpen ? (
            <>
              <div className="absolute right-0 top-[54px] z-30 w-[240px] rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] shadow-[0_12px_30px_rgba(0,0,0,0.45)] lg:hidden" ref={mobilePromptSettingsRef}>
                <PromptSettingsFlyout accountState={accountState} actions={actions} onInsertPromptChunk={handleInsertPromptChunk} state={state} variant="mobile" />
              </div>
              {desktopPromptSettingsPosition ? (
                <div
                  className="fixed z-30 hidden h-[520px] w-[380px] rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] shadow-[0_12px_30px_rgba(0,0,0,0.45)] lg:block"
                  ref={desktopPromptSettingsRef}
                  style={{ left: `${desktopPromptSettingsPosition.left}px`, top: `${desktopPromptSettingsPosition.top}px` }}
                >
                  <PromptSettingsFlyout accountState={accountState} actions={actions} onInsertPromptChunk={handleInsertPromptChunk} state={state} variant="desktop" />
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <UploadSlotRow actions={actions} keyName="baseImage" label="Add a Base Img (Optional)" state={state} />

        {supportsCharacterPrompts ? (
          <>
            <div className="relative mt-[18px] flex items-center justify-between gap-[10px]" ref={addCharacterMenuRef}>
              <div className="text-[14px] leading-[21px] text-white/50">
                <span className="font-normal text-white/55">Character Prompts</span>
                <br />
                <span>Customize separate characters.</span>
              </div>
              <button className="inline-flex h-7 min-w-[131px] items-center justify-between gap-2 rounded-[3px] bg-[rgb(34,37,63)] px-[7px] py-[2px] text-[14px] leading-[21px] font-semibold text-white" onClick={actions.toggleAddCharacterMenu} type="button">
                <NovelAIPlusIcon className="h-[14px] w-[14px] text-white" />
                Add Character
              </button>
              {ui.addCharacterMenuOpen ? (
                <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[190px] rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] p-1 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
                  {characterTemplates.map((template) => (
                    <button key={template.id} className="flex w-full items-center justify-between rounded-[3px] px-3 py-2 text-left text-[14px] leading-[21px] text-white/85 hover:bg-white/5" onClick={() => actions.addCharacter(template)} type="button">
                      <span className="inline-flex items-center gap-2">
                        {getCharacterTemplateIcon(template.id)}
                        <span>{template.label}</span>
                      </span>
                      <NovelAIPlusIcon className="h-[14px] w-[14px] text-[rgb(245,243,194)]" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-[15px] space-y-[15px]">
              {document.characters.length >= 2 ? (
                <div className="rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(19,21,44)] px-[15px] py-[12px] text-white">
                  <div className="text-[14px] font-normal leading-[21px] text-white/85">Character Positions (Global)</div>
                  <div className="mt-[8px] flex items-center gap-[10px] text-[14px] leading-[21px]">
                    <span className="text-white/70">Position</span>
                    <PositionModeButton active disabled iconType="check" label="AI's Choice" onClick={() => undefined} />
                  </div>
                </div>
              ) : null}
              {document.characters.map((character, index) => (
                <CharacterPromptCard
                  actions={actions}
                  character={character}
                  highlightEmphasis={document.highlightEmphasis}
                  index={index}
                  key={character.id}
                  previewAspect={document.width === document.height ? "square" : document.width > document.height ? "landscape" : "portrait"}
                  total={document.characters.length}
                />
              ))}
            </div>
          </>
        ) : null}

        <div className="mt-[16px] space-y-3">
          <FeatureUploadCard
            actions={actions}
            icon={<NovelAIVibeTransferIcon className="h-5 w-5 text-white" />}
            keyName="vibeTransfer"
            state={state}
            title="Vibe Transfer"
          />
          {supportsPreciseReference ? (
            <FeatureUploadCard
              actions={actions}
              icon={<NovelAIPreciseReferenceIcon className="h-5 w-5 text-white" />}
              keyName="preciseReference"
              state={state}
              title="Precise Reference"
            />
          ) : null}
        </div>

        <section className="mt-[18px]">
          <div className="mb-[5px] text-[14px] leading-[21px] text-white/50">Image Settings</div>
          <div className="flex items-center gap-[10px]">
            <div className="relative flex-1" ref={imagePresetMenuRef}>
              <button className="flex h-11 w-full items-center justify-between rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(19,21,44)] px-4 text-white/90" onClick={actions.toggleImagePresetMenu} type="button">
                <span className="text-[16px] leading-6 font-normal text-white/90">{selectedPreset.label}</span>
                <ChevronDownIcon className="h-5 w-5 text-white/80" />
              </button>
              {ui.imagePresetMenuOpen ? (
                <div className="absolute left-0 right-0 bottom-[calc(100%+6px)] z-20 max-h-72 overflow-y-auto rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] p-[5px] shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
                  {(["NORMAL", "LARGE", "WALLPAPER", "SMALL", "CUSTOM"] as const).map((group) => {
                    const presetsInGroup = imagePresets.filter((preset) => preset.group === group)
                    if (presetsInGroup.length === 0) {
                      return null
                    }

                    return (
                      <div className="mb-[6px] last:mb-0" key={group}>
                        <div className="px-[7px] py-[3px] text-[10px] font-normal leading-4 tracking-[0.1em] text-white/45">{group}</div>
                        {presetsInGroup.map((preset) => (
                          <button
                            key={preset.id}
                            className={cn(
                              "flex w-full items-center justify-between rounded-[3px] px-[7px] py-[7px] text-left text-[14px] leading-[21px]",
                              document.imagePresetId === preset.id ? "bg-[rgb(34,37,63)] text-white" : "text-white/85 hover:bg-white/5"
                            )}
                            onClick={() => actions.setImagePreset(preset.id)}
                            type="button"
                          >
                            <span>{preset.menuLabel === "Custom" ? "Custom" : `${preset.menuLabel} (${preset.width}x${preset.height})`}</span>
                            {document.imagePresetId === preset.id ? <NovelAICheckIcon className="h-[7px] w-[8px] shrink-0 text-white" /> : null}
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
            <div className="flex w-[136px] shrink-0 flex-row items-center">
              <NumberField onChange={actions.setWidth} value={document.width} variant="boxed" widthClassName="w-[54px] box-border rounded-r-none border-r-0" />
              <button className="flex h-11 w-[28px] items-center justify-center border-y border-[rgb(34,37,63)] bg-[rgb(14,15,33)] text-white opacity-90 transition-colors hover:text-white" onClick={actions.swapDimensions} type="button">
                <span className="flex-none px-[8px]">
                  <NovelAIThinCrossIcon className="h-[12px] w-[12px] text-current" />
                </span>
              </button>
              <NumberField onChange={actions.setHeight} value={document.height} variant="boxed" widthClassName="w-[54px] box-border rounded-l-none border-l-0" />
            </div>
          </div>

          <div className="mt-[10px] flex h-11 items-center rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] px-2">
            <div className="mr-2 flex h-9 w-8 items-center justify-center text-white/75">
              <NovelAIImageCountIcon className="h-4 w-4 text-white" />
            </div>
            <div className="grid h-9 flex-1 grid-cols-4 gap-0.5">
              {[1, 2, 3, 4].map((value) => (
                <button
                  key={value}
                  className={cn(
                    "flex h-9 items-center justify-center rounded-[3px] text-[16px]",
                    document.imageCount === value ? "bg-[rgb(34,37,63)] font-bold text-white" : "text-white/85"
                  )}
                  onClick={() => actions.setImageCount(value)}
                  type="button"
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="border-t border-white/5 px-5 pb-5 pt-5">
        <div className={cn("grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out will-change-transform", ui.advancedImageSettingsOpen ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100")}>
          <div className="overflow-hidden">
            <div className={cn("transition-[opacity,transform] duration-200 ease-out", ui.advancedImageSettingsOpen ? "pointer-events-none -translate-y-1 opacity-0" : "translate-y-0 opacity-100")}>
              <div className="flex items-start justify-between gap-3 text-white">
                <div className="flex min-w-0 flex-1 items-start gap-[15px] pl-[15px]">
                  <StatField label="Steps" onChange={actions.setSteps} value={document.steps} />
                  <StatField label="Guidance" onChange={actions.setGuidance} value={document.guidance} />
                  <SummaryValueButton label="Seed" onClick={() => actions.toggleAdvancedImageSettings()} value={document.seed} />
                  <SummaryValueButton label="Sampler" onClick={() => actions.toggleAdvancedImageSettings()} value={document.sampler} valueClassName="max-w-[110px] truncate text-left" />
                </div>
                <button className="mt-[18px] flex h-[30px] w-[30px] items-center justify-center text-white/85" onClick={actions.toggleAdvancedImageSettings} type="button">
                  <NovelAIArrowUpIcon className="h-[8px] w-[14px] text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={cn("grid transition-[grid-template-rows,opacity,margin] duration-[220ms] ease-out will-change-transform", ui.advancedImageSettingsOpen ? "mt-4 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0")}>
          <div className="overflow-hidden">
            <div className="rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] px-4 py-4 text-white">
              <div className="flex items-start justify-between pb-[10px]">
                <div className="text-[14px] font-normal leading-[21px] text-white/50">AI Settings</div>
                <div className="flex items-center gap-[10px]">
                  <button
                    aria-label="reset settings"
                    className="flex h-auto w-auto items-center justify-center rounded-[3px] bg-transparent p-1 text-white/70 hover:text-white"
                    onClick={() => {
                      actions.setSteps(28)
                      actions.setGuidance(7)
                      actions.setSeed("N/A")
                      actions.setSampler(samplerOptions[0])
                      actions.setPromptGuidanceRescale(0)
                      actions.setNoiseSchedule(noiseScheduleOptions[0])
                    }}
                    type="button"
                  >
                    <NovelAIResetIcon className="h-4 w-4 text-[rgb(255,120,120)]" />
                  </button>
                  <button className="flex h-[30px] w-[30px] items-center justify-center text-white/85" onClick={actions.toggleAdvancedImageSettings} type="button">
                    <NovelAIArrowUpIcon className="h-[8px] w-[14px] rotate-180 text-white" />
                  </button>
                </div>
              </div>

              <div className="space-y-[10px]">
                <SliderSettingRow label="Steps:" onChange={actions.setSteps} rangeMax={50} rangeMin={1} rangeStep={1} value={document.steps} widthClassName="w-[36px]" />
                <SliderSettingRow label="Prompt Guidance:" onChange={actions.setGuidance} rangeMax={10} rangeMin={0} rangeStep={0.1} value={document.guidance} widthClassName="w-[28px]" />
                <div className="flex flex-row gap-5">
                  <div className="flex-[0_1_0]">
                    <div className="mb-2 flex w-full justify-between text-[14px] leading-[21px] text-white/85">
                      <span>Seed</span>
                    </div>
                    <SeedField onChange={actions.setSeed} value={document.seed} widthClassName="w-[150px]" />
                  </div>
                  <div className="flex-[1_0_0]">
                    <div className="mb-2 flex w-full justify-between text-[14px] leading-[21px] text-white/85">
                      <span>Sampler</span>
                    </div>
                    <div className="relative">
                      <button className="flex h-[38px] w-full items-center justify-between rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(14,15,33)] px-3 text-left text-[14px] leading-[21px] text-white" onClick={actions.toggleSamplerMenu} type="button">
                        <span>{document.sampler}</span>
                        <ChevronDownIcon className="h-5 w-5 text-white/85" />
                      </button>
                      {ui.samplerMenuOpen ? (
                        <div className="absolute left-0 right-0 bottom-[calc(100%+4px)] z-20 rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] p-1 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
                          {samplerOptions.map((sampler) => (
                            <button
                              key={sampler}
                              className={cn(
                                "flex w-full items-center justify-between rounded-[3px] px-3 py-2 text-left text-[14px] leading-[21px]",
                                document.sampler === sampler ? "bg-[rgb(34,37,63)] text-white" : "text-white/85 hover:bg-white/5"
                              )}
                              onClick={() => actions.setSampler(sampler)}
                              type="button"
                            >
                              <span>{sampler}</span>
                              {document.sampler === sampler ? <NovelAICheckIcon className="h-[7px] w-[8px] text-white" /> : null}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <button className="flex w-full items-center gap-2 pt-1 text-left text-[14px] font-normal leading-[21px] text-white/85" onClick={actions.toggleAiSettingsAdvanced} type="button">
                  <span>Advanced Settings</span>
                  <NovelAIArrowUpIcon className={cn("h-[8px] w-[12px] text-white transition-transform duration-200", ui.aiSettingsAdvancedOpen ? "rotate-180" : "rotate-0")} />
                </button>
                <div className={cn("grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out", ui.aiSettingsAdvancedOpen ? "mt-1 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0")}>
                  <div className="overflow-hidden">
                    <div className={cn("space-y-[10px] transition-[opacity,transform] duration-200 ease-out", ui.aiSettingsAdvancedOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0")}>
                      <SliderSettingRow label="Prompt Guidance Rescale:" onChange={actions.setPromptGuidanceRescale} rangeMax={1} rangeMin={0} rangeStep={0.02} value={document.promptGuidanceRescale} widthClassName="w-[28px]" />
                      <div>
                        <div className="mb-2 flex w-full justify-between text-[14px] leading-[21px] text-white/85">
                          <span>Noise Schedule</span>
                        </div>
                        <div className="relative">
                          <button className="flex h-[38px] w-full items-center justify-between rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(14,15,33)] px-3 text-left text-[14px] leading-[21px] text-white" onClick={actions.toggleNoiseScheduleMenu} type="button">
                            <span>{document.noiseSchedule}</span>
                            <ChevronDownIcon className="h-5 w-5 text-white/85" />
                          </button>
                          {ui.noiseScheduleMenuOpen ? (
                            <div className="absolute left-0 right-0 bottom-[calc(100%+4px)] z-20 rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] p-1 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
                              {noiseScheduleOptions.map((option) => (
                                <button
                                  key={option}
                                  className={cn(
                                    "flex w-full items-center justify-between rounded-[3px] px-3 py-2 text-left text-[14px] leading-[21px]",
                                    document.noiseSchedule === option ? "bg-[rgb(34,37,63)] text-white" : "text-white/85 hover:bg-white/5"
                                  )}
                                  onClick={() => actions.setNoiseSchedule(option)}
                                  type="button"
                                >
                                  <span>{option}</span>
                                  {document.noiseSchedule === option ? <NovelAICheckIcon className="h-[7px] w-[8px] text-white" /> : null}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>


        <GenerateButton
          generateEstimate={generateEstimate}
          imageCount={document.imageCount}
          isGenerating={isGenerating}
          isLooping={isLooping ?? false}
          onCtrlGenerate={onCtrlGenerate}
          onGenerate={onRequestGenerate ?? actions.generate}
        />
      </div>
    </>
  )
}

function GenerateButton({
  generateEstimate,
  imageCount,
  isGenerating,
  isLooping,
  onCtrlGenerate,
  onGenerate,
}: {
  generateEstimate: NovelAIAnlasEstimate
  imageCount: number
  isGenerating: boolean
  isLooping: boolean
  onCtrlGenerate?: () => void
  onGenerate: () => void
}) {
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFiredRef = useRef(false)

  const clearLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }
  const isDisabled = isGenerating && !isLooping

  return (
    <button
      className={cn(
        "mt-5 flex h-11 w-full origin-center items-center justify-between gap-5 rounded-[3px] px-[10px] py-[10px] pl-5 text-left text-[14px] font-bold leading-[21px] transition-[color,background-color,transform,filter,box-shadow] duration-150 will-change-transform",
        isDisabled
          ? "cursor-not-allowed bg-[rgb(150,149,121)] text-[rgb(19,21,44)]/60 shadow-none brightness-90 saturate-50"
          : "shadow-[0_4px_0_rgba(19,21,44,0.45)] active:translate-y-[2px] active:scale-[0.985] active:brightness-95 active:shadow-[0_1px_0_rgba(19,21,44,0.55)]",
        !isDisabled && (isLooping
          ? "bg-[rgb(255,140,140)] text-[rgb(19,21,44)]"
          : "bg-[rgb(245,243,194)] text-[rgb(19,21,44)]")
      )}
      disabled={isDisabled}
      onClick={(event) => {
        if (longPressFiredRef.current) {
          longPressFiredRef.current = false
          return
        }
        if (event.ctrlKey && onCtrlGenerate) {
          onCtrlGenerate()
        } else if (isLooping && onCtrlGenerate) {
          onCtrlGenerate()
        } else {
          onGenerate()
        }
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "touch" && onCtrlGenerate) {
          longPressFiredRef.current = false
          longPressRef.current = setTimeout(() => {
            longPressFiredRef.current = true
            onCtrlGenerate()
          }, 600)
        }
      }}
      onPointerUp={clearLongPress}
      onPointerLeave={clearLongPress}
      onPointerCancel={clearLongPress}
      title={isDisabled ? "Generation in progress" : isLooping ? "Tap or Ctrl+Click to stop loop" : "Ctrl+Click or long-press to loop generate"}
      type="button"
    >
      <span>{isDisabled ? "Generating…" : isLooping ? "Looping…" : `Generate ${imageCount} Image${imageCount > 1 ? "s" : ""}`}</span>
      <span className={cn(
        "inline-flex items-center gap-[6px] rounded-[3px] px-[9px] py-[5px]",
        isDisabled ? "bg-[rgb(19,21,44)]/70 text-[rgb(245,243,194)]/65" : "bg-[rgb(19,21,44)] text-[rgb(245,243,194)]"
      )}>
        <span>{generateEstimate.total}</span>
        <AnlasGemIcon className={cn("h-[10px] w-[10px]", isDisabled ? "text-[rgb(245,243,194)]/65" : "text-[rgb(245,243,194)]")} />
      </span>
    </button>
  )
}

function PromptSettingsFlyout({
  accountState,
  actions,
  onInsertPromptChunk,
  state,
  variant,
}: {
  accountState: NovelAIAccountState
  actions: NovelAIWorkspaceActions
  onInsertPromptChunk: (content: string) => void
  state: NovelAIWorkspaceState
  variant: "desktop" | "mobile"
}) {
  const isDesktop = variant === "desktop"
  const document = state.document
  const ui = state.ui

  return (
    <div className={cn("flex h-full flex-col", isDesktop ? "p-5" : "px-[15px] pb-[15px] pt-[15px]")}>
      <div className={cn("flex items-center gap-[5px] text-[14px] leading-[21px]", isDesktop ? "mb-3 pb-2" : "pb-[10px]")}>
        <div className={cn("flex h-[26px] items-center rounded-[3px] px-0 py-[2px] transition-opacity", ui.promptSettingsTab === "settings" ? "bg-[rgb(34,37,63)] opacity-100" : "opacity-50 hover:opacity-100")}>
          <button
            className="px-[5px] py-0 text-left text-[14px] leading-[21px] font-semibold text-white transition-colors"
            onClick={() => actions.setPromptSettingsTab("settings")}
            type="button"
          >
            Settings
          </button>
        </div>
        <div className={cn("flex h-[26px] items-center rounded-[3px] px-0 py-[2px] transition-opacity", ui.promptSettingsTab === "prompt-chunks" ? "bg-[rgb(34,37,63)] opacity-100" : "opacity-50 hover:opacity-100")}>
          <button
            className="px-[5px] py-0 text-left text-[14px] leading-[21px] font-semibold text-white transition-colors"
            onClick={() => actions.setPromptSettingsTab("prompt-chunks")}
            type="button"
          >
            Prompt Chunks
          </button>
        </div>
      </div>
      <div className={cn("flex flex-1 flex-col gap-[15px] overflow-y-auto", !isDesktop && "pt-[2px]")}>
        {ui.promptSettingsTab === "settings" ? (
          <>
            <CompactCheckboxRow
              checked={document.addQualityTags}
              description="Tags to increase quality will be prepended to the prompt."
              label="Add Quality Tags"
              onToggle={actions.toggleQualityTags}
            />
            <div>
              <div className="mb-[5px] mt-5 text-[16px] leading-6 text-white">Undesired Content Preset</div>
              <div className="relative">
                <button className="flex h-[38px] w-full items-center justify-between rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(14,15,33)] px-3 text-left text-[14px] leading-[21px]" onClick={actions.toggleUndesiredPresetMenu} type="button">
                  <span>{document.undesiredPreset}</span>
                  <NovelAIArrowUpIcon className="h-[8px] w-[14px] rotate-180 text-white/80" />
                </button>
                {ui.undesiredPresetMenuOpen ? (
                  <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] p-1 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
                    {undesiredPresetOptions.map((option) => (
                      <button
                        key={option}
                        className={cn(
                          "flex w-full items-center justify-between rounded-[3px] px-3 py-2 text-left text-[14px] leading-[21px]",
                          document.undesiredPreset === option ? "bg-[rgb(34,37,63)] text-white" : "text-white/85 hover:bg-white/5"
                        )}
                        onClick={() => actions.setUndesiredPreset(option)}
                        type="button"
                      >
                        <span>{option}</span>
                        {document.undesiredPreset === option ? <NovelAICheckIcon className="h-[7px] w-[8px] text-white" /> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <CompactCheckboxRow checked={ui.disableTagSuggestions} label="Disable Tag Suggestions" onToggle={actions.toggleDisableTagSuggestions} />
            <CompactCheckboxRow checked={document.highlightEmphasis} label="Highlight Emphasis" onToggle={actions.toggleHighlightEmphasis} />
          </>
        ) : (
          <PromptChunksPanel onClose={actions.closePromptSettings} onInsert={onInsertPromptChunk} remoteSyncEnabled={accountState === "authenticated"} />
        )}
      </div>
    </div>
  )
}

function PromptChunksPanel({ onClose, onInsert, remoteSyncEnabled }: { onClose: () => void; onInsert: (content: string) => void; remoteSyncEnabled: boolean }) {
  const [libraryState, setLibraryState] = useState<PromptChunkLibrary>(buildDefaultPromptChunkLibrary)
  const [syncState, setSyncState] = useState<PromptChunkSyncState>(() => ({
    label: getPromptChunkSyncLabel(remoteSyncEnabled ? "loading" : "local"),
    status: remoteSyncEnabled ? "loading" : "local",
  }))
  const [panelMode, setPanelMode] = useState<PromptChunkPanelMode>({ kind: "list" })
  const [categoryDraft, setCategoryDraft] = useState({ color: defaultPromptChunkColor, name: "" })
  const [chunkDraft, setChunkDraft] = useState({ categoryId: "" as string | "", color: defaultPromptChunkColor, content: "", name: "" })
  const hasLoadedLibraryRef = useRef(false)
  const libraryStateRef = useRef(libraryState)
  const saveRevisionRef = useRef(0)
  const skipNextRemoteSaveRef = useRef(false)

  useEffect(() => {
    libraryStateRef.current = libraryState
  }, [libraryState])

  useEffect(() => {
    let cancelled = false
    const frameIds: number[] = []
    const cachedLibrary = readCachedPromptChunkLibrary()
    const scheduleSyncState = (state: PromptChunkSyncState) => {
      frameIds.push(window.requestAnimationFrame(() => {
        if (!cancelled) {
          setSyncState(state)
        }
      }))
    }

    hasLoadedLibraryRef.current = false
    if (cachedLibrary) {
      libraryStateRef.current = cachedLibrary
      frameIds.push(window.requestAnimationFrame(() => {
        if (!cancelled) {
          setLibraryState(cachedLibrary)
        }
      }))
    }

    if (!remoteSyncEnabled) {
      hasLoadedLibraryRef.current = true
      scheduleSyncState({ label: getPromptChunkSyncLabel("local"), status: "local" })
      return () => {
        cancelled = true
        frameIds.forEach((frameId) => window.cancelAnimationFrame(frameId))
      }
    }

    scheduleSyncState({ label: getPromptChunkSyncLabel("loading"), status: "loading" })
    void getPromptChunkLibrary()
      .then((response) => {
        if (cancelled) {
          return
        }

        const remoteLibrary = response.library ? normalizePromptChunkLibrary(response.library) : null
        if (remoteLibrary) {
          skipNextRemoteSaveRef.current = true
          libraryStateRef.current = remoteLibrary
          writeCachedPromptChunkLibrary(remoteLibrary)
          setLibraryState(remoteLibrary)
          hasLoadedLibraryRef.current = true
          setSyncState({ label: getPromptChunkSyncLabel("synced"), status: "synced" })
          return
        }

        hasLoadedLibraryRef.current = true
        setSyncState({ label: getPromptChunkSyncLabel("saving"), status: "saving" })
        void updatePromptChunkLibrary(libraryStateRef.current)
          .then(() => {
            if (!cancelled) {
              setSyncState({ label: getPromptChunkSyncLabel("synced"), status: "synced" })
            }
          })
          .catch(() => {
            if (!cancelled) {
              setSyncState({ label: "Local fallback", status: "local" })
            }
          })
      })
      .catch(() => {
        if (cancelled) {
          return
        }

        hasLoadedLibraryRef.current = true
        setSyncState({ label: "Local fallback", status: "local" })
      })

    return () => {
      cancelled = true
      frameIds.forEach((frameId) => window.cancelAnimationFrame(frameId))
    }
  }, [remoteSyncEnabled])

  useEffect(() => {
    writeCachedPromptChunkLibrary(libraryState)
    if (skipNextRemoteSaveRef.current) {
      skipNextRemoteSaveRef.current = false
      return
    }

    if (!remoteSyncEnabled || !hasLoadedLibraryRef.current) {
      return
    }

    saveRevisionRef.current += 1
    const revision = saveRevisionRef.current
    const frameId = window.requestAnimationFrame(() => {
      if (revision === saveRevisionRef.current) {
        setSyncState({ label: getPromptChunkSyncLabel("saving"), status: "saving" })
      }
    })
    const timeoutId = window.setTimeout(() => {
      void updatePromptChunkLibrary(libraryState)
        .then(() => {
          if (revision === saveRevisionRef.current) {
            setSyncState({ label: getPromptChunkSyncLabel("synced"), status: "synced" })
          }
        })
        .catch(() => {
          if (revision === saveRevisionRef.current) {
            setSyncState({ label: "Local fallback", status: "local" })
          }
        })
    }, promptChunkRemoteSaveDelayMs)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.clearTimeout(timeoutId)
    }
  }, [libraryState, remoteSyncEnabled])

  const chunkCounts = libraryState.categories.reduce<Record<string, number>>((counts, category) => {
    counts[category.id] = libraryState.chunks.filter((chunk) => chunk.categoryId === category.id).length
    return counts
  }, {})
  const uncategorizedChunks = libraryState.chunks.filter((chunk) => chunk.categoryId === null)
  const syncToneClass = syncState.status === "synced"
    ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100/85"
    : syncState.status === "local"
      ? "border-amber-200/20 bg-amber-200/10 text-amber-100/80"
      : "border-white/10 bg-white/5 text-white/60"

  const openNewCategory = () => {
    setCategoryDraft({ color: defaultPromptChunkColor, name: "" })
    setPanelMode({ kind: "new-category" })
  }

  const openEditCategory = (categoryId: string) => {
    const category = libraryState.categories.find((currentCategory) => currentCategory.id === categoryId)
    if (!category) {
      return
    }

    setCategoryDraft({ color: category.color, name: category.name })
    setPanelMode({ categoryId, kind: "edit-category" })
  }

  const openNewChunk = (categoryId: string | null = null) => {
    setChunkDraft({ categoryId: categoryId ?? "", color: defaultPromptChunkColor, content: "", name: "" })
    setPanelMode({ categoryId, kind: "new-chunk" })
  }

  const openEditChunk = (chunkId: string) => {
    const chunk = libraryState.chunks.find((currentChunk) => currentChunk.id === chunkId)
    if (!chunk) {
      return
    }

    setChunkDraft({ categoryId: chunk.categoryId ?? "", color: chunk.color, content: chunk.content, name: chunk.name })
    setPanelMode({ chunkId, kind: "edit-chunk" })
  }

  const moveChunkToGroupIndex = (chunkId: string, targetCategoryId: string | null, targetIndex: number) => {
    setLibraryState((current) => ({
      ...current,
      chunks: movePromptChunkToGroupIndex(current.chunks, chunkId, targetCategoryId, targetIndex),
    }))
  }

  const handleChunkDragStart = (event: ReactDragEvent<HTMLDivElement>, chunk: PromptChunk) => {
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData(promptChunkDragType, chunk.id)
    event.dataTransfer.setData("text/plain", chunk.content)
  }

  const handleCategoryDragStart = (event: ReactDragEvent<HTMLDivElement>, categoryId: string) => {
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData(promptChunkCategoryDragType, categoryId)
  }

  const handleCategoryDrop = (event: ReactDragEvent<HTMLElement>, targetCategoryId: string) => {
    const draggedCategoryId = event.dataTransfer.getData(promptChunkCategoryDragType)
    const draggedChunkId = event.dataTransfer.getData(promptChunkDragType)
    if (!draggedCategoryId && !draggedChunkId) {
      return
    }

    event.preventDefault()

    if (draggedCategoryId) {
      setLibraryState((current) => ({
        ...current,
        categories: reorderPromptChunkCategories(current.categories, draggedCategoryId, targetCategoryId),
      }))
      return
    }

    const nextIndex = libraryState.chunks.filter((chunk) => chunk.categoryId === targetCategoryId).length
    moveChunkToGroupIndex(draggedChunkId, targetCategoryId, nextIndex)
  }

  const handleUncategorizedDrop = (event: ReactDragEvent<HTMLElement>) => {
    const draggedChunkId = event.dataTransfer.getData(promptChunkDragType)
    if (!draggedChunkId) {
      return
    }

    event.preventDefault()
    moveChunkToGroupIndex(draggedChunkId, null, uncategorizedChunks.length)
  }

  const handleSaveCategory = () => {
    const name = categoryDraft.name.trim()
    if (!name) {
      return
    }

    const color = normalizePromptChunkColor(categoryDraft.color)
    if (panelMode.kind === "edit-category") {
      setLibraryState((current) => ({
        ...current,
        categories: current.categories.map((category) => (category.id === panelMode.categoryId ? { ...category, color, name } : category)),
      }))
    } else {
      setLibraryState((current) => ({
        ...current,
        categories: current.categories.concat({
          color,
          id: buildPromptChunkId("category"),
          name,
        }),
      }))
    }

    setPanelMode({ kind: "list" })
  }

  const handleSaveChunk = () => {
    const name = chunkDraft.name.trim()
    const content = chunkDraft.content.trim()
    if (!name || !content) {
      return
    }

    const nextChunk = {
      categoryId: chunkDraft.categoryId || null,
      color: normalizePromptChunkColor(chunkDraft.color),
      content,
      name,
    }

    if (panelMode.kind === "edit-chunk") {
      setLibraryState((current) => ({
        ...current,
        chunks: current.chunks.map((chunk) => (chunk.id === panelMode.chunkId ? { ...chunk, ...nextChunk } : chunk)),
      }))
    } else {
      setLibraryState((current) => ({
        ...current,
        chunks: current.chunks.concat({
          ...nextChunk,
          id: buildPromptChunkId("chunk"),
        }),
      }))
    }

    setPanelMode({ kind: "list" })
  }

  if (panelMode.kind !== "list") {
    const isChunkForm = panelMode.kind === "new-chunk" || panelMode.kind === "edit-chunk"
    const formTitle =
      panelMode.kind === "new-category"
        ? "New Category"
        : panelMode.kind === "edit-category"
          ? `Edit Category`
          : panelMode.kind === "new-chunk"
            ? "New Prompt Chunk"
            : "Edit Prompt Chunk"

    return (
      <div className="flex min-h-0 flex-1 flex-col rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(14,15,33)] p-[15px]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[16px] leading-6 text-white">{formTitle}</span>
          <button className="flex h-7 w-7 items-center justify-center rounded-[3px] text-white/70 transition-colors hover:bg-white/5 hover:text-white" onClick={() => setPanelMode({ kind: "list" })} type="button">
            <NovelAIThinCrossIcon className="h-[13px] w-[13px] text-current" />
          </button>
        </div>

        <div className="mt-[14px] flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          <label className="block">
            <span className="mb-[5px] block text-[14px] leading-[21px] text-white/75">Name</span>
            <input
              className="h-[38px] w-full rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(19,21,44)] px-3 text-[14px] leading-[21px] text-white outline-none placeholder:text-white/30"
              onChange={(event) =>
                isChunkForm
                  ? setChunkDraft((current) => ({ ...current, name: event.target.value }))
                  : setCategoryDraft((current) => ({ ...current, name: event.target.value }))
              }
              placeholder={isChunkForm ? "e.g., My Style Tags" : "Category name..."}
              value={isChunkForm ? chunkDraft.name : categoryDraft.name}
            />
          </label>

          {isChunkForm ? (
            <label className="block">
              <span className="mb-[5px] block text-[14px] leading-[21px] text-white/75">Content</span>
              <textarea
                className="min-h-[112px] w-full resize-none rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(19,21,44)] px-3 py-2 text-[14px] leading-[21px] text-white outline-none placeholder:text-white/30"
                onChange={(event) => setChunkDraft((current) => ({ ...current, content: event.target.value }))}
                placeholder="Enter the tags/content this chunk will expand to..."
                value={chunkDraft.content}
              />
            </label>
          ) : null}

          {isChunkForm ? (
            <label className="block">
              <span className="mb-[5px] block text-[14px] leading-[21px] text-white/75">Category</span>
              <select
                className="h-[38px] w-full rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(19,21,44)] px-3 text-[14px] leading-[21px] text-white outline-none"
                onChange={(event) => setChunkDraft((current) => ({ ...current, categoryId: event.target.value }))}
                value={chunkDraft.categoryId}
              >
                <option value="">Uncategorized</option>
                {libraryState.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block">
            <span className="mb-[5px] block text-[14px] leading-[21px] text-white/75">Color</span>
            <div className="flex items-center gap-3 rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(19,21,44)] p-[10px]">
              <input
                className="h-[34px] w-[44px] cursor-pointer rounded-[3px] border border-[rgb(34,37,63)] bg-transparent p-0"
                onChange={(event) =>
                  isChunkForm
                    ? setChunkDraft((current) => ({ ...current, color: event.target.value.toUpperCase() }))
                    : setCategoryDraft((current) => ({ ...current, color: event.target.value.toUpperCase() }))
                }
                type="color"
                value={isChunkForm ? normalizePromptChunkColor(chunkDraft.color) : normalizePromptChunkColor(categoryDraft.color)}
              />
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div
                  className="h-5 w-5 shrink-0 rounded-full border border-white/10"
                  style={{ backgroundColor: isChunkForm ? normalizePromptChunkColor(chunkDraft.color) : normalizePromptChunkColor(categoryDraft.color) }}
                />
                <input
                  className="min-w-0 flex-1 bg-transparent text-[14px] leading-[21px] text-white outline-none placeholder:text-white/30"
                  onChange={(event) =>
                    isChunkForm
                      ? setChunkDraft((current) => ({ ...current, color: event.target.value }))
                      : setCategoryDraft((current) => ({ ...current, color: event.target.value }))
                  }
                  spellCheck={false}
                  value={isChunkForm ? chunkDraft.color : categoryDraft.color}
                />
              </div>
            </div>
          </label>
        </div>

        <div className="mt-4 flex items-center justify-end gap-[10px]">
          <button className="rounded-[3px] border border-[rgb(34,37,63)] px-[14px] py-[7px] text-[14px] leading-[21px] text-white/80 transition-colors hover:border-white/20 hover:text-white" onClick={() => setPanelMode({ kind: "list" })} type="button">
            Cancel
          </button>
          <button
            className={cn(
              "rounded-[3px] px-[14px] py-[7px] text-[14px] leading-[21px] transition-colors",
              (isChunkForm ? chunkDraft.name.trim() && chunkDraft.content.trim() : categoryDraft.name.trim())
                ? "bg-[rgb(245,243,194)] text-[rgb(19,21,44)]"
                : "cursor-not-allowed bg-white/10 text-white/35"
            )}
            disabled={isChunkForm ? !chunkDraft.name.trim() || !chunkDraft.content.trim() : !categoryDraft.name.trim()}
            onClick={isChunkForm ? handleSaveChunk : handleSaveCategory}
            type="button"
          >
            Save
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(14,15,33)] p-[15px]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[16px] leading-6 text-white">Prompt Chunks</span>
          <span className={cn("shrink-0 rounded-full border px-2 py-[2px] text-[11px] leading-4", syncToneClass)}>{syncState.label}</span>
        </div>
        <div className="flex items-center gap-[2px]">
          <button className="flex h-8 w-8 items-center justify-center rounded-[3px] text-white/80 transition-colors hover:bg-white/5 hover:text-white" onClick={openNewCategory} title="Add Category" type="button">
            <FolderPlus className="h-[15px] w-[15px] text-current" strokeWidth={1.8} />
          </button>
          <button className="flex h-8 w-8 items-center justify-center rounded-[3px] text-white/80 transition-colors hover:bg-white/5 hover:text-white" onClick={() => openNewChunk(null)} title="Add Prompt Chunk" type="button">
            <NovelAIImportIcon className="h-[13px] w-[13px] text-current" />
          </button>
          <button className="flex h-8 w-8 items-center justify-center rounded-[3px] text-white/70 transition-colors hover:bg-white/5 hover:text-white" onClick={onClose} type="button">
            <NovelAIThinCrossIcon className="h-[13px] w-[13px] text-current" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
        <div
          className="rounded-[3px] border border-dashed border-[rgb(34,37,63)] bg-[rgb(19,21,44)]/55 p-[10px]"
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes(promptChunkDragType)) {
              event.preventDefault()
            }
          }}
          onDrop={handleUncategorizedDrop}
        >
          {uncategorizedChunks.length > 0 ? (
            <div className="flex flex-wrap items-start gap-2">
              {uncategorizedChunks.map((chunk, index) => (
                <PromptChunkChip
                  chunk={chunk}
                  key={chunk.id}
                  onDragStart={handleChunkDragStart}
                  onDropBefore={(chunkId) => moveChunkToGroupIndex(chunkId, null, index)}
                  onEdit={openEditChunk}
                  onInsert={onInsert}
                />
              ))}
            </div>
          ) : (
            <div className="min-h-[18px]" />
          )}
        </div>

        <div className="mt-3 space-y-3">
          {libraryState.categories.map((category) => {
            const chunks = libraryState.chunks.filter((chunk) => chunk.categoryId === category.id)
            const categoryTint = hexToPromptChunkRgba(category.color, 0.18)
            const categoryBorder = hexToPromptChunkRgba(category.color, 0.48)

            return (
              <div className="rounded-[3px]" key={category.id}>
                <div
                  className="flex items-center gap-2 rounded-[3px] border px-[10px] py-[8px] text-white"
                  draggable
                  onDragOver={(event) => {
                    if (event.dataTransfer.types.includes(promptChunkDragType) || event.dataTransfer.types.includes(promptChunkCategoryDragType)) {
                      event.preventDefault()
                    }
                  }}
                  onDragStart={(event) => handleCategoryDragStart(event, category.id)}
                  onDrop={(event) => handleCategoryDrop(event, category.id)}
                  style={{ backgroundColor: categoryTint, borderColor: categoryBorder }}
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center" style={{ color: category.color }}>
                    <FolderClosed className="h-[14px] w-[14px] text-current" strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] leading-[21px]">{category.name}</span>
                  <span className="text-[12px] leading-[18px] text-white/60">{chunkCounts[category.id] ?? 0}</span>
                  <button
                    className="ml-1 text-[13px] leading-none text-white/75 transition-colors hover:text-white"
                    onClick={(event) => {
                      event.stopPropagation()
                      openEditCategory(category.id)
                    }}
                    title="Edit Category"
                    type="button"
                  >
                    ✎
                  </button>
                </div>
                <div
                  className="mt-[2px] rounded-[3px] bg-[rgb(19,21,44)] px-[10px] py-[10px]"
                  onDragOver={(event) => {
                    if (event.dataTransfer.types.includes(promptChunkDragType)) {
                      event.preventDefault()
                    }
                  }}
                  onDrop={(event) => {
                    const draggedChunkId = event.dataTransfer.getData(promptChunkDragType)
                    if (!draggedChunkId) {
                      return
                    }

                    event.preventDefault()
                    moveChunkToGroupIndex(draggedChunkId, category.id, chunks.length)
                  }}
                >
                  {chunks.length > 0 ? (
                    <div className="flex flex-wrap items-start gap-2">
                      {chunks.map((chunk, index) => (
                        <PromptChunkChip
                          chunk={chunk}
                          key={chunk.id}
                          onDragStart={handleChunkDragStart}
                          onDropBefore={(chunkId) => moveChunkToGroupIndex(chunkId, category.id, index)}
                          onEdit={openEditChunk}
                          onInsert={onInsert}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-[12px] italic leading-[18px] text-white/45">Empty category</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex-1" />

        <div className="mt-4 flex justify-start">
          <button
            className="rounded-[3px] border border-[rgb(34,37,63)] px-[12px] py-[7px] text-[14px] leading-[21px] text-white/80 transition-colors hover:border-white/20 hover:text-white"
            onClick={() => setLibraryState({ categories: [], chunks: [] })}
            type="button"
          >
            Delete All
          </button>
        </div>
      </div>
    </div>
  )
}

function PromptChunkChip({
  chunk,
  onDragStart,
  onDropBefore,
  onEdit,
  onInsert,
}: {
  chunk: PromptChunk
  onDragStart: (event: ReactDragEvent<HTMLDivElement>, chunk: PromptChunk) => void
  onDropBefore: (chunkId: string) => void
  onEdit: (chunkId: string) => void
  onInsert: (content: string) => void
}) {
  return (
    <div
      className="inline-flex max-w-full cursor-pointer items-center gap-2 rounded-[3px] border px-[10px] py-[8px] text-left text-white transition-colors hover:border-white/15 hover:text-white"
      draggable
      onClick={() => onInsert(chunk.content)}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(promptChunkDragType)) {
          event.preventDefault()
        }
      }}
      onDragStart={(event) => onDragStart(event, chunk)}
      onDrop={(event) => {
        const draggedChunkId = event.dataTransfer.getData(promptChunkDragType)
        if (!draggedChunkId || draggedChunkId === chunk.id) {
          return
        }

        event.preventDefault()
        event.stopPropagation()
        onDropBefore(draggedChunkId)
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onInsert(chunk.content)
        }
      }}
      role="button"
      style={{ backgroundColor: hexToPromptChunkRgba(chunk.color, 0.16), borderColor: hexToPromptChunkRgba(chunk.color, 0.44) }}
      tabIndex={0}
      title={`${chunk.content}\n\nClick to insert, drag to reorder`}
    >
      <span className="truncate text-[13px] leading-5">{chunk.name}</span>
      <button
        className="shrink-0 text-[13px] leading-none text-white/75 transition-colors hover:text-white"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onEdit(chunk.id)
        }}
        title="Edit Chunk"
        type="button"
      >
        ✎
      </button>
    </div>
  )
}

function normalizePromptChunkColor(value: string) {
  const trimmedValue = value.trim()
  const normalizedValue = trimmedValue.startsWith("#") ? trimmedValue : `#${trimmedValue}`
  return /^#[0-9A-Fa-f]{6}$/.test(normalizedValue) ? normalizedValue.toUpperCase() : defaultPromptChunkColor
}

function hexToPromptChunkRgba(hex: string, alpha: number) {
  const normalizedHex = normalizePromptChunkColor(hex).slice(1)
  const red = Number.parseInt(normalizedHex.slice(0, 2), 16)
  const green = Number.parseInt(normalizedHex.slice(2, 4), 16)
  const blue = Number.parseInt(normalizedHex.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function buildPromptChunkId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
}

function reorderPromptChunkCategories(categories: PromptChunkCategory[], sourceId: string, targetId: string) {
  const sourceIndex = categories.findIndex((category) => category.id === sourceId)
  const targetIndex = categories.findIndex((category) => category.id === targetId)
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return categories
  }

  const nextCategories = categories.slice()
  const [sourceCategory] = nextCategories.splice(sourceIndex, 1)
  nextCategories.splice(targetIndex, 0, sourceCategory)
  return nextCategories
}

function movePromptChunkToGroupIndex(chunks: PromptChunk[], chunkId: string, targetCategoryId: string | null, targetIndex: number) {
  const sourceChunk = chunks.find((chunk) => chunk.id === chunkId)
  if (!sourceChunk) {
    return chunks
  }

  const remainingChunks = chunks.filter((chunk) => chunk.id !== chunkId)
  const targetChunks = remainingChunks.filter((chunk) => chunk.categoryId === targetCategoryId)
  const normalizedTargetIndex = Math.max(0, Math.min(targetIndex, targetChunks.length))
  const targetBeforeChunkId = targetChunks[normalizedTargetIndex]?.id ?? null
  const insertIndex = targetBeforeChunkId
    ? remainingChunks.findIndex((chunk) => chunk.id === targetBeforeChunkId)
    : findPromptChunkGroupInsertIndex(remainingChunks, targetCategoryId)
  const nextChunks = remainingChunks.slice()

  nextChunks.splice(insertIndex === -1 ? remainingChunks.length : insertIndex, 0, {
    ...sourceChunk,
    categoryId: targetCategoryId,
  })

  return nextChunks
}

function findPromptChunkGroupInsertIndex(chunks: PromptChunk[], targetCategoryId: string | null) {
  let insertIndex = chunks.length

  chunks.forEach((chunk, index) => {
    if (chunk.categoryId === targetCategoryId) {
      insertIndex = index + 1
    }
  })

  return insertIndex
}

function getTextareaCursorFromPoint(textarea: HTMLTextAreaElement, clientX: number, clientY: number) {
  const rect = textarea.getBoundingClientRect()
  const targetX = clientX - rect.left + textarea.scrollLeft
  const targetY = clientY - rect.top + textarea.scrollTop
  const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 26
  let low = 0
  let high = textarea.value.length
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const position = measureTextareaCaretPosition(textarea, mid)
    const distance = Math.abs(position.top - targetY) * lineHeight + Math.abs(position.left - targetX)

    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = mid
    }

    if (position.top < targetY || (Math.abs(position.top - targetY) < lineHeight / 2 && position.left < targetX)) {
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  const candidateStart = Math.max(0, Math.min(low, high) - 3)
  const candidateEnd = Math.min(textarea.value.length, Math.max(low, high) + 3)
  for (let index = candidateStart; index <= candidateEnd; index += 1) {
    const position = measureTextareaCaretPosition(textarea, index)
    const distance = Math.abs(position.top - targetY) * lineHeight + Math.abs(position.left - targetX)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  }

  return bestIndex
}

function measureTextareaCaretPosition(textarea: HTMLTextAreaElement, index: number) {
  const mirror = window.document.createElement("div")
  const marker = window.document.createElement("span")
  const style = window.getComputedStyle(textarea)

  ;[
    "borderBottomWidth",
    "borderLeftWidth",
    "borderRightWidth",
    "borderTopWidth",
    "boxSizing",
    "fontFamily",
    "fontFeatureSettings",
    "fontKerning",
    "fontSize",
    "fontStretch",
    "fontStyle",
    "fontVariant",
    "fontWeight",
    "letterSpacing",
    "lineHeight",
    "paddingBottom",
    "paddingLeft",
    "paddingRight",
    "paddingTop",
    "tabSize",
    "textAlign",
    "textIndent",
    "textTransform",
    "width",
  ].forEach((property) => {
    mirror.style.setProperty(property, style.getPropertyValue(property))
  })

  mirror.style.left = "-9999px"
  mirror.style.pointerEvents = "none"
  mirror.style.position = "absolute"
  mirror.style.top = "0"
  mirror.style.visibility = "hidden"
  mirror.style.whiteSpace = "pre-wrap"
  mirror.style.wordBreak = "break-word"
  mirror.style.overflowWrap = "break-word"

  mirror.textContent = textarea.value.slice(0, index)
  marker.textContent = "​"
  mirror.append(marker)
  window.document.body.append(mirror)

  const left = marker.offsetLeft
  const top = marker.offsetTop
  mirror.remove()

  return { left, top }
}

function syncTextareaHeight({
  textarea,
  minHeight,
  overlay,
}: {
  textarea: HTMLTextAreaElement | null
  minHeight: number
  overlay?: HTMLDivElement | null
}) {
  if (!textarea) {
    return
  }

  textarea.style.height = "0px"
  const nextHeight = Math.max(minHeight, textarea.scrollHeight)
  textarea.style.height = `${nextHeight}px`

  if (overlay) {
    overlay.style.height = `${nextHeight}px`
  }
}

function PromptEditor({
  highlightEmphasis,
  onChange,
  onChunkDragStateChange,
  onChunkDrop,
  onCursorChange,
  onFocus,
  textareaRef: providedTextareaRef,
  value,
}: {
  highlightEmphasis: boolean
  onChange: (value: string, cursor: number, meta?: TextInputChangeMeta) => void
  onChunkDragStateChange?: (isActive: boolean) => void
  onChunkDrop?: (content: string, cursor: number) => void
  onCursorChange?: (cursor: number) => void
  onFocus?: (cursor: number) => void
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>
  value: string
}) {
  const overlayScrollRef = useRef<HTMLDivElement | null>(null)
  const internalTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const textareaRef = providedTextareaRef ?? internalTextareaRef

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      syncTextareaHeight({
        textarea: textareaRef.current,
        minHeight: 96,
        overlay: overlayScrollRef.current,
      })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [textareaRef, value])

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return
    }

    const textarea = textareaRef.current
    if (!textarea) {
      return
    }

    let frameId: number | null = null
    const observer = new ResizeObserver(() => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }

      frameId = window.requestAnimationFrame(() => {
        syncTextareaHeight({
          textarea,
          minHeight: 96,
          overlay: overlayScrollRef.current,
        })
      })
    })

    observer.observe(textarea)
    if (textarea.parentElement) {
      observer.observe(textarea.parentElement)
    }

    return () => {
      observer.disconnect()
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
    }
  }, [textareaRef])

  return (
    <div className="bg-[rgb(14,15,33)] px-[15px] py-[5px]">
      <div className="relative">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="overflow-hidden" ref={overlayScrollRef}>
            <div className="min-h-[96px] whitespace-pre-wrap break-words [word-break:break-word] font-sans text-[16px] leading-[26px] tracking-normal text-white">
              {renderPromptOverlay(value, highlightEmphasis)}
              {"​"}
            </div>
          </div>
        </div>
        <textarea
          className="relative z-10 min-h-[96px] w-full resize-none overflow-hidden bg-transparent font-sans text-[16px] leading-[26px] tracking-normal text-transparent caret-white outline-none selection:bg-white/15"
          onChange={(event) =>
            onChange(event.target.value, event.target.selectionStart ?? event.target.value.length, {
              inputType: event.nativeEvent instanceof InputEvent ? event.nativeEvent.inputType : null,
              isTrusted: event.nativeEvent.isTrusted,
            })
          }
          onDragLeave={(event) => {
            if (event.dataTransfer.types.includes(promptChunkDragType)) {
              onChunkDragStateChange?.(false)
            }
          }}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes(promptChunkDragType)) {
              return
            }

            event.preventDefault()
            onChunkDragStateChange?.(true)
            const cursor = getTextareaCursorFromPoint(event.currentTarget, event.clientX, event.clientY)
            event.currentTarget.focus()
            event.currentTarget.setSelectionRange(cursor, cursor)
            onCursorChange?.(cursor)
          }}
          onDrop={(event) => {
            const content = event.dataTransfer.getData("text/plain")
            if (!content) {
              return
            }

            event.preventDefault()
            onChunkDragStateChange?.(false)
            const cursor = getTextareaCursorFromPoint(event.currentTarget, event.clientX, event.clientY)
            event.currentTarget.focus()
            event.currentTarget.setSelectionRange(cursor, cursor)
            onChunkDrop?.(content, cursor)
          }}
          onFocus={(event) => onFocus?.(event.target.selectionStart ?? event.target.value.length)}
          onSelect={(event) => onCursorChange?.(event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
          ref={textareaRef}
          value={value}
        />
      </div>
    </div>
  )
}

function SuggestionsDock({
  isLoading,
  onDismiss,
  onSelect,
  suggestions,
}: {
  isLoading: boolean
  onDismiss: () => void
  onSelect: (suggestion: string) => void
  suggestions: PromptSuggestionOption[]
}) {
  return (
    <div className="bg-[rgb(14,15,33)] px-[15px] pb-[10px] pt-0">
      <PromptSuggestionsPopover isLoading={isLoading} onDismiss={onDismiss} onSelect={onSelect} suggestions={suggestions} />
    </div>
  )
}

function PromptSuggestionsPopover({
  isLoading,
  onDismiss,
  onSelect,
  suggestions,
}: {
  isLoading: boolean
  onDismiss: () => void
  onSelect: (suggestion: string) => void
  suggestions: PromptSuggestionOption[]
}) {
  return (
    <div className="pointer-events-auto overflow-hidden rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] transition-[opacity,transform] duration-200 ease-out">
      <div className="relative px-[15px] pb-0 pt-[15px] text-[14px] leading-[21px] text-white/80">
        <span>Did you mean?</span>
        <button className="absolute right-[15px] top-[15px] flex h-4 w-4 items-center justify-center text-white transition-opacity hover:opacity-80" onClick={onDismiss} type="button">
          <NovelAIThinCrossIcon className="h-4 w-4 text-current" />
        </button>
      </div>
      {isLoading ? <PromptSuggestionsLoading /> : null}
      {!isLoading ? (
        <div className="flex flex-wrap content-start gap-[5px] px-[15px] pb-[15px] pt-[15px]">
          {suggestions.length > 0 ? (
            suggestions.map((suggestion) => (
              <div className="shrink-0" key={suggestion.label}>
                <button
                  className="flex min-h-[30px] items-center rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(19,21,44)] px-[10px] py-[4px] text-left text-[14px] leading-[21px] text-white transition-colors hover:border-white/20 hover:text-white"
                  onClick={() => onSelect(suggestion.label)}
                  type="button"
                >
                  <div className="flex items-center gap-[10px]">
                    <span className="whitespace-nowrap">{suggestion.label}</span>
                    <span className="h-[8px] w-[8px] shrink-0 rounded-full" style={{ backgroundColor: getSuggestionBadgeColor(suggestion.confidence) }} />
                  </div>
                </button>
              </div>
            ))
          ) : (
            <div className="px-[4px] py-[4px] text-[14px] leading-[21px] text-white/80">No tags found.</div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function PromptSuggestionsLoading() {
  return (
    <div className="flex items-center justify-center px-[15px] py-[15px]">
      <div className="flex w-[52px] flex-col items-center gap-[6px]">
        <div className="h-[6px] w-[42px] overflow-hidden rounded-full bg-[rgb(34,37,63)]">
          <div className="animate-novelai-loader h-full w-[22px] rounded-full bg-white/80" />
        </div>
        <div className="h-[6px] w-[28px] overflow-hidden rounded-full bg-[rgb(34,37,63)]">
          <div className="animate-novelai-loader-delayed h-full w-[14px] rounded-full bg-white/55" />
        </div>
      </div>
    </div>
  )
}

function getSuggestionBadgeColor(confidence: number | null) {
  if (confidence === null) {
    return "rgb(196,196,196)"
  }

  const intensity = Math.round(120 + confidence * 135)
  return `rgb(${intensity}, ${intensity}, ${intensity})`
}

function renderPromptOverlay(value: string, highlightEmphasis: boolean) {
  if (!value) {
    return null
  }

  if (!highlightEmphasis) {
    return value
  }

  const parts: ReactNode[] = []
  const pattern = /(-?\d+(?:\.\d+)?)::([\s\S]*?)::/g
  let cursor = 0

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > cursor) {
      parts.push(<span key={`plain-${cursor}`}>{value.slice(cursor, index)}</span>)
    }

    const weight = Number(match[1])
    if (weight === 1) {
      parts.push(
        <span key={`prefix-${index}`} style={getPromptEmphasisStyle(weight)}>
          {`${match[1]}::`}
        </span>
      )
      parts.push(<span key={`content-${index}`}>{match[2]}</span>)
    } else {
      parts.push(
        <span key={`prefix-${index}`} style={getPromptEmphasisStyle(weight)}>
          {`${match[1]}::${match[2]}`}
        </span>
      )
    }

    parts.push(
      <span key={`suffix-${index}`} style={getPromptEmphasisSuffixStyle()}>
        ::
      </span>
    )
    cursor = index + match[0].length
  }

  if (cursor < value.length) {
    parts.push(<span key={`tail-${cursor}`}>{value.slice(cursor)}</span>)
  }

  return parts
}

function getPromptEmphasisStyle(weight: number) {
  if (weight === 1) {
    return getPromptEmphasisSuffixStyle()
  }

  const distance = Math.abs(weight - 1)
  const alpha = distance >= 1 ? 0.6 : distance >= 0.8 ? 0.525 : distance >= 0.6 ? 0.45 : distance >= 0.4 ? 0.35 : 0.275
  const color = weight > 1 ? `rgba(184, 55, 0, ${alpha})` : `rgba(4, 102, 206, ${alpha})`

  return {
    backgroundColor: color,
    borderRadius: "2px",
  }
}

function getPromptEmphasisSuffixStyle() {
  return {
    backgroundColor: "rgba(0, 151, 7, 0.5)",
    borderRadius: "2px",
  }
}

function InlineHelpTooltip({
  body,
  label,
  textClassName = "text-white/70",
  title,
}: {
  body: string
  label: string
  textClassName?: string
  title: string
}) {
  return (
    <div className={cn("flex flex-row items-center", textClassName)}>
      <span>{label}</span>
      <div className="group relative ml-[0.3rem] flex h-[16px] w-[16px] items-center justify-center text-current">
        <InfoCircleIcon className="h-[14px] w-[14px] text-current" />
        <div className="pointer-events-none invisible absolute bottom-[calc(100%+10px)] right-[-6px] z-20 w-[292px] translate-y-1 rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] px-3 py-2 text-left text-[12px] leading-[18px] text-white opacity-0 shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition-[opacity,transform,visibility] duration-200 ease-out will-change-[opacity,transform] group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
          <p>{title}</p>
          <p className="mt-1 text-white/75">{body}</p>
        </div>
      </div>
    </div>
  )
}

function CompactCheckboxRow({
  checked,
  description,
  label,
  onToggle,
}: {
  checked: boolean
  description?: string
  label: string
  onToggle: () => void
}) {
  return (
    <button className={cn("flex w-full items-start justify-between gap-[10px] text-left", description ? "min-h-[51px]" : "min-h-[24px]")} onClick={onToggle} type="button">
      <div className="min-w-0 flex-1">
        <div className="text-[14px] leading-[21px] text-white">{label}</div>
        {description ? <div className="mt-[6px] text-[12px] leading-[18px] text-white/55">{description}</div> : null}
      </div>
      <span className="mt-[2px] shrink-0">
        <OfficialSwitch checked={checked} />
      </span>
    </button>
  )
}

function UploadSlotRow({
  actions,
  keyName,
  label,
  state,
}: {
  actions: NovelAIWorkspaceActions
  keyName: UploadSlotKey
  label: string
  state: NovelAIWorkspaceState
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const asset = state.document.baseImageSource.kind === "none" ? null : state.document.baseImageSource.asset
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <div className={cn("mt-0 rounded-b-[3px] bg-[rgb(19,21,44)] text-white ring-1 ring-[rgb(34,37,63)]", asset ? "px-0 py-0" : "px-[10px] py-[10px]")}>
      <input
        className="hidden"
        onChange={(event) => actions.setUpload(keyName, event.target.files?.[0] ?? null)}
        ref={inputRef}
        type="file"
      />

      {asset ? (
        <div className="relative overflow-hidden rounded-b-[3px]">
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 z-0 rounded-b-[3px] bg-cover bg-center bg-no-repeat opacity-[0.35]",
              isCollapsed && "hidden"
            )}
            style={{ backgroundImage: `url(${asset.src})` }}
          />
          <div className={cn("relative z-10", isCollapsed ? "px-5 pb-5 pl-5 pr-[10px] pt-5" : "px-5 pt-5")}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[16px] leading-6 font-semibold text-white">Image2Image</div>
                <div className="text-[14px] leading-[21px] text-white/70">Transform your image.</div>
              </div>
              <div className="flex items-center gap-[10px]">
                <div className="flex items-center rounded-[3px] bg-[rgb(14,15,33)]">
                  <div className="h-6 w-px bg-[rgb(34,37,63)]" />
                  <button className="flex h-[44px] w-[44px] items-center justify-center text-white/85 transition-colors hover:bg-[rgb(24,27,52)] hover:text-white" onClick={() => actions.openImageEditor("edit")} type="button">
                    <NovelAIPenIcon className="h-4 w-4 text-current" />
                  </button>
                  <div className="h-6 w-px bg-[rgb(34,37,63)]" />
                  <button className="flex h-[44px] w-[44px] items-center justify-center text-white/85 transition-colors hover:bg-[rgb(24,27,52)] hover:text-white" onClick={() => actions.removeUpload(keyName)} type="button">
                    <NovelAITrashIcon className="h-4 w-4 text-current" />
                  </button>
                </div>
                <button className={cn("flex items-center justify-center pl-[5px] text-white/75 transition-colors hover:text-white", isCollapsed ? "h-[44px] pr-[10px]" : "h-[44px] w-[21px]")} onClick={() => setIsCollapsed((current) => !current)} type="button">
                  <span
                    aria-hidden="true"
                    className="block h-4 w-4 bg-contain bg-center bg-no-repeat"
                    style={{
                      backgroundImage: `url(${isCollapsed ? "https://novelai.net/_next/static/media/unfold.df1e363f.svg" : "https://novelai.net/_next/static/media/fold.faaf6d0f.svg"})`,
                    }}
                  />
                </button>
              </div>
            </div>

            {!isCollapsed ? (
              <>
                <div className="mt-[10px] w-full space-y-[10px]">
                  <UploadSliderRow label="Strength:" max={0.99} min={0.01} onChange={actions.setImg2ImgStrength} step={0.01} value={state.document.img2img.strength} widthClassName="w-[38px]" />
                  <UploadSliderRow label="Noise:" max={0.99} min={0} onChange={actions.setImg2ImgNoise} step={0.01} value={state.document.img2img.noise} widthClassName="w-[24px]" />
                  <div className="flex flex-wrap gap-[10px] pt-[2px] text-[14px] leading-[21px]">
                    <button className="inline-flex h-[38px] items-center gap-[8px] rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(14,15,33)] px-3 text-white/90 transition-colors hover:border-[rgb(58,63,104)] hover:text-white" onClick={() => actions.openImageEditor("inpaint")} type="button">
                      <NovelAIPenIcon className="h-4 w-4 text-current" />
                      <span>Inpaint Image</span>
                    </button>
                  </div>
                </div>
                <div className="relative z-10 flex max-w-full pb-5" />
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex min-h-[44px] items-center justify-between gap-3">
          <div className="pl-[10px] text-[14px] leading-[21px] text-white/70">{label}</div>
          <div className="flex items-center gap-[10px] text-white/85">
            <div className="flex items-center rounded-[3px] bg-[rgb(14,15,33)]">
              <button className="px-[14px] py-[14px]" onClick={() => inputRef.current?.click()} type="button">
                <NovelAIImportIcon className="h-4 w-4 text-white" />
              </button>
              <div className="h-6 w-px bg-[rgb(34,37,63)]" />
              <button className="px-[14px] py-[14px]" onClick={() => actions.openImageEditor("edit")} type="button">
                <NovelAIPenIcon className="h-4 w-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}

      {state.ui.imageEditorOpen ? <BaseImageEditorOverlay actions={actions} asset={asset} brushSize={state.ui.imageEditorBrushSize} mode={state.ui.imageEditorMode} /> : null}
    </div>
  )
}

function FeatureUploadCard({
  actions,
  icon,
  keyName,
  state,
  title,
}: {
  actions: NovelAIWorkspaceActions
  icon: ReactNode
  keyName: UploadSlotKey
  state: NovelAIWorkspaceState
  title: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const isPreciseReference = keyName === "preciseReference"
  const description = isPreciseReference ? "Add a reference image for a character or style." : "Change the image, keep the vision."
  const vibeReferences = state.document.vibeTransfer.references
  const preciseReferences = state.document.preciseReferences.references
  const references = isPreciseReference ? preciseReferences : vibeReferences

  return (
    <div className={isPreciseReference ? "rounded-[4px] border border-[rgb(34,37,63)] px-[8px] pr-[10px] py-[12px] text-white" : "rounded-[3px] border border-[rgb(34,37,63)] pt-[13px] text-white"}>
      <input className="hidden" onChange={(event) => actions.setUpload(keyName, event.target.files?.[0] ?? null)} ref={inputRef} type="file" />
      <div className={isPreciseReference ? "flex flex-row items-center justify-between gap-[10px] pl-[8px] pr-[10px]" : "flex items-center justify-between px-5"}>
        <div className={isPreciseReference ? "flex items-center gap-3" : "flex items-center gap-[15px]"}>
          <div className="text-white/90">{icon}</div>
          <div>
            <div className="text-[14px] leading-[21px] font-semibold text-white">
              {title}
              {references.length > 0 ? <span className="ml-[6px] text-[14px] font-normal leading-[21px] text-white/60">({references.length})</span> : null}
            </div>
            <div className="text-[14px] leading-[21px] text-white/70">{description}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="px-[14px] py-[14px] text-white/85" onClick={() => inputRef.current?.click()} type="button">
            <NovelAIImportIcon className="h-4 w-4 text-white" />
          </button>
          {isPreciseReference && references.length > 1 ? (
            <div className="group relative flex h-[42px] w-[44px] items-center justify-center">
              <button className="flex h-[42px] w-[44px] items-center justify-center rounded-[3px] text-white/80 hover:bg-[rgb(34,37,63)] hover:text-white" type="button">
                <NovelAIExportIcon className="h-[16px] w-[16px] text-white" />
              </button>
              <div className="pointer-events-none absolute bottom-[calc(100%+8px)] right-0 hidden w-[259px] rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] px-3 py-[13px] text-center text-[14px] leading-[21px] text-[rgb(245,243,194)] shadow-[0_12px_30px_rgba(0,0,0,0.35)] group-hover:block">
                Download All Precise References as ZIP
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {!isPreciseReference && references.length > 0 ? (
        <div className="mt-[10px] px-5">
          <button className="flex w-full items-center justify-between gap-[10px] text-left" onClick={actions.toggleVibeNormalize} type="button">
            <span className="text-[14px] leading-[21px] text-white/85">Normalize Reference Strength Values</span>
            <OfficialSwitch checked={state.document.vibeTransfer.normalizeReferenceStrengthValues} />
          </button>
        </div>
      ) : null}

      {references.length > 0 ? <div className="mt-[10px] h-px w-full bg-[rgb(34,37,63)]" /> : null}

      <div className={isPreciseReference ? "space-y-3 pt-3" : "space-y-3 px-5 pb-[10px] pt-[12px]"}>
        {isPreciseReference
          ? preciseReferences.map((reference) => (
              <PreciseReferenceCard actions={actions} key={reference.id} keyName={keyName} reference={reference} />
            ))
          : vibeReferences.map((reference) => (
              <div className="relative text-[16px] leading-6 text-white" key={reference.id}>
                <div className="flex items-start justify-between gap-[12px] pb-[10px]">
                  <div className="flex min-w-0 flex-1 items-start gap-[14px]">
                    <button className="mt-px flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[3px] text-white/80 hover:bg-[rgb(34,37,63)]" onClick={() => actions.removeUpload(keyName, reference.id)} type="button">
                      <NovelAITrashIcon className="h-[14px] w-[14px] text-white" />
                    </button>
                    <div className="relative min-w-0 flex-1 border-b border-[rgb(34,37,63)] pb-[2px] text-[16px] leading-6 text-white" title={reference.identifier}>
                      <div className="break-words">{reference.identifier}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-[5px]">
                    <button className="inline-flex h-[30px] items-center justify-end gap-[6px] rounded-[3px] border border-[rgb(34,37,63)] px-[8px] text-[16px] leading-6 text-white/90" type="button">
                      <span>2</span>
                      <AnlasGemIcon className="h-[10px] w-[10px] text-[rgb(245,243,194)]" />
                    </button>
                    <button className="flex h-[30px] w-[30px] items-center justify-center rounded-[3px] border border-[rgb(34,37,63)] text-white/80 hover:border-[rgb(84,88,120)] hover:text-white" onClick={actions.toggleVibeNormalize} type="button">
                      {state.document.vibeTransfer.normalizeReferenceStrengthValues ? <NovelAICheckIcon className="h-[12px] w-[12px] text-white" /> : <NovelAIThinCrossIcon className="h-[12px] w-[12px] text-white" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-stretch gap-[8px]">
                  <div className="relative h-[100px] w-[100px] shrink-0 overflow-hidden rounded-[3px] bg-[rgb(19,21,44)]">
                    <Image alt="upload preview" className="object-cover" fill sizes="100px" src={reference.asset.src} unoptimized />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-[10px]">
                    <UploadSliderRow label="Reference Strength" max={1} min={0.01} onChange={(value) => actions.setVibeReferenceStrength(reference.id, value)} step={0.01} value={reference.referenceStrength} widthClassName="w-[34px]" />
                    <UploadSliderRow label="Information Extracted" max={1} min={0.01} onChange={(value) => actions.setVibeReferenceInformation(reference.id, value)} step={0.01} value={reference.informationExtracted} widthClassName="w-[22px]" />
                  </div>
                </div>
                <div className="pt-[10px] text-[16px] leading-6 text-white/70">
                  Encoding required. This will cost <span className="text-white">2</span>
                  <span className="ml-[4px] inline-flex items-center gap-[4px] text-white"><AnlasGemIcon className="h-[10px] w-[10px] text-[rgb(245,243,194)]" />Anlas</span>
                  <span> on the next generation.</span>
                  <a className="text-white underline underline-offset-2" href="https://docs.novelai.net/en/image/vibetransfer" rel="noreferrer" target="_blank">
                    {" "}Learn more here.
                  </a>
                </div>
              </div>
            ))}
      </div>
    </div>
  )
}

type PreciseReferenceKind = NovelAIWorkspaceState["document"]["preciseReferences"]["references"][number]["kind"]
type PreciseReferenceEntry = NovelAIWorkspaceState["document"]["preciseReferences"]["references"][number]

function PreciseReferenceCard({
  actions,
  keyName,
  reference,
}: {
  actions: NovelAIWorkspaceActions
  keyName: UploadSlotKey
  reference: PreciseReferenceEntry
}) {
  const [kindMenuOpen, setKindMenuOpen] = useState(false)
  const kindMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!kindMenuOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!kindMenuRef.current?.contains(event.target as Node)) {
        setKindMenuOpen(false)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [kindMenuOpen])

  return (
    <div className="rounded-[4px] border border-[rgb(34,37,63)] px-[10px] py-[12px] pl-[8px] font-sans text-[16px] leading-6 text-white [word-break:break-word]">
      <div className="flex w-full items-stretch gap-[8px]">
        <div className="flex w-[112px] shrink-0 flex-col justify-between gap-[8px]">
          <div className="flex gap-[8px]">
            <button className="flex min-h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[3px] p-[8px] text-white/80 hover:bg-[rgb(34,37,63)] hover:text-white" onClick={() => actions.removeUpload(keyName, reference.id)} type="button">
              <NovelAITrashIcon className="h-[12px] w-[12px] text-white" />
            </button>
            <button className="flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-[6px] rounded-[3px] px-[8px] text-[12px] leading-[18px] text-white/90 hover:bg-[rgb(34,37,63)]" onClick={() => actions.setPreciseReferenceEnabled(reference.id, !reference.enabled)} type="button">
              <span>{reference.enabled ? "Enabled" : "Disabled"}</span>
              {reference.enabled ? <NovelAICheckIcon className="h-[12px] w-[12px] text-current" /> : <NovelAIThinCrossIcon className="h-[12px] w-[12px] text-current" />}
            </button>
          </div>
          <div className="relative h-[100px] w-full overflow-hidden rounded-[3px] bg-[rgb(19,21,44)]">
            <Image alt="upload preview" className="object-cover" fill sizes="112px" src={reference.asset.src} unoptimized />
          </div>
        </div>
        <div className="min-w-0 flex-[1_1_0px] opacity-100">
          <div className="relative" ref={kindMenuRef}>
            <button className="flex min-h-[38px] w-full items-center justify-between rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(14,15,33)] px-3 text-left text-[16px] leading-6 text-white" onClick={() => setKindMenuOpen((current) => !current)} type="button">
              <span className="inline-flex items-center gap-2">
                {renderPreciseReferenceKindIcon(reference.kind)}
                <span>{formatPreciseKind(reference.kind)}</span>
              </span>
              <ChevronDownIcon className={cn("h-5 w-5 text-white/85 transition-transform duration-150", kindMenuOpen && "rotate-180")} />
            </button>
            {kindMenuOpen ? (
              <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] p-1 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
                {getPreciseReferenceKindOptions().map((option) => (
                  <button
                    aria-pressed={reference.kind === option.value}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-[3px] px-3 py-2 text-left text-[16px] leading-6",
                      reference.kind === option.value ? "bg-[rgb(34,37,63)] text-white" : "text-white/85 hover:bg-white/5"
                    )}
                    key={option.value}
                    onClick={() => {
                      actions.setPreciseReferenceKind(reference.id, option.value)
                      setKindMenuOpen(false)
                    }}
                    type="button"
                  >
                    {option.icon}
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="h-[10px]" />
          <div className="space-y-[10px]">
            <PreciseReferenceSliderRow label="Strength:" onChange={(value) => actions.setPreciseReferenceStrength(reference.id, value)} value={reference.strength} />
            <PreciseReferenceSliderRow label="Fidelity:" onChange={(value) => actions.setPreciseReferenceFidelity(reference.id, value)} value={reference.fidelity} />
          </div>
        </div>
      </div>
    </div>
  )
}

function PreciseReferenceSliderRow({
  label,
  onChange,
  value,
}: {
  label: string
  onChange: (value: number) => void
  value: number
}) {
  const [draft, setDraft] = useState(formatPreciseReferenceSliderValue(value))
  const [isFocused, setIsFocused] = useState(false)
  const displayValue = isFocused ? draft : formatPreciseReferenceSliderValue(value)

  return (
    <div className="m-0">
      <div className="flex items-center">
        <div className="mr-[0.5ch] text-[16px] leading-6 text-white/85">{label}</div>
        <div className="min-w-0">
          <div className="flex items-center">
            <input
              className="number-field bg-transparent text-[16px] leading-6 text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              inputMode="decimal"
              onBlur={() => {
                setIsFocused(false)
                if (draft === "") {
                  setDraft(formatPreciseReferenceSliderValue(value))
                }
              }}
              onChange={(event) => {
                const nextValue = event.target.value
                if (nextValue !== "" && !/^\d*(?:\.\d*)?$/.test(nextValue)) {
                  return
                }
                setDraft(nextValue)
                if (nextValue !== "") {
                  onChange(clampPreciseReferenceValue(Number(nextValue)))
                }
              }}
              onFocus={() => {
                setDraft(formatPreciseReferenceSliderValue(value))
                setIsFocused(true)
              }}
              step="0.05"
              style={{ width: `${Math.max(displayValue.length, 1.3)}ch` }}
              type="number"
              value={displayValue}
            />
          </div>
          <div className="h-px bg-[rgb(34,37,63)]" />
        </div>
      </div>
      <div className="pt-[6px]">
        <RangeField max={1} min={0} onChange={onChange} step={0.05} value={value} />
      </div>
    </div>
  )
}

function getPreciseReferenceKindOptions(): Array<{ icon: ReactNode; label: string; value: PreciseReferenceKind }> {
  return [
    {
      value: "character_style",
      label: "Character & Style",
      icon: <NovelAIPreciseReferenceIcon className="h-4 w-4 text-white/85" />,
    },
    {
      value: "character",
      label: "Character",
      icon: <UserRound className="h-4 w-4 text-white/85" strokeWidth={2.05} />,
    },
    {
      value: "style",
      label: "Style",
      icon: <NovelAIPenIcon className="h-4 w-4 text-white/85" />,
    },
  ]
}

function renderPreciseReferenceKindIcon(kind: PreciseReferenceKind) {
  return getPreciseReferenceKindOptions().find((option) => option.value === kind)?.icon ?? <NovelAIPreciseReferenceIcon className="h-4 w-4 text-white/85" />
}

function formatPreciseKind(kind: PreciseReferenceKind) {
  if (kind === "character") {
    return "Character"
  }

  if (kind === "style") {
    return "Style"
  }

  return "Character & Style"
}

function clampPreciseReferenceValue(value: number) {
  return Math.min(Math.max(value, 0), 1)
}

function formatPreciseReferenceSliderValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
}

const imageEditorBrushPixelScale = 10
const imageEditorPaintBrushMin = 5
const imageEditorPaintBrushMax = 100
const imageEditorMaskRgb = "87, 82, 178"
const imageEditorMaskBorderColor = "rgba(18, 18, 58, 0.62)"

type ImageEditorTool = "draw" | "erase" | "fill" | "select" | "lasso" | "picker" | "blur" | "clone"
type ImageEditorMaskPattern = "Solid" | "Lines" | "Crosshatch" | "Dots" | "Grid" | "Checker" | "Hearts"
type ImageEditorLayerKind = "image" | "paint" | "model3d"
type ImageEditor3DMode = "model" | "pose"
type ImageEditor3DTransform = "move" | "rotate" | "scale"

function fitEditorCanvasSize(canvasWidth: number, canvasHeight: number, stageWidth: number, stageHeight: number) {
  const scale = Math.min(stageWidth / canvasWidth, stageHeight / canvasHeight, 1)
  return {
    width: Math.max(1, Math.floor(canvasWidth * scale)),
    height: Math.max(1, Math.floor(canvasHeight * scale)),
  }
}

function BaseImageEditorOverlay({
  actions,
  asset,
  brushSize,
  mode,
}: {
  actions: NovelAIWorkspaceActions
  asset: NovelAIImageAsset | null
  brushSize: number
  mode: NovelAIImageEditorMode
}) {
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const historyRef = useRef<string[]>([])
  const [activeTool, setActiveTool] = useState<ImageEditorTool>(mode === "edit" ? "draw" : "draw")
  const [activeLayerKind, setActiveLayerKind] = useState<ImageEditorLayerKind>(mode === "edit" ? "paint" : "image")
  const [layersOpen, setLayersOpen] = useState(false)
  const [paintLayerCount, setPaintLayerCount] = useState(mode === "edit" ? 1 : 0)
  const [hasModelLayer, setHasModelLayer] = useState(false)
  const [modelFileName, setModelFileName] = useState<string | null>(null)
  const [modelMode, setModelMode] = useState<ImageEditor3DMode>("model")
  const [modelTransform, setModelTransform] = useState<ImageEditor3DTransform>("move")
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false)
  const [boneListOpen, setBoneListOpen] = useState(false)
  const [morphTargetsOpen, setMorphTargetsOpen] = useState(false)
  const [hsvOpen, setHsvOpen] = useState(false)
  const [shiftEdgesOpen, setShiftEdgesOpen] = useState(false)
  const modelFileInputRef = useRef<HTMLInputElement | null>(null)
  const [squareBrush, setSquareBrush] = useState(false)
  const [maskSettingsOpen, setMaskSettingsOpen] = useState(false)
  const [paintColor, setPaintColor] = useState("#000000")
  const [fillTolerance, setFillTolerance] = useState(0)
  const [blurIntensity, setBlurIntensity] = useState(50)
  const [maskOpacity, setMaskOpacity] = useState(50)
  const [maskBorder, setMaskBorder] = useState(true)
  const [maskPattern, setMaskPattern] = useState<ImageEditorMaskPattern>("Solid")
  const [focusedAreaMinimum, setFocusedAreaMinimum] = useState(96)
  const [historyIndex, setHistoryIndex] = useState(0)
  const [historyLength, setHistoryLength] = useState(0)
  const [canvasSize, setCanvasSize] = useState({ width: 1024, height: 1024 })
  const [displaySize, setDisplaySize] = useState({ width: 1024, height: 1024 })
  const resolvedBrushSize = clampNovelAIImageEditorBrushSize(brushSize)
  const maskPaintColor = `rgba(${imageEditorMaskRgb}, ${maskOpacity / 100})`
  const isModelLayer = activeLayerKind === "model3d"
  const isInpaintMode = mode === "inpaint" && !isModelLayer
  const effectiveBrushSize = isInpaintMode ? resolvedBrushSize * imageEditorBrushPixelScale : resolvedBrushSize
  const toolLabel = isModelLayer
    ? modelMode === "pose" ? "Pose" : "Model\nTransform"
    : activeTool === "erase"
      ? isInpaintMode ? "Erase Mask" : "Erase"
      : activeTool === "fill"
        ? isInpaintMode ? "Fill Mask" : "Fill"
        : activeTool === "select"
          ? isInpaintMode ? "Focused Area\nSelection" : "Select"
          : activeTool === "lasso"
            ? "Lasso"
            : activeTool === "picker"
              ? "Color Picker"
              : activeTool === "blur"
                ? "Blur"
                : activeTool === "clone"
                  ? "Clone"
                  : isInpaintMode ? "Draw Mask" : "Draw"
  const canUndo = historyIndex > 0
  const canRedo = historyIndex < historyLength - 1

  useEffect(() => {
    const imageCanvas = imageCanvasRef.current
    const maskCanvas = maskCanvasRef.current
    if (!imageCanvas || !maskCanvas) {
      return
    }

    const imageContext = imageCanvas.getContext("2d")
    const maskContext = maskCanvas.getContext("2d")
    if (!imageContext || !maskContext) {
      return
    }

    const initializeCanvases = (width: number, height: number) => {
      imageCanvas.width = width
      imageCanvas.height = height
      maskCanvas.width = width
      maskCanvas.height = height
      maskContext.clearRect(0, 0, width, height)
      historyRef.current = [maskCanvas.toDataURL("image/png")]
      setHistoryIndex(0)
      setHistoryLength(1)
      setCanvasSize({ width, height })
    }

    const fillBlankCanvas = (width: number, height: number) => {
      initializeCanvases(width, height)
      imageContext.clearRect(0, 0, width, height)
      imageContext.fillStyle = "#ffffff"
      imageContext.fillRect(0, 0, width, height)
    }

    if (!asset) {
      fillBlankCanvas(1024, 1024)
      return
    }

    let isActive = true
    const image = new window.Image()
    image.onload = () => {
      if (!isActive) {
        return
      }

      const width = image.naturalWidth || 1024
      const height = image.naturalHeight || 1024
      initializeCanvases(width, height)
      imageContext.clearRect(0, 0, width, height)
      imageContext.drawImage(image, 0, 0, width, height)
    }
    image.onerror = () => {
      if (isActive) {
        fillBlankCanvas(1024, 1024)
      }
    }
    image.src = asset.src

    return () => {
      isActive = false
    }
  }, [asset])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) {
      return
    }

    let frameId: number | null = null
    const updateDisplaySize = () => {
      const stageWidth = stage.clientWidth
      const stageHeight = stage.clientHeight
      if (stageWidth <= 0 || stageHeight <= 0) {
        return
      }

      const nextSize = fitEditorCanvasSize(canvasSize.width, canvasSize.height, stageWidth, stageHeight)
      setDisplaySize((current) => current.width === nextSize.width && current.height === nextSize.height ? current : nextSize)
    }
    const scheduleUpdate = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }

      frameId = window.requestAnimationFrame(updateDisplaySize)
    }

    scheduleUpdate()

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", scheduleUpdate)
      return () => {
        if (frameId !== null) {
          window.cancelAnimationFrame(frameId)
        }
        window.removeEventListener("resize", scheduleUpdate)
      }
    }

    const observer = new ResizeObserver(scheduleUpdate)
    observer.observe(stage)
    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      observer.disconnect()
    }
  }, [canvasSize])

  const commitMaskHistory = () => {
    const maskCanvas = maskCanvasRef.current
    if (!maskCanvas) {
      return
    }

    const nextHistory = historyRef.current.slice(0, historyIndex + 1)
    nextHistory.push(maskCanvas.toDataURL("image/png"))
    const trimmedHistory = nextHistory.slice(-20)
    historyRef.current = trimmedHistory
    setHistoryLength(trimmedHistory.length)
    setHistoryIndex(trimmedHistory.length - 1)
  }

  const restoreMaskHistory = (nextIndex: number) => {
    const maskCanvas = maskCanvasRef.current
    const snapshot = historyRef.current[nextIndex]
    if (!maskCanvas || !snapshot) {
      return
    }

    const context = maskCanvas.getContext("2d")
    if (!context) {
      return
    }

    const image = new window.Image()
    image.onload = () => {
      context.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
      context.drawImage(image, 0, 0, maskCanvas.width, maskCanvas.height)
      setHistoryIndex(nextIndex)
    }
    image.src = snapshot
  }

  const getPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * event.currentTarget.width,
      y: ((event.clientY - rect.top) / rect.height) * event.currentTarget.height,
    }
  }

  const getMaskFillStyle = (context: CanvasRenderingContext2D, color: string): string | CanvasPattern => {
    if (maskPattern === "Solid") {
      return color
    }

    const patternCanvas = document.createElement("canvas")
    patternCanvas.width = 24
    patternCanvas.height = 24
    const patternContext = patternCanvas.getContext("2d")
    if (!patternContext) {
      return color
    }

    patternContext.clearRect(0, 0, 24, 24)
    patternContext.fillStyle = color
    patternContext.strokeStyle = color
    patternContext.lineWidth = 4

    if (maskPattern === "Lines" || maskPattern === "Crosshatch") {
      patternContext.beginPath()
      patternContext.moveTo(-4, 24)
      patternContext.lineTo(24, -4)
      patternContext.moveTo(8, 28)
      patternContext.lineTo(28, 8)
      patternContext.stroke()
    }

    if (maskPattern === "Crosshatch" || maskPattern === "Grid") {
      patternContext.beginPath()
      patternContext.moveTo(-4, 0)
      patternContext.lineTo(24, 28)
      patternContext.moveTo(8, -4)
      patternContext.lineTo(28, 16)
      patternContext.stroke()
    }

    if (maskPattern === "Dots") {
      patternContext.beginPath()
      patternContext.arc(6, 6, 3, 0, Math.PI * 2)
      patternContext.arc(18, 18, 3, 0, Math.PI * 2)
      patternContext.fill()
    }

    if (maskPattern === "Grid") {
      patternContext.lineWidth = 3
      patternContext.strokeRect(0, 0, 24, 24)
    }

    if (maskPattern === "Checker") {
      patternContext.fillRect(0, 0, 12, 12)
      patternContext.fillRect(12, 12, 12, 12)
    }

    if (maskPattern === "Hearts") {
      patternContext.font = "16px serif"
      patternContext.fillText("♥", 3, 16)
    }

    return context.createPattern(patternCanvas, "repeat") ?? color
  }

  const drawSquareLine = (context: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, diameter: number) => {
    const distance = Math.hypot(to.x - from.x, to.y - from.y)
    const steps = Math.max(1, Math.ceil(distance / Math.max(diameter / 3, 1)))

    for (let step = 0; step <= steps; step += 1) {
      const progress = step / steps
      const x = from.x + (to.x - from.x) * progress
      const y = from.y + (to.y - from.y) * progress
      context.fillRect(x - diameter / 2, y - diameter / 2, diameter, diameter)
    }
  }

  const drawBrushStroke = (context: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, diameter: number) => {
    if (squareBrush) {
      drawSquareLine(context, from, to, diameter)
    } else if (from.x === to.x && from.y === to.y) {
      context.beginPath()
      context.arc(to.x, to.y, diameter / 2, 0, Math.PI * 2)
      context.fill()
    } else {
      context.beginPath()
      context.moveTo(from.x, from.y)
      context.lineTo(to.x, to.y)
      context.stroke()
    }
  }

  const drawLine = (from: { x: number; y: number }, to: { x: number; y: number }, mode: "draw" | "erase") => {
    const maskCanvas = maskCanvasRef.current
    if (!maskCanvas) {
      return
    }

    const context = maskCanvas.getContext("2d")
    if (!context) {
      return
    }

    context.save()
    context.lineCap = squareBrush ? "butt" : "round"
    context.lineJoin = squareBrush ? "miter" : "round"

    if (mode === "erase") {
      context.globalCompositeOperation = "destination-out"
      context.strokeStyle = "#000"
      context.fillStyle = "#000"
      context.lineWidth = effectiveBrushSize
      drawBrushStroke(context, from, to, effectiveBrushSize)
      context.restore()
      return
    }

    context.globalCompositeOperation = "source-over"
    if (isInpaintMode && maskBorder) {
      context.strokeStyle = imageEditorMaskBorderColor
      context.fillStyle = imageEditorMaskBorderColor
      context.lineWidth = effectiveBrushSize + 6
      drawBrushStroke(context, from, to, effectiveBrushSize + 6)
    }

    const fillStyle = isInpaintMode ? getMaskFillStyle(context, maskPaintColor) : paintColor
    context.strokeStyle = fillStyle
    context.fillStyle = fillStyle
    context.lineWidth = effectiveBrushSize
    drawBrushStroke(context, from, to, effectiveBrushSize)
    context.restore()
  }

  const createCompositeDataUrl = () => {
    const imageCanvas = imageCanvasRef.current
    const maskCanvas = maskCanvasRef.current
    if (!imageCanvas || !maskCanvas) {
      return null
    }

    const output = document.createElement("canvas")
    output.width = imageCanvas.width
    output.height = imageCanvas.height
    const outputContext = output.getContext("2d")
    if (!outputContext) {
      return null
    }

    outputContext.drawImage(imageCanvas, 0, 0)
    outputContext.drawImage(maskCanvas, 0, 0)
    return output.toDataURL("image/png")
  }

  const handleBrushSizeChange = (value: string) => {
    const nextValue = Number(value)
    if (!Number.isFinite(nextValue)) {
      return
    }

    if (isInpaintMode) {
      actions.setImageEditorBrushSize(clampNovelAIImageEditorBrushSize(nextValue))
      return
    }

    actions.setImageEditorBrushSize(Math.min(Math.max(Math.round(nextValue), imageEditorPaintBrushMin), imageEditorPaintBrushMax))
  }

  const handleFillMask = () => {
    const maskCanvas = maskCanvasRef.current
    const context = maskCanvas?.getContext("2d")
    if (!maskCanvas || !context) {
      return
    }

    context.fillStyle = isInpaintMode ? getMaskFillStyle(context, maskPaintColor) : paintColor
    context.fillRect(0, 0, maskCanvas.width, maskCanvas.height)
    commitMaskHistory()
  }

  const handleClearMask = () => {
    const maskCanvas = maskCanvasRef.current
    const context = maskCanvas?.getContext("2d")
    if (!maskCanvas || !context) {
      return
    }

    context.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
    commitMaskHistory()
  }

  const removePaintLayer = () => {
    setPaintLayerCount((count) => Math.max(0, count - 1))
    if (paintLayerCount <= 1 && activeLayerKind === "paint") {
      setActiveLayerKind("image")
    }
  }

  const removeModelLayer = () => {
    setHasModelLayer(false)
    setModelFileName(null)
    setModelSettingsOpen(false)
    setBoneListOpen(false)
    setMorphTargetsOpen(false)
    if (activeLayerKind === "model3d") {
      setActiveLayerKind(paintLayerCount > 0 ? "paint" : "image")
    }
  }

  const handleSave = () => {
    const dataUrl = createCompositeDataUrl()
    if (!dataUrl) {
      return
    }

    actions.setUploadPreview("baseImage", "novelai-inpaint-canvas.png", dataUrl)
    actions.closeImageEditor()
  }

  const handleDownload = () => {
    const dataUrl = createCompositeDataUrl()
    if (!dataUrl) {
      return
    }

    const anchor = document.createElement("a")
    anchor.href = dataUrl
    anchor.download = "novelai-inpaint-canvas.png"
    anchor.click()
  }

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activeTool === "fill") {
      handleFillMask()
      return
    }

    if (activeTool === "select" || activeTool === "lasso") {
      return
    }

    const nextPoint = getPoint(event)
    if (activeTool === "picker") {
      const imageCanvas = imageCanvasRef.current
      const context = imageCanvas?.getContext("2d")
      const pixel = context?.getImageData(Math.floor(nextPoint.x), Math.floor(nextPoint.y), 1, 1).data
      if (pixel) {
        setPaintColor(`#${[pixel[0], pixel[1], pixel[2]].map((value) => value.toString(16).padStart(2, "0")).join("")}`)
      }
      return
    }

    if (event.isTrusted) {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    drawingRef.current = true
    lastPointRef.current = nextPoint
    drawLine(nextPoint, nextPoint, activeTool === "erase" ? "erase" : "draw")
  }

  const stopDrawing = () => {
    if (drawingRef.current) {
      commitMaskHistory()
    }

    drawingRef.current = false
    lastPointRef.current = null
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[rgb(14,15,33)] text-white">
      <div className="absolute left-[10px] top-[10px] flex overflow-hidden rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] shadow-[0_8px_28px_rgba(0,0,0,0.24)]">
        <div className="flex h-[87px] w-[74px] flex-col items-center justify-center gap-[8px] border-r border-[rgb(34,37,63)] bg-[rgb(25,27,49)] text-center text-[15px] font-semibold leading-[18px] whitespace-pre-line text-white">
          {isModelLayer ? <Box className="h-[18px] w-[18px] text-white" strokeWidth={2.15} /> : activeTool === "erase" ? <Eraser className="h-[18px] w-[18px] text-white" strokeWidth={2.15} /> : activeTool === "fill" ? <PaintBucket className="h-[18px] w-[18px] text-white" strokeWidth={2.15} /> : activeTool === "select" ? <NovelAIImageCountIcon className="h-[18px] w-[18px] text-white" /> : <NovelAIPenIcon className="h-[18px] w-[18px] text-white" />}
          <span>{toolLabel}</span>
        </div>
        {isModelLayer ? (
          <div className="flex h-[87px] w-[292px] flex-col justify-center gap-[7px] px-[10px] py-[9px]">
            <div className="flex items-center gap-[8px] text-[13px] font-semibold leading-[18px]">
              <button className="inline-flex items-center gap-[5px] rounded-[3px] bg-transparent px-[6px] py-[2px] hover:bg-[rgb(34,37,63)]" onClick={() => modelFileInputRef.current?.click()} title="Import 3D model" type="button">
                <NovelAIImportIcon className="h-[12px] w-[12px]" />
                <span>Import</span>
              </button>
              <button className="inline-flex items-center gap-[5px] rounded-[3px] bg-transparent px-[6px] py-[2px] hover:bg-[rgb(34,37,63)]" onClick={() => setModelFileName(null)} title="Reset selected model position" type="button">
                <NovelAIResetIcon className="h-[12px] w-[12px]" />
                <span>Reset</span>
              </button>
            </div>
            <div className="flex gap-[4px] text-[13px] font-semibold leading-[18px]">
              {(["move", "rotate", "scale"] as ImageEditor3DTransform[]).map((transform) => (
                <button key={transform} className={cn("rounded-[3px] px-[8px] py-[3px] capitalize", modelTransform === transform ? "bg-[rgb(34,37,63)] text-white" : "text-white/70 hover:text-white")} onClick={() => setModelTransform(transform)} type="button">
                  {transform}
                </button>
              ))}
            </div>
          </div>
        ) : activeTool === "select" ? (
          <div className="flex h-[87px] w-[181px] flex-col justify-center gap-[8px] px-[12px] py-[9px]">
            <label className="flex items-center gap-[5px] text-[14px] font-semibold leading-[20px] text-white">
              <span>Minimum Context Area:</span>
              <input
                className="w-[34px] bg-transparent p-0 text-[14px] font-semibold leading-[20px] text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                max={96}
                min={32}
                onChange={(event) => setFocusedAreaMinimum(Math.min(Math.max(Number(event.currentTarget.value), 32), 96))}
                type="number"
                value={focusedAreaMinimum}
              />
            </label>
            <input
              aria-label="Minimum Context Area"
              className="h-[12px] w-[156px] cursor-pointer appearance-none rounded-[3px] bg-[rgb(14,15,33)] accent-[rgb(245,243,194)] [&::-webkit-slider-thumb]:h-[12px] [&::-webkit-slider-thumb]:w-[12px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-[2px] [&::-webkit-slider-thumb]:bg-[rgb(245,243,194)]"
              max={96}
              min={32}
              onChange={(event) => setFocusedAreaMinimum(Number(event.currentTarget.value))}
              type="range"
              value={focusedAreaMinimum}
            />
          </div>
        ) : activeTool === "fill" && !isInpaintMode ? (
          <div className="flex h-[87px] w-[161px] flex-col justify-center gap-[8px] px-[12px] py-[9px]">
            <label className="flex items-center gap-[5px] text-[16px] font-semibold leading-[20px] text-white">
              <span>Tolerance:</span>
              <input className="w-[32px] bg-transparent p-0 text-[16px] font-semibold leading-[20px] text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" max={100} min={0} onChange={(event) => setFillTolerance(Math.min(Math.max(Number(event.currentTarget.value), 0), 100))} type="number" value={fillTolerance} />
            </label>
            <input aria-label="Tolerance" className="h-[12px] w-[140px] cursor-pointer appearance-none rounded-[3px] bg-[rgb(14,15,33)] accent-[rgb(245,243,194)] [&::-webkit-slider-thumb]:h-[12px] [&::-webkit-slider-thumb]:w-[12px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-[2px] [&::-webkit-slider-thumb]:bg-[rgb(245,243,194)]" max={100} min={0} onChange={(event) => setFillTolerance(Number(event.currentTarget.value))} type="range" value={fillTolerance} />
          </div>
        ) : activeTool === "fill" ? null : (
          <div className="flex h-[87px] w-[161px] flex-col justify-center gap-[8px] px-[12px] py-[9px]">
            <label className="flex items-center gap-[5px] text-[16px] font-semibold leading-[20px] text-white">
              <span>Pen Size:</span>
              <input
                className="w-[32px] bg-transparent p-0 text-[16px] font-semibold leading-[20px] text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                max={isInpaintMode ? novelAIImageEditorBrushMax : imageEditorPaintBrushMax}
                min={isInpaintMode ? novelAIImageEditorBrushMin : imageEditorPaintBrushMin}
                onChange={(event) => handleBrushSizeChange(event.currentTarget.value)}
                type="number"
                value={resolvedBrushSize}
              />
            </label>
            <input
              aria-label="Pen Size"
              className="h-[12px] w-[140px] cursor-pointer appearance-none rounded-[3px] bg-[rgb(14,15,33)] accent-[rgb(245,243,194)] [&::-webkit-slider-thumb]:h-[12px] [&::-webkit-slider-thumb]:w-[12px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-[2px] [&::-webkit-slider-thumb]:bg-[rgb(245,243,194)]"
              max={isInpaintMode ? novelAIImageEditorBrushMax : imageEditorPaintBrushMax}
              min={isInpaintMode ? novelAIImageEditorBrushMin : imageEditorPaintBrushMin}
              onChange={(event) => handleBrushSizeChange(event.currentTarget.value)}
              type="range"
              value={resolvedBrushSize}
            />
            {isInpaintMode ? (
              <label className="flex items-center gap-[10px] text-[15px] font-semibold leading-[20px] text-white">
                <input
                  checked={squareBrush}
                  className="h-[16px] w-[16px] appearance-none rounded-none border border-[rgb(34,37,63)] bg-[rgb(14,15,33)] checked:bg-[rgb(245,243,194)]"
                  onChange={(event) => setSquareBrush(event.currentTarget.checked)}
                  type="checkbox"
                />
                <span>Square Brush</span>
              </label>
            ) : activeTool === "blur" ? (
              <div>
                <div className="mb-[4px] flex items-center justify-between text-[13px] text-white/75"><span>Intensity:</span><span>{blurIntensity}%</span></div>
                <input className="h-[12px] w-full cursor-pointer appearance-none rounded-[3px] bg-[rgb(14,15,33)] accent-[rgb(245,243,194)] [&::-webkit-slider-thumb]:h-[12px] [&::-webkit-slider-thumb]:w-[12px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-[2px] [&::-webkit-slider-thumb]:bg-[rgb(245,243,194)]" max={100} min={0} onChange={(event) => setBlurIntensity(Number(event.currentTarget.value))} type="range" value={blurIntensity} />
              </div>
            ) : activeTool === "clone" ? (
              <div className="text-[13px] leading-[18px] text-white/65">Alt+Click to set source</div>
            ) : (
              <div className="flex gap-[5px]">
                {["#000000", "#ffffff", "#ef4444", "#3b82f6"].map((color) => (
                  <button className={cn("h-[20px] w-[30px] rounded-[3px] border", paintColor === color ? "border-[rgb(245,243,194)]" : "border-[rgb(34,37,63)]")} key={color} onClick={() => setPaintColor(color)} style={{ backgroundColor: color }} type="button" />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="absolute right-[10px] top-[10px] flex overflow-hidden rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(19,21,44)]">
        <EditorChromeButton label="Download Canvas as PNG" onClick={handleDownload}>
          <NovelAIExportIcon className="h-[18px] w-[18px] text-white" />
        </EditorChromeButton>
        <button className="h-[44px] w-[120px] bg-[rgb(245,243,194)] text-[16px] font-semibold leading-[21px] text-[rgb(25,27,49)] transition-colors hover:bg-[rgb(250,248,213)]" onClick={handleSave} type="button">
          Save &amp; Close
        </button>
        <EditorChromeButton label="Close" onClick={actions.closeImageEditor}>
          <NovelAIThinCrossIcon className="h-[22px] w-[22px] text-white" />
        </EditorChromeButton>
      </div>

      {maskSettingsOpen ? (
        <div className="absolute right-[226px] bottom-[72px] w-[250px] rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] p-[12px] text-white shadow-[0_8px_28px_rgba(0,0,0,0.24)]">
          <div className="mb-[10px] text-[16px] font-semibold leading-[21px]">Mask Color</div>
          <label className="mb-[8px] flex items-center gap-[6px] text-[14px] font-semibold leading-[20px]">
            <span>Mask Opacity:</span>
            <input
              className="w-[34px] bg-transparent p-0 text-[14px] font-semibold leading-[20px] text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              max={100}
              min={10}
              onChange={(event) => setMaskOpacity(Math.min(Math.max(Number(event.currentTarget.value), 10), 100))}
              type="number"
              value={maskOpacity}
            />
            <span>%</span>
          </label>
          <input
            aria-label="Mask Opacity"
            className="mb-[10px] h-[12px] w-full cursor-pointer appearance-none rounded-[3px] bg-[rgb(14,15,33)] accent-[rgb(245,243,194)] [&::-webkit-slider-thumb]:h-[12px] [&::-webkit-slider-thumb]:w-[12px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-[2px] [&::-webkit-slider-thumb]:bg-[rgb(245,243,194)]"
            max={100}
            min={10}
            onChange={(event) => setMaskOpacity(Number(event.currentTarget.value))}
            type="range"
            value={maskOpacity}
          />
          <label className="mb-[10px] flex items-center gap-[10px] text-[14px] font-semibold leading-[20px]">
            <input
              checked={maskBorder}
              className="h-[16px] w-[16px] appearance-none rounded-none border border-[rgb(34,37,63)] bg-[rgb(14,15,33)] checked:bg-[rgb(245,243,194)]"
              onChange={(event) => setMaskBorder(event.currentTarget.checked)}
              type="checkbox"
            />
            <span>Border</span>
          </label>
          <div className="mb-[8px] text-[14px] font-semibold leading-[20px]">Mask Pattern</div>
          <div className="grid grid-cols-2 gap-[6px]">
            {(["Solid", "Lines", "Crosshatch", "Dots", "Grid", "Checker", "Hearts"] as ImageEditorMaskPattern[]).map((pattern) => (
              <button
                key={pattern}
                className={cn(
                  "rounded-[3px] border border-[rgb(34,37,63)] px-[8px] py-[5px] text-[13px] leading-[18px] transition-colors",
                  maskPattern === pattern ? "bg-[rgb(245,243,194)] text-[rgb(25,27,49)]" : "bg-[rgb(14,15,33)] text-white/80 hover:text-white"
                )}
                onClick={() => setMaskPattern(pattern)}
                type="button"
              >
                {pattern}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {hsvOpen ? (
        <EditorFloatingPanel className="right-[184px]" title="HSV Adjustment">
          <EditorPanelSlider label="Hue:" suffix="°" value={0} />
          <EditorPanelSlider label="Saturation:" suffix="%" value={0} />
          <EditorPanelSlider label="Brightness:" suffix="%" value={0} />
          <div className="mt-[10px] flex gap-[6px]">
            <button className="flex-1 rounded-[3px] bg-[rgb(14,15,33)] px-[8px] py-[5px] text-[13px] text-white/80" type="button">Reset</button>
            <button className="flex-1 rounded-[3px] bg-[rgb(14,15,33)] px-[8px] py-[5px] text-[13px] text-white/80" onClick={() => setHsvOpen(false)} type="button">Cancel</button>
            <button className="flex-1 rounded-[3px] bg-[rgb(245,243,194)] px-[8px] py-[5px] text-[13px] font-semibold text-[rgb(25,27,49)]" onClick={() => setHsvOpen(false)} type="button">Apply</button>
          </div>
        </EditorFloatingPanel>
      ) : null}

      {shiftEdgesOpen ? (
        <EditorFloatingPanel className="right-[122px]" title="Shift Edges">
          <div className="grid grid-cols-2 gap-[6px]">
            {["Left", "Top", "Right", "Bottom"].map((label) => <input aria-label={label} className="rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(14,15,33)] px-[8px] py-[5px] text-[13px] text-white outline-none" defaultValue={0} key={label} type="number" />)}
          </div>
          <div className="mt-[8px] text-center text-[13px] text-white/65">{canvasSize.width}×{canvasSize.height}</div>
          <button className="mt-[8px] w-full rounded-[3px] bg-[rgb(245,243,194)] px-[8px] py-[5px] text-[13px] font-semibold text-[rgb(25,27,49)]" onClick={() => setShiftEdgesOpen(false)} type="button">Resize</button>
        </EditorFloatingPanel>
      ) : null}

      {modelSettingsOpen ? (
        <EditorFloatingPanel className="right-[200px]" title="Projection">
          <div className="mb-[8px] grid grid-cols-2 gap-[6px]"><button className="rounded-[3px] bg-[rgb(34,37,63)] px-[8px] py-[5px] text-[13px]" type="button">Perspective</button><button className="rounded-[3px] bg-[rgb(14,15,33)] px-[8px] py-[5px] text-[13px] text-white/75" type="button">Orthographic</button></div>
          <EditorPanelSlider label="FOV" value={50} />
          <div className="mt-[8px] text-[14px] font-semibold">Lighting</div>
          <EditorPanelSlider label="Ambient" suffix="%" value={60} />
          <EditorPanelSlider label="Direct" suffix="%" value={80} />
          <div className="mt-[8px] text-[13px] text-white/70">Light Direction</div>
          <div className="mt-[6px] grid grid-cols-3 gap-[5px]">{["Front", "Front-Top", "Top", "Left", "Right", "Back"].map((item) => <button className="rounded-[3px] bg-[rgb(14,15,33)] px-[5px] py-[4px] text-[12px] text-white/75" key={item} type="button">{item}</button>)}</div>
          <div className="mt-[8px] grid grid-cols-2 gap-[8px] text-[13px]"><div>Shadows <button className="ml-[6px] rounded bg-[rgb(34,37,63)] px-[6px]">On</button></div><div>Physics <button className="ml-[6px] rounded bg-[rgb(34,37,63)] px-[6px]">On</button></div></div>
        </EditorFloatingPanel>
      ) : null}

      {boneListOpen ? <EditorFloatingPanel className="right-[286px]" title="Bone List"><div className="text-[13px] text-white/60">No bones found</div></EditorFloatingPanel> : null}
      {morphTargetsOpen ? <EditorFloatingPanel className="right-[242px]" title="Morph Targets"><div className="text-[13px] text-white/60">No morph targets found</div></EditorFloatingPanel> : null}

      <div ref={stageRef} className="absolute inset-x-[92px] bottom-[76px] top-[86px] flex items-center justify-center overflow-hidden">
        <div className="relative bg-white" style={{ width: displaySize.width, height: displaySize.height }}>
          <canvas className="absolute inset-0 block bg-white" ref={imageCanvasRef} style={{ width: displaySize.width, height: displaySize.height }} />
          <canvas
            aria-label="Inpaint mask canvas"
            className={cn("absolute inset-0 block touch-none", activeTool === "select" ? "cursor-default" : "cursor-crosshair")}
            onPointerCancel={stopDrawing}
            onPointerDown={handleCanvasPointerDown}
            onPointerLeave={stopDrawing}
            onPointerMove={(event) => {
              if (!drawingRef.current || !lastPointRef.current || activeTool === "fill" || activeTool === "select" || activeTool === "lasso" || activeTool === "picker") {
                return
              }

              const nextPoint = getPoint(event)
              drawLine(lastPointRef.current, nextPoint, activeTool === "erase" ? "erase" : "draw")
              lastPointRef.current = nextPoint
            }}
            onPointerUp={stopDrawing}
            ref={maskCanvasRef}
            style={{ width: displaySize.width, height: displaySize.height }}
          />
          {hasModelLayer ? (
            <div className={cn("pointer-events-none absolute left-1/2 top-1/2 flex h-[180px] w-[180px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-[6px] border border-[rgb(245,243,194)]/55 bg-[rgb(34,37,63)]/20 text-center text-[13px] font-semibold text-[rgb(245,243,194)] shadow-[0_18px_50px_rgba(0,0,0,0.28)]", activeLayerKind !== "model3d" && "opacity-35")}>
              <Box className="mb-[8px] h-[38px] w-[38px]" strokeWidth={1.8} />
              <span>{modelFileName ?? "3D Model Layer"}</span>
              <span className="mt-[4px] text-[11px] uppercase tracking-[0.14em] text-white/50">{modelMode} · {modelTransform}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="absolute bottom-[10px] left-1/2 flex h-[50px] w-[calc(100vw-32px)] max-w-[830px] -translate-x-1/2 items-center rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] px-[4px] shadow-[0_8px_28px_rgba(0,0,0,0.24)]">
        {isModelLayer ? (
          <>
            <EditorToolButton active={modelMode === "model"} label="Model Transform" onClick={() => setModelMode("model")}>
              <Box className="h-[18px] w-[18px]" strokeWidth={2.1} />
            </EditorToolButton>
            <EditorToolButton active={modelMode === "pose"} label="Pose" onClick={() => setModelMode("pose")}>
              <Move3D className="h-[18px] w-[18px]" strokeWidth={2.1} />
            </EditorToolButton>
          </>
        ) : (
          <>
            <EditorToolButton active={activeTool === "draw"} label={isInpaintMode ? "Draw Mask" : "Draw"} onClick={() => setActiveTool("draw")}>
              <NovelAIPenIcon className="h-[18px] w-[18px]" />
            </EditorToolButton>
            <EditorToolButton active={activeTool === "erase"} label={isInpaintMode ? "Erase Mask" : "Erase"} onClick={() => setActiveTool("erase")}>
              <Eraser className="h-[18px] w-[18px]" strokeWidth={2.15} />
            </EditorToolButton>
            <EditorToolButton active={activeTool === "fill"} label={isInpaintMode ? "Fill Mask" : "Fill"} onClick={() => setActiveTool("fill")}>
              <PaintBucket className="h-[18px] w-[18px]" strokeWidth={2.15} />
            </EditorToolButton>
            <EditorToolButton active={activeTool === "select"} label={isInpaintMode ? "Focused Area Selection" : "Select"} onClick={() => setActiveTool("select")}>
              <Scan className="h-[18px] w-[18px]" strokeWidth={2.15} />
            </EditorToolButton>
            {!isInpaintMode ? (
              <>
                <EditorToolButton active={activeTool === "lasso"} label="Lasso" onClick={() => setActiveTool("lasso")}>
                  <Lasso className="h-[18px] w-[18px]" strokeWidth={2.15} />
                </EditorToolButton>
                <EditorToolButton active={activeTool === "picker"} label="Color Picker" onClick={() => setActiveTool("picker")}>
                  <Pipette className="h-[18px] w-[18px]" strokeWidth={2.15} />
                </EditorToolButton>
                <EditorToolButton active={activeTool === "blur"} label="Blur" onClick={() => setActiveTool("blur")}>
                  <Droplets className="h-[18px] w-[18px]" strokeWidth={2.15} />
                </EditorToolButton>
                <EditorToolButton active={activeTool === "clone"} label="Clone" onClick={() => setActiveTool("clone")}>
                  <Brush className="h-[18px] w-[18px]" strokeWidth={2.15} />
                </EditorToolButton>
              </>
            ) : null}
          </>
        )}
        <div className="flex-1" />
        <EditorToolButton active={maskSettingsOpen} label="Mask Color" onClick={() => setMaskSettingsOpen((isOpen) => !isOpen)}>
          <Palette className="h-[18px] w-[18px]" strokeWidth={2.15} />
        </EditorToolButton>
        {isModelLayer ? (
          <>
            <EditorToolButton active={modelSettingsOpen} label="3D Settings" onClick={() => setModelSettingsOpen((isOpen) => !isOpen)}>
              <SlidersHorizontal className="h-[18px] w-[18px]" strokeWidth={2.15} />
            </EditorToolButton>
            <EditorToolButton active={boneListOpen} label="Bone List" onClick={() => setBoneListOpen((isOpen) => !isOpen)}>
              <Crosshair className="h-[18px] w-[18px]" strokeWidth={2.15} />
            </EditorToolButton>
            <EditorToolButton active={morphTargetsOpen} label="Morph Targets" onClick={() => setMorphTargetsOpen((isOpen) => !isOpen)}>
              <Rotate3D className="h-[18px] w-[18px]" strokeWidth={2.15} />
            </EditorToolButton>
          </>
        ) : (
          <>
            <EditorToolButton active={hsvOpen} label="HSV Adjustment" onClick={() => setHsvOpen((isOpen) => !isOpen)}>
              <SlidersHorizontal className="h-[18px] w-[18px]" strokeWidth={2.15} />
            </EditorToolButton>
            <EditorToolButton active={false} label={isInpaintMode ? "Clear Mask" : "Clear Layer"} onClick={handleClearMask}>
              <NovelAITrashIcon className="h-[18px] w-[18px]" />
            </EditorToolButton>
            <EditorToolButton active={shiftEdgesOpen} label="Shift Edges" onClick={() => setShiftEdgesOpen((isOpen) => !isOpen)}>
              <LucideImageIcon className="h-[18px] w-[18px]" strokeWidth={2.15} />
            </EditorToolButton>
          </>
        )}
        <div className="mx-[4px] h-[28px] w-px bg-[rgb(34,37,63)]" />
        <EditorToolButton active={false} disabled={!canUndo} label="Undo" onClick={() => restoreMaskHistory(historyIndex - 1)}>
          <Undo2 className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </EditorToolButton>
        <EditorToolButton active={false} disabled={!canRedo} label="Redo" onClick={() => restoreMaskHistory(historyIndex + 1)}>
          <Redo2 className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </EditorToolButton>
      </div>

      {layersOpen ? (
        <div className="absolute bottom-[98px] right-[10px] w-[84px] rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] p-[6px] shadow-[0_8px_28px_rgba(0,0,0,0.24)]">
          <div className="mb-[6px] flex justify-center gap-[4px]">
            <button aria-label="Add Layer" className="flex h-[24px] w-[24px] items-center justify-center rounded-[3px] bg-[rgb(14,15,33)] text-white hover:bg-[rgb(34,37,63)]" onClick={() => { setPaintLayerCount((count) => count + 1); setActiveLayerKind("paint"); setActiveTool("draw") }} title="Add Layer" type="button">
              <NovelAIPlusIcon className="h-[10px] w-[10px]" />
            </button>
            <button aria-label="Add 3D Model Layer" className="flex h-[24px] w-[24px] items-center justify-center rounded-[3px] bg-[rgb(14,15,33)] text-white hover:bg-[rgb(34,37,63)]" onClick={() => { setHasModelLayer(true); setActiveLayerKind("model3d"); setModelMode("model") }} title="Add 3D Model Layer" type="button">
              <Box className="h-[16px] w-[16px]" strokeWidth={2.1} />
            </button>
          </div>
          {hasModelLayer ? <LayerCard active={activeLayerKind === "model3d"} label="3D" onClick={() => setActiveLayerKind("model3d")} onRemove={removeModelLayer} removable /> : null}
          {Array.from({ length: paintLayerCount }).map((_, index) => <LayerCard active={activeLayerKind === "paint" && index === paintLayerCount - 1} key={index} label={`L${paintLayerCount - index}`} onClick={() => setActiveLayerKind("paint")} onRemove={removePaintLayer} removable />)}
          <LayerCard active={activeLayerKind === "image"} label="IMG" onClick={() => setActiveLayerKind("image")} removable={false} />
        </div>
      ) : null}
      <input
        accept=".glb,.gltf,.vrm,.pmx,.pmd,.zip,.png,.jpg,.jpeg,.webp,.bmp,.gif"
        className="hidden"
        onChange={(event) => setModelFileName(event.currentTarget.files?.[0]?.name ?? null)}
        ref={modelFileInputRef}
        type="file"
      />
      <button className="absolute bottom-[50px] right-[10px] flex h-[44px] w-[44px] items-center justify-center gap-[8px] rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] text-[14px] font-semibold text-white" onClick={() => setLayersOpen((isOpen) => !isOpen)} title="Layers" type="button">
        <Layers className="h-[18px] w-[18px]" strokeWidth={2.1} />
        <span>{1 + paintLayerCount + (hasModelLayer ? 1 : 0)}</span>
      </button>
      <div className="absolute bottom-[8px] right-[10px] text-[11px] leading-[16px] text-white/25">WebGL2</div>
    </div>
  )
}

function EditorFloatingPanel({ children, className, title }: { children: ReactNode; className: string; title: string }) {
  return (
    <div className={cn("absolute bottom-[72px] w-[250px] rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] p-[12px] text-white shadow-[0_8px_28px_rgba(0,0,0,0.24)]", className)}>
      <div className="mb-[10px] text-[16px] font-semibold leading-[21px]">{title}</div>
      {children}
    </div>
  )
}

function EditorPanelSlider({ label, suffix = "", value }: { label: string; suffix?: string; value: number }) {
  return (
    <div className="mb-[8px]">
      <div className="mb-[4px] flex items-center justify-between text-[13px] text-white/75"><span>{label}</span><span>{value}{suffix}</span></div>
      <input className="h-[12px] w-full cursor-pointer appearance-none rounded-[3px] bg-[rgb(14,15,33)] accent-[rgb(245,243,194)] [&::-webkit-slider-thumb]:h-[12px] [&::-webkit-slider-thumb]:w-[12px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-[2px] [&::-webkit-slider-thumb]:bg-[rgb(245,243,194)]" readOnly type="range" value={value} />
    </div>
  )
}

function LayerCard({ active, label, onClick, onRemove, removable }: { active: boolean; label: string; onClick: () => void; onRemove?: () => void; removable: boolean }) {
  return (
    <div className="relative mb-[6px]">
      <button className={cn("flex h-[58px] w-full items-center justify-center rounded-[3px] border text-[11px] font-semibold", active ? "border-[rgb(245,243,194)] bg-[rgb(34,37,63)] text-white" : "border-[rgb(34,37,63)] bg-[rgb(14,15,33)] text-white/65")} onClick={onClick} type="button">
        {label}
      </button>
      <button
        aria-label={removable ? `Delete ${label} layer` : `${label} layer cannot be deleted`}
        className={cn(
          "absolute right-[3px] top-[3px] flex h-[18px] w-[18px] items-center justify-center rounded-[2px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] text-white transition-colors",
          removable ? "hover:bg-[rgb(62,35,52)] hover:text-[rgb(245,243,194)]" : "cursor-not-allowed opacity-35"
        )}
        disabled={!removable}
        onClick={(event) => {
          event.stopPropagation()
          onRemove?.()
        }}
        title={removable ? "Delete Layer" : "Layer cannot be deleted"}
        type="button"
      >
        <NovelAIThinCrossIcon className="h-[9px] w-[9px]" />
      </button>
    </div>
  )
}

function EditorChromeButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button aria-label={label} className="flex h-[44px] w-[44px] items-center justify-center border-r border-[rgb(34,37,63)] bg-[rgb(19,21,44)] text-white transition-colors hover:bg-[rgb(34,37,63)]" onClick={onClick} type="button">
      {children}
    </button>
  )
}

function EditorToolButton({ active, children, disabled = false, label, onClick }: { active: boolean; children: ReactNode; disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      aria-label={label}
      className={cn(
        "flex h-[44px] w-[44px] items-center justify-center rounded-[3px] text-white transition-colors",
        active ? "bg-[rgb(34,37,63)]" : "bg-transparent hover:bg-[rgb(34,37,63)]",
        disabled && "cursor-not-allowed opacity-35 hover:bg-transparent"
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  )
}

function CharacterPromptCard({
  actions,
  character,
  highlightEmphasis,
  index,
  previewAspect,
  total,
}: {
  actions: NovelAIWorkspaceActions
  character: CharacterPromptState
  highlightEmphasis: boolean
  index: number
  previewAspect: "portrait" | "landscape" | "square"
  total: number
}) {
  const isPromptTab = character.activeTab === "prompt"
  const value = isPromptTab ? character.prompt : character.undesiredPrompt
  const currentTokens = estimatePromptTokens(value)
  const isAiChoice = character.positionMode === "ai_choice"
  const canEditPosition = total > 1
  const [positionAdjustOpen, setPositionAdjustOpen] = useState(false)

  return (
    <>
      <div className={character.enabled ? "character-prompt-input" : "character-prompt-input opacity-55"}>
        <div className="flex flex-row items-end justify-between">
          <button
            className="inline-flex items-center gap-1 rounded-t-[3px] bg-[rgb(34,37,63)] px-[8px] py-[2px] text-[16px] leading-6 text-white"
            onClick={() => actions.toggleCharacterExpanded(character.id)}
            type="button"
          >
            <KeyRound className="h-4 w-4" strokeWidth={2.1} />
            {character.name}
          </button>
          <div className="flex flex-row gap-1">
            <button className="rounded-t-[3px] bg-[rgb(34,37,63)] px-[5px] py-[2px]" disabled={index === 0} onClick={() => actions.moveCharacterUp(character.id)} type="button">
              <NovelAIArrowUpIcon className={index === 0 ? "h-[8px] w-[14px] opacity-30" : "h-[8px] w-[14px] text-white"} />
            </button>
            <button className="rounded-t-[3px] bg-[rgb(34,37,63)] px-[6px] py-[2px]" disabled={index === total - 1} onClick={() => actions.moveCharacterDown(character.id)} type="button">
              <NovelAIArrowDownIcon className={index === total - 1 ? "h-[8px] w-[14px] opacity-30" : "h-[8px] w-[14px] text-white"} />
            </button>
            <button className="rounded-t-[3px] bg-[rgb(34,37,63)] px-[6px] pt-[4px] pb-[2px]" onClick={() => actions.toggleCharacterEnabled(character.id)} type="button">
              {character.enabled ? <NovelAICheckIcon className="h-[10px] w-[10px] text-white" /> : <NovelAIThinCrossIcon className="h-[10px] w-[10px] text-white" />}
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-b-[3px] rounded-tr-[3px] bg-[rgb(14,15,33)] ring-1 ring-[rgb(34,37,63)]">
          <div className="flex items-center justify-between bg-[rgb(14,15,33)] px-[15px] pt-[15px] pb-0">
            <div className="flex flex-row gap-[10px]">
              <div className={isPromptTab ? "rounded-[3px] bg-[rgb(34,37,63)] px-[5px] py-[2px] text-[14px] leading-[21px] text-white" : "px-[5px] py-[2px] text-[14px] leading-[21px] text-white/80"}>
                <button onClick={() => actions.setCharacterTab(character.id, "prompt")} type="button">
                  Prompt
                </button>
              </div>
              <div className={!isPromptTab ? "rounded-[3px] bg-[rgb(34,37,63)] px-[5px] py-[2px] text-[14px] leading-[21px] text-white" : "px-[5px] py-[2px] text-[14px] leading-[21px] text-white/80"}>
                <button onClick={() => actions.setCharacterTab(character.id, "undesired")} type="button">
                  Undesired Content
                </button>
              </div>
            </div>
            <button className="text-white/85" onClick={() => actions.removeCharacter(character.id)} type="button">
              <NovelAITrashIcon className="h-4 w-4 text-white" />
            </button>
          </div>

          {character.isExpanded ? (
            <div className="px-[15px] pb-[10px]">
              <AutoGrowTextarea
                className="w-full resize-none bg-transparent text-[16px] leading-[26px] text-white outline-none"
                highlightEmphasis={highlightEmphasis}
                minHeight={120}
                onChange={(nextValue) =>
                  isPromptTab ? actions.setCharacterPrompt(character.id, nextValue) : actions.setCharacterUndesiredPrompt(character.id, nextValue)
                }
                value={value}
              />
            </div>
          ) : (
            <button className="block w-full text-left" onClick={() => actions.toggleCharacterExpanded(character.id)} type="button">
              <div className="px-[15px] pb-[10px] pt-[6px] text-[16px] leading-[26px] text-white/90">
                <p className="line-clamp-2">{value || (isPromptTab ? "girl, " : "")}</p>
              </div>
            </button>
          )}

          <div className="flex items-center justify-start gap-[10px] px-[15px] pb-[8px] pt-0 text-[16px] leading-[26px]">
            <span>Position</span>
            <PositionModeButton
              active={isAiChoice}
              disabled={!canEditPosition}
              iconType={isAiChoice ? "check" : "cross"}
              label={isAiChoice ? "AI's Choice" : character.positionMode === "adjust" ? "Adjust" : "Custom"}
              onClick={() => {
                if (!canEditPosition) {
                  return
                }

                if (isAiChoice) {
                  actions.setCharacterPositionMode(character.id, "adjust")
                  setPositionAdjustOpen(true)
                  return
                }

                actions.setCharacterPositionMode(character.id, "ai_choice")
              }}
            />
            {!isAiChoice && canEditPosition ? (
              <button className="flex h-[26px] w-[26px] items-center justify-center rounded-[3px] border border-[rgb(34,37,63)] text-white/75" onClick={() => setPositionAdjustOpen(true)} type="button">
                <NovelAIPenIcon className="h-[12px] w-[12px] text-white/75" />
              </button>
            ) : null}
          </div>
          <div className="px-[15px] pb-[15px] pt-0 text-[12.8px] leading-[19.2px] text-white/60">{currentTokens} / 512 Tokens</div>
        </div>
      </div>

      {positionAdjustOpen ? (
        <PositionAdjustOverlay
          aspect={previewAspect}
          onClose={() => setPositionAdjustOpen(false)}
          onSelect={(cell) => actions.setCharacterPositionCell(character.id, cell)}
          selectedCell={character.positionCell}
        />
      ) : null}
    </>
  )
}

function getCharacterTemplateIcon(templateId: string) {
  if (templateId === "female") {
    return <Venus className="h-3.5 w-3.5" strokeWidth={2.1} />
  }

  if (templateId === "male") {
    return <Mars className="h-3.5 w-3.5" strokeWidth={2.1} />
  }

  return <NovelAISakuraIcon className="h-3.5 w-3.5 text-white" />
}

function PositionModeButton({
  active,
  disabled = false,
  iconType,
  label,
  onClick,
}: {
  active: boolean
  disabled?: boolean
  iconType: "check" | "cross"
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={active ? cn("inline-flex h-[26px] items-center gap-1.5 rounded-[3px] bg-[rgb(245,243,194)] px-3 text-[14px] font-normal leading-[21px] text-[rgb(19,21,44)]", disabled && "opacity-70") : cn("inline-flex h-[26px] items-center gap-1.5 rounded-[3px] border border-[rgb(34,37,63)] px-3 text-[14px] leading-[21px] text-white/75", disabled && "opacity-55")}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {iconType === "check" ? (
        <NovelAICheckIcon className={active ? "h-[7px] w-[8px] text-[rgb(19,21,44)]" : "h-[7px] w-[8px] text-white/75"} />
      ) : (
        <NovelAIThinCrossIcon className={active ? "h-[8px] w-[8px] text-[rgb(19,21,44)]" : "h-[8px] w-[8px] text-white/75"} />
      )}
      {label}
    </button>
  )
}

function PromptTokenMeter({
  maxTokens,
  percent,
  segments,
  showText = true,
  tokens,
}: {
  maxTokens: number
  percent: number
  segments?: PromptTokenMeterSegment[]
  showText?: boolean
  tokens: number
}) {
  const visibleSegments = (segments ?? []).reduce<Array<PromptTokenMeterSegment & { width: number }>>((currentSegments, segment) => {
    const usedPercent = currentSegments.reduce((total, currentSegment) => total + currentSegment.width, 0)
    const remainingPercent = Math.max(100 - usedPercent, 0)
    const segmentPercent = maxTokens > 0 ? (segment.tokens / maxTokens) * 100 : 0
    const width = Math.min(Math.max(segmentPercent, 0), remainingPercent)

    return width > 0 ? currentSegments.concat({ ...segment, width }) : currentSegments
  }, [])

  return (
    <div>
      <div className="px-0 py-[5px]">
        <div className="flex h-1 overflow-hidden rounded-[3px] bg-[rgb(25,27,49)]">
          {visibleSegments.length > 0 ? (
            visibleSegments.map((segment) => (
              <div key={segment.id} className="h-full shrink-0" style={{ backgroundColor: segment.color, width: `${segment.width}%` }} title={`${segment.label}: ${segment.tokens} Tokens`} />
            ))
          ) : (
            <div className="h-full bg-white" style={{ width: `${percent}%` }} />
          )}
        </div>
      </div>
      {showText ? <div className="mt-[6px] text-[12.8px] leading-[19.2px] text-white/70">{tokens} / {maxTokens} Tokens</div> : null}
    </div>
  )
}

function PositionAdjustOverlay({
  aspect,
  onClose,
  onSelect,
  selectedCell,
}: {
  aspect: "portrait" | "landscape" | "square"
  onClose: () => void
  onSelect: (cell: number) => void
  selectedCell: number | null
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 px-5">
      <div className="w-full max-w-[320px] rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] p-4 text-white shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
        <div className="mb-3 text-[16px] leading-6">Adjust</div>
        <div className={cn("mx-auto overflow-hidden rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(14,15,33)] p-2", aspect === "portrait" ? "aspect-[4/6] max-w-[180px]" : aspect === "landscape" ? "aspect-[6/4] max-w-[240px]" : "aspect-square max-w-[210px]") }>
          <div className="grid h-full grid-cols-5 gap-1">
            {Array.from({ length: 25 }, (_, cellIndex) => (
              <button
                key={cellIndex}
                className={cn(
                  "rounded-[2px] border border-[rgb(34,37,63)] bg-[rgb(19,21,44)] transition-colors hover:border-[rgb(245,243,194)]/75",
                  selectedCell === cellIndex && "border-[rgb(245,243,194)] bg-[rgb(245,243,194)]/20"
                )}
                onClick={() => onSelect(cellIndex)}
                type="button"
              />
            ))}
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="inline-flex h-9 items-center rounded-[3px] bg-[rgb(245,243,194)] px-4 text-[14px] font-normal leading-[21px] text-[rgb(19,21,44)]" onClick={onClose} type="button">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function SummaryValueButton({
  label,
  onClick,
  value,
  valueClassName,
}: {
  label: string
  onClick: () => void
  value: string
  valueClassName?: string
}) {
  return (
    <div className="min-w-[30px]">
      <div className="text-[14px] leading-[21px] text-white/80">{label}</div>
      <button className={cn("mt-[1px] font-sans text-[16px] leading-[21px] font-bold text-white", valueClassName)} onClick={onClick} type="button">
        {value}
      </button>
    </div>
  )
}

function SliderSettingRow({
  label,
  onChange,
  rangeMax,
  rangeMin,
  rangeStep,
  value,
  widthClassName,
}: {
  label: string
  onChange: (value: number) => void
  rangeMax: number
  rangeMin: number
  rangeStep: number
  value: number
  widthClassName: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-[0.5ch] text-[14px] leading-[21px] text-white/85">
        <span>{label}</span>
        <div className="inline-flex h-[22px] items-center border-b border-[rgb(34,37,63)] pb-[1px]">
          <NumberField onChange={onChange} value={value} widthClassName={widthClassName} />
        </div>
      </div>
      <RangeField max={rangeMax} min={rangeMin} onChange={onChange} step={rangeStep} value={value} />
    </div>
  )
}

function UploadSliderRow({
  label,
  max,
  min,
  onChange,
  step,
  value,
  widthClassName,
}: {
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  step: number
  value: number
  widthClassName: string
}) {
  return (
    <div>
      <div className="flex items-center gap-[0.5ch] text-[14px] leading-[21px] text-white/85">
        <span>{label}</span>
        <div className="inline-flex h-[22px] items-center border-b border-[rgb(34,37,63)] pb-[1px]">
          <NumberField onChange={onChange} value={value} widthClassName={widthClassName} />
        </div>
      </div>
      <div className="pt-[6px]">
        <RangeField max={max} min={min} onChange={onChange} step={step} value={value} />
      </div>
    </div>
  )
}

function RangeField({ max, min, onChange, step, value }: { max: number; min: number; onChange: (value: number) => void; step: number; value: number }) {
  return (
    <input
      className="novelai-slider thick-slider h-[22px] w-full appearance-none rounded-[3px] bg-[rgb(14,15,33)]"
      max={max}
      min={min}
      onChange={(event) => onChange(Number(event.target.value))}
      step={step}
      type="range"
      value={value}
    />
  )
}

function OfficialSwitch({ checked }: { checked: boolean }) {
  return (
    <span className={cn("relative block h-[20px] w-[47px] rounded-[3px] border transition-colors", checked ? "border-[rgb(245,243,194)] bg-[rgb(245,243,194)]" : "border-[rgb(34,37,63)] bg-[rgb(14,15,33)]")}>
      <span className={cn("absolute top-[1px] h-[16px] w-[26px] rounded-[3px] transition-[left,background-color]", checked ? "left-[18px] bg-[rgb(14,15,33)]" : "left-[1px] bg-[rgb(34,37,63)]")} />
      <span className={cn("absolute top-[5px] h-[8px] w-[8px] rounded-[2px] transition-[left,background-color]", checked ? "left-[27px] bg-[rgb(245,243,194)]" : "left-[10px] bg-white/50")} />
    </span>
  )
}

function StatField({ label, onChange, value }: { label: string; onChange: (value: number) => void; value: number }) {
  return (
    <div className="min-w-[30px]">
      <div className="text-[14px] leading-[21px] text-white/80">{label}</div>
      <div className="mt-[1px] flex h-[21px] items-center justify-start border-b border-[rgb(34,37,63)] pb-[1px] pl-[2px]">
        <NumberField onChange={onChange} value={value} widthClassName="w-[28px]" />
      </div>
    </div>
  )
}

function AutoGrowTextarea({
  className,
  highlightEmphasis = false,
  minHeight,
  onBlur,
  onChange,
  onCursorChange,
  onFocus,
  textareaRef: providedTextareaRef,
  value,
}: {
  className: string
  highlightEmphasis?: boolean
  minHeight: number
  onBlur?: () => void
  onChange: (value: string, cursor: number, meta?: TextInputChangeMeta) => void
  onCursorChange?: (cursor: number) => void
  onFocus?: (cursor: number) => void
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>
  value: string
}) {
  const internalTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const overlayScrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = providedTextareaRef ?? internalTextareaRef

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      syncTextareaHeight({
        textarea: textareaRef.current,
        minHeight,
        overlay: overlayScrollRef.current,
      })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [minHeight, textareaRef, value])

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return
    }

    const textarea = textareaRef.current
    if (!textarea) {
      return
    }

    let frameId: number | null = null
    const observer = new ResizeObserver(() => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }

      frameId = window.requestAnimationFrame(() => {
        syncTextareaHeight({
          textarea,
          minHeight,
          overlay: overlayScrollRef.current,
        })
      })
    })

    observer.observe(textarea)
    if (textarea.parentElement) {
      observer.observe(textarea.parentElement)
    }

    return () => {
      observer.disconnect()
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
    }
  }, [minHeight, textareaRef])

  return (
    <div className="relative">
      {highlightEmphasis ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="overflow-hidden" ref={overlayScrollRef}>
            <div className="whitespace-pre-wrap break-words [word-break:break-word] text-[16px] leading-[26px] text-white">
              {renderPromptOverlay(value, true)}
              {"​"}
            </div>
          </div>
        </div>
      ) : null}
      <textarea
        className={cn(className, highlightEmphasis && "relative z-10 text-transparent caret-white selection:bg-white/15")}
        onBlur={onBlur}
        onChange={(event) =>
          onChange(event.target.value, event.target.selectionStart ?? event.target.value.length, {
            inputType: event.nativeEvent instanceof InputEvent ? event.nativeEvent.inputType : null,
            isTrusted: event.nativeEvent.isTrusted,
          })
        }
        onFocus={(event) => onFocus?.(event.target.selectionStart ?? event.target.value.length)}
        onSelect={(event) => onCursorChange?.(event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
        ref={textareaRef}
        value={value}
      />
    </div>
  )
}

function SeedField({ onChange, value, widthClassName = "w-full" }: { onChange: (value: string) => void; value: string; widthClassName?: string }) {
  const [draft, setDraft] = useState("")
  const [isFocused, setIsFocused] = useState(false)
  const displayValue = isFocused ? draft : value === "N/A" ? "" : value

  return (
    <input
      className={cn(widthClassName, "bg-[rgb(14,15,33)] px-3 py-[9px] text-[16px] font-normal leading-6 text-white outline-none placeholder:text-white/35")}
      inputMode="numeric"
      onBlur={() => {
        setIsFocused(false)
        onChange(draft === "" ? "N/A" : draft)
      }}
      onChange={(event) => {
        const nextValue = event.target.value
        if (nextValue !== "" && !/^\d+$/.test(nextValue)) {
          return
        }
        setDraft(nextValue)
        if (nextValue !== "") {
          onChange(nextValue)
        }
      }}
      onFocus={() => {
        setDraft(value === "N/A" ? "" : value)
        setIsFocused(true)
      }}
      placeholder="Enter a seed"
      type="text"
      value={displayValue}
    />
  )
}

function NumberField({
  onChange,
  value,
  variant = "plain",
  widthClassName,
}: {
  onChange: (value: number) => void
  value: number
  variant?: "plain" | "boxed"
  widthClassName: string
}) {
  const [draft, setDraft] = useState("")
  const [isFocused, setIsFocused] = useState(false)
  const displayValue = isFocused ? draft : String(value)

  return (
    <input
      className={cn(
        "number-field font-sans text-[16px] leading-[21px] font-bold text-white outline-none",
        variant === "boxed"
          ? "h-11 border border-[rgb(34,37,63)] bg-[rgb(14,15,33)] px-[10px] text-center [text-align-last:center]"
          : "h-[21px] min-w-[1rem] max-w-[4rem] border-0 bg-transparent pl-[2px] pr-[2px] text-left",
        widthClassName
      )}
      inputMode="numeric"
      min={variant === "boxed" ? 64 : undefined}
      step={variant === "boxed" ? 64 : undefined}
      onBlur={() => {
        setIsFocused(false)
      }}
      onChange={(event) => {
        const nextValue = event.target.value
        if (nextValue !== "" && !/^\d*(?:\.\d+)?$/.test(nextValue)) {
          return
        }
        setDraft(nextValue)
        if (nextValue !== "") {
          onChange(Number(nextValue))
        }
      }}
      onFocus={() => {
        setDraft(String(value))
        setIsFocused(true)
      }}
      type="number"
      value={displayValue}
    />
  )
}
