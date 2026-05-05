import { createNovelAIRouterPathProxy } from "@/app/api/_lib/novelai-router-proxy"

export const dynamic = "force-dynamic"

const proxyAuthRequest = createNovelAIRouterPathProxy("/api/auth")

export const GET = proxyAuthRequest
export const POST = proxyAuthRequest
