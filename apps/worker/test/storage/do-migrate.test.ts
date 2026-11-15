import { env, exports } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { TENANT_SCHEMA_VERSION } from "@gx/db/tenant"
import { vaultFor } from "../../src/do/gerai-vault/stub"
import { hostCache } from "../../src/host/lookup"

const OPS = "http://owner.geraiexpress.localhost:8787/internal/ops/do-migrate"
type Page = { ok: boolean; data: { migrated: number; alreadyCurrent: number; report: string[]; nextCursor: string | null; failed: { tenantId: string; error: string } | null } }
const call = async (body: unknown, token = "test-ops-token") =>
  (await exports.default.fetch(OPS, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) })).json<Page>()

async function seed(ids: string[], prefix: string) {
  const now = Date.now()
  for (const id of ids) {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenants (id, slug, name, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)").bind(id, `${prefix}${id}`.toLowerCase(), id, now, now),
      env.DB.prepare("INSERT INTO tenant_hostnames (hostname, tenant_id, kind, state, created_at) VALUES (?, ?, 'platform_subdomain', 'active', ?)").bind(`${prefix}${id}.gerai.localhost`.toLowerCase(), id, now),
    ])
  }
}

async function walk(body: Record<string, unknown>) {
  let cursor: string | null = null
  const pages: Page[] = []
  for (let i = 0; i < 20; i++) {
    const p = await call({ ...body, cursor })
    pages.push(p)
    if (p.data.failed || !p.data.nextCursor) break
    cursor = p.data.nextCursor
  }
  return pages
}

const status = async (host: string) => {
  hostCache.clear()
  return (await exports.default.fetch(`http://${host}:8787/`)).status
}

describe("do:migrate ops endpoint (TASK-103, spec 07 §6)", () => {
  it("refuses without the ops token and on other hosts", async () => {
    const r = await exports.default.fetch(OPS, { method: "POST", headers: { authorization: "Bearer wrong" } })
    expect(r.status).toBe(401)
    const other = await exports.default.fetch("http://app.geraiexpress.localhost:8787/internal/ops/do-migrate", { method: "POST", headers: { authorization: "Bearer test-ops-token" } })
    expect(other.status).toBe(404)
  })

  it("dry run writes nothing — neither D1 nor object storage", async () => {
    await seed(["d-1", "d-2"], "dry")
    const pages = await walk({ dryRun: true, batch: 50 })
    expect(pages.flatMap((p) => p.data.report).filter((l) => l.startsWith("d-"))).toHaveLength(2)
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM tenant_schema_versions WHERE tenant_id LIKE 'd-%'").first<{ n: number }>())?.n).toBe(0)
    await runInDurableObject(vaultFor(env, "d-1"), (_i, s) => {
      expect(s.storage.sql.exec("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%'").one().n).toBe(0)
    })
  })

  it("migrates in batches, stops at the first failure (that tenant 503, others serving), and recovers after repair", async () => {
    await seed(["f-1", "f-2", "f-3"], "fail")
    // f-2: a conflicting table makes its baseline migration fail inside the object.
    await runInDurableObject(vaultFor(env, "f-2"), (_i, s) => {
      s.storage.sql.exec("CREATE TABLE tenant_settings (x INTEGER)")
    })
    const pages = await walk({ batch: 1 })
    const failed = pages.at(-1)!.data.failed
    expect(failed?.tenantId).toBe("f-2")
    expect(await status("failf-1.gerai.localhost")).toBe(200)
    expect(await status("failf-2.gerai.localhost")).toBe(503)
    expect((await vaultFor(env, "f-3").schemaState()).version).toBe(0) // batch stopped before f-3
    expect(await env.DB.prepare("SELECT state FROM tenant_schema_versions WHERE tenant_id = 'f-2'").first()).toEqual({ state: "recovery" })

    // Repair out of band, re-run: f-2 and f-3 migrate, f-2 leaves recovery.
    await runInDurableObject(vaultFor(env, "f-2"), (_i, s) => {
      s.storage.sql.exec("DROP TABLE tenant_settings")
    })
    const again = await walk({ batch: 2 })
    expect(again.every((p) => p.data.failed === null)).toBe(true)
    expect(await status("failf-2.gerai.localhost")).toBe(200)
    for (const id of ["f-1", "f-2", "f-3"]) {
      expect(await vaultFor(env, id).schemaState()).toMatchObject({ version: TENANT_SCHEMA_VERSION, state: "ok", tenantId: id })
    }
    const rows = (await env.DB.prepare("SELECT tenant_id, state FROM tenant_schema_versions WHERE tenant_id LIKE 'f-%' ORDER BY tenant_id").all()).results
    expect(rows).toEqual(["f-1", "f-2", "f-3"].map((tenant_id) => ({ tenant_id, state: "ok" })))
  })

  it("reconciles D1 when the object is current but D1 progress was left behind", async () => {
    await seed(["r-1"], "rec")
    expect(await vaultFor(env, "r-1").migrate("r-1")).toMatchObject({ ok: true })
    await env.DB.prepare("INSERT INTO tenant_schema_versions (tenant_id, schema_version, state, updated_at) VALUES ('r-1', 0, 'migrating', 1)").run()
    const before = await env.DB.prepare("SELECT routing_version FROM tenants WHERE id = 'r-1'").first<{ routing_version: number }>()
    await walk({ batch: 50 })
    expect(await env.DB.prepare("SELECT schema_version, state FROM tenant_schema_versions WHERE tenant_id = 'r-1'").first()).toEqual({ schema_version: TENANT_SCHEMA_VERSION, state: "ok" })
    expect((await env.DB.prepare("SELECT routing_version FROM tenants WHERE id = 'r-1'").first<{ routing_version: number }>())?.routing_version).toBe(before!.routing_version)
  })
})
