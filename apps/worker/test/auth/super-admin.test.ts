import { env, exports } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { hashPassword } from "../../src/auth/password"
import { hotp, stepAt } from "../../src/auth/totp"
import { IMPERSONATION_PATTERNS } from "../../src/api/owner"
import { ROUTES } from "../../src/api/registry"

const OWNER = "http://owner.geraiexpress.localhost:8787"
const APP = "http://app.geraiexpress.localhost:8787"
const H = (cookie?: string) => ({ "content-type": "application/json", origin: OWNER, "cf-connecting-ip": "198.51.100.9", "user-agent": "Mozilla/5.0 (Macintosh; Mac OS X) Safari/605", ...(cookie ? { cookie } : {}) })
const post = (path: string, body: unknown, cookie?: string) => exports.default.fetch(`${OWNER}/api/owner${path}`, { method: "POST", headers: H(cookie), body: JSON.stringify(body) })
const get = (path: string, cookie?: string) => exports.default.fetch(`${OWNER}/api/owner${path}`, { headers: cookie ? { cookie } : {} })
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0]!

async function makeUser(email: string, password = "admin-kuat-123") {
  const id = crypto.randomUUID()
  const t = Date.now()
  await env.DB.prepare("INSERT INTO users (id, email, name, password_hash, status, email_verified_at, password_changed_at, created_at, updated_at) VALUES (?1, ?2, 'Admin', ?3, 'active', ?4, ?4, ?4, ?4)")
    .bind(id, email, await hashPassword(password, env.AUTH_SESSION_PEPPER), t)
    .run()
  return id
}

/** Logs in on owner., enrols TOTP and returns an aal2 cookie plus the secret. */
async function adminSession(email: string) {
  const login = await post("/auth/login", { email, password: "admin-kuat-123" })
  expect(login.status).toBe(200)
  const cookie = cookieOf(login)
  expect(cookie.startsWith("dev_ge_owner=")).toBe(true)
  const enrol = await post("/auth/totp/enrol", {}, cookie)
  const { secret, otpauthUri } = ((await enrol.json()) as { data: { secret: string; otpauthUri: string } }).data
  expect(otpauthUri).toMatch(/^otpauth:\/\/totp\/GeraiExpress%20Super%20Admin/)
  const code = await hotp(secret, stepAt(Date.now()))
  expect((await post("/auth/totp/verify", { code }, cookie)).status).toBe(200)
  return { cookie, secret }
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM auth_throttle").run()
})

