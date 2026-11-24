// 58 mm roll (visual 04 §2): label + `Struk Jujur` in exactly 32 columns per line. Text layout is pure so it can be
// snapshot-tested; `escpos.ts` turns it into printer bytes (barcode/QR via native ESC/POS commands).
import { groupAwb, type LabelData } from "./model"

export const COLS = 32

/** One line of a roll print: plain text, or a native barcode/QR/cut instruction. */
export type RollLine = { text: string; bold?: boolean; invert?: boolean; center?: boolean } | { barcode: string } | { qr: string } | { cut: true }

const ascii = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/·/g, "-").replace(/[–—]/g, "-").replace(/×/g, "x").replace(/[^\x20-\x7e]/g, "")
export const center = (s: string) => {
  const t = ascii(s).slice(0, COLS)
  const left = Math.floor((COLS - t.length) / 2)
  return (" ".repeat(left) + t).padEnd(COLS)
}
export const pad = (s: string) => ascii(s).slice(0, COLS).padEnd(COLS)
/** `label ........ value` right-aligned value in 32 columns. */
export const kv = (k: string, v: string) => {
  const kk = ascii(k)
  const vv = ascii(v)
  const room = COLS - vv.length
  return (kk.slice(0, Math.max(0, room - 1)).padEnd(room) + vv).slice(0, COLS)
}
/** Money right-aligned with `Rp` in a fixed 12-char column (`Rp   24.000`). */
export const money = (k: string, n: number, neg = false) => kv(k, `${neg ? "-" : ""}Rp ${n.toLocaleString("id-ID").replace(/\u00a0/g, "")}`.padStart(12))
export const rule = () => "-".repeat(COLS)

/** Word wrap to 32 columns, max `lines` lines. */
export function wrap32(s: string, lines = 3): string[] {
  const words = ascii(s).replace(/\s+/g, " ").trim().split(" ")
  const out: string[] = []
  let cur = ""
  for (const w of words) {
    if (!cur) cur = w.slice(0, COLS)
    else if (cur.length + 1 + w.length <= COLS) cur += ` ${w}`
    else {
      out.push(cur)
      cur = w.slice(0, COLS)
    }
  }
  if (cur) out.push(cur)
  return out.slice(0, lines).map(pad)
}

/** Splits a tracking URL so no line passes column 32 (visual 04 §1.4): host on line(s), `/lacak/<slug>` last. */
export function splitUrl(url: string): string[] {
  const i = url.indexOf("/")
  const host = i < 0 ? url : url.slice(0, i)
  const path = i < 0 ? "" : url.slice(i)
  const lines: string[] = []
  let h = host
  while (h.length > COLS) {
    const cut = Math.max(h.lastIndexOf(".", COLS - 1), h.lastIndexOf("-", COLS - 1))
    const at = cut > 0 ? cut + 1 : COLS
    lines.push(h.slice(0, at))
    h = h.slice(at)
  }
  lines.push(h)
  if (path) lines.push(path)
  return lines.map(center)
}

