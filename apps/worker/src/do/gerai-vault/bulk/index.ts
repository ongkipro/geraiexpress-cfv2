// `Paket Massal` storage inside the tenant object (spec 03 §1.3, spec 01 §2.5, DEC-229). Pure SQL helpers; callers
// run them inside `transactionSync`. Rows move pending → needs_fix | ready → created (one INV each) | removed.
import type { ValidRow } from "@gx/domain/bulk"
import type { PayMethod, PaymentError } from "../payment"
import { markPaid } from "../payment"

export type BulkState = "draft" | "checking" | "ready" | "dispatching" | "done" | "partially_failed" | "cancelled"
export type RowState = "pending" | "needs_fix" | "ready" | "created" | "removed"

export type BatchRow = {
  id: string
  sender_contact_id: string
  source: string
  file_name: string | null
  mask_preset: string
  cod_fee_mode: string
  service_code: string | null
  row_count: number
  ready_count: number
  failed_count: number
  state: BulkState
  counter_payment_status: string
  payment_idempotency_key: string | null
  cash_received_idr: number | null
  change_idr: number | null
  dispatch_lease_until: number | null
  created_by: string
  created_at: number
  updated_at: number
}

export type BulkRow = {
  batch_id: string
  row_no: number
  raw_json: string
  recipient_name: string | null
  recipient_phone: string | null
  street: string | null
  area_text: string | null
  area_id: string | null
  area_label: string | null
  postal_code: string | null
  content: string | null
  weight_gram: number | null
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  cod_goods_idr: number
  declared_value_idr: number
  note: string | null
  errors_json: string | null
  candidates_json: string | null
  publish_shipping_idr: number | null
  cod_fee_idr: number | null
  counter_due_idr: number | null
  cod_collection_total_idr: number | null
  sender_cod_payable_idr: number | null
  estimated_margin_idr: number | null
  quote_json: string | null
  quoted_at: number | null
  service_code: string | null
  dispatch_attempted_at: number | null
  dispatch_error: string | null
  state: RowState
  shipment_slug: string | null
}

export type BulkError = { status: number; code: string; message: string; fields?: Record<string, string> }
const err = (status: number, code: string, message: string): { ok: false; error: BulkError } => ({ ok: false, error: { status, code, message } })

export function readBatch(sql: SqlStorage, id: string): BatchRow | null {
  return sql.exec<BatchRow>("SELECT * FROM bulk_import_batches WHERE id = ?", id).toArray()[0] ?? null
}

export function readRows(sql: SqlStorage, id: string): BulkRow[] {
  return sql.exec<BulkRow>("SELECT * FROM bulk_import_rows WHERE batch_id = ? AND state != 'removed' ORDER BY row_no", id).toArray()
}

/** Recomputes the batch counters and lifecycle state from its rows. */
export function refreshCounts(sql: SqlStorage, id: string, now: number): BatchRow | null {
  const c = sql
    .exec<{ total: number; ready: number; fix: number; pending: number; created: number }>(
      `SELECT COUNT(*) AS total, SUM(state = 'ready') AS ready, SUM(state = 'needs_fix') AS fix, SUM(state = 'pending') AS pending, SUM(state = 'created') AS created
       FROM bulk_import_rows WHERE batch_id = ? AND state != 'removed'`,
      id,
    )
    .one()
  const b = readBatch(sql, id)
  if (!b) return null
  let state: BulkState = b.state
  if (["draft", "checking", "ready"].includes(b.state)) state = (c.pending ?? 0) > 0 ? "checking" : (c.ready ?? 0) > 0 ? "ready" : "draft"
  sql.exec("UPDATE bulk_import_batches SET row_count = ?, ready_count = ?, failed_count = ?, state = ?, updated_at = ? WHERE id = ?", c.total ?? 0, (c.ready ?? 0) + (c.created ?? 0), c.fix ?? 0, state, now, id)
  return readBatch(sql, id)
}

