// DEC-246: Super Admin `/akun` (profile, password, email, sessions), single-use recovery codes as a backup second
// factor, and gap-free authenticator rotation. Spec 05 §2, TASKS `DEC-246`.
import { env, exports } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { hashPassword } from "../../src/auth/password"
import { hotp, stepAt } from "../../src/auth/totp"
import { decryptString } from "../../src/crypto/aead"
import { ROUTES } from "../../src/api/registry"
import { scanRoutes } from "../../../../scripts/ci/route-scan-lib.mjs"

const OWNER = "http://owner.geraiexpress.localhost:8787"
const PASSWORD = "admin-kuat-123"
const H = (cookie?: string) => ({ "content-type": "application/json", origin: OWNER, "cf-connecting-ip": "198.51.100.46", "user-agent": "Mozilla/5.0 (Macintosh; Mac OS X) Safari/605", ...(cookie ? { cookie } : {}) })
const post = (path: string, body: unknown, cookie?: string) => exports.default.fetch(`${OWNER}/api/owner${path}`, { method: "POST", headers: H(cookie), body: JSON.stringify(body) })
const get = (path: string, cookie?: string) => exports.default.fetch(`${OWNER}/api/owner${path}`, { headers: cookie ? { cookie } : {} })
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0]!
const data = async <T>(res: Response) => ((await res.json()) as { data: T }).data
const errCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
const CODE_RE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/

interface Account {
  profile: { name: string; email: string; phone: string | null }
  totp: { state: string; enrolledAt: number | null; totpRecentUntil: number }
  recoveryCodes: { remaining: number; generatedAt: number | null }
  sessions: Array<{ id: string; host: string; current: boolean }>
}

/** A Super Admin (pending TOTP) with a password. */
async function makeAdmin(email: string) {
  const id = crypto.randomUUID()
  const t = Date.now()
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, email, name, password_hash, status, email_verified_at, password_changed_at, created_at, updated_at) VALUES (?1, ?2, 'Admin Uji', ?3, 'active', ?4, ?4, ?4, ?4)").bind(
      id,
      email,
      await hashPassword(PASSWORD, env.AUTH_SESSION_PEPPER),
      t,
    ),
    env.DB.prepare("INSERT INTO super_admins (user_id, totp_state, status, created_at, updated_at) VALUES (?, 'pending', 'active', ?, ?)").bind(id, t, t),
  ])
  return id
}

const login = async (email: string, password = PASSWORD) => cookieOf(await post("/auth/login", { email, password }))

/** First login: enrol + confirm TOTP. Returns the aal2 cookie, the secret and the codes issued with the first confirmation. */
async function enrolled(email: string) {
  const userId = await makeAdmin(email)
  const cookie = await login(email)
  const { secret } = await data<{ secret: string }>(await post("/auth/totp/enrol", {}, cookie))
  const verify = await post("/auth/totp/verify", { code: await hotp(secret, stepAt(Date.now())) }, cookie)
  expect(verify.status).toBe(200)
  const { recoveryCodes } = await data<{ recoveryCodes?: string[] }>(verify)
  return { userId, cookie, secret, codes: recoveryCodes ?? [] }
}

const audits = async (userId: string, action: string) =>
  (await env.DB.prepare("SELECT reason, metadata_json FROM audit_logs WHERE actor_id = ? AND action = ? ORDER BY at").bind(userId, action).all<{ reason: string; metadata_json: string | null }>()).results

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM auth_throttle").run()
})

