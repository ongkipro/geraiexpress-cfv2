// Tenant settings forms (TASK-310, visual 08 §2.3, spec 01 §2.4, DEC-218). Each form validates its own fields and
// returns Indonesian field errors; callers write inside `transactionSync` and audit. NPWP is stored encrypted by the
// caller and never returned in plain text (only a masked tail).
import { cleanText, normalizePhone08, validStreet } from "@gx/domain/contacts"

export type FieldErrors = Record<string, string>
export type FormResult<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors }

const AREA = /^[0-9a-f]{24}$/
const FORMATS = ["label_10x15_with_stub", "label_10x10", "label_10x15", "roll_58mm"] as const
const ENTITY = ["perorangan", "ud", "cv", "pt", "koperasi", "lainnya"] as const

export interface ProfileForm {
  name: string
  whatsapp: string | null
  openingHours: string | null
  areaId: string
  areaLabel: string | null
  street: string
  postalCode: string | null
  logoMediaId: string | null
}

export function parseProfile(b: Record<string, unknown>): FormResult<ProfileForm> {
  const e: FieldErrors = {}
  const name = cleanText(b.name, 80)
  if (!name || name.length < 3) e.name = "Nama gerai minimal 3 huruf."
  const wa = b.whatsapp === "" || b.whatsapp == null ? null : normalizePhone08(b.whatsapp)
  if (b.whatsapp && !wa) e.whatsapp = "Nomor WhatsApp tidak valid."
  const hours = b.openingHours === "" || b.openingHours == null ? null : cleanText(b.openingHours, 80)
  const areaId = typeof b.areaId === "string" && AREA.test(b.areaId) ? b.areaId : ""
  if (!areaId) e.areaId = "Pilih kecamatan dari daftar."
  const street = validStreet(b.street)
  if (!street) e.street = "Alamat minimal dua kata."
  const postal = b.postalCode === "" || b.postalCode == null ? null : /^\d{5}$/.test(String(b.postalCode)) ? String(b.postalCode) : undefined
  if (postal === undefined) e.postalCode = "Kode pos 5 angka."
  const logo = typeof b.logoMediaId === "string" && /^[0-9a-f-]{36}$/.test(b.logoMediaId) ? b.logoMediaId : null
  if (Object.keys(e).length) return { ok: false, errors: e }
  return { ok: true, value: { name: name!, whatsapp: wa, openingHours: hours, areaId, areaLabel: cleanText(b.areaLabel, 160), street: street!, postalCode: postal ?? null, logoMediaId: logo } }
}

export interface BusinessForm {
  entityType: (typeof ENTITY)[number] | null
  legalName: string | null
  brandName: string | null
  nib: string | null
  /** `undefined` = keep the stored NPWP; `null` = clear it; string = digits to encrypt. */
  npwp: string | null | undefined
  registeredAddress: string | null
  picName: string | null
  picRole: string | null
  picEmail: string | null
  picPhone: string | null
}

const opt = (v: unknown, max: number) => (v === "" || v == null ? null : cleanText(v, max))

/** All optional (DEC-218): an empty profile never blocks anything. */
export function parseBusiness(b: Record<string, unknown>): FormResult<BusinessForm> {
  const e: FieldErrors = {}
  const entity = b.entityType === "" || b.entityType == null ? null : (ENTITY as readonly string[]).includes(String(b.entityType)) ? (b.entityType as BusinessForm["entityType"]) : undefined
  if (entity === undefined) e.entityType = "Pilih bentuk usaha dari daftar."
  const nib = b.nib === "" || b.nib == null ? null : String(b.nib).replace(/\D/g, "")
  if (nib !== null && nib.length !== 13) e.nib = "NIB terdiri dari 13 angka."
  // Omitted = keep the stored value; "" or null = clear; digits = replace.
  let npwp: string | null | undefined = undefined
  if (b.npwp === null || b.npwp === "") npwp = null
  else if (b.npwp !== undefined) {
    const d = String(b.npwp).replace(/\D/g, "")
    if (d.length !== 15 && d.length !== 16) e.npwp = "NPWP 15 atau 16 angka."
    else npwp = d
  }
  const email = b.picEmail === "" || b.picEmail == null ? null : String(b.picEmail).trim().toLowerCase()
  if (email !== null && !/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/.test(email)) e.picEmail = "Alamat email tidak valid."
  const phone = b.picPhone === "" || b.picPhone == null ? null : normalizePhone08(b.picPhone)
  if (b.picPhone && !phone) e.picPhone = "Nomor HP tidak valid."
  if (Object.keys(e).length) return { ok: false, errors: e }
  return {
    ok: true,
    value: { entityType: entity ?? null, legalName: opt(b.legalName, 120), brandName: opt(b.brandName, 80), nib, npwp, registeredAddress: opt(b.registeredAddress, 240), picName: opt(b.picName, 80), picRole: opt(b.picRole, 60), picEmail: email, picPhone: phone },
  }
}

