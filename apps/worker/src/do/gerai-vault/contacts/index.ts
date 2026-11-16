// Contacts inside the tenant object (TASK-302, spec 01 §2.2, DEC-212). Synchronous SQL helpers; the vault RPCs wrap
// them in `transactionSync`. Validation lives here so every entry point (UI, API keys later) gets the same rules.
import { cleanText, normalizePhone08, riskBadge, validStreet, type RiskBadge } from "@gx/domain/contacts"

export type ContactError = { field: string; message: string }
export type ContactResult<T> = { ok: true; value: T } | { ok: false; errors: ContactError[] }

export type SenderRow = {
  id: string
  sender_kind: "walk_in" | "reseller_dropship"
  true_name: string
  true_phone: string
  wa_verified_at: number | null
  wa_verified_by: string | null
  true_street: string | null
  true_area_id: string | null
  true_area_label: string | null
  true_postal_code: string | null
  display_brand_name: string | null
  display_brand_phone: string | null
  hide_gerai_branding: number
  default_mask_preset: string | null
  deposit_balance_idr: number
  shipments_count: number
  is_archived: number
  created_at: number
  updated_at: number
}

export type RecipientRow = {
  id: string
  linked_sender_id: string | null
  name: string
  phone: string
  mengantar_area_id: string | null
  province_name: string | null
  city_name: string | null
  district_name: string | null
  subdistrict_name: string | null
  postal_code: string | null
  street_address: string
  address_note: string | null
  cod_delivered_count: number
  cod_rts_count: number
  risk_version: number
  is_archived: number
  created_at: number
  updated_at: number
}

export interface SenderInput {
  senderKind?: unknown
  name?: unknown
  phone?: unknown
  street?: unknown
  areaId?: unknown
  areaLabel?: unknown
  postalCode?: unknown
  brandName?: unknown
  brandPhone?: unknown
  hideGeraiBranding?: unknown
}

export interface RecipientInput {
  name?: unknown
  phone?: unknown
  street?: unknown
  areaId?: unknown
  areaLabel?: unknown
  postalCode?: unknown
  note?: unknown
  linkedSenderId?: unknown
}

const AREA_ID = /^[0-9a-f]{24}$/
const POSTAL = /^\d{5}$/

function parseSender(i: SenderInput): ContactResult<Omit<SenderRow, "id" | "wa_verified_at" | "wa_verified_by" | "default_mask_preset" | "deposit_balance_idr" | "shipments_count" | "is_archived" | "created_at" | "updated_at">> {
  const errors: ContactError[] = []
  const name = cleanText(i.name, 80)
  if (!name) errors.push({ field: "name", message: "Isi nama pengirim (maks. 80 huruf)." })
  const phone = normalizePhone08(i.phone)
  if (!phone) errors.push({ field: "phone", message: "Nomor WhatsApp tidak valid. Contoh: 0812-3456-7890." })
  const kind = i.senderKind === "reseller_dropship" ? "reseller_dropship" : "walk_in"
  const street = i.street === undefined || i.street === "" || i.street === null ? null : validStreet(i.street)
  if (street === null && i.street) errors.push({ field: "street", message: "Alamat minimal dua kata dan tanpa tautan." })
  const areaId = typeof i.areaId === "string" && AREA_ID.test(i.areaId) ? i.areaId : null
  if (i.areaId && !areaId) errors.push({ field: "areaId", message: "Pilih kecamatan dari daftar." })
  const postal = typeof i.postalCode === "string" && POSTAL.test(i.postalCode) ? i.postalCode : null
  if (i.postalCode && !postal) errors.push({ field: "postalCode", message: "Kode pos 5 angka." })
  const brandName = i.brandName ? cleanText(i.brandName, 60) : null
  if (i.brandName && !brandName) errors.push({ field: "brandName", message: "Nama toko maks. 60 huruf." })
  const brandPhone = i.brandPhone ? normalizePhone08(i.brandPhone) : null
  if (i.brandPhone && !brandPhone) errors.push({ field: "brandPhone", message: "Nomor HP label tidak valid." })
  if (kind === "reseller_dropship" && !brandName) errors.push({ field: "brandName", message: "Toko reseller wajib punya nama toko untuk label." })
  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    value: {
      sender_kind: kind,
      true_name: name!,
      true_phone: phone!,
      true_street: street,
      true_area_id: areaId,
      true_area_label: areaId ? cleanText(i.areaLabel, 200) : null,
      true_postal_code: postal,
      display_brand_name: brandName,
      display_brand_phone: brandPhone,
      hide_gerai_branding: i.hideGeraiBranding === true ? 1 : 0,
    },
  }
}

