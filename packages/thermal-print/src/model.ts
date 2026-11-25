// Everything a label or receipt prints, already resolved by the server (masking applied, amounts integer IDR).
// The renderers never decide what to show; they only lay it out (visual 04).
export type LabelFormat = "label_10x15_with_stub" | "label_10x10" | "label_10x15" | "roll_58mm"
export const FORMAT_LABEL: Record<LabelFormat, string> = {
  label_10x15_with_stub: "10×15 · Paket + Bukti",
  label_10x10: "10×10 · Paket saja",
  label_10x15: "10×15 · Paket saja",
  roll_58mm: "Roll 58 mm · Label + Struk",
}
export const FORMAT_SIZE_MM: Record<Exclude<LabelFormat, "roll_58mm">, { w: number; h: number }> = {
  label_10x15_with_stub: { w: 100, h: 150 },
  label_10x10: { w: 100, h: 100 },
  label_10x15: { w: 100, h: 150 },
}

export interface LabelData {
  inv: string // 7-char slug, lower case
  courierCode?: string | null
  courierName: string
  serviceName: string
  awb: string
  printedAt: string // "14/11 14:22"
  sortingCode: string | null
  destinationFallback: string // "COBLONG 40132" when no sorting code
  destinationLine: string // "KEC. COBLONG · KOTA BANDUNG 40132"
  cod: { collectIdr: number } | null
  recipient: { name: string; phone: string; street: string; area: string }
  sender: { name: string; phone: string | null; area: string | null }
  outlet: { name: string; whatsapp: string | null; logoDataUrl?: string | null; logoJpeg?: Uint8Array | null } | null // null = no outlet branding (Dropship)
  content: string
  /** Number of items/pieces in the parcel (default 1). */
  quantity?: number
  /** Courier delivery note (e.g. "Titip pos satpam"). */
  deliveryInstruction?: string | null
  /** True for cargo services (prints a high-contrast KARGO badge for hub sorting). */
  isCargo?: boolean
  /** True when the parcel contains batteries/dangerous goods (prints a DG warning badge). */
  isDangerousGoods?: boolean
  actualWeightGram: number
  billableWeightGram: number
  dims: string | null // "30×20×15 cm"
  insuranceIdr: number | null
  remark: string // unboxing remark, may be ""
  trackingUrl: string // "berkahjaya.geraimitra.com/lacak/8k4m2p7"
  showShippingFee: boolean
  stub: {
    shippingIdr: number
    packingIdr: number
    /** `Biaya Layanan Loket` (0 = none); printed so the lines add up to TOTAL. */
    serviceFeeIdr?: number
    promoIdr: number
    totalIdr: number
    payment: { status: "paid"; method: "qris" | "tunai" | "transfer" | "deposit"; cashIdr: number | null; changeIdr: number | null } | { status: "unpaid" | "not_required" }
    codGoodsIdr: number | null
    senderPayableIdr: number | null
    feeMode: "none" | "buyer_bears_fee" | "sender_bears_fee" | "cod_all_in" | "dfod"
    reprint: boolean
  }
}

export const idr = (n: number) => `Rp ${n.toLocaleString("id-ID")}`.replace(/\u00a0/g, " ")
export const groupAwb = (awb: string) => awb.replace(/(.{4})(?=.)/g, "$1 ")
export const kg = (g: number) => `${(g / 1000).toLocaleString("id-ID", { maximumFractionDigits: 3 })} kg`
export const grams = (g: number) => `${g.toLocaleString("id-ID")} g`
