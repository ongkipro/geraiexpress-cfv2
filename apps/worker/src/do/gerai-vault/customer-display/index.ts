// Layar Pelanggan (TASK-701, PR-22, spec 03 §5): paired customer displays. The object stores only SHA-256(token); a
// member has at most one live pairing; a pairing made inside an open shift dies with that shift. The display state is
// built here field by field from a closed schema, so cost, margin, phone numbers or addresses can never enter it.
import { openShiftOf } from "../shift"

export const DISPLAY_TTL_MS = 12 * 3600_000
/** A `paid` state shows `Terima kasih` this long, then the display reads as idle. */
export const PAID_HOLD_MS = 20_000
const MAX_IDR = 100_000_000

export type DisplayError = { status: number; code: string; message: string }
type LineKind = "ongkir" | "asuransi" | "packing" | "layanan" | "promo"
const LINE_LABELS: Record<LineKind, string> = { ongkir: "Ongkos kirim", asuransi: "Asuransi", packing: "Packing", layanan: "Biaya layanan loket", promo: "Potongan promo" }
const METHODS = ["qris", "tunai", "transfer", "later"] as const
type Method = (typeof METHODS)[number]

export type DisplayLine = { kind: LineKind; label: string; amountIdr: number }
export type DisplayState =
  | { kind: "idle" }
  | {
      kind: "checkout"
      courier: string
      eta: string | null
      billableWeightGram: number | null
      destination: string | null
      method: Method | null
      lines: DisplayLine[]
      totalIdr: number
      codCollectionIdr: number | null
      senderPayoutIdr: number | null
    }
  | {
      kind: "paid"
      inv: string
      courier: string | null
      awb: string | null
      paymentStatus: string
      method: string | null
      totalIdr: number
      cashReceivedIdr: number | null
      changeIdr: number | null
      trackingUrl: string
    }

const IDLE: DisplayState = { kind: "idle" }
const bad = (code: string, message: string): { ok: false; error: DisplayError } => ({ ok: false, error: { status: 422, code, message } })
const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.replace(/\s+/g, " ").trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null)
const idr = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= MAX_IDR ? v : null)

/** The `checkout` state from the counter's input: closed line set, integer IDR, and a total that must add up. */
export function parseCheckout(b: Record<string, unknown>): { ok: true; value: DisplayState } | { ok: false; error: DisplayError } {
  const courier = text(b.courier, 60)
  if (!courier) return bad("DISPLAY_INVALID", "Pilih ekspedisi dulu.")
  if (!Array.isArray(b.lines) || b.lines.length > 5) return bad("DISPLAY_INVALID", "Rincian biaya tidak valid.")
  const lines: DisplayLine[] = []
  for (const raw of b.lines as unknown[]) {
    const l = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
    const kind = l.kind as LineKind
    const amountIdr = idr(l.amountIdr)
    if (!(kind in LINE_LABELS) || amountIdr === null || lines.some((x) => x.kind === kind)) return bad("DISPLAY_INVALID", "Rincian biaya tidak valid.")
    const name = kind === "packing" ? text(l.name, 30) : null
    lines.push({ kind, label: name ? `${LINE_LABELS[kind]} (${name})` : LINE_LABELS[kind], amountIdr })
  }
  const total = lines.reduce((s, l) => s + (l.kind === "promo" ? -l.amountIdr : l.amountIdr), 0)
  if (idr(b.totalIdr) === null || b.totalIdr !== total) return { ok: false, error: { status: 422, code: "DISPLAY_TOTAL_MISMATCH", message: "Total tidak sama dengan rincian biaya." } }
  const weight = typeof b.billableWeightGram === "number" && Number.isSafeInteger(b.billableWeightGram) && b.billableWeightGram > 0 && b.billableWeightGram <= 1_000_000 ? b.billableWeightGram : null
  return {
    ok: true,
    value: {
      kind: "checkout",
      courier,
      eta: text(b.eta, 30),
      billableWeightGram: weight,
      destination: text(b.destination, 120),
      method: (METHODS as readonly string[]).includes(b.method as string) ? (b.method as Method) : null,
      lines,
      totalIdr: total,
      codCollectionIdr: idr(b.codCollectionIdr),
      senderPayoutIdr: idr(b.senderPayoutIdr),
    },
  }
}

