// TASK-402 unpaid recovery and Saldo Aman (spec 09 §3, spec 02 §4): finance-triggered `payUnpaid` after a top-up
// sync, crash between call and record resolved by read-back (never a second call), reserve math linked to INVs,
// and the Non-COD pre-flight where a Kasir only ever sees a boolean.
import { env } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { mockCreated, mockInvoices, mockSeller, resetMock } from "../../src/mengantar/mock"
import { ownerOnlyKeysIn } from "../../src/dto/projection"
import { appUser } from "../onboarding/helpers"
import { appGet } from "../webhooks/helpers"
import { checkoutGerai, post, readyInv } from "../dispatch/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

const iso = (m: number) => new Date(Date.UTC(2026, 10, 14, 2, m)).toISOString()
type Detail = { data: { shipment: { dispatch_state: string; awb_number: string | null }; preflight: { balance_sufficient: boolean | null; synced_balance_idr?: number | null; estimated_debit_idr?: number | null } } }
const detail = async (cookie: string, slug: string) => ((await (await appGet(`/shipments/${slug}`, cookie)).json()) as Detail).data

async function held(t: Awaited<ReturnType<typeof checkoutGerai>>) {
  mockSeller.balanceIdr = 0
  const slug = await readyInv(t)
  const r = ((await (await post(`/shipments/${slug}/dispatch`, t.cookie, {})).json()) as { data: { state: string } }).data
  expect(r.state).toBe("provider_unpaid_hold")
  return slug
}

describe("unpaid recovery", () => {
  it("top-up sync → held batch paid once by the system → AWB; owner notified; a second sync does not call again", async () => {
    const t = await checkoutGerai("pulihsatu")
    const slug = await held(t)
    mockSeller.balanceIdr = 100_000
    mockInvoices.push({ _id: "top1", type: "typeAddBalance", status: "statusCleared", amount: 100_000, balanceAmount: 100_000, createdAt: iso(1) })
    const r = await t.vault.financeSync(t.tenantId, "cron")
    expect(r).toMatchObject({ ok: true, value: { recovery: { paid: 1, skipped: 0 } } })
    expect(mockSeller.payUnpaidCalls).toBe(1)
    expect((await detail(t.cookie, slug)).shipment).toMatchObject({ dispatch_state: "issued", awb_number: expect.stringMatching(/^JT/) })
    const notes = ((await (await appGet("/notifications", t.cookie)).json()) as { data: { items: Array<{ title: string }> } }).data.items
    expect(notes.map((n) => n.title)).toContain("1 kiriman yang menunggu saldo sudah terbit resinya")
    await t.vault.financeSync(t.tenantId, "cron")
    expect(mockSeller.payUnpaidCalls).toBe(1)
  })

  it("balance below the held debit: skipped, never called", async () => {
    const t = await checkoutGerai("pulihkurang")
    await held(t)
    mockInvoices.push({ _id: "top2", type: "typeAddBalance", status: "statusCleared", amount: 1_000, balanceAmount: 1_000, createdAt: iso(1) })
    expect(await t.vault.financeSync(t.tenantId, "cron")).toMatchObject({ ok: true, value: { recovery: { paid: 0, skipped: 1 } } })
    expect(mockSeller.payUnpaidCalls).toBe(0)
  })

  it("crash between call and record: the journal stays in_flight; recovery reads the order back and records it without a second call", async () => {
    const t = await checkoutGerai("pulihcrash")
    const slug = await held(t)
    const s = await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec<{ mengantar_order_code: string; mengantar_batch_object_id: string }>("SELECT mengantar_order_code, mengantar_batch_object_id FROM shipments WHERE slug = ?", slug).one())
    // Simulate: journal written, Mengantar paid the batch, then the object died before recording the outcome.
    const old = Date.now() - 120_000
    await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec("INSERT INTO dispatch_journal (idempotency_key, slug, op, state, request_json, created_at, updated_at) VALUES (?, ?, 'pay_unpaid', 'in_flight', '{}', ?, ?)", `gx-pay-${slug}-crash`, slug, old, old))
    const o = mockCreated.get(s.mengantar_order_code)!
    o.isPaid = true
    o.cnote_no = "JT9999000111"
    o.status = "PENDING PICKUP"
    mockInvoices.push({ _id: "top3", type: "typeAddBalance", status: "statusCleared", amount: 500_000, balanceAmount: 500_000, createdAt: iso(1) })
    const r = await t.vault.financeSync(t.tenantId, "cron")
    expect(r).toMatchObject({ ok: true, value: { recovery: { resolved: 1, paid: 0 } } })
    expect(mockSeller.payUnpaidCalls).toBe(0)
    expect((await detail(t.cookie, slug)).shipment).toMatchObject({ dispatch_state: "issued", awb_number: "JT9999000111" })
    const j = await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec<{ state: string }>("SELECT state FROM dispatch_journal WHERE idempotency_key = ?", `gx-pay-${slug}-crash`).one().state)
    expect(j).toBe("done")
  })

  it("crash where Mengantar did not pay: journal marked failed, then the batch is paid normally", async () => {
    const t = await checkoutGerai("pulihgagal")
    const slug = await held(t)
    const old = Date.now() - 120_000
    await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec("INSERT INTO dispatch_journal (idempotency_key, slug, op, state, request_json, created_at, updated_at) VALUES (?, ?, 'pay_unpaid', 'unknown', '{}', ?, ?)", `gx-pay-${slug}-x`, slug, old, old))
    mockSeller.balanceIdr = 100_000
    mockInvoices.push({ _id: "top4", type: "typeAddBalance", status: "statusCleared", amount: 100_000, balanceAmount: 100_000, createdAt: iso(1) })
    expect(await t.vault.financeSync(t.tenantId, "cron")).toMatchObject({ ok: true, value: { recovery: { resolved: 1, paid: 1 } } })
    expect(mockSeller.payUnpaidCalls).toBe(1)
    expect((await detail(t.cookie, slug)).shipment.dispatch_state).toBe("issued")
  })
})

