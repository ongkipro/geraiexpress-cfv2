// Book 2 — Mengantar seller mirror (TASK-401, spec 09, DEC-216). Pure SQL helpers run inside the tenant object:
// upsert an `/invoices` row (PII stripped), reconcile it to INVs by type, and record `Selisih Sync` findings.
// Reconciliation is idempotent: re-reading the same invoice sets (never adds) the per-INV provider amounts.

import { markClaimPaid } from "../exceptions"

export const FINAL_STATUSES = new Set(["statusCleared", "statusExpired"])
export const KNOWN_TYPES = new Set(["typeAddBalance", "typePayment", "typeReconciliation", "typeRefund", "typeWithdraw"])

type Raw = Record<string, unknown>
const int = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) ? v : typeof v === "string" && /^-?\d+$/.test(v.trim()) ? Number(v.trim()) : null)
const str = (v: unknown, max = 120): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)
const ms = (v: unknown): number | null => {
  if (typeof v !== "string" && typeof v !== "number") return null
  const t = typeof v === "number" ? v : Date.parse(v)
  return Number.isFinite(t) ? t : null
}

/** Sub-item fields kept in the mirror; receiver name/phone, goods and pickup names are never stored. */
const PII = ["RECEIVER_NAME", "RECEIVER_PHONE", "RECEIVER_ADDRESS", "GOODS_DESC", "PICKUP_NAME", "PICKUP_PHONE", "PICKUP_ADDRESS", "SHIPPER_NAME", "SHIPPER_PHONE"]
export function stripPii(o: Raw): Raw {
  const out: Raw = {}
  for (const [k, v] of Object.entries(o)) {
    if (PII.includes(k) || /phone|address|receiver|shipper|pickup_name/i.test(k)) continue
    out[k] = Array.isArray(v) ? v.map((x) => (x && typeof x === "object" ? stripPii(x as Raw) : x)) : v && typeof v === "object" ? stripPii(v as Raw) : v
  }
  return out
}

export type ShipmentRef = {
  slug: string
  cod_fee_mode: string
  expected_credit: number | null
  expected_debit: number | null
}

function findSlug(sql: SqlStorage, ref: { awb?: string | null; order?: string | null }): ShipmentRef | null {
  const q = `SELECT s.slug, s.cod_fee_mode, s.expected_provider_cod_credit_idr AS expected_credit,
               (q.provider_net_shipping_idr + COALESCE(q.insurance_fee_idr, 0)) AS expected_debit
             FROM shipments s LEFT JOIN quote_snapshots q ON q.id = s.quote_snapshot_id WHERE `
  if (ref.awb) {
    const r = sql.exec<ShipmentRef>(`${q} UPPER(s.awb_number) = ?`, ref.awb.toUpperCase()).toArray()[0]
    if (r) return r
  }
  if (ref.order) return sql.exec<ShipmentRef>(`${q} s.mengantar_order_code = ?`, ref.order).toArray()[0] ?? null
  return null
}

function flag(sql: SqlStorage, invoiceId: string, kind: string, slug: string | null, expected: number | null, actual: number | null, detail: string, now: number): void {
  sql.exec(
    `INSERT INTO finance_discrepancies (id, invoice_id, kind, shipment_slug, expected_idr, actual_idr, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(invoice_id, kind, shipment_slug) DO UPDATE SET expected_idr = excluded.expected_idr, actual_idr = excluded.actual_idr, detail = excluded.detail`,
    crypto.randomUUID(),
    invoiceId,
    kind,
    slug ?? "",
    expected,
    actual,
    detail.slice(0, 300),
    now,
  )
}

export type Outcome = { invoiceId: string; type: string; linked: number; unlinked: number; final: boolean; status: string | null; balance: number | null; created: number | null; isNew: boolean }

