"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react"

import type { GenerationIntermediateFrame, ManagedGenerationStatus } from "@/types/novelai"

import Image from "next/image"

import { FloatingFeedbackPanel } from "@/components/floating-feedback-panel"
import { NovelAIHistoryRail } from "@/components/novelai-history-rail"
import { NovelAIThinCrossIcon } from "@/components/icons"
import { NovelAIImagePreview } from "@/components/novelai-image-preview"
import { NovelAILoginPanel } from "@/components/novelai-login-panel"
import { NovelAIMobileBottomBar, NovelAIMobileTopBar } from "@/components/novelai-mobile-chrome"
import { NovelAIQuickstartGallery } from "@/components/novelai-quickstart-gallery"
import { NovelAISettingsPanel, NovelAISettingsPanelContent } from "@/components/novelai-settings-panel"
import { characterTemplates, imageModelOptions, imagePresets, quickstartSamples, samplerOptions } from "@/lib/novelai-demo-data"
import { estimateNovelAIGenerateAnlas } from "@/lib/novelai-anlas-estimator"
import { getCurrentUser } from "@/lib/novelai-admin-api"
import { useNovelAIWorkspaceState } from "@/lib/use-novelai-workspace-state"

const DESKTOP_SHELL_BREAKPOINT = 960
const THREE_COLUMN_GALLERY_BREAKPOINT = 768
const SETTINGS_WIDTH_COMPACT = 400
const SETTINGS_WIDTH_REGULAR = 450
const SETTINGS_WIDTH_REGULAR_BREAKPOINT = 1300
const SETTINGS_WIDTH_MAX_CEILING = 675
const SETTINGS_WIDTH_MAX_VIEWPORT_RATIO = 0.5
const HIDDEN_STREAMED_IMAGE_STEP_COUNT = 4
const GALLERY_ORDER_POLL_MS = 15_000
const MAIN_STAGE_TRANSITION_MS = 260

type NovelAIAccountState = "loading" | "anonymous" | "authenticated"