describe("Saldo Aman and pre-flight", () => {
  it("reserve = return exposure (P + N per INV in return) + open adjustments; linked to INVs; released when the return debit is reconciled", async () => {
    const t = await checkoutGerai("amansatu")
    const a = await readyInv(t)
    await post(`/shipments/${a}/dispatch`, t.cookie, {})
    const q = await runInDurableObject(t.vault, (_i, st) => {
      st.storage.sql.exec("UPDATE shipments SET status = 'rts_in_transit' WHERE slug = ?", a)
      return st.storage.sql.exec<{ p: number; n: number; awb: string }>("SELECT s.publish_shipping_idr AS p, q.provider_net_shipping_idr AS n, s.awb_number AS awb FROM shipments s JOIN quote_snapshots q ON q.id = s.quote_snapshot_id WHERE s.slug = ?", a).one()
    })
    mockInvoices.push({ _id: "b1", type: "typeAddBalance", status: "statusCleared", amount: 300_000, balanceAmount: 300_000, createdAt: iso(1) })
    mockInvoices.push({ _id: "adj", type: "typePayment", status: "statusCleared", amount: -2_000, balanceAmount: 298_000, createdAt: iso(2), description: "Biaya penyesuaian berat", cnote_no: q.awb })
    await t.vault.financeSync(t.tenantId, "cron")
    const f = ((await (await appGet("/finance", t.cookie)).json()) as { data: { summary: { balance: number; reserve: number; safeBalance: number }; reserve: Array<{ slug: string; kind: string; amount_idr: number }> } }).data
    expect(f.summary).toMatchObject({ balance: 298_000, reserve: q.p + q.n + 2_000, safeBalance: 298_000 - (q.p + q.n + 2_000) })
    expect(f.reserve).toEqual([{ slug: a, kind: "retur", status: "rts_in_transit", amount_idr: q.p + q.n }, { slug: a, kind: "sengketa", status: "rts_in_transit", amount_idr: 2_000 }])
    mockInvoices.push({ _id: "ret", type: "typePayment", status: "statusCleared", amount: -9_000, balanceAmount: 289_000, createdAt: iso(3), description: `Payment for returned order ${q.awb}` })
    await t.vault.financeSync(t.tenantId, "manual")
    const g = ((await (await appGet("/finance", t.cookie)).json()) as { data: { summary: { reserve: number } } }).data
    expect(g.summary.reserve).toBe(2_000)
  })

  it("pre-flight: owner sees balance and debit; Kasir only the boolean; never claims without a synced balance", async () => {
    const t = await checkoutGerai("amanpre")
    const slug = await readyInv(t)
    expect((await detail(t.cookie, slug)).preflight).toEqual({ balance_sufficient: null, synced_balance_idr: null, estimated_debit_idr: expect.any(Number) })
    mockInvoices.push({ _id: "p1", type: "typeAddBalance", status: "statusCleared", amount: 5_000, balanceAmount: 5_000, createdAt: iso(1) })
    await t.vault.financeSync(t.tenantId, "cron")
    const owner = (await detail(t.cookie, slug)).preflight
    expect(owner).toMatchObject({ balance_sufficient: false, synced_balance_idr: 5_000 })
    const k = await appUser("kasir.aman@contoh.test")
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'cashier', 'active', ?)").bind(t.tenantId, k.id, Date.now()),
      env.DB.prepare("UPDATE sessions SET active_tenant_id = ? WHERE user_id = ?").bind(t.tenantId, k.id),
    ])
    const raw = await (await appGet(`/shipments/${slug}`, k.cookie)).json()
    expect(ownerOnlyKeysIn(raw)).toEqual([])
    expect((raw as Detail).data.preflight).toEqual({ balance_sufficient: false })
    expect((await appGet("/finance", k.cookie)).status).toBe(403)
  })
})
