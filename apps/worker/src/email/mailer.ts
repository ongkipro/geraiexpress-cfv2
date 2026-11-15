// The only caller of `env.EMAIL.send` (spec 12 §3, DEC-227). Claims due outbox rows with a lease (so a crash between
// claim and send is retried after the lease, and two dispatchers never send the same row), renders the Indonesian
// template, sends, and records the outcome. Never logs an OTP, a link or an address (only `to_email_hash`).
import { emit } from "@gx/telemetry"
import { decryptString } from "../crypto/aead"
import { expireStatement } from "./outbox"
import { renderTemplate, type LegalFooter, type TemplateId, type TemplateVars } from "./templates"

export const RETRY_DELAYS_MS = [30_000, 120_000, 300_000] as const
export const MAX_ATTEMPTS = 4
export const LEASE_MS = 60_000
export const MAIL_FROM_NAME = "GeraiExpress"
export const REPLY_TO = "bantuan@geraiexpress.com"

// Permanent for this message: suppression/hard bounce (terminal + suppression list) and request errors (terminal).
const SUPPRESS_CODES = new Set(["E_RECIPIENT_SUPPRESSED", "E_DELIVERY_FAILED"])
const TERMINAL_CODES = new Set([
  "E_VALIDATION_ERROR", "E_FIELD_MISSING", "E_RECIPIENT_NOT_ALLOWED", "E_CONTENT_TOO_LARGE", "E_HEADER_NOT_ALLOWED",
  "E_HEADER_USE_API_FIELD", "E_HEADER_VALUE_INVALID", "E_HEADER_VALUE_TOO_LONG", "E_HEADER_NAME_INVALID",
  "E_HEADERS_TOO_LARGE", "E_HEADERS_TOO_MANY", "E_TOO_MANY_RECIPIENTS", "E_TOO_MANY_ATTACHMENTS",
  "E_SENDER_NOT_VERIFIED", "E_SENDER_DOMAIN_NOT_AVAILABLE",
])

export const USER_MESSAGE_SUPPRESSED = "Email tidak dapat menerima pesan. Periksa alamat email."

export type MailEnv = Pick<Env, "DB" | "EMAIL" | "KEK_SECRET" | "MAIL_FROM" | "GX_ENV">

interface Row {
  id: string
  template_id: TemplateId
  to_email_hash: string
  to_email_encrypted: string | null
  payload_encrypted: string | null
  expires_at: number
  attempts: number
}

export type DispatchOutcome = "sent" | "retry" | "failed" | "expired" | "suppressed" | "skipped"

async function legalFooter(db: D1Database): Promise<LegalFooter> {
  try {
    const r = await db.prepare("SELECT legal_name, support_email FROM platform_legal_profile WHERE id = 1").first<{ legal_name: string | null; support_email: string | null }>()
    return { legalName: r?.legal_name ?? null, supportEmail: r?.support_email ?? null }
  } catch {
    return { legalName: null, supportEmail: null }
  }
}

/** Terminal states null the encrypted payload and address in the same statement. */
function finish(db: D1Database, id: string, state: "sent" | "failed" | "expired" | "suppressed", now: number, code: string | null, messageId: string | null) {
  return db
    .prepare(
      `UPDATE email_outbox SET state = ?2, payload_encrypted = NULL, to_email_encrypted = NULL, lease_until = NULL,
         sent_at = CASE WHEN ?2 = 'sent' THEN ?3 ELSE sent_at END, provider_message_id = ?5, last_error_code = ?4
       WHERE id = ?1`,
    )
    .bind(id, state, now, code, messageId)
}