export function NovelAIImageWorkspace() {
  const {
    actions,
    effectiveBasePrompt,
    effectiveUndesiredPrompt,
    selectedResult,
    selectedRun,
    state,
  } = useNovelAIWorkspaceState()
  const [viewportWidth, setViewportWidth] = useState(1280)
  const [availableAnlas, setAvailableAnlas] = useState(0)
  const [accountState, setAccountState] = useState<NovelAIAccountState>("loading")
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLoginPanelOpen, setIsLoginPanelOpen] = useState(false)
  const [showStreamedImagesUnprocessed, setShowStreamedImagesUnprocessed] = useState(false)
  const [galleryOrderSeed, setGalleryOrderSeed] = useState("default")
  const [isLooping, setIsLooping] = useState(false)
  const loopRef = useRef(false)
  const prevStageRef = useRef(state.ui.stage)
  const [manualSettingsWidth, setManualSettingsWidth] = useState<number | null>(null)
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const resizeFrameRef = useRef<number | null>(null)
  const pendingSettingsWidthRef = useRef<number | null>(null)

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth)

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  useEffect(() => {
    return () => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let isActive = true

    void fetch("/api/auth/balance", {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load NovelAI balance")
        }

        const payload = (await response.json()) as { balance?: unknown }
        const nextAnlas = typeof payload.balance === "number" && Number.isFinite(payload.balance) ? payload.balance : 0
        if (isActive) {
          setAvailableAnlas(nextAnlas)
        }
      })
      .catch(() => {
        if (isActive) {
          setAvailableAnlas(0)
        }
      })

    void getCurrentUser()
      .then((response) => {
        if (isActive) {
          setAccountState("authenticated")
          if (response.user.role === "ADMIN") {
            setIsAdmin(true)
          }
        }
      })
      .catch(() => {
        if (isActive) {
          setAccountState("anonymous")
        }
      })

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    let isActive = true

    const loadGalleryOrder = async () => {
      try {
        const response = await fetch("/api/gallery-order", {
          cache: "no-store",
          credentials: "same-origin",
        })

        if (!response.ok) {
          return
        }

        const seed = getGalleryOrderSeed(await response.json())
        if (seed && isActive) {
          setGalleryOrderSeed(seed)
        }
      } catch {
        return
      }
    }

    void loadGalleryOrder()
    const intervalId = window.setInterval(() => {
      void loadGalleryOrder()
    }, GALLERY_ORDER_POLL_MS)

    return () => {
      isActive = false
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!state.ui.quickstartPromptUndoSnapshot || event.key.toLowerCase() !== "z" || event.shiftKey || (!event.ctrlKey && !event.metaKey)) {
        return
      }

      if (!canHandleQuickstartPromptUndo(event.target, state.document.basePrompt, state.document.undesiredPrompt)) {
        return
      }

      event.preventDefault()
      actions.undoQuickstartPromptSelection()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [actions, state.document.basePrompt, state.document.undesiredPrompt, state.ui.quickstartPromptUndoSnapshot])

  const gallerySamples = quickstartSamples
  const generateEstimate = useMemo(() => estimateNovelAIGenerateAnlas(state.document), [state.document])
  const generateCost = generateEstimate.total
  const isDesktopShell = viewportWidth >= DESKTOP_SHELL_BREAKPOINT
  const galleryColumnCount: 2 | 3 = viewportWidth >= THREE_COLUMN_GALLERY_BREAKPOINT ? 3 : 2
  const settingsWidthBounds = getSettingsWidthBounds({ viewportWidth })
  const defaultSettingsWidth = getDefaultSettingsWidth(viewportWidth)
  const settingsWidth = clamp(manualSettingsWidth ?? defaultSettingsWidth, settingsWidthBounds.minWidth, settingsWidthBounds.maxWidth)
  const applyStreamedPreviewBlur = !showStreamedImagesUnprocessed
  const mainStageKey = state.ui.stage === "generating"
    ? "generating"
    : state.ui.stage === "gallery" || !selectedRun || !selectedResult
      ? "gallery"
      : `${state.ui.stage}:${selectedRun.id}`

  const requestGenerate = useCallback(() => {
    if (accountState !== "authenticated") {
      setIsLoginPanelOpen(true)
      return false
    }

    if (generateEstimate.total > 0 && availableAnlas < generateEstimate.total) {
      window.alert(`Estimated generation cost is ${generateEstimate.total} Anlas, but your balance is ${availableAnlas}.`)
      return false
    }

    actions.generate()
    return true
  }, [accountState, actions, availableAnlas, generateEstimate.total])

  const handleGenerate = () => {
    requestGenerate()
  }

  const handleCtrlGenerate = () => {
    if (state.document.seed !== "N/A") return

    if (loopRef.current) {
      loopRef.current = false
      setIsLooping(false)
    } else {
      loopRef.current = true
      setIsLooping(true)
      if (state.ui.stage !== "generating" && !requestGenerate()) {
        loopRef.current = false
        setIsLooping(false)
      }
    }
  }

  useEffect(() => {
    const prev = prevStageRef.current
    prevStageRef.current = state.ui.stage

    if (!loopRef.current || prev !== "generating" || state.ui.stage === "generating") {
      return
    }

    const timeoutId = window.setTimeout(() => {
      if (loopRef.current && !requestGenerate()) {
        loopRef.current = false
        setIsLooping(false)
      }
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [state.ui.stage, requestGenerate])

  const handleStartSettingsResize = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isDesktopShell) {
      return
    }

    resizeStateRef.current = {
      startX: event.clientX,
      startWidth: settingsWidth,
    }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const resizeState = resizeStateRef.current
      if (!resizeState) {
        return
      }

      pendingSettingsWidthRef.current = clamp(
        resizeState.startWidth + (moveEvent.clientX - resizeState.startX),
        settingsWidthBounds.minWidth,
        settingsWidthBounds.maxWidth
      )

      if (resizeFrameRef.current !== null) {
        return
      }

      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null
        if (pendingSettingsWidthRef.current !== null) {
          setManualSettingsWidth(pendingSettingsWidthRef.current)
        }
      })
    }

    const handleMouseUp = () => {
      resizeStateRef.current = null
      pendingSettingsWidthRef.current = null
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current)
        resizeFrameRef.current = null
      }
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }

    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
    event.preventDefault()
  }

  return (
    <div className="h-screen overflow-hidden bg-[rgb(19,21,44)] text-white">
      {state.ui.requestErrorMessage ? (
        <FloatingFeedbackPanel message={{ text: state.ui.requestErrorMessage, tone: "error" }} onDismiss={actions.clearRequestError} />
      ) : null}
      {!isDesktopShell ? <NovelAIMobileTopBar anlas={availableAnlas} onOpenSettings={() => actions.openMobilePanel("settings")} /> : null}
      <div className="flex h-full min-w-0">
        {isDesktopShell ? (
          <div className="relative shrink-0" style={{ width: `${settingsWidth}px` }}>
            <NovelAISettingsPanel
              accountState={accountState}
              isAdmin={isAdmin}
              isLooping={isLooping}
              actions={actions}
              anlas={availableAnlas}
              characterTemplates={characterTemplates}
              desktopWidth={settingsWidth}
              generateEstimate={generateEstimate}
              imageModelOptions={imageModelOptions}
              imagePresets={imagePresets}
              onCtrlGenerate={handleCtrlGenerate}
              onLoggedOut={() => setAccountState("anonymous")}
              onOpenLoginPanel={() => setIsLoginPanelOpen(true)}
              onRequestGenerate={handleGenerate}
              onToggleShowStreamedImagesUnprocessed={() => setShowStreamedImagesUnprocessed((current) => !current)}
              samplerOptions={samplerOptions}
              showStreamedImagesUnprocessed={showStreamedImagesUnprocessed}
              state={state}
            />
            <div className="absolute top-0 right-[-2px] z-10 h-full w-[6px] cursor-e-resize" onMouseDown={handleStartSettingsResize} />
          </div>
        ) : null}

        <NovelAIMainStageTransition stageKey={mainStageKey}>
          {state.ui.stage === "generating" ? (
            <NovelAIGeneratingStage
              frames={state.ui.generationIntermediateFrames}
              height={state.ui.generationTargetHeight}
              imageCount={state.ui.generationTargetImageCount}
              isDesktopShell={isDesktopShell}
              applyStreamedPreviewBlur={applyStreamedPreviewBlur}
              status={state.ui.generationJobStatus}
              steps={state.document.steps}
              width={state.ui.generationTargetWidth}
            />
          ) : state.ui.stage === "gallery" || !selectedRun || !selectedResult ? (
            <NovelAIQuickstartGallery
              columnCount={galleryColumnCount}
              copiedSampleId={state.ui.copiedSampleId}
              isDesktopShell={isDesktopShell}
              onSelect={actions.selectSample}
              orderSeed={galleryOrderSeed}
              samples={gallerySamples}
            />
          ) : (
            <NovelAIImagePreview
              actions={actions}
              cost={selectedRun.cost || generateCost}
              draft={state.document.enhanceDraft}
              isDesktopShell={isDesktopShell}
              result={selectedResult}
              run={selectedRun}
              selectedResultId={state.document.selectedResultId}
              stage={state.ui.stage}
            />
          )}
        </NovelAIMainStageTransition>

        {isDesktopShell ? (
          <NovelAIHistoryRail
            hidden={state.ui.historyRailHidden}
            onApplyHistorySettings={actions.applyHistorySettings}
            onClearHistory={actions.clearHistory}
            onSelectRun={actions.selectRun}
            onToggleHidden={actions.toggleHistoryRailHidden}
            runs={state.document.historyRuns}
            selectedRunId={state.document.selectedRunId}
            stage={state.ui.stage}
          />
        ) : null}
      </div>

      {!isDesktopShell ? (
        <NovelAIMobileBottomBar
          cost={generateCost}
          isLooping={isLooping}
          onCtrlGenerate={handleCtrlGenerate}
          onGenerate={handleGenerate}
          onOpenHistory={() => actions.openMobilePanel("history")}
          onOpenSettings={() => actions.openMobilePanel("settings")}
        />
      ) : null}

      {!isDesktopShell && state.ui.activeMobilePanel ? (
        <MobilePanelOverlay onClose={actions.closeMobilePanel} title={state.ui.activeMobilePanel === "settings" ? "Settings" : "History"}>
          {state.ui.activeMobilePanel === "settings" ? (
            <div className="bg-[rgb(25,27,49)]">
              <NovelAISettingsPanelContent
                accountState={accountState}
                actions={actions}
                anlas={availableAnlas}
                characterTemplates={characterTemplates}
                generateEstimate={generateEstimate}
                imageModelOptions={imageModelOptions}
                imagePresets={imagePresets}
                isLooping={isLooping}
                onCtrlGenerate={handleCtrlGenerate}
                samplerOptions={samplerOptions}
                state={state}
              />
            </div>
          ) : (
            <div className="space-y-4 p-4">
              {state.document.historyRuns.length === 0 ? (
                <div className="rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] p-4 text-sm text-white/55">
                  Generate an image to populate history.
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                {state.document.historyRuns.map((run) => {
                  const thumbnail = run.results[0]
                  if (!thumbnail) {
                    return null
                  }

                  return (
                    <button
                      key={run.id}
                      className={state.document.selectedRunId === run.id ? "relative aspect-[3/4] overflow-hidden rounded-[3px] border border-[rgb(245,243,194)] bg-[rgb(25,27,49)]" : "relative aspect-[3/4] overflow-hidden rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)]"}
                      onClick={() => {
                        actions.selectRun(run.id)
                        actions.closeMobilePanel()
                      }}
                      type="button"
                    >
                      <Image alt="choose image" className="object-cover" fill sizes="45vw" src={thumbnail.asset.src} unoptimized />
                      {run.results.length > 1 ? <div className="absolute right-1.5 bottom-1.5 rounded-[3px] bg-black/50 px-1.5 py-0.5 text-[11px] text-white">x{run.results.length}</div> : null}
                    </button>
                  )
                })}
              </div>
              {state.document.historyRuns.length > 0 ? (
                <button className="rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] px-4 py-3 text-sm text-white/85" onClick={actions.clearHistory} type="button">
                  Clear History
                </button>
              ) : null}
              {selectedRun ? (
                <div className="rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] p-4 text-[13px] leading-5 text-white/75">
                  <div className="text-white/90">{selectedRun.createdAtLabel}</div>
                  <div className="mt-2 line-clamp-3">{effectiveBasePrompt}</div>
                  <div className="mt-2 line-clamp-2 text-white/55">{effectiveUndesiredPrompt}</div>
                </div>
              ) : null}
            </div>
          )}
        </MobilePanelOverlay>
      ) : null}

      <NovelAILoginPanel
        onAuthenticated={() => setAccountState("authenticated")}
        onClose={() => setIsLoginPanelOpen(false)}
        open={isLoginPanelOpen}
      />
    </div>
  )
}

function getGalleryOrderSeed(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null
  }

  const seed = Reflect.get(payload, "seed")
  return typeof seed === "string" && seed.length > 0 ? seed : null
}

