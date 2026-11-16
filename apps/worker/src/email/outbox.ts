// Enqueue side of the email outbox (spec 12 §3). The returned statement is executed in the SAME D1 batch as the OTP
// hash / invite / state change that triggered it, so a crash can never leave one without the other.
import { sha256Hex } from "../crypto"
import { encryptString } from "../crypto/aead"
import type { TemplateId, TemplateVars } from "./templates"

export interface EnqueueInput<T extends TemplateId> {
  id?: string
  /**
   * Optional SQL condition (with its bindings) evaluated inside the same batch: the row is inserted only when it holds.
   * Used to enqueue exactly one email per state transition (e.g. only if this call decided the application).
   * The base insert binds ?1..?7, so guard placeholders start at ?8.
   */
  onlyIf?: { sql: string; params: unknown[] }
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
  const guard = input.onlyIf ? ` WHERE ${input.onlyIf.sql}` : ""
  const statement = env.DB.prepare(
    `INSERT INTO email_outbox (id, template_id, to_email_hash, to_email_encrypted, payload_encrypted, expires_at, state, attempts, next_attempt_at, created_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, 'queued', 0, ?7, ?7${guard} ON CONFLICT(id) DO NOTHING`,
  ).bind(
    id,
    input.templateId,
    await emailHash(env.AUTH_SESSION_PEPPER, to),
    await encryptString(env.KEK_SECRET, to, "email"),
    await encryptString(env.KEK_SECRET, JSON.stringify(input.vars), "email"),
    input.expiresAt,
    input.now,
    ...(input.onlyIf?.params ?? []),
  )
  return { id, statement }
}

/** Expiry sweep: queued rows past `expires_at` become `expired` with payload and address nulled. */
export function expireStatement(db: D1Database, now: number): D1PreparedStatement {
  return db.prepare(
    "UPDATE email_outbox SET state = 'expired', payload_encrypted = NULL, to_email_encrypted = NULL, lease_until = NULL, last_error_code = 'EXPIRED' WHERE state IN ('queued','sending') AND expires_at <= ?",
  ).bind(now)
}
