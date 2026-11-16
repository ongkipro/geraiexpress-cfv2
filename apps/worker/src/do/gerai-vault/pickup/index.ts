// Pickup manifests (`Surat Jalan`, TASK-403, spec 04 §1, spec 01 §2.4). One open batch per courier; scan guard blocks a
// wrong courier, a cancelled INV, an INV without AWB (unpaid hold) or one already handed over; a counter-unpaid INV
// only warns. Handover needs driver fields and a signature/photo, and records custody `handed_to_courier` per INV.
import { normalizeSlug } from "@gx/domain/slug"
import { normalizePhone08 } from "@gx/domain/contacts"
import { recordCustody } from "../status"

export type PickupError = { status: number; code: string; message: string; fields?: Record<string, string> }
const err = (status: number, code: string, message: string, fields?: Record<string, string>): { ok: false; error: PickupError } => ({ ok: false, error: { status, code, message, fields } })

export type BatchRow = {
  id: string
  courier_code: string
  status: string
  driver_name: string | null
  driver_phone: string | null
  driver_vehicle_no: string | null
  signature_r2_key: string | null
  signed_manifest_photo_r2_key: string | null
  scanned_count: number
  handed_over_at: number | null
  handed_over_by: string | null
  created_at: number
}

export type QueueGroup = { courier_code: string; ready: number; weight_gram: number; vehicle: "Motor" | "Mobil"; open_batch: string | null; scanned: number; unpaid: number }

/** `Pickup & Manifest` queue: ready INVs grouped by courier with weight, vehicle hint and the open batch. */
export function pickupQueue(sql: SqlStorage): QueueGroup[] {
  return sql
    .exec<{ courier_code: string; ready: number; weight_gram: number; unpaid: number; open_batch: string | null; scanned: number | null }>(
      `SELECT s.courier_code, COUNT(*) AS ready, SUM(COALESCE(s.billable_weight_gram, 0)) AS weight_gram, SUM(s.counter_payment_status = 'unpaid') AS unpaid,
              (SELECT id FROM pickup_batches b WHERE b.courier_code = s.courier_code AND b.status = 'open') AS open_batch,
              (SELECT scanned_count FROM pickup_batches b WHERE b.courier_code = s.courier_code AND b.status = 'open') AS scanned
       FROM shipments s WHERE s.dispatch_state = 'issued' AND s.status = 'ready_for_pickup' AND s.custody_stage = 'none'
       GROUP BY s.courier_code ORDER BY ready DESC`,
    )
    .toArray()
    // Rule of thumb: more than 20 kg or 25 parcels → car.
    .map((g) => ({ courier_code: g.courier_code, ready: g.ready, weight_gram: g.weight_gram, vehicle: g.weight_gram > 20_000 || g.ready > 25 ? "Mobil" : "Motor", open_batch: g.open_batch, scanned: g.scanned ?? 0, unpaid: g.unpaid }))
}

export function readBatch(sql: SqlStorage, id: string): BatchRow | null {
  return sql.exec<BatchRow>("SELECT * FROM pickup_batches WHERE id = ?", id).toArray()[0] ?? null
}

export function openBatch(sql: SqlStorage, tenantId: string, courier: string, actorId: string, now: number): BatchRow {
  const cur = sql.exec<BatchRow>("SELECT * FROM pickup_batches WHERE courier_code = ? AND status = 'open'", courier).toArray()[0]
  if (cur) return cur
  const id = crypto.randomUUID()
  const outlet = sql.exec<{ id: string }>("SELECT id FROM tenant_outlets WHERE is_default = 1 LIMIT 1").toArray()[0]?.id ?? null
  sql.exec("INSERT INTO pickup_batches (id, tenant_id, outlet_id, courier_code, status, created_by, created_at) VALUES (?, ?, ?, ?, 'open', ?, ?)", id, tenantId, outlet, courier, actorId, now)
  return readBatch(sql, id)!
}

export type ScanResult =
  | { result: "added"; slug: string; awb: string; warning: string | null }
  | { result: "duplicate"; slug: string; awb: string; warning: null }
  | { result: "blocked"; code: "WRONG_COURIER" | "CANCELLED" | "NO_AWB" | "NOT_FOUND" | "ALREADY_HANDED" | "IN_OTHER_BATCH" | "NOT_READY"; message: string; slug: string | null }

const COURIER_NAME: Record<string, string> = { JT: "J&T", JNE: "JNE", SiCepat: "SiCepat", Sap: "SAP", iDexpress: "iDexpress", lion: "Lion Parcel", anteraja: "Anteraja", pos: "Pos Indonesia", spx: "SPX", ninja: "Ninja" }
const courierName = (c: string) => COURIER_NAME[c] ?? c

