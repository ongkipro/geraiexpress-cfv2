// Unsafe requests on /api/app/* and /api/owner/* must come from the same origin (spec 05 §2.2): `Origin` equal to the
// request origin, and `Sec-Fetch-Site` same-origin when present. A missing Origin is refused.
const SAFE = new Set(["GET", "HEAD", "OPTIONS"])

export function sameOriginOk(request: Request): boolean {
  if (SAFE.has(request.method)) return true
  const origin = request.headers.get("origin")
  if (!origin) return false
  const url = new URL(request.url)
  let o: URL
  try {
    o = new URL(origin)
  } catch {
    return false
  }
  // Same scheme, and the same normalised host + effective port as the request (lowercase, no trailing dot,
  // default ports dropped) — RFC 6454 same-origin, robust to `Host: app.x.com:443` / `app.x.com.`.
  if (o.protocol !== url.protocol) return false
  if (canonical(o.host, o.protocol) !== canonical(request.headers.get("host") ?? url.host, url.protocol)) return false
  const site = request.headers.get("sec-fetch-site")
  return site === null || site === "same-origin"
}

function canonical(hostPort: string, protocol: string): string {
  const m = /^(.*?)(?::(\d{1,5}))?$/.exec(hostPort.trim().toLowerCase())!
  const name = m[1]!.replace(/\.$/, "")
  const port = m[2] && !((protocol === "https:" && m[2] === "443") || (protocol === "http:" && m[2] === "80")) ? `:${m[2]}` : ""
  return `${name}${port}`
}
