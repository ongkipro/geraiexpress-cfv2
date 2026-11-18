// Mini-site data inside the tenant object (TASK-501, DEC-207, spec 05 §3, visual 03). Public reads are projected
// HERE, before anything leaves the object: anonymous tracking carries initials + city/district only — no phone,
// street, COD amount, item or POD; the 4-digit recipient-phone gate unlocks the delivery name + note.
import { normalizeSlug } from "@gx/domain/slug"
import { cleanText, normalizePhone08, validStreet } from "@gx/domain/contacts"
import type { MaskPreset } from "@gx/domain/masking"

export const DRAFT_TTL_MS = 48 * 3600_000
export const UNLOCK_MAX_WRONG = 5
export const UNLOCK_LOCK_MS = 15 * 60_000
const AREA = /^[0-9a-f]{24}$/

export type PublicProfile = { name: string; whatsapp: string | null; openingHours: string | null; address: string | null; area: string | null; logoMediaId: string | null }

export function publicProfile(sql: SqlStorage): PublicProfile | null {
  const o = sql
    .exec<{ name: string; whatsapp: string | null; opening_hours: string | null; street_address: string | null; subdistrict_name: string | null; logo_media_id: string | null }>(
      "SELECT name, whatsapp, opening_hours, street_address, subdistrict_name, logo_media_id FROM tenant_outlets WHERE is_default = 1 LIMIT 1",
    )
    .toArray()[0]
  return o ? { name: o.name, whatsapp: o.whatsapp, openingHours: o.opening_hours, address: o.street_address, area: o.subdistrict_name, logoMediaId: o.logo_media_id } : null
}

/** Image types the public `/logo` route may serve (a `logo` upload can never be served as a PDF or anything else). */
const LOGO_TYPES = "('image/png','image/jpeg','image/webp')"

/**
 * The mini-site page shell (DEC-247 §2.2): the public profile plus the outlet pin and whether a servable logo exists.
 * `logoVersion` (a prefix of the media id) only busts caches of `/logo`; the media id itself never leaves the object.
 */
export type PublicShell = Omit<PublicProfile, "logoMediaId"> & { latitude: number | null; longitude: number | null; logoVersion: string | null }

export function publicShell(sql: SqlStorage, tenantId: string): PublicShell | null {
  const o = sql
    .exec<{ name: string; whatsapp: string | null; opening_hours: string | null; street_address: string | null; subdistrict_name: string | null; latitude: number | null; longitude: number | null; logo_id: string | null }>(
      `SELECT o.name, o.whatsapp, o.opening_hours, o.street_address, o.subdistrict_name, o.latitude, o.longitude, m.id AS logo_id
       FROM tenant_outlets o LEFT JOIN media_objects m ON m.id = o.logo_media_id AND m.tenant_id = ? AND m.purpose = 'logo' AND m.content_type IN ${LOGO_TYPES}
       WHERE o.is_default = 1 LIMIT 1`,
      tenantId,
    )
    .toArray()[0]
  return o ? { name: o.name, whatsapp: o.whatsapp, openingHours: o.opening_hours, address: o.street_address, area: o.subdistrict_name, latitude: o.latitude, longitude: o.longitude, logoVersion: o.logo_id ? o.logo_id.slice(0, 8) : null } : null
}

/** The outlet's own logo for the public `/logo` route: only a `logo`-purpose image of this tenant, else null. */
export function publicLogo(sql: SqlStorage, tenantId: string): { key: string; contentType: string } | null {
  return (
    sql
      .exec<{ key: string; contentType: string }>(
        `SELECT m.r2_key AS key, m.content_type AS contentType FROM tenant_outlets o JOIN media_objects m ON m.id = o.logo_media_id
         WHERE o.is_default = 1 AND m.purpose = 'logo' AND m.tenant_id = ? AND m.content_type IN ${LOGO_TYPES} LIMIT 1`,
        tenantId,
      )
      .toArray()[0] ?? null
  )
}

/** `Rina Kartika` → `R*** K******` (spec 05 §3). */
export function initialsMask(name: string | null | undefined): string | null {
  const t = (name ?? "").trim()
  if (!t) return null
  return t
    .split(/\s+/)
    .slice(0, 4)
    .map((w) => `${w[0]!.toUpperCase()}${"*".repeat(Math.min(6, Math.max(2, w.length - 1)))}`)
    .join(" ")
}

