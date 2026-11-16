// Sol round 3 #4: control 0017 retires the D1 API-key spend tables only when nothing live would be lost. It runs here
// against a scratch Durable Object SQLite (same SQL dialect as D1) with the pre-0017 tables populated.
import { env } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import m0017 from "../../../../packages/db/migrations/control/0017_retire_api_key_spend.sql"
import type { GeraiVaultDO } from "../../src/do/gerai-vault"
import { vaultFor } from "../../src/do/gerai-vault/stub"

const PRE = `CREATE TABLE api_key_daily_usage (key_id TEXT NOT NULL, wib_day TEXT NOT NULL, issued_idr INTEGER NOT NULL DEFAULT 0, issued_count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (key_id, wib_day));
CREATE TABLE api_key_spend_items (item TEXT PRIMARY KEY, key_id TEXT NOT NULL, tenant_id TEXT NOT NULL, wib_day TEXT NOT NULL, amount_idr INTEGER NOT NULL, created_at INTEGER NOT NULL);`

const run = (name: string, seed: string) =>
  runInDurableObject(vaultFor(env, name), (_i: GeraiVaultDO, s) => {
    s.storage.sql.exec(PRE)
    if (seed) s.storage.sql.exec(seed)
    try {
      s.storage.transactionSync(() => s.storage.sql.exec(m0017))
      return { ok: true, left: s.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('api_key_daily_usage','api_key_spend_items')").one().n }
    } catch (e) {
      return { ok: false, left: s.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('api_key_daily_usage','api_key_spend_items')").one().n, error: String(e) }
    }
  })

describe("control 0017 retires the D1 cap counters only when drained", () => {
  it("drops empty / past-day tables", async () => {
    expect(await run("retire-empty", "INSERT INTO api_key_daily_usage VALUES ('k', '2020-01-01', 50000, 2)")).toMatchObject({ ok: true, left: 0 })
  })
  it("refuses (and keeps both tables) while a reservation is outstanding or today's spend exists", async () => {
    expect(await run("retire-item", "INSERT INTO api_key_spend_items VALUES ('abc1234', 'k', 't', '2020-01-01', 1000, 1)")).toMatchObject({ ok: false, left: 2 })
    expect(await run("retire-today", "INSERT INTO api_key_daily_usage VALUES ('k', date('now', '+7 hours'), 1000, 1)")).toMatchObject({ ok: false, left: 2 })
  })
})
