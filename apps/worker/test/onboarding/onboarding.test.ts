import { env, exports } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { createSession } from "../../src/auth/session"
import { hashPassword } from "../../src/auth/password"
import { vaultFor } from "../../src/do/gerai-vault/stub"
import { dispatchDue } from "../../src/email/mailer"
import { hostCache } from "../../src/host/lookup"
import { resetMock } from "../../src/mengantar/mock"
import { hotp, stepAt } from "../../src/auth/totp"

const APP = "http://app.geraiexpress.localhost:8787"
const OWNER = "http://owner.geraiexpress.localhost:8787"

async function appUser(email: string) {
  const id = crypto.randomUUID()
  const t = Date.now()
  await env.DB.prepare("INSERT INTO users (id, email, name, password_hash, status, email_verified_at, password_changed_at, created_at, updated_at) VALUES (?1, ?2, 'Ani', ?3, 'active', ?4, ?4, ?4, ?4)")
    .bind(id, email, await hashPassword("pemilik-kuat-1", env.AUTH_SESSION_PEPPER), t)
    .run()
  const s = await createSession(env, { userId: id, ctx: "app", activeTenantId: null, deviceHash: null, userAgent: null, now: t })
  await s.statement.run()
  return { id, cookie: `dev_ge_app=${s.token}` }
}

let adminCookie = ""
async function adminSession() {
  if (adminCookie) return adminCookie
  const id = crypto.randomUUID()
  const t = Date.now()
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, email, name, password_hash, status, email_verified_at, password_changed_at, created_at, updated_at) VALUES (?1, 'sa-onb@contoh.test', 'SA', ?2, 'active', ?3, ?3, ?3, ?3)").bind(id, await hashPassword("admin-kuat-123", env.AUTH_SESSION_PEPPER), t),
    env.DB.prepare("INSERT INTO super_admins (user_id, totp_state, status, created_at, updated_at) VALUES (?, 'pending', 'active', 1, 1)").bind(id),
  ])
  const h = { "content-type": "application/json", origin: OWNER }
  const login = await exports.default.fetch(`${OWNER}/api/owner/auth/login`, { method: "POST", headers: h, body: JSON.stringify({ email: "sa-onb@contoh.test", password: "admin-kuat-123" }) })
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0]!
  const { secret } = ((await (await exports.default.fetch(`${OWNER}/api/owner/auth/totp/enrol`, { method: "POST", headers: { ...h, cookie }, body: "{}" })).json()) as { data: { secret: string } }).data
  await exports.default.fetch(`${OWNER}/api/owner/auth/totp/verify`, { method: "POST", headers: { ...h, cookie }, body: JSON.stringify({ code: await hotp(secret, stepAt(Date.now())) }) })
  adminCookie = cookie
  return cookie
}

const appPost = (path: string, cookie: string, b: unknown) => exports.default.fetch(`${APP}/api/app${path}`, { method: "POST", headers: { "content-type": "application/json", origin: APP, cookie }, body: JSON.stringify(b) })
const ownerPost = (path: string, cookie: string, b: unknown) => exports.default.fetch(`${OWNER}/api/owner${path}`, { method: "POST", headers: { "content-type": "application/json", origin: OWNER, cookie }, body: JSON.stringify(b) })
const ownerGet = (path: string, cookie: string) => exports.default.fetch(`${OWNER}/api/owner${path}`, { headers: { cookie } })

function application(slug: string, sellerEmail: string) {
  return {
    slug,
    businessName: "Berkah Jaya Cell",
    contactWhatsapp: "0812-3456-7890",
    sellerEmail,
    consentMengantar: true,
    outlet: { name: "Berkah Jaya", picName: "Ani", picPhone: "081234567890", areaId: "5fc62f5df8f44b34aa4c0d8c", areaLabel: "Dago, Coblong, Kota Bandung", streetAddress: "Jl. Dago No. 1" },
  }
}

async function submit(slug: string, sellerEmail: string) {
  const u = await appUser(`${slug}@contoh.test`)
  const r = await appPost("/onboarding/application", u.cookie, application(slug, sellerEmail))
  expect(r.status).toBe(201)
  const { tenantId } = ((await r.json()) as { data: { tenantId: string } }).data
  const app = await env.DB.prepare("SELECT id FROM tenant_applications WHERE tenant_id = ?").bind(tenantId).first<{ id: string }>()
  return { tenantId, applicationId: app!.id, user: u }
}

const statusEmails = (tenantId: string) =>
  env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox e JOIN tenant_applications a ON 1 = 1 WHERE e.template_id = 'application_status' AND a.tenant_id = ? AND e.created_at >= a.created_at").bind(tenantId).first<{ n: number }>()

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

