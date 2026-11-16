// TASK-499 exit gate "deterministic reconciliation across all types": the same `/invoices` rows synced in a different
// page order, synced twice, or into a fresh object give byte-identical reconciled state (shipments' provider amounts,
// mirror link states, discrepancies, balance).
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { mockInvoices, resetMock } from "../../src/mengantar/mock"
import { checkoutGerai, post, readyInv } from "../dispatch/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

const iso = (m: number) => new Date(Date.UTC(2026, 10, 14, 3, m)).toISOString()

async function world(name: string) {
  const t = await checkoutGerai(name)
  const issue = async (q: Record<string, unknown> = {}) => {
    const s = await readyInv(t, q)
    await post(`/shipments/${s}/payment`, t.cookie, { method: "qris" }, `d-${s}`)
    await post(`/shipments/${s}/dispatch`, t.cookie, {})
    return runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec<{ slug: string; awb_number: string }>("SELECT slug, awb_number FROM shipments WHERE slug = ?", s).one())
  }
  return { t, non: await issue(), cod: await issue({ mode: "sender_bears_fee", codGoodsIdr: 150000 }) }
}

function rows(non: { awb_number: string }, cod: { awb_number: string }) {
  let bal = 0
  const step = (amount: number) => (bal += amount)
  return [
    { _id: "a1", type: "typeAddBalance", status: "statusCleared", amount: 300000, balanceAmount: step(300000), createdAt: iso(1) },
    { _id: "a2", type: "typePayment", status: "statusCleared", amount: -10000, balanceAmount: step(-10000), createdAt: iso(2), description: "Payment for Non-COD batch", subItems: [{ cnote_no: non.awb_number, amount: -10000 }] },
    { _id: "a3", type: "typeReconciliation", status: "statusCleared", amount: 140000, balanceAmount: step(140000), createdAt: iso(3), subItems: [{ cnote_no: cod.awb_number, amount: 140000 }] },
    { _id: "a4", type: "typePayment", status: "statusCleared", amount: -9000, balanceAmount: step(-9000), createdAt: iso(4), description: `Payment for returned order ${non.awb_number}` },
    { _id: "a5", type: "typePayment", status: "statusCleared", amount: -2000, balanceAmount: step(-2000), createdAt: iso(5), description: "Biaya penyesuaian berat", cnote_no: cod.awb_number },
    { _id: "a6", type: "typeRefund", status: "statusCleared", amount: 20000, balanceAmount: step(20000), createdAt: iso(6), description: `Claim approved for damaged or lost order ${cod.awb_number}` },
    { _id: "a7", type: "typeWithdraw", status: "statusCleared", amount: -50000, balanceAmount: step(-50000), createdAt: iso(7) },
    { _id: "a8", type: "typeCorrection", status: "statusCleared", amount: 1000, balanceAmount: step(1000), createdAt: iso(8) },
  ]
}

async function snapshot(t: Awaited<ReturnType<typeof world>>["t"], slugs: string[]) {
  return runInDurableObject(t.vault, (_i, st) => {
    const sql = st.storage.sql
    // Slugs differ per world; compare by role (index in `slugs`).
    const role = (s: string | null) => (s ? String(slugs.indexOf(s)) : null)
    return {
      ships: sql.exec<Record<string, SqlStorageValue>>(`SELECT slug, provider_reconciled_cost_idr, reconciled_provider_cod_credit_idr, reconciled_extra_adjustment_idr, payment_sync_state, quote_drift FROM shipments WHERE slug IN (${slugs.map(() => "?").join(",")}) ORDER BY slug`, ...slugs).toArray().map((r) => ({ ...r, slug: role(r.slug as string) })).sort((a, b) => String(a.slug).localeCompare(String(b.slug))),
      mirror: sql.exec<Record<string, SqlStorageValue>>("SELECT invoice_id, type, link_state, amount_idr, balance_amount_idr FROM mengantar_invoice_mirror ORDER BY invoice_id").toArray(),
      subs: sql.exec<Record<string, SqlStorageValue>>("SELECT invoice_id, idx, amount_idr, shipment_slug FROM mengantar_invoice_subitems ORDER BY invoice_id, idx").toArray().map((r) => ({ ...r, shipment_slug: role(r.shipment_slug as string | null) })),
      disc: sql.exec<Record<string, SqlStorageValue>>("SELECT invoice_id, kind, shipment_slug, expected_idr, actual_idr FROM finance_discrepancies ORDER BY invoice_id, kind").toArray().map((r) => ({ ...r, shipment_slug: r.shipment_slug ? role(r.shipment_slug as string) : r.shipment_slug })),
      balance: sql.exec<{ b: number | null }>("SELECT synced_balance_idr AS b FROM mengantar_connections").one().b,
    }
  })
}

describe("deterministic reconciliation across all types", () => {
  it("newest-first vs oldest-first pages, a replay, and a fresh object give identical state", async () => {
    const A = await world("detsatu")
    mockInvoices.push(...rows(A.non, A.cod))
    await A.t.vault.financeSync(A.t.tenantId, "manual")
    const first = await snapshot(A.t, [A.non.slug, A.cod.slug])
    await A.t.vault.financeSync(A.t.tenantId, "pending_rescan")
    await A.t.vault.financeSync(A.t.tenantId, "cron", Date.now() + 31_000)
    expect(await snapshot(A.t, [A.non.slug, A.cod.slug])).toEqual(first)

    // Second gerai: rows arrive one per sync, oldest first (the reverse of newest-first paging).
    resetMock()
    const B = await world("detdua")
    const bRows = rows(B.non, B.cod)
    for (const r of bRows) {
      mockInvoices.push(r)
      await B.t.vault.financeSync(B.t.tenantId, "cron")
    }
    const second = await snapshot(B.t, [B.non.slug, B.cod.slug])
    expect(second).toEqual(first)
    expect(first.balance).toBe(300000 - 10000 + 140000 - 9000 - 2000 + 20000 - 50000 + 1000)
    // The fixture credit differs from the frozen expectation, so `cod_credit_differs` is raised as well.
    expect(first.disc.map((d) => String((d as { kind?: unknown }).kind)).sort()).toEqual(["adjustment", "cod_credit_differs", "unknown_type"])
  })
})
