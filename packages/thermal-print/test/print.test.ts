import { describe, expect, it } from "vitest"
import { code128Values, COLS, drawBarcode, escposBytes, labelPage, labelsPdf, MM, PdfPage, QUIET_ZONE_MM, rollLines, rollText, splitUrl, textWidthMm } from "../src"
import { codDropship, nonCodStandard } from "./fixture"

const texts0 = (page: { ops: Array<{ kind: string; text?: string }> }) => page.ops.filter((o) => o.kind === "text").map((o) => o.text ?? "")
const mediaBoxes = (pdf: Uint8Array) => [...new TextDecoder("latin1").decode(pdf).matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => [Number(m[1]), Number(m[2])])

describe("100 mm PDFs (DEC-224)", () => {
  it("exact page sizes per format, bulk merges pages", () => {
    const mm = (v: number) => Math.round(v * MM * 1000) / 1000
    expect(mediaBoxes(labelsPdf([codDropship], "label_10x15_with_stub"))).toEqual([[mm(100), mm(150)]])
    expect(mediaBoxes(labelsPdf([codDropship], "label_10x10"))).toEqual([[mm(100), mm(100)]])
    expect(mediaBoxes(labelsPdf([codDropship, nonCodStandard, codDropship], "label_10x15"))).toEqual([[mm(100), mm(150)], [mm(100), mm(150)], [mm(100), mm(150)]])
    const head = new TextDecoder("latin1").decode(labelsPdf([codDropship], "label_10x10").slice(0, 8))
    expect(head).toBe("%PDF-1.4")
  })

  it("every text line of the stub stays inside the page, even with the largest service fee and a promo (Sol delta B-5)", () => {
    const big = { ...nonCodStandard, stub: { ...nonCodStandard.stub, shippingIdr: 12000, packingIdr: 5000, serviceFeeIdr: 200000, promoIdr: 2000, totalIdr: 215000 } }
    for (const d of [big, { ...codDropship, stub: { ...codDropship.stub, packingIdr: 5000, serviceFeeIdr: 200000, promoIdr: 2000 } }]) {
      const page = labelPage(d, "label_10x15_with_stub")
      const texts = page.ops.filter((o): o is Extract<(typeof page.ops)[number], { kind: "text" }> => o.kind === "text" && (o.align ?? "left") === "left")
      for (const t of texts) expect(t.x + textWidthMm(t.text, t.size, t.font), t.text).toBeLessThanOrEqual(100)
      expect(texts.some((t) => t.text.includes("Layanan"))).toBe(true)
    }
    expect(texts0(labelPage(big, "label_10x15_with_stub")).some((t) => t.includes(`TOTAL`))).toBe(true)
  })

  it("barcode keeps ≥ 3 mm quiet zones and nothing is drawn inside them on the barcode band", () => {
    for (const awb of [codDropship.awb, "SPXID0123456789012", "J1"]) {
      const page = labelPage({ ...codDropship, awb }, "label_10x15_with_stub")
      const bars = page.ops.filter((o): o is { kind: "rect"; x: number; y: number; w: number; h: number } => o.kind === "rect" && o.h >= 14)
      expect(bars.length).toBeGreaterThan(10)
      const left = Math.min(...bars.map((b) => b.x))
      const right = Math.max(...bars.map((b) => b.x + b.w))
      // Measured on the drawn page, not on the helper's return value.
      expect(left, awb).toBeGreaterThanOrEqual(QUIET_ZONE_MM)
      expect(100 - right, awb).toBeGreaterThanOrEqual(QUIET_ZONE_MM)
      const top = Math.min(...bars.map((b) => b.y))
      const intruders = page.ops.filter((o) => o.kind === "rect" && o.h < 14 && (o as { y: number }).y >= top && (o as { y: number }).y <= top + 15)
      expect(intruders).toEqual([])
    }
    const p = new PdfPage(100, 100)
    const b = drawBarcode(p, codDropship.awb, 0, 10, 100)
    expect(b.left).toBeGreaterThanOrEqual(QUIET_ZONE_MM)
  })

  it("sorting pill text always fits inside the pill (long subdistrict fallback shrinks, never clips)", () => {
    for (const fallback of ["COBLONG 40132", "TANJUNG PRIOK 14310", "BDO-CBL02"]) {
      const page = labelPage({ ...nonCodStandard, sortingCode: null, destinationFallback: fallback }, "label_10x10")
      const pill = page.ops.find((o) => o.kind === "rect" && o.h === 12) as { x: number; w: number }
      const t = page.ops.find((o) => o.kind === "text" && o.text === fallback) as { size: number; x: number }
      expect(textWidthMm(fallback, t.size, "B")).toBeLessThanOrEqual(pill.w - 2)
      expect(t.size).toBeGreaterThanOrEqual(10)
    }
  })

  it("Code 128: start B, weighted mod-103 checksum, stop; digit runs use subset C", () => {
    const v = code128Values("PJJ123C")
    expect(v[0]).toBe(104)
    const data = v.slice(0, -2)
    expect(v.at(-2)).toBe(data.reduce((s, x, i) => s + x * (i === 0 ? 1 : i), 0) % 103)
    expect(v.at(-1)).toBe(106)
    expect(code128Values("JX8829104412")).toContain(99) // switches to C for the digit run
  })

  it("Dropship prints the reseller, never the outlet; masked phone; neutral INV", () => {
    const text = new TextDecoder("latin1").decode(labelsPdf([codDropship], "label_10x15_with_stub"))
    expect(text).toContain("TOKO HIJAB NISA")
    expect(text).not.toContain("Berkah Jaya")
    expect(text).toContain("0857****8821")
    expect(text).toContain("INV 8K4M2P7")
    expect(text).toContain("COD \\267 TAGIH PENERIMA Rp 167.560")
  })
})

