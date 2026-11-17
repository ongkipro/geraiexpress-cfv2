// Cash drawer shifts (spec 03 §4, ADR-0004 §3) and sender COD payout (spec 03 §1.2). Synchronous helpers used inside
// `transactionSync`. Money counts in the shift where the receipt was written (`counter_receipts.shift_id`).
export type ShiftRow = {
  id: string
  tenant_id: string
  cashier_user_id: string
  opened_at: number
  opening_float_idr: number
  closed_at: number | null
  counted_cash_idr: number | null
  expected_cash_idr: number | null
  variance_idr: number | null
  variance_reason_code: string | null
  variance_note: string | null
  state: "open" | "closed"
}
export type ShiftError = { status: number; code: string; message: string; fields?: Record<string, string> }
export const VARIANCE_REASONS = ["salah_kembalian", "uang_palsu", "lupa_catat", "pengeluaran_kecil", "selisih_lain"] as const

export function openShiftOf(sql: SqlStorage, userId: string): ShiftRow | null {
  return sql.exec<ShiftRow>("SELECT * FROM cashier_shifts WHERE cashier_user_id = ? AND state = 'open'", userId).toArray()[0] ?? null
}

export function openShift(sql: SqlStorage, tenantId: string, userId: string, floatIdr: unknown, now: number): { ok: true; value: ShiftRow } | { ok: false; error: ShiftError } {
  if (openShiftOf(sql, userId)) return { ok: false, error: { status: 409, code: "SHIFT_ALREADY_OPEN", message: "Shift Anda masih terbuka. Tutup dulu sebelum membuka shift baru." } }
  const f = typeof floatIdr === "number" ? floatIdr : Number(floatIdr)
  if (!Number.isSafeInteger(f) || f < 0 || f > 100_000_000) return { ok: false, error: { status: 422, code: "INVALID_FLOAT", message: "Isi modal awal laci (Rp0 atau lebih).", fields: { openingFloatIdr: "Nominal tidak valid." } } }
  const id = crypto.randomUUID()
  sql.exec("INSERT INTO cashier_shifts (id, tenant_id, cashier_user_id, opened_at, opening_float_idr, state) VALUES (?, ?, ?, ?, ?, 'open')", id, tenantId, userId, now, f)
  return { ok: true, value: openShiftOf(sql, userId)! }
}

export interface ShiftTotals {
  tunaiIn: number
  tunaiOut: number
  voidTunai: number
  codPayoutTunai: number
  qris: number
  transfer: number
  deposit: number
  expectedCash: number
}

/** Live drawer state from this shift's receipts (spec 03 §4.2). */
export function shiftTotals(sql: SqlStorage, s: ShiftRow): ShiftTotals {
  const rows = sql.exec<{ event: string; direction: string; method: string; amount_idr: number }>("SELECT event, direction, method, amount_idr FROM counter_receipts WHERE shift_id = ?", s.id).toArray()
  const t: ShiftTotals = { tunaiIn: 0, tunaiOut: 0, voidTunai: 0, codPayoutTunai: 0, qris: 0, transfer: 0, deposit: 0, expectedCash: 0 }
  let cashIn = 0
  let cashOut = 0
  for (const r of rows) {
    const sign = r.direction === "in" ? 1 : -1
    if (r.method === "tunai") {
      if (r.direction === "in") cashIn += r.amount_idr
      else cashOut += r.amount_idr
      if (r.direction === "in") t.tunaiIn += r.amount_idr
      else t.tunaiOut += r.amount_idr
      // Display lines: sales in, voided sales, net COD payouts (a reversed payout nets inside its own line, never
      // also as "Tunai masuk"), so Modal + Tunai masuk − Void − Pencairan == expectedCash.
      if (r.event === "void_payment") t.voidTunai += r.amount_idr
      if (r.event === "sender_cod_payout") t.codPayoutTunai += r.amount_idr
      if (r.event === "void_sender_payout") {
        t.codPayoutTunai -= r.amount_idr
        t.tunaiIn -= r.amount_idr
      }
    } else if (r.method === "qris") t.qris += sign * r.amount_idr
    else if (r.method === "transfer") t.transfer += sign * r.amount_idr
    else t.deposit += sign * r.amount_idr
  }
  t.expectedCash = s.opening_float_idr + cashIn - cashOut
  return t
}