describe("outlet application (PR-01)", () => {
  it("validates slug, reserved words, phone, area and consent in Indonesian", async () => {
    const u = await appUser("val@contoh.test")
    const bad = async (patch: Record<string, unknown>) => (await (await appPost("/onboarding/application", u.cookie, { ...application("validslug", "v@contoh.test"), ...patch })).json()) as { error: { code: string; message: string } }
    expect((await bad({ slug: "jne" })).error.code).toBe("INVALID_SLUG")
    expect((await bad({ slug: "toko-stg" })).error.code).toBe("INVALID_SLUG")
    expect((await bad({ slug: "Ab" })).error.code).toBe("INVALID_SLUG")
    expect((await bad({ contactWhatsapp: "12345" })).error.code).toBe("INVALID_PHONE")
    expect((await bad({ outlet: { ...application("x1x", "x").outlet, areaId: "" } })).error.message).toBe("Pilih kelurahan/kecamatan titik jemput dari hasil pencarian.")
    expect((await bad({ consentMengantar: false })).error.code).toBe("CONSENT_REQUIRED")
  })

  it("area search returns Mengantar areas (mock offline)", async () => {
    const u = await appUser("area@contoh.test")
    const r = await exports.default.fetch(`${APP}/api/app/onboarding/areas?q=coblong`, { headers: { cookie: u.cookie } })
    expect(await r.json()).toMatchObject({ data: { items: [{ id: "5fc62f5df8f44b34aa4c0d8c", label: "Dago, Coblong, Kota Bandung, Jawa Barat" }] } })
  })
})

describe("approve → seller → key stored → connected (PR-02, PR-03)", () => {
  it("activates the mini-site, stores the key encrypted, enqueues exactly one email, audits", async () => {
    const { tenantId, applicationId } = await submit("berkahjaya", "pemilik.berkah@contoh.test")
    // Before approval the mini-site is unknown (pending) → neutral 404.
    expect((await exports.default.fetch("http://berkahjaya.gerai.localhost:8787/")).status).toBe(404)
    const admin = await adminSession()
    expect((await ownerPost(`/gerai/applications/${applicationId}/approve`, admin, {})).status).toBe(422) // reason required
    const r = await ownerPost(`/gerai/applications/${applicationId}/approve`, admin, { reason: "data lengkap dan valid" })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ data: { slug: "berkahjaya", provisioning: { state: "connected" } } })
    hostCache.clear()
    expect((await exports.default.fetch("http://berkahjaya.gerai.localhost:8787/")).status).toBe(200)
    // Key inside the tenant object only, encrypted.
    await runInDurableObject(vaultFor(env, tenantId), (_i, s) => {
      const row = s.storage.sql.exec<{ encrypted_api_key: string; onboarding_state: string; key_version: number }>("SELECT encrypted_api_key, onboarding_state, key_version FROM mengantar_connections").one()
      expect(row.onboarding_state).toBe("connected")
      expect(row.encrypted_api_key).toMatch(/^v1\./)
      expect(row.encrypted_api_key).not.toContain("MOCK-")
      expect(row.key_version).toBe(1)
    })
    const view = await (await ownerGet("/gerai/berkahjaya", admin)).json()
    expect(JSON.stringify(view)).not.toMatch(/MOCK-|encrypted_api_key/)
    expect(view).toMatchObject({ data: { connection: { onboardingState: "connected", hasKey: true } } })
    // Exactly one application_status email; a second approve changes nothing.
    expect((await statusEmails(tenantId))!.n).toBe(1)
    expect((await ownerPost(`/gerai/applications/${applicationId}/approve`, admin, { reason: "klik ganda" })).status).toBe(409)
    expect((await statusEmails(tenantId))!.n).toBe(1)
    const audits = await env.DB.prepare("SELECT action FROM audit_logs WHERE tenant_id = ? AND action LIKE 'tenant.%'").bind(tenantId).all()
    expect(audits.results).toEqual([{ action: "tenant.approve" }])
    // A mailer retry never repeats the transition.
    await dispatchDue(env, Date.now())
    await dispatchDue(env, Date.now() + 60_000)
    expect((await env.DB.prepare("SELECT state FROM tenant_applications WHERE id = ?").bind(applicationId).first())).toEqual({ state: "approved" })
  })

  it("reject enqueues exactly one email with the reason; the owner can re-submit", async () => {
    const { tenantId, applicationId, user } = await submit("ditolak", "ditolak@contoh.test")
    const admin = await adminSession()
    expect((await ownerPost(`/gerai/applications/${applicationId}/reject`, admin, { reason: "Foto titik jemput belum jelas" })).status).toBe(200)
    expect((await ownerPost(`/gerai/applications/${applicationId}/reject`, admin, { reason: "Foto titik jemput belum jelas" })).status).toBe(409)
    expect((await statusEmails(tenantId))!.n).toBe(1)
    expect(await (await exports.default.fetch(`${APP}/api/app/onboarding/status`, { headers: { cookie: user.cookie } })).json()).toMatchObject({ data: { application: { state: "rejected", decision_reason: "Foto titik jemput belum jelas" } } })
    expect((await appPost("/onboarding/application", user.cookie, application("ditolak", "ditolak@contoh.test"))).status).toBe(201)
  })

  it("registration timeout → registration_unknown → read-back finds nothing → pending; retry connects with the same externalUserId", async () => {
    const { tenantId, applicationId } = await submit("timeoutcell", "timeout.owner@contoh.test")
    const admin = await adminSession()
    const r = await ownerPost(`/gerai/applications/${applicationId}/approve`, admin, { reason: "uji timeout" })
    expect(await r.json()).toMatchObject({ data: { provisioning: { state: "registration_pending", code: "NOT_FOUND_ON_READBACK" } } })
    // The seller email is fixed; switch it so the mock no longer times out, then retry.
    await env.DB.prepare("UPDATE tenant_applications SET seller_email = 'pulih.owner@contoh.test' WHERE id = ?").bind(applicationId).run()
    const retry = await ownerPost("/gerai/timeoutcell/onboarding/retry", admin, { reason: "ulangi pendaftaran" })
    expect(await retry.json()).toMatchObject({ data: { state: "connected" } })
    expect((await vaultFor(env, tenantId).connectionView(tenantId))).toMatchObject({ ok: true, value: { onboardingState: "connected", hasKey: true } })
  })

  it("409 EMAIL_ALREADY_REGISTERED → existing_account_required → BYOK by the owner", async () => {
    const { tenantId, applicationId, user } = await submit("punyaakun", "sudahada@contoh.test")
    const admin = await adminSession()
    expect(await (await ownerPost(`/gerai/applications/${applicationId}/approve`, admin, { reason: "email sudah terdaftar" })).json()).toMatchObject({ data: { provisioning: { state: "existing_account_required" } } })
    // The owner's session belongs to the tenant now (submitted). Paste own key.
    expect((await appPost("/onboarding/byok", user.cookie, { apiKey: "bad key" })).status).toBe(422)
    const ok = await appPost("/onboarding/byok", user.cookie, { apiKey: "BYOK-KEY-12345678" })
    expect(await ok.json()).toMatchObject({ data: { state: "byok_connected" } })
    await runInDurableObject(vaultFor(env, tenantId), (_i, s) => {
      const row = s.storage.sql.exec<{ encrypted_api_key: string; seller_id: string | null }>("SELECT encrypted_api_key, seller_id FROM mengantar_connections").one()
      expect(row.encrypted_api_key).not.toContain("BYOK-KEY")
      expect(row.seller_id).toBeNull()
    })
  })
})