/** The `paid` state, read from the shipment and its latest `mark_paid` receipt (never from the request's amounts). */
export function paidState(sql: SqlStorage, slug: string, courier: unknown, trackingHost: string): DisplayState | null {
  const s = sql
    .exec<{ slug: string; awb_number: string | null; counter_payment_status: string; counter_payment_method: string | null; counter_due_idr: number | null }>(
      "SELECT slug, awb_number, counter_payment_status, counter_payment_method, counter_due_idr FROM shipments WHERE slug = ?",
      slug,
    )
    .toArray()[0]
  if (!s) return null
  const r = sql
    .exec<{ cash_received_idr: number | null; change_idr: number | null }>("SELECT cash_received_idr, change_idr FROM counter_receipts WHERE shipment_slug = ? AND event = 'mark_paid' ORDER BY created_at DESC LIMIT 1", slug)
    .toArray()[0]
  const inv = s.slug.toUpperCase()
  return {
    kind: "paid",
    inv,
    courier: text(courier, 60),
    awb: s.awb_number,
    paymentStatus: s.counter_payment_status,
    method: s.counter_payment_method,
    totalIdr: s.counter_due_idr ?? 0,
    cashReceivedIdr: s.counter_payment_status === "paid" ? (r?.cash_received_idr ?? null) : null,
    changeIdr: s.counter_payment_status === "paid" ? (r?.change_idr ?? null) : null,
    trackingUrl: `https://${trackingHost}/lacak?q=${inv}`,
  }
}

const LIVE = "revoked_at IS NULL AND expires_at > ?"

/** New pairing for this member: earlier live pairings of the member are revoked first. Call inside a transaction. */
export function pairDisplay(sql: SqlStorage, userId: string, tokenHash: string, now: number): { expiresAt: number; shiftBound: boolean } {
  sql.exec(`UPDATE customer_display_sessions SET revoked_at = ? WHERE created_by_user_id = ? AND revoked_at IS NULL`, now, userId)
  const shift = openShiftOf(sql, userId)
  const expiresAt = now + DISPLAY_TTL_MS
  sql.exec(
    "INSERT INTO customer_display_sessions (id, token_hash, created_by_user_id, shift_id, state_json, state_updated_at, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    crypto.randomUUID(),
    tokenHash,
    userId,
    shift?.id ?? null,
    JSON.stringify(IDLE),
    now,
    now,
    expiresAt,
  )
  return { expiresAt, shiftBound: !!shift }
}

export function displayStatus(sql: SqlStorage, userId: string, now: number): { paired: boolean; expiresAt: number | null; shiftBound: boolean } {
  const r = sql
    .exec<{ expires_at: number; shift_id: string | null }>(
      `SELECT d.expires_at, d.shift_id FROM customer_display_sessions d LEFT JOIN cashier_shifts s ON s.id = d.shift_id
       WHERE d.created_by_user_id = ? AND d.revoked_at IS NULL AND d.expires_at > ? AND (d.shift_id IS NULL OR s.state = 'open')
       ORDER BY d.created_at DESC LIMIT 1`,
      userId,
      now,
    )
    .toArray()[0]
  return { paired: !!r, expiresAt: r?.expires_at ?? null, shiftBound: !!r?.shift_id }
}

/** Replaces the state on this member's live pairings; returns how many were updated. */
export function setDisplayState(sql: SqlStorage, userId: string, state: DisplayState, now: number): number {
  return sql.exec(`UPDATE customer_display_sessions SET state_json = ?, state_updated_at = ? WHERE created_by_user_id = ? AND ${LIVE}`, JSON.stringify(state), now, userId, now).rowsWritten
}

export function unpairDisplay(sql: SqlStorage, userId: string, now: number): number {
  return sql.exec("UPDATE customer_display_sessions SET revoked_at = ? WHERE created_by_user_id = ? AND revoked_at IS NULL", now, userId).rowsWritten
}

/** PR-22: closing a shift ends every pairing made inside it. Call in the shift-close transaction. */
export function revokeForShift(sql: SqlStorage, shiftId: string, now: number): number {
  return sql.exec("UPDATE customer_display_sessions SET revoked_at = ? WHERE shift_id = ? AND revoked_at IS NULL", now, shiftId).rowsWritten
}

export type DisplayRead = { kind: "none" } | { kind: "ended" } | { kind: "ok"; createdBy: string; state: DisplayState; updatedAt: number }

/** What a paired display may read for this token hash (unknown = `none`; revoked, expired or shift closed = `ended`). */
export function readDisplay(sql: SqlStorage, tokenHash: string, now: number): DisplayRead {
  const r = sql
    .exec<{ created_by_user_id: string; state_json: string; state_updated_at: number; expires_at: number; revoked_at: number | null; shift_state: string | null; shift_id: string | null }>(
      `SELECT d.created_by_user_id, d.state_json, d.state_updated_at, d.expires_at, d.revoked_at, d.shift_id, s.state AS shift_state
       FROM customer_display_sessions d LEFT JOIN cashier_shifts s ON s.id = d.shift_id WHERE d.token_hash = ?`,
      tokenHash,
    )
    .toArray()[0]
  if (!r) return { kind: "none" }
  if (r.revoked_at !== null || r.expires_at <= now || (r.shift_id !== null && r.shift_state !== "open")) return { kind: "ended" }
  const state = JSON.parse(r.state_json) as DisplayState
  if (state.kind === "paid" && now - r.state_updated_at > PAID_HOLD_MS) return { kind: "ok", createdBy: r.created_by_user_id, state: IDLE, updatedAt: r.state_updated_at + PAID_HOLD_MS }
  return { kind: "ok", createdBy: r.created_by_user_id, state, updatedAt: r.state_updated_at }
}
