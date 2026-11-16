// 100 mm thermal stickers (DEC-224, visual 04 §3): exact-size vector PDFs, barcode band with ≥ 3 mm quiet zones and
// no vertical borders through it, sorting pill, COD banner, recipient, masked sender, neutral INV + QR, dispute footer.
import { encode } from "uqr"
import { code128Modules, totalModules } from "./code128"
import { PdfPage, renderPdf, textWidthMm, wrapMm } from "./pdf"
import { FORMAT_SIZE_MM, grams, groupAwb, idr, kg, type LabelData, type LabelFormat } from "./model"

export const QUIET_ZONE_MM = 3
export const BAR_HEIGHT_MM = 15
const PAD = 3

/** Draws Code 128 centred in [x0, x0+w] with ≥ QUIET_ZONE_MM free on both sides; returns the bar extent. */
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

function hline(p: PdfPage, y: number, w: number) {
  p.rect(PAD, y, w - 2 * PAD, 0.3)
}

/** The 100×100 mm parcel block (identical in every 100 mm format); returns the y after it. */
function parcelBlock(p: PdfPage, d: LabelData, roomy: boolean): number {
  const W = 100
  let y = PAD + 4
  p.text(PAD, y, 10, `${d.courierName.toUpperCase()} · ${d.serviceName}`, { font: "B" })
  p.text(W - PAD, y, 7, `Cetak ${d.printedAt}`, { align: "right" })
  y += 2
  hline(p, y, W)
  y += 2
  // Barcode band: no borders left/right, quiet zones enforced inside drawBarcode.
  drawBarcode(p, d.awb, 0, y, W)
  y += BAR_HEIGHT_MM + 4.5
  p.text(W / 2, y, 12, groupAwb(d.awb), { font: "M", align: "center" })
  y += 2
  hline(p, y, W)
  y += 2
  // Sorting pill (inverted) + destination + COD banner.
  // Sorting pill: 16 pt bold inverted; a long subdistrict fallback shrinks to fit (never below 10 pt, never clipped).
  const pill = d.sortingCode ?? d.destinationFallback
  let pillSize = 16
  while (pillSize > 10 && textWidthMm(pill, pillSize, "B") + 6 > 44) pillSize -= 1
  const pillW = Math.min(44, Math.max(30, textWidthMm(pill, pillSize, "B") + 6))
  p.rect(PAD, y, pillW, 12)
  p.text(PAD + pillW / 2, y + 6 + pillSize * 0.13, pillSize, pill, { font: "B", white: true, align: "center" })
  const rx = PAD + pillW + 3
  const rw = W - PAD - rx
  // Destination wraps to at most 2 lines; the COD banner starts below whatever it used (never overlaps).
  const dest = wrapMm(d.destinationLine, rw, 7.5, "B", 2)
  for (const [i, line] of dest.entries()) p.text(rx, y + 3.4 + i * 3.4, 7.5, line, { font: "B" })
  if (d.cod) {
    const by = y + 1 + dest.length * 3.4 + 0.6
    p.rect(rx, by, rw, 6.5)
    p.text(rx + rw / 2, by + 4.7, 8.5, `COD · TAGIH PENERIMA ${idr(d.cod.collectIdr)}`, { font: "B", white: true, align: "center" })
    y = Math.max(y + 13, by + 6.5)
    p.text(rx, y + 3, 7, "Dilarang buka paket sebelum bayar ke kurir")
    y += 4.5
  } else {
    p.text(rx, y + 10.5, 9, "NON-COD", { font: "B" })
    y += 13
  }
  hline(p, y, W)
  y += 4.3
  p.text(PAD, y, 7, "PENERIMA")
  p.text(PAD + 15, y, 11, `${d.recipient.name.toUpperCase()} · ${d.recipient.phone}`.slice(0, 60), { font: "B" })
  y += 1
  for (const line of wrapMm(`${d.recipient.street} · ${d.recipient.area}`, W - 2 * PAD, 8, "R", roomy ? 3 : 2)) {
    y += 3.6
    p.text(PAD, y, 8, line)
  }
  y += 2
  hline(p, y, W)
  y += 4
  p.text(PAD, y, 7, "PENGIRIM")
  p.text(PAD + 15, y, 9, `${d.sender.name}${d.sender.phone ? ` · ${d.sender.phone}` : ""}`.slice(0, 54), { font: "B" })
  return y
}

function footerBlock(p: PdfPage, d: LabelData, y: number, withQr: boolean) {
  const W = 100
  const qr = 14
  if (withQr) {
    drawQr(p, `https://${d.trackingUrl}`, W - PAD - qr, y + 1, qr)
    p.text(W - PAD - qr - 2, y + 9, 9, `INV ${d.inv.toUpperCase()}`, { font: "B", align: "right" })
  }
  const textW = W - 2 * PAD - (withQr ? qr + 26 : 0)
  y += 4
  p.text(PAD, y, 7.5, `Isi: ${d.content}`.slice(0, 60))
  y += 3.4
  p.text(PAD, y, 7.5, `Berat ${grams(d.actualWeightGram)}${d.dims ? ` · ${d.dims}` : ""} · Tagih ${kg(d.billableWeightGram)}`.slice(0, 70))
  if (d.remark) {
    for (const line of wrapMm(d.remark, textW, 7, "R", 2)) {
      y += 3.2
      p.text(PAD, y, 7, line)
    }
  }
}

