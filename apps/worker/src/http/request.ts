import { sha256Hex } from "../crypto"

export function clientIp(request: Request): string | null {
  return request.headers.get("cf-connecting-ip")
}

export async function ipHash(pepper: string, request: Request): Promise<string> {
  return sha256Hex(`${pepper}:ip:${clientIp(request) ?? "unknown"}`)
}

/** Origin of the current host (used for links in emails, e.g. https://app.geraiexpress.com). */
export function hostOrigin(request: Request): string {
  const url = new URL(request.url)
  // Same normalisation as the host classifier (lowercase, no trailing dot); keep a non-default port (local dev).
  const raw = (request.headers.get("host") ?? url.host).trim().toLowerCase()
  const m = /^(.*?)(?::(\d{1,5}))?$/.exec(raw)!
  const name = m[1]!.replace(/\.$/, "")
  const port = m[2] && !((url.protocol === "https:" && m[2] === "443") || (url.protocol === "http:" && m[2] === "80")) ? `:${m[2]}` : ""
  return `${url.protocol}//${name}${port}`
}
