import { createNovelAIRouterPathProxy } from "@/app/api/_lib/novelai-router-proxy"

export const dynamic = "force-dynamic"

const proxyAdminRequest = createNovelAIRouterPathProxy("/api/admin")

export const DELETE = proxyAdminRequest
export const GET = proxyAdminRequest
export const PATCH = proxyAdminRequest
export const POST = proxyAdminRequest
