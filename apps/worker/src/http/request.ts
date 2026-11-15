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
  const host = request.headers.get("host") ?? url.host
  return `${url.protocol}//${host}`
}
