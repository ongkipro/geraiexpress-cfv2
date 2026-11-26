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

  it("an object at v23 (shipped 0023) upgrades to v24 with the QRIS column and paired-display sessions, outlet kept (TASK-701)", async () => {
    const stub = vault("tenant-v23")
    expect(await stub.migrate("tenant-v23", 23)).toMatchObject({ ok: true, to: 23 })
    await runInDurableObject(stub, (_i: GeraiVaultDO, s) => {
      s.storage.sql.exec("INSERT INTO tenant_outlets (id, tenant_id, name, is_default, created_at, updated_at) VALUES ('o1', 'tenant-v23', 'Gerai Lama', 1, 1, 1)")
      s.storage.sql.exec("INSERT INTO media_objects (id, tenant_id, r2_key, purpose, content_type, size_bytes, uploaded_by, created_at) VALUES ('m1', 'tenant-v23', 't/tenant-v23/logo/m1.png', 'logo', 'image/png', 8, 'u', 1)")
      expect(() => s.storage.sql.exec("INSERT INTO media_objects (id, tenant_id, r2_key, purpose, content_type, size_bytes, uploaded_by, created_at) VALUES ('m2', 'tenant-v23', 't/tenant-v23/qris/m2.png', 'qris', 'image/png', 8, 'u', 1)")).toThrow()
      expect(tables(s)).not.toContain("customer_display_sessions")
    })
    expect(await stub.migrate("tenant-v23")).toMatchObject({ ok: true, to: TENANT_SCHEMA_VERSION })
    await runInDurableObject(stub, (_i: GeraiVaultDO, s) => {
      expect(tables(s)).toContain("customer_display_sessions")
      expect(s.storage.sql.exec<{ name: string; qris_media_id: string | null }>("SELECT name, qris_media_id FROM tenant_outlets").toArray()).toEqual([{ name: "Gerai Lama", qris_media_id: null }])
      // media_objects was rebuilt for the 'qris' purpose: existing rows kept, the new purpose accepted, others still refused.
      expect(s.storage.sql.exec<{ id: string; r2_key: string }>("SELECT id, r2_key FROM media_objects").toArray()).toEqual([{ id: "m1", r2_key: "t/tenant-v23/logo/m1.png" }])
      s.storage.sql.exec("INSERT INTO media_objects (id, tenant_id, r2_key, purpose, content_type, size_bytes, uploaded_by, created_at) VALUES ('m2', 'tenant-v23', 't/tenant-v23/qris/m2.png', 'qris', 'image/png', 8, 'u', 1)")
      expect(() => s.storage.sql.exec("INSERT INTO media_objects (id, tenant_id, r2_key, purpose, content_type, size_bytes, uploaded_by, created_at) VALUES ('m3', 'tenant-v23', 't/tenant-v23/x/m3.png', 'lain', 'image/png', 8, 'u', 1)")).toThrow()
      // Only a 64-hex SHA-256 fits the token column (a raw 43-char token is refused by the CHECK).
      expect(() => s.storage.sql.exec("INSERT INTO customer_display_sessions (id, token_hash, created_by_user_id, state_json, state_updated_at, created_at, expires_at) VALUES ('d1', 'raw-token-not-a-hash', 'u', '{}', 1, 1, 2)")).toThrow()
    })
  })

  it("an object at v25 upgrades to v26 normalizing pre-fix invoice signs, float balanceAmount from raw_json, and legacy rescan_range (TASK-604)", async () => {
    const stub = vault("tenant-v25")
    expect(await stub.migrate("tenant-v25", 25)).toMatchObject({ ok: true, to: 25 })
    await runInDurableObject(stub, (_i: GeraiVaultDO, s) => {
      s.storage.sql.exec(
        `INSERT INTO mengantar_invoice_mirror (invoice_id, type, status, amount_idr, total_idr, balance_amount_idr, raw_json, link_state, first_seen_at, last_seen_at) VALUES
         ('m1', 'typeAddBalance', 'statusCleared', 95787, 96610, NULL, '{"balanceAmount":96610.6478313487}', 'not_applicable', 1, 1),
         ('m2', 'typePayment',    'statusCleared', 10500, 10500, NULL, '{"balanceAmount":86110.6478313487}', 'linked',         2, 2),
         ('m3', 'typeRefund',     'statusCleared', -36999, -36999, NULL, '{"balanceAmount":-0.3521686513}',  'linked',         3, 3),
         ('m4', 'typeWithdraw',   'statusCleared', 20000, 20000, 50000, '{}',                                'not_applicable', 4, 4)`,
      )
      s.storage.sql.exec("UPDATE finance_sync_state SET rescan_cursor = '50', rescan_range = ? WHERE id = 1", JSON.stringify({ startDate: "2026-10-07", endDate: "2026-10-07" }))
    })
    expect(await stub.migrate("tenant-v25")).toMatchObject({ ok: true, to: TENANT_SCHEMA_VERSION })
    await runInDurableObject(stub, (_i: GeraiVaultDO, s) => {
      const rows = s.storage.sql.exec<{ invoice_id: string; amount_idr: number; balance_amount_idr: number | null }>("SELECT invoice_id, amount_idr, balance_amount_idr FROM mengantar_invoice_mirror ORDER BY invoice_id").toArray()
      expect(rows).toEqual([
        { invoice_id: "m1", amount_idr: 96610, balance_amount_idr: 96611 },
        { invoice_id: "m2", amount_idr: -10500, balance_amount_idr: 86111 },
        { invoice_id: "m3", amount_idr: 36999, balance_amount_idr: 0 },
        { invoice_id: "m4", amount_idr: -20000, balance_amount_idr: 50000 },
      ])
      expect(s.storage.sql.exec<{ rescan_cursor: string | null; rescan_range: string | null }>("SELECT rescan_cursor, rescan_range FROM finance_sync_state WHERE id = 1").one()).toEqual({ rescan_cursor: null, rescan_range: null })
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