describe("Super Admin TOTP and aal2 (TASK-106, DEC-209)", () => {
  it("bootstraps the first admin once; a non-admin cannot log in on owner.", async () => {
    await makeUser("pertama@contoh.test")
    const boot = (email: string) =>
      exports.default.fetch(`${OWNER}/internal/ops/bootstrap-admin`, { method: "POST", headers: { authorization: "Bearer test-ops-token", "content-type": "application/json" }, body: JSON.stringify({ email }) })
    expect((await boot("pertama@contoh.test")).status).toBe(201)
    expect((await boot("pertama@contoh.test")).status).toBe(409)
    await makeUser("biasa@contoh.test")
    expect((await post("/auth/login", { email: "biasa@contoh.test", password: "admin-kuat-123" })).status).toBe(401)
  })

  it("aal1 can only complete TOTP; aal2 opens the console; a wrong or replayed code is refused", async () => {
    await makeUser("a1@contoh.test")
    await env.DB.prepare("INSERT INTO super_admins (user_id, totp_state, status, created_at, updated_at) SELECT id, 'pending', 'active', 1, 1 FROM users WHERE email = 'a1@contoh.test'").run()
    const login = await post("/auth/login", { email: "a1@contoh.test", password: "admin-kuat-123" })
    const cookie = cookieOf(login)
    expect(await login.json()).toMatchObject({ data: { totp: "enrol" } })
    expect((await get("/auth/me", cookie)).status).toBe(401)
    const { secret } = ((await (await post("/auth/totp/enrol", {}, cookie)).json()) as { data: { secret: string } }).data
    expect((await post("/auth/totp/verify", { code: "000000" }, cookie)).status).toBe(400)
    const code = await hotp(secret, stepAt(Date.now()))
    expect((await post("/auth/totp/verify", { code }, cookie)).status).toBe(200)
    expect((await get("/auth/me", cookie)).status).toBe(200)
    // Replay of the same code on a new session is refused.
    const login2 = cookieOf(await post("/auth/login", { email: "a1@contoh.test", password: "admin-kuat-123" }))
    expect((await post("/auth/totp/verify", { code }, login2)).status).toBe(400)
    // Secret is stored encrypted only.
    const row = await env.DB.prepare("SELECT totp_secret_encrypted FROM super_admins WHERE user_id = (SELECT id FROM users WHERE email = 'a1@contoh.test')").first<{ totp_secret_encrypted: string }>()
    expect(row!.totp_secret_encrypted).not.toContain(secret)
    // Enrolment is shown once: a second enrol while active is refused.
    expect((await post("/auth/totp/enrol", {}, cookie)).status).toBe(409)
  })

  it("5 wrong TOTP codes lock TOTP for 15 minutes", async () => {
    await makeUser("a2@contoh.test")
    await env.DB.prepare("INSERT INTO super_admins (user_id, totp_state, status, created_at, updated_at) SELECT id, 'pending', 'active', 1, 1 FROM users WHERE email = 'a2@contoh.test'").run()
    const cookie = cookieOf(await post("/auth/login", { email: "a2@contoh.test", password: "admin-kuat-123" }))
    await post("/auth/totp/enrol", {}, cookie)
    for (let i = 0; i < 5; i++) await post("/auth/totp/verify", { code: "000001" }, cookie)
    expect((await post("/auth/totp/verify", { code: "000001" }, cookie)).status).toBe(429)
  })

  it("recency: a sensitive READ and a MUTATION need a TOTP within 15 minutes", async () => {
    await makeUser("a3@contoh.test")
    await makeUser("a4@contoh.test")
    await env.DB.prepare("INSERT INTO super_admins (user_id, totp_state, status, created_at, updated_at) SELECT id, 'pending', 'active', 1, 1 FROM users WHERE email = 'a3@contoh.test'").run()
    const { cookie, secret } = await adminSession("a3@contoh.test")
    expect((await get("/audit", cookie)).status).toBe(200)
    expect((await post("/admins", { email: "a4@contoh.test", reason: "tambah admin operasional" }, cookie)).status).toBe(201)
    await env.DB.prepare("UPDATE sessions SET totp_verified_at = totp_verified_at - 900001 WHERE user_id = (SELECT id FROM users WHERE email = 'a3@contoh.test')").run()
    const read = await get("/audit", cookie)
    expect(read.status).toBe(401)
    expect(((await read.json()) as { error: { message: string } }).error.message).toBe("Konfirmasi ulang TOTP untuk melanjutkan.")
    expect((await post("/admins/x/totp-reset", { reason: "uji akses" }, cookie)).status).toBe(401)
    // Non-sensitive aal2 reads still work.
    expect((await get("/auth/me", cookie)).status).toBe(200)
    // Re-TOTP restores access.
    const code = await hotp(secret, stepAt(Date.now()) + 1)
    expect((await post("/auth/totp/verify", { code }, cookie)).status).toBe(200)
    expect((await get("/audit", cookie)).status).toBe(200)
  })

  it("recovery: another admin resets a TOTP with reason + audit; never their own; the target's sessions end", async () => {
    const targetId = await makeUser("a5@contoh.test")
    await makeUser("a6@contoh.test")
    await env.DB.prepare("INSERT INTO super_admins (user_id, totp_state, status, created_at, updated_at) SELECT id, 'pending', 'active', 1, 1 FROM users WHERE email IN ('a5@contoh.test','a6@contoh.test')").run()
    const target = await adminSession("a5@contoh.test")
    const actor = await adminSession("a6@contoh.test")
    const actorId = (await env.DB.prepare("SELECT id FROM users WHERE email = 'a6@contoh.test'").first<{ id: string }>())!.id
    expect((await post(`/admins/${targetId}/totp-reset`, {}, actor.cookie)).status).toBe(422) // reason required
    expect((await post(`/admins/${actorId}/totp-reset`, { reason: "uji diri sendiri" }, actor.cookie)).status).toBe(409)
    expect((await post(`/admins/${targetId}/totp-reset`, { reason: "HP admin hilang" }, actor.cookie)).status).toBe(200)
    expect((await get("/auth/me", target.cookie)).status).toBe(401)
    const audit = await env.DB.prepare("SELECT actor_id, action, target_id, reason FROM audit_logs WHERE action = 'super_admin.totp_reset' AND target_id = ?").bind(targetId).first()
    expect(audit).toEqual({ actor_id: actorId, action: "super_admin.totp_reset", target_id: targetId, reason: "HP admin hilang" })
    // The reset admin enrols again on next login (QR shown once more).
    const relog = cookieOf(await post("/auth/login", { email: "a5@contoh.test", password: "admin-kuat-123" }))
    expect((await post("/auth/totp/enrol", {}, relog)).status).toBe(200)
  })

  it("owner session is 12 h absolute and host-only; it is never accepted on app.", async () => {
    await makeUser("a7@contoh.test")
    await env.DB.prepare("INSERT INTO super_admins (user_id, totp_state, status, created_at, updated_at) SELECT id, 'pending', 'active', 1, 1 FROM users WHERE email = 'a7@contoh.test'").run()
    const login = await post("/auth/login", { email: "a7@contoh.test", password: "admin-kuat-123" })
    expect(login.headers.get("set-cookie")).toMatch(/^dev_ge_owner=[^;]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=43200$/)
    const cookie = cookieOf(login)
    const onApp = await exports.default.fetch(`${APP}/api/app/auth/me`, { headers: { cookie } })
    expect(onApp.status).toBe(401)
  })
})

describe("non-impersonation route scan (DEC-209)", () => {
  it("no /api/owner route can create, pay, edit, cancel or impersonate a gerai's shipments", () => {
    const owner = ROUTES.filter((r) => r.context === "owner")
    expect(owner.length).toBeGreaterThan(0)
    for (const r of owner) {
      for (const re of IMPERSONATION_PATTERNS) expect(re.test(r.path), `${r.method} ${r.path} matches ${re}`).toBe(false)
    }
  })
  it("every /api/owner route except login requires aal1+ and every non-auth route requires aal2+", () => {
    for (const r of ROUTES.filter((x) => x.context === "owner")) {
      if (r.path === "/auth/login") expect(r.auth).toBe("public")
      else if (r.path.startsWith("/auth/")) expect(["owner_aal1", "owner_aal2"]).toContain(r.auth)
      else expect(["owner_aal2", "owner_recent"]).toContain(r.auth)
    }
  })
})
