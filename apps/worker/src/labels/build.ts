// Builds `LabelData` from an issued shipment's immutable snapshots (TASK-306, visual 04): masking is already resolved
// in `mask_snapshot_json`, amounts come from the shipment projection, and the last receipt gives the payment line.
import type { LabelData } from "@gx/thermal-print"

type Row = Record<string, SqlStorageValue>
const courierNames: Record<string, string> = { JNE: "JNE", SiCepat: "SiCepat", Sap: "SAP Express", iDexpress: "iDexpress", JT: "J&T Express", lion: "Lion Parcel", anteraja: "Anteraja", pos: "Pos Indonesia", spx: "SPX Express" }

const wibStamp = (ms: number) => {
  const d = new Date(ms + 7 * 3600_000)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}
const parse = <T>(s: SqlStorageValue | undefined): T | null => {
  if (typeof s !== "string" || !s) return null
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

export function labelDataFrom(s: Row, opts: { quote: Row | null; lastPayment: Row | null; remark: string; trackingHost: string; now: number; reprint: boolean }): LabelData | null {
  if (typeof s.awb_number !== "string" || !s.awb_number) return null // label printable only with an AWB
  const mask = parse<{ sender: { name: string; phone: string | null }; recipientPhonePrinted: string; showOutletBranding: boolean; showShippingFee: boolean }>(s.mask_snapshot_json)
  const rec = parse<{ name: string; phone: string; street: string; area: string | null }>(s.true_recipient_json)
  const pick = parse<{ name: string | null; phone: string | null; area: string | null }>(s.pickup_snapshot_json)
  if (!mask || !rec) return null
  const slug = String(s.slug)
  const feeMode = (String(s.cod_fee_mode ?? "none") as LabelData["stub"]["feeMode"]) ?? "none"
  const cod = feeMode !== "none"
  const area = rec.area ?? ""
  const pay = opts.lastPayment
  const status = String(s.counter_payment_status)
  const payment: LabelData["stub"]["payment"] =
    status === "paid" && pay
      ? { status: "paid", method: String(pay.method) as "qris", cashIdr: (pay.cash_received_idr as number | null) ?? null, changeIdr: (pay.change_idr as number | null) ?? null }
      : status === "paid"
        ? { status: "paid", method: (String(s.counter_payment_method ?? "qris") as "qris"), cashIdr: null, changeIdr: null }
        : status === "unpaid"
          ? { status: "unpaid" }
          : { status: "not_required" }
  const dims = opts.quote && opts.quote.length_cm ? `${opts.quote.length_cm}×${opts.quote.width_cm}×${opts.quote.height_cm} cm` : null
  return {
    inv: slug,
    courierName: courierNames[String(s.courier_code)] ?? String(s.courier_code),
    serviceName: String(s.service_code ?? s.courier_code).replace(/Cargo$/, " Cargo"),
    awb: s.awb_number,
    printedAt: wibStamp(opts.now),
    sortingCode: typeof s.sorting_code === "string" && s.sorting_code ? s.sorting_code : null,
    destinationFallback: area.split(",")[0]!.trim().toUpperCase().slice(0, 20) || "—",
    destinationLine: area.toUpperCase(),
    cod: cod ? { collectIdr: Number(s.cod_collection_total_idr) } : null,
    recipient: { name: rec.name, phone: mask.recipientPhonePrinted, street: rec.street, area },
    sender: { name: mask.sender.name, phone: mask.sender.phone, area: null },
    outlet: mask.showOutletBranding && pick?.name ? { name: pick.name, whatsapp: pick.phone } : null,
    content: String(s.content_declaration_text ?? ""),
    actualWeightGram: Number(s.actual_weight_gram ?? 1000),
    billableWeightGram: Number(s.billable_weight_gram ?? 1000),
    dims,
    insuranceIdr: (s.insurance_fee_idr as number | null) ?? null,
    remark: opts.remark,
    trackingUrl: `${opts.trackingHost}/lacak/${slug}`,
    showShippingFee: mask.showShippingFee,
    stub: {
      shippingIdr: Number(s.publish_shipping_idr ?? 0),
      packingIdr: Number(s.packing_addon_idr ?? 0),
      promoIdr: Number(s.promo_discount_idr ?? 0),
      totalIdr: Number(s.counter_due_idr ?? 0),
      payment,
      codGoodsIdr: cod && Number(s.cod_goods_amount_idr) > 0 ? Number(s.cod_goods_amount_idr) : null,
      senderPayableIdr: cod ? Number(s.sender_cod_payable_idr) : null,
      feeMode,
      reprint: opts.reprint,
    },
  }
}
