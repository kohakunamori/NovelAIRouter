"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

import Image from "next/image"
import { Copy, Download, Expand, ImagePlus, Images, PaintBucket, Pin, Sparkles, Wand2 } from "lucide-react"

import { AnlasGemIcon } from "@/components/icons"
import type { NovelAIWorkspaceActions } from "@/lib/use-novelai-workspace-state"
import { cn } from "@/lib/utils"
import type { EnhanceDraft, GenerationResult, GenerationRun, NovelAIUpscaleFactor, WorkspaceStage } from "@/types/novelai"

interface NovelAIImagePreviewProps {
  actions: Pick<
    NovelAIWorkspaceActions,
    | "applyEnhance"
    | "cancelEnhance"
    | "createVariations"
    | "openImageEditor"
    | "selectRun"
    | "setEnhanceMagnitude"
    | "setEnhanceScale"
    | "startEnhance"
    | "toggleEnhanceAdvanced"
    | "upscaleSelectedResult"
    | "useSelectedResultAsBaseImage"
    | "useSelectedResultAsPreciseReference"
    | "setSeed"
  >
  cost: number
  draft: EnhanceDraft | null
  isDesktopShell?: boolean
  result: GenerationResult
  run: GenerationRun
  selectedResultId: string | null
  stage: WorkspaceStage
}

