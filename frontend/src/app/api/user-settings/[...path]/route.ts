import { proxyNovelAIRouterRequest } from "@/app/api/_lib/novelai-router-proxy"

export const dynamic = "force-dynamic"

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return proxyNovelAIRouterRequest(request, `/api/user-settings/${path.join("/")}`)
}

export async function PUT(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return proxyNovelAIRouterRequest(request, `/api/user-settings/${path.join("/")}`)
}
