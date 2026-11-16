// `/keuangan` read model (TASK-401, visual 06 §3, spec 02 §3.5/§4, spec 09). Owner only (the API refuses Kasir).
// Estimasi Laba and Laba Kas are computed separately with the same predicates as the dashboard; never summed.
import { resolvePreset } from "@gx/domain/period"
import { reserveOf, type ReserveRow } from "./reserve"

export interface FinanceView {
  summary: {
    balance: number | null
    safeBalance: number | null
    reserve: number
    codWaiting: { count: number; amount: number }
    counterToday: { tunai: number; qris: number; transfer: number }
    unpaidHold: { count: number; amount: number }
    payableToSenders: number
    estimated_margin_idr: number
    cash_profit_idr: number
    lastSync: { at: number | null; status: string | null; error: string | null }
  }
  mutations: Array<{ invoice_id: string; inv_number: string | null; type: string; status: string | null; amount_idr: number | null; balance_amount_idr: number | null; provider_created_at: number | null; description: string | null; link_state: string; slugs: string | null }>
  profits: Array<{ slug: string; issued_at: number; cod_fee_mode: string; estimated_margin_idr: number | null; cash_profit_idr: number | null; reconciled: boolean; quote_drift: number }>
  discrepancies: Array<{ id: string; kind: string; invoice_id: string; shipment_slug: string | null; expected_idr: number | null; actual_idr: number | null; detail: string | null; created_at: number }>
  reserve: ReserveRow[]
  shifts: Array<{ id: string; opened_at: number; closed_at: number | null; variance_idr: number | null; expected_cash_idr: number | null; counted_cash_idr: number | null; state: string }>
}

const n = (v: unknown) => (typeof v === "number" ? v : 0)

/** Laba Kas per INV (spec 02 §3.5): counter settled AND provider side reconciled; otherwise NULL (pending). */
export const CASH_PROFIT_SQL = `CASE WHEN s.counter_payment_status IN ('paid','not_required') THEN
    CASE WHEN s.cod_fee_mode = 'none' AND s.provider_reconciled_cost_idr IS NOT NULL THEN s.counter_due_idr - s.provider_reconciled_cost_idr
         WHEN s.cod_fee_mode != 'none' AND s.reconciled_provider_cod_credit_idr IS NOT NULL THEN s.reconciled_provider_cod_credit_idr - s.sender_cod_payable_idr + s.packing_addon_idr + COALESCE(s.counter_service_fee_idr, 0) - COALESCE(s.promo_discount_idr, 0)
    END END`

