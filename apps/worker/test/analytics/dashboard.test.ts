// TASK-309 dashboard (PR-18, DEC-213/221): WIB period from the URL, owner KPIs with Estimasi Laba and Laba Kas kept
// apart, Kasir home without money, daily stats pushed through the outbox as absolute versioned rows.
import { env } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { resetMock } from "../../src/mengantar/mock"
import { ownerOnlyKeysIn } from "../../src/dto/projection"
import { appUser } from "../onboarding/helpers"
import { appGet } from "../webhooks/helpers"
import { checkoutGerai, post, readyInv } from "../dispatch/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

type Owner = { kind: "owner"; period: { preset: string | null; from: string; to: string; days: number }; data: { kpi: { shipments: number; nonCod: number; cod: number; paidIdr: number; paidByMethod: Record<string, number>; unpaidCount: number; unpaidIdr: number; estimated_margin_idr: number; cash_profit_idr: number; cashProfitPending: number }; chart: Array<{ bucket: string; nonCod: number; cod: number }>; recent: Array<{ slug: string; payment: string }>; actions: { unpaid: number; variance: number } } }
const dash = async (cookie: string, q = "") => (await appGet(`/dashboard${q}`, cookie))

describe("dashboard", () => {
  it("owner: 7-day default, issued INVs only, paid vs unpaid, Estimasi Laba and Laba Kas separate", async () => {
    const t = await checkoutGerai("dasbor")
    const a = await readyInv(t)
    const b = await readyInv(t)
    const draft = await readyInv(t)
    void draft
    await post(`/shipments/${a}/payment`, t.cookie, { method: "tunai", cashReceivedIdr: 20000 }, `d-${a}`)
    await post(`/shipments/${a}/dispatch`, t.cookie, {})
    await post(`/shipments/${b}/dispatch`, t.cookie, {})
    const res = await dash(t.cookie)
    expect(res.status).toBe(200)
    const d = ((await res.json()) as { data: Owner }).data
    expect(d.period).toMatchObject({ preset: "7d", days: 7 })
    expect(d.data.kpi).toMatchObject({ shipments: 2, nonCod: 2, cod: 0, paidIdr: 15500, unpaidCount: 1, unpaidIdr: 15500 })
    expect(d.data.kpi.paidByMethod.tunai).toBe(15500)
    expect(d.data.kpi.estimated_margin_idr).toBeGreaterThan(0)
    // Non-COD rows wait for the invoice sync: nothing realised yet, one paid row pending.
    expect(d.data.kpi).toMatchObject({ cash_profit_idr: 0, cashProfitPending: 1 })
    expect(d.data.chart).toHaveLength(7)
    expect(d.data.chart.reduce((x, c) => x + c.nonCod, 0)).toBe(2)
    expect(d.data.recent.map((r) => r.payment).sort()).toEqual(["paid", "unpaid"])
    expect(d.data.actions.unpaid).toBe(1)
  })

  it("COD Laba Kas counts only once the COD credit is reconciled and the counter side is settled", async () => {
    const t = await checkoutGerai("dasborcod")
    const s = await readyInv(t, { mode: "sender_bears_fee", codGoodsIdr: 150000 })
    await post(`/shipments/${s}/dispatch`, t.cookie, {})
    const before = ((await (await dash(t.cookie)).json()) as { data: Owner }).data.data.kpi
    expect(before.cash_profit_idr).toBe(0)
    await t.vault.setReconciledCodCredit(t.tenantId, s, 147500)
    // Reconciled, but the counter still owes packing (K = 3.000): still not realised.
    expect(((await (await dash(t.cookie)).json()) as { data: Owner }).data.data.kpi.cash_profit_idr).toBe(0)
    await post(`/shipments/${s}/payment`, t.cookie, { method: "qris" }, `cod-${s}`)
    const after = ((await (await dash(t.cookie)).json()) as { data: Owner }).data.data.kpi
    // credit 147.500 − sender payable 145.000 + packing 3.000 = 5.500; Estimasi Laba is a separate figure.
    expect(after.cash_profit_idr).toBe(5500)
    expect(after.estimated_margin_idr).toBeGreaterThan(0)
  })

  it("period params: custom range, invalid → Indonesian 422, today in hourly buckets", async () => {
    const t = await checkoutGerai("dasborperiode")
    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
    const custom = ((await (await dash(t.cookie, `?dari=${today}&sampai=${today}`)).json()) as { data: Owner }).data
    expect(custom.period).toMatchObject({ preset: null, from: today, to: today, days: 1 })
    const bad = await dash(t.cookie, "?dari=2020-01-01&sampai=2026-01-01")
    expect(bad.status).toBe(422)
    expect(((await bad.json()) as { error: { message: string } }).error.message).toBe("Maksimal 180 hari")
    const future = await dash(t.cookie, "?dari=2099-01-01&sampai=2099-01-02")
    expect(future.status).toBe(422)
    const h = ((await (await dash(t.cookie, "?periode=hari-ini")).json()) as { data: Owner }).data
    expect(h.data.chart).toHaveLength(24)
  })

  it("Kasir home: counter tasks only, no money or balance keys", async () => {
    const t = await checkoutGerai("dasborkasir")
    const k = await appUser("kasir.dasbor@contoh.test")
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'cashier', 'active', ?)").bind(t.tenantId, k.id, Date.now()),
      env.DB.prepare("UPDATE sessions SET active_tenant_id = ? WHERE user_id = ?").bind(t.tenantId, k.id),
    ])
    const s = await readyInv(t)
    await post(`/shipments/${s}/dispatch`, t.cookie, {})
    await post("/shift/open", k.cookie, { openingFloatIdr: 100000 })
    const body = (await (await dash(k.cookie)).json()) as { data: { kind: string; data: Record<string, unknown> } }
    expect(body.data.kind).toBe("counter")
    expect(body.data.data).toMatchObject({ today: { shipments: 1, unpaid: 1 }, actions: { unpaid: 1 } })
    expect((body.data.data.shift as { id: string } | null)?.id).toBeTruthy()
    const text = JSON.stringify(body)
    expect(text).not.toMatch(/_idr|kpi|margin|balance/)
    expect(ownerOnlyKeysIn(body)).toEqual([])
  })

  it("daily stats: pushed through the outbox as absolute rows; an older version never overwrites a newer one", async () => {
    const t = await checkoutGerai("dasborstats")
    const s = await readyInv(t)
    await post(`/shipments/${s}/payment`, t.cookie, { method: "qris" }, `ds-${s}`)
    await post(`/shipments/${s}/dispatch`, t.cookie, {})
    const now = Date.now()
    await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec("UPDATE vault_timers SET due_at = 0 WHERE name = 'daily_stats'"))
    await t.vault.runTimers(now)
    const day = new Date(now + 7 * 3600_000).toISOString().slice(0, 10)
    const read = () => env.DB.prepare("SELECT shipments, counter_paid_idr, version FROM tenant_daily_stats WHERE tenant_id = ? AND day = ?").bind(t.tenantId, day).first<{ shipments: number; counter_paid_idr: number; version: number }>()
    // An alarm-driven flush may already be in flight (it returns that promise): flush until the row lands.
    let row = null as Awaited<ReturnType<typeof read>>
    for (let i = 0; i < 5 && !row; i++) {
      await t.vault.flushOutbox(Date.now() + 1000)
      row = await read()
    }
    expect(row).toMatchObject({ shipments: 1, counter_paid_idr: 15500 })
    // A stale (older version) delivery is ignored.
    await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec("INSERT INTO outbox (topic, entity_key, version, payload_json, attempts, next_attempt_at, created_at) VALUES ('tenant_daily_stats', ?, 1, ?, 0, 0, 0)", day, JSON.stringify({ shipments: 99, cod_shipments: 0, counter_paid_idr: 0, cancelled: 0, updated_at: 1 })))
    await t.vault.flushOutbox(Date.now() + 2000)
    await t.vault.flushOutbox(Date.now() + 3000)
    const again = await env.DB.prepare("SELECT shipments FROM tenant_daily_stats WHERE tenant_id = ? AND day = ?").bind(t.tenantId, day).first<{ shipments: number }>()
    expect(again?.shipments).toBe(1)
    // An idle object sleeps: after the push and the flushes, `daily_stats` is not re-scheduled (no 5-minute loop).
    const timers = await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec<{ name: string }>("SELECT name FROM vault_timers WHERE name = 'daily_stats'").toArray())
    expect(timers).toEqual([])
  })
})
