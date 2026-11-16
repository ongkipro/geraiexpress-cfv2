// TASK-401 `/invoices` sync and dual book (spec 09, spec 02 §3.5): reconciliation over every observed type + an
// unknown one, PII stripped, running balance equals `balanceAmount`, bounded pages, watermark stop, triggers
// (cron fan-out, +60 s after mutations, manual 1 per 30 s, daily pending rescan) on a fake clock.
import { env } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { mockInvoices, mockSeller, resetMock } from "../../src/mengantar/mock"
import { appUser } from "../onboarding/helpers"
import { appGet } from "../webhooks/helpers"
import { checkoutGerai, post, readyInv } from "../dispatch/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

const iso = (minute: number) => new Date(Date.UTC(2026, 10, 14, 1, minute)).toISOString()

async function issuedPair(t: Awaited<ReturnType<typeof checkoutGerai>>) {
  const non = await readyInv(t)
  await post(`/shipments/${non}/payment`, t.cookie, { method: "qris" }, `f-${non}`)
  await post(`/shipments/${non}/dispatch`, t.cookie, {})
  const cod = await readyInv(t, { mode: "sender_bears_fee", codGoodsIdr: 150000 })
  await post(`/shipments/${cod}/payment`, t.cookie, { method: "qris" }, `f-${cod}`)
  await post(`/shipments/${cod}/dispatch`, t.cookie, {})
  const rows = await runInDurableObject(t.vault, (_i, s) => s.storage.sql.exec<{ slug: string; awb_number: string; mengantar_order_code: string }>("SELECT slug, awb_number, mengantar_order_code FROM shipments WHERE slug IN (?, ?)", non, cod).toArray())
  const by = Object.fromEntries(rows.map((r) => [r.slug, r]))
  return { non: by[non]!, cod: by[cod]! }
}

/** Every observed type (spec 09 §2.2) + one unknown, oldest first; running balance consistent. */
function fixtures(non: { awb_number: string; mengantar_order_code: string }, cod: { awb_number: string; mengantar_order_code: string }) {
  return [
    { _id: "inv01", inv_number: "INV-MGT-1", type: "typeAddBalance", status: "statusCleared", amount: 500000, total: 500000, balanceAmount: 514000, createdAt: iso(1), description: "Top up saldo" },
    { _id: "inv02", inv_number: "INV-MGT-2", type: "typePayment", status: "statusCleared", amount: -10000, total: -10000, balanceAmount: 504000, createdAt: iso(2), description: "Payment for Non-COD batch B-1", subItems: [{ cnote_no: non.awb_number, ORDER_ID: non.mengantar_order_code, amount: -10000, estimatedSpecialPrice: 10000, RECEIVER_NAME: "Rina Kartika", RECEIVER_PHONE: "085712348821", GOODS_DESC: "Pakaian" }] },
    { _id: "inv03", inv_number: "INV-MGT-3", type: "typeReconciliation", status: "statusCleared", amount: 140000, total: 140000, balanceAmount: 644000, createdAt: iso(3), subItems: [{ cnote_no: cod.awb_number, amount: 140000, COD_AMOUNT: 150000, estimatedSpecialPrice: 10000, COD_FEE: 4995.5, RECEIVER_NAME: "Rina Kartika" }, { cnote_no: "JX0000000001", amount: 5000 }] },
    { _id: "inv04", inv_number: "INV-MGT-4", type: "typePayment", status: "statusCleared", amount: -14000, total: -14000, balanceAmount: 630000, createdAt: iso(4), description: `Payment for returned order ${non.awb_number}` },
    { _id: "inv05", inv_number: "INV-MGT-5", type: "typeRefund", status: "statusCleared", amount: 20000, total: 20000, balanceAmount: 650000, createdAt: iso(5), description: `Claim approved for damaged or lost order ${cod.awb_number}` },
    { _id: "inv06", inv_number: "INV-MGT-6", type: "typeWithdraw", status: "statusCleared", amount: -50000, total: -50000, balanceAmount: 600000, createdAt: iso(6), description: "Penarikan ke bank" },
    { _id: "inv07", inv_number: "INV-MGT-7", type: "typeMismatchP", status: "statusCleared", amount: -1000, total: -1000, balanceAmount: 599000, createdAt: iso(7), description: "Selisih" },
    { _id: "inv08", inv_number: "INV-MGT-8", type: "typeAddBalance", status: "statusPending", amount: 100000, total: 100000, balanceAmount: null, createdAt: iso(8), description: "Top up menunggu" },
  ]
}

