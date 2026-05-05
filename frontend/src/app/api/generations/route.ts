import { proxyNovelAIRouterRequest } from "@/app/api/_lib/novelai-router-proxy"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return proxyNovelAIRouterRequest(request, "/api/generations")
}
