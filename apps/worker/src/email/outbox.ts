// Enqueue side of the email outbox (spec 12 §3). The returned statement is executed in the SAME D1 batch as the OTP
// hash / invite / state change that triggered it, so a crash can never leave one without the other.
import { sha256Hex } from "../crypto"
import { encryptString } from "../crypto/aead"
import type { TemplateId, TemplateVars } from "./templates"

export interface EnqueueInput<T extends TemplateId> {
  id?: string
  templateId: T
  toEmail: string
  vars: TemplateVars[T]
  /** = the OTP/link expiry; never sent after this. */
  expiresAt: number
  now: number
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function emailHash(pepper: string, email: string): Promise<string> {
  return sha256Hex(`${pepper}:email:${normalizeEmail(email)}`)
}

export async function enqueueEmailStatement<T extends TemplateId>(
  env: Pick<Env, "DB" | "KEK_SECRET" | "AUTH_SESSION_PEPPER">,
  input: EnqueueInput<T>,
): Promise<{ id: string; statement: D1PreparedStatement }> {
  const id = input.id ?? crypto.randomUUID()
  const to = normalizeEmail(input.toEmail)
  const statement = env.DB.prepare(
    `INSERT INTO email_outbox (id, template_id, to_email_hash, to_email_encrypted, payload_encrypted, expires_at, state, attempts, next_attempt_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'queued', 0, ?7, ?7)`,
  ).bind(
    id,
    input.templateId,
    await emailHash(env.AUTH_SESSION_PEPPER, to),
    await encryptString(env.KEK_SECRET, to, "email"),
    await encryptString(env.KEK_SECRET, JSON.stringify(input.vars), "email"),
    input.expiresAt,
    input.now,
  )
  return { id, statement }
}

/** Expiry sweep: queued rows past `expires_at` become `expired` with payload and address nulled. */
export function expireStatement(db: D1Database, now: number): D1PreparedStatement {
  return db.prepare(
    "UPDATE email_outbox SET state = 'expired', payload_encrypted = NULL, to_email_encrypted = NULL, lease_until = NULL, last_error_code = 'EXPIRED' WHERE state IN ('queued','sending') AND expires_at <= ?",
  ).bind(now)
}
