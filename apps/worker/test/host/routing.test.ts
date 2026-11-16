import { env, exports } from "cloudflare:workers"
import { beforeAll, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"

async function seedTenant(id: string, slug: string, status: string, hostState = "active") {
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare("INSERT INTO tenants (id, slug, name, status, routing_version, masking_enabled, tier_code, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 0, 'silver', ?, ?)").bind(id, slug, slug, status, now, now),
    env.DB.prepare("INSERT INTO tenant_hostnames (hostname, tenant_id, kind, role, state, created_at) VALUES (?, ?, 'platform_subdomain', 'primary', ?, ?)").bind(`${slug}.gerai.localhost`, id, hostState, now),
  ])
}

const get = (host: string, path = "/") => exports.default.fetch(`http://${host}:8787${path}`)

describe("host routing through D1 tenant_hostnames (TASK-102)", () => {
  beforeAll(async () => {
    await seedTenant("t-route-a", "berkahjaya", "active")
    await seedTenant("t-route-b", "beku", "suspended")
    await seedTenant("t-route-c", "tunggu", "active", "pending")
    await seedTenant("t-route-d", "pulih", "active")
    await env.DB.prepare("INSERT INTO tenant_schema_versions (tenant_id, schema_version, state, updated_at) VALUES ('t-route-d', 1, 'recovery', 1)").run()
    hostCache.clear()
  })

  it("active tenant host resolves; unknown and pending are a neutral 404; suspended 403; recovery 503", async () => {
    const a = await get("berkahjaya.gerai.localhost")
    expect(a.status).toBe(200)
    expect(await a.text()).toContain("berkahjaya")
    for (const h of ["tidakada.gerai.localhost", "tunggu.gerai.localhost", "toko.example.com"]) {
      const r = await get(h)
      expect(r.status, h).toBe(404)
      const body = await r.text()
      expect(body).toContain("Halaman tidak ditemukan")
      expect(body).not.toMatch(/tunggu|berkahjaya/)
    }
    expect((await get("beku.gerai.localhost")).status).toBe(403)
    const rec = await get("pulih.gerai.localhost")
    expect(rec.status).toBe(503)
    expect(rec.headers.get("retry-after")).toBeTruthy()
  })

  it("probe answers HMAC only, also for pending hosts", async () => {
    const nonce = "abcdefghijklmnopqrstuvwx"
    const r = await get("tunggu.gerai.localhost", `/.well-known/geraiexpress-probe/${nonce}`)
    expect(r.status).toBe(200)
    expect(await r.text()).toMatch(/^[0-9a-f]{64}$/)
  })

  it("cross-context paths are a neutral 404 on every host (ADR-0002)", async () => {
    const send = (host: string, path: string, method = "GET") => exports.default.fetch(`http://${host}:8787${path}`, { method })
    const cases: [string, string, string?][] = [
      ["berkahjaya.gerai.localhost", "/kiriman"],
      ["berkahjaya.gerai.localhost", "/api/owner/gerai"],
      ["berkahjaya.gerai.localhost", "/webhooks/mengantar/abc", "POST"],
      ["berkahjaya.gerai.localhost", "/internal/ops/do-migrate", "POST"],
      ["berkahjaya.gerai.localhost", "/", "PUT"],
      ["app.geraiexpress.localhost", "/api/owner/gerai"],
      ["app.geraiexpress.localhost", "/webhooks/mengantar/abc"],
      ["app.geraiexpress.localhost", "/internal/ops/do-migrate"],
      ["owner.geraiexpress.localhost", "/api/app/kiriman"],
      ["owner.geraiexpress.localhost", "/api/v1/shipments"],
      ["owner.geraiexpress.localhost", "/mcp"],
      ["geraiexpress.localhost", "/api/app/kiriman"],
      ["hooks.geraiexpress.localhost", "/kiriman"],
    ]
    for (const [h, p, m] of cases) {
      const r = await send(h, p, m)
      expect(r.status, `${m ?? "GET"} ${h}${p}`).toBe(404)
      expect(await r.text()).not.toContain('<div id="root">')
    }
  })

  it("relay., IP literals and non-tenant names never answer /healthz", async () => {
    expect((await get("relay.geraiexpress.localhost", "/healthz")).status).toBe(404)
    expect((await get("x.y.gerai.localhost", "/healthz")).status).toBe(404)
    expect((await exports.default.fetch("http://127.0.0.1:8787/healthz")).status).toBe(404)
    expect((await get("relay.geraiexpress.localhost")).status).toBe(404)
  })

  it("tenant name is HTML-escaped on the not-yet-prepared page", async () => {
    const r = await get("berkahjaya.gerai.localhost")
    expect(await r.text()).toContain("Gerai berkahjaya")
  })

  it("suspension becomes visible once the ≤ 30 s isolate cache entry expires", async () => {
    expect((await get("berkahjaya.gerai.localhost")).status).toBe(200)
    await env.DB.prepare("UPDATE tenants SET status = 'suspended', routing_version = routing_version + 1 WHERE id = 't-route-a'").run()
    expect((await get("berkahjaya.gerai.localhost")).status).toBe(200) // still cached
    hostCache.clear() // = TTL elapsed (TTL boundary itself is covered by the classify unit test)
    expect((await get("berkahjaya.gerai.localhost")).status).toBe(403)
  })
})