export function closeShift(
  sql: SqlStorage,
  userId: string,
  p: { countedCashIdr: unknown; reasonCode?: unknown; note?: unknown },
  now: number,
): { ok: true; value: ShiftRow & { totals: ShiftTotals } } | { ok: false; error: ShiftError } {
  const s = openShiftOf(sql, userId)
  if (!s) return { ok: false, error: { status: 409, code: "NO_OPEN_SHIFT", message: "Tidak ada shift yang terbuka." } }
  const counted = typeof p.countedCashIdr === "number" ? p.countedCashIdr : Number(p.countedCashIdr)
  if (!Number.isSafeInteger(counted) || counted < 0) return { ok: false, error: { status: 422, code: "INVALID_COUNT", message: "Isi jumlah uang tunai fisik di laci.", fields: { countedCashIdr: "Nominal tidak valid." } } }
  const totals = shiftTotals(sql, s)
  const variance = counted - totals.expectedCash
  const code = typeof p.reasonCode === "string" && (VARIANCE_REASONS as readonly string[]).includes(p.reasonCode) ? p.reasonCode : null
  const note = typeof p.note === "string" ? p.note.trim().slice(0, 300) : ""
  if (variance !== 0 && (!code || note.length < 3)) return { ok: false, error: { status: 422, code: "VARIANCE_REASON_REQUIRED", message: "Ada selisih kas. Pilih alasan dan tulis catatan sebelum menutup shift.", fields: { reasonCode: "Pilih alasan selisih.", note: "Tulis catatan singkat." } } }
  sql.exec(
    "UPDATE cashier_shifts SET state = 'closed', closed_at = ?, counted_cash_idr = ?, expected_cash_idr = ?, variance_idr = ?, variance_reason_code = ?, variance_note = ? WHERE id = ?",
    now,
    counted,
    totals.expectedCash,
    variance,
    variance === 0 ? null : code,
    variance === 0 ? null : note,
    s.id,
  )
  return { ok: true, value: { ...(sql.exec<ShiftRow>("SELECT * FROM cashier_shifts WHERE id = ?", s.id).one()), totals } }
}

type PayoutReceipt = { id: string; amount_idr: number; method: string; shift_id: string | null; idempotency_key: string; shipment_slug: string; event: string; created_at: number }

/**
 * Pays (part of) the sender's COD money (spec 03 §1.2). Eligible after the provider credit is reconciled, or by owner
 * override with a reason. A `tunai` payout counts in the actor's open shift when there is one (cash leaves that drawer);
 * with Shift Loket deferred (DEC-241, TASK-704) it is recorded without a shift (`shift_id = NULL`). `transfer` never
 * touches a drawer.
 */
export function senderPayout(
  sql: SqlStorage,
  tenantId: string,
  p: { slug: string; amountIdr: unknown; method: unknown; idempotencyKey: string; actorId: string; role: "gerai_admin" | "cashier"; cashierMayPay: boolean; shiftId: string | null; override?: unknown },
  now: number,
): { ok: true; value: PayoutReceipt; replayed: boolean; remaining: number } | { ok: false; error: ShiftError } {
  const prior = sql.exec<PayoutReceipt>("SELECT id, amount_idr, method, shift_id, idempotency_key, shipment_slug, event, created_at FROM counter_receipts WHERE idempotency_key = ?", p.idempotencyKey).toArray()[0]
  const s = sql.exec<{ cod_fee_mode: string; sender_cod_payable_idr: number; sender_cod_paid_idr: number | null; reconciled_provider_cod_credit_idr: number | null; dispatch_state: string }>(
    "SELECT cod_fee_mode, sender_cod_payable_idr, sender_cod_paid_idr, reconciled_provider_cod_credit_idr, dispatch_state FROM shipments WHERE slug = ?",
    p.slug,
  ).toArray()[0]
  if (prior) {
    if (prior.shipment_slug !== p.slug || prior.event !== "sender_cod_payout") return { ok: false, error: { status: 409, code: "IDEMPOTENCY_KEY_REUSED", message: "Permintaan ini sudah dipakai untuk transaksi lain." } }
    return { ok: true, value: prior, replayed: true, remaining: (s?.sender_cod_payable_idr ?? 0) - (s?.sender_cod_paid_idr ?? 0) }
  }
  if (!s) return { ok: false, error: { status: 404, code: "SHIPMENT_NOT_FOUND", message: "Kiriman tidak ditemukan." } }
  // Only an issued COD parcel that was not cancelled or returned can owe the sender anything.
  const st = sql.exec<{ status: string }>("SELECT status FROM shipments WHERE slug = ?", p.slug).one().status
  if (s.dispatch_state !== "issued" || ["cancelled", "rts_in_transit", "provider_returned", "rts_at_gerai", "rts_returned_to_sender", "lost"].includes(st)) {
    return { ok: false, error: { status: 409, code: "NOT_PAYABLE", message: "Kiriman ini tidak punya hak COD untuk dicairkan (belum terbit, dibatalkan, atau retur)." } }
  }
  if (p.role === "cashier" && !p.cashierMayPay) return { ok: false, error: { status: 403, code: "OWNER_ONLY", message: "Pencairan COD ke pengirim hanya oleh pemilik gerai." } }
  if (!["buyer_bears_fee", "sender_bears_fee", "cod_all_in"].includes(s.cod_fee_mode)) return { ok: false, error: { status: 409, code: "NOT_COD_GOODS", message: "Kiriman ini bukan COD Barang." } }
  const override = typeof p.override === "string" ? p.override.trim() : ""
  if (s.reconciled_provider_cod_credit_idr === null) {
    if (p.role !== "gerai_admin" || override.length < 5) return { ok: false, error: { status: 409, code: "COD_NOT_SETTLED", message: "Dana COD belum masuk ke saldo Mengantar gerai. Pemilik bisa bayar lebih dulu dengan alasan (Bayar sebelum cair)." } }
  }
  const method = p.method === "transfer" ? "transfer" : p.method === "tunai" ? "tunai" : null
  if (!method) return { ok: false, error: { status: 422, code: "INVALID_METHOD", message: "Pilih cara bayar: Tunai atau Transfer." } }
  const amount = typeof p.amountIdr === "number" ? p.amountIdr : Number(p.amountIdr)
  const remaining = s.sender_cod_payable_idr - (s.sender_cod_paid_idr ?? 0)
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > remaining) return { ok: false, error: { status: 422, code: "INVALID_AMOUNT", message: `Nominal pencairan 1–${remaining.toLocaleString("id-ID")} rupiah.`, fields: { amountIdr: "Melebihi sisa hak COD." } } }
  const id = crypto.randomUUID()
  sql.exec(
    `INSERT INTO counter_receipts (id, tenant_id, shipment_slug, event, direction, amount_idr, method, shift_id, actor_user_id, reason, idempotency_key, created_at)
     VALUES (?, ?, ?, 'sender_cod_payout', 'out', ?, ?, ?, ?, ?, ?, ?)`,
    id,
    tenantId,
    p.slug,
    amount,
    method,
    method === "tunai" ? p.shiftId : null,
    p.actorId,
    s.reconciled_provider_cod_credit_idr === null ? `Bayar sebelum cair: ${override}` : null,
    p.idempotencyKey,
    now,
  )
  sql.exec("UPDATE shipments SET sender_cod_paid_idr = COALESCE(sender_cod_paid_idr, 0) + ?, updated_at = ? WHERE slug = ?", amount, now, p.slug)
  return { ok: true, value: sql.exec<PayoutReceipt>("SELECT id, amount_idr, method, shift_id, idempotency_key, shipment_slug, event, created_at FROM counter_receipts WHERE id = ?", id).one(), replayed: false, remaining: remaining - amount }
}

