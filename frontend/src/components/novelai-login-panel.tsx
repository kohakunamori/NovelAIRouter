"use client"

import { useEffect, useState } from "react"

import { FloatingFeedbackPanel } from "@/components/floating-feedback-panel"
import { NovelAIThinCrossIcon } from "@/components/icons"
import { getAdminApiErrorMessage, login as loginCurrentUser } from "@/lib/novelai-admin-api"

interface NovelAILoginPanelProps {
  open: boolean
  onAuthenticated: () => void
  onClose: () => void
}

export function NovelAILoginPanel({ open, onAuthenticated, onClose }: NovelAILoginPanelProps) {
  const [loginForm, setLoginForm] = useState({ email: "", password: "" })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [onClose, open])

  useEffect(() => {
    if (!open) {
      setIsSubmitting(false)
      setErrorMessage(null)
      setIsVisible(false)
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      setIsVisible(true)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [open])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      await loginCurrentUser(loginForm)
      onAuthenticated()
      onClose()
    } catch (error) {
      setErrorMessage(getAdminApiErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center px-4 py-4 sm:px-6" role="presentation">
      {errorMessage ? <FloatingFeedbackPanel message={{ text: errorMessage, tone: "error" }} onDismiss={() => setErrorMessage(null)} /> : null}
      <button
        aria-label="close panel"
        className={`absolute inset-0 bg-[rgba(7,9,22,0.78)] backdrop-blur-[2px] transition-opacity duration-200 ${isVisible ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
        type="button"
      />
      <div
        aria-modal="true"
        className={`relative z-[301] w-full max-w-[440px] rounded-[6px] border border-[rgba(52,57,96,0.94)] bg-[rgb(15,17,37)] p-6 shadow-[0_36px_120px_rgba(0,0,0,0.55)] transition-[opacity,transform] duration-220 ease-out sm:p-7 ${isVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.985] opacity-0"}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button
          aria-label="close login panel"
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white"
          onClick={onClose}
          type="button"
        >
          <NovelAIThinCrossIcon className="h-3.5 w-3.5" />
        </button>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="pr-10 text-[28px] leading-[38px] font-semibold text-white">Log In</div>

          <input
            autoComplete="email"
            autoFocus
            className="h-[46px] w-full rounded-[4px] border border-[rgb(44,48,82)] bg-[rgb(13,15,33)] px-4 text-[15px] text-white outline-none transition-colors placeholder:text-white/24 focus:border-[rgb(110,123,191)]"
            onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="Enter Your Email"
            type="email"
            value={loginForm.email}
          />

          <input
            autoComplete="current-password"
            className="h-[46px] w-full rounded-[4px] border border-[rgb(44,48,82)] bg-[rgb(13,15,33)] px-4 text-[15px] text-white outline-none transition-colors placeholder:text-white/24 focus:border-[rgb(110,123,191)]"
            onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
            placeholder="Enter Your Password"
            type="password"
            value={loginForm.password}
          />

          <button
            className="inline-flex h-[44px] w-full items-center justify-center rounded-[4px] border border-[rgba(245,243,194,0.16)] bg-[rgb(245,243,194)] px-5 text-[14px] font-semibold text-[rgb(16,18,38)] transition-transform hover:-translate-y-px disabled:translate-y-0 disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Signing in…" : "Log In"}
          </button>
        </form>
      </div>
    </div>
  )
}
