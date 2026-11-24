// 100 mm thermal stickers (DEC-224, visual 04 §3): exact-size 1-bit monochrome vector PDFs built for 203 dpi
// direct-thermal heads. Barcode band keeps >= 3 mm quiet zones with zero vertical borders; triage band gives
// couriers 0.5-second sorting + COD/NON-COD contrast; recipient/sender/detail hierarchy fits every field without clipping.
import { encode } from "uqr"
import { code128Modules, totalModules } from "./code128"
import { PdfPage, renderPdf, renderSvg, textWidthMm, wrapMm } from "./pdf"
import { FORMAT_SIZE_MM, grams, groupAwb, idr, kg, type LabelData, type LabelFormat } from "./model"

export const QUIET_ZONE_MM = 3
export const BAR_HEIGHT_MM = 15
const PAD = 3
const W = 100
const IW = W - 2 * PAD // 94 mm printable content width

/** Draws Code 128 centred in [x0, x0+w] with >= QUIET_ZONE_MM free on both sides; returns the bar extent. */
export function drawBarcode(p: PdfPage, text: string, x0: number, y: number, w: number, h = BAR_HEIGHT_MM): { left: number; right: number; moduleMm: number } {
  const modules = code128Modules(text)
  const total = totalModules(modules)
  const usable = w - 2 * QUIET_ZONE_MM
  // Integer dots at 203 dpi (0.125 mm) per module keeps bars crisp on thermal heads.
  const dot = 25.4 / 203
  const moduleMm = Math.max(dot, Math.floor(usable / total / dot) * dot)
  const width = moduleMm * total
  let x = x0 + (w - width) / 2
  const left = x
  modules.forEach((m, i) => {
    if (i % 2 === 0) p.rect(x, y, m * moduleMm, h)
    x += m * moduleMm
  })
  return { left, right: x, moduleMm }
}

export function drawQr(p: PdfPage, text: string, x: number, y: number, sizeMm: number): void {
  const { data } = encode(text, { ecc: "M", border: 0 })
  const n = data.length
  const cell = sizeMm / n
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (data[r]![c]) p.rect(x + c * cell, y + r * cell, cell, cell)
}

function hline(p: PdfPage, y: number, h = 0.35) {
  p.rect(PAD, y, IW, h)
}

/** Clamps a single line of text to fit strictly inside `maxMm` (adds ellipsis if trimmed). */
function clampText(text: string, maxMm: number, sizePt: number, font: "R" | "B" | "M" = "R"): string {
  const clean = text.replace(/\s+/g, " ").trim()
  if (textWidthMm(clean, sizePt, font) <= maxMm) return clean
  let s = clean
  while (s.length > 1 && textWidthMm(`${s}…`, sizePt, font) > maxMm) s = s.slice(0, -1)
  return `${s.trimEnd()}…`
}

/** Shrinks font size between `maxPt` and `minPt` so `text` fits inside `maxMm`. */
function fitSize(text: string, maxMm: number, maxPt: number, minPt: number, font: "R" | "B" | "M" = "B"): number {
  let pt = maxPt
  while (pt > minPt && textWidthMm(text, pt, font) > maxMm) pt = Math.round((pt - 0.5) * 10) / 10
  return pt
}

