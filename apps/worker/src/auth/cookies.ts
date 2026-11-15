// Host-only session cookies (spec 05 §2.2, spec 07 §2): `__Host-ge_app` / `__Host-ge_owner` over HTTPS, `dev_ge_app` /
// `dev_ge_owner` on local HTTP `.localhost`. Never a `Domain` attribute, always `Path=/`, `HttpOnly`, `SameSite=Lax`.
export type HostContextName = "app" | "owner"

export function cookieName(ctx: HostContextName, secure: boolean): string {
  return secure ? `__Host-ge_${ctx}` : `dev_ge_${ctx}`
}

export function isSecureRequest(request: Request, gxEnv: string): boolean {
  return gxEnv !== "local" || new URL(request.url).protocol === "https:"
}

export function setSessionCookie(ctx: HostContextName, secure: boolean, token: string, maxAgeSeconds: number): string {
  const parts = [`${cookieName(ctx, secure)}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`]
  if (secure) parts.push("Secure")
  return parts.join("; ")
}

export function clearSessionCookie(ctx: HostContextName, secure: boolean): string {
  const parts = [`${cookieName(ctx, secure)}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"]
  if (secure) parts.push("Secure")
  return parts.join("; ")
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie")
  if (!header) return null
  for (const part of header.split(";")) {
    const i = part.indexOf("=")
    if (i < 0) continue
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim() || null
  }
  return null
}
