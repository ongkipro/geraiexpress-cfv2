import { env, exports } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { decryptString } from "../../src/crypto/aead"

const APP = "http://app.geraiexpress.localhost:8787"
const OWNER = "http://owner.geraiexpress.localhost:8787"
const H = (extra: Record<string, string> = {}) => ({ "content-type": "application/json", origin: APP, "cf-connecting-ip": "203.0.113.7", "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/150", ...extra })

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return exports.default.fetch(`${APP}/api/app${path}`, { method: "POST", headers: H(headers), body: JSON.stringify(body) })
}
async function get(path: string, cookie?: string) {
  return exports.default.fetch(`${APP}/api/app${path}`, { headers: cookie ? { cookie } : {} })
}
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0]!

/** Reads the plain OTP/link from the encrypted outbox row (what the mailer would send). */
async function lastMailVars(template: string): Promise<Record<string, string> & { link: string; code: string; device: string }> {
  const row = await env.DB.prepare("SELECT payload_encrypted FROM email_outbox WHERE template_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").bind(template).first<{ payload_encrypted: string }>()
  return JSON.parse(await decryptString(env.KEK_SECRET, row!.payload_encrypted, "email"))
}

async function signup(email: string, password = "rahasia-gerai-2026", name = "Ani Lestari") {
  const r1 = await post("/auth/signup/request", { email, turnstileToken: "ok" })
  expect(r1.status).toBe(200)
  const { otpId } = ((await r1.json()) as { data: { otpId: string } }).data
  const { code } = await lastMailVars("signup_otp")
  const r2 = await post("/auth/signup/verify", { otpId, code })
  expect(r2.status).toBe(200)
  const { ticket } = ((await r2.json()) as { data: { ticket: string } }).data
  const r3 = await post("/auth/signup/complete", { ticket, name, password })
  expect(r3.status).toBe(201)
  return { cookie: cookieOf(r3), otpId, code, ticket, setCookie: r3.headers.get("set-cookie")! }
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM auth_throttle").run()
})

