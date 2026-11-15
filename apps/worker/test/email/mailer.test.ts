import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { decryptString } from "../../src/crypto/aead"
import { dispatchDue, LEASE_MS, MAX_ATTEMPTS, RETRY_DELAYS_MS, type MailEnv } from "../../src/email/mailer"
import { enqueueEmailStatement } from "../../src/email/outbox"
import { renderTemplate, type TemplateId } from "../../src/email/templates"

type Sent = { from: unknown; to: unknown; subject: string; text?: string; html?: string; replyTo?: unknown }

// Fake send_email binding: records messages, or throws `{ code }` errors from a script.
function fakeEmail(script: (string | null)[] = []) {
  const sent: Sent[] = []
  let call = 0
  const binding = {
    async send(m: Sent) {
      const code = script[call++] ?? null
      if (code) throw Object.assign(new Error(code), { code })
      sent.push(m)
      return { messageId: `msg-${sent.length}` }
    },
  } as unknown as SendEmail
  return { sent, binding }
}

const T0 = 1_900_000_000_000
const mailEnv = (binding: SendEmail): MailEnv => ({ DB: env.DB, EMAIL: binding, KEK_SECRET: env.KEK_SECRET, MAIL_FROM: env.MAIL_FROM, GX_ENV: "local" })

async function enqueue(id: string, opts: { to?: string; expiresIn?: number; templateId?: TemplateId; now?: number } = {}) {
  const { statement } = await enqueueEmailStatement(env, {
    id,
    templateId: opts.templateId ?? "signup_otp",
    toEmail: opts.to ?? "Ani@Contoh.test",
    vars: { code: "482915" },
    expiresAt: (opts.now ?? T0) + (opts.expiresIn ?? 10 * 60_000),
    now: opts.now ?? T0,
  })
  await statement.run()
}

const row = (id: string) => env.DB.prepare("SELECT state, attempts, next_attempt_at, payload_encrypted, to_email_encrypted, last_error_code, provider_message_id FROM email_outbox WHERE id = ?").bind(id).first<Record<string, unknown>>()

describe("email outbox + sendMail (TASK-104, spec 12 §3)", () => {
  beforeEach(async () => {
    await env.DB.batch([env.DB.prepare("DELETE FROM email_outbox"), env.DB.prepare("DELETE FROM email_suppressions")])
  })

  it("stores address and payload encrypted; sends text + html in Indonesian; nulls the payload on sent", async () => {
    await enqueue("e1")
    const raw = await row("e1")
    expect(String(raw?.payload_encrypted)).not.toContain("482915")
    expect(await decryptString(env.KEK_SECRET, String(raw?.payload_encrypted), "email")).toContain("482915")
    const { sent, binding } = fakeEmail()
    expect(await dispatchDue(mailEnv(binding), T0)).toMatchObject({ sent: 1 })
    expect(sent[0]).toMatchObject({ to: "ani@contoh.test", subject: "Kode verifikasi GeraiExpress: 482915", from: { email: "noreply@mail.geraiexpress.com", name: "GeraiExpress" }, replyTo: "bantuan@geraiexpress.com" })
    expect(sent[0]?.text).toContain("482915")
    expect(sent[0]?.html).toContain("482915")
    expect(await row("e1")).toMatchObject({ state: "sent", attempts: 1, payload_encrypted: null, to_email_encrypted: null, provider_message_id: "msg-1" })
  })

  it("retries transient errors at 30 s / 2 min / 5 min and stops after 4 attempts", async () => {
    await enqueue("e2", { expiresIn: 60 * 60_000 })
    const { binding } = fakeEmail(["E_INTERNAL_SERVER_ERROR", "E_RATE_LIMIT_EXCEEDED", "E_INTERNAL_SERVER_ERROR", "E_INTERNAL_SERVER_ERROR"])
    const e = mailEnv(binding)
    let t = T0
    await dispatchDue(e, t)
    expect(await row("e2")).toMatchObject({ state: "queued", attempts: 1, next_attempt_at: t + RETRY_DELAYS_MS[0] })
    // Not due yet → nothing happens.
    expect(await dispatchDue(e, t + RETRY_DELAYS_MS[0] - 1)).toMatchObject({ sent: 0, retry: 0 })
    t += RETRY_DELAYS_MS[0]
    await dispatchDue(e, t)
    expect(await row("e2")).toMatchObject({ attempts: 2, next_attempt_at: t + RETRY_DELAYS_MS[1] })
    t += RETRY_DELAYS_MS[1]
    await dispatchDue(e, t)
    expect(await row("e2")).toMatchObject({ attempts: 3, next_attempt_at: t + RETRY_DELAYS_MS[2] })
    t += RETRY_DELAYS_MS[2]
    await dispatchDue(e, t)
    expect(await row("e2")).toMatchObject({ state: "failed", attempts: MAX_ATTEMPTS, payload_encrypted: null, last_error_code: "E_INTERNAL_SERVER_ERROR" })
  })

  it("never sends after expires_at (expired OTP is not sent) and a retry that would land after expiry expires instead", async () => {
    await enqueue("e3", { expiresIn: 10 * 60_000 })
    const { sent, binding } = fakeEmail()
    expect(await dispatchDue(mailEnv(binding), T0 + 10 * 60_000)).toMatchObject({ expired: 1, sent: 0 })
    expect(sent).toHaveLength(0)
    expect(await row("e3")).toMatchObject({ state: "expired", payload_encrypted: null })

    await enqueue("e4", { expiresIn: 20_000 })
    const failing = fakeEmail(["E_INTERNAL_SERVER_ERROR"])
    expect(await dispatchDue(mailEnv(failing.binding), T0)).toMatchObject({ expired: 1 })
    expect(await row("e4")).toMatchObject({ state: "expired", payload_encrypted: null })
  })

  it("crash between claim and send: the lease expires and the row is sent once", async () => {
    await enqueue("e5")
    // Simulate a dispatcher that claimed the row and died before sending.
    await env.DB.prepare("UPDATE email_outbox SET state = 'sending', lease_until = ? WHERE id = 'e5'").bind(T0 + LEASE_MS).run()
    const { sent, binding } = fakeEmail()
    expect(await dispatchDue(mailEnv(binding), T0 + 1_000)).toMatchObject({ sent: 0 }) // lease still held
    expect(await dispatchDue(mailEnv(binding), T0 + LEASE_MS)).toMatchObject({ sent: 1 })
    expect(await dispatchDue(mailEnv(binding), T0 + LEASE_MS + 1)).toMatchObject({ sent: 0 })
    expect(sent).toHaveLength(1)
  })

  it("suppressed / hard-bounced recipients are terminal and later mail to them is not attempted", async () => {
    await enqueue("e6", { to: "pantul@contoh.test" })
    const { binding } = fakeEmail(["E_RECIPIENT_SUPPRESSED"])
    expect(await dispatchDue(mailEnv(binding), T0)).toMatchObject({ suppressed: 1 })
    expect(await row("e6")).toMatchObject({ state: "suppressed", payload_encrypted: null })
    await enqueue("e7", { to: "PANTUL@contoh.test" })
    const second = fakeEmail()
    expect(await dispatchDue(mailEnv(second.binding), T0 + 1)).toMatchObject({ suppressed: 1 })
    expect(second.sent).toHaveLength(0)
  })

  it("permanent request errors fail without retry", async () => {
    await enqueue("e8")
    const { binding } = fakeEmail(["E_SENDER_NOT_VERIFIED"])
    expect(await dispatchDue(mailEnv(binding), T0)).toMatchObject({ failed: 1 })
    expect(await row("e8")).toMatchObject({ state: "failed", attempts: 1 })
  })
})