export function createBatch(
  sql: SqlStorage,
  tenantId: string,
  p: { senderId: string; source: "manual" | "csv"; fileName: string | null; maskPreset: string; codFeeMode: string; serviceCode: string; actorId: string },
  rows: Array<{ raw: Record<string, string>; valid: ValidRow | null; errors: string[] }>,
  now: number,
): BatchRow {
  const id = crypto.randomUUID()
  sql.exec(
    `INSERT INTO bulk_import_batches (id, tenant_id, sender_contact_id, source, file_name, mask_preset, cod_fee_mode, service_code, state, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'checking', ?, ?, ?)`,
    id,
    tenantId,
    p.senderId,
    p.source,
    p.fileName,
    p.maskPreset,
    p.codFeeMode,
    p.serviceCode,
    p.actorId,
    now,
    now,
  )
  rows.forEach((r, i) => insertRow(sql, id, i + 1, r, now))
  return refreshCounts(sql, id, now)!
}

function insertRow(sql: SqlStorage, batchId: string, rowNo: number, r: { raw: Record<string, string>; valid: ValidRow | null; errors: string[] }, _now: number): void {
  const v = r.valid
  sql.exec(
    `INSERT INTO bulk_import_rows (batch_id, row_no, raw_json, recipient_name, recipient_phone, street, area_text, postal_code, content, weight_gram, length_cm, width_cm, height_cm,
       cod_goods_idr, declared_value_idr, note, errors_json, state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(batch_id, row_no) DO UPDATE SET raw_json = excluded.raw_json, recipient_name = excluded.recipient_name, recipient_phone = excluded.recipient_phone,
       street = excluded.street, area_text = excluded.area_text, postal_code = excluded.postal_code, content = excluded.content, weight_gram = excluded.weight_gram,
       length_cm = excluded.length_cm, width_cm = excluded.width_cm, height_cm = excluded.height_cm, cod_goods_idr = excluded.cod_goods_idr,
       declared_value_idr = excluded.declared_value_idr, note = excluded.note, errors_json = excluded.errors_json, state = excluded.state,
       area_id = NULL, area_label = NULL, candidates_json = NULL, publish_shipping_idr = NULL, cod_fee_idr = NULL, counter_due_idr = NULL,
       cod_collection_total_idr = NULL, sender_cod_payable_idr = NULL, estimated_margin_idr = NULL`,
    batchId,
    rowNo,
    JSON.stringify(r.raw),
    v?.name ?? r.raw.name ?? null,
    v?.phone ?? r.raw.phone ?? null,
    v?.street ?? r.raw.street ?? null,
    v?.areaText ?? r.raw.areaText ?? null,
    v?.postalCode ?? null,
    v?.content ?? null,
    v?.weightGram ?? null,
    v?.dims?.lengthCm ?? null,
    v?.dims?.widthCm ?? null,
    v?.dims?.heightCm ?? null,
    v?.codGoodsIdr ?? 0,
    v?.declaredIdr ?? 0,
    v?.note ?? null,
    r.errors.length ? JSON.stringify(r.errors) : null,
    r.errors.length ? "needs_fix" : "pending",
  )
}

/** Inline edit of one row (re-validated by the caller); a picked area skips matching. */
export function editRow(sql: SqlStorage, batchId: string, rowNo: number, r: { raw: Record<string, string>; valid: ValidRow | null; errors: string[] }, area: { id: string; label: string } | null, now: number): { ok: true } | { ok: false; error: BulkError } {
  const b = readBatch(sql, batchId)
  if (!b) return err(404, "BATCH_NOT_FOUND", "Batch tidak ditemukan.")
  if (!["draft", "checking", "ready"].includes(b.state)) return err(409, "BATCH_LOCKED", "Kiriman batch ini sudah dibuat; baris tidak bisa diubah.")
  const cur = sql.exec<{ state: string }>("SELECT state FROM bulk_import_rows WHERE batch_id = ? AND row_no = ?", batchId, rowNo).toArray()[0]
  if (!cur || cur.state === "created" || cur.state === "removed") return err(404, "ROW_NOT_FOUND", "Baris tidak ditemukan.")
  insertRow(sql, batchId, rowNo, r, now)
  if (area && r.valid) sql.exec("UPDATE bulk_import_rows SET area_id = ?, area_label = ? WHERE batch_id = ? AND row_no = ?", area.id, area.label, batchId, rowNo)
  refreshCounts(sql, batchId, now)
  return { ok: true }
}

