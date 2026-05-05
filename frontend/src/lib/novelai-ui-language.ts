"use client"

import { useCallback, useSyncExternalStore } from "react"

export type NovelAIUiLanguage = "en" | "zh"

export interface NovelAIUiLanguageOption {
  id: NovelAIUiLanguage
  label: string
  shortLabel: string
}

export const novelAIUiLanguageOptions: NovelAIUiLanguageOption[] = [
  { id: "en", label: "English", shortLabel: "EN" },
  { id: "zh", label: "中文", shortLabel: "中" },
]

export const defaultNovelAIUiLanguage: NovelAIUiLanguage = "en"

const novelAIUiLanguageStorageKey = "novelai.ui-language.v1"
const novelAIUiLanguageChangeEvent = "novelai-ui-language-change"

function isNovelAIUiLanguage(value: unknown): value is NovelAIUiLanguage {
  return value === "en" || value === "zh"
}

function readNovelAIUiLanguageFromStorage() {
  try {
    const storedValue = window.localStorage.getItem(novelAIUiLanguageStorageKey)
    return isNovelAIUiLanguage(storedValue) ? storedValue : defaultNovelAIUiLanguage
  } catch {
    return defaultNovelAIUiLanguage
  }
}

function subscribeToNovelAIUiLanguage(callback: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === novelAIUiLanguageStorageKey) {
      callback()
    }
  }

  const handleLanguageChange = () => callback()

  window.addEventListener("storage", handleStorage)
  window.addEventListener(novelAIUiLanguageChangeEvent, handleLanguageChange)

  return () => {
    window.removeEventListener("storage", handleStorage)
    window.removeEventListener(novelAIUiLanguageChangeEvent, handleLanguageChange)
  }
}

function getNovelAIUiLanguageSnapshot() {
  return readNovelAIUiLanguageFromStorage()
}

function getNovelAIUiLanguageServerSnapshot() {
  return defaultNovelAIUiLanguage
}

function writeNovelAIUiLanguageToStorage(language: NovelAIUiLanguage) {
  try {
    window.localStorage.setItem(novelAIUiLanguageStorageKey, language)
    window.dispatchEvent(new CustomEvent(novelAIUiLanguageChangeEvent))
  } catch {
  }
}

export function useNovelAIUiLanguage() {
  const language = useSyncExternalStore(
    subscribeToNovelAIUiLanguage,
    getNovelAIUiLanguageSnapshot,
    getNovelAIUiLanguageServerSnapshot
  )

  const setLanguage = useCallback((nextLanguage: NovelAIUiLanguage) => {
    writeNovelAIUiLanguageToStorage(nextLanguage)
  }, [])

  const toggleLanguage = useCallback(() => {
    setLanguage(language === "en" ? "zh" : "en")
  }, [language, setLanguage])

  return {
    language,
    options: novelAIUiLanguageOptions,
    setLanguage,
    toggleLanguage,
  }
}