describe("recovery codes (DEC-246 §2)", () => {
  it("the first TOTP confirmation issues 8 distinct XXXX-XXXX codes once; only peppered hashes are stored", async () => {
    const a = await enrolled("rc1@contoh.test")
    expect(a.codes).toHaveLength(8)
    for (const c of a.codes) expect(c).toMatch(CODE_RE)
    expect(new Set(a.codes).size).toBe(8)
    const rows = (await env.DB.prepare("SELECT code_hash, used_at FROM super_admin_recovery_codes WHERE user_id = ?").bind(a.userId).all<{ code_hash: string; used_at: number | null }>()).results
    expect(rows).toHaveLength(8)
    for (const r of rows) {
      expect(r.code_hash).toMatch(/^[0-9a-f]{64}$/)
      expect(r.used_at).toBeNull()
      for (const c of a.codes) expect(r.code_hash).not.toContain(c.replace("-", ""))
    }
    // A later TOTP login does not issue codes again.
    const again = await login("rc1@contoh.test")
    const v = await post("/auth/totp/verify", { code: await hotp(a.secret, stepAt(Date.now()) + 1) }, again)
    expect(v.status).toBe(200)
    expect((await data<{ recoveryCodes?: string[] }>(v)).recoveryCodes).toBeUndefined()
    expect((await audits(a.userId, "super_admin.recovery_codes_regenerate")).length).toBe(1)
  })

  it("a recovery code replaces the TOTP code once (any case, with or without the hyphen) and is audited", async () => {
    const a = await enrolled("rc2@contoh.test")
    const s1 = await login("rc2@contoh.test")
    expect((await get("/auth/me", s1)).status).toBe(401)
    const res = await post("/auth/totp/recovery", { code: ` ${a.codes[0]!.replace("-", "").toLowerCase()} ` }, s1)
    expect(res.status).toBe(200)
    expect(await data(res)).toEqual({ aal: "aal2", remaining: 7 })
    expect((await get("/auth/me", s1)).status).toBe(200)
    // Single use: the same code on a new session is refused.
    const s2 = await login("rc2@contoh.test")
    const reuse = await post("/auth/totp/recovery", { code: a.codes[0] }, s2)
    expect(reuse.status).toBe(400)
    expect(await errCode(reuse)).toBe("RECOVERY_CODE_INVALID")
    expect((await get("/auth/me", s2)).status).toBe(401)
    const used = await audits(a.userId, "super_admin.recovery_code_used")
    expect(used).toHaveLength(1)
    expect(JSON.parse(used[0]!.metadata_json!)).toEqual({ remaining: 7, resetTotp: false })
    expect((await data<Account>(await get("/account", s1))).recoveryCodes.remaining).toBe(7)
  })

  it("wrong recovery codes share the TOTP lock: 5 wrong (mixed) → 429 for both, even with a valid code", async () => {
    const a = await enrolled("rc3@contoh.test")
    const s = await login("rc3@contoh.test")
    for (let i = 0; i < 3; i++) expect((await post("/auth/totp/recovery", { code: "AAAA-AAAA" }, s)).status).toBe(400)
    for (let i = 0; i < 2; i++) expect((await post("/auth/totp/verify", { code: "000001" }, s)).status).toBe(400)
    const locked = await post("/auth/totp/recovery", { code: a.codes[1] }, s)
    expect(locked.status).toBe(429)
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(800)
    expect((await post("/auth/totp/verify", { code: await hotp(a.secret, stepAt(Date.now()) + 1) }, s)).status).toBe(429)
    // The valid code was not consumed by the refused attempt.
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM super_admin_recovery_codes WHERE user_id = ? AND used_at IS NULL").bind(a.userId).first<{ n: number }>())!.n).toBe(8)
  })

  it("resetTotp: a recovery login returns a rotation ticket, signs out the other owner sessions and never goes back to pending", async () => {
    const a = await enrolled("rc4@contoh.test")
    const s = await login("rc4@contoh.test")
    const res = await post("/auth/totp/recovery", { code: a.codes[2], resetTotp: true }, s)
    expect(res.status).toBe(200)
    const out = await data<{ aal: string; remaining: number; rotation: { rotateTicket: string; secret: string; otpauthUri: string; expiresAt: number } }>(res)
    expect(out).toMatchObject({ aal: "aal2", remaining: 7 })
    expect(out.rotation.otpauthUri).toContain(out.rotation.secret)
    expect(out.rotation.rotateTicket).not.toContain(out.rotation.secret)
    // The old (phone-lost) session is signed out; the account stays `active` — a password alone cannot enrol.
    expect((await get("/auth/me", a.cookie)).status).toBe(401)
    expect((await env.DB.prepare("SELECT totp_state FROM super_admins WHERE user_id = ?").bind(a.userId).first<{ totp_state: string }>())!.totp_state).toBe("active")
    const pwOnly = await login("rc4@contoh.test")
    expect((await post("/auth/totp/enrol", {}, pwOnly)).status).toBe(409)
    // Pair the new phone in place.
    const ok = await post("/account/totp/rotate-confirm", { rotateTicket: out.rotation.rotateTicket, code: await hotp(out.rotation.secret, stepAt(Date.now())) }, s)
    expect(ok.status).toBe(200)
    const next = await login("rc4@contoh.test")
    expect((await post("/auth/totp/verify", { code: await hotp(a.secret, stepAt(Date.now()) + 1) }, next)).status).toBe(400)
    expect((await post("/auth/totp/verify", { code: await hotp(out.rotation.secret, stepAt(Date.now()) + 1) }, next)).status).toBe(200)
    expect(JSON.parse((await audits(a.userId, "super_admin.recovery_code_used"))[0]!.metadata_json!)).toEqual({ remaining: 7, resetTotp: true })
  })

  it("a new set needs the current password and recent TOTP, replaces the old set, and is audited", async () => {
    const a = await enrolled("rc5@contoh.test")
    expect((await post("/account/recovery-codes", { password: "salah-sandi-123" }, a.cookie)).status).toBe(400)
    const res = await post("/account/recovery-codes", { password: PASSWORD }, a.cookie)
    expect(res.status).toBe(200)
    const { codes, generatedAt } = await data<{ codes: string[]; generatedAt: number }>(res)
    expect(codes).toHaveLength(8)
    expect(generatedAt).toBeGreaterThan(0)
    expect(codes.some((c) => a.codes.includes(c))).toBe(false)
    const s = await login("rc5@contoh.test")
    expect((await post("/auth/totp/recovery", { code: a.codes[0] }, s)).status).toBe(400) // old set is gone
    expect((await post("/auth/totp/recovery", { code: codes[0] }, s)).status).toBe(200)
    expect((await audits(a.userId, "super_admin.recovery_codes_regenerate")).length).toBe(2)
    // Recency: an old TOTP confirmation is not enough to mint codes.
    await env.DB.prepare("UPDATE sessions SET totp_verified_at = totp_verified_at - 900001 WHERE user_id = ?").bind(a.userId).run()
    const stale = await post("/account/recovery-codes", { password: PASSWORD }, a.cookie)
    expect(stale.status).toBe(401)
    expect(await errCode(stale)).toBe("TOTP_RECENT_REQUIRED")
  })

  it("another admin's TOTP reset deletes the target's recovery codes", async () => {
    const target = await enrolled("rc6@contoh.test")
    const actor = await enrolled("rc7@contoh.test")
    expect(target.codes).toHaveLength(8)
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM super_admin_recovery_codes WHERE user_id = ?").bind(target.userId).first<{ n: number }>())!.n).toBe(8)
    expect((await post(`/admins/${target.userId}/totp-reset`, { reason: "HP admin hilang" }, actor.cookie)).status).toBe(200)
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM super_admin_recovery_codes WHERE user_id = ?").bind(target.userId).first<{ n: number }>())!.n).toBe(0)
  })
})

