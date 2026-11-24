// Serves one SPA from the shared ASSETS binding, strictly by verified host (spec 07 §3.1): the app host only ever
// reads `/app/*`, the owner host only `/owner/*`. Source maps are refused even if one slipped into the build (DEC-210).
export type SpaName = "app" | "owner"

const BASE_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
}

// `app` allows geolocation=(self) for the outlet map pin picker ("Lokasi Saya"); `owner` stays strictly disabled.
const PERMISSIONS_POLICY: Record<SpaName, string> = {
  app: "camera=(self), bluetooth=(self), geolocation=(self), microphone=()",
  owner: "camera=(self), bluetooth=(self), geolocation=(), microphone=()",
}

// `app` needs `frame-src blob:` and `object-src blob:` for the PrintDrawer PDF print iframe, and OpenStreetMap raster
// tiles for the interactive outlet LocationPinPicker; `owner` stays stricter.
const CSP: Record<SpaName, string> = {
  app: "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tile.openstreetmap.org; connect-src 'self'; frame-src blob: https://challenges.cloudflare.com; object-src blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  owner: "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
}

// Static files the SPA build emits; everything else is a client-side route and gets the shell.
const STATIC_FILE = /^\/(?:assets\/[A-Za-z0-9._-]+|[A-Za-z0-9._-]+\.(?:ico|png|svg|webp|txt|webmanifest|json))$/

function withHeaders(res: Response, cache: string, spa: SpaName): Response {
  const out = new Response(res.body, res)
  for (const [k, v] of Object.entries(BASE_HEADERS)) out.headers.set(k, v)
  out.headers.set("permissions-policy", PERMISSIONS_POLICY[spa])
  out.headers.set("content-security-policy", CSP[spa])
  out.headers.set("cache-control", cache)
  return out
}

const notFound = () => new Response("Tidak ditemukan", { status: 404, headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" } })

export async function serveSpa(request: Request, assets: Fetcher, spa: SpaName): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Metode tidak diizinkan", { status: 405, headers: { allow: "GET, HEAD" } })
  }
  const url = new URL(request.url)
  let path: string
  try {
    path = decodeURIComponent(url.pathname)
  } catch {
    return notFound()
  }
  const lower = path.toLowerCase()
  if (lower.endsWith(".map") || path.includes("..") || path.includes("\\") || path.includes("\0")) return notFound()

  if (path !== "/index.html" && STATIC_FILE.test(path)) {
    const res = await assets.fetch(new Request(new URL(`/${spa}${path}`, url.origin), { method: request.method }))
    if (res.status !== 200) return notFound()
    return withHeaders(res, path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=300", spa)
  }
  if (path.startsWith("/assets/")) return notFound()

  // Client-side route (incl. `/` and `/index.html`): always the shell, never cached long.
  const shell = await assets.fetch(new Request(new URL(`/${spa}/index.html`, url.origin), { method: request.method }))
  if (shell.status !== 200) return new Response("Aplikasi belum dibangun", { status: 503, headers: { "cache-control": "no-store" } })
  return withHeaders(shell, "no-cache", spa)
}