/** `••••••••••••3456` — the only form an NPWP ever leaves the object in. */
export const maskNpwp = (digits: string) => `${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`

export interface ReceiptForm {
  defaultLabelFormat: (typeof FORMATS)[number]
  unboxingRemark: string
  showCommission: boolean
}

export function parseReceipt(b: Record<string, unknown>): FormResult<ReceiptForm> {
  const e: FieldErrors = {}
  const fmt = (FORMATS as readonly string[]).includes(String(b.defaultLabelFormat)) ? (b.defaultLabelFormat as ReceiptForm["defaultLabelFormat"]) : null
  if (!fmt) e.defaultLabelFormat = "Pilih format label."
  const remark = typeof b.unboxingRemark === "string" ? b.unboxingRemark.replace(/\s+/g, " ").trim() : ""
  if (remark.length > 50) e.unboxingRemark = "Maksimal 50 karakter."
  if (/<|>|https?:\/\//i.test(remark)) e.unboxingRemark = "Tanpa tautan atau tanda < >."
  if (Object.keys(e).length) return { ok: false, errors: e }
  return { ok: true, value: { defaultLabelFormat: fmt!, unboxingRemark: remark, showCommission: b.showCommission === true } }
}

export interface PackingForm {
  items: Array<{ id: string | null; name: string; priceIdr: number; active: boolean }>
  serviceFeeEnabled: boolean
  serviceFeeIdr: number | null
}

export function parsePacking(b: Record<string, unknown>): FormResult<PackingForm> {
  const e: FieldErrors = {}
  const raw = Array.isArray(b.items) ? (b.items as Array<Record<string, unknown>>) : []
  if (raw.length > 20) e.items = "Maksimal 20 item packing."
  const items: PackingForm["items"] = []
  raw.slice(0, 20).forEach((it, i) => {
    const name = cleanText(it?.name, 40)
    const price = typeof it?.priceIdr === "number" ? it.priceIdr : Number(it?.priceIdr)
    if (!name || name.length < 2) e[`items.${i}.name`] = "Nama item minimal 2 huruf."
    if (!Number.isSafeInteger(price) || price < 0 || price > 1_000_000) e[`items.${i}.priceIdr`] = "Harga Rp0–Rp1.000.000."
    items.push({ id: typeof it?.id === "string" && /^[0-9a-f-]{36}$/.test(it.id) ? it.id : null, name: name ?? "", priceIdr: price, active: it?.active !== false })
  })
  const enabled = b.serviceFeeEnabled === true
  const fee = b.serviceFeeIdr === null || b.serviceFeeIdr === "" || b.serviceFeeIdr === undefined ? null : Number(b.serviceFeeIdr)
  if (enabled && (fee === null || !Number.isSafeInteger(fee) || fee < 1000 || fee > 200_000)) e.serviceFeeIdr = "Biaya layanan Rp1.000–Rp200.000."
  if (Object.keys(e).length) return { ok: false, errors: e }
  return { ok: true, value: { items, serviceFeeEnabled: enabled, serviceFeeIdr: enabled ? fee : fee !== null && Number.isSafeInteger(fee) && fee >= 1000 && fee <= 200_000 ? fee : null } }
}

/** Default packing catalogue offered before the owner edits it (visual 08 §2.3 examples, prices editable). */
export const DEFAULT_PACKING: Array<{ name: string; priceIdr: number }> = [
  { name: "Plastik", priceIdr: 1000 },
  { name: "Bubble wrap", priceIdr: 3000 },
  { name: "Kardus kecil", priceIdr: 5000 },
  { name: "Kardus sedang", priceIdr: 8000 },
]
