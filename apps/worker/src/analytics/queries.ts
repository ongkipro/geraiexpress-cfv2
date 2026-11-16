// Gerai Dashboard queries (PR-18, DEC-213/221, visual 07 `/`, spec 02 §3.5). Pure SQL over the tenant object's own
// tables; the caller passes WIB-resolved bounds `[fromMs, toMs)`. A shipment counts on its issue time; drafts and
// cancelled INVs never count. `Estimasi Laba` and `Laba Kas` are separate numbers, never summed.
import { bucketOf, bucketsOf, type Period } from "@gx/domain/period"
import { CASH_PROFIT_SQL } from "../do/gerai-vault/finance/view"
import { reserveOf } from "../do/gerai-vault/finance/reserve"

const ISSUED = "dispatch_state IN ('issued','provider_unpaid_hold') AND issued_at IS NOT NULL"

export interface OwnerDashboard {
  kpi: {
    shipments: number
    shipmentsPrev: number
    nonCod: number
    cod: number
    paidIdr: number
    paidPrevIdr: number
    paidByMethod: { qris: number; tunai: number; transfer: number; deposit: number }
    unpaidCount: number
    unpaidIdr: number
    estimated_margin_idr: number
    cash_profit_idr: number
    cashProfitPending: number
    balance: { synced_balance_idr: number | null; reserve_idr: number; safe_balance_idr: number | null; reserveCount: number; syncedAt: number | null }
  }
  chart: Array<{ bucket: string; nonCod: number; cod: number }>
  recent: Array<{ slug: string; courier: string; recipient: string | null; due: number; payment: string; method: string | null; status: string; at: number }>
  couriers: Array<{ courier: string; shipments: number; delivered: number; rts: number; estimated_margin_idr: number }>
  topSenders: Array<{ id: string; name: string; reseller: boolean; shipments: number }>
  sources: Array<{ channel: string; shipments: number }>
  actions: { unpaid: number; unpaidHold: number; stuck: number; failed: number; variance: number; readyForPickup: number }
}

const n = (v: unknown) => (typeof v === "number" ? v : 0)

function shipmentsIn(sql: SqlStorage, from: number, to: number): number {
  return n(sql.exec<{ c: number }>(`SELECT COUNT(*) AS c FROM shipments WHERE ${ISSUED} AND issued_at >= ? AND issued_at < ?`, from, to).one().c)
}

function paidIn(sql: SqlStorage, from: number, to: number): Array<{ method: string; total: number }> {
  return sql
    .exec<{ method: string; total: number }>(
      `SELECT method, SUM(CASE WHEN event = 'mark_paid' THEN amount_idr ELSE -amount_idr END) AS total FROM counter_receipts
       WHERE event IN ('mark_paid','void_payment') AND created_at >= ? AND created_at < ? GROUP BY method`,
      from,
      to,
    )
    .toArray()
}

