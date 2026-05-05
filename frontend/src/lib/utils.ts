import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function estimatePromptTokens(value: string) {
  const normalizedValue = value.trim()
  if (!normalizedValue) {
    return 0
  }

  const tokens = normalizedValue.match(/::|-?\d+(?:\.\d+)?|[A-Za-z]+(?:[_-][A-Za-z0-9]+)*|[^\s]/g)
  return tokens?.length ?? 0
}

export function getPromptTokenProgress(value: string, maxTokens = 512) {
  const tokens = estimatePromptTokens(value)
  return {
    maxTokens,
    percent: Math.min((tokens / maxTokens) * 100, 100),
    tokens,
  }
}

export function appendPromptFragment(value: string, fragment: string) {
  const trimmedValue = value.trim().replace(/,?$/, "")
  if (!trimmedValue) {
    return fragment
  }
  return `${trimmedValue}, ${fragment}`
}

export function replacePromptTailFragment(value: string, fragment: string) {
  const normalizedParts = value
    .split(",")
    .slice(0, -1)
    .map((part) => part.trim())
    .filter(Boolean)

  if (normalizedParts.length === 0) {
    return `${fragment}, `
  }

  return `${normalizedParts.join(", ")}, ${fragment}, `
}