describe("six Indonesian templates (snapshot)", () => {
  const legal = { legalName: null, supportEmail: null }
  const cases = [
    ["signup_otp", { code: "482915" }],
    ["password_reset", { link: "https://app.geraiexpress.com/atur-sandi/tok" }],
    ["kasir_invite", { link: "https://app.geraiexpress.com/undangan/tok", outletName: "Berkah Jaya", inviterName: "Bu Ani" }],
    ["email_change_otp", { code: "112233" }],
    ["application_status", { outletName: "Berkah Jaya", decision: "approved", link: "https://app.geraiexpress.com/masuk" }],
    ["security_alert", { when: "16 Nov 2026 09.15 WIB", device: "Chrome di Windows", link: "https://app.geraiexpress.com/akun" }],
  ] as const
  it.each(cases)("%s", (id, vars) => {
    const r = renderTemplate(id, vars as never, legal)
    expect(r.text.length).toBeGreaterThan(20)
    expect(r.html).toContain('lang="id"')
    expect(r).toMatchSnapshot()
  })
  it("rejected application shows the reason; legal footer renders only filled fields", () => {
    const r = renderTemplate("application_status", { outletName: "X", decision: "rejected", reason: "Foto titik jemput belum jelas", link: "https://app.geraiexpress.com/daftar" }, { legalName: "PT Contoh Sejahtera", supportEmail: null })
    expect(r.subject).toBe("Pengajuan X belum dapat disetujui")
    expect(r.text).toContain("Alasan: Foto titik jemput belum jelas")
    expect(r.text).toContain("PT Contoh Sejahtera")
    expect(r.text).not.toContain("Bantuan:")
  })
  it("refuses links outside geraiexpress hosts and escapes HTML", () => {
    expect(() => renderTemplate("password_reset", { link: "https://evil.example/x" }, legal)).toThrow()
    expect(renderTemplate("kasir_invite", { link: "https://app.geraiexpress.com/undangan/t", outletName: "<b>X</b>", inviterName: "A" }, legal).html).toContain("&lt;b&gt;X&lt;/b&gt;")
  })
})