/** Upsert one `/invoices` item and reconcile it. Returns what happened (for the run summary and balance). */
export function applyInvoice(sql: SqlStorage, raw: Raw, now: number): Outcome | null {
  const id = str(raw._id, 64)
  if (!id) return null
  const type = str(raw.type, 60) ?? "unknown"
  const status = str(raw.status, 40)
  const description = str(raw.description, 300)
  const subs = Array.isArray(raw.subItems) ? (raw.subItems as Raw[]) : []
  const clean = stripPii(raw)
  const known = sql.exec<{ c: number }>("SELECT COUNT(*) AS c FROM mengantar_invoice_mirror WHERE invoice_id = ?", id).one().c > 0
  sql.exec(
    `INSERT INTO mengantar_invoice_mirror (invoice_id, inv_number, type, status, courier, order_code, awb_number, amount_idr, total_idr, balance_amount_idr, description, provider_created_at, provider_updated_at, raw_json, link_state, first_seen_at, last_seen_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'unlinked', ?15, ?15)
     ON CONFLICT(invoice_id) DO UPDATE SET status = ?4, amount_idr = ?8, total_idr = ?9, balance_amount_idr = ?10, description = ?11, provider_updated_at = ?13, raw_json = ?14, last_seen_at = ?15`,
    id,
    str(raw.inv_number, 60),
    type,
    status,
    str(raw.courier, 40),
    str(raw.ORDER_ID, 60),
    str(raw.cnote_no, 60),
    int(raw.amount),
    int(raw.total),
    int(raw.balanceAmount),
    description,
    ms(raw.createdAt),
    ms(raw.updatedAt),
    JSON.stringify(clean),
    now,
  )
  sql.exec("DELETE FROM mengantar_invoice_subitems WHERE invoice_id = ?", id)
  subs.forEach((s, i) => {
    sql.exec(
      `INSERT INTO mengantar_invoice_subitems (invoice_id, idx, awb_number, order_code, batch_code, amount_idr, cod_amount_idr, estimated_price_idr, estimated_special_price_idr, cod_fee_raw_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      i,
      str(s.cnote_no, 60),
      str(s.ORDER_ID, 60),
      str(s.batch, 60),
      int(s.amount),
      int(s.COD_AMOUNT),
      int(s.estimatedPrice),
      int(s.estimatedSpecialPrice),
      s.COD_FEE === undefined || s.COD_FEE === null ? null : String(s.COD_FEE).slice(0, 40),
    )
  })
  let linked = 0
  let unlinked = 0
  let state: string = "not_applicable"
  // Only a cleared invoice moves money on the shipments (Book 2); pending/expired rows are mirrored and linked only.
  const cleared = status === "statusCleared"
  const link = (idx: number, ref: ShipmentRef) => sql.exec("UPDATE mengantar_invoice_subitems SET shipment_slug = ? WHERE invoice_id = ? AND idx = ?", ref.slug, id, idx)

  if (!KNOWN_TYPES.has(type)) {
    state = "unknown_type"
    flag(sql, id, "unknown_type", null, null, int(raw.amount), `Tipe ${type} belum dikenali${description ? `: ${description}` : ""}`, now)
  } else if (type === "typeReconciliation") {
    subs.forEach((s, i) => {
      const ref = findSlug(sql, { awb: str(s.cnote_no, 60), order: str(s.ORDER_ID, 60) })
      const amount = int(s.amount)
      if (!ref || amount === null) {
        unlinked++
        flag(sql, id, "unmatched", `#${i}`, null, amount, `COD cair untuk resi ${str(s.cnote_no, 60) ?? "?"} tidak ditemukan di gerai ini`, now)
        return
      }
      linked++
      link(i, ref)
      if (!cleared) return
      sql.exec("UPDATE shipments SET reconciled_provider_cod_credit_idr = ?, payment_sync_state = 'provider_invoice_reconciled', updated_at = ? WHERE slug = ?", amount, now, ref.slug)
      if (ref.expected_credit !== null && ref.expected_credit !== amount) {
        sql.exec("UPDATE shipments SET quote_drift = 1 WHERE slug = ?", ref.slug)
        flag(sql, id, "cod_credit_differs", ref.slug, ref.expected_credit, amount, "COD cair berbeda dari perkiraan saat resi terbit", now)
      }
    })
  } else if (type === "typePayment") {
    const d = (description ?? "").toLowerCase()
    const returned = /returned order\s+([A-Za-z0-9-]+)/i.exec(description ?? "")
    if (d.includes("penyesuaian")) {
      const awb = str(raw.cnote_no, 60) ?? subs.map((s) => str(s.cnote_no, 60)).find(Boolean) ?? null
      const ref = findSlug(sql, { awb, order: str(raw.ORDER_ID, 60) })
      if (ref) {
        linked++
        // A single-INV adjustment without sub-items still links (Mutasi Sync shows the INV).
        if (!subs.length) sql.exec("INSERT INTO mengantar_invoice_subitems (invoice_id, idx, awb_number, amount_idr, shipment_slug) VALUES (?, 0, ?, ?, ?)", id, awb, int(raw.amount), ref.slug)
        else subs.forEach((_s, i) => link(i, ref))
      } else unlinked++
      if (cleared) flag(sql, id, "adjustment", ref?.slug ?? null, null, int(raw.amount), "Penyesuaian berat/tujuan dari Mengantar", now)
    } else if (returned) {
      // Top-level references, then sub-item AWB/order, then the description token.
      const ref =
        findSlug(sql, { awb: str(raw.cnote_no, 60), order: str(raw.ORDER_ID, 60) }) ??
        subs.map((x) => findSlug(sql, { awb: str(x.cnote_no, 60), order: str(x.ORDER_ID, 60) })).find(Boolean) ??
        findSlug(sql, { awb: returned[1]!, order: returned[1]! })
      if (!ref) {
        unlinked++
        flag(sql, id, "unmatched", null, null, int(raw.amount), `Ongkir retur untuk resi ${returned[1]} tidak ditemukan di gerai ini`, now)
      } else {
        linked++
        if (subs.length) subs.forEach((_s, i) => link(i, ref))
        else sql.exec("INSERT INTO mengantar_invoice_subitems (invoice_id, idx, awb_number, amount_idr, shipment_slug) VALUES (?, 0, ?, ?, ?)", id, returned[1]!, int(raw.amount), ref.slug)
        // Sum of every CLEARED return debit linked to this INV, per invoice first: the sub-item amounts only when ALL
        // are known, else the invoice amount ONCE (never multiplied, never a partial total); re-reads never double-count.
        sql.exec(
          `UPDATE shipments SET reconciled_extra_adjustment_idr = (
             SELECT SUM(per_invoice) FROM (
               SELECT CASE WHEN COUNT(si.amount_idr) = COUNT(*) THEN SUM(ABS(si.amount_idr)) ELSE ABS(MAX(m.amount_idr)) END AS per_invoice
               FROM mengantar_invoice_subitems si JOIN mengantar_invoice_mirror m ON m.invoice_id = si.invoice_id
               WHERE si.shipment_slug = ?1 AND m.type = 'typePayment' AND m.status = 'statusCleared' AND LOWER(COALESCE(m.description, '')) LIKE '%returned order%'
               GROUP BY si.invoice_id)), updated_at = ?2 WHERE slug = ?1`,
          ref.slug,
          now,
        )
      }
    } else {
      // Non-COD batch payment: each sub-item debits `-estimatedSpecialPrice` for one order.
      subs.forEach((s, i) => {
        const ref = findSlug(sql, { awb: str(s.cnote_no, 60), order: str(s.ORDER_ID, 60) })
        const amount = int(s.amount)
        if (!ref || amount === null) {
          unlinked++
          flag(sql, id, "unmatched", `#${i}`, null, amount, `Pembayaran untuk resi ${str(s.cnote_no, 60) ?? "?"} tidak ditemukan di gerai ini`, now)
          return
        }
        linked++
        link(i, ref)
        if (!cleared) return
        const debit = Math.abs(amount)
        sql.exec("UPDATE shipments SET provider_reconciled_cost_idr = ?, payment_sync_state = 'provider_invoice_reconciled', updated_at = ? WHERE slug = ?", debit, now, ref.slug)
        if (ref.expected_debit !== null && ref.expected_debit !== debit) {
          sql.exec("UPDATE shipments SET quote_drift = 1 WHERE slug = ?", ref.slug)
          flag(sql, id, "debit_differs", ref.slug, ref.expected_debit, debit, "Potongan ongkir berbeda dari perkiraan saat resi terbit", now)
        }
      })
    }
  } else if (type === "typeRefund") {
    const m = /order\s+([A-Za-z0-9-]+)\s*$/i.exec(description ?? "")
    const awb = str(raw.cnote_no, 60) ?? subs.map((s) => str(s.cnote_no, 60)).find(Boolean) ?? m?.[1] ?? null
    if (subs.length) {
      // Each sub-item stands for its own order: resolve and link it independently (never borrow another's INV).
      // A single sub-item may rely on the invoice's own reference or its description token (spec 09 §2.2).
      const top = findSlug(sql, { awb: str(raw.cnote_no, 60), order: str(raw.ORDER_ID, 60) }) ?? (m?.[1] ? findSlug(sql, { awb: m[1], order: m[1] }) : null)
      subs.forEach((x, i) => {
        const ref = findSlug(sql, { awb: str(x.cnote_no, 60), order: str(x.ORDER_ID, 60) }) ?? (subs.length === 1 ? top : null)
        if (!ref) {
          unlinked++
          flag(sql, id, "unmatched", `#${i}`, null, int(x.amount), `Pengembalian dana untuk resi ${str(x.cnote_no, 60) ?? str(x.ORDER_ID, 60) ?? "?"} tidak ditemukan di gerai ini`, now)
          return
        }
        linked++
        link(i, ref)
        if (cleared) markClaimPaid(sql, ref.slug, id, now)
      })
    } else {
      // Top-level AWB/order, then the description token (as AWB or order id).
      const ref = findSlug(sql, { awb: str(raw.cnote_no, 60), order: str(raw.ORDER_ID, 60) }) ?? (m?.[1] ? findSlug(sql, { awb: m[1], order: m[1] }) : null)
      if (ref) {
        linked++
        sql.exec("INSERT INTO mengantar_invoice_subitems (invoice_id, idx, awb_number, amount_idr, shipment_slug) VALUES (?, 0, ?, ?, ?)", id, awb, int(raw.amount), ref.slug)
        if (cleared) markClaimPaid(sql, ref.slug, id, now)
      } else {
        unlinked++
        flag(sql, id, "unmatched", null, null, int(raw.amount), `Pengembalian dana untuk resi ${awb ?? "?"} tidak ditemukan di gerai ini`, now)
      }
    }
  }
  if (state !== "unknown_type" && (type === "typeReconciliation" || type === "typePayment" || type === "typeRefund")) state = unlinked === 0 ? "linked" : linked === 0 ? "unlinked" : "partial"
  sql.exec("UPDATE mengantar_invoice_mirror SET link_state = ? WHERE invoice_id = ?", state, id)
  return { invoiceId: id, type, linked, unlinked, final: status !== null && FINAL_STATUSES.has(status), status, balance: int(raw.balanceAmount), created: ms(raw.createdAt), isNew: !known }
}