function NovelAIMainStageTransition({ children, stageKey }: { children: ReactNode; stageKey: string }) {
  const [exitingLayer, setExitingLayer] = useState<{ node: ReactNode; stageKey: string } | null>(null)
  const latestLayerRef = useRef({ node: children, stageKey })
  const timeoutRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const previousLayer = latestLayerRef.current

    if (previousLayer.stageKey !== stageKey) {
      setExitingLayer(previousLayer)

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
      }

      timeoutRef.current = window.setTimeout(() => {
        setExitingLayer(null)
        timeoutRef.current = null
      }, MAIN_STAGE_TRANSITION_MS)
    }
  }, [stageKey])

  useLayoutEffect(() => {
    latestLayerRef.current = { node: children, stageKey }
  })

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <div className="relative flex min-w-0 flex-1 overflow-hidden">
      {exitingLayer ? (
        <div className="animate-novelai-stage-exit pointer-events-none absolute inset-0 z-0 motion-reduce:animate-none" key={`exit-${exitingLayer.stageKey}`}>
          {exitingLayer.node}
        </div>
      ) : null}
      <div className="animate-novelai-stage-enter absolute inset-0 z-10 motion-reduce:animate-none" key={`enter-${stageKey}`}>
        {children}
      </div>
    </div>
  )
}

