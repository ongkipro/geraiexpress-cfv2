// Checkout and dispatch (TASK-304, ADR-0004 §1, spec 03 §1, spec 02 §3.3). Synchronous SQL helpers used by the vault
// RPCs inside `transactionSync`; the network call happens between two transactions:
//   1. journal `in_flight` + shipment `issuing_in_flight` (commit)
//   2. Mengantar `POST /order` with `idempotencyKey` (15 s timeout)
//   3. record the outcome (commit): issued / provider_unpaid_hold / failed / reconciliation_needed (ambiguous)
// An ambiguous outcome is never retried blindly: `reconcileDispatch` reads back by `destinationMark` (the INV).
import { isQuoteDrift } from "@gx/domain/money"
import type { CreateOrderInput, OrderItem } from "@gx/mengantar-sdk"
import { readShipment, setDispatchStatus, markIssued, type ShipmentRow } from "../status"
import { readRecipient, readSender, type RecipientRow, type SenderRow } from "../contacts"

export type DispatchError = { status: number; code: string; message: string; fields?: Record<string, string> }

export type QuoteRow = {
  id: string
  shipment_slug: string
  origin_area_id: string
  destination_area_id: string
  cod_fee_mode: string
  actual_weight_gram: number
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  billable_weight_gram: number
  provider_weight_kg_text: string
  courier_code: string
  service_code: string
  service_class: string
  publish_shipping_idr: number
  provider_net_shipping_idr: number
  effective_gerai_cost_idr: number
  insurance_fee_idr: number | null
  cod_fee_idr: number
  cod_goods_amount_idr: number
  cod_collection_total_idr: number
  counter_due_idr: number
  sender_cod_payable_idr: number
  expected_provider_cod_credit_idr: number
  packing_addon_idr: number
  estimated_margin_idr: number
  counter_service_fee_idr: number
  promo_discount_idr: number
  quoted_at: number
  expires_at: number
}

/**
 * The quote an INV is bound to: the shipment's `quote_snapshot_id` once the draft exists (authoritative even when an
 * older quote finished freezing last), otherwise the newest frozen quote for the slug (draft creation).
 */
export function latestQuote(sql: SqlStorage, slug: string): QuoteRow | null {
  const bound = sql.exec<QuoteRow>("SELECT q.* FROM shipments s JOIN quote_snapshots q ON q.id = s.quote_snapshot_id WHERE s.slug = ?", slug).toArray()[0]
  if (bound) return bound
  return sql.exec<QuoteRow>("SELECT * FROM quote_snapshots WHERE shipment_slug = ? ORDER BY quoted_at DESC, rowid DESC LIMIT 1", slug).toArray()[0] ?? null
}