/** The parcel block (header, borderless barcode, triage, recipient, sender); returns the y after sender divider. */
function parcelBlock(p: PdfPage, d: LabelData, roomy: boolean): number {
  // --- 1. Header bar: Courier solid badge + Service outlined pill + optional KARGO / DG + print stamp ---
  const stamp = `Cetak ${d.printedAt}`
  const stampW = textWidthMm(stamp, 6.8, "R")
  const maxLeft = IW - stampW - 2

  const courier = d.courierName.toUpperCase()
  const cSize = fitSize(courier, 38, 9.5, 7.5, "B")
  const cW = Math.min(42, textWidthMm(courier, cSize, "B") + 4.4)
  p.rect(PAD, 2.8, cW, 5.8)
  p.text(PAD + cW / 2, 2.8 + 3.0 + cSize * 0.13, cSize, courier, { font: "B", white: true, align: "center" })

  let bx = PAD + cW + 1.6
  const svc = d.serviceName.toUpperCase()
  const svcSize = fitSize(svc, Math.max(12, PAD + maxLeft - bx - 3), 7.5, 6.2, "B")
  const svcW = textWidthMm(svc, svcSize, "B") + 3.2
  if (bx + svcW <= PAD + maxLeft) {
    p.strokeRect(bx, 3.0, svcW, 5.4, 0.35)
    p.text(bx + svcW / 2, 3.0 + 2.8 + svcSize * 0.13, svcSize, svc, { font: "B", align: "center" })
    bx += svcW + 1.4
  }
  if (d.isCargo && !/KARGO|CARGO/.test(svc)) {
    const kw = textWidthMm("KARGO", 6.5, "B") + 2.8
    if (bx + kw <= PAD + maxLeft) {
      p.rect(bx, 3.0, kw, 5.4)
      p.text(bx + kw / 2, 6.6, 6.5, "KARGO", { font: "B", white: true, align: "center" })
      bx += kw + 1.4
    }
  }
  if (d.isDangerousGoods) {
    const dw = textWidthMm("DG", 6.5, "B") + 2.8
    if (bx + dw <= PAD + maxLeft) {
      p.strokeRect(bx, 3.0, dw, 5.4, 0.5)
      p.text(bx + dw / 2, 6.6, 6.5, "DG", { font: "B", align: "center" })
    }
  }
  p.text(W - PAD, 6.9, 6.8, stamp, { align: "right" })

  let y = 9.8
  hline(p, y, 0.5)

  // --- 2. Borderless Barcode band (zero left/right borders; >= 3 mm quiet zone enforced in drawBarcode) ---
  y += 1.8
  const barH = roomy ? 17 : BAR_HEIGHT_MM
  drawBarcode(p, d.awb, 0, y, W, barH)
  y += barH + 4.3
  p.text(W / 2, y, roomy ? 13 : 12, groupAwb(d.awb), { font: "M", align: "center" })
  y += 1.9
  hline(p, y, 0.45)
  y += 2.0

  // --- 3. 0.5-second Courier Triage Band: Sorting Pill (12 mm high) + Destination + COD / NON-COD ---
  const pill = d.sortingCode ?? d.destinationFallback
  let pillSize = 16
  while (pillSize > 10 && textWidthMm(pill, pillSize, "B") + 6 > 44) pillSize -= 1
  const pillW = Math.min(44, Math.max(30, textWidthMm(pill, pillSize, "B") + 6))
  p.rect(PAD, y, pillW, 12)
  p.text(PAD + pillW / 2, y + 6 + pillSize * 0.13, pillSize, pill, { font: "B", white: true, align: "center" })

  const rx = PAD + pillW + 2.8
  const rw = W - PAD - rx
  const dest = wrapMm(d.destinationLine, rw, 7.3, "B", 2)
  for (const [i, line] of dest.entries()) p.text(rx, y + 3.0 + i * 3.1, 7.3, line, { font: "B" })

  if (d.cod) {
    const by = y + dest.length * 3.1 + 1.2
    const codText = `COD · TAGIH PENERIMA ${idr(d.cod.collectIdr)}`
    const codSize = fitSize(codText, rw - 3.6, 8.2, 6.0, "B")
    p.rect(rx, by, rw, 6.4)
    p.text(rx + rw / 2, by + 3.3 + codSize * 0.13, codSize, codText, { font: "B", white: true, align: "center" })
    const noteY = Math.max(y + 12.2, by + 6.4) + 2.8
    p.text(rx, noteY, 6.6, clampText("Dilarang buka paket sebelum bayar ke kurir", rw, 6.6, "B"), { font: "B" })
    y = noteY + 1.5
  } else {
    const by = y + Math.max(6.2, dest.length * 3.1 + 1.4)
    const ncw = 23
    p.strokeRect(rx, by, ncw, 5.4, 0.5)
    p.text(rx + ncw / 2, by + 3.8, 8.5, "NON-COD", { font: "B", align: "center" })
    y = Math.max(y + 13.0, by + 6.6)
  }
  hline(p, y, 0.45)
  y += 2.0

  // --- 4. PENERIMA Block: eyebrow tag + phone right-aligned, full-width bold name, street, bold area ---
  p.strokeRect(PAD, y, 16.5, 3.8, 0.3)
  p.text(PAD + 8.25, y + 2.8, 6.2, "PENERIMA", { font: "B", align: "center" })
  p.text(W - PAD, y + 3.2, roomy ? 10 : 9.2, d.recipient.phone.slice(0, 26), { font: "B", align: "right" })
  y += roomy ? 8.8 : 8.0
  const rNameSize = roomy ? 12.5 : 11
  p.text(PAD, y, rNameSize, clampText(d.recipient.name.toUpperCase(), IW, rNameSize, "B"), { font: "B" })
  y += roomy ? 1.2 : 0.6
  const streetSize = roomy ? 9 : 7.9
  const streetLead = roomy ? 3.9 : 3.4
  for (const line of wrapMm(d.recipient.street, IW, streetSize, "R", roomy ? 3 : 2)) {
    y += streetLead
    p.text(PAD, y, streetSize, line)
  }
  if (d.recipient.area) {
    const areaSize = roomy ? 8.5 : 7.7
    for (const line of wrapMm(d.recipient.area, IW, areaSize, "B", roomy ? 2 : 1)) {
      y += roomy ? 3.8 : 3.3
      p.text(PAD, y, areaSize, line, { font: "B" })
    }
  }
  if (d.deliveryInstruction) {
    const noteSize = roomy ? 7.8 : 7.0
    for (const line of wrapMm(`Catatan kurir: ${d.deliveryInstruction}`, IW, noteSize, "B", roomy ? 2 : 1)) {
      y += roomy ? 3.5 : 3.1
      p.text(PAD, y, noteSize, line, { font: "B" })
    }
  }
  y += 1.6
  hline(p, y, 0.35)
  y += 2.0

  // --- 5. PENGIRIM Block: aligned micro-label + phone right-aligned, sender name + optional origin city ---
  p.text(PAD, y + 2.6, 6.2, "PENGIRIM", { font: "B" })
  if (d.sender.phone) p.text(W - PAD, y + 2.8, roomy ? 9 : 8.2, d.sender.phone.slice(0, 26), { font: "B", align: "right" })
  y += roomy ? 6.8 : 6.0
  const sNameSize = roomy ? 10 : 8.8
  const senderLine = d.sender.area && !roomy ? `${d.sender.name} · ${d.sender.area}` : d.sender.name
  p.text(PAD, y, sNameSize, clampText(senderLine, IW, sNameSize, "B"), { font: "B" })
  if (roomy && d.sender.area) {
    y += 3.6
    p.text(PAD, y, 8.2, clampText(d.sender.area, IW, 8.2, "R"))
  }
  y += 1.5
  hline(p, y, 0.3)
  return y
}