export function removeRow(sql: SqlStorage, batchId: string, rowNo: number, now: number): { ok: true } | { ok: false; error: BulkError } {
  const b = readBatch(sql, batchId)
  if (!b) return err(404, "BATCH_NOT_FOUND", "Batch tidak ditemukan.")
  if (!["draft", "checking", "ready"].includes(b.state)) return err(409, "BATCH_LOCKED", "Kiriman batch ini sudah dibuat; baris tidak bisa diubah.")
  sql.exec("UPDATE bulk_import_rows SET state = 'removed' WHERE batch_id = ? AND row_no = ? AND state IN ('pending','needs_fix','ready')", batchId, rowNo)
  refreshCounts(sql, batchId, now)
  return { ok: true }
}

/** Result of server-side area match + quote for one pending row. */
export type RowCheck =
  | { kind: "ready"; areaId: string; areaLabel: string; serviceCode: string; P: number; F: number; due: number; C: number; payable: number; margin: number; quoteJson: string; quotedAt: number }
  | { kind: "needs_fix"; errors: string[]; candidates?: Array<{ id: string; label: string }> }

export function applyCheck(sql: SqlStorage, batchId: string, rowNo: number, c: RowCheck, now: number): void {
  if (c.kind === "ready") {
    sql.exec(
      `UPDATE bulk_import_rows SET state = 'ready', errors_json = NULL, candidates_json = NULL, area_id = ?, area_label = ?, service_code = ?, publish_shipping_idr = ?, cod_fee_idr = ?,
         counter_due_idr = ?, cod_collection_total_idr = ?, sender_cod_payable_idr = ?, estimated_margin_idr = ?, quote_json = ?, quoted_at = ? WHERE batch_id = ? AND row_no = ? AND state = 'pending'`,
      c.areaId,
      c.areaLabel,
      c.serviceCode,
      c.P,
      c.F,
      c.due,
      c.C,
      c.payable,
      c.margin,
      c.quoteJson,
      c.quotedAt,
      batchId,
      rowNo,
    )
  } else {
    sql.exec(
      "UPDATE bulk_import_rows SET state = 'needs_fix', errors_json = ?, candidates_json = ? WHERE batch_id = ? AND row_no = ? AND state = 'pending'",
      JSON.stringify(c.errors),
      c.candidates?.length ? JSON.stringify(c.candidates) : null,
      batchId,
      rowNo,
    )
  }
  refreshCounts(sql, batchId, now)
}

export function totalsOf(rows: BulkRow[]): { ongkir: number; codCollected: number; codFee: number; senderPayable: number; due: number; estimated_margin_idr: number } {
  const live = rows.filter((r) => r.state === "ready" || r.state === "created")
  const sum = (f: (r: BulkRow) => number | null) => live.reduce((a, r) => a + (f(r) ?? 0), 0)
  return { ongkir: sum((r) => r.publish_shipping_idr), codCollected: sum((r) => r.cod_collection_total_idr), codFee: sum((r) => r.cod_fee_idr), senderPayable: sum((r) => r.sender_cod_payable_idr), due: sum((r) => r.counter_due_idr), estimated_margin_idr: sum((r) => r.estimated_margin_idr) }
}

/**
 * Atomic batch payment (spec 01 §2.5): one `mark_paid` per unpaid INV, idempotency key `<batch key>:<slug>`, all in
 * the caller's transaction — any refusal throws, so either every row commits or none does.
 */