/** Creates the INV draft from its frozen quote (idempotent: an existing draft is returned). */
export function ensureDraft(sql: SqlStorage, tenantId: string, slug: string, actorId: string, now: number): { ok: true; value: ShipmentRow } | { ok: false; error: DispatchError } {
  const cur = readShipment(sql, slug)
  if (cur) return { ok: true, value: cur }
  const q = latestQuote(sql, slug)
  if (!q) return { ok: false, error: { status: 404, code: "SHIPMENT_NOT_FOUND", message: "Kiriman tidak ditemukan." } }
  sql.exec(
    `INSERT INTO shipments (tenant_id, slug, courier_code, service_code, is_cargo, cod_fee_mode, status, dispatch_state, quote_snapshot_id, created_by_user_id,
       publish_shipping_idr, gerai_shipping_cost_idr, packing_addon_idr, insurance_fee_idr, cod_goods_amount_idr, cod_service_fee_idr, cod_collection_total_idr,
       counter_due_idr, expected_provider_cod_credit_idr, sender_cod_payable_idr, actual_weight_gram, billable_weight_gram, counter_payment_status, index_version, created_at, updated_at,
       counter_service_fee_idr, promo_discount_idr)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    tenantId,
    slug,
    q.courier_code,
    q.service_code,
    q.service_class === "cargo" ? 1 : 0,
    q.cod_fee_mode,
    q.id,
    actorId,
    q.publish_shipping_idr,
    q.effective_gerai_cost_idr,
    q.packing_addon_idr,
    q.insurance_fee_idr,
    q.cod_goods_amount_idr,
    q.cod_fee_idr,
    q.cod_collection_total_idr,
    q.counter_due_idr,
    q.expected_provider_cod_credit_idr,
    q.sender_cod_payable_idr,
    q.actual_weight_gram,
    q.billable_weight_gram,
    q.counter_due_idr === 0 ? "not_required" : "unpaid",
    now,
    now,
    q.counter_service_fee_idr ?? 0,
    q.promo_discount_idr ?? 0,
  )
  // An INV that started as a mini-site QR pre-booking keeps that entry channel (dashboard "Sumber order").
  sql.exec("UPDATE shipments SET entry_channel = 'minisite_qr' WHERE slug = ? AND EXISTS (SELECT 1 FROM minisite_drafts WHERE slug = ?)", slug, slug)
  return { ok: true, value: readShipment(sql, slug)! }
}

/** Attaches sender/recipient/contents to a draft; immutable identity snapshots are taken at dispatch. */
export function setParties(sql: SqlStorage, slug: string, p: { senderId?: unknown; recipientId?: unknown; content?: unknown; prohibitedAck?: unknown; maskPreset?: unknown }, now: number): DispatchError | null {
  const s = readShipment(sql, slug) as (ShipmentRow & { dispatch_state: string }) | null
  if (!s) return { status: 404, code: "SHIPMENT_NOT_FOUND", message: "Kiriman tidak ditemukan." }
  if (s.dispatch_state !== "draft" && s.dispatch_state !== "failed") return { status: 409, code: "ALREADY_ISSUED", message: "Kiriman sudah diproses; data tidak bisa diubah." }
  const fields: Record<string, string> = {}
  const sender = typeof p.senderId === "string" ? readSender(sql, p.senderId) : null
  if (p.senderId !== undefined && !sender) fields.senderId = "Pilih pengirim dari Kontak."
  const recipient = typeof p.recipientId === "string" ? readRecipient(sql, p.recipientId) : null
  if (p.recipientId !== undefined && !recipient) fields.recipientId = "Pilih penerima dari Kontak."
  const content = typeof p.content === "string" ? p.content.trim().replace(/\s+/g, " ") : undefined
  if (content !== undefined && (content.length < 3 || content.length > 100 || /<|>|https?:\/\//i.test(content))) fields.content = "Isi paket 3–100 huruf, tanpa tautan."
  const preset = p.maskPreset === undefined ? undefined : ["standar_gerai", "dropship_toko", "privasi_penerima_cod", "full_nama_gerai"].includes(String(p.maskPreset)) ? String(p.maskPreset) : null
  if (preset === null) fields.maskPreset = "Preset label tidak dikenal."
  if (Object.keys(fields).length) return { status: 422, code: "INVALID_PARTIES", message: Object.values(fields)[0]!, fields }
  sql.exec(
    `UPDATE shipments SET sender_contact_id = COALESCE(?, sender_contact_id), recipient_contact_id = COALESCE(?, recipient_contact_id),
       content_declaration_text = COALESCE(?, content_declaration_text), mask_preset = COALESCE(?, mask_preset),
       prohibited_ack_at = CASE WHEN ? THEN ? ELSE prohibited_ack_at END, updated_at = ? WHERE slug = ?`,
    sender?.id ?? null,
    recipient?.id ?? null,
    content ?? null,
    preset ?? null,
    p.prohibitedAck === true ? 1 : 0,
    now,
    now,
    slug,
  )
  return null
}

/** Everything dispatch needs, or the first Indonesian reason it cannot run yet. */
export function readyToDispatch(sql: SqlStorage, slug: string, now: number): { ok: true; s: ShipmentRow & Record<string, SqlStorageValue>; q: QuoteRow; sender: SenderRow; recipient: RecipientRow } | { ok: false; error: DispatchError } {
  const s = readShipment(sql, slug) as (ShipmentRow & Record<string, SqlStorageValue>) | null
  if (!s) return { ok: false, error: { status: 404, code: "SHIPMENT_NOT_FOUND", message: "Kiriman tidak ditemukan." } }
  const q = latestQuote(sql, slug)
  if (!q) return { ok: false, error: { status: 409, code: "NO_QUOTE", message: "Ongkir belum dihitung." } }
  if (q.expires_at < now) return { ok: false, error: { status: 409, code: "QUOTE_EXPIRED", message: "Ongkir sudah kedaluwarsa. Cek ongkir lagi." } }
  const sender = s.sender_contact_id ? readSender(sql, String(s.sender_contact_id)) : null
  const recipient = s.recipient_contact_id ? readRecipient(sql, String(s.recipient_contact_id)) : null
  const fields: Record<string, string> = {}
  if (!sender) fields.senderId = "Pilih pengirim."
  if (!recipient) fields.recipientId = "Pilih penerima."
  if (!s.content_declaration_text) fields.content = "Isi paket wajib diisi."
  if (!s.prohibited_ack_at) fields.prohibitedAck = "Pastikan isi paket bukan barang terlarang."
  if (recipient && recipient.mengantar_area_id !== q.destination_area_id) fields.recipientId = "Kecamatan penerima berbeda dengan tujuan ongkir. Cek ongkir lagi."
  // COD and masked sends need a sender WhatsApp confirmed at the counter (spec 03 §1 Path B step 2, ADR-0005).
  if (sender && q.cod_fee_mode !== "none" && !sender.wa_verified_at) fields.senderId = "Kiriman COD butuh WhatsApp pengirim yang sudah diverifikasi."
  else if (sender && s.mask_preset !== "standar_gerai" && !sender.wa_verified_at) fields.senderId = "Label masking butuh WhatsApp pengirim yang sudah diverifikasi."
  if (s.mask_preset === "dropship_toko" && sender && !sender.display_brand_name) fields.maskPreset = "Dropship Toko butuh nama toko di data pengirim."
  if (Object.keys(fields).length) return { ok: false, error: { status: 422, code: "NOT_READY", message: Object.values(fields)[0]!, fields } }
  return { ok: true, s, q, sender: sender!, recipient: recipient! }
}

/** Mengantar `POST /order` body for one INV (destinationMark = INV, COD = frozen C, weight = frozen provider kg). */
export function orderPayload(q: QuoteRow, sender: SenderRow, recipient: RecipientRow, content: string, slug: string, pickup: { addressId: string; type: "scheduledPickup" | "dropOff"; timeId?: string }): CreateOrderInput {
  const cod = q.cod_fee_mode !== "none"
  const order: Record<string, unknown> = {
    customerName: recipient.name,
    customerPhone: recipient.phone,
    customerAddress: [recipient.street_address, recipient.address_note].filter(Boolean).join(" · "),
    customerAddressDataId: recipient.mengantar_area_id,
    weight: Number(q.provider_weight_kg_text),
    quantity: 1,
    parcelContent: content,
    destinationMark: slug.toUpperCase(),
    ...(cod ? { COD: q.cod_collection_total_idr } : { goodsValue: Math.max(q.cod_goods_amount_idr, 0) }),
    ...(q.service_class === "cargo" ? { cargo: true } : {}),
  }
  void sender
  return { courier: q.courier_code as CreateOrderInput["courier"], pickup: { type: pickup.type, address_id: pickup.addressId, ...(pickup.timeId ? { time_id: pickup.timeId } : {}), volume: "volumeMotor" }, orders: [order] }
}

export type OrderOutcome =
  | { kind: "issued"; item: OrderItem; batchId: string | null; batchCode: string | null }
  | { kind: "unpaid"; item: OrderItem; batchId: string | null; batchCode: string | null }
  | { kind: "rejected"; code: string; message: string }
  | { kind: "ambiguous"; reason: string }

/** Records a known outcome on the shipment + journal (inside `transactionSync`). */
export function recordOutcome(sql: SqlStorage, slug: string, key: string, out: OrderOutcome, frozenCodFee: number, now: number): void {
  if (out.kind === "issued" || out.kind === "unpaid") {
    const it = out.item
    const drift = isQuoteDrift(frozenCodFee, it.COD_FEE === undefined || it.COD_FEE === null ? null : String(it.COD_FEE)) ? 1 : 0
    const extra: Record<string, SqlStorageValue> = {
      dispatch_state: out.kind === "issued" ? "issued" : "provider_unpaid_hold",
      mengantar_order_item_id: it._id ?? null,
      mengantar_order_code: it.ORDER_ID ?? null,
      mengantar_batch_object_id: out.batchId,
      mengantar_batch_code: out.batchCode,
      awb_number: it.cnote_no ?? null,
      sorting_code: it.DESTINATION_CODE ?? null,
      provider_echoed_weight_kg_text: it.WEIGHT === undefined || it.WEIGHT === null ? null : String(it.WEIGHT),
      provider_cod_fee_raw_text: it.COD_FEE === undefined || it.COD_FEE === null ? null : String(it.COD_FEE),
      quote_drift: drift,
      payment_sync_state: out.kind === "issued" ? "provider_paid_estimated" : "provider_unpaid",
      issued_at: out.kind === "issued" ? now : null,
      dispatch_error: null,
    }
    if (out.kind === "issued") {
      setDispatchStatus(sql, slug, "issuing_in_flight", now, extra)
      markIssued(sql, slug, now)
    } else setDispatchStatus(sql, slug, "provider_unpaid_hold", now, extra)
    sql.exec("UPDATE dispatch_journal SET state = 'done', result_json = ?, updated_at = ? WHERE idempotency_key = ?", JSON.stringify({ kind: out.kind, orderCode: it.ORDER_ID ?? null, awb: it.cnote_no ?? null, batchId: out.batchId }), now, key)
    return
  }
  if (out.kind === "rejected") {
    setDispatchStatus(sql, slug, "draft", now, { dispatch_state: "failed", dispatch_error: `${out.code}: ${out.message}`.slice(0, 300) })
    sql.exec("UPDATE dispatch_journal SET state = 'failed', error = ?, updated_at = ? WHERE idempotency_key = ?", `${out.code}: ${out.message}`.slice(0, 300), now, key)
    return
  }
  setDispatchStatus(sql, slug, "reconciliation_needed", now, { dispatch_state: "reconciliation_needed", dispatch_error: out.reason.slice(0, 300) })
  sql.exec("UPDATE dispatch_journal SET state = 'unknown', error = ?, updated_at = ? WHERE idempotency_key = ?", out.reason.slice(0, 300), now, key)
}

export const dispatchKey = (slug: string, attempt: number) => `gx-${slug}-${attempt}`
