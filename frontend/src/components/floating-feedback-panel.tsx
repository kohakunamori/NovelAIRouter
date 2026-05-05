"use client"

import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

const EXIT_ANIMATION_MS = 220

export function FloatingFeedbackPanel({
  message,
  onDismiss,
}: {
  message: { tone: "success" | "error" | "info"; text: string }
  onDismiss: () => void
}) {
  const dismissTimerRef = useRef<number | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setIsLeaving(false)
      setIsVisible(true)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current)
        dismissTimerRef.current = null
      }
    }
  }, [message.text, message.tone])

  const handleDismiss = () => {
    if (dismissTimerRef.current !== null) {
      return
    }

    setIsLeaving(true)
    dismissTimerRef.current = window.setTimeout(() => {
      dismissTimerRef.current = null
      setIsVisible(false)
      onDismiss()
    }, EXIT_ANIMATION_MS)
  }

  return (
    <div className="pointer-events-none fixed top-5 right-5 z-[320] w-[min(360px,calc(100vw-2rem))]">
      <div
        className={cn(
          "pointer-events-auto rounded-[6px] border bg-[rgb(25,27,49)] px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.35)] transition-[opacity,transform] duration-200 ease-out",
          isVisible && !isLeaving ? "translate-y-0 scale-100 opacity-100" : "-translate-y-2 scale-[0.985] opacity-0",
          message.tone === "success" && "border-emerald-400/30 text-emerald-100",
          message.tone === "error" && "border-rose-400/30 text-rose-100",
          message.tone === "info" && "border-white/10 text-white/90"
        )}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 text-sm leading-6">{message.text}</div>
          <button className="shrink-0 text-xs text-white/55 transition-colors hover:text-white/85" onClick={handleDismiss} type="button">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
