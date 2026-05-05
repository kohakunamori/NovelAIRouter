import { createNovelAIRouterPathProxy } from "@/app/api/_lib/novelai-router-proxy"

export const dynamic = "force-dynamic"

const proxyUserSettingsRequest = createNovelAIRouterPathProxy("/api/user-settings")

export const GET = proxyUserSettingsRequest
export const PUT = proxyUserSettingsRequest
