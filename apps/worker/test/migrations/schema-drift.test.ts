import { env } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core"
import { describe, expect, it } from "vitest"
import * as control from "@gx/db/schema/control"
import * as tenant from "@gx/db/schema/tenant"
import { vaultFor } from "../../src/do/gerai-vault/stub"

// Drizzle schemas and the forward-only SQL migrations must describe the same tables, columns, nullability and
// presence of defaults — in both directions (spec 07 §1: Drizzle sqlite-core for both tracks).
type Col = { name: string; notnull: number; pk: number; dflt_value: string | null }
const INTERNAL = new Set(["d1_migrations", "_cf_KV", "_cf_METADATA", "schema_version", "vault_identity"])

function drizzleShape(t: SQLiteTable) {
  return Object.fromEntries(getTableConfig(t).columns.map((c) => [c.name, { notNull: c.notNull || c.primary, hasDefault: c.hasDefault && !c.primary }]))
}
function sqlShape(cols: Col[]) {
  return Object.fromEntries(cols.map((c) => [c.name, { notNull: c.notnull === 1 || c.pk === 1, hasDefault: c.dflt_value !== null }]))
}
const tablesOf = (mod: Record<string, unknown>) => Object.values(mod).filter((t): t is SQLiteTable => t instanceof SQLiteTable)

describe("control track (D1) ⇄ Drizzle", () => {
  it("every Drizzle table matches D1 column-for-column, and every D1 table has a Drizzle definition", async () => {
    const d1Tables = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all<{ name: string }>()).results
      .map((r) => r.name)
      .filter((n) => !INTERNAL.has(n))
    const defs = tablesOf(control)
    expect(defs.map((t) => getTableConfig(t).name).sort()).toEqual(d1Tables.sort())
    for (const t of defs) {
      const name = getTableConfig(t).name
      const cols = (await env.DB.prepare(`PRAGMA table_info(${name})`).all<Col>()).results
      expect(drizzleShape(t), name).toEqual(sqlShape(cols))
    }
  })
})

describe("tenant track (GeraiVaultDO) ⇄ Drizzle", () => {
  it("every Drizzle tenant table matches a freshly migrated object, both directions", async () => {
    const stub = vaultFor(env, "drift-tenant")
    expect(await stub.migrate("drift-tenant")).toMatchObject({ ok: true })
    await runInDurableObject(stub, (_i, state) => {
      const sqlTables = state.storage.sql
        .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .toArray()
        .map((r) => r.name)
        .filter((n) => !INTERNAL.has(n))
      const defs = tablesOf(tenant)
      expect(defs.map((t) => getTableConfig(t).name).sort()).toEqual(sqlTables.sort())
      for (const t of defs) {
        const name = getTableConfig(t).name
        const cols = state.storage.sql.exec<Col>(`PRAGMA table_info(${name})`).toArray()
        expect(drizzleShape(t), name).toEqual(sqlShape(cols))
      }
    })
  })
})