describe("authenticator rotation (DEC-246 §2.3)", () => {
  it("rotate-start leaves the active TOTP untouched; only a valid code from the new secret swaps it", async () => {
    const a = await enrolled("rot1@contoh.test")
    const other = await login("rot1@contoh.test")
    expect((await post("/auth/totp/verify", { code: await hotp(a.secret, stepAt(Date.now()) + 1) }, other)).status).toBe(200)
    expect((await post("/account/totp/rotate-start", { password: "salah-sandi-123" }, a.cookie)).status).toBe(400)
    const before = (await env.DB.prepare("SELECT totp_secret_encrypted FROM super_admins WHERE user_id = ?").bind(a.userId).first<{ totp_secret_encrypted: string }>())!.totp_secret_encrypted
    const start = await data<{ rotateTicket: string; secret: string; expiresAt: number }>(await post("/account/totp/rotate-start", { password: PASSWORD }, a.cookie))
    expect(start.secret).not.toBe(a.secret)
    expect(start.expiresAt - Date.now()).toBeLessThanOrEqual(10 * 60_000)
    // Abandoned: nothing changed.
    expect((await env.DB.prepare("SELECT totp_secret_encrypted FROM super_admins WHERE user_id = ?").bind(a.userId).first<{ totp_secret_encrypted: string }>())!.totp_secret_encrypted).toBe(before)
    // Wrong code, foreign ticket, expired ticket: refused, still unchanged.
    expect((await post("/account/totp/rotate-confirm", { rotateTicket: start.rotateTicket, code: "000000" }, a.cookie)).status).toBe(400)
    const b = await enrolled("rot2@contoh.test")
    const foreign = await post("/account/totp/rotate-confirm", { rotateTicket: start.rotateTicket, code: await hotp(start.secret, stepAt(Date.now())) }, b.cookie)
    expect(foreign.status).toBe(400)
    expect(await errCode(foreign)).toBe("ROTATE_TICKET_INVALID")
    expect((await post("/account/totp/rotate-confirm", { rotateTicket: "bukan-tiket", code: "123456" }, a.cookie)).status).toBe(400)
    expect((await decryptString(env.KEK_SECRET, before, "totp"))).toBe(a.secret)
    // Confirmed: switched; the other owner session is signed out, this one stays.
    const ok = await post("/account/totp/rotate-confirm", { rotateTicket: start.rotateTicket, code: await hotp(start.secret, stepAt(Date.now())) }, a.cookie)
    expect(ok.status).toBe(200)
    expect(await data(ok)).toEqual({ rotated: true })
    expect((await get("/auth/me", other)).status).toBe(401)
    expect((await get("/auth/me", a.cookie)).status).toBe(200)
    // The same ticket cannot be confirmed twice (its code step is spent).
    expect((await post("/account/totp/rotate-confirm", { rotateTicket: start.rotateTicket, code: await hotp(start.secret, stepAt(Date.now())) }, a.cookie)).status).toBe(400)
    const next = await login("rot1@contoh.test")
    expect((await post("/auth/totp/verify", { code: await hotp(a.secret, stepAt(Date.now()) + 1) }, next)).status).toBe(400)
    expect((await post("/auth/totp/verify", { code: await hotp(start.secret, stepAt(Date.now()) + 1) }, next)).status).toBe(200)
    expect((await audits(a.userId, "super_admin.totp_rotated")).length).toBe(1)
  })

  it("an expired rotation ticket is refused", async () => {
    const a = await enrolled("rot3@contoh.test")
    const start = await data<{ rotateTicket: string; secret: string }>(await post("/account/totp/rotate-start", { password: PASSWORD }, a.cookie))
    const later = Date.now() + 10 * 60_000 + 1
    const { openRotation } = await import("../../src/auth/recovery")
    await expect(openRotation(env, start.rotateTicket, a.userId, later)).rejects.toMatchObject({ code: "ROTATE_TICKET_INVALID" })
    await expect(openRotation(env, start.rotateTicket, a.userId, Date.now())).resolves.toMatchObject({ secret: start.secret })
  })

  const rotate = async (cookie: string) => data<{ rotateTicket: string; secret: string }>(await post("/account/totp/rotate-start", { password: PASSWORD }, cookie))
  const confirm = async (cookie: string, t: { rotateTicket: string; secret: string }, offset = 0) =>
    post("/account/totp/rotate-confirm", { rotateTicket: t.rotateTicket, code: await hotp(t.secret, stepAt(Date.now()) + offset) }, cookie)

  it("Sol R1 #1: A→B→A replay and an outstanding ticket from before another rotation are refused", async () => {
    const a = await enrolled("rot4@contoh.test")
    const A = await rotate(a.cookie)
    const stale = await rotate(a.cookie) // issued against the same generation as A, never confirmed
    expect((await confirm(a.cookie, A)).status).toBe(200)
    const B = await rotate(a.cookie)
    expect((await confirm(a.cookie, B)).status).toBe(200)
    // Back to A with a valid A code: the ticket's generation is gone.
    const replay = await confirm(a.cookie, A, 1)
    expect(replay.status).toBe(400)
    expect(await errCode(replay)).toBe("ROTATE_TICKET_INVALID")
    const outstanding = await confirm(a.cookie, stale)
    expect(outstanding.status).toBe(400)
    expect(await errCode(outstanding)).toBe("ROTATE_TICKET_INVALID")
    // B is still the active authenticator.
    const next = await login("rot4@contoh.test")
    expect((await post("/auth/totp/verify", { code: await hotp(B.secret, stepAt(Date.now()) + 1) }, next)).status).toBe(200)
    expect((await audits(a.userId, "super_admin.totp_rotated")).length).toBe(2)
  })

  it("Sol R1 #1: a recovery-issued ticket dies once another rotation completes", async () => {
    const a = await enrolled("rot5@contoh.test")
    const s = await login("rot5@contoh.test")
    const { rotation } = await data<{ rotation: { rotateTicket: string; secret: string } }>(await post("/auth/totp/recovery", { code: a.codes[0], resetTotp: true }, s))
    const B = await rotate(s)
    expect((await confirm(s, B)).status).toBe(200)
    const late = await confirm(s, rotation, 1)
    expect(late.status).toBe(400)
    expect(await errCode(late)).toBe("ROTATE_TICKET_INVALID")
  })
})