/** Compact parcel footer for 10x10 and top half of 10x15+stub: fits cleanly above y = 97.5 mm. */
function compactFooter(p: PdfPage, d: LabelData, y0: number) {
  const qr = 14
  const qrX = W - PAD - qr // 83 mm
  const qrY = Math.min(y0 + 1.0, 79.4)
  drawQr(p, `https://${d.trackingUrl}`, qrX, qrY, qr)
  p.text(W - PAD, qrY + qr + 2.8, 7.0, `INV ${d.inv.toUpperCase()}`, { font: "B", align: "right" })

  const textW = qrX - PAD - 2.2 // 77.8 mm
  let y = y0 + 3.5
  const qty = d.quantity && d.quantity > 1 && !/\b\d+\s*pcs\b/i.test(d.content) ? ` (${d.quantity} pcs)` : ""
  p.text(PAD, y, 7.5, clampText(`Isi: ${d.content}${qty}`, textW, 7.5, "B"), { font: "B" })
  y += 3.2
  const weightLine = `Berat ${grams(d.actualWeightGram)}${d.dims ? ` · ${d.dims}` : ""} · Tagih ${kg(d.billableWeightGram)}`
  p.text(PAD, y, 7.2, clampText(weightLine, textW, 7.2, "R"))
  if (d.insuranceIdr !== null) {
    y += 3.0
    p.text(PAD, y, 7.0, clampText(`Asuransi: ${idr(d.insuranceIdr)}`, textW, 7.0, "R"))
  }
  if (d.remark && y < 93.2) {
    const maxLines = y < 90.2 ? 2 : 1
    for (const line of wrapMm(d.remark, textW, 6.7, "R", maxLines)) {
      y += 2.9
      if (y <= 96.8) p.text(PAD, y, 6.7, line)
    }
  }
}

