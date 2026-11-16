// TASK-111 host and tenant isolation suite (spec 11 §8, ADR-0002, ADR-0006) for the M1 surfaces. Later surfaces
// (API keys, webhooks, /lacak, media) extend this directory in their own tasks.
import { env, exports } from "cloudflare:workers"
import { createExecutionContext, runInDurableObject } from "cloudflare:test"
import worker from "../../src/index"
import { beforeAll, describe, expect, it } from "vitest"
import { createSession } from "../../src/auth/session"
import { hashPassword } from "../../src/auth/password"
import { vaultFor } from "../../src/do/gerai-vault/stub"
import { hostCache } from "../../src/host/lookup"
import { HostCache, classify } from "../../src/host/classify"
import { d1HostLookup, hostNames } from "../../src/host/lookup"
import { enqueueOutbox } from "../../src/do/gerai-vault/core/outbox"

const APP = "http://app.geraiexpress.localhost:8787"
const OWNER = "http://owner.geraiexpress.localhost:8787"

interface Seeded {
  tenantId: string
  slug: string
  ownerCookie: string
  ownerUserId: string
}

async function seedTenant(slug: string): Promise<Seeded> {
  const tenantId = `iso-${slug}`
  const userId = crypto.randomUUID()
  const t = Date.now()
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, email, name, password_hash, status, email_verified_at, password_changed_at, created_at, updated_at) VALUES (?1, ?2, 'Pemilik', ?3, 'active', ?4, ?4, ?4, ?4)").bind(userId, `${slug}@iso.test`, await hashPassword("iso-pass-123", env.AUTH_SESSION_PEPPER), t),
    env.DB.prepare("INSERT INTO tenants (id, slug, name, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)").bind(tenantId, slug, slug, t, t),
    env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'gerai_admin', 'active', ?)").bind(tenantId, userId, t),
    env.DB.prepare("INSERT INTO tenant_hostnames (hostname, tenant_id, kind, state, created_at) VALUES (?, ?, 'platform_subdomain', 'active', ?)").bind(`${slug}.geraimitra.localhost`, tenantId, t),
  ])
  expect(await vaultFor(env, tenantId).migrate(tenantId)).toMatchObject({ ok: true })
  const s = await createSession(env, { userId, ctx: "app", activeTenantId: tenantId, deviceHash: null, userAgent: null, now: t })
  await s.statement.run()
  return { tenantId, slug, ownerCookie: `dev_ge_app=${s.token}`, ownerUserId: userId }
}

let A: Seeded
let B: Seeded

beforeAll(async () => {
  A = await seedTenant("isoa")
  B = await seedTenant("isob")
  hostCache.clear()
})

const me = (cookie: string) => exports.default.fetch(`${APP}/api/app/auth/me`, { headers: { cookie } })

describe("sessions and cookies", () => {
  it("each session sees only its own tenant", async () => {
    expect(await (await me(A.ownerCookie)).json()).toMatchObject({ data: { membership: { tenantId: A.tenantId } } })
    expect(await (await me(B.ownerCookie)).json()).toMatchObject({ data: { membership: { tenantId: B.tenantId } } })
  })

  it("a session whose active tenant was switched to a foreign tenant gets no membership", async () => {
    const t = Date.now()
    const forged = await createSession(env, { userId: A.ownerUserId, ctx: "app", activeTenantId: B.tenantId, deviceHash: null, userAgent: null, now: t })
    await forged.statement.run()
    expect(await (await me(`dev_ge_app=${forged.token}`)).json()).toMatchObject({ data: { membership: null } })
    // And owner-only routes refuse it.
    const inv = await exports.default.fetch(`${APP}/api/app/members/invitations`, { method: "POST", headers: { cookie: `dev_ge_app=${forged.token}`, origin: APP, "content-type": "application/json" }, body: JSON.stringify({ email: "x@iso.test" }) })
    expect(inv.status).toBe(403)
  })

  it("an app cookie means nothing on owner., a tenant host, or the apex; and a request body cannot pick the tenant", async () => {
    expect((await exports.default.fetch(`${OWNER}/api/owner/auth/me`, { headers: { cookie: A.ownerCookie.replace("dev_ge_app", "dev_ge_owner") } })).status).toBe(401)
    expect((await exports.default.fetch("http://isob.geraimitra.localhost:8787/", { headers: { cookie: A.ownerCookie } })).status).toBe(200)
    expect(await (await exports.default.fetch("http://isob.geraimitra.localhost:8787/", { headers: { cookie: A.ownerCookie } })).text()).not.toContain("isoa")
    expect((await exports.default.fetch("http://geraiexpress.localhost:8787/api/app/auth/me", { headers: { cookie: A.ownerCookie } })).status).toBe(404)
    // Invitation created by A's owner lands in A even when the body names B.
    const res = await exports.default.fetch(`${APP}/api/app/members/invitations`, {
      method: "POST",
      headers: { cookie: A.ownerCookie, origin: APP, "content-type": "application/json" },
      body: JSON.stringify({ email: "kasir-iso@iso.test", tenantId: B.tenantId }),
    })
    expect(res.status).toBe(201)
    const row = await env.DB.prepare("SELECT tenant_id FROM invitations WHERE email = 'kasir-iso@iso.test'").first<{ tenant_id: string }>()
    expect(row?.tenant_id).toBe(A.tenantId)
  })
})

