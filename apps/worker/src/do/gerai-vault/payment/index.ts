// Counter payment record (DEC-220, spec 03 §1.1). The outlet collects the money itself; this only records it.
// Every monetary event appends a `counter_receipts` row in the same transaction as the shipment projection; an
// idempotency key makes a double tap return the first receipt.
export type PayMethod = "qris" | "tunai" | "transfer" | "deposit"
export type PaymentError = { code: string; message: string; status: number }

export interface Receipt {
  id: string
  shipment_slug: string
  event: "mark_paid" | "void_payment" | "sender_cod_payout" | "void_sender_payout"
  direction: "in" | "out"
  amount_idr: number
  method: PayMethod
  cash_received_idr: number | null
  change_idr: number | null
  shift_id: string | null
  actor_user_id: string
  reason: string | null
  voids_receipt_id: string | null
  idempotency_key: string
  created_at: number
}

const err = (status: number, code: string, message: string): { ok: false; error: PaymentError } => ({ ok: false, error: { status, code, message } })

function existing(sql: SqlStorage, key: string): Receipt | null {
  return (sql.exec("SELECT * FROM counter_receipts WHERE idempotency_key = ?", key).toArray()[0] as unknown as Receipt) ?? null
}

/** `unpaid` → `paid` with a `mark_paid` receipt (spec 03 §1.1). Call inside `transactionSync`. */
export function markPaid(
  sql: SqlStorage,
  tenantId: string,
  p: { slug: string; method: unknown; cashReceivedIdr?: unknown; note?: unknown; idempotencyKey: string; actorId: string; shiftId: string | null },
  now: number,
): { ok: true; value: Receipt; replayed: boolean } | { ok: false; error: PaymentError } {
  const prior = existing(sql, p.idempotencyKey)
  if (prior) return prior.shipment_slug === p.slug && prior.event === "mark_paid" ? { ok: true, value: prior, replayed: true } : err(409, "IDEMPOTENCY_KEY_REUSED", "Permintaan ini sudah dipakai untuk transaksi lain.")
  const s = sql.exec<{ counter_payment_status: string; counter_due_idr: number; dispatch_state: string }>("SELECT counter_payment_status, counter_due_idr, dispatch_state FROM shipments WHERE slug = ?", p.slug).toArray()[0]
  if (!s) return err(404, "SHIPMENT_NOT_FOUND", "Kiriman tidak ditemukan.")
  if (s.dispatch_state === "cancelled") return err(409, "SHIPMENT_CANCELLED", "Kiriman sudah dibatalkan.")
  if (s.counter_payment_status !== "unpaid") return err(409, "NOT_UNPAID", s.counter_payment_status === "paid" ? "Kiriman ini sudah lunas." : "Kiriman ini tidak perlu dibayar di loket.")
  const method = p.method as PayMethod
  if (!["qris", "tunai", "transfer", "deposit"].includes(method)) return err(422, "INVALID_METHOD", "Pilih cara bayar: QRIS gerai, Tunai, Transfer atau Deposit.")
  let cash: number | null = null
  let change: number | null = null
  if (method === "tunai") {
    cash = typeof p.cashReceivedIdr === "number" ? p.cashReceivedIdr : Number(p.cashReceivedIdr)
    if (!Number.isSafeInteger(cash) || cash < s.counter_due_idr) return err(422, "CASH_TOO_LOW", "Uang diterima kurang dari total tagihan.")
    change = cash - s.counter_due_idr
  }
  const id = crypto.randomUUID()
  sql.exec(
    `INSERT INTO counter_receipts (id, tenant_id, shipment_slug, event, direction, amount_idr, method, cash_received_idr, change_idr, shift_id, actor_user_id, idempotency_key, created_at)
     VALUES (?, ?, ?, 'mark_paid', 'in', ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    tenantId,
    p.slug,
    s.counter_due_idr,
    method,
    cash,
    change,
    p.shiftId,
    p.actorId,
    p.idempotencyKey,
    now,
  )
  const note = typeof p.note === "string" ? p.note.trim().slice(0, 120) || null : null
  sql.exec(
    "UPDATE shipments SET counter_payment_status = 'paid', counter_payment_method = ?, counter_paid_at = ?, counter_paid_by = ?, counter_paid_shift_id = ?, counter_payment_note = ?, counter_total_paid_idr = counter_total_paid_idr + ?, updated_at = ? WHERE slug = ?",
    method,
    now,
    p.actorId,
    p.shiftId,
    note,
    s.counter_due_idr,
    now,
    p.slug,
  )
  return { ok: true, value: existing(sql, p.idempotencyKey)!, replayed: false }
}

/** `paid` → `unpaid` with a negative receipt in the current shift (owner; Kasir only in the same open shift). */
export function voidPayment(
  sql: SqlStorage,
  tenantId: string,
  p: { slug: string; reason: unknown; idempotencyKey: string; actorId: string; role: "gerai_admin" | "cashier"; shiftId: string | null },
  now: number,
): { ok: true; value: Receipt; replayed: boolean } | { ok: false; error: PaymentError } {
  const prior = existing(sql, p.idempotencyKey)
  if (prior) return prior.shipment_slug === p.slug && prior.event === "void_payment" ? { ok: true, value: prior, replayed: true } : err(409, "IDEMPOTENCY_KEY_REUSED", "Permintaan ini sudah dipakai untuk transaksi lain.")
  const reason = typeof p.reason === "string" ? p.reason.trim() : ""
  if (reason.length < 3 || reason.length > 200) return err(422, "REASON_REQUIRED", "Tulis alasan pembatalan pembayaran.")
  const s = sql.exec<{ counter_payment_status: string }>("SELECT counter_payment_status FROM shipments WHERE slug = ?", p.slug).toArray()[0]
  if (!s) return err(404, "SHIPMENT_NOT_FOUND", "Kiriman tidak ditemukan.")
  if (s.counter_payment_status !== "paid") return err(409, "NOT_PAID", "Kiriman ini belum lunas.")
  const paid = sql.exec<Receipt & Record<string, SqlStorageValue>>("SELECT * FROM counter_receipts WHERE shipment_slug = ? AND event = 'mark_paid' AND id NOT IN (SELECT voids_receipt_id FROM counter_receipts WHERE voids_receipt_id IS NOT NULL) ORDER BY created_at DESC LIMIT 1", p.slug).toArray()[0]
  if (!paid) return err(409, "NOT_PAID", "Kiriman ini belum lunas.")
  if (p.role === "cashier" && (!p.shiftId || paid.shift_id !== p.shiftId)) return err(403, "OWNER_REQUIRED", "Pembatalan pembayaran dari shift lain hanya bisa dilakukan pemilik gerai.")
  const id = crypto.randomUUID()
  sql.exec(
    `INSERT INTO counter_receipts (id, tenant_id, shipment_slug, event, direction, amount_idr, method, shift_id, actor_user_id, reason, voids_receipt_id, idempotency_key, created_at)
     VALUES (?, ?, ?, 'void_payment', 'out', ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    tenantId,
    p.slug,
    paid.amount_idr,
    paid.method,
    p.shiftId,
    p.actorId,
    reason,
    paid.id,
    p.idempotencyKey,
    now,
  )
  sql.exec(
    "UPDATE shipments SET counter_payment_status = 'unpaid', counter_payment_method = NULL, counter_paid_at = NULL, counter_paid_by = NULL, counter_paid_shift_id = NULL, counter_total_paid_idr = counter_total_paid_idr - ?, updated_at = ? WHERE slug = ?",
    paid.amount_idr,
    now,
    p.slug,
  )
  return { ok: true, value: existing(sql, p.idempotencyKey)!, replayed: false }
}

export function receiptsFor(sql: SqlStorage, slug: string): Receipt[] {
  return sql.exec("SELECT * FROM counter_receipts WHERE shipment_slug = ? ORDER BY created_at", slug).toArray() as unknown as Receipt[]
}
