import { describe, expect, it } from "vitest"
import { parseCsv, rowsFromCsv } from "@gx/domain/bulk"
import { columnIndex, decodeXml, formatNumber, readXlsxToCsv, toCsv } from "./xlsx-reader"

// Real (minimal) `.xlsx` buffers: a tiny ZIP writer with CRC-32, deflated entries via CompressionStream and stored
// entries as-is. Synthetic data only (AGENTS.md example-data policy).
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff
  for (const x of b) c = CRC_TABLE[(c ^ x) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

async function deflateRaw(b: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([b as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer())
}

type ZipFile = { name: string; text: string; store?: boolean }

async function zip(files: ZipFile[]): Promise<ArrayBuffer> {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const raw = enc.encode(f.text)
    const data = f.store ? raw : await deflateRaw(raw)
    const crc = crc32(raw)
    const local = new Uint8Array(30 + name.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(8, f.store ? 0 : 8, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, raw.length, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    local.set(data, 30 + name.length)
    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(10, f.store ? 0 : 8, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, raw.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    locals.push(local)
    centrals.push(central)
    offset += local.length
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, offset, true)
  const out = new Uint8Array(offset + cdSize + 22)
  let at = 0
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, at)
    at += part.length
  }
  return out.buffer
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const sheetXml = (rows: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet ${NS}><sheetData>${rows}</sheetData></worksheet>`
const sharedXml = (items: string[]) => `<?xml version="1.0"?><sst ${NS} count="${items.length}" uniqueCount="${items.length}">${items.map((s) => `<si>${s}</si>`).join("")}</sst>`

/** Workbook with sheets in the given order; `rId` → target via rels (the first sheet is NOT sheet1.xml on purpose). */
function workbook(sheets: Array<{ name: string; target: string; xml: string }>, shared?: string[]): ZipFile[] {
  return [
    { name: "[Content_Types].xml", text: '<?xml version="1.0"?><Types/>', store: true },
    { name: "xl/workbook.xml", text: `<?xml version="1.0"?><workbook ${NS}><sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", text: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${s.target}"/>`).join("")}</Relationships>` },
    ...sheets.map((s) => ({ name: `xl/${s.target.replace(/^\/xl\//, "")}`, text: s.xml })),
    ...(shared ? [{ name: "xl/sharedStrings.xml", text: sharedXml(shared), store: true }] : []),
  ]
}

const s = (v: number) => ` t="s"><v>${v}</v></c>`
const n = (v: string) => `><v>${v}</v></c>`
const inline = (t: string) => ` t="inlineStr"><is><t>${t}</t></is></c>`

describe("readXlsxToCsv", () => {
  it("reads shared strings (rich text too), inline strings and numbers from the first sheet via workbook rels", async () => {
    const shared = ["<t>Nama Penerima</t>", "<t>No HP</t>", "<t>Berat (gram)</t>", '<r><rPr><b/></rPr><t>Rina </t></r><r><t xml:space="preserve">Kartika</t></r><rPh><t>x</t></rPh>']
    const first = sheetXml(`<row r="1"><c r="A1"${s(0)}<c r="B1"${s(1)}<c r="C1"${s(2)}<c r="D1"${inline("Kode &amp; Pos")}</row><row r="2"><c r="A2"${s(3)}<c r="B2"${n("85712348821")}<c r="C2"${n("1000")}<c r="D2"${n("40135")}</row>`)
    const other = sheetXml(`<row r="1"><c r="A1"${inline("salah sheet")}</row>`)
    const buf = await zip(workbook([{ name: "Kiriman", target: "worksheets/sheet2.xml", xml: first }, { name: "Lain", target: "/xl/worksheets/sheet1.xml", xml: other }], shared))
    expect(await readXlsxToCsv(buf)).toBe("Nama Penerima,No HP,Berat (gram),Kode & Pos\r\nRina Kartika,085712348821,1000,40135")
  })

  it("keeps column positions across gaps (A1, C1 → empty B) and drops blank rows", async () => {
    const xml = sheetXml(`<row r="1"><c r="A1"${inline("a")}<c r="C1"${inline("c")}</row><row r="2"><c r="AB2"${n("7")}</row><row r="3"><c r="A3" s="1"/></row><row r="9"/>`)
    const csv = await readXlsxToCsv(await zip(workbook([{ name: "S", target: "worksheets/sheet1.xml", xml }])))
    const lines = csv.split("\r\n")
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe(`a,,c${",".repeat(25)}`)
    expect(parseCsv(csv)[1]![27]).toBe("7")
  })

  it("restores the leading 0 only in phone columns and never prints exponents", async () => {
    const xml = sheetXml(
      `<row r="1"><c r="A1"${inline("Telepon")}<c r="B1"${inline("Kode Barang")}<c r="C1"${inline("No. WA")}<c r="D1"${inline("Kawasan")}</row>` +
        `<row r="2"><c r="A2"${n("8.123456789E9")}<c r="B2"${n("8123456789")}<c r="C2"${n("812345678901")}<c r="D2"${n("8123456789")}</row>` +
        `<row r="3"><c r="A3"${n("6285712348821")}<c r="B3"${n("1.5E+20")}<c r="C3"${n("2.5")}<c r="D3"${n("1000.0")}</row>`,
    )
    const csv = await readXlsxToCsv(await zip(workbook([{ name: "S", target: "worksheets/sheet1.xml", xml }])))
    expect(csv.split("\r\n").slice(1)).toEqual(["08123456789,8123456789,0812345678901,8123456789", "6285712348821,150000000000000000000,2.5,1000"])
  })

  it("quotes commas, quotes and newlines (RFC 4180) and the server CSV parser reads them back", async () => {
    const xml = sheetXml(
      `<row r="1"><c r="A1"${inline("Nama Penerima")}<c r="B1"${inline("No HP")}<c r="C1"${inline("Alamat")}<c r="D1"${inline("Kecamatan/Kota")}<c r="E1"${inline("Berat (gram)")}<c r="F1"${inline("Catatan")}</row>` +
        `<row r="2"><c r="A2"${inline("Toko &quot;Maju&quot;")}<c r="B2" t="str"><f>A1</f><v>0857-1234-8821</v></c><c r="C2"${inline("Jl. Dago Asri No. 14, RT 02_x000D_&#10;dekat masjid")}<c r="D2"${inline("Coblong, Kota Bandung")}<c r="E2"${n("1000")}<c r="F2" t="b"><v>1</v></c></row>`,
    )
    const csv = await readXlsxToCsv(await zip(workbook([{ name: "S", target: "worksheets/sheet1.xml", xml }])))
    expect(csv.split("\r\n")[1]).toBe('"Toko ""Maju""",0857-1234-8821,"Jl. Dago Asri No. 14, RT 02')
    const parsed = rowsFromCsv(csv)
    expect(parsed.ok && parsed.rows[0]).toMatchObject({ name: 'Toko "Maju"', phone: "0857-1234-8821", street: "Jl. Dago Asri No. 14, RT 02\r\ndekat masjid", areaText: "Coblong, Kota Bandung", weightGram: "1000", note: "TRUE" })
  })

  it("falls back to sheet1.xml when the workbook has no rels", async () => {
    const files = workbook([{ name: "S", target: "worksheets/sheet1.xml", xml: sheetXml(`<row><c${inline("x")}<c${n("2")}</row>`) }]).filter((f) => !f.name.includes("_rels"))
    expect(await readXlsxToCsv(await zip(files))).toBe("x,2")
  })

  it("rejects a file over 1 MB", async () => {
    await expect(readXlsxToCsv(new ArrayBuffer(1_048_577))).rejects.toThrow("Berkas lebih dari 1 MB.")
  })

  it("rejects more than 200 data rows but accepts exactly 200", async () => {
    const rows = (count: number) => Array.from({ length: count }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"${inline(i ? `Baris ${i}` : "Nama Penerima")}</row>`).join("")
    const ok = await readXlsxToCsv(await zip(workbook([{ name: "S", target: "worksheets/sheet1.xml", xml: sheetXml(rows(201)) }])))
    expect(ok.split("\r\n")).toHaveLength(201)
    await expect(readXlsxToCsv(await zip(workbook([{ name: "S", target: "worksheets/sheet1.xml", xml: sheetXml(rows(202)) }])))).rejects.toThrow("Maksimal 200 baris data per unggahan.")
  })

  it("rejects a buffer that is not an xlsx ZIP", async () => {
    await expect(readXlsxToCsv(new TextEncoder().encode("Nama Penerima,No HP\r\nRina,0857").buffer)).rejects.toThrow("Berkas bukan Excel .xlsx yang valid.")
    await expect(readXlsxToCsv(await zip([{ name: "hello.txt", text: "hai", store: true }]))).rejects.toThrow("Berkas bukan Excel .xlsx yang valid.")
  })
})

describe("helpers", () => {
  it("maps column letters", () => {
    expect([columnIndex("A1"), columnIndex("Z9"), columnIndex("AA1"), columnIndex("AB12")]).toEqual([0, 25, 26, 27])
  })
  it("decodes XML entities", () => {
    expect(decodeXml("&lt;a&gt; &amp; &quot;b&quot; &apos;c&apos; &#65;&#x42;")).toBe(`<a> & "b" 'c' AB`)
  })
  it("formats numbers without exponent or trailing .0", () => {
    expect([formatNumber("8.123456789E9"), formatNumber("12"), formatNumber("0.25"), formatNumber("3.0")]).toEqual(["8123456789", "12", "0.25", "3"])
  })
  it("serialises CSV", () => {
    expect(toCsv([["a", "b,c"], ['d"e']])).toBe('a,"b,c"\r\n"d""e",')
  })
})