function parseRecipient(i: RecipientInput): ContactResult<Pick<RecipientRow, "name" | "phone" | "mengantar_area_id" | "subdistrict_name" | "postal_code" | "street_address" | "address_note" | "linked_sender_id">> {
  const errors: ContactError[] = []
  const name = cleanText(i.name, 80)
  if (!name) errors.push({ field: "name", message: "Isi nama penerima (maks. 80 huruf)." })
  const phone = normalizePhone08(i.phone)
  if (!phone) errors.push({ field: "phone", message: "Nomor HP penerima tidak valid. Contoh: 0857-1234-5678." })
  const street = validStreet(i.street)
  if (!street) errors.push({ field: "street", message: "Alamat minimal dua kata dan tanpa tautan." })
  const areaId = typeof i.areaId === "string" && AREA_ID.test(i.areaId) ? i.areaId : null
  if (!areaId) errors.push({ field: "areaId", message: "Pilih kecamatan tujuan dari daftar." })
  const postal = typeof i.postalCode === "string" && POSTAL.test(i.postalCode) ? i.postalCode : null
  if (i.postalCode && !postal) errors.push({ field: "postalCode", message: "Kode pos 5 angka." })
  const note = i.note ? cleanText(i.note, 200) : null
  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    value: { name: name!, phone: phone!, mengantar_area_id: areaId, subdistrict_name: cleanText(i.areaLabel, 200), postal_code: postal, street_address: street!, address_note: note, linked_sender_id: typeof i.linkedSenderId === "string" ? i.linkedSenderId : null },
  }
}

