// Unsafe requests on /api/app/* and /api/owner/* must come from the same origin (spec 05 §2.2): `Origin` equal to the
// request origin, and `Sec-Fetch-Site` same-origin when present. A missing Origin is refused.
const SAFE = new Set(["GET", "HEAD", "OPTIONS"])

export function sameOriginOk(request: Request): boolean {
  if (SAFE.has(request.method)) return true
  const origin = request.headers.get("origin")
  if (!origin) return false
  const url = new URL(request.url)
  const host = request.headers.get("host") ?? url.host
  let o: URL
  try {
    o = new URL(origin)
  } catch {
    return false
  }
  if (o.host.toLowerCase() !== host.toLowerCase()) return false
  const site = request.headers.get("sec-fetch-site")
  return site === null || site === "same-origin"
}
