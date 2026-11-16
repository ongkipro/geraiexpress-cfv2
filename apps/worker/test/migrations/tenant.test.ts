import { env } from "cloudflare:workers"
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { TENANT_MIGRATIONS, TENANT_SCHEMA_VERSION } from "@gx/db/tenant"
import { applyTenantMigrations, readSchemaState } from "../../src/do/gerai-vault/core/migrate"
import { enqueueOutbox } from "../../src/do/gerai-vault/core/outbox"
import type { GeraiVaultDO } from "../../src/do/gerai-vault"
import { vaultFor } from "../../src/do/gerai-vault/stub"

const vault = (tenantId: string) => vaultFor(env, tenantId)

function tables(state: DurableObjectState): string[] {
  return state.storage.sql
    .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name")
    .toArray()
    .map((r) => r.name)
}

describe("GeraiVaultDO storage foundation (TASK-103, ADR-0006)", () => {
  it("two tenant objects migrate to the current version and stay isolated", async () => {
    const a = vault("tenant-a")
    const b = vault("tenant-b")
    expect(await a.migrate("tenant-a")).toMatchObject({ ok: true, to: TENANT_SCHEMA_VERSION })
    expect(await b.migrate("tenant-b")).toMatchObject({ ok: true, to: TENANT_SCHEMA_VERSION })
    await runInDurableObject(a, (_i: GeraiVaultDO, s) => {
      s.storage.sql.exec("INSERT INTO tenant_outlets (id, tenant_id, name, is_default, created_at, updated_at) VALUES ('o1', 'tenant-a', 'Berkah Jaya', 1, 1, 1)")
      expect(tables(s)).toEqual(expect.arrayContaining(["audit_logs", "outbox", "schema_version", "tenant_business_profiles", "tenant_outlets", "tenant_settings"]))
    })
    await runInDurableObject(b, (_i: GeraiVaultDO, s) => {
      expect(s.storage.sql.exec("SELECT COUNT(*) AS n FROM tenant_outlets").one().n).toBe(0)
    })
  })

  it("rejects an empty tenant id and an unknown target without writing anything", async () => {
    const a = vault("tenant-empty")
    expect(await a.migrate("")).toEqual({ ok: false, refused: "TENANT_MISMATCH" })
    expect(await a.migrate("tenant-empty", 99)).toEqual({ ok: false, refused: "UNKNOWN_TARGET" })
    expect(await a.schemaState()).toMatchObject({ version: 0, tenantId: null })
  })

  it("an object bound to one tenant refuses another tenant id", async () => {
    const a = vault("tenant-bind")
    await a.migrate("tenant-bind")
    expect(await a.migrate("tenant-other")).toEqual({ ok: false, refused: "TENANT_MISMATCH" })
    expect((await a.schemaState()).tenantId).toBe("tenant-bind")
  })

  it("migrate is idempotent and forward-only", async () => {
    const a = vault("tenant-idem")
    await a.migrate("tenant-idem")
    expect(await a.migrate("tenant-idem")).toMatchObject({ ok: true, applied: [] })
    expect(await a.migrate("tenant-idem", 0)).toEqual({ ok: false, refused: "FORWARD_ONLY" })
    expect(await a.migrate("tenant-idem", 99)).toEqual({ ok: false, refused: "UNKNOWN_TARGET" })
  })

  it("an object already at v21 (shipped 0021) upgrades to the current version with the rescan columns and cap ledger (Sol R2 #4)", async () => {
    const stub = vault("tenant-v21")
    expect(await stub.migrate("tenant-v21", 21)).toMatchObject({ ok: true, to: 21 })
    await runInDurableObject(stub, (_i: GeraiVaultDO, s) => {
      const cols = s.storage.sql.exec<{ name: string }>("PRAGMA table_info(finance_sync_state)").toArray().map((c) => c.name)
      expect(cols).toContain("backfill_cursor")
      expect(cols).not.toContain("rescan_cursor")
    })
    expect(await stub.migrate("tenant-v21")).toMatchObject({ ok: true, to: TENANT_SCHEMA_VERSION })
    await runInDurableObject(stub, (_i: GeraiVaultDO, s) => {
      const cols = s.storage.sql.exec<{ name: string }>("PRAGMA table_info(finance_sync_state)").toArray().map((c) => c.name)
      expect(cols).toEqual(expect.arrayContaining(["rescan_cursor", "rescan_range"]))
      expect(tables(s)).toContain("api_key_spend")
    })
  })

  it("N−1 → N upgrade keeps data", async () => {
    const stub = vault("tenant-upgrade")
    await runInDurableObject(stub, (_i: GeraiVaultDO, s) => {
      const list = [...TENANT_MIGRATIONS, { version: TENANT_MIGRATIONS.length + 1, name: "test_add_column", sql: "ALTER TABLE tenant_outlets ADD COLUMN test_note TEXT" }]
      expect(applyTenantMigrations(s.storage, list, TENANT_MIGRATIONS.length)).toMatchObject({ ok: true })
      s.storage.sql.exec("INSERT INTO tenant_outlets (id, tenant_id, name, is_default, created_at, updated_at) VALUES ('o1', 't', 'Lama', 1, 1, 1)")
      expect(applyTenantMigrations(s.storage, list, list.length)).toMatchObject({ ok: true, applied: [list.length] })
      expect(s.storage.sql.exec("SELECT name, test_note FROM tenant_outlets").one()).toEqual({ name: "Lama", test_note: null })
      expect(readSchemaState(s.storage)).toMatchObject({ version: list.length, state: "ok" })
    })
  })

  it("a failing step rolls back alone and puts only that object in recovery", async () => {
    const bad = vault("tenant-broken")
    const good = vault("tenant-fine")
    await good.migrate("tenant-fine")
    await runInDurableObject(bad, (_i: GeraiVaultDO, s) => {
      const list = [...TENANT_MIGRATIONS, { version: TENANT_MIGRATIONS.length + 1, name: "boom", sql: "CREATE TABLE half (id INTEGER); INSERT INTO nope VALUES (1)" }]
      const r = applyTenantMigrations(s.storage, list, list.length)
      expect(r).toMatchObject({ ok: false, failedVersion: list.length, to: TENANT_MIGRATIONS.length })
      expect(readSchemaState(s.storage)).toMatchObject({ version: TENANT_MIGRATIONS.length, state: "recovery" })
      expect(tables(s)).not.toContain("half") // the failing step's partial DDL rolled back
    })
    expect((await good.schemaState()).state).toBe("ok")
  })

  it("outbox: lost acknowledgement + retry leaves D1 unchanged; stale versions never overwrite", async () => {
    const stub = vault("tenant-outbox")
    await stub.migrate("tenant-outbox")
    await runInDurableObject(stub, (_i: GeraiVaultDO, s) => {
      enqueueOutbox(s.storage.sql, "shipment_index", "8k4m2p7", 2, { status: "in_transit", awb_number: "JX1", courier_code: "jnt", created_at: 10, updated_at: 20 }, 0)
    })
    expect(await stub.flushOutbox(1)).toEqual({ delivered: 1, failed: 0 })
    // Simulate a lost acknowledgement: the same row is delivered again, and an older version arrives late.
    await runInDurableObject(stub, (_i: GeraiVaultDO, s) => {
      enqueueOutbox(s.storage.sql, "shipment_index", "8k4m2p7", 2, { status: "in_transit", awb_number: "JX1", courier_code: "jnt", created_at: 10, updated_at: 20 }, 0)
      enqueueOutbox(s.storage.sql, "shipment_index", "8k4m2p7", 1, { status: "ready_for_pickup", awb_number: null, courier_code: "jnt", created_at: 10, updated_at: 15 }, 0)
    })
    expect(await stub.flushOutbox(2)).toEqual({ delivered: 2, failed: 0 })
    const row = await env.DB.prepare("SELECT status, awb_number, version FROM shipment_index WHERE tenant_id = ? AND slug = ?").bind("tenant-outbox", "8k4m2p7").first()
    expect(row).toEqual({ status: "in_transit", awb_number: "JX1", version: 2 })
  })

  it("outbox: flush on an unmigrated object is a no-op", async () => {
    expect(await vault("tenant-unmigrated").flushOutbox()).toEqual({ delivered: 0, failed: 0 })
  })

  it("outbox: concurrent flushes deliver each row once", async () => {
    const stub = vault("tenant-concurrent")
    await stub.migrate("tenant-concurrent")
    await runInDurableObject(stub, (_i: GeraiVaultDO, s) => {
      for (let i = 1; i <= 5; i++) enqueueOutbox(s.storage.sql, "shipment_index", `slug00${i}`, 1, { status: "draft", created_at: 1, updated_at: 1 }, 0)
    })
    const [a, b] = await Promise.all([stub.flushOutbox(1), stub.flushOutbox(1)])
    // Either the second call joined the in-flight flush (same result) or ran after it and found nothing due.
    const joined = a.delivered === 5 && b.delivered === 5
    const serial = a.delivered + b.delivered === 5 && a.failed + b.failed === 0
    expect(joined || serial, JSON.stringify({ a, b })).toBe(true)
    await runInDurableObject(stub, (_i: GeraiVaultDO, s) => {
      expect(s.storage.sql.exec("SELECT COUNT(*) AS n FROM outbox").one().n).toBe(0)
    })
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM shipment_index WHERE tenant_id = 'tenant-concurrent'").first<{ n: number }>())?.n).toBe(5)
  })

  it("outbox: a D1 failure backs off and the alarm retries until delivered", async () => {
    const stub = vault("tenant-retry")
    await stub.migrate("tenant-retry")
    await runInDurableObject(stub, (_i: GeraiVaultDO, s) => {
      // payload missing NOT NULL `status` → D1 rejects the first attempt
      enqueueOutbox(s.storage.sql, "shipment_index", "aaaaaaa", 1, { created_at: 1, updated_at: 1 }, 0)
    })
    const t = Date.now()
    // A D1 failure that never returns must not strand the row: the safety alarm is armed before D1 is awaited.
    expect(await stub.flushOutbox(t)).toEqual({ delivered: 0, failed: 1 })
    await runInDurableObject(stub, async (_i: GeraiVaultDO, s) => {
      const r = s.storage.sql.exec<{ attempts: number; next_attempt_at: number }>("SELECT attempts, next_attempt_at FROM outbox").one()
      expect(r).toEqual({ attempts: 1, next_attempt_at: t + 10_000 })
      expect(await s.storage.getAlarm()).toBe(t + 10_000)
      s.storage.sql.exec("UPDATE outbox SET payload_json = ?, next_attempt_at = 0", JSON.stringify({ status: "draft", created_at: 1, updated_at: 1 }))
    })
    expect(await runDurableObjectAlarm(stub)).toBe(true)
    expect(await env.DB.prepare("SELECT status FROM shipment_index WHERE tenant_id = 'tenant-retry'").first()).toEqual({ status: "draft" })
    await runInDurableObject(stub, (_i: GeraiVaultDO, s) => {
      expect(s.storage.sql.exec("SELECT COUNT(*) AS n FROM outbox").one().n).toBe(0)
    })
  })
})