/** One scan (AWB barcode or INV QR/slug). Blocks never add the parcel; warnings add it with a flag. */
export function scan(sql: SqlStorage, batchId: string, code: string, actorId: string, now: number): { ok: true; value: ScanResult } | { ok: false; error: PickupError } {
  const b = readBatch(sql, batchId)
  if (!b) return err(404, "BATCH_NOT_FOUND", "Manifest tidak ditemukan.")
  if (b.status !== "open") return err(409, "BATCH_CLOSED", "Manifest ini sudah ditutup.")
  const raw = code.trim()
  const slug = normalizeSlug(raw)
  const s = sql
    .exec<{ slug: string; courier_code: string; awb_number: string | null; dispatch_state: string; status: string; custody_stage: string; counter_payment_status: string }>(
      "SELECT slug, courier_code, awb_number, dispatch_state, status, custody_stage, counter_payment_status FROM shipments WHERE slug = ? OR UPPER(awb_number) = ? LIMIT 1",
      slug ?? "~",
      raw.replace(/\s+/g, "").toUpperCase(),
    )
    .toArray()[0]
  if (!s) return { ok: true, value: { result: "blocked", code: "NOT_FOUND", message: "Paket ini tidak terdaftar di gerai ini.", slug: null } }
  if (s.dispatch_state === "cancelled" || s.status === "cancelled") return { ok: true, value: { result: "blocked", code: "CANCELLED", message: "Kiriman ini sudah dibatalkan. Jangan serahkan ke kurir.", slug: s.slug } }
  if (s.dispatch_state === "provider_unpaid_hold" || !s.awb_number) return { ok: true, value: { result: "blocked", code: "NO_AWB", message: "Resi belum terbit (menunggu saldo Mengantar). Jangan serahkan ke kurir.", slug: s.slug } }
  if (s.courier_code !== b.courier_code) return { ok: true, value: { result: "blocked", code: "WRONG_COURIER", message: `SALAH KURIR! Paket ini milik ${courierName(s.courier_code)}, bukan ${courierName(b.courier_code)}.`, slug: s.slug } }
  if (s.custody_stage !== "none") return { ok: true, value: { result: "blocked", code: "ALREADY_HANDED", message: "Paket ini sudah diserahkan ke kurir sebelumnya.", slug: s.slug } }
  if (s.status !== "ready_for_pickup") return { ok: true, value: { result: "blocked", code: "NOT_READY", message: "Paket ini tidak sedang menunggu penjemputan.", slug: s.slug } }
  const inBatch = sql.exec<{ batch_id: string }>("SELECT batch_id FROM pickup_batch_items WHERE slug = ?", s.slug).toArray()[0]
  if (inBatch && inBatch.batch_id === batchId) return { ok: true, value: { result: "duplicate", slug: s.slug, awb: s.awb_number, warning: null } }
  if (inBatch) return { ok: true, value: { result: "blocked", code: "IN_OTHER_BATCH", message: "Paket ini sudah ada di manifest lain.", slug: s.slug } }
  const unpaid = s.counter_payment_status === "unpaid"
  sql.exec("INSERT INTO pickup_batch_items (batch_id, slug, scanned_at, scanned_by, unpaid_warning) VALUES (?, ?, ?, ?, ?)", batchId, s.slug, now, actorId, unpaid ? 1 : 0)
  sql.exec("UPDATE pickup_batches SET scanned_count = (SELECT COUNT(*) FROM pickup_batch_items WHERE batch_id = ?) WHERE id = ?", batchId, batchId)
  return { ok: true, value: { result: "added", slug: s.slug, awb: s.awb_number, warning: unpaid ? "Belum dibayar pelanggan — tagih dulu." : null } }
}

export function unscan(sql: SqlStorage, batchId: string, slug: string): { ok: true } | { ok: false; error: PickupError } {
  const b = readBatch(sql, batchId)
  if (!b || b.status !== "open") return err(409, "BATCH_CLOSED", "Manifest ini sudah ditutup.")
  sql.exec("DELETE FROM pickup_batch_items WHERE batch_id = ? AND slug = ?", batchId, slug)
  sql.exec("UPDATE pickup_batches SET scanned_count = (SELECT COUNT(*) FROM pickup_batch_items WHERE batch_id = ?) WHERE id = ?", batchId, batchId)
  return { ok: true }
}

export type BatchView = BatchRow & { items: Array<{ slug: string; awb: string | null; recipient: string | null; weight_gram: number | null; unpaid_warning: number; scanned_at: number }>; missing: Array<{ slug: string; awb: string | null; recipient: string | null }> }