function NovelAIGeneratingStage({
  frames,
  height,
  imageCount,
  isDesktopShell,
  applyStreamedPreviewBlur,
  status,
  steps,
  width,
}: {
  frames: GenerationIntermediateFrame[]
  height: number
  imageCount: number
  isDesktopShell: boolean
  applyStreamedPreviewBlur: boolean
  status: ManagedGenerationStatus | null
  steps: number
  width: number
}) {
  const frameSlots = Array.from({ length: imageCount }, (_, index) => getLatestGenerationFrame(frames.filter((frame) => frame.outputIndex === index)))
  const latestFrame = getLatestGenerationFrame(frames)
  const progress = getGenerationStageProgress(status, latestFrame, steps)
  const showGrid = imageCount > 1

  return (
    <section className={isDesktopShell ? "relative flex h-screen min-w-0 flex-1 items-center justify-center overflow-hidden border-l border-white/5 border-r border-white/5 bg-[rgb(19,21,44)] px-6 py-5" : "relative flex h-screen min-w-0 flex-1 items-center justify-center overflow-hidden bg-[rgb(19,21,44)] px-6 py-5"}>
      <div className="flex h-full w-full max-w-[1400px] min-w-0 flex-col items-center justify-center gap-3">
        <div className="w-full pt-3 pb-4">
          <div className="h-[10px] w-full overflow-hidden rounded-full bg-[rgb(34,37,63)]/70">
            <div className="h-full w-full origin-left rounded-full bg-[rgb(245,243,194)] transition-transform duration-700 ease-out will-change-transform" style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
        </div>

        <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-3">
          {showGrid ? (
            <div className="grid w-full max-w-[1100px] grid-cols-2 gap-3 rounded-[3px] bg-transparent p-3 shadow-[0_0_0_1px_rgba(34,37,63,0.35)]">
              {frameSlots.map((frame, index) => (
                <GeneratingFrame frame={frame} height={height} key={index} label={`Image ${index + 1}`} applyStreamedPreviewBlur={applyStreamedPreviewBlur} width={width} />
              ))}
            </div>
          ) : (
            <div className="flex w-full flex-1 items-center justify-center min-h-0">
              <div className="flex h-full w-full max-w-[1100px] items-center justify-center overflow-hidden rounded-[3px] bg-transparent shadow-[0_0_0_1px_rgba(34,37,63,0.35)]">
                <div className="flex h-full w-full items-center justify-center bg-transparent p-2">
                  <GeneratingFrame frame={latestFrame} height={height} label="Image 1" large applyStreamedPreviewBlur={applyStreamedPreviewBlur} width={width} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function GeneratingFrame({
  frame,
  height,
  label,
  large = false,
  applyStreamedPreviewBlur,
  width,
}: {
  frame: GenerationIntermediateFrame | null
  height: number
  label: string
  large?: boolean
  applyStreamedPreviewBlur: boolean
  width: number
}) {
  const shouldHideFrame = frame ? shouldHideStreamedImageFrame(frame, applyStreamedPreviewBlur) : false
  const shouldBlurFrame = Boolean(frame && applyStreamedPreviewBlur && !shouldHideFrame)
  const frameSrc = frame && !shouldHideFrame ? getGenerationFrameSrc(frame) : null
  const frameLabel = frame ? getGenerationFrameLabel(frame) : "Waiting for remote frame"
  const frameStyle = large
    ? { aspectRatio: `${width} / ${height}`, height: "100%", maxWidth: "100%" }
    : { aspectRatio: `${width} / ${height}` }

  return (
    <div
      className={large ? "relative max-h-full max-w-full overflow-hidden rounded-[3px] bg-transparent" : "relative w-full overflow-hidden rounded-[3px] border border-[rgb(34,37,63)] bg-transparent"}
      style={frameStyle}
    >
      {frameSrc ? <Image alt={`${label} intermediate preview`} className={shouldBlurFrame ? "scale-[1.03] object-contain blur-xl" : "object-contain"} fill sizes={large ? "(min-width: 1024px) 760px, 100vw" : "(min-width: 1024px) 420px, 50vw"} src={frameSrc} unoptimized /> : <GeneratingFramePlaceholder />}
      <div className="absolute left-2 top-2 rounded-[3px] bg-black/55 px-2 py-1 text-[12px] font-semibold tracking-[0.08em] text-white">{label}</div>
      <div className="absolute right-2 bottom-2 rounded-[3px] bg-black/50 px-2 py-1 text-[12px] text-white">{frameLabel}</div>
    </div>
  )
}

function GeneratingFramePlaceholder() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_center,rgba(34,37,63,0.95),rgba(14,15,33,0.98)_58%)] text-white/55">
      <div className="relative h-14 w-14 rounded-full border border-[rgb(34,37,63)]">
        <div className="absolute inset-2 animate-pulse rounded-full bg-[rgb(245,243,194)]/20" />
        <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgb(245,243,194)]" />
      </div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.12em] text-white/45">Awaiting Stream</div>
    </div>
  )
}

