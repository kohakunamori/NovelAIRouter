import { createNovelAIRouterPathProxy } from "@/app/api/_lib/novelai-router-proxy"

export const dynamic = "force-dynamic"

export const GET = createNovelAIRouterPathProxy("/api/generations")
