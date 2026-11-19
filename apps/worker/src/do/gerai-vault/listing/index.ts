// `Kiriman` list (TASK-311, DEC-213/220, spec 06 menu 3, visual 06 §1 / 07 `/kiriman`): tab filters with live counts,
// search by INV/AWB/name/phone, period (created time, WIB bounds from the caller), courier and print filters, keyset
// pagination, and the owner CSV. Pure SQL over this tenant object's tables.
import { kendalaWhere } from "../exceptions"
import { normalizeSlug } from "@gx/domain/slug"
import { normalizePhone08 } from "@gx/domain/contacts"

export const TABS = ["semua", "belum-dibayar", "draf-qr", "menunggu-saldo", "pickup", "kendala", "retur"] as const
export type Tab = (typeof TABS)[number]

/** Each tab is one SQL predicate over `shipments s`. Abandoned counter drafts never show (they have no AWB yet). */
const TAB_WHERE_BASE: Record<Exclude<Tab, "kendala">, string> = {
  semua: "s.dispatch_state != 'draft'",
  "belum-dibayar": "s.dispatch_state NOT IN ('draft','cancelled') AND s.counter_payment_status = 'unpaid'",
  "draf-qr": "s.dispatch_state = 'draft' AND s.entry_channel = 'minisite_qr'",
  "menunggu-saldo": "s.dispatch_state = 'provider_unpaid_hold'",
  pickup: "s.dispatch_state = 'issued' AND s.status = 'ready_for_pickup'",
  retur: "s.status IN ('rts_in_transit','provider_returned','rts_at_gerai')",
}

/** Tab predicates at `now`: `kendala` is exactly the `Kendala & Klaim` buckets (badge == items shown in the tab). */
const tabWhere = (now: number): Record<Tab, string> => ({ ...TAB_WHERE_BASE, kendala: kendalaWhere(now) })

export interface ListQuery {
  tab: Tab
  q: string
  fromMs: number
  toMs: number
  courier: string | null
  printed: "semua" | "belum" | "sudah"
  cursor: string | null
  limit: number
  /** DEC-251C `Paket Macet`: issued, still moving, no courier scan (or issue/creation) for at least N days; 0 = all. */
  stuckDays?: 0 | 2 | 3 | 5 | 7
}

export const STUCK_DAYS = [2, 3, 5, 7] as const
/** A shipment the courier still holds (issued, not delivered, returned or cancelled). */
const MOVING = "s.dispatch_state = 'issued' AND s.status IN ('ready_for_pickup','handed_to_courier','in_transit','undelivery_hold')"

export type ListRow = {
  slug: string
  created_at: number
  issued_at: number | null
  courier_code: string
  service_code: string
  awb_number: string | null
  print_count: number
  sender: string | null
  sender_brand: string | null
  recipient: string | null
  recipient_area: string | null
  cod_fee_mode: string
  counter_due_idr: number
  cod_collection_total_idr: number
  counter_payment_status: string
  counter_payment_method: string | null
  status: string
  dispatch_state: string
  bulk_batch_id: string | null
  // owner-only (stripped for Kasir by the API projection)
  effective_gerai_cost_idr: number | null
  estimated_margin_idr: number | null
}

function filters(q: ListQuery, now: number): { where: string; params: SqlStorageValue[] } {
  const parts: string[] = []
  const params: SqlStorageValue[] = []
  parts.push(`s.created_at >= ? AND s.created_at < ?`)
  params.push(q.fromMs, q.toMs)
  if (q.courier) {
    parts.push("s.courier_code = ?")
    params.push(q.courier)
  }
  if (q.printed !== "semua") parts.push(q.printed === "sudah" ? "s.print_count > 0" : "s.print_count = 0")
  if (q.stuckDays) {
    parts.push(`${MOVING} AND COALESCE(s.last_provider_event_at, s.issued_at, s.created_at) <= ?`)
    params.push(now - q.stuckDays * 86_400_000)
  }
  const term = q.q.trim()
  if (term) {
    const slug = normalizeSlug(term)
    const phone = normalizePhone08(term)
    const like = `%${term.replace(/[%_]/g, "").toLowerCase()}%`
    parts.push(
      `(s.slug = ? OR UPPER(s.awb_number) = ? OR LOWER(r.name) LIKE ? OR LOWER(c.true_name) LIKE ? OR LOWER(COALESCE(c.display_brand_name, '')) LIKE ? OR r.phone = ? OR c.true_phone = ?)`,
    )
    params.push(slug ?? "~", term.replace(/\s+/g, "").toUpperCase(), like, like, like, phone ?? "~", phone ?? "~")
  }
  return { where: parts.join(" AND "), params }
}

const FROM = "FROM shipments s LEFT JOIN recipient_contacts r ON r.id = s.recipient_contact_id LEFT JOIN sender_contacts c ON c.id = s.sender_contact_id LEFT JOIN quote_snapshots q ON q.id = s.quote_snapshot_id"