/** Roomy 10x15 parcel-only lower section: structured detail grid + dispute box + bottom INV/QR strip (zero dead void). */
function roomyFooter(p: PdfPage, d: LabelData, y0: number) {
  let y = y0 + 2.4
  const col1 = 54
  const col2 = IW - col1
  const row1H = 13
  const row2H = 10

  // Structured 2x2 Detail Paket table
  p.strokeRect(PAD, y, IW, row1H + row2H, 0.35)
  p.rect(PAD + col1, y, 0.3, row1H + row2H)
  p.rect(PAD, y + row1H, IW, 0.3)

  p.text(PAD + 2, y + 3.3, 6.2, "ISI PAKET", { font: "B" })
  for (const [i, line] of wrapMm(d.content || "—", col1 - 4, 8.2, "B", 2).entries()) {
    p.text(PAD + 2, y + 7.1 + i * 3.5, 8.2, line, { font: "B" })
  }

  p.text(PAD + col1 + 2, y + 3.3, 6.2, "BERAT ASLI / TAGIH", { font: "B" })
  p.text(PAD + col1 + 2, y + 7.5, 9.2, clampText(`${grams(d.actualWeightGram)}`, col2 - 4, 9.2, "B"), { font: "B" })
  p.text(PAD + col1 + 2, y + 11.2, 7.5, clampText(`Tagih: ${kg(d.billableWeightGram)}`, col2 - 4, 7.5, "R"))

  const r2 = y + row1H
  const hasQty = Boolean(d.quantity && d.quantity > 1)
  p.text(PAD + 2, r2 + 3.3, 6.2, hasQty ? "DIMENSI & JUMLAH" : "DIMENSI PAKET", { font: "B" })
  p.text(PAD + 2, r2 + 7.5, 8.0, clampText(hasQty ? `${d.dims ?? "—"} · ${d.quantity} pcs` : d.dims ?? "—", col1 - 4, 8.0, "R"))

  p.text(PAD + col1 + 2, r2 + 3.3, 6.2, "ASURANSI", { font: "B" })
  p.text(PAD + col1 + 2, r2 + 7.5, 8.0, d.insuranceIdr === null ? "—" : idr(d.insuranceIdr), { font: "B" })

  // Dispute-shield / unboxing note box
  y = r2 + row2H + 2.5
  const noteH = 9.5
  p.strokeRect(PAD, y, IW, noteH, 0.3)
  p.text(PAD + 2, y + 3.2, 6.2, "CATATAN & KLAIM", { font: "B" })
  const noteText = d.remark || "Rekam video paket utuh saat dibuka untuk syarat klaim kerusakan/kekurangan."
  for (const [i, line] of wrapMm(noteText, IW - 4, 7.3, "R", 2).entries()) {
    p.text(PAD + 2, y + 6.4 + i * 2.8, 7.3, line)
  }

  // Bottom tracking + return-key strip anchored cleanly at the bottom of the 150 mm sticker
  const qr = 18
  const qrX = W - PAD - qr
  const qrY = 150 - PAD - qr
  hline(p, qrY - 3, 0.35)
  drawQr(p, `https://${d.trackingUrl}`, qrX, qrY, qr)
  const leftW = qrX - PAD - 3
  p.text(PAD, qrY + 3.2, 6.5, "KODE KIRIMAN (LACAK & RETUR)", { font: "B" })
  p.text(PAD, qrY + 8.6, 12.5, `INV ${d.inv.toUpperCase()}`, { font: "B" })
  let ly = qrY + 12.6
  for (const line of urlLines(d.trackingUrl, leftW, 7.4).slice(0, 2)) {
    p.text(PAD, ly, 7.4, line)
    ly += 3.1
  }
  if (d.outlet?.whatsapp && ly <= 147) {
    p.text(PAD, ly, 7.0, `WA gerai: ${d.outlet.whatsapp}`)
  }
}