export type DraftInput = { cod: unknown; senderName: unknown; senderPhone: unknown; senderStore: unknown; recipientName: unknown; recipientPhone: unknown; recipientAreaId: unknown; recipientAreaLabel: unknown; recipientStreet: unknown; content: unknown; weightGram: unknown; codGoodsIdr: unknown }
export type DraftRow = { slug: string; cod: number; sender_name: string; sender_phone: string; sender_store: string | null; recipient_name: string; recipient_phone: string; recipient_area_id: string; recipient_area_label: string | null; recipient_street: string; content: string; weight_gram: number; cod_goods_idr: number; created_at: number; expires_at: number; claimed_at: number | null }

export function parseDraft(b: DraftInput): { ok: true; value: Omit<DraftRow, "slug" | "created_at" | "expires_at" | "claimed_at"> } | { ok: false; errors: Record<string, string> } {
  const e: Record<string, string> = {}
  const cod = b.cod === true
  const senderName = cleanText(b.senderName, 80)
  if (!senderName || senderName.length < 2) e.senderName = "Nama pengirim wajib diisi."
  const senderPhone = normalizePhone08(b.senderPhone)
  if (!senderPhone) e.senderPhone = "Nomor WhatsApp pengirim tidak valid."
  const store = b.senderStore === "" || b.senderStore == null ? null : cleanText(b.senderStore, 60)
  const recipientName = cleanText(b.recipientName, 80)
  if (!recipientName || recipientName.length < 2) e.recipientName = "Nama penerima wajib diisi."
  const recipientPhone = normalizePhone08(b.recipientPhone)
  if (!recipientPhone) e.recipientPhone = "Nomor HP penerima tidak valid."
  const areaId = typeof b.recipientAreaId === "string" && AREA.test(b.recipientAreaId) ? b.recipientAreaId : ""
  if (!areaId) e.recipientAreaId = "Pilih kecamatan tujuan dari daftar."
  const street = validStreet(b.recipientStreet)
  if (!street) e.recipientStreet = "Alamat minimal dua kata."
  const content = cleanText(b.content, 60)
  if (!content || content.length < 3 || /https?:\/\/|<|>/i.test(content)) e.content = "Isi paket 3–60 huruf, tanpa tautan."
  const weight = typeof b.weightGram === "number" ? b.weightGram : Number(b.weightGram)
  if (!Number.isSafeInteger(weight) || weight < 10 || weight > 100_000) e.weightGram = "Berat 10 g sampai 100 kg."
  const goods = cod ? (typeof b.codGoodsIdr === "number" ? b.codGoodsIdr : Number(b.codGoodsIdr)) : 0
  if (cod && (!Number.isSafeInteger(goods) || goods < 10_000 || goods > 5_000_000)) e.codGoodsIdr = "Harga barang COD Rp10.000–Rp5.000.000."
  if (Object.keys(e).length) return { ok: false, errors: e }
  return {
    ok: true,
    value: { cod: cod ? 1 : 0, sender_name: senderName!, sender_phone: senderPhone!, sender_store: store, recipient_name: recipientName!, recipient_phone: recipientPhone!, recipient_area_id: areaId, recipient_area_label: cleanText(b.recipientAreaLabel, 160), recipient_street: street!, content: content!, weight_gram: weight, cod_goods_idr: goods },
  }
}