/** Counts per tab under the same search/period/courier/print filters (badges stay honest while filtering). One `now`
 * per call: the `kendala` deadlines and the `Paket Macet` cut-off use the same millisecond. */
export function tabCounts(sql: SqlStorage, q: ListQuery): Record<Tab, number> {
  const now = Date.now()
  const f = filters(q, now)
  const where = tabWhere(now)
  const cols = TABS.map((t) => `SUM(CASE WHEN ${where[t]} THEN 1 ELSE 0 END) AS "${t}"`).join(", ")
  const row = sql.exec<Record<Tab, number | null>>(`SELECT ${cols} ${FROM} WHERE ${f.where}`, ...f.params).one()
  return Object.fromEntries(TABS.map((t) => [t, row[t] ?? 0])) as Record<Tab, number>
}

/** One page, newest first. Cursor = `<created_at>:<slug>` of the last row (keyset, stable under inserts). */
export function listShipments(sql: SqlStorage, q: ListQuery): { items: ListRow[]; nextCursor: string | null } {
  const now = Date.now()
  const f = filters(q, now)
  const parts = [`(${tabWhere(now)[q.tab]})`, f.where]
  const params = [...f.params]
  if (q.cursor) {
    const m = /^(\d{1,16}):([0-9a-z]{7})$/.exec(q.cursor)
    if (m) {
      parts.push("(s.created_at < ? OR (s.created_at = ? AND s.slug < ?))")
      params.push(Number(m[1]), Number(m[1]), m[2]!)
    }
  }
  const limit = Math.min(200, Math.max(1, q.limit))
  const rows = sql
    .exec<ListRow>(
      `SELECT s.slug, s.created_at, s.issued_at, s.courier_code, s.service_code, s.awb_number, s.print_count, CASE WHEN s.mask_preset IS NOT NULL AND s.mask_preset != 'standar_gerai' AND s.dispatch_state NOT IN ('draft','failed')
                   THEN json_extract(s.mask_snapshot_json, '$.sender.name') ELSE c.true_name END AS sender,
              CASE WHEN s.mask_preset IS NOT NULL AND s.mask_preset != 'standar_gerai' AND s.dispatch_state NOT IN ('draft','failed') THEN NULL ELSE c.display_brand_name END AS sender_brand,
              r.name AS recipient, r.subdistrict_name AS recipient_area, s.cod_fee_mode, s.counter_due_idr, s.cod_collection_total_idr, s.counter_payment_status,
              s.counter_payment_method, s.status, s.dispatch_state, s.bulk_batch_id, q.effective_gerai_cost_idr, q.estimated_margin_idr
       ${FROM} WHERE ${parts.join(" AND ")} ORDER BY s.created_at DESC, s.slug DESC LIMIT ?`,
      ...params,
      limit + 1,
    )
    .toArray()
  const more = rows.length > limit
  const items = rows.slice(0, limit)
  const last = items[items.length - 1]
  return { items, nextCursor: more && last ? `${last.created_at}:${last.slug}` : null }
}

const CSV_COLUMNS: Array<[keyof ListRow | "created_wib", string]> = [
  ["slug", "INV"],
  ["created_wib", "Dibuat (WIB)"],
  ["courier_code", "Kurir"],
  ["service_code", "Layanan"],
  ["awb_number", "Resi"],
  ["sender", "Pengirim"],
  ["recipient", "Penerima"],
  ["recipient_area", "Kecamatan"],
  ["cod_fee_mode", "Mode COD"],
  ["counter_due_idr", "Tagihan Loket"],
  ["cod_collection_total_idr", "Total COD"],
  ["counter_payment_status", "Pembayaran"],
  ["counter_payment_method", "Cara Bayar"],
  ["status", "Status"],
  ["effective_gerai_cost_idr", "Biaya Gerai"],
  ["estimated_margin_idr", "Estimasi Laba"],
]

const wib = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 16).replace("T", " ")
// Formula-injection guard for spreadsheet apps (=, +, -, @ at the start of a text cell).
const cell = (v: unknown) => {
  if (v === null || v === undefined) return ""
  let s = String(v)
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Owner CSV of the filtered set (max 5.000 rows, newest first) with cost and margin columns. */
export function exportCsv(sql: SqlStorage, q: ListQuery): { csv: string; rows: number; truncated: boolean } {
  const out: ListRow[] = []
  let cursor: string | null = null
  do {
    const page = listShipments(sql, { ...q, cursor, limit: 200 })
    out.push(...page.items)
    cursor = page.nextCursor
  } while (cursor && out.length < 5000)
  const lines = [CSV_COLUMNS.map(([, h]) => h).join(",")]
  for (const r of out.slice(0, 5000)) lines.push(CSV_COLUMNS.map(([k]) => cell(k === "created_wib" ? wib(r.created_at) : k === "slug" ? `INV ${r.slug.toUpperCase()}` : r[k])).join(","))
  return { csv: `\uFEFF${lines.join("\r\n")}\r\n`, rows: Math.min(out.length, 5000), truncated: !!cursor }
}
