const backendOrigin = process.env.NOVELAI_ROUTER_ORIGIN ?? "http://127.0.0.1:4000"

const requestHeaderAllowlist = ["accept", "content-type", "cookie", "last-event-id"]
const responseHeaderBlocklist = new Set(["connection", "content-encoding", "content-length", "keep-alive", "transfer-encoding"])

function buildUpstreamUrl(request: Request, path: string) {
  const upstreamUrl = new URL(path, backendOrigin)
  upstreamUrl.search = new URL(request.url).search
  return upstreamUrl
}

function buildUpstreamHeaders(request: Request) {
  const headers = new Headers()

  for (const headerName of requestHeaderAllowlist) {
    const headerValue = request.headers.get(headerName)
    if (headerValue) {
      headers.set(headerName, headerValue)
    }
  }

  return headers
}

function buildDownstreamHeaders(headers: Headers) {
  const nextHeaders = new Headers()

  headers.forEach((value, key) => {
    if (!responseHeaderBlocklist.has(key.toLowerCase())) {
      nextHeaders.append(key, value)
    }
  })

  return nextHeaders
}

function buildBackendUnavailableResponse(path: string, error: unknown) {
  const detail = error instanceof Error ? error.message : "Unknown proxy error"

  return Response.json(
    {
      error: {
        code: "BACKEND_UNREACHABLE",
        message: `NovelAI backend is unreachable for ${path}`,
        details: detail,
      },
    },
    { status: 503 }
  )
}

export async function proxyNovelAIRouterRequest(request: Request, path: string) {
  const method = request.method.toUpperCase()
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer()

  try {
    const upstreamResponse = await fetch(buildUpstreamUrl(request, path), {
      method,
      headers: buildUpstreamHeaders(request),
      body,
      cache: "no-store",
      redirect: "manual",
    })

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: buildDownstreamHeaders(upstreamResponse.headers),
    })
  } catch (error) {
    return buildBackendUnavailableResponse(path, error)
  }
}