export function payBatch(
  sql: SqlStorage,
  tenantId: string,
  p: { batchId: string; method: unknown; cashReceivedIdr?: unknown; idempotencyKey: string; actorId: string; shiftId: string | null },
  now: number,
): { ok: true; value: { paid: number; totalIdr: number; changeIdr: number | null; replayed: boolean } } | { ok: false; error: BulkError | PaymentError } {
  const b = readBatch(sql, p.batchId)
  if (!b) return err(404, "BATCH_NOT_FOUND", "Batch tidak ditemukan.")
  if (b.counter_payment_status === "paid") {
    if (b.payment_idempotency_key === p.idempotencyKey) return { ok: true, value: { paid: 0, totalIdr: 0, changeIdr: b.change_idr, replayed: true } }
    return err(409, "NOT_UNPAID", "Batch ini sudah lunas.")
  }
  const slugs = sql
    .exec<{ slug: string; counter_due_idr: number }>(
      "SELECT s.slug, s.counter_due_idr FROM shipments s JOIN bulk_import_rows r ON r.shipment_slug = s.slug WHERE r.batch_id = ? AND s.counter_payment_status = 'unpaid' AND s.dispatch_state != 'cancelled' ORDER BY r.row_no",
      p.batchId,
    )
    .toArray()
  if (slugs.length === 0) return err(409, "NOTHING_TO_PAY", "Tidak ada kiriman yang perlu dibayar di batch ini.")
  const total = slugs.reduce((a, s) => a + s.counter_due_idr, 0)
  const method = p.method as PayMethod
  let change: number | null = null
  let cash: number | null = null
  if (method === "tunai") {
    cash = typeof p.cashReceivedIdr === "number" ? p.cashReceivedIdr : Number(p.cashReceivedIdr)
    if (!Number.isSafeInteger(cash) || cash < total) return err(422, "CASH_TOO_LOW", "Uang diterima kurang dari total tagihan batch.")
    change = cash - total
  }
  for (const s of slugs) {
    // Per-INV receipts carry no cash/change (the batch holds those); tunai `cashReceivedIdr` = the row's due.
    const r = markPaid(sql, tenantId, { slug: s.slug, method, cashReceivedIdr: s.counter_due_idr, idempotencyKey: `${p.idempotencyKey}:${s.slug}`, actorId: p.actorId, shiftId: p.shiftId }, now)
    if (!r.ok) throw new BatchPaymentAbort(r.error)
    sql.exec("UPDATE counter_receipts SET bulk_batch_id = ?, cash_received_idr = NULL, change_idr = NULL WHERE id = ?", p.batchId, r.value.id)
  }
  sql.exec("UPDATE bulk_import_batches SET counter_payment_status = 'paid', payment_idempotency_key = ?, cash_received_idr = ?, change_idr = ?, updated_at = ? WHERE id = ?", p.idempotencyKey, cash, change, now, p.batchId)
  return { ok: true, value: { paid: slugs.length, totalIdr: total, changeIdr: change, replayed: false } }
}

/** Thrown inside the batch-payment transaction to roll every receipt back. */
export class BatchPaymentAbort extends Error {
  constructor(readonly error: PaymentError) {
    super(error.code)
  }
}

export function listBatches(sql: SqlStorage, limit = 50): Array<BatchRow & { sender_name: string | null; total_due_idr: number }> {
  return sql
    .exec<BatchRow & { sender_name: string | null; total_due_idr: number }>(
      `SELECT b.*, s.true_name AS sender_name,
         (SELECT COALESCE(SUM(counter_due_idr), 0) FROM bulk_import_rows r WHERE r.batch_id = b.id AND r.state IN ('ready','created')) AS total_due_idr
       FROM bulk_import_batches b LEFT JOIN sender_contacts s ON s.id = b.sender_contact_id ORDER BY b.created_at DESC LIMIT ?`,
      Math.min(200, limit),
    )
    .toArray()
}
