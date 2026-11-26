import { env, exports } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { TENANT_SCHEMA_VERSION } from "@gx/db/tenant"
import { revertMigratingProgress } from "../../src/ops/do-migrate"
import { vaultFor } from "../../src/do/gerai-vault/stub"
import { hostCache } from "../../src/host/lookup"

const OPS = "http://owner.geraiexpress.localhost:8787/internal/ops/do-migrate"
type Page = { ok: boolean; data: { targetVersion: number; migrated: number; alreadyCurrent: number; report: string[]; nextCursor: string | null; failed: { tenantId: string; error: string } | null }; error?: { code: string; message: string } }
const call = async (body: unknown, token = "test-ops-token") =>
  (await exports.default.fetch(OPS, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) })).json<Page>()

async function seed(ids: string[], prefix: string) {
  const now = Date.now()
  for (const id of ids) {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenants (id, slug, name, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)").bind(id, `${prefix}${id}`.toLowerCase(), id, now, now),
      env.DB.prepare("INSERT INTO tenant_hostnames (hostname, tenant_id, kind, state, created_at) VALUES (?, ?, 'platform_subdomain', 'active', ?)").bind(`${prefix}${id}.geraimitra.localhost`.toLowerCase(), id, now),
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
    const r = await exports.default.fetch(OPS, { method: "POST", headers: { authorization: "Bearer wrong", "content-type": "application/json" }, body: JSON.stringify({ expectVersion: 999 }) })
    expect(r.status).toBe(401)
    expect(await r.json<Page>()).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } })
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
    expect(await status("failf-1.geraimitra.localhost")).toBe(200)
    expect(await status("failf-2.geraimitra.localhost")).toBe(503)
    expect((await vaultFor(env, "f-3").schemaState()).version).toBe(0) // batch stopped before f-3
    expect(await env.DB.prepare("SELECT state FROM tenant_schema_versions WHERE tenant_id = 'f-2'").first()).toEqual({ state: "recovery" })

    // Repair out of band, re-run: f-2 and f-3 migrate, f-2 leaves recovery.
    await runInDurableObject(vaultFor(env, "f-2"), (_i, s) => {
      s.storage.sql.exec("DROP TABLE tenant_settings")
    })
    const again = await walk({ batch: 2 })
    expect(again.every((p) => p.data.failed === null)).toBe(true)
    expect(await status("failf-2.geraimitra.localhost")).toBe(200)
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

  it("zero-downtime: healthy behind tenant auto-upgrades on first RPC and do:migrate reconciles stale D1 version", async () => {
    await seed(["z-1"], "zero")
    const stub = vaultFor(env, "z-1")
    const prev = TENANT_SCHEMA_VERSION - 1
    expect(await stub.migrate("z-1", prev)).toMatchObject({ ok: true, to: prev })
    await env.DB.prepare("INSERT INTO tenant_schema_versions (tenant_id, schema_version, state, updated_at) VALUES ('z-1', ?, 'ok', 1)").bind(prev).run()

    // Serves immediately without 503 and advances DO schema to TENANT_SCHEMA_VERSION.
    expect(await stub.allocateSlug("z-1", "draft")).toMatchObject({ ok: true })
    expect(await stub.schemaState()).toMatchObject({ version: TENANT_SCHEMA_VERSION, state: "ok" })

    // Post-deploy do:migrate sweep still updates D1 schema_version from prev -> current even though D1 state was already 'ok'.
    await walk({ batch: 50 })
    expect(await env.DB.prepare("SELECT schema_version, state FROM tenant_schema_versions WHERE tenant_id = 'z-1'").first()).toEqual({
      schema_version: TENANT_SCHEMA_VERSION,
      state: "ok",
    })
  })

  it("roll-forward only (TASK-710, DEC-254/255): a tenant DO 1 version ahead of deployed code refuses RPCs with TENANT_NOT_READY", async () => {
    await seed(["a-1"], "ahead")
    const stub = vaultFor(env, "a-1")
    expect(await stub.migrate("a-1")).toMatchObject({ ok: true })
    // Simulate a Worker rollback after this tenant DO already migrated to TENANT_SCHEMA_VERSION + 1.
    await runInDurableObject(stub, (_i, s) => {
      s.storage.sql.exec("UPDATE schema_version SET version = ? WHERE id = 1", TENANT_SCHEMA_VERSION + 1)
    })
    expect(await stub.allocateSlug("a-1", "draft")).toEqual({ ok: false, refused: "TENANT_NOT_READY" })
    expect(await stub.schemaState()).toMatchObject({ version: TENANT_SCHEMA_VERSION + 1, state: "ok" })
  })

  it("stale-isolate guard: refuses expectVersion > isolate or an ahead tenant DO with 409 STALE_ISOLATE without marking recovery in D1", async () => {
    await seed(["s-1"], "stale")
    const stub = vaultFor(env, "s-1")
    expect(await stub.migrate("s-1")).toMatchObject({ ok: true })
    await env.DB.prepare("INSERT INTO tenant_schema_versions (tenant_id, schema_version, state, updated_at) VALUES ('s-1', ?, 'ok', 1)").bind(TENANT_SCHEMA_VERSION + 1).run()
    const beforeRouting = await env.DB.prepare("SELECT routing_version FROM tenants WHERE id = 's-1'").first<{ routing_version: number }>()

    // 1. Explicit expectVersion ahead of this isolate -> immediate 409 STALE_ISOLATE before touching any tenant.
    const res1 = await exports.default.fetch(OPS, {
      method: "POST",
      headers: { authorization: "Bearer test-ops-token", "content-type": "application/json" },
      body: JSON.stringify({ batch: 25, expectVersion: TENANT_SCHEMA_VERSION + 1 }),
    })
    expect(res1.status).toBe(409)
    expect(await res1.json<Page>()).toMatchObject({ ok: false, error: { code: "STALE_ISOLATE" } })

    // 2. Even without expectVersion, encountering a DO already at TENANT_SCHEMA_VERSION + 1 returns 409 STALE_ISOLATE
    //    and leaves D1 `ok` with routing_version untouched (never flips a healthy newer-schema tenant to `recovery`).
    await runInDurableObject(stub, (_i, s) => {
      s.storage.sql.exec("UPDATE schema_version SET version = ? WHERE id = 1", TENANT_SCHEMA_VERSION + 1)
    })
    const res2 = await exports.default.fetch(OPS, {
      method: "POST",
      headers: { authorization: "Bearer test-ops-token", "content-type": "application/json" },
      body: JSON.stringify({ batch: 50 }),
    })
    expect(res2.status).toBe(409)
    expect(await res2.json<Page>()).toMatchObject({ ok: false, error: { code: "STALE_ISOLATE" } })
    expect(await env.DB.prepare("SELECT schema_version, state, last_error FROM tenant_schema_versions WHERE tenant_id = 's-1'").first()).toEqual({
      schema_version: TENANT_SCHEMA_VERSION + 1,
      state: "ok",
      last_error: null,
    })
    expect((await env.DB.prepare("SELECT routing_version FROM tenants WHERE id = 's-1'").first<{ routing_version: number }>())?.routing_version).toBe(beforeRouting!.routing_version)

    // 3. Dry run reports the ahead tenant read-only without failing and includes targetVersion.
    const dry = await call({ batch: 50, dryRun: true })
    expect(dry.ok).toBe(true)
    expect(dry.data.targetVersion).toBe(TENANT_SCHEMA_VERSION)
    expect(dry.data.report.some((l) => l.startsWith("s-1:") && l.includes("stale isolate"))).toBe(true)

    // 4. Conditional CAS revert on FORWARD_ONLY race: reverts our own `migrating` marker (preserving prior recovery/last_error
    //    or deleting a previously missing row), but NEVER clobbers a concurrent newer isolate's committed `ok(vN+1)` row.
    await seed(["cas-1", "cas-2", "cas-3"], "cas")
    await env.DB.prepare("INSERT INTO tenant_schema_versions (tenant_id, schema_version, state, last_error, updated_at) VALUES ('cas-1', 25, 'migrating', NULL, 1000)").run()
    await revertMigratingProgress(env, "cas-1", { version: 25, updatedAt: 1000 }, { version: 25, state: "recovery", lastError: "prior err" })
    expect(await env.DB.prepare("SELECT schema_version, state, last_error FROM tenant_schema_versions WHERE tenant_id = 'cas-1'").first()).toEqual({
      schema_version: 25,
      state: "recovery",
      last_error: "prior err",
    })
    await env.DB.prepare("INSERT INTO tenant_schema_versions (tenant_id, schema_version, state, last_error, updated_at) VALUES ('cas-2', 0, 'migrating', NULL, 2000)").run()
    await revertMigratingProgress(env, "cas-2", { version: 0, updatedAt: 2000 }, { version: null, state: null, lastError: null })
    expect(await env.DB.prepare("SELECT * FROM tenant_schema_versions WHERE tenant_id = 'cas-2'").first()).toBeNull()
    // Newer isolate already wrote ok(26) at updated_at=3005: stale isolate's revert for (25, 3000) must be a no-op!
    await env.DB.prepare("INSERT INTO tenant_schema_versions (tenant_id, schema_version, state, last_error, updated_at) VALUES ('cas-3', 26, 'ok', NULL, 3005)").run()
    await revertMigratingProgress(env, "cas-3", { version: 25, updatedAt: 3000 }, { version: 25, state: "recovery", lastError: "old" })
    expect(await env.DB.prepare("SELECT schema_version, state, last_error FROM tenant_schema_versions WHERE tenant_id = 'cas-3'").first()).toEqual({
      schema_version: 26,
      state: "ok",
      last_error: null,
    })
  })
})
