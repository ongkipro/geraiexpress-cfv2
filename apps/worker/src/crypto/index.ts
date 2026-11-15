// Web Crypto helpers (no dependencies). Secrets never leave this module in plain form.
const te = new TextEncoder()

export function toHex(buf: ArrayBuffer | Uint8Array): string {
  return [...(buf instanceof Uint8Array ? buf : new Uint8Array(buf))].map((b) => b.toString(16).padStart(2, "0")).join("")
}

export async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", te.encode(s)))
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return toHex(await crypto.subtle.sign("HMAC", key, te.encode(message)))
}

/**
 * Constant-time comparison of two secrets (workers-best-practices: never `===`). Both sides are hashed to 32 bytes
 * first, so neither the secret's length nor the caller's input size changes the comparison work.
 */
export async function timingSafeEqualStr(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([crypto.subtle.digest("SHA-256", te.encode(a)), crypto.subtle.digest("SHA-256", te.encode(b))])
  return crypto.subtle.timingSafeEqual(da, db)
}
