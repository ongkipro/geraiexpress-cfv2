// Media in R2 (TASK-302, ARCHITECTURE §R2): keys are always `t/<tenant_id>/<purpose>/<uuid>`; the tenant object keeps
// the index. Reads use short-lived HMAC-signed URLs bound to the tenant, the key and an expiry, served by the Worker
// on `app.` — a signature for one gerai never opens another gerai's object.
import { hmacSha256Hex, timingSafeEqualStr } from "../crypto"

export type MediaPurpose = "logo" | "qris" | "evidence" | "return_photo" | "claim" | "signature"
export const MEDIA_PURPOSES: readonly MediaPurpose[] = ["logo", "qris", "evidence", "return_photo", "claim", "signature"]
/** Owner-only purposes (the outlet's own logo and static QRIS, TASK-701). */
export const OWNER_MEDIA: readonly MediaPurpose[] = ["logo", "qris"]
export const MEDIA_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }
export const MEDIA_MAX_BYTES = 5 * 1024 * 1024
/** The outlet QRIS shown on the customer display: an image of at most 2 MB (spec 03 §5.4). */
export const QRIS_MAX_BYTES = 2 * 1024 * 1024
/** Outlet 1:1 square icon/logo (mini-site logo + favicon, workspace, customer display, thermal label): max 2 MB. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024
export const SIGNED_URL_TTL_MS = 10 * 60_000

export const mediaKeyFor = (tenantId: string, purpose: MediaPurpose, id: string, ext: string) => `t/${tenantId}/${purpose}/${id}.${ext}`

const payload = (tenantId: string, mediaId: string, exp: number) => `media:${tenantId}:${mediaId}:${exp}`

export async function signMediaUrl(secret: string, tenantId: string, mediaId: string, now: number): Promise<string> {
  const exp = now + SIGNED_URL_TTL_MS
  const sig = await hmacSha256Hex(secret, payload(tenantId, mediaId, exp))
  return `/api/app/media/${encodeURIComponent(mediaId)}?exp=${exp}&sig=${sig}`
}

export async function verifyMediaSignature(secret: string, tenantId: string, mediaId: string, exp: number, sig: string, now: number): Promise<boolean> {
  if (!Number.isSafeInteger(exp) || exp < now || exp > now + SIGNED_URL_TTL_MS + 60_000) return false
  return timingSafeEqualStr(await hmacSha256Hex(secret, payload(tenantId, mediaId, exp)), sig)
}

/** Magic-byte check so a renamed file cannot pass as an image or PDF. */
export function sniffType(bytes: Uint8Array): string | null {
  const b = bytes
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg"
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png"
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp"
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf"
  return null
}