function getGenerationFrameSrc(frame: GenerationIntermediateFrame) {
  return `data:${frame.mimeType};base64,${frame.imageBase64}`
}

function shouldHideStreamedImageFrame(frame: GenerationIntermediateFrame, applyStreamedPreviewBlur: boolean) {
  if (!applyStreamedPreviewBlur) {
    return false
  }

  const hiddenStepCount = frame.totalSteps ? Math.min(HIDDEN_STREAMED_IMAGE_STEP_COUNT, Math.max(frame.totalSteps - 1, 0)) : HIDDEN_STREAMED_IMAGE_STEP_COUNT
  return frame.stepIndex < hiddenStepCount
}

function getLatestGenerationFrame(frames: GenerationIntermediateFrame[]) {
  return frames.reduce<GenerationIntermediateFrame | null>((latestFrame, frame) => {
    if (!latestFrame || frame.receivedAt > latestFrame.receivedAt) {
      return frame
    }

    return latestFrame
  }, null)
}

function getGenerationFrameLabel(frame: GenerationIntermediateFrame) {
  const displayStep = frame.stepIndex + 1
  if (frame.totalSteps) {
    return `Step ${Math.min(displayStep, frame.totalSteps)} / ${frame.totalSteps}`
  }

  return `Step ${displayStep}`
}