export function ownerDashboard(sql: SqlStorage, p: Period, prev: Period, now: number): OwnerDashboard {
  const shipments = shipmentsIn(sql, p.fromMs, p.toMs)
  const split = sql.exec<{ cod: number; non: number }>(`SELECT SUM(cod_fee_mode != 'none') AS cod, SUM(cod_fee_mode = 'none') AS non FROM shipments WHERE ${ISSUED} AND issued_at >= ? AND issued_at < ?`, p.fromMs, p.toMs).one()
  const paid = paidIn(sql, p.fromMs, p.toMs)
  const byMethod = { qris: 0, tunai: 0, transfer: 0, deposit: 0 }
  for (const r of paid) if (r.method in byMethod) byMethod[r.method as keyof typeof byMethod] = n(r.total)
  const unpaid = sql.exec<{ c: number; s: number }>(`SELECT COUNT(*) AS c, SUM(counter_due_idr) AS s FROM shipments WHERE ${ISSUED} AND counter_payment_status = 'unpaid' AND issued_at >= ? AND issued_at < ?`, p.fromMs, p.toMs).one()
  const est = sql
    .exec<{ s: number }>(`SELECT SUM(q.estimated_margin_idr) AS s FROM shipments s JOIN quote_snapshots q ON q.id = s.quote_snapshot_id WHERE s.${ISSUED.replace(/ AND /g, " AND s.")} AND s.issued_at >= ? AND s.issued_at < ?`, p.fromMs, p.toMs)
    .one()
  // Laba Kas (spec 02 §3.5): counter paid/not required AND provider side reconciled (`/invoices`, TASK-401).
  const cash = sql
    .exec<{ s: number; pending: number }>(
      `SELECT SUM(${CASH_PROFIT_SQL}) AS s, SUM((${CASH_PROFIT_SQL}) IS NULL) AS pending
       FROM shipments s WHERE s.dispatch_state IN ('issued','provider_unpaid_hold') AND s.issued_at IS NOT NULL AND s.counter_payment_status IN ('paid','not_required') AND s.issued_at >= ? AND s.issued_at < ?`,
      p.fromMs,
      p.toMs,
    )
    .one()
  const conn = sql.exec<{ synced_balance_idr: number | null; last_invoice_synced_at: number | null }>("SELECT synced_balance_idr, last_invoice_synced_at FROM mengantar_connections LIMIT 1").toArray()[0]
  // Saldo Aman (spec 02 §4): balance minus the return exposure of parcels in return or held.
  const res = reserveOf(sql)
  const reserve = { s: res.total, c: res.rows.length }
  const balance = conn?.synced_balance_idr ?? null

  const buckets = new Map(bucketsOf(p).map((b) => [b, { bucket: b, nonCod: 0, cod: 0 }]))
  for (const r of sql.exec<{ issued_at: number; cod_fee_mode: string }>(`SELECT issued_at, cod_fee_mode FROM shipments WHERE ${ISSUED} AND issued_at >= ? AND issued_at < ?`, p.fromMs, p.toMs)) {
    const b = buckets.get(bucketOf(p, r.issued_at))
    if (b) b[r.cod_fee_mode === "none" ? "nonCod" : "cod"]++
  }

  const recent = sql
    .exec<{ slug: string; courier_code: string; true_recipient_json: string | null; counter_due_idr: number; counter_payment_status: string; counter_payment_method: string | null; status: string; issued_at: number }>(
      `SELECT slug, courier_code, true_recipient_json, counter_due_idr, counter_payment_status, counter_payment_method, status, issued_at FROM shipments WHERE ${ISSUED} AND issued_at >= ? AND issued_at < ? ORDER BY issued_at DESC LIMIT 10`,
      p.fromMs,
      p.toMs,
    )
    .toArray()
    .map((r) => ({ slug: r.slug, courier: r.courier_code, recipient: r.true_recipient_json ? ((JSON.parse(r.true_recipient_json) as { name?: string }).name ?? null) : null, due: r.counter_due_idr, payment: r.counter_payment_status, method: r.counter_payment_method, status: r.status, at: r.issued_at }))

  const couriers = sql
    .exec<{ courier: string; shipments: number; delivered: number; rts: number; margin: number }>(
      `SELECT s.courier_code AS courier, COUNT(*) AS shipments, SUM(s.status = 'delivered') AS delivered,
              SUM(s.status IN ('rts_in_transit','provider_returned','rts_at_gerai','rts_returned_to_sender')) AS rts, SUM(q.estimated_margin_idr) AS margin
       FROM shipments s LEFT JOIN quote_snapshots q ON q.id = s.quote_snapshot_id
       WHERE s.dispatch_state IN ('issued','provider_unpaid_hold') AND s.issued_at >= ? AND s.issued_at < ? GROUP BY s.courier_code ORDER BY shipments DESC`,
      p.fromMs,
      p.toMs,
    )
    .toArray()
    .map((r) => ({ courier: r.courier, shipments: n(r.shipments), delivered: n(r.delivered), rts: n(r.rts), estimated_margin_idr: n(r.margin) }))

  const topSenders = sql
    .exec<{ id: string; name: string; brand: string | null; kind: string; c: number }>(
      `SELECT c.id, c.true_name AS name, c.display_brand_name AS brand, c.sender_kind AS kind, COUNT(*) AS c FROM shipments s JOIN sender_contacts c ON c.id = s.sender_contact_id
       WHERE s.dispatch_state IN ('issued','provider_unpaid_hold') AND s.issued_at >= ? AND s.issued_at < ? GROUP BY c.id ORDER BY c DESC LIMIT 5`,
      p.fromMs,
      p.toMs,
    )
    .toArray()
    .map((r) => ({ id: r.id, name: r.brand ?? r.name, reseller: r.kind === "reseller_dropship", shipments: r.c }))

  const sources = sql.exec<{ channel: string; shipments: number }>(`SELECT entry_channel AS channel, COUNT(*) AS shipments FROM shipments WHERE ${ISSUED} AND issued_at >= ? AND issued_at < ? GROUP BY entry_channel ORDER BY shipments DESC`, p.fromMs, p.toMs).toArray()

  return {
    kpi: {
      shipments,
      shipmentsPrev: shipmentsIn(sql, prev.fromMs, prev.toMs),
      nonCod: n(split.non),
      cod: n(split.cod),
      paidIdr: Object.values(byMethod).reduce((a, b) => a + b, 0),
      paidPrevIdr: paidIn(sql, prev.fromMs, prev.toMs).reduce((a, r) => a + n(r.total), 0),
      paidByMethod: byMethod,
      unpaidCount: n(unpaid.c),
      unpaidIdr: n(unpaid.s),
      estimated_margin_idr: n(est.s),
      cash_profit_idr: n(cash.s),
      cashProfitPending: n(cash.pending),
      balance: { synced_balance_idr: balance, reserve_idr: n(reserve.s), safe_balance_idr: balance === null ? null : balance - n(reserve.s), reserveCount: n(reserve.c), syncedAt: conn?.last_invoice_synced_at ?? null },
    },
    chart: [...buckets.values()],
    recent,
    couriers,
    topSenders,
    sources,
    actions: actionsOf(sql, now),
  }
}

