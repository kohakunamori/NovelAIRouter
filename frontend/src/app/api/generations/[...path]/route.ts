import { proxyNovelAIRouterRequest } from "@/app/api/_lib/novelai-router-proxy"

export const dynamic = "force-dynamic"

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  const pathname = path.join("/")
  return proxyNovelAIRouterRequest(request, `/api/generations/${pathname}`)
}