/**
 * Balance from the newest `statusCleared` row (spec 09 §4) and a running-balance check: for cleared rows in time order,
 * `previous balance + amount` must equal `balanceAmount`; a gap is recorded once as `balance_gap` (never "fixed").
 */
export function settleBalance(sql: SqlStorage, now: number): { balance: number | null; gaps: number } {
  const rows = sql
    .exec<{ invoice_id: string; amount_idr: number | null; balance_amount_idr: number | null }>(
      "SELECT invoice_id, amount_idr, balance_amount_idr FROM mengantar_invoice_mirror WHERE status = 'statusCleared' AND balance_amount_idr IS NOT NULL ORDER BY provider_created_at, invoice_id",
    )
    .toArray()
  let gaps = 0
  const open = new Set<string>()
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]!
    const cur = rows[i]!
    if (cur.amount_idr === null || prev.balance_amount_idr === null) continue
    if (prev.balance_amount_idr + cur.amount_idr !== cur.balance_amount_idr) {
      gaps++
      open.add(cur.invoice_id)
      flag(sql, cur.invoice_id, "balance_gap", null, prev.balance_amount_idr + cur.amount_idr, cur.balance_amount_idr, "Saldo berjalan tidak cocok dengan mutasi sebelumnya", now)
    }
  }
  // A gap that no longer appears (the missing row arrived later) is closed, never left open forever.
  for (const g of sql.exec<{ invoice_id: string }>("SELECT invoice_id FROM finance_discrepancies WHERE kind = 'balance_gap' AND invoice_id != 'sync' AND resolved_at IS NULL").toArray()) {
    if (!open.has(g.invoice_id)) sql.exec("UPDATE finance_discrepancies SET resolved_at = ? WHERE kind = 'balance_gap' AND invoice_id = ?", now, g.invoice_id)
  }
  const newest = rows[rows.length - 1]
  return { balance: newest?.balance_amount_idr ?? null, gaps }
}
