// Zero-dependency `.xlsx` → CSV for Paket Massal (DEC-251). The cashier uploads the Excel file as-is; the browser turns
// its FIRST sheet into the same RFC 4180 CSV the `POST /api/app/bulk` `csv` field already accepts (header-mapped by
// `rowsFromCsv` in @gx/domain/bulk), so the server path is unchanged. ZIP (stored/deflate, no ZIP64, no encryption) is
// parsed by hand, inflated with the platform `DecompressionStream`, and the XML is scanned with small regexes (no
// DOMParser: the unit tests run in Node). Limits: cell values only — number formats are not applied (a date cell comes
// out as its serial number), formulas give their cached value, merged cells keep the value in the top-left cell only.
import { BULK_MAX_BYTES, BULK_MAX_ROWS } from "@gx/domain/bulk"

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
export const XLSX_TOO_BIG = "Berkas lebih dari 1 MB."
export const XLSX_TOO_MANY_ROWS = `Maksimal ${BULK_MAX_ROWS} baris data per unggahan.`
export const XLSX_INVALID = "Berkas bukan Excel .xlsx yang valid."

/** Inflated size cap per ZIP entry: a 1 MB upload must not expand into a tab-crashing zip bomb. */
const MAX_INFLATED = 32 * BULK_MAX_BYTES
/** lazy: columns past this are ignored (the template has 13); raise it if a real sheet ever needs more. */
const MAX_COLS = 256

class XlsxError extends Error {}
function fail(message: string): never {
  throw new XlsxError(message)
}

/** Reads the first worksheet of an `.xlsx` workbook as CSV text. Throws an `Error` with an Indonesian message. */
export async function readXlsxToCsv(buffer: ArrayBuffer): Promise<string> {
  if (buffer.byteLength > BULK_MAX_BYTES) fail(XLSX_TOO_BIG)
  try {
    const zip = readZip(new Uint8Array(buffer))
    const text = async (path: string) => {
      const e = zip.get(path.toLowerCase())
      return e ? new TextDecoder().decode(await e()) : null
    }
    const sheetPath = await firstSheetPath(text)
    const sheet = (await text(sheetPath)) ?? fail(XLSX_INVALID)
    const shared = parseSharedStrings((await text("xl/sharedStrings.xml")) ?? "")
    return toCsv(sheetRows(stripPrefixes(sheet), shared))
  } catch (e) {
    throw e instanceof XlsxError ? new Error(e.message) : new Error(XLSX_INVALID)
  }
}

// ── ZIP ────────────────────────────────────────────────────────────────────────────────────────────────────────────

type Entry = () => Promise<Uint8Array>

/** Central directory → lazily inflated entries keyed by lower-cased path (leading `/` dropped). */
export function readZip(bytes: Uint8Array): Map<string, Entry> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = (o: number) => dv.getUint16(o, true)
  const u32 = (o: number) => dv.getUint32(o, true)
  if (bytes.length < 22 || u32(0) !== 0x04034b50) fail(XLSX_INVALID)
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (u32(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) fail(XLSX_INVALID)
  const count = u16(eocd + 10)
  let p = u32(eocd + 16)
  const entries = new Map<string, Entry>()
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || u32(p) !== 0x02014b50) fail(XLSX_INVALID)
    const flags = u16(p + 8)
    const method = u16(p + 10)
    const size = u32(p + 20)
    const nameLen = u16(p + 28)
    const local = u32(p + 42)
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + u16(p + 30) + u16(p + 32)
    if (local + 30 > bytes.length || u32(local) !== 0x04034b50) fail(XLSX_INVALID)
    const start = local + 30 + u16(local + 26) + u16(local + 28)
    if (start + size > bytes.length) fail(XLSX_INVALID)
    const data = bytes.subarray(start, start + size)
    entries.set(name.replace(/^\/+/, "").toLowerCase(), async () => {
      if (flags & 1) fail(XLSX_INVALID) // encrypted entry
      if (method === 0) return data
      if (method !== 8) fail(XLSX_INVALID)
      return inflateRaw(data)
    })
  }
  return entries
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const reader = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_INFLATED) {
      await reader.cancel()
      fail(XLSX_INVALID)
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.byteLength
  }
  return out
}

// ── XML helpers ────────────────────────────────────────────────────────────────────────────────────────────────────

/** `<x:row>` → `<row>`: some writers prefix the SpreadsheetML namespace. Attribute names (`r:id`) are untouched. */
const stripPrefixes = (xml: string) => xml.replace(/<(\/?)[A-Za-z_][\w.-]*:(?=[A-Za-z_])/g, "<$1")

/** Attribute value by exact name (`r`, `t`, `r:id`) from a start tag's attribute text. */
function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name.replace(/[.:]/g, "\\$&")}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs)
  return m ? decodeXml(m[1] ?? m[2] ?? "") : null
}

/** XML entities plus Excel's `_xHHHH_` escapes (e.g. `_x000D_` for a carriage return inside a cell). */
export function decodeXml(s: string): string {
  return s
    .replace(/&(?:#x([0-9a-fA-F]+)|#(\d+)|(amp|lt|gt|quot|apos));/g, (all, hex: string | undefined, dec: string | undefined, named: string | undefined) => {
      if (named) return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[named] ?? all
      const cp = Number.parseInt(hex ?? dec ?? "", hex ? 16 : 10)
      return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : all
    })
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, h: string) => String.fromCharCode(Number.parseInt(h, 16)))
}

