import { useRef } from "react"

import {
  AnlasGemIcon,
  NovelAIHamburgerIcon,
  NovelAIHistoryIcon,
  NovelAIPenTipIcon,
  NovelAIPlusIcon,
  NovelAISettingsIcon,
} from "@/components/icons"
import { cn } from "@/lib/utils"

interface NovelAIMobileTopBarProps {
  anlas: number
  onOpenMenu: () => void
}

interface NovelAIMobileBottomBarProps {
  cost: number
  isLooping?: boolean
  onCtrlGenerate?: () => void
  onGenerate: () => void
  onOpenHistory: () => void
  onOpenSettings: () => void
}

export function NovelAIMobileTopBar({ anlas, onOpenMenu }: NovelAIMobileTopBarProps) {
  return (
    <div className="fixed inset-x-0 top-0 z-30 flex h-[50px] items-center border-b border-white/5 bg-[rgb(25,27,49)] px-2 text-white lg:hidden">
      <button className="flex h-12 w-[48px] items-center justify-center" type="button">
        <NovelAIPenTipIcon className="h-[21px] w-[18px] text-white" />
      </button>
      <div className="mx-auto flex items-center">
        <div className="flex items-center overflow-hidden rounded-l-[3px] border border-r-0 border-[rgb(34,37,63)] bg-[rgb(25,27,49)] px-[15px] py-[10px] text-[14px] leading-[21px] whitespace-nowrap">
          <span className="inline-flex items-center leading-[21px] font-semibold text-white">Anlas:</span>
          <span className="ml-[6px] flex items-center gap-[4px] leading-[21px] text-[rgb(245,243,194)]">
            <span className="relative top-px block font-heading text-[14px] leading-[21px] font-semibold">{anlas.toLocaleString()}</span>
            <AnlasGemIcon className="h-[10px] w-[10px] text-[rgb(245,243,194)]" />
          </span>
        </div>
        <button className="flex h-[43px] w-[46px] items-center justify-center border border-[rgb(34,37,63)] bg-[rgb(34,37,63)]" type="button">
          <NovelAIPlusIcon className="h-[14px] w-[14px] text-white" />
        </button>
      </div>
      <button aria-label="Open menu" className="flex h-12 w-[48px] items-center justify-center" onClick={onOpenMenu} type="button">
        <NovelAIHamburgerIcon className="h-4 w-[18px] text-white" />
      </button>
    </div>
  )
}

export function NovelAIMobileBottomBar({ cost, isLooping, onCtrlGenerate, onGenerate, onOpenHistory, onOpenSettings }: NovelAIMobileBottomBarProps) {
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFiredRef = useRef(false)

  const clearLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/5 bg-[rgb(25,27,49)] px-[10px] pb-[10px] pt-[10px] lg:hidden">
      <div className="flex items-center gap-[10px]">
        <button aria-label="Open generation settings" className="flex h-10 w-10 items-center justify-center rounded-[3px] text-white/85" onClick={onOpenSettings} type="button">
          <NovelAISettingsIcon className="h-4 w-4 text-white" />
        </button>
        <button
          className={cn(
            "flex h-11 flex-1 items-center rounded-[3px] px-4 text-left text-[14px] font-bold leading-[21px] text-[rgb(19,21,44)]",
            isLooping ? "bg-[rgb(255,140,140)]" : "bg-[rgb(245,243,194)]"
          )}
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
          title={isLooping ? "Tap to stop loop" : "Long-press to loop generate"}
          type="button"
        >
          <span>{isLooping ? "Looping…" : "Generate 1 Image"}</span>
          <span className="ml-auto inline-flex min-w-[32px] items-center justify-center rounded-[3px] bg-[rgb(19,21,44)] px-2.5 py-1 text-[rgb(245,243,194)]">{cost}</span>
        </button>
        <button aria-label="Open history" className="flex h-10 w-10 items-center justify-center rounded-[3px] text-white/85" onClick={onOpenHistory} type="button">
          <NovelAIHistoryIcon className="h-4 w-4 text-white" />
        </button>
      </div>
    </div>
  )
}