export function financeView(sql: SqlStorage, now: number): FinanceView {
  const conn = sql.exec<{ synced_balance_idr: number | null; last_invoice_synced_at: number | null; last_sync_status: string | null }>("SELECT synced_balance_idr, last_invoice_synced_at, last_sync_status FROM mengantar_connections LIMIT 1").toArray()[0]
  const st = sql.exec<{ last_error: string | null }>("SELECT last_error FROM finance_sync_state WHERE id = 1").toArray()[0]
  const res = reserveOf(sql)
  const reserve = res.total
  const codWaiting = sql.exec<{ c: number; s: number }>("SELECT COUNT(*) AS c, SUM(expected_provider_cod_credit_idr) AS s FROM shipments WHERE cod_fee_mode != 'none' AND dispatch_state = 'issued' AND reconciled_provider_cod_credit_idr IS NULL AND status NOT IN ('cancelled')").one()
  const today = resolvePreset("today", now)
  const counter = { tunai: 0, qris: 0, transfer: 0 }
  for (const r of sql.exec<{ method: string; total: number }>("SELECT method, SUM(CASE WHEN event = 'mark_paid' THEN amount_idr WHEN event = 'void_payment' THEN -amount_idr ELSE 0 END) AS total FROM counter_receipts WHERE created_at >= ? AND created_at < ? GROUP BY method", today.fromMs, today.toMs)) {
    if (r.method in counter) counter[r.method as keyof typeof counter] = n(r.total)
  }
  const hold = sql.exec<{ c: number; s: number }>("SELECT COUNT(*) AS c, SUM(gerai_shipping_cost_idr) AS s FROM shipments WHERE dispatch_state = 'provider_unpaid_hold'").one()
  const payable = n(sql.exec<{ s: number }>("SELECT SUM(sender_cod_payable_idr - COALESCE(sender_cod_paid_idr, 0)) AS s FROM shipments WHERE cod_fee_mode != 'none' AND dispatch_state = 'issued' AND status = 'delivered'").one().s)
  const month = resolvePreset("30d", now)
  const profit = sql
    .exec<{ est: number; cash: number }>(
      `SELECT SUM(q.estimated_margin_idr) AS est, SUM(${CASH_PROFIT_SQL}) AS cash FROM shipments s LEFT JOIN quote_snapshots q ON q.id = s.quote_snapshot_id
       WHERE s.dispatch_state IN ('issued','provider_unpaid_hold') AND s.issued_at >= ? AND s.issued_at < ?`,
      month.fromMs,
      month.toMs,
    )
    .one()
  const balance = conn?.synced_balance_idr ?? null
  return {
    summary: {
      balance,
      safeBalance: balance === null ? null : balance - reserve,
      reserve,
      codWaiting: { count: n(codWaiting.c), amount: n(codWaiting.s) },
      counterToday: counter,
      unpaidHold: { count: n(hold.c), amount: n(hold.s) },
      payableToSenders: payable,
      estimated_margin_idr: n(profit.est),
      cash_profit_idr: n(profit.cash),
      lastSync: { at: conn?.last_invoice_synced_at ?? null, status: conn?.last_sync_status ?? null, error: st?.last_error ?? null },
    },
    mutations: sql
      .exec<FinanceView["mutations"][number]>(
        `SELECT m.invoice_id, m.inv_number, m.type, m.status, m.amount_idr, m.balance_amount_idr, m.provider_created_at, m.description, m.link_state,
                (SELECT GROUP_CONCAT(DISTINCT si.shipment_slug) FROM mengantar_invoice_subitems si WHERE si.invoice_id = m.invoice_id AND si.shipment_slug IS NOT NULL) AS slugs
         FROM mengantar_invoice_mirror m ORDER BY m.provider_created_at DESC LIMIT 100`,
      )
      .toArray(),
    profits: sql
      .exec<{ slug: string; issued_at: number; cod_fee_mode: string; estimated_margin_idr: number | null; cash: number | null; quote_drift: number }>(
        `SELECT s.slug, s.issued_at, s.cod_fee_mode, q.estimated_margin_idr, ${CASH_PROFIT_SQL} AS cash, s.quote_drift FROM shipments s LEFT JOIN quote_snapshots q ON q.id = s.quote_snapshot_id
         WHERE s.dispatch_state IN ('issued','provider_unpaid_hold') ORDER BY s.issued_at DESC LIMIT 100`,
      )
      .toArray()
      .map((r) => ({ slug: r.slug, issued_at: r.issued_at, cod_fee_mode: r.cod_fee_mode, estimated_margin_idr: r.estimated_margin_idr, cash_profit_idr: r.cash, reconciled: r.cash !== null, quote_drift: r.quote_drift })),
    discrepancies: sql
      .exec<FinanceView["discrepancies"][number]>("SELECT id, kind, invoice_id, NULLIF(shipment_slug, '') AS shipment_slug, expected_idr, actual_idr, detail, created_at FROM finance_discrepancies WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT 100")
      .toArray(),
    reserve: res.rows,
    shifts: sql.exec<FinanceView["shifts"][number]>("SELECT id, opened_at, closed_at, variance_idr, expected_cash_idr, counted_cash_idr, state FROM cashier_shifts ORDER BY opened_at DESC LIMIT 30").toArray(),
  }
}