describe("58 mm roll — exactly 32 columns", () => {
  it("every text line is 32 columns (snapshot of the visual 04 specimens)", () => {
    for (const d of [codDropship, nonCodStandard]) {
      const lines = rollText(d)
      for (const l of lines) expect(l.length, JSON.stringify(l)).toBe(COLS)
    }
    expect(rollText(nonCodStandard)).toMatchSnapshot("non-cod-standard")
    expect(rollText(codDropship)).toMatchSnapshot("cod-dropship")
  })

  it("payment lines: LUNAS · TUNAI with change; inverted BELUM DIBAYAR; COD sender payable", () => {
    const t = rollText(nonCodStandard)
    expect(t).toContain("LUNAS - TUNAI          Rp 50.000")
    expect(t).toContain("Kembali                Rp 23.000")
    expect(t).toContain("Tujuan   : Rina (COBLONG 40132)".padEnd(32))
    const unpaid = rollLines({ ...nonCodStandard, stub: { ...nonCodStandard.stub, payment: { status: "unpaid" } } })
    expect(unpaid.some((l) => "text" in l && l.invert && l.text.includes("BELUM DIBAYAR Rp 27.000"))).toBe(true)
    expect(rollText(codDropship).join("\n")).toContain("Hak COD Pengirim")
    // Dropship: the receipt header is the reseller, never the outlet.
    expect(rollText(codDropship).slice(0, 40).join("\n")).not.toContain("BERKAH")
  })

  it("long hosts split before column 32 at a dot or dash; path on its own line", () => {
    const lines = splitUrl("toko-sembako-berkah-jaya-makmur.gerai.cc/lacak/8k4m2p7")
    for (const l of lines) expect(l.length).toBe(COLS)
    expect(lines.at(-1)!.trim()).toBe("/lacak/8k4m2p7")
  })

  it("ESC/POS: init, native Code 128 with the AWB, QR store/print, partial cut", () => {
    const b = escposBytes(rollLines(codDropship))
    expect([...b.slice(0, 2)]).toEqual([0x1b, 0x40])
    const s = new TextDecoder("latin1").decode(b)
    expect(s).toContain(`\x1dk\x49${String.fromCharCode(codDropship.awb.length + 2)}{B${codDropship.awb}`)
    expect(s).toContain("\x1d(k")
    expect([...b.slice(-4)]).toEqual([0x1d, 0x56, 66, 0])
  })
})
