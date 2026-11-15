// Shared fixtures for webhook tests (TASK-204).
import { env, exports } from "cloudflare:workers"
import { expect } from "vitest"
import { createSession } from "../../src/auth/session"
import { hashPassword } from "../../src/auth/password"
import { hmacSha256Hex } from "../../src/crypto"
import { vaultFor } from "../../src/do/gerai-vault/stub"

export const APP = "http://app.geraiexpress.localhost:8787"
export const WEBHOOK_TEST_VALUE = "contoh-webhook-uji"
export const appGet = (path: string, cookie: string) => exports.default.fetch(`${APP}/api/app${path}`, { headers: { cookie } })
export const appPost = (path: string, cookie: string, b: unknown) => exports.default.fetch(`${APP}/api/app${path}`, { method: "POST", headers: { "content-type": "application/json", origin: APP, cookie }, body: JSON.stringify(b) })

export async function seedConnected(slug: string, opts: { role?: "gerai_admin" | "cashier"; environment?: "sandbox" | "production" } = {}) {
  const tenantId = `wh-${slug}`
  const userId = crypto.randomUUID()
  const t = Date.now()
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, email, name, password_hash, status, email_verified_at, password_changed_at, created_at, updated_at) VALUES (?1, ?2, 'Pemilik', ?3, 'active', ?4, ?4, ?4, ?4)").bind(userId, `${slug}@wh.test`, await hashPassword("wh-pass-12345", env.AUTH_SESSION_PEPPER), t),
    env.DB.prepare("INSERT INTO tenants (id, slug, name, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)").bind(tenantId, slug, slug, t, t),
    env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, ?, 'active', ?)").bind(tenantId, userId, opts.role ?? "gerai_admin", t),
  ])
  const vault = vaultFor(env, tenantId)
  expect(await vault.migrate(tenantId)).toMatchObject({ ok: true })
  expect(await vault.recordOnboarding(tenantId, { environment: opts.environment ?? "sandbox", state: "connected", sellerId: "seller-1", externalUserId: tenantId, apiKey: `KEY-${slug}` })).toMatchObject({ ok: true })
  const s = await createSession(env, { userId, ctx: "app", activeTenantId: tenantId, deviceHash: null, userAgent: null, now: t })
  await s.statement.run()
  return { tenantId, cookie: `dev_ge_app=${s.token}`, vault, userId }
}


/** Settings GET creates the URL; POST stores the secret. Returns the token from the URL. */
export async function configureWebhook(cookie: string, secret = WEBHOOK_TEST_VALUE): Promise<{ url: string; token: string }> {
  const r = (await (await appGet("/settings/mengantar", cookie)).json()) as { data: { webhookUrl: string } }
  expect(r.data.webhookUrl).toMatch(/^http:\/\/hooks\.geraiexpress\.localhost:8787\/webhooks\/mengantar\/[A-Za-z0-9_-]{43}$/)
  expect((await appPost("/settings/mengantar/webhook-secret", cookie, { secret })).status).toBe(200)
  return { url: r.data.webhookUrl, token: r.data.webhookUrl.split("/").pop()! }
}

export async function deliver(url: string, body: Record<string, unknown>, opts: { secret?: string; ts?: number; env?: string } = {}) {
  const raw = JSON.stringify(body)
  const ts = String(opts.ts ?? Date.now())
  const sig = await hmacSha256Hex(opts.secret ?? WEBHOOK_TEST_VALUE, `${ts}.${raw}`)
  return exports.default.fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-timestamp": ts, "x-signature": sig, ...(opts.env ? { "x-environment": opts.env } : {}) }, body: raw })
}