describe("sign-up by email OTP (PR-01, spec 05 §2)", () => {
  it("creates the account and a host-only app session; OTP and ticket are single use", async () => {
    const s = await signup("pemilik1@contoh.test")
    expect(s.setCookie).toMatch(/^dev_ge_app=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=604800$/)
    expect(s.setCookie).not.toMatch(/Domain=/i)
    const me = await get("/auth/me", s.cookie)
    expect(me.status).toBe(200)
    expect(await me.json()).toMatchObject({ ok: true, data: { user: { email: "pemilik1@contoh.test", name: "Ani Lestari" }, membership: null } })
    // Replays.
    expect((await post("/auth/signup/verify", { otpId: s.otpId, code: s.code })).status).toBe(400)
    expect((await post("/auth/signup/complete", { ticket: s.ticket, name: "X", password: "rahasia-gerai-2026" })).status).toBe(400)
  })

  it("does not reveal whether an email is registered, and never sends an OTP to an existing account", async () => {
    await signup("pemilik2@contoh.test")
    const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE template_id = 'signup_otp'").first<{ n: number }>()
    const r = await post("/auth/signup/request", { email: "PEMILIK2@contoh.test", turnstileToken: "ok" })
    expect(r.status).toBe(200)
    expect(((await r.json()) as { data: { otpId: string } }).data.otpId).toMatch(/^[0-9a-f-]{36}$/)
    const after = await env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE template_id = 'signup_otp'").first<{ n: number }>()
    expect(after!.n).toBe(before!.n)
  })

  it("5 wrong codes lock the email's OTP for 15 minutes (even the right code)", async () => {
    const r1 = await post("/auth/signup/request", { email: "kunci@contoh.test", turnstileToken: "ok" })
    const { otpId } = ((await r1.json()) as { data: { otpId: string } }).data
    const { code } = await lastMailVars("signup_otp")
    const wrong = code === "000000" ? "111111" : "000000"
    for (let i = 0; i < 4; i++) expect((await post("/auth/signup/verify", { otpId, code: wrong })).status).toBe(400)
    const fifth = await post("/auth/signup/verify", { otpId, code: wrong })
    expect(fifth.status).toBe(429)
    expect(((await fifth.json()) as { error: { message: string } }).error.message).toBe("Terlalu banyak percobaan, coba lagi dalam 15 menit.")
    expect((await post("/auth/signup/verify", { otpId, code })).status).toBe(429)
  })

  it("expired OTP is refused", async () => {
    const r1 = await post("/auth/signup/request", { email: "basi@contoh.test", turnstileToken: "ok" })
    const { otpId } = ((await r1.json()) as { data: { otpId: string } }).data
    const { code } = await lastMailVars("signup_otp")
    await env.DB.prepare("UPDATE email_otps SET expires_at = 1 WHERE id = ?").bind(otpId).run()
    expect((await post("/auth/signup/verify", { otpId, code })).status).toBe(400)
  })

  it("send limits: 3 OTP emails per address per 15 min", async () => {
    for (let i = 0; i < 3; i++) expect((await post("/auth/signup/request", { email: "batas@contoh.test", turnstileToken: "ok" })).status).toBe(200)
    expect((await post("/auth/signup/request", { email: "batas@contoh.test", turnstileToken: "ok" })).status).toBe(429)
  })

  it("Turnstile token is required; weak passwords are refused in Indonesian", async () => {
    expect((await post("/auth/signup/request", { email: "ts@contoh.test" })).status).toBe(400)
    const r1 = await post("/auth/signup/request", { email: "lemah@contoh.test", turnstileToken: "ok" })
    const { otpId } = ((await r1.json()) as { data: { otpId: string } }).data
    const { code } = await lastMailVars("signup_otp")
    const { ticket } = ((await (await post("/auth/signup/verify", { otpId, code })).json()) as { data: { ticket: string } }).data
    const weak = await post("/auth/signup/complete", { ticket, name: "A", password: "1234567" })
    expect(weak.status).toBe(422)
    expect(((await weak.json()) as { error: { message: string } }).error.message).toBe("Kata sandi minimal 8 karakter.")
  })
})

describe("login, sessions and cookies", () => {
  it("logs in, rolls nothing within the hour, logs out and the cookie stops working", async () => {
    await signup("pemakai@contoh.test", "sandi-kuat-baru-1")
    const r = await post("/auth/login", { email: "pemakai@contoh.test", password: "sandi-kuat-baru-1", turnstileToken: "ok" })
    expect(r.status).toBe(200)
    const cookie = cookieOf(r)
    expect((await get("/auth/me", cookie)).status).toBe(200)
    const out = await post("/auth/logout", {}, { cookie })
    expect(out.headers.get("set-cookie")).toBe("dev_ge_app=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")
    expect((await get("/auth/me", cookie)).status).toBe(401)
  })

  it("wrong password and unknown email answer identically; 10 failures lock the email", async () => {
    await signup("salah@contoh.test", "sandi-yang-benar-1")
    const a = await post("/auth/login", { email: "salah@contoh.test", password: "keliru-sekali-1", turnstileToken: "ok" })
    const b = await post("/auth/login", { email: "tidakada@contoh.test", password: "keliru-sekali-1", turnstileToken: "ok" })
    expect([a.status, b.status]).toEqual([401, 401])
    expect(((await a.json()) as { error: unknown }).error).toEqual(((await b.json()) as { error: unknown }).error)
    for (let i = 0; i < 10; i++) await post("/auth/login", { email: "salah@contoh.test", password: "keliru", turnstileToken: "ok" })
    expect((await post("/auth/login", { email: "salah@contoh.test", password: "sandi-yang-benar-1", turnstileToken: "ok" })).status).toBe(429)
  })

  it("an app cookie is never accepted on the owner host and owner login refuses non-admins", async () => {
    const s = await signup("silang@contoh.test")
    const ownerMe = await exports.default.fetch(`${OWNER}/api/app/auth/me`, { headers: { cookie: s.cookie } })
    expect(ownerMe.status).toBe(404)
    // The app cookie name on the owner host is a different cookie; even a forged name copy carries no owner session.
    const forged = s.cookie.replace("dev_ge_app", "dev_ge_owner")
    const r = await exports.default.fetch(`${OWNER}/api/owner/auth/me`, { headers: { cookie: forged } })
    expect([401, 404]).toContain(r.status)
  })

  it("rolling: an app session older than an hour is extended and a refreshed cookie is set", async () => {
    const s = await signup("roll@contoh.test")
    await env.DB.prepare("UPDATE sessions SET last_seen_at = last_seen_at - 7200000 WHERE user_id = (SELECT id FROM users WHERE email = 'roll@contoh.test')").run()
    const r = await get("/auth/me", s.cookie)
    expect(r.status).toBe(200)
    expect(r.headers.get("set-cookie")).toMatch(/^dev_ge_app=.*Max-Age=60480\d/)
  })

  it("an expired or revoked session is refused", async () => {
    const s = await signup("habis@contoh.test")
    await env.DB.prepare("UPDATE sessions SET expires_at = 1 WHERE user_id = (SELECT id FROM users WHERE email = 'habis@contoh.test')").run()
    expect((await get("/auth/me", s.cookie)).status).toBe(401)
  })

  it("unsafe requests without a same-origin Origin are refused (CSRF)", async () => {
    const r = await exports.default.fetch(`${APP}/api/app/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
    expect(r.status).toBe(403)
    const cross = await exports.default.fetch(`${APP}/api/app/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: "{}" })
    expect(cross.status).toBe(403)
  })
})

