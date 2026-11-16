// TASK-310 Akun Saya (DEC-229, spec 05 §2, spec 12): email change by OTP to the new address (wrong codes lock),
// password change needs the current password and signs other sessions out, session list + revoke.
import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { createSession } from "../../src/auth/session"
import { decryptString } from "../../src/crypto/aead"
import { hostCache } from "../../src/host/lookup"
import { appUser } from "../onboarding/helpers"
import { appGet } from "../webhooks/helpers"
import { post } from "../dispatch/helpers"

beforeEach(() => hostCache.clear())

async function lastCode(): Promise<string> {
  const row = await env.DB.prepare("SELECT payload_encrypted FROM email_outbox WHERE template_id = 'email_change_otp' ORDER BY created_at DESC, rowid DESC LIMIT 1").first<{ payload_encrypted: string }>()
  return (JSON.parse(await decryptString(env.KEK_SECRET, row!.payload_encrypted, "email")) as { code: string }).code
}

async function secondSession(userId: string) {
  const s = await createSession(env, { userId, ctx: "app", activeTenantId: null, deviceHash: null, userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130", now: Date.now() })
  await s.statement.run()
  return `dev_ge_app=${s.token}`
}
const status = async (cookie: string) => (await appGet("/account", cookie)).status

describe("Akun Saya", () => {
  it("email change: code goes to the new address; wrong code refused; right code switches email and signs others out", async () => {
    const u = await appUser("lama.akun@contoh.test")
    const other = await secondSession(u.id)
    expect(((await (await post("/account/email/request", u.cookie, { email: "baru.akun@contoh.test", password: "salah-sekali-1" })).json()) as { error: { code: string } }).error.code).toBe("WRONG_PASSWORD")
    const req = await post("/account/email/request", u.cookie, { email: "baru.akun@contoh.test", password: "pemilik-kuat-1" })
    const { otpId } = ((await req.json()) as { data: { otpId: string } }).data
    const to = await env.DB.prepare("SELECT to_email_encrypted FROM email_outbox WHERE template_id = 'email_change_otp' ORDER BY created_at DESC, rowid DESC LIMIT 1").first<{ to_email_encrypted: string }>()
    if (to) expect(await decryptString(env.KEK_SECRET, to.to_email_encrypted, "email")).toBe("baru.akun@contoh.test")
    const code = await lastCode()
    const wrong = code === "000000" ? "111111" : "000000"
    expect((await post("/account/email/confirm", u.cookie, { otpId, code: wrong })).status).toBe(400)
    const ok = await post("/account/email/confirm", u.cookie, { otpId, code })
    expect(((await ok.json()) as { data: { email: string } }).data.email).toBe("baru.akun@contoh.test")
    expect((await env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(u.id).first<{ email: string }>())?.email).toBe("baru.akun@contoh.test")
    expect(await status(other)).toBe(401)
    expect(await status(u.cookie)).toBe(200)
    // Replay of the same code fails.
    expect((await post("/account/email/confirm", u.cookie, { otpId, code })).status).toBe(400)
  })

  it("email change: five wrong codes lock for 15 minutes; a taken address gets no code", async () => {
    const u = await appUser("kunci.akun@contoh.test")
    await appUser("dipakai.akun@contoh.test")
    const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE template_id = 'email_change_otp'").first<{ n: number }>()
    const taken = await post("/account/email/request", u.cookie, { email: "dipakai.akun@contoh.test", password: "pemilik-kuat-1" })
    expect(taken.status).toBe(200)
    const after = await env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE template_id = 'email_change_otp'").first<{ n: number }>()
    expect(after?.n).toBe(before?.n)
    const { otpId } = ((await (await post("/account/email/request", u.cookie, { email: "bebas.akun@contoh.test", password: "pemilik-kuat-1" })).json()) as { data: { otpId: string } }).data
    const code = await lastCode()
    const wrong = code === "000000" ? "111111" : "000000"
    let last = 0
    for (let i = 0; i < 5; i++) last = (await post("/account/email/confirm", u.cookie, { otpId, code: wrong })).status
    expect(last).toBe(429)
    expect((await post("/account/email/confirm", u.cookie, { otpId, code })).status).toBe(429)
  })

  it("password change needs the current password and signs out every other session", async () => {
    const u = await appUser("sandi.akun@contoh.test")
    const other = await secondSession(u.id)
    expect(((await (await post("/account/password", u.cookie, { current: "keliru-sekali-1", next: "sandi-baru-kuat-9" })).json()) as { error: { code: string } }).error.code).toBe("WRONG_PASSWORD")
    expect((await post("/account/password", u.cookie, { current: "pemilik-kuat-1", next: "pendek" })).status).toBe(422)
    expect((await post("/account/password", u.cookie, { current: "pemilik-kuat-1", next: "sandi-baru-kuat-9" })).status).toBe(200)
    expect(await status(other)).toBe(401)
    expect(await status(u.cookie)).toBe(200)
  })

  it("sessions: list marks the current one, never exposes the stored hash; revoke one and revoke all others", async () => {
    const u = await appUser("sesi.akun@contoh.test")
    const a = await secondSession(u.id)
    const b = await secondSession(u.id)
    const list = ((await (await appGet("/account", u.cookie)).json()) as { data: { sessions: Array<{ id: string; current: boolean; device: string }> } }).data.sessions
    expect(list).toHaveLength(3)
    expect(list.filter((s) => s.current)).toHaveLength(1)
    const hashes = (await env.DB.prepare("SELECT token_hash FROM sessions WHERE user_id = ?").bind(u.id).all<{ token_hash: string }>()).results.map((r) => r.token_hash)
    expect(list.some((s) => hashes.includes(s.id))).toBe(false)
    const target = list.find((s) => !s.current)!
    expect((await post("/account/sessions/revoke", u.cookie, { id: target.id })).status).toBe(200)
    expect([await status(a), await status(b)].filter((x) => x === 401)).toHaveLength(1)
    expect((await post("/account/sessions/revoke", u.cookie, { all: true })).status).toBe(200)
    expect([await status(a), await status(b)]).toEqual([401, 401])
    expect(await status(u.cookie)).toBe(200)
    const cur = list.find((s) => s.current)!
    expect((await post("/account/sessions/revoke", u.cookie, { id: cur.id })).status).toBe(404)
  })
})