/** Text of a string item (`<si>` / `<is>`): every `<t>` run, rich-text `<r>` runs included, phonetic `<rPh>` skipped. */
function runText(xml: string): string {
  let out = ""
  for (const m of xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) out += decodeXml(m[1] ?? "")
  return out
}

export function parseSharedStrings(xml: string): string[] {
  return [...stripPrefixes(xml).matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((m) => runText(m[1] ?? ""))
}

/** First `<sheet>` of `xl/workbook.xml` → its worksheet path through `xl/_rels/workbook.xml.rels`. */
async function firstSheetPath(text: (path: string) => Promise<string | null>): Promise<string> {
  const fallback = "xl/worksheets/sheet1.xml"
  const wb = (await text("xl/workbook.xml")) ?? fail(XLSX_INVALID)
  const sheet = /<sheet\b([^>]*)>/.exec(stripPrefixes(wb))
  const rid = sheet ? (/(?:^|\s)[\w]+:id\s*=\s*"([^"]*)"/.exec(sheet[1]!)?.[1] ?? null) : null
  const rels = rid ? await text("xl/_rels/workbook.xml.rels") : null
  if (!rid || !rels) return fallback
  for (const m of stripPrefixes(rels).matchAll(/<Relationship\b([^>]*)>/g)) {
    if (attr(m[1]!, "Id") !== rid) continue
    const target = attr(m[1]!, "Target")
    return target ? resolvePath(target) : fallback
  }
  return fallback
}

/** Relationship target → ZIP path: absolute (`/xl/…`) or relative to `xl/`, with `..` segments resolved. */
function resolvePath(target: string): string {
  const parts = target.startsWith("/") ? [] : ["xl"]
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop()
    else if (seg && seg !== ".") parts.push(seg)
  }
  return parts.join("/")
}

/** `A` → 0, `Z` → 25, `AA` → 26 (column letters of a cell reference like `AB12`). */
export function columnIndex(ref: string): number {
  const letters = /^[A-Za-z]+/.exec(ref)?.[0] ?? ""
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

// ── Sheet → rows ───────────────────────────────────────────────────────────────────────────────────────────────────

interface Cell { text: string; numeric: boolean }

/** Numbers always without exponent or `.0` (`8.123456789E9` → `8123456789`), up to 15 decimal places. */
export function formatNumber(raw: string): string {
  const v = raw.trim()
  if (/^-?\d+$/.test(v)) return v
  const n = Number(v)
  if (!Number.isFinite(n) || v === "") return v
  return n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 15 })
}

function cellValue(attrs: string, inner: string, shared: string[]): Cell {
  const type = attr(attrs, "t") ?? "n"
  const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1]
  if (type === "inlineStr") return { text: runText(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? ""), numeric: false }
  if (v === undefined) return { text: "", numeric: false }
  if (type === "s") return { text: shared[Number.parseInt(v, 10)] ?? "", numeric: false }
  if (type === "b") return { text: v.trim() === "1" ? "TRUE" : "FALSE", numeric: false }
  if (type === "n") return { text: formatNumber(decodeXml(v)), numeric: true }
  return { text: decodeXml(v), numeric: false } // `str` (formula text), `e` (error), `d` (ISO date)
}

/** Header names that mark a phone column (No HP, Telepon, Phone, WA, WhatsApp). */
const PHONE_HEADER = /telepon|phone|whatsapp|(?<![a-z])(?:hp|wa|telp)(?![a-z])/i

function sheetRows(xml: string, shared: string[]): string[][] {
  const rows: Cell[][] = []
  // Rows come in ascending order (the schema requires it); blank rows are dropped, so their `r` index is not needed.
  for (const rm of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: Cell[] = []
    let nextCol = 0
    for (const cm of (rm[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cm[1]!, "r")
      const col = ref && /^[A-Za-z]+/.test(ref) ? columnIndex(ref) : nextCol
      nextCol = col + 1
      if (col >= MAX_COLS) continue
      row[col] = cellValue(cm[1]!, cm[2] ?? "", shared)
    }
    // Blank rows (formatted but empty, or spacer rows) carry no data: the CSV parser skips them anyway.
    if (!row.some((c) => c && c.text.trim() !== "")) continue
    rows.push(Array.from(row, (c) => c ?? { text: "", numeric: false }))
    if (rows.length > BULK_MAX_ROWS + 1) fail(XLSX_TOO_MANY_ROWS)
  }
  const phoneCols = new Set((rows[0] ?? []).flatMap((c, i) => (PHONE_HEADER.test(c.text) ? [i] : [])))
  return rows.map((row, ri) =>
    row.map((c, ci) => (ri > 0 && c.numeric && phoneCols.has(ci) && /^8\d{8,11}$/.test(c.text) ? `0${c.text}` : c.text)),
  )
}

// ── CSV ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** RFC 4180: comma separator, CRLF line ends, fields with `,` `"` CR or LF quoted (inner quotes doubled). */
export function toCsv(rows: string[][]): string {
  const width = Math.max(0, ...rows.map((r) => r.length))
  const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  return rows.map((r) => Array.from({ length: width }, (_, i) => esc(r[i] ?? "")).join(",")).join("\r\n")
}