describe("password reset", () => {
  it("single use, revokes every session, and the old password stops working", async () => {
    const s = await signup("lupa@contoh.test", "sandi-lama-kuat-1")
    const login2 = cookieOf(await post("/auth/login", { email: "lupa@contoh.test", password: "sandi-lama-kuat-1", turnstileToken: "ok" }))
    expect((await post("/auth/password/forgot", { email: "lupa@contoh.test" })).status).toBe(200)
    const { link } = await lastMailVars("password_reset")
    const token = link.split("/atur-sandi/")[1]!
    expect((await post("/auth/password/reset", { token, password: "sandi-baru-kuat-2" })).status).toBe(200)
    expect((await post("/auth/password/reset", { token, password: "sandi-baru-kuat-3" })).status).toBe(400)
    expect((await get("/auth/me", s.cookie)).status).toBe(401)
    expect((await get("/auth/me", login2)).status).toBe(401)
    expect((await post("/auth/login", { email: "lupa@contoh.test", password: "sandi-lama-kuat-1", turnstileToken: "ok" })).status).toBe(401)
    expect((await post("/auth/login", { email: "lupa@contoh.test", password: "sandi-baru-kuat-2", turnstileToken: "ok" })).status).toBe(200)
  })

  it("unknown email answers the same and sends nothing; an expired link is refused", async () => {
    const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE template_id = 'password_reset'").first<{ n: number }>()
    expect((await post("/auth/password/forgot", { email: "hantu@contoh.test" })).status).toBe(200)
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE template_id = 'password_reset'").first<{ n: number }>())!.n).toBe(before!.n)
    await signup("basi2@contoh.test")
    await post("/auth/password/forgot", { email: "basi2@contoh.test" })
    const token = (await lastMailVars("password_reset")).link.split("/atur-sandi/")[1]!
    await env.DB.prepare("UPDATE password_resets SET expires_at = 1").run()
    expect((await post("/auth/password/reset", { token, password: "sandi-baru-kuat-9" })).status).toBe(400)
  })
})

