// RFC 6238 TOTP (SHA-1, 6 digits, 30 s), the format every authenticator app supports. Window ±1 step; a step once
// accepted cannot be reused (replay guard via super_admins.totp_last_step).
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
export const STEP_SECONDS = 30
export const DIGITS = 6

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ""
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "")
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const c of clean) {
    const i = B32.indexOf(c)
    if (i < 0) throw new Error("invalid base32")
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

export function newTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)))
}

export async function hotp(secretB32: string, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", base32Decode(secretB32), { name: "HMAC", hash: "SHA-1" }, false, ["sign"])
  const msg = new ArrayBuffer(8)
  const view = new DataView(msg)
  view.setUint32(0, Math.floor(counter / 2 ** 32))
  view.setUint32(4, counter >>> 0)
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg))
  const off = mac[mac.length - 1]! & 0x0f
  const bin = ((mac[off]! & 0x7f) << 24) | (mac[off + 1]! << 16) | (mac[off + 2]! << 8) | mac[off + 3]!
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0")
}

export const stepAt = (nowMs: number) => Math.floor(nowMs / 1000 / STEP_SECONDS)

/** Returns the matching step within ±1, or null. Constant work regardless of which step matches. */
export async function verifyTotp(secretB32: string, code: string, nowMs: number, lastAcceptedStep: number | null): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null
  const now = stepAt(nowMs)
  let matched: number | null = null
  for (const step of [now - 1, now, now + 1]) {
    const candidate = await hotp(secretB32, step)
    if (candidate === code && matched === null && (lastAcceptedStep === null || step > lastAcceptedStep)) matched = step
  }
  return matched
}

export function otpauthUri(secretB32: string, accountEmail: string): string {
  const label = encodeURIComponent(`GeraiExpress Super Admin:${accountEmail}`)
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent("GeraiExpress")}&algorithm=SHA1&digits=6&period=30`
}
