// DEC-246 backup second factor for Super Admin (spec 05 §2): single-use recovery codes and the sealed ticket that
// carries a new authenticator secret until a code from it verifies. Codes are shown once and stored only as peppered
// hashes; secrets travel only inside the AES-GCM ticket. Nothing here logs a code, secret or ticket.
import { sha256Hex } from "../../crypto"
import { decryptString, encryptString } from "../../crypto/aead"
import { AppError } from "../../http/envelope"
import { tokenHash } from "../tokens"

/** 32 symbols without 0/O/1/I: `byte & 31` is unbiased, 8 symbols = 40 bits. */
export const RECOVERY_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
export const RECOVERY_CODE_COUNT = 8
export const ROTATE_TTL_MS = 10 * 60_000
const CANONICAL_RE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/

type RecoveryEnv = Pick<Env, "DB" | "AUTH_SESSION_PEPPER" | "KEK_SECRET">

export function newRecoveryCode(): string {
  const raw = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => RECOVERY_ALPHABET[b & 31]).join("")
  return `${raw.slice(0, 4)}-${raw.slice(4)}`
}

/** Spaces and hyphens dropped, upper-cased; null when it cannot be a code. */
export function canonicalRecoveryCode(input: unknown): string | null {
  if (typeof input !== "string") return null
  const c = input.replace(/[\s-]/g, "").toUpperCase()
  return CANONICAL_RE.test(c) ? c : null
}

export const recoveryCodeHash = (env: RecoveryEnv, canonical: string) => tokenHash(env.AUTH_SESSION_PEPPER, "totp_recovery", canonical)

/** A fresh set: statements delete the previous set and insert 8 hashes (run them in one batch with the audit row). */
export async function issueRecoveryCodes(env: RecoveryEnv, userId: string, now: number): Promise<{ codes: string[]; statements: D1PreparedStatement[] }> {
  const codes = new Set<string>()
  while (codes.size < RECOVERY_CODE_COUNT) codes.add(newRecoveryCode())
  const statements = [env.DB.prepare("DELETE FROM super_admin_recovery_codes WHERE user_id = ?").bind(userId)]
  for (const code of codes) {
    statements.push(
      env.DB.prepare("INSERT INTO super_admin_recovery_codes (id, user_id, code_hash, used_at, created_at) VALUES (?, ?, ?, NULL, ?)").bind(
        crypto.randomUUID(),
        userId,
        await recoveryCodeHash(env, canonicalRecoveryCode(code)!),
        now,
      ),
    )
  }
  return { codes: [...codes], statements }
}

export async function recoveryStatus(env: RecoveryEnv, userId: string): Promise<{ remaining: number; generatedAt: number | null }> {
  const r = await env.DB.prepare("SELECT COALESCE(SUM(used_at IS NULL), 0) AS remaining, MAX(created_at) AS generated_at FROM super_admin_recovery_codes WHERE user_id = ?")
    .bind(userId)
    .first<{ remaining: number; generated_at: number | null }>()
  return { remaining: r?.remaining ?? 0, generatedAt: r?.generated_at ?? null }
}

/** Consumes one unused matching code atomically; false when none matches (wrong, used or from a replaced set). */
export async function consumeRecoveryCode(env: RecoveryEnv, userId: string, canonical: string, now: number): Promise<boolean> {
  const row = await env.DB.prepare(
    `UPDATE super_admin_recovery_codes SET used_at = ?1
     WHERE id = (SELECT id FROM super_admin_recovery_codes WHERE user_id = ?2 AND code_hash = ?3 AND used_at IS NULL LIMIT 1) AND used_at IS NULL
     RETURNING id`,
  )
    .bind(now, userId, await recoveryCodeHash(env, canonical))
    .first()
  return row !== null
}

const ticketInvalid = () => new AppError(400, "ROTATE_TICKET_INVALID", "Sesi penggantian autentikator sudah berakhir. Mulai lagi dari awal.")

/** The authenticator generation a ticket is bound to: the hash of the active secret's ciphertext (a fresh random IV per
 *  enrolment or rotation, so every swap — even back to an earlier secret — is a new generation). Sol R1 #1. */
export const authenticatorGeneration = (activeCiphertext: string) => sha256Hex(`totp-generation:${activeCiphertext}`)

/** Seals a pending authenticator secret for this user for 10 minutes, bound to the generation it replaces; the active
 *  secret is not touched. */
export async function sealRotation(env: RecoveryEnv, userId: string, secret: string, activeCiphertext: string, now: number): Promise<{ rotateTicket: string; expiresAt: number }> {
  const expiresAt = now + ROTATE_TTL_MS
  const gen = await authenticatorGeneration(activeCiphertext)
  return { rotateTicket: await encryptString(env.KEK_SECRET, JSON.stringify({ userId, secret, gen, exp: expiresAt }), "totp_rotate"), expiresAt }
}

/** The secret and bound generation inside a ticket issued to this user and not yet expired; else ROTATE_TICKET_INVALID. */
export async function openRotation(env: RecoveryEnv, ticket: unknown, userId: string, now: number): Promise<{ secret: string; gen: string }> {
  if (typeof ticket !== "string" || ticket.length > 1000) throw ticketInvalid()
  let parsed: { userId?: unknown; secret?: unknown; gen?: unknown; exp?: unknown }
  try {
    parsed = JSON.parse(await decryptString(env.KEK_SECRET, ticket, "totp_rotate")) as typeof parsed
  } catch {
    throw ticketInvalid()
  }
  if (parsed.userId !== userId || typeof parsed.secret !== "string" || typeof parsed.gen !== "string" || typeof parsed.exp !== "number" || now > parsed.exp) throw ticketInvalid()
  return { secret: parsed.secret, gen: parsed.gen }
}

export { ticketInvalid as rotateTicketInvalid }