/** Splits a URL line to fit `widthMm`: breaks after `.` or `-`, or before `/`, never inside a label. */
export function urlLines(text: string, widthMm: number, sizePt: number): string[] {
  const out: string[] = []
  let rest = text
  while (textWidthMm(rest, sizePt) > widthMm) {
    let cut = -1
    for (let i = 1; i < rest.length; i++) {
      const ch = rest[i - 1]!
      const next = rest[i]!
      const boundary = ch === "." || ch === "-" || next === "/"
      if (boundary && textWidthMm(rest.slice(0, i), sizePt) <= widthMm) cut = i
    }
    if (cut <= 0) break // nothing breakable fits: print as is (never split mid-label)
    out.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  out.push(rest)
  return out
}

/** Joins charge items with " · " into as few lines as fit `widthMm`; an item is never split across lines. */
export function chargeLines(items: string[], widthMm: number, sizePt: number): string[] {
  const lines: string[] = []
  for (const it of items) {
    const last = lines[lines.length - 1]
    if (last !== undefined && textWidthMm(`${last} · ${it}`, sizePt) <= widthMm) lines[lines.length - 1] = `${last} · ${it}`
    else lines.push(it)
  }
  return lines
}

function stubBlock(p: PdfPage, d: LabelData, y0: number) {
  const s = d.stub
  // Cut line at y0 with clean white gap around the label so dashes never cross the words.
  const cutY = y0
  for (let x = PAD; x < W - PAD; x += 2.6) {
    if (x > 37 && x < 63) continue
    p.rect(x, cutY, 1.5, 0.3)
  }
  p.text(W / 2, cutY + 1.0, 6.2, "POTONG DI SINI", { font: "B", align: "center" })

  // Header row: BUKTI KIRIM · INV + Brand/Outlet name
  let y = cutY + 6.2
  const brand = d.outlet?.name ?? d.sender.name
  const title = `BUKTI KIRIM · INV ${d.inv.toUpperCase()}${s.reprint ? " (ULANG)" : ""}`
  p.text(PAD, y, 8.8, title, { font: "B" })
  p.text(W - PAD, y, 8.2, clampText(brand, IW - textWidthMm(title, 8.8, "B") - 3, 8.2, "B"), { font: "B", align: "right" })
  y += 1.6
  hline(p, y, 0.3)

  // Shipment summary: courier + grouped AWB + recipient/destination + weight
  y += 3.6
  p.text(PAD, y, 7.6, clampText(`${d.courierName} · ${d.serviceName} · Resi ${groupAwb(d.awb)}`, IW, 7.6, "B"), { font: "B" })
  y += 3.4
  p.text(PAD, y, 7.2, clampText(`Tujuan: ${d.recipient.name} (${d.destinationFallback}) · Tagih ${kg(d.billableWeightGram)}`, IW, 7.2, "R"))
  y += 3.4

  // Charge lines: items wrap within the 94 mm content width so nothing clips even with max service fee + promo.
  const charges =
    s.feeMode === "none"
      ? [`Ongkir ${idr(s.shippingIdr)}`, d.insuranceIdr ? `Asuransi ${idr(d.insuranceIdr)}` : null, s.packingIdr ? `Packing ${idr(s.packingIdr)}` : null, s.serviceFeeIdr ? `Layanan ${idr(s.serviceFeeIdr)}` : null, s.promoIdr ? `Promo -${idr(s.promoIdr)}` : null, `TOTAL ${idr(s.totalIdr)}`]
      : [`COD · Tagih penerima ${idr(d.cod?.collectIdr ?? 0)}`, s.packingIdr ? `Packing ${idr(s.packingIdr)}` : null, s.serviceFeeIdr ? `Layanan ${idr(s.serviceFeeIdr)}` : null, s.promoIdr ? `Promo -${idr(s.promoIdr)}` : null]
  for (const line of chargeLines(charges.filter((x): x is string => !!x), IW, 7.2)) {
    p.text(PAD, y, 7.2, line)
    y += 3.2
  }

  // Payment status strip (inverted black for unpaid, crisp outlined pill for paid — vertically centred)
  y += 1.6
  const pay = s.payment
  const boxH = 5.2
  const boxY = y - 3.6
  if (pay.status === "unpaid") {
    const t = `BELUM DIBAYAR ${idr(s.totalIdr)}`
    const pt = fitSize(t, IW - 4.4, 8.5, 6.8, "B")
    const bw = Math.min(IW, textWidthMm(t, pt, "B") + 4.4)
    p.rect(PAD, boxY, bw, boxH)
    p.text(PAD + 2.2, boxY + boxH / 2 + pt * 0.13, pt, t, { font: "B", white: true })
  } else if (pay.status === "paid") {
    const m = { qris: "QRIS GERAI", tunai: "TUNAI", transfer: "TRANSFER", deposit: "DEPOSIT" }[pay.method]
    const txt = `LUNAS · ${m} ${idr(pay.method === "tunai" && pay.cashIdr ? pay.cashIdr : s.totalIdr)}${pay.method === "tunai" && pay.changeIdr ? ` · Kembali ${idr(pay.changeIdr)}` : ""}`
    const pt = fitSize(txt, IW - 4, 8.4, 6.8, "B")
    const bw = Math.min(IW, textWidthMm(txt, pt, "B") + 4)
    p.strokeRect(PAD, boxY, bw, boxH, 0.4)
    p.text(PAD + 2, boxY + boxH / 2 + pt * 0.13, pt, txt, { font: "B" })
  } else {
    p.text(PAD, y, 8.4, "Tidak ada tagihan di loket", { font: "B" })
  }

  // Stub QR anchored cleanly at bottom-right (x = 85 mm, size = 12 mm; keeps left text <= 83 mm).
  const qr = 12
  const qrX = W - PAD - qr // 85 mm
  const qrY = Math.max(boxY + boxH + 1.5, Math.min(150 - PAD - qr, cutY + 34))
  drawQr(p, `https://${d.trackingUrl}`, qrX, qrY, qr)
  const leftW = qrX - PAD - 2.2 // 79.8 mm

  y = boxY + boxH
  if (s.senderPayableIdr !== null && s.feeMode !== "none" && s.feeMode !== "dfod") {
    y += 4.0
    p.text(PAD, y, 7.2, clampText(`Hak COD pengirim ${idr(s.senderPayableIdr)} · cair setelah paket diterima`, leftW, 7.2, "B"), { font: "B" })
  }
  y += 3.8
  // Tracking URL stays strictly left of the stub QR (x = 85 mm); wraps at `.`, `-` or before `/lacak/...`.
  for (const [i, line] of urlLines(`Lacak: ${d.trackingUrl}`, leftW, 7.1).entries()) {
    if (i) y += 3.0
    p.text(PAD, y, 7.1, line)
  }
  if (d.outlet?.whatsapp && y + 3.0 <= 147.2) {
    y += 3.1
    p.text(PAD, y, 6.8, `WA gerai: ${d.outlet.whatsapp}`)
  }
  if (y + 3.0 <= 147.5) {
    y += 3.0
    p.text(PAD, y, 6.4, "Simpan bukti ini sebagai tanda terima & klaim")
  }
}

export function labelPage(d: LabelData, format: Exclude<LabelFormat, "roll_58mm">): PdfPage {
  const size = FORMAT_SIZE_MM[format]
  const p = new PdfPage(size.w, size.h)
  const roomy = format === "label_10x15"
  const y = parcelBlock(p, d, roomy)
  if (format === "label_10x15") roomyFooter(p, d, y)
  else compactFooter(p, d, y)
  if (format === "label_10x15_with_stub") stubBlock(p, d, 100)
  return p
}

/** Exact-size PDF for one or many labels (bulk print merges pages of the same format). */
export function labelsPdf(items: LabelData[], format: Exclude<LabelFormat, "roll_58mm">): Uint8Array {
  return renderPdf(items.map((d) => labelPage(d, format)))
}

/** Exact-size vector SVG preview of one label (generated from the exact same ops as labelsPdf). */
export function labelSvg(d: LabelData, format: Exclude<LabelFormat, "roll_58mm">): string {
  return renderSvg(labelPage(d, format))
}