describe("Profil & Keamanan Akun (DEC-246 §2.3)", () => {
  it("GET /account: profile, TOTP state, recovery status and the owner session list", async () => {
    const a = await enrolled("akun1@contoh.test")
    const acc = await data<Account>(await get("/account", a.cookie))
    expect(acc.profile).toEqual({ name: "Admin Uji", email: "akun1@contoh.test", phone: null })
    expect(acc.totp.state).toBe("active")
    expect(acc.totp.totpRecentUntil).toBeGreaterThan(Date.now())
    expect(acc.recoveryCodes.remaining).toBe(8)
    expect(acc.recoveryCodes.generatedAt).toBeGreaterThan(0)
    expect(acc.sessions.filter((s) => s.current)).toHaveLength(1)
    expect(acc.sessions[0]!.host).toBe("owner")
    expect(JSON.stringify(acc)).not.toMatch(/token_hash|code_hash|secret/)
  })

  it("profile update validates and is audited", async () => {
    const a = await enrolled("akun2@contoh.test")
    expect((await post("/account/profile", { name: "", phone: "" }, a.cookie)).status).toBe(422)
    const res = await post("/account/profile", { name: "Paduka Uji", phone: "0812-3456-7890" }, a.cookie)
    expect(res.status).toBe(200)
    expect((await data<Account>(await get("/account", a.cookie))).profile).toMatchObject({ name: "Paduka Uji", phone: "081234567890" })
    expect((await audits(a.userId, "super_admin.profile_updated")).length).toBe(1)
  })

  it("password change: current password required; other owner AND app sessions end; the old password stops working", async () => {
    const a = await enrolled("akun3@contoh.test")
    const other = await login("akun3@contoh.test")
    expect((await post("/auth/totp/verify", { code: await hotp(a.secret, stepAt(Date.now()) + 1) }, other)).status).toBe(200)
    const appHash = "a".repeat(64)
    await env.DB.prepare(
      "INSERT INTO sessions (token_hash, user_id, host_context, aal, created_at, last_seen_at, expires_at, absolute_expires_at) VALUES (?, ?, 'app', 'aal1', ?, ?, ?, ?)",
    )
      .bind(appHash, a.userId, Date.now(), Date.now(), Date.now() + 3600_000, Date.now() + 3600_000)
      .run()
    expect((await post("/account/password", { current: "salah-sandi-123", next: "sandi-baru-kuat-456" }, a.cookie)).status).toBe(400)
    expect((await post("/account/password", { current: PASSWORD, next: "pendek" }, a.cookie)).status).toBe(422)
    expect((await post("/account/password", { current: PASSWORD, next: "sandi-baru-kuat-456" }, a.cookie)).status).toBe(200)
    expect((await get("/auth/me", other)).status).toBe(401)
    expect((await get("/auth/me", a.cookie)).status).toBe(200)
    expect((await env.DB.prepare("SELECT revoked_at FROM sessions WHERE token_hash = ?").bind(appHash).first<{ revoked_at: number | null }>())!.revoked_at).not.toBeNull()
    expect((await post("/auth/login", { email: "akun3@contoh.test", password: PASSWORD })).status).toBe(401)
    expect((await post("/auth/login", { email: "akun3@contoh.test", password: "sandi-baru-kuat-456" })).status).toBe(200)
    expect((await audits(a.userId, "super_admin.password_changed")).length).toBe(1)
  })

  it("email change: current password + OTP to the new address; audited", async () => {
    const a = await enrolled("akun4@contoh.test")
    expect((await post("/account/email/request", { email: "akun4-baru@contoh.test", password: "salah-sandi-123" }, a.cookie)).status).toBe(400)
    const { otpId } = await data<{ otpId: string }>(await post("/account/email/request", { email: "akun4-baru@contoh.test", password: PASSWORD }, a.cookie))
    const row = await env.DB.prepare("SELECT payload_encrypted FROM email_outbox WHERE template_id = 'email_change_otp' ORDER BY created_at DESC, rowid DESC LIMIT 1").first<{ payload_encrypted: string }>()
    const { code } = JSON.parse(await decryptString(env.KEK_SECRET, row!.payload_encrypted, "email")) as { code: string }
    expect((await post("/account/email/confirm", { otpId, code }, a.cookie)).status).toBe(200)
    expect((await data<Account>(await get("/account", a.cookie))).profile.email).toBe("akun4-baru@contoh.test")
    expect((await audits(a.userId, "super_admin.email_changed")).length).toBe(1)
  })

  it("Sol R1 #2: password guesses through the email change are bounded per user, whatever address is proposed", async () => {
    const a = await enrolled("akun6@contoh.test")
    for (let i = 0; i < 5; i++) {
      const r = await post("/account/email/request", { email: `tebak-${i}@contoh.test`, password: `salah-sandi-${i}00` }, a.cookie)
      expect(r.status, `attempt ${i + 1}`).toBe(400)
    }
    const locked = await post("/account/email/request", { email: "lain-lagi@contoh.test", password: PASSWORD }, a.cookie)
    expect(locked.status).toBe(429)
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0)
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM email_otps WHERE user_id = ? AND purpose = 'email_change'").bind(a.userId).first<{ n: number }>()).toEqual({ n: 0 })
  })

  it("sessions: revoke one by handle, then all others; the current session stays", async () => {
    const a = await enrolled("akun5@contoh.test")
    const s2 = await login("akun5@contoh.test")
    const s3 = await login("akun5@contoh.test")
    const list = (await data<Account>(await get("/account", a.cookie))).sessions
    expect(list).toHaveLength(3)
    const target = list.find((s) => !s.current)!
    expect((await post("/account/sessions/revoke", { id: target.id }, a.cookie)).status).toBe(200)
    expect((await data<Account>(await get("/account", a.cookie))).sessions).toHaveLength(2)
    expect(await data(await post("/account/sessions/revoke", { allOthers: true }, a.cookie))).toEqual({ revoked: 1 })
    expect((await get("/auth/me", a.cookie)).status).toBe(200)
    // Sol R1 #4: both revocations are audited with scope + count only.
    const rows = await audits(a.userId, "super_admin.session_revoked")
    expect(rows.map((r) => JSON.parse(r.metadata_json!))).toEqual([{ scope: "one", revoked: 1 }, { scope: "all_others", revoked: 1 }])
    expect(rows.map((r) => r.metadata_json).join()).not.toContain(target.id)
    for (const c of [s2, s3]) expect((await post("/auth/totp/verify", { code: "123456" }, c)).status).toBe(401)
  })

  it("every new route passes the route-table scan with the declared auth levels", () => {
    expect(scanRoutes(ROUTES)).toEqual([])
    const level = (m: string, p: string) => ROUTES.find((r) => r.context === "owner" && r.method === m && r.path === p)?.auth
    expect(level("POST", "/auth/totp/recovery")).toBe("owner_aal1")
    expect(level("GET", "/account")).toBe("owner_aal2")
    expect(level("POST", "/account/profile")).toBe("owner_aal2")
    expect(level("POST", "/account/sessions/revoke")).toBe("owner_aal2")
    for (const p of ["/account/password", "/account/email/request", "/account/email/confirm", "/account/recovery-codes", "/account/totp/rotate-start", "/account/totp/rotate-confirm"]) expect(level("POST", p), p).toBe("owner_recent")
  })
})
