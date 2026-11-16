// Shared fixtures for onboarding and console tests (TASK-203, TASK-207).
import { env, exports } from "cloudflare:workers"
import { expect } from "vitest"
import { createSession } from "../../src/auth/session"
import { hashPassword } from "../../src/auth/password"
import { hotp, stepAt } from "../../src/auth/totp"

export const APP = "http://app.geraiexpress.localhost:8787"
export const OWNER = "http://owner.geraiexpress.localhost:8787"

export async function appUser(email: string) {
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
export async function adminSession() {
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

export const appPost = (path: string, cookie: string, b: unknown) => exports.default.fetch(`${APP}/api/app${path}`, { method: "POST", headers: { "content-type": "application/json", origin: APP, cookie }, body: JSON.stringify(b) })
export const ownerPost = (path: string, cookie: string, b: unknown) => exports.default.fetch(`${OWNER}/api/owner${path}`, { method: "POST", headers: { "content-type": "application/json", origin: OWNER, cookie }, body: JSON.stringify(b) })
export const ownerGet = (path: string, cookie: string) => exports.default.fetch(`${OWNER}/api/owner${path}`, { headers: { cookie } })

export function application(slug: string, sellerEmail: string) {
  return {
    slug,
    businessName: "Berkah Jaya Cell",
    contactWhatsapp: "0812-3456-7890",
    sellerEmail,
    consentMengantar: true,
    outlet: { name: "Berkah Jaya", picName: "Ani", picPhone: "081234567890", areaId: "5fc62f5df8f44b34aa4c0d8c", areaLabel: "Dago, Coblong, Kota Bandung", streetAddress: "Jl. Dago No. 1" },
  }
}

export async function submit(slug: string, sellerEmail: string) {
  const u = await appUser(`${slug}@contoh.test`)
  const r = await appPost("/onboarding/application", u.cookie, application(slug, sellerEmail))
  expect(r.status).toBe(201)
  const { tenantId } = ((await r.json()) as { data: { tenantId: string } }).data
  const app = await env.DB.prepare("SELECT id FROM tenant_applications WHERE tenant_id = ?").bind(tenantId).first<{ id: string }>()
  return { tenantId, applicationId: app!.id, user: u }
}