/** Owner-only reversal of one payout (reason required); a `tunai` reversal lands in the open shift if any (DEC-241). */
export function voidSenderPayout(
  sql: SqlStorage,
  tenantId: string,
  p: { slug: string; receiptId: string; reason: unknown; idempotencyKey: string; actorId: string; role: "gerai_admin" | "cashier"; shiftId: string | null },
  now: number,
): { ok: true; value: PayoutReceipt; replayed: boolean } | { ok: false; error: ShiftError } {
  const prior = sql.exec<PayoutReceipt>("SELECT id, amount_idr, method, shift_id, idempotency_key, shipment_slug, event, created_at FROM counter_receipts WHERE idempotency_key = ?", p.idempotencyKey).toArray()[0]
  if (prior) return prior.event === "void_sender_payout" ? { ok: true, value: prior, replayed: true } : { ok: false, error: { status: 409, code: "IDEMPOTENCY_KEY_REUSED", message: "Permintaan ini sudah dipakai untuk transaksi lain." } }
  if (p.role !== "gerai_admin") return { ok: false, error: { status: 403, code: "OWNER_ONLY", message: "Pembatalan pencairan hanya oleh pemilik gerai." } }
  const reason = typeof p.reason === "string" ? p.reason.trim() : ""
  if (reason.length < 3) return { ok: false, error: { status: 422, code: "REASON_REQUIRED", message: "Tulis alasan pembatalan pencairan." } }
  const r = sql.exec<{ id: string; amount_idr: number; method: string }>(
    "SELECT id, amount_idr, method FROM counter_receipts WHERE id = ? AND shipment_slug = ? AND event = 'sender_cod_payout' AND id NOT IN (SELECT voids_receipt_id FROM counter_receipts WHERE voids_receipt_id IS NOT NULL)",
    p.receiptId,
    p.slug,
  ).toArray()[0]
  if (!r) return { ok: false, error: { status: 404, code: "PAYOUT_NOT_FOUND", message: "Pencairan tidak ditemukan atau sudah dibatalkan." } }
  const id = crypto.randomUUID()
  sql.exec(
    `INSERT INTO counter_receipts (id, tenant_id, shipment_slug, event, direction, amount_idr, method, shift_id, actor_user_id, reason, voids_receipt_id, idempotency_key, created_at)
     VALUES (?, ?, ?, 'void_sender_payout', 'in', ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    tenantId,
    p.slug,
    r.amount_idr,
    r.method,
    r.method === "tunai" ? p.shiftId : null,
    p.actorId,
    reason,
    r.id,
    p.idempotencyKey,
    now,
  )
  sql.exec("UPDATE shipments SET sender_cod_paid_idr = sender_cod_paid_idr - ?, updated_at = ? WHERE slug = ?", r.amount_idr, now, p.slug)
  return { ok: true, value: sql.exec<PayoutReceipt>("SELECT id, amount_idr, method, shift_id, idempotency_key, shipment_slug, event, created_at FROM counter_receipts WHERE id = ?", id).one(), replayed: false }
}