describe("tenant object RPC", () => {
  it("tenant A's object refuses tenant B's id, and data never crosses objects", async () => {
    expect(await vaultFor(env, A.tenantId).slugExists(B.tenantId, "8k4m2p7")).toEqual({ ok: false, refused: "TENANT_MISMATCH" })
    expect(await vaultFor(env, A.tenantId).migrate(B.tenantId)).toEqual({ ok: false, refused: "TENANT_MISMATCH" })
    const r = await vaultFor(env, A.tenantId).allocateSlug(A.tenantId, "draft")
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(await vaultFor(env, B.tenantId).slugExists(B.tenantId, r.value)).toEqual({ ok: true, value: false })
  })

  it("D1 rows pushed by an object carry that object's tenant id only", async () => {
    await runInDurableObject(vaultFor(env, A.tenantId), (_i, s) => {
      enqueueOutbox(s.storage.sql, "shipment_index", "aaaaaaa", 1, { status: "draft", created_at: 1, updated_at: 1 }, 0)
    })
    await vaultFor(env, A.tenantId).flushOutbox()
    const rows = (await env.DB.prepare("SELECT tenant_id FROM shipment_index WHERE slug = 'aaaaaaa'").all<{ tenant_id: string }>()).results
    expect(rows).toEqual([{ tenant_id: A.tenantId }])
  })
})

describe("mini-site host lookup", () => {
  it("each tenant host resolves to its own tenant only; unknown hosts are neutral", async () => {
    const cache = new HostCache()
    const names = hostNames(env)
    const ra = await classify(new Request("http://isoa.geraimitra.localhost/"), names, d1HostLookup(env.DB), cache)
    const rb = await classify(new Request("http://isob.geraimitra.localhost/"), names, d1HostLookup(env.DB), cache)
    expect(ra).toMatchObject({ outcome: "ok", ctx: { tenantId: A.tenantId } })
    expect(rb).toMatchObject({ outcome: "ok", ctx: { tenantId: B.tenantId } })
    expect(await classify(new Request("http://isoc.geraimitra.localhost/"), names, d1HostLookup(env.DB), cache)).toEqual({ outcome: "not_found" })
  })

  it("KV is never consulted for host → tenant", async () => {
    const poisoned = { ...env, CACHE_KV: { get: () => Promise.reject(new Error("KV must not be read for routing")) } as unknown as KVNamespace }
    hostCache.clear()
    const r = await worker.fetch!(new Request("http://isoa.geraimitra.localhost:8787/") as Request<unknown, IncomingRequestCfProperties>, poisoned as Env, createExecutionContext())
    expect(r.status).toBe(200)
  })

  it("a suspended tenant answers 403 within the 30 s isolate cache window", async () => {
    const cache = new HostCache()
    const names = hostNames(env)
    const t0 = 5_000_000
    expect(await classify(new Request("http://isob.geraimitra.localhost/"), names, d1HostLookup(env.DB), cache, t0)).toMatchObject({ outcome: "ok" })
    await env.DB.prepare("UPDATE tenants SET status = 'suspended', routing_version = routing_version + 1 WHERE id = ?").bind(B.tenantId).run()
    expect(await classify(new Request("http://isob.geraimitra.localhost/"), names, d1HostLookup(env.DB), cache, t0 + 29_000)).toMatchObject({ outcome: "ok" })
    expect(await classify(new Request("http://isob.geraimitra.localhost/"), names, d1HostLookup(env.DB), cache, t0 + 30_000)).toEqual({ outcome: "suspended" })
    // A suspended tenant's members lose access to their workspace API too.
    expect(await (await me(B.ownerCookie)).json()).toMatchObject({ data: { membership: null } })
    await env.DB.prepare("UPDATE tenants SET status = 'active' WHERE id = ?").bind(B.tenantId).run()
  })
})
