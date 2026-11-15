// Opaque random tokens (sessions, reset links, invitations, sign-up tickets) and their peppered hashes.
import { sha256Hex } from "../crypto"

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

export function newToken(bytes = 32): string {
  return b64u(crypto.getRandomValues(new Uint8Array(bytes)))
}

export function tokenHash(pepper: string, purpose: string, token: string): Promise<string> {
  return sha256Hex(`${pepper}:${purpose}:${token}`)
}

/** 6-digit numeric OTP from a CSPRNG without modulo bias. */
export function newOtp(): string {
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    const v = buf[0]!
    if (v < 4_294_000_000) return String(v % 1_000_000).padStart(6, "0")
  }
}

export const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/
