// `Paket Massal` CSV (spec 03 §1.3, DEC-229): RFC 4180 parsing (quotes, commas, CRLF, BOM, `;` from Excel ID locale),
// Indonesian header mapping, per-row validation in Indonesian. Max 200 rows, 1 MB. `.xlsx` waits for an ADR.
import { cleanText, normalizePhone08, validStreet } from "../contacts"

export const BULK_MAX_ROWS = 200
export const BULK_MAX_BYTES = 1024 * 1024
export const TEMPLATE_HEADERS = ["Nama Penerima", "No HP", "Alamat", "Kecamatan/Kota", "Kode Pos", "Isi Paket", "Berat (gram)", "Panjang", "Lebar", "Tinggi", "COD (Rp)", "Nilai Barang (Rp)", "Catatan"] as const

/** Parses CSV text into rows of cells. Detects `;` when the header line has more `;` than `,` (Excel ID). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "")
  const firstLine = src.slice(0, src.indexOf("\n") === -1 ? src.length : src.indexOf("\n"))
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ","
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(cell)
      cell = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++
      row.push(cell)
      cell = ""
      if (row.some((c) => c.trim() !== "")) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim() !== "")) rows.push(row)
  return rows
}

export interface BulkRowInput {
  rowNo: number
  name: string
  phone: string
  street: string
  areaText: string
  postalCode: string
  content: string
  weightGram: string
  lengthCm: string
  widthCm: string
  heightCm: string
  codIdr: string
  declaredIdr: string
  note: string
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "")
const KEYS: Record<string, keyof Omit<BulkRowInput, "rowNo">> = {
  namapenerima: "name",
  nohp: "phone",
  alamat: "street",
  kecamatankota: "areaText",
  kodepos: "postalCode",
  isipaket: "content",
  beratgram: "weightGram",
  panjang: "lengthCm",
  lebar: "widthCm",
  tinggi: "heightCm",
  codrp: "codIdr",
  nilaibarangrp: "declaredIdr",
  catatan: "note",
}

/** Maps CSV cells to rows by header name (order-independent). Errors: missing required headers, too many rows. */
export function rowsFromCsv(text: string): { ok: true; rows: BulkRowInput[] } | { ok: false; message: string } {
  if (new TextEncoder().encode(text).byteLength > BULK_MAX_BYTES) return { ok: false, message: "Berkas lebih dari 1 MB." }
  const cells = parseCsv(text)
  if (cells.length < 2) return { ok: false, message: "Berkas kosong. Gunakan template Paket Massal." }
  const header = cells[0]!.map((h) => KEYS[norm(h)] ?? null)
  for (const req of ["name", "phone", "street", "areaText", "weightGram"] as const) {
    if (!header.includes(req)) return { ok: false, message: "Kolom wajib tidak lengkap. Gunakan template Paket Massal." }
  }
  const body = cells.slice(1)
  if (body.length > BULK_MAX_ROWS) return { ok: false, message: `Maksimal ${BULK_MAX_ROWS} baris per unggahan.` }
  return {
    ok: true,
    rows: body.map((r, i) => {
      const o: BulkRowInput = { rowNo: i + 1, name: "", phone: "", street: "", areaText: "", postalCode: "", content: "", weightGram: "", lengthCm: "", widthCm: "", heightCm: "", codIdr: "", declaredIdr: "", note: "" }
      header.forEach((k, j) => {
        if (k) o[k] = (r[j] ?? "").trim()
      })
      return o
    }),
  }
}

export interface ValidRow {
  rowNo: number
  name: string
  phone: string
  street: string
  areaText: string
  postalCode: string | null
  content: string
  weightGram: number
  dims: { lengthCm: number; widthCm: number; heightCm: number } | null
  codGoodsIdr: number
  declaredIdr: number
  note: string | null
}

const int = (s: string) => {
  const t = s.replace(/[.\s]/g, "").replace(/^Rp/i, "")
  return t === "" ? null : /^\d+$/.test(t) ? Number(t) : Number.NaN
}

/** Field validation (area matching happens on the server against Mengantar). Indonesian reasons per row. */
export function validateRow(r: BulkRowInput): { ok: true; row: ValidRow } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const name = cleanText(r.name, 80)
  if (!name) errors.push("Nama penerima kosong")
  const phone = normalizePhone08(r.phone)
  if (!phone) errors.push("No HP tidak valid")
  const street = validStreet(r.street)
  if (!street) errors.push("Alamat minimal dua kata")
  if (!cleanText(r.areaText, 120)) errors.push("Kecamatan tidak diisi")
  const w = int(r.weightGram)
  if (w === null) errors.push("Berat kosong")
  else if (!Number.isSafeInteger(w) || w < 10 || w > 100_000) errors.push("Berat 10 g sampai 100 kg")
  const dimsRaw = [int(r.lengthCm), int(r.widthCm), int(r.heightCm)]
  const anyDim = dimsRaw.some((d) => d !== null)
  if (anyDim && !dimsRaw.every((d) => d !== null && Number.isSafeInteger(d) && d >= 1 && d <= 300)) errors.push("Ukuran harus panjang, lebar, tinggi 1–300 cm")
  const cod = int(r.codIdr)
  if (cod !== null && (!Number.isSafeInteger(cod) || (cod !== 0 && (cod < 10_000 || cod > 5_000_000)))) errors.push("COD di luar batas (Rp10.000–Rp5.000.000)")
  const declared = int(r.declaredIdr)
  if (declared !== null && (!Number.isSafeInteger(declared) || declared < 0)) errors.push("Nilai barang tidak valid")
  const content = cleanText(r.content || "Paket", 60)
  if (!content) errors.push("Isi paket tidak valid")
  const postal = /^\d{5}$/.test(r.postalCode) ? r.postalCode : null
  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    row: {
      rowNo: r.rowNo,
      name: name!,
      phone: phone!,
      street: street!,
      areaText: r.areaText.trim(),
      postalCode: postal,
      content: content!,
      weightGram: w!,
      dims: anyDim ? { lengthCm: dimsRaw[0]!, widthCm: dimsRaw[1]!, heightCm: dimsRaw[2]! } : null,
      codGoodsIdr: cod ?? 0,
      declaredIdr: declared ?? 0,
      note: cleanText(r.note, 200),
    },
  }
}

/** Template CSV with the Indonesian headers and one synthetic example row. */
export function templateCsv(): string {
  const example = ["Rina Kartika", "0857-1234-8821", "Jl. Dago Asri No. 14", "Dago, Coblong, Kota Bandung", "40135", "Pakaian", "1000", "", "", "", "0", "150000", "dekat masjid"]
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  return `\uFEFF${TEMPLATE_HEADERS.map(esc).join(",")}\r\n${example.map(esc).join(",")}\r\n`
}