function getGenerationStageProgress(status: ManagedGenerationStatus | null, latestFrame: GenerationIntermediateFrame | null, configuredSteps: number) {
  if (status === "SUCCEEDED") {
    return 100
  }

  if (status === "FAILED" || status === "CANCELLED") {
    return 100
  }

  const totalSteps = latestFrame?.totalSteps ?? configuredSteps
  if (latestFrame && totalSteps > 0) {
    return clamp(Math.round(((latestFrame.stepIndex + 1) / totalSteps) * 100), 0, 100)
  }

  return 0
}

function canHandleQuickstartPromptUndo(target: EventTarget | null, basePrompt: string, undesiredPrompt: string) {
  if (!(target instanceof Element)) {
    return true
  }

  if (target instanceof HTMLTextAreaElement) {
    return target.value === basePrompt || target.value === undesiredPrompt
  }

  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) {
    return false
  }

  return true
}

function MobilePanelOverlay({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/65 lg:hidden">
      <div className="absolute inset-x-0 top-[50px] bottom-[74px] overflow-hidden rounded-t-[12px] border-t border-white/10 bg-[rgb(19,21,44)] shadow-[0_-10px_40px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <div className="text-sm font-semibold uppercase tracking-[0.08em] text-white/75">{title}</div>
          <button className="text-white/80" onClick={onClose} type="button">
            <NovelAIThinCrossIcon className="h-[14px] w-[14px] text-white/80" />
          </button>
        </div>
        <div className="scrollbar-thin h-full overflow-y-auto pb-24">{children}</div>
      </div>
    </div>
  )
}

function getSettingsWidthBounds({ viewportWidth }: { viewportWidth: number }) {
  const minWidth = getDefaultSettingsWidth(viewportWidth)
  const maxWidth = clamp(
    Math.round(viewportWidth * SETTINGS_WIDTH_MAX_VIEWPORT_RATIO) - 1,
    minWidth,
    SETTINGS_WIDTH_MAX_CEILING
  )

  return { minWidth, maxWidth }
}

function getDefaultSettingsWidth(viewportWidth: number) {
  return viewportWidth >= SETTINGS_WIDTH_REGULAR_BREAKPOINT ? SETTINGS_WIDTH_REGULAR : SETTINGS_WIDTH_COMPACT
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
