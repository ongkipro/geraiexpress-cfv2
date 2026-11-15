// Mengantar webhook signature (Public API docs): hex HMAC-SHA256 of `{x-timestamp}.{raw body}` with the seller's
// Webhook Secret; `x-timestamp` is epoch milliseconds (seconds are accepted too); ±5 minutes.
import { hmacSha256Hex, sha256Hex, timingSafeEqualStr } from "../crypto"

export const WEBHOOK_WINDOW_MS = 5 * 60_000

/** Returns the event instant in UTC ms, or null when the header is not a plausible epoch. */
export function parseProviderTimestamp(raw: string | null): number | null {
  if (!raw || !/^\d{9,13}$/.test(raw)) return null
  const n = Number(raw)
  return raw.length >= 12 ? n : n * 1000
}

export type VerifyFailure = "MISSING_HEADERS" | "STALE_TIMESTAMP" | "BAD_SIGNATURE" | "WRONG_ENVIRONMENT" | "NOT_CONFIGURED"

export async function verifySignature(
  secret: string,
  input: { timestamp: string | null; signature: string | null; rawBody: string; environmentHeader: string | null; expect: "sandbox" | "production" },
  now: number,
): Promise<{ ok: true; eventAt: number } | { ok: false; reason: VerifyFailure }> {
  if (!input.timestamp || !input.signature) return { ok: false, reason: "MISSING_HEADERS" }
  const eventAt = parseProviderTimestamp(input.timestamp)
  if (eventAt === null || Math.abs(now - eventAt) > WEBHOOK_WINDOW_MS) return { ok: false, reason: "STALE_TIMESTAMP" }
  // Sandbox deliveries carry `x-environment: sandbox` (unsigned); never accept them on a production connection.
  if (input.expect === "production" && (input.environmentHeader ?? "").toLowerCase() === "sandbox") return { ok: false, reason: "WRONG_ENVIRONMENT" }
  const expected = await hmacSha256Hex(secret, `${input.timestamp}.${input.rawBody}`)
  if (!(await timingSafeEqualStr(expected, input.signature.trim().toLowerCase()))) return { ok: false, reason: "BAD_SIGNATURE" }
  return { ok: true, eventAt }
}

export const eventKeyOf = (timestamp: string, rawBody: string) => sha256Hex(`${timestamp}.${rawBody}`)

/** Opaque 32-byte path token, base64url (43 chars). */
export function newPathToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
export const PATH_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