describe("suspend / unsuspend and masking controls", () => {
  it("suspend → 403 on the mini-site (within the cache window), audited; masking kill-switch + quota with TOTP + reason", async () => {
    const { tenantId, applicationId } = await submit("bekugerai", "beku@contoh.test")
    const admin = await adminSession()
    await ownerPost(`/gerai/applications/${applicationId}/approve`, admin, { reason: "data lengkap" })
    hostCache.clear()
    expect((await exports.default.fetch("http://bekugerai.gerai.localhost:8787/")).status).toBe(200)
    expect((await ownerPost("/gerai/bekugerai/status", admin, { status: "suspended", reason: "laporan penipuan" })).status).toBe(200)
    expect((await exports.default.fetch("http://bekugerai.gerai.localhost:8787/")).status).toBe(403)
    expect((await ownerPost("/gerai/bekugerai/status", admin, { status: "active", reason: "sudah diverifikasi" })).status).toBe(200)
    expect((await exports.default.fetch("http://bekugerai.gerai.localhost:8787/")).status).toBe(200)
    const m = await ownerPost("/gerai/bekugerai/masking", admin, { enabled: true, dailyQuota: 50, reason: "gerai terpercaya" })
    expect(await m.json()).toMatchObject({ data: { maskingEnabled: true, dailyQuota: 50 } })
    expect((await ownerPost("/gerai/bekugerai/masking", admin, { enabled: true, dailyQuota: null, reason: "tanpa batas" })).status).toBe(200)
    const actions = (await env.DB.prepare("SELECT action FROM audit_logs WHERE tenant_id = ? ORDER BY at, rowid").bind(tenantId).all<{ action: string }>()).results.map((a) => a.action)
    expect(actions).toEqual(["tenant.approve", "tenant.suspend", "tenant.unsuspend", "tenant.masking", "tenant.masking"])
  })

  it("approval seeds masking_daily_quota 20 and the console lists applications and the directory", async () => {
    const admin = await adminSession()
    const list = await (await ownerGet("/gerai/applications?state=all", admin)).json()
    expect((list as { data: { items: unknown[] } }).data.items.length).toBeGreaterThan(0)
    const t = await env.DB.prepare("SELECT masking_daily_quota FROM tenants WHERE slug = 'berkahjaya'").first()
    expect(t).toEqual({ masking_daily_quota: 20 })
    expect((await ownerGet("/gerai?q=berkah", admin)).status).toBe(200)
  })
})