/** Sends one claimed row. Exported for tests (fake clock + fake binding). */
export async function sendOne(env: MailEnv, row: Row, now: number): Promise<DispatchOutcome> {
  if (now >= row.expires_at || !row.payload_encrypted || !row.to_email_encrypted) {
    await finish(env.DB, row.id, "expired", now, "EXPIRED", null).run()
    emit("email.outbox", { template: row.template_id, outcome: "expired" }, { id: row.id }, { env: env.GX_ENV, now })
    return "expired"
  }
  const suppressed = await env.DB.prepare("SELECT 1 FROM email_suppressions WHERE to_email_hash = ?").bind(row.to_email_hash).first()
  if (suppressed) {
    await finish(env.DB, row.id, "suppressed", now, "E_RECIPIENT_SUPPRESSED", null).run()
    emit("email.outbox", { template: row.template_id, outcome: "suppressed" }, { id: row.id }, { env: env.GX_ENV, now })
    return "suppressed"
  }
  const to = await decryptString(env.KEK_SECRET, row.to_email_encrypted, "email")
  const vars = JSON.parse(await decryptString(env.KEK_SECRET, row.payload_encrypted, "email")) as TemplateVars[TemplateId]
  const msg = renderTemplate(row.template_id, vars, await legalFooter(env.DB))
  const attempts = row.attempts + 1
  try {
    const res = await env.EMAIL.send({
      from: { email: env.MAIL_FROM, name: MAIL_FROM_NAME },
      to,
      replyTo: REPLY_TO,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    })
    await env.DB.batch([
      env.DB.prepare("UPDATE email_outbox SET attempts = ? WHERE id = ?").bind(attempts, row.id),
      finish(env.DB, row.id, "sent", now, null, res.messageId ?? null),
    ])
    emit("email.outbox", { template: row.template_id, outcome: "sent" }, { id: row.id, attempts }, { env: env.GX_ENV, now })
    return "sent"
  } catch (err) {
    const code = typeof (err as { code?: unknown })?.code === "string" ? (err as { code: string }).code : "E_UNKNOWN"
    if (SUPPRESS_CODES.has(code)) {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO email_suppressions (to_email_hash, reason, created_at) VALUES (?, ?, ?) ON CONFLICT(to_email_hash) DO NOTHING").bind(row.to_email_hash, code, now),
        env.DB.prepare("UPDATE email_outbox SET attempts = ? WHERE id = ?").bind(attempts, row.id),
        finish(env.DB, row.id, "suppressed", now, code, null),
      ])
      emit("email.outbox", { template: row.template_id, outcome: "suppressed" }, { id: row.id, code }, { env: env.GX_ENV, now, severity: "warn" })
      return "suppressed"
    }
    const delay = RETRY_DELAYS_MS[attempts - 1]
    if (TERMINAL_CODES.has(code) || attempts >= MAX_ATTEMPTS || delay === undefined || now + delay >= row.expires_at) {
      const state = !TERMINAL_CODES.has(code) && delay !== undefined && now + delay >= row.expires_at ? "expired" : "failed"
      await env.DB.batch([env.DB.prepare("UPDATE email_outbox SET attempts = ? WHERE id = ?").bind(attempts, row.id), finish(env.DB, row.id, state, now, code, null)])
      emit("email.outbox", { template: row.template_id, outcome: state }, { id: row.id, code, attempts }, { env: env.GX_ENV, now, severity: "error" })
      return state === "expired" ? "expired" : "failed"
    }
    await env.DB.prepare("UPDATE email_outbox SET state = 'queued', attempts = ?, next_attempt_at = ?, lease_until = NULL, last_error_code = ? WHERE id = ?")
      .bind(attempts, now + delay, code, row.id)
      .run()
    emit("email.outbox", { template: row.template_id, outcome: "retry" }, { id: row.id, code, attempts }, { env: env.GX_ENV, now, severity: "warn" })
    return "retry"
  }
}

/** Claims due rows (queued and due, or `sending` with an expired lease = crash recovery) and sends them. */
export async function dispatchDue(env: MailEnv, now = Date.now(), limit = 20): Promise<Record<DispatchOutcome, number>> {
  const out: Record<DispatchOutcome, number> = { sent: 0, retry: 0, failed: 0, expired: 0, suppressed: 0, skipped: 0 }
  const expired = await expireStatement(env.DB, now).run()
  out.expired += expired.meta.changes ?? 0
  const claimed = await env.DB.prepare(
    `UPDATE email_outbox SET state = 'sending', lease_until = ?1
     WHERE id IN (
       SELECT id FROM email_outbox
       WHERE (state = 'queued' AND next_attempt_at <= ?2) OR (state = 'sending' AND lease_until <= ?2)
       ORDER BY next_attempt_at LIMIT ?3)
     RETURNING id, template_id, to_email_hash, to_email_encrypted, payload_encrypted, expires_at, attempts`,
  )
    .bind(now + LEASE_MS, now, limit)
    .all<Row>()
  for (const row of claimed.results) out[await sendOne(env, row, now)]++
  return out
}