function stubBlock(p: PdfPage, d: LabelData, y0: number) {
  const W = 100
  const s = d.stub
  // Cut line with a 3 mm blank band on both sides.
  const cutY = y0
  for (let x = PAD; x < W - PAD; x += 2.5) p.rect(x, cutY, 1.4, 0.3)
  p.text(W / 2, cutY - 0.8, 6.5, "potong di sini", { align: "center" })
  let y = cutY + 6.5
  const brand = d.outlet?.name ?? d.sender.name
  p.text(PAD, y, 9, `BUKTI KIRIM · INV ${d.inv.toUpperCase()}${s.reprint ? " (dicetak ulang)" : ""}`, { font: "B" })
  p.text(W - PAD, y, 8, brand.slice(0, 28), { font: "B", align: "right" })
  y += 4
  p.text(PAD, y, 7.5, `${d.courierName} ${d.serviceName} · AWB ${d.awb} · ${d.destinationFallback}`.slice(0, 80))
  y += 3.8
  if (s.feeMode === "none") {
    const parts = [`Ongkir ${idr(s.shippingIdr)}`, s.packingIdr ? `Packing ${idr(s.packingIdr)}` : null, s.promoIdr ? `Promo -${idr(s.promoIdr)}` : null, `TOTAL ${idr(s.totalIdr)}`].filter(Boolean)
    p.text(PAD, y, 7.5, parts.join(" · "))
  } else {
    p.text(PAD, y, 7.5, `COD · Tagih penerima ${idr(d.cod?.collectIdr ?? 0)}${s.packingIdr ? ` · Packing ${idr(s.packingIdr)}` : ""}`)
  }
  y += 4.6
  const pay = s.payment
  if (pay.status === "unpaid") {
    const t = `BELUM DIBAYAR ${idr(s.totalIdr)}`
    p.rect(PAD, y - 3.4, textWidthMm(t, 9, "B") + 4, 4.6)
    p.text(PAD + 2, y, 9, t, { font: "B", white: true })
  } else if (pay.status === "paid") {
    const m = { qris: "QRIS GERAI", tunai: "TUNAI", transfer: "TRANSFER", deposit: "DEPOSIT" }[pay.method]
    p.text(PAD, y, 9, `LUNAS · ${m} ${idr(pay.method === "tunai" && pay.cashIdr ? pay.cashIdr : s.totalIdr)}${pay.method === "tunai" && pay.changeIdr ? ` · Kembali ${idr(pay.changeIdr)}` : ""}`, { font: "B" })
  } else p.text(PAD, y, 9, "Tidak ada tagihan di loket", { font: "B" })
  if (s.senderPayableIdr !== null && s.feeMode !== "none" && s.feeMode !== "dfod") {
    y += 4
    p.text(PAD, y, 7.5, `Hak COD pengirim ${idr(s.senderPayableIdr)} · cair setelah paket diterima`)
  }
  drawQr(p, `https://${d.trackingUrl}`, W - PAD - 12, cutY + 22, 12)
  y += 4.2
  p.text(PAD, y, 7.5, `Lacak: ${d.trackingUrl}`)
  if (d.outlet?.whatsapp) {
    y += 3.4
    p.text(PAD, y, 7, `WA gerai ${d.outlet.whatsapp}`)
  }
}

export function labelPage(d: LabelData, format: Exclude<LabelFormat, "roll_58mm">): PdfPage {
  const size = FORMAT_SIZE_MM[format]
  const p = new PdfPage(size.w, size.h)
  const roomy = format === "label_10x15"
  const y = parcelBlock(p, d, roomy)
  if (format === "label_10x15") {
    let yy = y
    if (d.sender.area) {
      yy += 3.6
      p.text(PAD, yy, 8, d.sender.area)
    }
    yy += 2
    p.rect(PAD, yy, 100 - 2 * PAD, 0.3)
    footerBlock(p, d, yy + 2, false)
    drawQr(p, `https://${d.trackingUrl}`, 100 - PAD - 18, 150 - PAD - 18, 18)
    p.text(100 - PAD - 21, 150 - PAD - 2, 10, `INV ${d.inv.toUpperCase()}`, { font: "B", align: "right" })
  } else {
    footerBlock(p, d, y + 1, true)
  }
  if (format === "label_10x15_with_stub") stubBlock(p, d, 100)
  return p
}

/** Exact-size PDF for one or many labels (bulk print merges pages of the same format). */
export function labelsPdf(items: LabelData[], format: Exclude<LabelFormat, "roll_58mm">): Uint8Array {
  return renderPdf(items.map((d) => labelPage(d, format)))
}