/** `Perlu tindakan` — counts that need a person now (not period-bound). */
export function actionsOf(sql: SqlStorage, now: number): OwnerDashboard["actions"] {
  const r = sql
    .exec<{ unpaid: number; hold: number; stuck: number; failed: number; ready: number }>(
      `SELECT SUM(dispatch_state = 'issued' AND counter_payment_status = 'unpaid') AS unpaid, SUM(dispatch_state = 'provider_unpaid_hold') AS hold,
              SUM(stuck_attention_at IS NOT NULL AND status = 'in_transit') AS stuck, SUM(dispatch_state = 'failed') AS failed,
              SUM(dispatch_state = 'issued' AND status = 'ready_for_pickup') AS ready
       FROM shipments`,
    )
    .one()
  const variance = n(sql.exec<{ c: number }>("SELECT COUNT(*) AS c FROM cashier_shifts WHERE state = 'closed' AND variance_idr != 0 AND closed_at >= ?", now - 7 * 86_400_000).one().c)
  return { unpaid: n(r.unpaid), unpaidHold: n(r.hold), stuck: n(r.stuck), failed: n(r.failed), variance, readyForPickup: n(r.ready) }
}

export interface CounterHome {
  shift: { id: string; opened_at: number } | null
  today: { shipments: number; unpaid: number }
  actions: { unpaid: number; unpaidHold: number; failed: number; readyForPickup: number }
  drafts: Array<{ slug: string; recipient: string | null; created_at: number }>
}

/** Kasir home (`Tugas Loket Hari Ini`): counts and tasks only — no money, profit, cost or balance (DEC-213). */
export function counterHome(sql: SqlStorage, userId: string, today: Period, now: number): CounterHome {
  const shift = sql.exec<{ id: string; opened_at: number }>("SELECT id, opened_at FROM cashier_shifts WHERE cashier_user_id = ? AND state = 'open' LIMIT 1", userId).toArray()[0] ?? null
  const t = sql.exec<{ c: number; u: number }>(`SELECT COUNT(*) AS c, SUM(counter_payment_status = 'unpaid') AS u FROM shipments WHERE ${ISSUED} AND issued_at >= ? AND issued_at < ?`, today.fromMs, today.toMs).one()
  const a = actionsOf(sql, now)
  const drafts = sql
    .exec<{ slug: string; recipient_contact_id: string | null; created_at: number }>("SELECT slug, recipient_contact_id, created_at FROM shipments WHERE dispatch_state = 'draft' AND created_at >= ? ORDER BY created_at DESC LIMIT 5", now - 2 * 86_400_000)
    .toArray()
    .map((d) => ({ slug: d.slug, created_at: d.created_at, recipient: d.recipient_contact_id ? (sql.exec<{ name: string }>("SELECT name FROM recipient_contacts WHERE id = ?", d.recipient_contact_id).toArray()[0]?.name ?? null) : null }))
  return { shift, today: { shipments: n(t.c), unpaid: n(t.u) }, actions: { unpaid: a.unpaid, unpaidHold: a.unpaidHold, failed: a.failed, readyForPickup: a.readyForPickup }, drafts }
}

/** Absolute per-WIB-day counters pushed to D1 `tenant_daily_stats` through the outbox (Super Admin, no PII). */
export function dailyStatsOf(sql: SqlStorage, day: Period): { shipments: number; cod_shipments: number; counter_paid_idr: number; cancelled: number } {
  const s = sql.exec<{ c: number; cod: number }>(`SELECT COUNT(*) AS c, SUM(cod_fee_mode != 'none') AS cod FROM shipments WHERE ${ISSUED} AND issued_at >= ? AND issued_at < ?`, day.fromMs, day.toMs).one()
  const cancelled = sql.exec<{ c: number }>("SELECT COUNT(*) AS c FROM shipments WHERE dispatch_state = 'cancelled' AND cancelled_at >= ? AND cancelled_at < ?", day.fromMs, day.toMs).one()
  return { shipments: n(s.c), cod_shipments: n(s.cod), counter_paid_idr: paidIn(sql, day.fromMs, day.toMs).reduce((x, r) => x + n(r.total), 0), cancelled: n(cancelled.c) }
}