export function rollLines(d: LabelData): RollLine[] {
  const L: RollLine[] = []
  const t = (text: string, o: { bold?: boolean; invert?: boolean } = {}) => L.push({ text, ...o })
  // --- Parcel label ---
  t(center(d.courierName.toUpperCase()), { bold: true })
  const svcBadge = [d.serviceName, d.isCargo ? "KARGO" : null, d.isDangerousGoods ? "DG/BATERAI" : null].filter(Boolean).join(" - ")
  t(center(`LAYANAN: ${svcBadge}`))
  L.push({ barcode: d.awb })
  t(center(groupAwb(d.awb)), { bold: true })
  t(center(d.sortingCode ?? d.destinationFallback), { bold: true, invert: true })
  if (d.cod) {
    t(center(`COD - TAGIH: Rp ${d.cod.collectIdr.toLocaleString("id-ID").replace(/\u00a0/g, "")}`), { bold: true, invert: true })
    t(center("*Dilarang buka sblm bayar kurir*"))
  } else t(center("NON-COD"), { bold: true })
  t(rule())
  t(pad("PENERIMA:"))
  t(pad(d.recipient.name.toUpperCase()), { bold: true })
  t(pad(d.recipient.phone))
  for (const l of wrap32(d.recipient.street, 3)) t(l)
  for (const l of wrap32(d.recipient.area.toUpperCase(), 2)) t(l)
  if (d.deliveryInstruction) for (const l of wrap32(`Catatan: ${d.deliveryInstruction}`, 2)) t(l)
  t(rule())
  t(pad("PENGIRIM:"))
  t(pad(`${d.sender.name}${d.sender.phone ? ` (${d.sender.phone})` : ""}`))
  t(kv(d.sender.area ?? "", `INV: ${d.inv.toUpperCase()}`))
  t(rule())
  t(pad(`Berat : ${d.actualWeightGram.toLocaleString("id-ID")} g (Tagih: ${d.billableWeightGram.toLocaleString("id-ID")} g)`))
  t(pad(`Ukuran: ${d.dims ?? "-"} | Asuransi:${d.insuranceIdr === null ? "-" : d.insuranceIdr.toLocaleString("id-ID")}`))
  const qtySuffix = d.quantity && d.quantity > 1 ? ` (${d.quantity} pcs)` : ""
  const maxContent = COLS - "Isi   : ".length - qtySuffix.length
  const contentText = qtySuffix ? ascii(d.content).slice(0, Math.max(1, maxContent)).trimEnd() : d.content
  t(pad(`Isi   : ${contentText}${qtySuffix}`))
  if (d.remark) for (const l of wrap32(`*${d.remark}*`, 2)) t(l)
  t(pad(""))
  t(center("------- Potong Disini --------"))
  t(pad(""))
  // --- Struk Jujur (sender receipt) ---
  const brand = d.outlet ?? { name: d.sender.name, whatsapp: d.sender.phone }
  t(center(brand.name.toUpperCase()), { bold: true })
  if (brand.whatsapp) t(center(`WA: ${brand.whatsapp}`))
  t(center("STRUK BUKTI TERIMA KIRIMAN"))
  t(rule())
  t(kv("INV ID   :", d.inv.toUpperCase() + (d.stub.reprint ? " (ULANG)" : "")).replace(/:\s+/, ": ").padEnd(COLS))
  t(pad(`Tanggal  : ${d.printedAt} WIB`))
  t(pad(`Kurir    : ${d.courierName} ${d.serviceName}`))
  t(pad(`No. Resi : ${d.awb}`))
  {
    // `Tujuan   : Rina K. (COBLONG 40132)` — shorten the name, never cut the area or the closing bracket.
    const area = ` (${ascii(d.destinationFallback)})`
    const room = COLS - "Tujuan   : ".length - area.length
    const parts = ascii(d.recipient.name).split(" ")
    let name = ascii(d.recipient.name)
    if (name.length > room && parts.length > 1) name = `${parts[0]} ${parts[1]![0]}.`
    if (name.length > room) name = (parts[0] ?? name).slice(0, Math.max(1, room)).trimEnd()
    t(pad(`Tujuan   : ${name}${area}`.slice(0, COLS)))
  }
  t(rule())
  const s = d.stub
  if (s.feeMode === "none") {
    t(money("Ongkos Kirim", s.shippingIdr))
    t(kv("Asuransi", d.insuranceIdr === null ? "-" : `Rp ${d.insuranceIdr.toLocaleString("id-ID")}`))
    if (s.packingIdr) t(money("Packing", s.packingIdr))
    if (s.serviceFeeIdr) t(money("Biaya Layanan Loket", s.serviceFeeIdr))
    if (s.promoIdr) t(money("Potongan Promo", s.promoIdr, true))
    t(rule())
    t(money("TOTAL", s.totalIdr), { bold: true })
  } else {
    const label = { buyer_bears_fee: "COD - Fee dibayar penerima", sender_bears_fee: "COD - Fee dari pengirim", cod_all_in: "COD all-in", dfod: "COD Ongkir", none: "" }[s.feeMode]
    t(pad(label))
    if (s.codGoodsIdr) t(money("Harga Barang", s.codGoodsIdr))
    t(money("Ditagih ke Penerima", d.cod?.collectIdr ?? 0))
    t(rule())
    if (s.packingIdr) t(money("Packing", s.packingIdr))
    if (s.serviceFeeIdr) t(money("Biaya Layanan Loket", s.serviceFeeIdr))
    if (s.promoIdr) t(money("Potongan Promo", s.promoIdr, true))
    t(money("Dibayar di Loket", s.totalIdr), { bold: true })
  }
  const pay = s.payment
  if (pay.status === "paid") {
    const m = { qris: "QRIS GERAI", tunai: "TUNAI", transfer: "TRANSFER", deposit: "DEPOSIT" }[pay.method]
    t(money(`LUNAS - ${m}`, pay.method === "tunai" && pay.cashIdr ? pay.cashIdr : s.totalIdr), { bold: true })
    if (pay.method === "tunai" && pay.changeIdr !== null) t(money("Kembali", pay.changeIdr))
  } else if (pay.status === "unpaid") t(center(`BELUM DIBAYAR Rp ${s.totalIdr.toLocaleString("id-ID").replace(/\u00a0/g, "")}`), { bold: true, invert: true })
  if (s.senderPayableIdr !== null && s.feeMode !== "none" && s.feeMode !== "dfod") {
    t(rule())
    t(money("Hak COD Pengirim", s.senderPayableIdr), { bold: true })
    t(pad("Cair setelah paket diterima"))
  }
  t(rule())
  t(pad("Lacak & struk digital aman:"))
  for (const l of splitUrl(d.trackingUrl)) t(l)
  L.push({ qr: `https://${d.trackingUrl}` })
  t(center("Simpan struk ini sbg bukti sah"))
  L.push({ cut: true })
  return L
}

/** Text-only view (snapshots and the preview): barcode/QR rendered as placeholders. */
export function rollText(d: LabelData): string[] {
  return rollLines(d).map((l) => ("text" in l ? l.text : "barcode" in l ? center(`[BARCODE ${l.barcode}]`) : "qr" in l ? center("[QR]") : center("")))
}