export function insertDraft(sql: SqlStorage, tenantId: string, slug: string, v: Omit<DraftRow, "slug" | "created_at" | "expires_at" | "claimed_at">, ipHash: string, now: number): DraftRow {
  sql.exec(
    `INSERT INTO minisite_drafts (slug, tenant_id, cod, sender_name, sender_phone, sender_store, recipient_name, recipient_phone, recipient_area_id, recipient_area_label, recipient_street, content, weight_gram, cod_goods_idr, ip_hash, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    slug,
    tenantId,
    v.cod,
    v.sender_name,
    v.sender_phone,
    v.sender_store,
    v.recipient_name,
    v.recipient_phone,
    v.recipient_area_id,
    v.recipient_area_label,
    v.recipient_street,
    v.content,
    v.weight_gram,
    v.cod_goods_idr,
    ipHash,
    now,
    now + DRAFT_TTL_MS,
  )
  return sql.exec<DraftRow>("SELECT * FROM minisite_drafts WHERE slug = ?", slug).one()
}

export function readDraft(sql: SqlStorage, slug: string): DraftRow | null {
  return sql.exec<DraftRow>("SELECT * FROM minisite_drafts WHERE slug = ?", slug).toArray()[0] ?? null
}

/** Daily cleanup: unclaimed drafts past 48 h are removed (their slugs stay reserved, never reused). */
export function purgeDrafts(sql: SqlStorage, now: number): number {
  return sql.exec("DELETE FROM minisite_drafts WHERE claimed_at IS NULL AND expires_at < ? RETURNING slug", now).toArray().length
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Menunggu diserahkan ke gerai",
  provider_unpaid_hold: "Sedang diproses gerai",
  ready_for_pickup: "Menunggu dijemput kurir",
  handed_to_courier: "Sudah diserahkan ke kurir",
  in_transit: "Dalam perjalanan",
  undelivery_hold: "Gagal diantar, menunggu instruksi",
  rts_in_transit: "Dikembalikan ke pengirim",
  provider_returned: "Dikembalikan ke pengirim",
  rts_at_gerai: "Kembali di gerai",
  rts_returned_to_sender: "Sudah diambil pengirim",
  delivered: "Terkirim",
  lost: "Dalam penanganan ekspedisi",
  cancelled: "Dibatalkan",
}

export type PublicTrack = {
  inv: string
  awb: string | null
  courier: string | null
  service: string | null
  status: string
  statusLabel: string
  sender: string | null
  recipient: string | null
  originArea: string | null
  destinationArea: string | null
  timeline: Array<{ at: number; label: string }>
  delivered: boolean
  outletContact: { name: string; whatsapp: string | null } | null
  /** ADR-0005: a dropship (or outlet-unbranded) label: the public page must not show the outlet's mark, name, place or chat. */
  maskedOutlet: boolean
  unlocked?: { recipientName: string; note: string | null }
}

type Ship = { slug: string; awb_number: string | null; courier_code: string; service_code: string; status: string; true_sender_json: string | null; true_recipient_json: string | null; mask_preset: MaskPreset | null; mask_snapshot_json: string | null; pickup_snapshot_json: string | null; recipient_contact_id: string | null }

/** Public lookup by INV slug or AWB. Drafts (not yet at the counter) answer with a neutral "waiting" state. */
export function publicTrack(sql: SqlStorage, code: string, now: number = Date.now()): PublicTrack | null {
  const raw = code.trim()
  const slug = normalizeSlug(raw)
  const s = sql
    .exec<Ship>(
      "SELECT slug, awb_number, courier_code, service_code, status, true_sender_json, true_recipient_json, mask_preset, mask_snapshot_json, pickup_snapshot_json, recipient_contact_id FROM shipments WHERE (slug = ? OR UPPER(awb_number) = ?) AND dispatch_state IN ('issued','cancelled','provider_unpaid_hold') LIMIT 1",
      slug ?? "~",
      raw.replace(/\s+/g, "").toUpperCase(),
    )
    .toArray()[0]
  if (!s) {
    const d = slug ? readDraft(sql, slug) : null
    // An unclaimed pre-booking past its 48 h is gone for the public (the QR card no longer works).
    if (!d || d.claimed_at || d.expires_at < now) return null
    return { inv: d.slug, awb: null, courier: null, service: null, status: "draft", statusLabel: STATUS_LABEL.draft!, sender: initialsMask(d.sender_store ?? d.sender_name), recipient: initialsMask(d.recipient_name), originArea: null, destinationArea: areaCity(d.recipient_area_label), timeline: [], delivered: false, outletContact: null, maskedOutlet: Boolean(d.sender_store) }
  }
  const sender = s.true_sender_json ? (JSON.parse(s.true_sender_json) as { name?: string; brand?: string | null }) : null
  const recipient = s.true_recipient_json ? (JSON.parse(s.true_recipient_json) as { name?: string; area?: string | null }) : null
  const printed = s.mask_snapshot_json ? (JSON.parse(s.mask_snapshot_json) as { sender?: { name?: string }; showOutletBranding?: boolean }) : null
  const pickup = s.pickup_snapshot_json ? (JSON.parse(s.pickup_snapshot_json) as { name?: string | null; area?: string | null }) : null
  // The public sender is what the label printed (a dropship store, or the outlet) — never more than initials.
  const shownSender = printed?.sender?.name ?? sender?.brand ?? sender?.name ?? null
  const reseller = s.mask_preset === "dropship_toko" || printed?.showOutletBranding === false
  const outlet = sql.exec<{ name: string; whatsapp: string | null }>("SELECT name, whatsapp FROM tenant_outlets WHERE is_default = 1 LIMIT 1").toArray()[0]
  const timeline = sql
    .exec<{ event_at: number; mapped_status: string | null; raw_category: string | null }>("SELECT event_at, mapped_status, raw_category FROM shipment_events WHERE slug = ? ORDER BY event_at DESC LIMIT 20", s.slug)
    .toArray()
    .map((e) => ({ at: e.event_at, label: STATUS_LABEL[e.mapped_status ?? e.raw_category ?? ""] ?? "Pembaruan status" }))
  return {
    inv: s.slug,
    awb: s.awb_number,
    courier: s.courier_code,
    service: s.service_code,
    status: s.status,
    statusLabel: STATUS_LABEL[s.status] ?? "Dalam proses",
    sender: initialsMask(shownSender),
    recipient: initialsMask(recipient?.name),
    originArea: areaCity(pickup?.area ?? null),
    destinationArea: areaCity(recipient?.area ?? null),
    timeline,
    delivered: s.status === "delivered",
    outletContact: reseller || !outlet ? null : { name: outlet.name, whatsapp: outlet.whatsapp },
    maskedOutlet: reseller,
  }
}

/** `Tebet Barat, Tebet, Jakarta Selatan, DKI Jakarta` → `Tebet, Jakarta Selatan` (district + city, no village). */
export function areaCity(label: string | null): string | null {
  if (!label) return null
  const parts = label.split(",").map((p) => p.trim()).filter(Boolean)
  return parts.length >= 3 ? `${parts[1]}, ${parts[2]}` : parts.slice(-2).join(", ") || null
}

/** 4-digit recipient-phone gate (spec 05 §3): exact last 4 digits; 5 wrong → 15 min lock per INV. */
export function unlock(sql: SqlStorage, slug: string, digits: string, now: number): { ok: true; value: { recipientName: string; note: string | null } } | { ok: false; code: "LOCKED" | "WRONG" | "NOT_DELIVERED" | "NOT_FOUND" } {
  const s = sql.exec<{ status: string; true_recipient_json: string | null; recipient_contact_id: string | null }>("SELECT status, true_recipient_json, recipient_contact_id FROM shipments WHERE slug = ? AND dispatch_state = 'issued'", slug).toArray()[0]
  if (!s) return { ok: false, code: "NOT_FOUND" }
  if (s.status !== "delivered") return { ok: false, code: "NOT_DELIVERED" }
  const u = sql.exec<{ attempts: number; locked_until: number | null }>("SELECT attempts, locked_until FROM tracking_unlocks WHERE slug = ?", slug).toArray()[0]
  if (u?.locked_until && u.locked_until > now) return { ok: false, code: "LOCKED" }
  const r = s.true_recipient_json ? (JSON.parse(s.true_recipient_json) as { name?: string; phone?: string }) : null
  const phone = r?.phone ?? ""
  if (!/^\d{4}$/.test(digits) || !phone.endsWith(digits)) {
    const attempts = (u?.attempts ?? 0) + 1
    sql.exec(
      "INSERT INTO tracking_unlocks (slug, attempts, locked_until, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(slug) DO UPDATE SET attempts = excluded.attempts, locked_until = excluded.locked_until, updated_at = excluded.updated_at",
      slug,
      attempts >= UNLOCK_MAX_WRONG ? 0 : attempts,
      attempts >= UNLOCK_MAX_WRONG ? now + UNLOCK_LOCK_MS : null,
      now,
    )
    return { ok: false, code: attempts >= UNLOCK_MAX_WRONG ? "LOCKED" : "WRONG" }
  }
  sql.exec("DELETE FROM tracking_unlocks WHERE slug = ?", slug)
  // No provider jargon on the public page (the raw category is an English enum, not a human note).
  return { ok: true, value: { recipientName: r?.name ?? "", note: null } }
}