export function createSender(sql: SqlStorage, tenantId: string, input: SenderInput, now: number): ContactResult<SenderRow> {
  const p = parseSender(input)
  if (!p.ok) return p
  const dup = sql.exec<{ id: string }>("SELECT id FROM sender_contacts WHERE true_phone = ? AND is_archived = 0 LIMIT 1", p.value.true_phone).toArray()[0]
  if (dup && p.value.sender_kind === "walk_in") return { ok: false, errors: [{ field: "phone", message: "Nomor ini sudah terdaftar sebagai pengirim." }] }
  const id = crypto.randomUUID()
  sql.exec(
    `INSERT INTO sender_contacts (id, tenant_id, sender_kind, true_name, true_phone, true_street, true_area_id, true_area_label, true_postal_code,
       display_brand_name, display_brand_phone, hide_gerai_branding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    tenantId,
    p.value.sender_kind,
    p.value.true_name,
    p.value.true_phone,
    p.value.true_street,
    p.value.true_area_id,
    p.value.true_area_label,
    p.value.true_postal_code,
    p.value.display_brand_name,
    p.value.display_brand_phone,
    p.value.hide_gerai_branding,
    now,
    now,
  )
  return { ok: true, value: readSender(sql, id)! }
}

/** Updates a sender; a changed WhatsApp number clears the verification (spec 01 §2.2). */
export function updateSender(sql: SqlStorage, id: string, input: SenderInput, now: number): ContactResult<SenderRow> {
  const cur = readSender(sql, id)
  if (!cur) return { ok: false, errors: [{ field: "id", message: "Pengirim tidak ditemukan." }] }
  const p = parseSender({ senderKind: cur.sender_kind, name: cur.true_name, phone: cur.true_phone, street: cur.true_street, areaId: cur.true_area_id, areaLabel: cur.true_area_label, postalCode: cur.true_postal_code, brandName: cur.display_brand_name, brandPhone: cur.display_brand_phone, hideGeraiBranding: cur.hide_gerai_branding === 1, ...input })
  if (!p.ok) return p
  const phoneChanged = p.value.true_phone !== cur.true_phone
  sql.exec(
    `UPDATE sender_contacts SET sender_kind = ?, true_name = ?, true_phone = ?, true_street = ?, true_area_id = ?, true_area_label = ?, true_postal_code = ?,
       display_brand_name = ?, display_brand_phone = ?, hide_gerai_branding = ?, updated_at = ?,
       wa_verified_at = CASE WHEN ? THEN NULL ELSE wa_verified_at END, wa_verified_by = CASE WHEN ? THEN NULL ELSE wa_verified_by END,
       wa_verify_method = CASE WHEN ? THEN NULL ELSE wa_verify_method END
     WHERE id = ?`,
    p.value.sender_kind,
    p.value.true_name,
    p.value.true_phone,
    p.value.true_street,
    p.value.true_area_id,
    p.value.true_area_label,
    p.value.true_postal_code,
    p.value.display_brand_name,
    p.value.display_brand_phone,
    p.value.hide_gerai_branding,
    now,
    phoneChanged ? 1 : 0,
    phoneChanged ? 1 : 0,
    phoneChanged ? 1 : 0,
    id,
  )
  return { ok: true, value: readSender(sql, id)! }
}

/** Operator confirmed at the counter that the sender received the click-to-chat test message (never by API keys). */
export function markWaVerified(sql: SqlStorage, id: string, actorId: string, now: number): SenderRow | null {
  sql.exec("UPDATE sender_contacts SET wa_verified_at = ?, wa_verified_by = ?, wa_verify_method = 'operator_confirmed', updated_at = ? WHERE id = ?", now, actorId, now, id)
  return readSender(sql, id)
}

export function readSender(sql: SqlStorage, id: string): SenderRow | null {
  return sql.exec<SenderRow>("SELECT * FROM sender_contacts WHERE id = ?", id).toArray()[0] ?? null
}

export function createRecipient(sql: SqlStorage, tenantId: string, input: RecipientInput, now: number): ContactResult<RecipientRow> {
  const p = parseRecipient(input)
  if (!p.ok) return p
  const id = crypto.randomUUID()
  sql.exec(
    `INSERT INTO recipient_contacts (id, tenant_id, linked_sender_id, name, phone, mengantar_area_id, subdistrict_name, postal_code, street_address, address_note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    tenantId,
    p.value.linked_sender_id,
    p.value.name,
    p.value.phone,
    p.value.mengantar_area_id,
    p.value.subdistrict_name,
    p.value.postal_code,
    p.value.street_address,
    p.value.address_note,
    now,
    now,
  )
  return { ok: true, value: readRecipient(sql, id)! }
}

export function updateRecipient(sql: SqlStorage, id: string, input: RecipientInput, now: number): ContactResult<RecipientRow> {
  const cur = readRecipient(sql, id)
  if (!cur) return { ok: false, errors: [{ field: "id", message: "Penerima tidak ditemukan." }] }
  const p = parseRecipient({ name: cur.name, phone: cur.phone, street: cur.street_address, areaId: cur.mengantar_area_id, areaLabel: cur.subdistrict_name, postalCode: cur.postal_code, note: cur.address_note, linkedSenderId: cur.linked_sender_id, ...input })
  if (!p.ok) return p
  sql.exec(
    "UPDATE recipient_contacts SET name = ?, phone = ?, mengantar_area_id = ?, subdistrict_name = ?, postal_code = ?, street_address = ?, address_note = ?, linked_sender_id = ?, updated_at = ? WHERE id = ?",
    p.value.name,
    p.value.phone,
    p.value.mengantar_area_id,
    p.value.subdistrict_name,
    p.value.postal_code,
    p.value.street_address,
    p.value.address_note,
    p.value.linked_sender_id,
    now,
    id,
  )
  return { ok: true, value: readRecipient(sql, id)! }
}

export function readRecipient(sql: SqlStorage, id: string): RecipientRow | null {
  return sql.exec<RecipientRow>("SELECT * FROM recipient_contacts WHERE id = ?", id).toArray()[0] ?? null
}

export function archiveContact(sql: SqlStorage, kind: "sender" | "recipient", id: string, now: number): boolean {
  const table = kind === "sender" ? "sender_contacts" : "recipient_contacts"
  return sql.exec(`UPDATE ${table} SET is_archived = 1, updated_at = ? WHERE id = ? AND is_archived = 0 RETURNING id`, now, id).toArray().length > 0
}

/** Search by name or phone (any format); newest first; archived hidden. */
export function searchSenders(sql: SqlStorage, q: string, kind: "all" | "walk_in" | "reseller_dropship", limit = 50): SenderRow[] {
  const phone = normalizePhone08(q)
  const like = `%${q.trim().replace(/[%_]/g, "")}%`
  return sql
    .exec<SenderRow>(
      `SELECT * FROM sender_contacts WHERE is_archived = 0 AND (? = 'all' OR sender_kind = ?)
         AND (? = '' OR true_name LIKE ? OR display_brand_name LIKE ? OR true_phone LIKE ? OR true_phone = ?)
       ORDER BY updated_at DESC LIMIT ?`,
      kind,
      kind,
      q.trim(),
      like,
      like,
      `%${q.replace(/\D/g, "") || "~"}%`,
      phone ?? "",
      Math.min(200, limit),
    )
    .toArray()
}

export function searchRecipients(sql: SqlStorage, q: string, limit = 50): RecipientRow[] {
  const phone = normalizePhone08(q)
  const like = `%${q.trim().replace(/[%_]/g, "")}%`
  return sql
    .exec<RecipientRow>(
      `SELECT * FROM recipient_contacts WHERE is_archived = 0
         AND (? = '' OR name LIKE ? OR subdistrict_name LIKE ? OR phone LIKE ? OR phone = ?)
       ORDER BY updated_at DESC LIMIT ?`,
      q.trim(),
      like,
      like,
      `%${q.replace(/\D/g, "") || "~"}%`,
      phone ?? "",
      Math.min(200, limit),
    )
    .toArray()
}

export function senderCounts(sql: SqlStorage): { all: number; reseller_dropship: number; walk_in: number } {
  const r = sql.exec<{ all_n: number; res: number; walk: number }>(
    "SELECT COUNT(*) AS all_n, SUM(CASE WHEN sender_kind = 'reseller_dropship' THEN 1 ELSE 0 END) AS res, SUM(CASE WHEN sender_kind = 'walk_in' THEN 1 ELSE 0 END) AS walk FROM sender_contacts WHERE is_archived = 0",
  ).one()
  return { all: r.all_n, reseller_dropship: r.res ?? 0, walk_in: r.walk ?? 0 }
}

export function badgeOf(r: Pick<RecipientRow, "cod_delivered_count" | "cod_rts_count">): { badge: RiskBadge; rtsBps: number | null } {
  return riskBadge(r.cod_delivered_count, r.cod_rts_count)
}

/** The local badge for a phone at the counter: sums every recipient row with that phone in this gerai. */
export function badgeForPhone(sql: SqlStorage, raw: unknown): { phone: string | null; delivered: number; rts: number; badge: RiskBadge; rtsBps: number | null } {
  const phone = normalizePhone08(raw)
  if (!phone) return { phone: null, delivered: 0, rts: 0, badge: "baru", rtsBps: null }
  const r = sql.exec<{ d: number | null; t: number | null }>("SELECT SUM(cod_delivered_count) AS d, SUM(cod_rts_count) AS t FROM recipient_contacts WHERE phone = ?", phone).one()
  const delivered = r.d ?? 0
  const rts = r.t ?? 0
  return { phone, delivered, rts, ...riskBadge(delivered, rts) }
}

/**
 * Records a terminal COD outcome for a recipient (called by the status projection when a COD shipment ends) and
 * returns the absolute counts for the D1 `recipient_risk_index` outbox row. Versioned per phone so a retried or
 * reordered publish never double-counts (spec 01 §2.6).
 */
export function recordCodOutcome(sql: SqlStorage, recipientId: string, outcome: "delivered" | "rts", now: number): { phone: string; delivered: number; rts: number; version: number } | null {
  const row = readRecipient(sql, recipientId)
  if (!row) return null
  sql.exec(
    `UPDATE recipient_contacts SET cod_delivered_count = cod_delivered_count + ?, cod_rts_count = cod_rts_count + ?, risk_version = risk_version + 1, updated_at = ? WHERE id = ?`,
    outcome === "delivered" ? 1 : 0,
    outcome === "rts" ? 1 : 0,
    now,
    recipientId,
  )
  const totals = sql.exec<{ d: number; t: number; v: number }>("SELECT SUM(cod_delivered_count) AS d, SUM(cod_rts_count) AS t, MAX(risk_version) AS v FROM recipient_contacts WHERE phone = ?", row.phone).one()
  // The per-phone version is the sum of row versions: monotone for the phone across all of its rows.
  const version = sql.exec<{ s: number }>("SELECT SUM(risk_version) AS s FROM recipient_contacts WHERE phone = ?", row.phone).one().s
  return { phone: row.phone, delivered: totals.d, rts: totals.t, version }
}