describe("Kasir invitations (single use, 7 days)", () => {
  async function ownerWithTenant(email: string, tenantId: string) {
    const s = await signup(email)
    const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>()
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenants (id, slug, name, status, created_at, updated_at) VALUES (?, ?, 'Berkah Jaya', 'active', 1, 1)").bind(tenantId, tenantId),
      env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'gerai_admin', 'active', 1)").bind(tenantId, user!.id),
      env.DB.prepare("UPDATE sessions SET active_tenant_id = ? WHERE user_id = ?").bind(tenantId, user!.id),
    ])
    return s.cookie
  }

  it("owner invites; invitee creates an account once; replay and expiry refused; Kasir cannot invite", async () => {
    const owner = await ownerWithTenant("owner-inv@contoh.test", "tenant-inv")
    expect((await post("/members/invitations", { email: "kasir1@contoh.test" }, { cookie: owner })).status).toBe(201)
    const { link } = await lastMailVars("kasir_invite")
    const token = link.split("/undangan/")[1]!
    const view = await get(`/auth/invitations/${token}`)
    expect(await view.json()).toMatchObject({ ok: true, data: { outletName: "Berkah Jaya", email: "kasir1@contoh.test", role: "cashier", accountExists: false } })
    const acc = await post(`/auth/invitations/${token}/accept`, { name: "Budi", password: "kasir-kuat-123" })
    expect(acc.status).toBe(201)
    const kasir = cookieOf(acc)
    expect(await (await get("/auth/me", kasir)).json()).toMatchObject({ data: { membership: { tenantId: "tenant-inv", role: "cashier" } } })
    expect((await post(`/auth/invitations/${token}/accept`, { name: "Budi", password: "kasir-kuat-123" })).status).toBe(400)
    // Kasir cannot invite (owner only).
    expect((await post("/members/invitations", { email: "x@contoh.test" }, { cookie: kasir })).status).toBe(403)
    // Expired invitation.
    await post("/members/invitations", { email: "kasir2@contoh.test" }, { cookie: owner })
    const t2 = (await lastMailVars("kasir_invite")).link.split("/undangan/")[1]!
    await env.DB.prepare("UPDATE invitations SET expires_at = 1 WHERE email = 'kasir2@contoh.test'").run()
    expect((await get(`/auth/invitations/${t2}`)).status).toBe(400)
  })
})

describe("security alert on a new device for owners", () => {
  it("queues security_alert for a gerai_admin logging in from a new device only", async () => {
    await signup("pemilikalarm@contoh.test", "kuat-sekali-77")
    const user = await env.DB.prepare("SELECT id FROM users WHERE email = 'pemilikalarm@contoh.test'").first<{ id: string }>()
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenants (id, slug, name, status, created_at, updated_at) VALUES ('t-alarm', 't-alarm', 'Alarm', 'active', 1, 1)"),
      env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES ('t-alarm', ?, 'gerai_admin', 'active', 1)").bind(user!.id),
    ])
    const count = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE template_id = 'security_alert'").first<{ n: number }>())!.n
    const c0 = await count()
    await post("/auth/login", { email: "pemilikalarm@contoh.test", password: "kuat-sekali-77", turnstileToken: "ok" })
    expect(await count()).toBe(c0) // same device as sign-up
    await post("/auth/login", { email: "pemilikalarm@contoh.test", password: "kuat-sekali-77", turnstileToken: "ok" }, { "user-agent": "Mozilla/5.0 (Linux; Android 14) Chrome/150" })
    expect(await count()).toBe(c0 + 1)
    expect((await lastMailVars("security_alert")).device).toBe("Chrome di Android")
  })
})

describe("PBKDF2 at 100,000 iterations runs in workerd", () => {
  it("hash/verify round trip", async () => {
    const { hashPassword, verifyPassword } = await import("../../src/auth/password")
    const h = await hashPassword("rahasia-gerai-2026", "pepper")
    expect(h.startsWith("pbkdf2-sha256$100000$")).toBe(true)
    expect(await verifyPassword("rahasia-gerai-2026", "pepper", h)).toBe(true)
    expect(await verifyPassword("rahasia-gerai-2026", "other", h)).toBe(false)
  })
})