export function batchView(sql: SqlStorage, id: string): BatchView | null {
  const b = readBatch(sql, id)
  if (!b) return null
  const items = sql
    .exec<BatchView["items"][number]>(
      `SELECT i.slug, s.awb_number AS awb, json_extract(s.true_recipient_json, '$.name') AS recipient, s.billable_weight_gram AS weight_gram, i.unpaid_warning, i.scanned_at
       FROM pickup_batch_items i JOIN shipments s ON s.slug = i.slug WHERE i.batch_id = ? ORDER BY i.scanned_at`,
      id,
    )
    .toArray()
  const missing =
    b.status === "open"
      ? sql
          .exec<BatchView["missing"][number]>(
            `SELECT s.slug, s.awb_number AS awb, json_extract(s.true_recipient_json, '$.name') AS recipient FROM shipments s
             WHERE s.courier_code = ? AND s.dispatch_state = 'issued' AND s.status = 'ready_for_pickup' AND s.custody_stage = 'none'
               AND s.slug NOT IN (SELECT slug FROM pickup_batch_items) ORDER BY s.issued_at`,
            b.courier_code,
          )
          .toArray()
      : []
  return { ...b, items, missing }
}

const PLATE = /^[A-Z]{1,2}\s?\d{1,4}\s?[A-Z]{0,3}$/

/** Driver handover: fields validated in Indonesian; every scanned INV moves to custody `handed_to_courier`. */
export function handover(
  sql: SqlStorage,
  batchId: string,
  p: { driverName: unknown; driverPhone: unknown; vehicleNo: unknown; signatureKey: string | null; photoKey: string | null; mode: "handed_over" | "dropped_at_branch"; actorId: string },
  now: number,
): { ok: true; value: { handed: number } } | { ok: false; error: PickupError } {
  const b = readBatch(sql, batchId)
  if (!b) return err(404, "BATCH_NOT_FOUND", "Manifest tidak ditemukan.")
  if (b.status !== "open") return err(409, "BATCH_CLOSED", "Manifest ini sudah ditutup.")
  if (b.scanned_count === 0) return err(422, "EMPTY_BATCH", "Belum ada paket yang dipindai.")
  const fields: Record<string, string> = {}
  const name = typeof p.driverName === "string" ? p.driverName.replace(/\s+/g, " ").trim() : ""
  const phone = normalizePhone08(p.driverPhone)
  const plate = typeof p.vehicleNo === "string" ? p.vehicleNo.toUpperCase().replace(/\s+/g, " ").trim() : ""
  if (p.mode === "handed_over") {
    if (name.length < 2 || name.length > 60) fields.driverName = "Nama kurir 2–60 huruf."
    if (!phone) fields.driverPhone = "Nomor HP kurir tidak valid."
    if (plate.length < 3 || plate.length > 12 || !PLATE.test(plate)) fields.vehicleNo = "Nomor polisi tidak valid (contoh: D 1234 ABC)."
    if (!p.signatureKey && !p.photoKey) fields.signature = "Minta tanda tangan kurir atau foto Surat Jalan yang sudah ditandatangani."
  }
  if (Object.keys(fields).length) return err(422, "INVALID_HANDOVER", Object.values(fields)[0]!, fields)
  // Re-check every scanned INV at handover: one cancelled or changed since scanning blocks the manifest.
  const bad = sql
    .exec<{ slug: string }>(
      `SELECT i.slug FROM pickup_batch_items i JOIN shipments s ON s.slug = i.slug
       WHERE i.batch_id = ? AND NOT (s.dispatch_state = 'issued' AND s.status = 'ready_for_pickup' AND s.custody_stage = 'none') LIMIT 3`,
      batchId,
    )
    .toArray()
  if (bad.length) return err(409, "ITEM_NOT_READY", `INV ${bad.map((b) => b.slug.toUpperCase()).join(", ")} sudah dibatalkan atau berubah. Keluarkan dari manifest dulu.`)
  sql.exec(
    "UPDATE pickup_batches SET status = ?, driver_name = ?, driver_phone = ?, driver_vehicle_no = ?, signature_r2_key = ?, signed_manifest_photo_r2_key = ?, handed_over_at = ?, handed_over_by = ? WHERE id = ?",
    p.mode,
    name || null,
    phone,
    plate || null,
    p.signatureKey,
    p.photoKey,
    now,
    p.actorId,
    batchId,
  )
  const slugs = sql.exec<{ slug: string }>("SELECT slug FROM pickup_batch_items WHERE batch_id = ?", batchId).toArray()
  for (const { slug } of slugs) {
    recordCustody(sql, { slug, stage: "handed_to_courier", eventKey: `custody:${batchId}:${slug}` }, now)
    sql.exec("UPDATE shipments SET pickup_batch_id = ? WHERE slug = ?", batchId, slug)
  }
  return { ok: true, value: { handed: slugs.length } }
}

export function listBatches(sql: SqlStorage, limit = 30): BatchRow[] {
  return sql.exec<BatchRow>("SELECT * FROM pickup_batches WHERE status != 'open' ORDER BY handed_over_at DESC LIMIT ?", limit).toArray()
}