describe("finance sync", () => {
  it("reconciles every observed type + unknown; PII stripped; balance = newest cleared balanceAmount; running balance consistent", async () => {
    const t = await checkoutGerai("financeall")
    const { non, cod } = await issuedPair(t)
    mockInvoices.push(...fixtures(non, cod))
    const r = await t.vault.financeSync(t.tenantId, "manual")
    expect(r).toMatchObject({ ok: true, value: { pages: 1, rows: 8, newRows: 8, gaps: 0, balance: 599000, capped: false, error: null } })
    const s = await runInDurableObject(t.vault, (_i, st) => {
      const sql = st.storage.sql
      return {
        ship: sql.exec<Record<string, number | null>>("SELECT slug, provider_reconciled_cost_idr, reconciled_provider_cod_credit_idr, reconciled_extra_adjustment_idr, quote_drift FROM shipments ORDER BY slug").toArray(),
        mirror: sql.exec<{ invoice_id: string; link_state: string; raw_json: string }>("SELECT invoice_id, link_state, raw_json FROM mengantar_invoice_mirror ORDER BY invoice_id").toArray(),
        disc: sql.exec<{ kind: string; shipment_slug: string }>("SELECT kind, shipment_slug FROM finance_discrepancies ORDER BY kind").toArray(),
        bal: sql.exec<{ synced_balance_idr: number }>("SELECT synced_balance_idr FROM mengantar_connections").one().synced_balance_idr,
        feeText: sql.exec<{ cod_fee_raw_text: string }>("SELECT cod_fee_raw_text FROM mengantar_invoice_subitems WHERE invoice_id = 'inv03' AND idx = 0").one().cod_fee_raw_text,
      }
    })
    const byslug = Object.fromEntries(s.ship.map((x) => [x.slug as unknown as string, x]))
    expect(byslug[non.slug]).toMatchObject({ provider_reconciled_cost_idr: 10000, reconciled_extra_adjustment_idr: 14000 })
    expect(byslug[cod.slug]).toMatchObject({ reconciled_provider_cod_credit_idr: 140000 })
    expect(s.bal).toBe(599000)
    expect(s.feeText).toBe("4995.5")
    const states = Object.fromEntries(s.mirror.map((m) => [m.invoice_id, m.link_state]))
    expect(states).toMatchObject({ inv01: "not_applicable", inv02: "linked", inv03: "partial", inv04: "linked", inv05: "linked", inv06: "not_applicable", inv07: "unknown_type", inv08: "not_applicable" })
    expect(JSON.stringify(s.mirror)).not.toMatch(/Rina|085712348821|Pakaian/)
    const kinds = s.disc.map((d) => d.kind)
    expect(kinds).toContain("unknown_type")
    expect(kinds).toContain("unmatched")
    // Re-sync is idempotent: same amounts, no new rows.
    const again = await t.vault.financeSync(t.tenantId, "cron")
    expect(again).toMatchObject({ ok: true, value: { newRows: 0, balance: 599000 } })
    // A pending→cleared refresh re-reads already-mirrored rows: every per-INV amount stays SET, never added twice.
    mockInvoices[7]!.status = "statusCleared"
    mockInvoices[7]!.balanceAmount = 699000
    expect(await t.vault.financeSync(t.tenantId, "pending_rescan")).toMatchObject({ ok: true, value: { balance: 699000 } })
    const after = await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec<Record<string, number>>("SELECT slug, provider_reconciled_cost_idr AS cost, reconciled_provider_cod_credit_idr AS credit, reconciled_extra_adjustment_idr AS extra FROM shipments ORDER BY slug").toArray())
    const a = Object.fromEntries(after.map((x) => [x.slug as unknown as string, x]))
    expect(a[non.slug]).toMatchObject({ cost: 10000, extra: 14000 })
    expect(a[cod.slug]).toMatchObject({ credit: 140000 })
  })

  it("a balance gap is flagged as Selisih Sync, never smoothed", async () => {
    const t = await checkoutGerai("financegap")
    mockInvoices.push(
      { _id: "g1", type: "typeAddBalance", status: "statusCleared", amount: 100000, balanceAmount: 100000, createdAt: iso(1) },
      { _id: "g2", type: "typeWithdraw", status: "statusCleared", amount: -30000, balanceAmount: 75000, createdAt: iso(2) },
    )
    const r = await t.vault.financeSync(t.tenantId, "cron")
    expect(r).toMatchObject({ ok: true, value: { gaps: 1, balance: 75000 } })
  })

  it("Laba Kas: counted only after reconciliation; Non-COD uses the reconciled total debit", async () => {
    const t = await checkoutGerai("financelaba")
    const { non, cod } = await issuedPair(t)
    const before = ((await (await appGet("/dashboard", t.cookie)).json()) as { data: { data: { kpi: { cash_profit_idr: number; cashProfitPending: number } } } }).data.data.kpi
    expect(before).toMatchObject({ cash_profit_idr: 0, cashProfitPending: 2 })
    mockInvoices.push(...fixtures(non, cod).slice(0, 3))
    await t.vault.financeSync(t.tenantId, "manual")
    const after = ((await (await appGet("/dashboard", t.cookie)).json()) as { data: { data: { kpi: { cash_profit_idr: number; cashProfitPending: number } } } }).data.data.kpi
    const due = await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec<{ d: number }>("SELECT counter_due_idr AS d FROM shipments WHERE slug = ?", non.slug).one().d)
    // Non-COD: due − 10.000 debit; COD: 140.000 credit − 145.000 payable + 3.000 packing.
    expect(after).toMatchObject({ cashProfitPending: 0, cash_profit_idr: due - 10000 + (140000 - 145000 + 3000) })
  })

  it("bounded: at most 5 pages per run; stops at the first fully-known final page", async () => {
    const t = await checkoutGerai("financepages")
    for (let i = 0; i < 400; i++) mockInvoices.push({ _id: `p${String(i).padStart(4, "0")}`, type: "typeWithdraw", status: "statusCleared", amount: -1, balanceAmount: 1000 - i, createdAt: new Date(Date.UTC(2026, 10, 1) + i * 60_000).toISOString() })
    const r1 = await t.vault.financeSync(t.tenantId, "cron")
    expect(r1).toMatchObject({ ok: true, value: { pages: 5, rows: 250, capped: true } })
    const calls = mockSeller.invoiceCalls
    const r2 = await t.vault.financeSync(t.tenantId, "cron")
    // The newest page is already known and final → one page only.
    expect(r2).toMatchObject({ ok: true, value: { pages: 1, newRows: 0 } })
    expect(mockSeller.invoiceCalls - calls).toBe(1)
  })

  it("triggers: manual 1 per 30 s (Indonesian 429), +60 s after a mutation, cron fan-out, daily pending rescan; Kasir 403", async () => {
    const t = await checkoutGerai("financetrig")
    mockInvoices.push({ _id: "t1", type: "typeAddBalance", status: "statusPending", amount: 50000, balanceAmount: null, createdAt: iso(1) })
    expect((await post("/finance/sync", t.cookie, {})).status).toBe(200)
    const limited = await post("/finance/sync", t.cookie, {})
    expect(limited.status).toBe(429)
    expect(((await limited.json()) as { error: { message: string } }).error.message).toBe("Sinkronisasi baru saja dijalankan. Coba lagi dalam 30 detik.")
    const t0 = Date.now()
    expect(await t.vault.financeSync(t.tenantId, "manual", t0 + 31_000)).toMatchObject({ ok: true })
    // A dispatch arms `finance_sync` at +60 s.
    const s = await readyInv(t)
    await post(`/shipments/${s}/dispatch`, t.cookie, {})
    const due = await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec<{ due_at: number }>("SELECT due_at FROM vault_timers WHERE name = 'finance_sync'").one().due_at)
    expect(due - Date.now()).toBeGreaterThan(30_000)
    expect(due - Date.now()).toBeLessThanOrEqual(60_000)
    const calls = mockSeller.invoiceCalls
    await t.vault.runTimers(due + 1)
    expect(mockSeller.invoiceCalls).toBeGreaterThan(calls)
    // Pending rescan: the pending top-up clears later and is picked up by its date range.
    mockInvoices[0]!.status = "statusCleared"
    mockInvoices[0]!.balanceAmount = 50000
    expect(await t.vault.financeSync(t.tenantId, "pending_rescan")).toMatchObject({ ok: true, value: { balance: 50000 } })
    // Cron fan-out: one message per active connected gerai.
    const { enqueueFinanceSync } = await import("../../src/cron/finance")
    await env.DB.prepare("INSERT INTO tenant_onboarding (tenant_id, environment, onboarding_state, seller_id, external_user_id, updated_at) VALUES (?1, 'sandbox', 'connected', 's', ?1, 1)").bind(t.tenantId).run()
    expect(await enqueueFinanceSync(env, "cron")).toBeGreaterThanOrEqual(1)
    const k = await appUser("kasir.keuangan@contoh.test")
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'cashier', 'active', ?)").bind(t.tenantId, k.id, Date.now()),
      env.DB.prepare("UPDATE sessions SET active_tenant_id = ? WHERE user_id = ?").bind(t.tenantId, k.id),
    ])
    expect((await appGet("/finance", k.cookie)).status).toBe(403)
    expect((await post("/finance/sync", k.cookie, {})).status).toBe(403)
  })
})
