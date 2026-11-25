// 100 mm thermal stickers (DEC-224, visual 04 §3): clean 1-bit monochrome vector PDFs & SVG previews built for
// 203 dpi direct-thermal heads. Inspired by industrial Indonesian courier shipping labels:
//   1. Headline: Gerai logo/monogram + Gerai name (left) | bold COD amount or NON-COD hero (right)
//   2. Courier vector mark (left) + borderless Code 128 AWB barcode (right, >= 3 mm quiet zones, zero clutter)
//   3. Service pill + weight + optional KARGO/DG badges + INV code
//   4. Full-width solid black DESTINASI bar (+ outlined COD notice bar when COD)
//   5. Airy 2-column Dari: (left) | Kepada: (right) with zero redundant boxes or vertical dividers
//   6. ISI PAKET + CATATAN lines + bottom horizontal Order ID / INV barcode (no messy QR overlapping parcel text)
import { encode } from "uqr"
import { code128Modules, totalModules } from "./code128"
import { COURIER_MARKS, courierMarkKey } from "./courier-marks"
import { PdfPage, renderPdf, renderSvg, textWidthMm, wrapMm } from "./pdf"
import { FORMAT_SIZE_MM, groupAwb, idr, kg, type LabelData, type LabelFormat } from "./model"

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

const fullUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`)

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

function monogramOf(name: string): string {
  const words = name.trim().split(/[^A-Za-z0-9]+/).filter(Boolean)
  const raw = words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? "GE").slice(0, 2)
  return raw.toUpperCase() || "GE"
}

/**
 * Main parcel sticker layout.
 * - `roomy = false`: fits cleanly inside 0..98.5 mm (used by `10×10` and the top sticker of `10×15 · Paket + Bukti`).
 * - `roomy = true`: spacious 0..147 mm layout (`10×15 · Paket saja`) with larger text, generous breathing room, and
 *   isolated bottom-right tracking QR.
 */
function parcelSticker(p: PdfPage, d: LabelData, roomy: boolean): void {
  // === 1. HEADLINE: Gerai Brand (left) + COD / NON-COD Hero (right) ===
  const rightMaxW = 45
  const heroText = d.cod ? `COD : ${idr(d.cod.collectIdr)}` : "NON-COD"
  const heroSize = fitSize(heroText, rightMaxW, roomy ? 15 : 14, 9.5, "B")
  const heroW = textWidthMm(heroText, heroSize, "B")
  p.text(W - PAD, roomy ? 8.8 : 8.2, heroSize, heroText, { font: "B", align: "right" })
  p.text(W - PAD, roomy ? 12.2 : 11.4, 6.0, `Cetak ${d.printedAt}`, { align: "right" })

  const leftMaxW = Math.max(36, IW - Math.max(heroW, 24) - 3.5)
  const brandName = (d.outlet?.name ?? d.sender.name).trim() || "Gerai Pengiriman"
  const hasLogoImg = Boolean(d.outlet && (d.outlet.logoDataUrl || d.outlet.logoJpeg))

  if (d.outlet) {
    const logoSize = roomy ? 9.0 : 8.2
    const logoY = roomy ? 3.2 : 2.9
    if (hasLogoImg) {
      p.image(PAD, logoY, logoSize, logoSize, { dataUrl: d.outlet.logoDataUrl, jpeg: d.outlet.logoJpeg })
    } else {
      // Crisp 1-bit monochrome gerai monogram badge when no image logo is uploaded.
      p.rect(PAD, logoY, logoSize, logoSize)
      p.text(PAD + logoSize / 2, logoY + logoSize / 2 + 1.35, 9.5, monogramOf(brandName), { font: "B", white: true, align: "center" })
    }
    const textX = PAD + logoSize + 2.0
    const availW = Math.max(24, leftMaxW - logoSize - 2.0)
    const eyebrow = d.outlet.whatsapp ? `WA ${d.outlet.whatsapp}` : "PENGIRIMAN GERAI"
    p.text(textX, logoY + 2.6, 5.6, clampText(eyebrow, availW, 5.6, "B"), { font: "B" })
    const nameSize = fitSize(brandName.toUpperCase(), availW, roomy ? 10.5 : 9.8, 7.2, "B")
    p.text(textX, logoY + 7.2, nameSize, clampText(brandName.toUpperCase(), availW, nameSize, "B"), { font: "B" })
  } else {
    // Dropship mode: never leak outlet branding; show the reseller store cleanly.
    p.text(PAD, 5.6, 5.6, "PENGIRIMAN TOKO", { font: "B" })
    const nameSize = fitSize(brandName.toUpperCase(), leftMaxW, roomy ? 10.5 : 9.8, 7.2, "B")
    p.text(PAD, 10.1, nameSize, clampText(brandName.toUpperCase(), leftMaxW, nameSize, "B"), { font: "B" })
  }

  let y = roomy ? 13.8 : 12.8
  hline(p, y, 0.35)

  // === 2. COURIER VECTOR LOGO (left) + BORDERLESS AWB BARCODE (right) ===
  // Zero `rect` shapes share the barcode's vertical band — logo is drawn as pure vector `path` ops.
  const bandTop = y + (roomy ? 1.8 : 1.3)
  const markKey = courierMarkKey(d.courierCode) ?? courierMarkKey(d.courierName)
  const mark = markKey ? COURIER_MARKS[markKey] : null
  const logoW = 26
  const logoH = roomy ? 13.5 : 12.0
  if (mark) {
    p.vector(PAD, bandTop + 1.8, logoW, logoH, mark)
  } else {
    const cName = d.courierName.toUpperCase()
    const cPt = fitSize(cName, logoW, 11.5, 7.5, "B")
    p.text(PAD, bandTop + 10.5, cPt, clampText(cName, logoW, cPt, "B"), { font: "B" })
  }

  const barX0 = 32
  const barBandW = W - barX0 // 68 mm (keeps >= 3 mm quiet zone on both left & right)
  p.text(barX0 + barBandW / 2, bandTop + 2.2, 6.2, "Nomor Resi", { font: "B", align: "center" })
  const barY = bandTop + 3.0
  const barH = roomy ? 16.5 : 14.5
  drawBarcode(p, d.awb, barX0, barY, barBandW, barH)
  const awbTextY = barY + barH + 3.5
  p.text(barX0 + barBandW / 2, awbTextY, roomy ? 10.5 : 9.8, groupAwb(d.awb), { font: "M", align: "center" })

  // === 3. SERVICE PILL + WEIGHT + BADGES (clean strip completely below barcode band) ===
  y = awbTextY + (roomy ? 2.4 : 1.7)
  let bx = PAD
  const svc = d.serviceName.toUpperCase()
  const svcSize = fitSize(svc, 28, 7.6, 6.2, "B")
  const svcW = Math.min(30, textWidthMm(svc, svcSize, "B") + 4.0)
  const pillH = roomy ? 5.2 : 4.6
  p.rect(bx, y, svcW, pillH)
  p.text(bx + svcW / 2, y + pillH / 2 + svcSize * 0.13, svcSize, svc, { font: "B", white: true, align: "center" })
  bx += svcW + 1.8

  if (d.isCargo && !/KARGO|CARGO/.test(svc)) {
    const kw = textWidthMm("KARGO", 6.5, "B") + 3.0
    p.rect(bx, y, kw, pillH)
    p.text(bx + kw / 2, y + pillH / 2 + 0.85, 6.5, "KARGO", { font: "B", white: true, align: "center" })
    bx += kw + 1.6
  }
  if (d.isDangerousGoods) {
    const dw = textWidthMm("DG", 6.5, "B") + 3.0
    p.strokeRect(bx, y, dw, pillH, 0.45)
    p.text(bx + dw / 2, y + pillH / 2 + 0.85, 6.5, "DG", { font: "B", align: "center" })
    bx += dw + 1.6
  }

  const invTag = `INV ${d.inv.toUpperCase()}`
  const invW = textWidthMm(invTag, 7.5, "B")
  p.text(W - PAD, y + pillH / 2 + 0.95, 7.5, invTag, { font: "B", align: "right" })

  const weightMeta = `${d.courierName.toUpperCase()} · Berat: ${kg(d.billableWeightGram)}`
  const metaAvail = Math.max(18, W - PAD - invW - 2.5 - bx)
  const metaText = textWidthMm(weightMeta, 7.2, "B") <= metaAvail ? weightMeta : `Berat: ${kg(d.billableWeightGram)}`
  p.text(bx, y + pillH / 2 + 0.95, 7.2, clampText(metaText, metaAvail, 7.2, "B"), { font: "B" })

  // === 4. FULL-WIDTH DESTINATION TRIAGE BAR (+ COD NOTICE BAR) ===
  y += pillH + (roomy ? 2.2 : 1.6)
  const destH = roomy ? 8.2 : 7.0
  const destBase = d.destinationLine.trim()
  const destLabel =
    d.sortingCode && destBase && !destBase.toUpperCase().includes(d.sortingCode.toUpperCase())
      ? `DESTINASI : ${destBase} (${d.sortingCode})`
      : `DESTINASI : ${destBase || d.sortingCode || d.destinationFallback}`
  const destPt = fitSize(destLabel, IW - 5, roomy ? 10.2 : 9.2, 6.6, "B")
  p.rect(PAD, y, IW, destH)
  p.text(W / 2, y + destH / 2 + destPt * 0.13, destPt, clampText(destLabel, IW - 4, destPt, "B"), { font: "B", white: true, align: "center" })
  y += destH

  if (d.cod) {
    y += 1.2
    const noticeH = roomy ? 5.2 : 4.4
    p.strokeRect(PAD, y, IW, noticeH, 0.35)
    const noticeTxt = "Dilarang buka paket sebelum bayar kurir · Konfirmasi pengirim sebelum retur"
    const noticePt = fitSize(noticeTxt, IW - 4, 6.6, 5.8, "B")
    p.text(W / 2, y + noticeH / 2 + noticePt * 0.13, noticePt, noticeTxt, { font: "B", align: "center" })
    y += noticeH
  }

  // === 5. CLEAN 2-COLUMN `Dari:` (left) & `Kepada:` (right) — ZERO BOXES, ZERO VERTICAL LINES ===
  y += roomy ? 4.8 : 3.6
  const leftW = 35
  const rightX = PAD + leftW + 3.5 // 41.5 mm
  const rightW = W - PAD - rightX // 55.5 mm
  const leadS = roomy ? 3.8 : 3.2
  const leadR = roomy ? 4.1 : 3.3

  // Left column: Dari
  let ly = y
  p.text(PAD, ly, roomy ? 7.6 : 6.8, "Dari:")
  const sNamePt = roomy ? 9.0 : 8.2
  for (const line of wrapMm(d.sender.name, leftW, sNamePt, "B", 2)) {
    ly += leadS
    p.text(PAD, ly, sNamePt, line, { font: "B" })
  }
  if (d.sender.phone) {
    ly += leadS
    p.text(PAD, ly, roomy ? 8.0 : 7.2, clampText(d.sender.phone, leftW, roomy ? 8.0 : 7.2, "R"))
  }
  if (d.sender.area) {
    for (const line of wrapMm(d.sender.area, leftW, roomy ? 7.6 : 6.8, "R", 2)) {
      ly += leadS - 0.2
      p.text(PAD, ly, roomy ? 7.6 : 6.8, line)
    }
  }

  // Right column: Kepada
  let ry = y
  p.text(rightX, ry, roomy ? 7.6 : 6.8, "Kepada:")
  const rNamePt = roomy ? 11.2 : 9.4
  ry += roomy ? 4.6 : 3.7
  p.text(rightX, ry, rNamePt, clampText(d.recipient.name.toUpperCase(), rightW, rNamePt, "B"), { font: "B" })
  const rPhonePt = roomy ? 9.4 : 8.2
  ry += roomy ? 4.0 : 3.3
  p.text(rightX, ry, rPhonePt, clampText(d.recipient.phone, rightW, rPhonePt, "B"), { font: "B" })
  const streetPt = roomy ? 8.4 : 7.3
  const maxStreetLines = roomy ? 4 : d.cod ? 2 : 3
  for (const line of wrapMm(d.recipient.street, rightW, streetPt, "R", maxStreetLines)) {
    ry += leadR
    p.text(rightX, ry, streetPt, line)
  }
  if (d.recipient.area) {
    const areaPt = roomy ? 8.2 : 7.0
    for (const line of wrapMm(d.recipient.area, rightW, areaPt, "B", 2)) {
      ry += roomy ? leadR : 2.95
      p.text(rightX, ry, areaPt, line, { font: "B" })
    }
  }

  // === 6. ISI PAKET + CATATAN (thin clean dividers) ===
  y = Math.max(ly, ry) + (roomy ? 3.2 : 1.8)
  const maxFooterTop = roomy ? 108 : 80.2
  if (y > maxFooterTop) y = maxFooterTop
  hline(p, y, 0.3)

  y += roomy ? 4.2 : 3.4
  const qty = d.quantity && d.quantity > 1 && !/\b\d+\s*pcs\b/i.test(d.content) ? ` (${d.quantity} pcs)` : ""
  const extraBits = [d.dims, d.insuranceIdr !== null ? `Asuransi ${idr(d.insuranceIdr)}` : null].filter(Boolean).join(" · ")
  const extraPt = roomy ? 7.4 : 6.6
  const extraW = extraBits ? textWidthMm(extraBits, extraPt, "R") : 0
  if (extraBits) p.text(W - PAD, y, extraPt, extraBits, { align: "right" })
  const isiPt = roomy ? 8.2 : 7.4
  const isiLabelW = textWidthMm("ISI PAKET: ", isiPt, "R")
  p.text(PAD, y, isiPt, "ISI PAKET:")
  p.text(PAD + isiLabelW, y, isiPt, clampText(`${d.content}${qty}`, Math.max(20, IW - isiLabelW - (extraW ? extraW + 3 : 0)), isiPt, "B"), { font: "B" })

  const noteParts = [d.deliveryInstruction ? `Kurir: ${d.deliveryInstruction}` : null, d.remark || null].filter(Boolean)
  if (noteParts.length) {
    y += roomy ? 4.0 : 3.2
    const notePt = roomy ? 7.6 : 6.8
    const noteText = `CATATAN: ${noteParts.join(" · ")}`
    for (const [i, line] of wrapMm(noteText, IW, notePt, "B", roomy ? 2 : 1).entries()) {
      if (i) y += 3.2
      p.text(PAD, y, notePt, line, { font: "B" })
    }
  }

  y += roomy ? 2.4 : 1.6
  hline(p, y, 0.3)

  // === 7. BOTTOM ORDER ID BARCODE (clean horizontal barcode — zero square QR clutter on compact label!) ===
  if (!roomy) {
    const invBarY = Math.min(y + 1.4, 89.2)
    const invBarH = Math.max(5.5, Math.min(7.2, 97.5 - invBarY))
    p.text(PAD, invBarY + 3.0, 6.4, "Order ID", { font: "B" })
    p.text(PAD, invBarY + 6.4, 8.2, `INV ${d.inv.toUpperCase()}`, { font: "B" })
    drawBarcode(p, d.inv.toUpperCase(), 34, invBarY, 63, invBarH)
  } else {
    // Spacious 10×15 parcel-only lower band: Order ID barcode + clean bottom tracking strip with isolated QR.
    const invBarY = Math.max(y + 4.5, 108)
    p.text(PAD, invBarY + 3.8, 7.6, "Order ID", { font: "B" })
    p.text(PAD, invBarY + 8.0, 10.5, `INV ${d.inv.toUpperCase()}`, { font: "B" })
    drawBarcode(p, d.inv.toUpperCase(), 34, invBarY, 63, 9.5)

    const qr = 15
    const qrX = W - PAD - qr
    const qrY = 150 - PAD - qr
    hline(p, qrY - 2.6, 0.3)
    drawQr(p, fullUrl(d.trackingUrl), qrX, qrY, qr)
    const leftTrackW = qrX - PAD - 3
    p.text(PAD, qrY + 3.6, 6.8, "LACAK & BUKTI DIGITAL", { font: "B" })
    let ly2 = qrY + 7.4
    for (const line of urlLines(d.trackingUrl, leftTrackW, 7.4).slice(0, 2)) {
      p.text(PAD, ly2, 7.4, line)
      ly2 += 3.2
    }
    if (d.outlet?.whatsapp && ly2 <= 147) {
      p.text(PAD, ly2, 7.0, `WA gerai: ${d.outlet.whatsapp}`)
    }
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

  // Stub QR anchored cleanly at bottom-right (up to 14 mm for effortless phone-camera scanning on thermal paper).
  const maxQrY = 150 - PAD
  const minQrY = boxY + boxH + 1.2
  const qr = Math.max(12, Math.min(14, maxQrY - minQrY))
  const qrX = W - PAD - qr
  const qrY = Math.max(minQrY, maxQrY - qr)
  drawQr(p, fullUrl(d.trackingUrl), qrX, qrY, qr)
  const leftW = qrX - PAD - 2.2

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
  parcelSticker(p, d, roomy)
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