export function NovelAIImagePreview({
  actions,
  cost,
  draft,
  isDesktopShell = false,
  result,
  run,
  selectedResultId,
  stage,
}: NovelAIImagePreviewProps) {
  const dimensions = { width: result.width, height: result.height }
  const showResultGrid = stage === "result-grid" || stage === "variations"
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [pinFeedback, setPinFeedback] = useState<string | null>(null)
  const [pinnedResultIds, setPinnedResultIds] = useState<Set<string>>(() => new Set())
  const copyFeedbackTimeoutRef = useRef<number | null>(null)
  const pinFeedbackTimeoutRef = useRef<number | null>(null)
  const upscaleSelectorRef = useRef<HTMLDivElement | null>(null)
  const [showUpscaleSelector, setShowUpscaleSelector] = useState(false)
  const isPinned = pinnedResultIds.has(result.id)

  useEffect(() => {
    return () => {
      if (copyFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(copyFeedbackTimeoutRef.current)
      }
      if (pinFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(pinFeedbackTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!showUpscaleSelector) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (upscaleSelectorRef.current?.contains(event.target as Node)) {
        return
      }

      setShowUpscaleSelector(false)
    }

    window.document.addEventListener("mousedown", handlePointerDown)
    return () => window.document.removeEventListener("mousedown", handlePointerDown)
  }, [showUpscaleSelector])

  const handleSelectUpscaleFactor = (factor: NovelAIUpscaleFactor) => {
    setShowUpscaleSelector(false)
    actions.upscaleSelectedResult(factor)
  }

  const showCopyFeedback = (message: string) => {
    if (copyFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(copyFeedbackTimeoutRef.current)
    }
    setCopyFeedback(message)
    copyFeedbackTimeoutRef.current = window.setTimeout(() => {
      setCopyFeedback(null)
      copyFeedbackTimeoutRef.current = null
    }, 1400)
  }

  const showPinFeedback = (message: string) => {
    if (pinFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(pinFeedbackTimeoutRef.current)
    }
    setPinFeedback(message)
    pinFeedbackTimeoutRef.current = window.setTimeout(() => {
      setPinFeedback(null)
      pinFeedbackTimeoutRef.current = null
    }, 1400)
  }

  const handleCopyImage = async () => {
    try {
      const response = await fetch(result.asset.src)
      if (!response.ok) {
        throw new Error("Failed to load image for clipboard.")
      }
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      showCopyFeedback("Copied!")
    } catch {
      showCopyFeedback("Copy failed")
    }
  }

  const handlePinImage = () => {
    const nextPinned = !isPinned
    setPinnedResultIds((current) => {
      const next = new Set(current)
      if (nextPinned) {
        next.add(result.id)
      } else {
        next.delete(result.id)
      }
      return next
    })
    showPinFeedback(nextPinned ? "Pinned" : "Unpinned")
  }

  const handleDownloadImage = () => {
    const anchor = document.createElement("a")
    anchor.href = result.asset.src
    anchor.download = `${result.id}.webp`
    anchor.click()
  }

  const handleEditImage = () => {
    actions.useSelectedResultAsBaseImage()
    actions.openImageEditor("edit")
  }

  const handleInpaintImage = () => {
    actions.useSelectedResultAsBaseImage()
    actions.openImageEditor("inpaint")
  }

  const handleCopySeed = () => {
    actions.setSeed(run.settingsSnapshot.seed)
  }

  const handleOpenImage = () => {
    window.open(result.asset.src, "_blank", "noopener,noreferrer")
  }

  return (
    <section className={isDesktopShell ? "relative flex h-screen min-w-0 flex-1 items-center justify-center overflow-hidden border-l border-white/5 border-r border-white/5 bg-[rgb(19,21,44)] px-6 py-5" : "relative flex h-screen min-w-0 flex-1 items-center justify-center overflow-hidden bg-[rgb(19,21,44)] px-6 py-5"}>
      {stage === "enhance" && draft ? (
        <div className="w-full max-w-[760px] rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] p-5 text-white shadow-[0_0_0_1px_rgba(34,37,63,0.8)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[24px] leading-8">Enhance Image</div>
              <div className="mt-1 text-[14px] leading-[21px] text-white/65">Tune an upscale-style enhancement pass before applying it.</div>
            </div>
            <div className="flex items-center gap-3">
              <button className="rounded-[3px] border border-[rgb(34,37,63)] px-3 py-2 text-[14px] text-white/85" onClick={actions.cancelEnhance} type="button">
                Cancel
              </button>
              <button className="inline-flex items-center gap-2 rounded-[3px] bg-[rgb(245,243,194)] px-3 py-2 text-[14px] font-semibold text-[rgb(19,21,44)]" onClick={actions.applyEnhance} type="button">
                <span>Enhance! 20</span>
                <AnlasGemIcon className="h-[10px] w-[10px] text-[rgb(19,21,44)]" />
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-[14px] leading-[21px] text-white/80">Upscale Amount</div>
                <div className="grid grid-cols-2 gap-2">
                  {(["1x", "1.5x"] as const).map((option) => (
                    <button
                      key={option}
                      className={draft.scale === option ? "rounded-[3px] bg-[rgb(34,37,63)] px-3 py-2 text-[14px] font-semibold text-white" : "rounded-[3px] border border-[rgb(34,37,63)] px-3 py-2 text-[14px] text-white/75"}
                      onClick={() => actions.setEnhanceScale(option)}
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[14px] leading-[21px] text-white/80">Magnitude</div>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((option) => (
                    <button
                      key={option}
                      className={draft.magnitude === option ? "rounded-[3px] bg-[rgb(34,37,63)] px-3 py-2 text-[14px] font-semibold text-white" : "rounded-[3px] border border-[rgb(34,37,63)] px-3 py-2 text-[14px] text-white/75"}
                      onClick={() => actions.setEnhanceMagnitude(option as 1 | 2 | 3)}
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <button className="flex w-full items-center justify-between rounded-[3px] border border-[rgb(34,37,63)] px-3 py-2 text-[14px] text-white/85" onClick={actions.toggleEnhanceAdvanced} type="button">
                <span>Show Advanced</span>
                <span>{draft.showAdvanced ? "−" : "+"}</span>
              </button>

              {draft.showAdvanced ? (
                <div className="grid gap-2 rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(14,15,33)] p-3 text-[13px] text-white/75">
                  <div className="flex items-center justify-between">
                    <span>Strength</span>
                    <span>{draft.strength}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Noise</span>
                    <span>{draft.noise}</span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-[3px] bg-[rgb(14,15,33)] p-3">
              <div className="relative aspect-[832/1216] w-full overflow-hidden rounded-[3px] bg-[rgb(25,27,49)]">
                <Image alt="Enhance preview" className="object-contain" fill sizes="(min-width: 1024px) 520px, 100vw" src={result.asset.src} unoptimized />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-full w-full max-w-[1200px] min-w-0 flex-col items-center justify-center gap-3">
          <div className="flex w-fit max-w-full flex-wrap items-center justify-center gap-1.5 rounded-[3px] bg-[rgb(25,27,49)]/95 px-3 py-2 text-white shadow-[0_0_0_1px_rgba(34,37,63,0.8)] backdrop-blur-sm">
            <ToolbarIconButton icon={<Sparkles className="h-4 w-4" strokeWidth={2.1} />} label="Enhance" onClick={actions.startEnhance} />
            <ToolbarCostButton active={run.kind === "variations"} cost={Math.max(cost, 28)} icon={<Images className="h-4 w-4" strokeWidth={2.1} />} label="Create Variations" onClick={actions.createVariations} />
            <div className="relative" ref={upscaleSelectorRef}>
              <ToolbarCostButton active={run.kind === "upscale" || showUpscaleSelector} cost={7} icon={<ImagePlus className="h-4 w-4" strokeWidth={2.1} />} label="Upscale Image" onClick={() => setShowUpscaleSelector((current) => !current)} />
              {showUpscaleSelector ? (
                <div className="absolute top-[calc(100%+6px)] left-1/2 z-30 min-w-[140px] -translate-x-1/2 rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] p-1 shadow-[0_12px_30px_rgba(0,0,0,0.45)]">
                  <UpscaleFactorOption factor={2} label="Upscale 2x" onClick={() => handleSelectUpscaleFactor(2)} />
                  <UpscaleFactorOption factor={4} label="Upscale 4x" onClick={() => handleSelectUpscaleFactor(4)} />
                </div>
              ) : null}
            </div>
            <ToolbarDivider />
            <ToolbarIconButton icon={<ImagePlus className="h-4 w-4" strokeWidth={2.1} />} label="Use as Base Image" onClick={actions.useSelectedResultAsBaseImage} />
            <ToolbarIconButton icon={<PaintBucket className="h-4 w-4" strokeWidth={2.1} />} label="Edit Image" onClick={handleEditImage} />
            <ToolbarIconButton icon={<Wand2 className="h-4 w-4" strokeWidth={2.1} />} label="Inpaint Image" onClick={handleInpaintImage} />
          </div>

          <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-3">
            {showResultGrid ? (
              <div className="grid min-h-0 w-full max-w-[860px] flex-1 auto-rows-fr grid-cols-2 gap-3 rounded-[3px] bg-[rgb(25,27,49)] p-3 shadow-[0_0_0_1px_rgba(34,37,63,0.8)]">
                {run.results.map((item) => {
                  const isSelected = selectedResultId === item.id

                  return (
                    <button
                      className={isSelected ? "relative min-h-0 overflow-hidden rounded-[3px] border border-[rgb(245,243,194)] bg-[rgb(19,21,44)] text-left shadow-[0_0_0_1px_rgba(245,243,194,0.2)]" : "relative min-h-0 overflow-hidden rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(19,21,44)] text-left"}
                      key={item.id}
                      onClick={() => actions.selectRun(run.id, item.id)}
                      type="button"
                    >
                      <Image alt={item.label ?? item.role} className="object-contain" fill sizes="(min-width: 1024px) 400px, 50vw" src={item.asset.src} unoptimized />
                      {item.label ? <div className="absolute left-2 top-2 rounded-[3px] bg-black/55 px-2 py-1 text-[12px] font-semibold tracking-[0.08em] text-white">{item.label}</div> : null}
                      {item.role === "variation" ? <div className="absolute right-2 bottom-2 rounded-[3px] bg-black/50 px-2 py-1 text-[12px] text-white">x4</div> : null}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="flex w-full flex-1 items-center justify-center min-h-0">
                <div className="flex h-full w-full max-w-[1100px] items-center justify-center overflow-hidden rounded-[3px] bg-[rgb(25,27,49)] shadow-[0_0_0_1px_rgba(34,37,63,0.8)]">
                  <div className="flex h-full w-full items-center justify-center bg-[rgb(25,27,49)] p-2">
                    <Image
                      alt="Generated preview"
                      className="h-auto max-h-full w-auto max-w-full object-contain"
                      height={dimensions.height}
                      priority
                      sizes="(min-width: 1024px) 760px, 100vw"
                      src={result.asset.src}
                      unoptimized
                      width={dimensions.width}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="relative flex min-h-[10px] w-full max-w-[1200px] flex-none items-center">
              <div className="my-[10px] flex w-full flex-wrap-reverse justify-between gap-[10px]">
                <div className="flex items-center gap-[10px]">
                  <div className="flex h-[44px] items-center rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] text-white shadow-[0_0_0_1px_rgba(34,37,63,0.45)]">
                    <div className="flex h-full items-center gap-2 rounded-l-[3px] px-3 text-[15px] font-semibold text-white/90">
                      <span>{dimensions.width}</span>
                      <PreviewDimensionsSeparatorIcon className="h-[12px] w-[12px] text-current" />
                      <span>{dimensions.height}</span>
                    </div>
                    <button
                      aria-label="Open image in new tab"
                      className="flex h-full w-[42px] items-center justify-center border-l border-[rgb(34,37,63)] rounded-r-[3px] text-white/85 transition-colors hover:bg-white/5 hover:text-white"
                      onClick={handleOpenImage}
                      type="button"
                    >
                      <Expand className="h-4 w-4" strokeWidth={2.1} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-[10px]">
                  <div className="flex h-[44px] items-center rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] px-2 shadow-[0_0_0_1px_rgba(34,37,63,0.45)]">
                    <FooterIconButton active={isPinned} feedback={pinFeedback} icon={<Pin className="h-4 w-4" strokeWidth={2.1} />} label={isPinned ? "Unpin Image" : "Pin Image"} onClick={handlePinImage} />
                    <FooterIconButton feedback={copyFeedback} icon={<Copy className="h-4 w-4" strokeWidth={2.1} />} label="Copy to Clipboard" onClick={handleCopyImage} />
                    <FooterIconButton icon={<Download className="h-4 w-4" strokeWidth={2.1} />} label="Download Image" onClick={handleDownloadImage} />
                    <ResultMetaButton defaultLabel={run.settingsSnapshot.seed} hoverLabel="Copy to Seed" onClick={handleCopySeed} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function ToolbarIconButton({
  active = false,
  icon,
  label,
  onClick,
}: {
  active?: boolean
  icon: ReactNode
  label: string
  onClick?: () => void
}) {
  return (
    <div className="group relative flex h-9 items-center">
      <button
        aria-label={label}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-[3px] text-white/85 transition-colors",
          active ? "bg-[rgb(34,37,63)] text-white" : "hover:bg-white/5"
        )}
        onClick={onClick}
        type="button"
      >
        {icon}
      </button>
      <div className="pointer-events-none absolute top-[calc(100%+8px)] left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] px-2.5 py-1.5 text-[12px] leading-4 text-white/90 shadow-[0_10px_30px_rgba(0,0,0,0.35)] group-hover:block">
        {label}
      </div>
    </div>
  )
}

function ToolbarCostButton({
  active = false,
  cost,
  icon,
  label,
  onClick,
}: {
  active?: boolean
  cost: number
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <div className="group relative flex h-9 items-center">
      <button
        aria-label={label}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-[3px] px-2.5 py-1.5 text-sm font-semibold text-white transition-colors",
          active ? "bg-[rgb(34,37,63)]" : "hover:bg-white/5"
        )}
        onClick={onClick}
        type="button"
      >
        <span className="flex h-4 w-4 items-center justify-center text-white/90">{icon}</span>
        <span className="flex items-center gap-1.5 leading-none text-white">
          <span>{cost}</span>
          <AnlasGemIcon className="h-[10px] w-[10px] text-white" />
        </span>
      </button>
      <div className="pointer-events-none absolute top-[calc(100%+8px)] left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] px-2.5 py-1.5 text-[12px] leading-4 text-white/90 shadow-[0_10px_30px_rgba(0,0,0,0.35)] group-hover:block">
        {label}
      </div>
    </div>
  )
}

function ToolbarDivider() {
  return <div className="mx-1 h-5 w-px bg-[rgb(34,37,63)]" />
}

function PreviewDimensionsSeparatorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 1L1 13M1 1L13 13" stroke="currentColor" />
    </svg>
  )
}

function FooterIconButton({
  active = false,
  feedback,
  icon,
  label,
  onClick,
}: {
  active?: boolean
  feedback?: string | null
  icon: ReactNode
  label: string
  onClick?: () => void
}) {
  return (
    <div className="group relative flex h-[44px] items-center">
      <button
        aria-label={label}
        className={cn(
          "flex h-[34px] w-[34px] items-center justify-center rounded-[3px] text-white/85 transition-colors hover:bg-white/5 hover:text-white",
          active && "bg-[rgb(245,243,194)]/15 text-[rgb(245,243,194)]"
        )}
        onClick={onClick}
        type="button"
      >
        {icon}
      </button>
      <div className={cn(
        "pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] px-2.5 py-1.5 text-[12px] leading-4 text-white/90 shadow-[0_10px_30px_rgba(0,0,0,0.35)]",
        feedback ? "block" : "hidden group-hover:block"
      )}>
        {feedback ?? label}
      </div>
    </div>
  )
}

function ResultMetaButton({
  defaultLabel,
  hoverLabel,
  onClick,
}: {
  defaultLabel: string
  hoverLabel: string
  onClick?: () => void
}) {
  return (
    <button
      className="group inline-flex h-[34px] items-center rounded-[3px] px-2.5 text-[13px] text-white/85 transition-colors hover:bg-white/5 hover:text-white"
      onClick={onClick}
      type="button"
    >
      <span className="grid text-center leading-none">
        <span className="col-start-1 row-start-1 visible group-hover:invisible">{defaultLabel}</span>
        <span className="col-start-1 row-start-1 invisible group-hover:visible">{hoverLabel}</span>
      </span>
    </button>
  )
}

function UpscaleFactorOption({
  factor,
  label,
  onClick,
}: {
  factor: NovelAIUpscaleFactor
  label: string
  onClick: () => void
}) {
  return (
    <button
      className="flex w-full items-center gap-2 rounded-[3px] px-3 py-2 text-left text-[14px] leading-[21px] text-white/85 transition-colors hover:bg-white/5 hover:text-white"
      onClick={onClick}
      type="button"
    >
      <span>x{factor}</span>
      <span>{label}</span>
    </button>
  )
}
