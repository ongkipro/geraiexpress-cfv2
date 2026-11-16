import type { LabelData } from "../src/model"

// Synthetic fixture (AGENTS.md example data policy): visual 04 specimen, Dropship Toko + COD buyer_bears_fee.
export const codDropship: LabelData = {
  inv: "8k4m2p7",
  courierName: "J&T Express",
  serviceName: "EZ",
  awb: "JX8829104412",
  printedAt: "14/11 14:22",
  sortingCode: "BDO-CBL02",
  destinationFallback: "COBLONG 40132",
  destinationLine: "KEC. COBLONG · KOTA BANDUNG 40132",
  cod: { collectIdr: 167560 },
  recipient: { name: "Rina Kartika", phone: "0857****8821", street: "Jl. Dago Asri No. 14 RT 02 RW 05 (dekat Masjid Al-Huda)", area: "Kel. Dago, Kec. Coblong, Kota Bandung 40132" },
  sender: { name: "TOKO HIJAB NISA", phone: "08xx-xxxx-7890", area: "Kota Bandung" },
  outlet: null,
  content: "Pakaian (2 pcs)",
  actualWeightGram: 1200,
  billableWeightGram: 2000,
  dims: "30×20×15 cm",
  insuranceIdr: null,
  remark: "Rekam video saat buka paket untuk klaim",
  trackingUrl: "berkahjaya.gerai.cc/lacak/8k4m2p7",
  showShippingFee: false,
  stub: { shippingIdr: 12000, packingIdr: 3000, promoIdr: 0, totalIdr: 3000, payment: { status: "paid", method: "qris", cashIdr: null, changeIdr: null }, codGoodsIdr: 150000, senderPayableIdr: 150000, feeMode: "buyer_bears_fee", reprint: false },
}

export const nonCodStandard: LabelData = {
  ...codDropship,
  cod: null,
  sortingCode: null,
  recipient: { ...codDropship.recipient, phone: "0857-1234-8821" },
  sender: { name: "Ibu Siti", phone: "0812-3456-7890", area: "Kota Bandung" },
  outlet: { name: "Berkah Jaya", whatsapp: "0812-1111-2222" },
  showShippingFee: true,
  stub: { shippingIdr: 24000, packingIdr: 3000, promoIdr: 0, totalIdr: 27000, payment: { status: "paid", method: "tunai", cashIdr: 50000, changeIdr: 23000 }, codGoodsIdr: null, senderPayableIdr: null, feeMode: "none", reprint: false },
}
