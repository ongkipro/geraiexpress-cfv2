// Recorded-shape fixtures from the Mengantar Public API docs (synthetic values; no real accounts, keys or people).
export const KEY = "sk_sandbox_SYNTHETIC1234567890"
export const ESTIMATE_ALL = {
  success: true,
  data: {
    JT: { unsupported: false, unsupported_cod: false, price: 12000, discountPercent: 20, discount: 2400, codFee: 0, estimatedPrice: 12000, estimatedSpecialPrice: 9600 },
    JNECargo: { unsupported: false, unsupported_cod: true, price: 60000, discountPercent: 0, discount: 0, cargoPrice: 60000, cargoDiscount: 15000, cargoEstimatedPrice: 60000, cargoEstimatedSpecialPrice: 45000, minimumWeightCargo: 5 },
    spx: { unsupported: false, unsupported_cod: false, estimate_delivery: "1 - 3 days", price: 13700, discountPercent: 30, discount: 4110, codFee: 3329, estimatedPrice: 17029, estimatedSpecialPrice: 12234, futureField: { x: 1 } },
  },
}
export const CREATE_PAID = {
  success: true,
  batch_id: "665f00000000000000000001",
  batch: "B-JT-0001",
  data: [{ _id: "665f000000000000000000aa", ORDER_ID: "MGT-0001", cnote_no: "JX0000000001", isPaid: true, batch_id: "665f00000000000000000001", destinationMark: "8K4M2P7", COD_FEE: "0" }],
  errors: [],
}
export const CREATE_UNPAID = {
  success: true,
  batch_id: "665f00000000000000000002",
  batch: "B-JT-0002",
  data: [{ _id: "665f000000000000000000ab", ORDER_ID: "MGT-0002", cnote_no: null, isPaid: false, batch_id: "665f00000000000000000002", destinationMark: "9X9X9X9" }],
}
export const CREATE_ERROR = { success: false, message: "Saldo tidak mencukupi untuk kurir ini", code: "X000" }
export const ORDER_HISTORY = {
  success: true,
  data: {
    ORDER_ID: "MGT-0001",
    cnote_no: "JX0000000001",
    statusCategory: "ON DELIVERY",
    DESTINATION_CODE: "BDO-CBL02",
    history: [
      { date: "15-11-2026 10:15", status: "Paket diterima", statusCategory: "PICKED UP" },
      { date: "15-11-2026 18:02", status: "Dalam perjalanan", statusCategory: "ON DELIVERY" },
    ],
  },
}
export const INVOICES = {
  success: true,
  balance: 250000,
  nextCursor: "c2",
  data: [
    { _id: "inv1", type: "typeAddBalance", amount: 300000, balanceAmount: 300000, createdAt: "2026-11-15T01:00:00.000Z" },
    { _id: "inv2", type: "typePayment", amount: -9600, balanceAmount: 290400, createdAt: "2026-11-15T02:00:00.000Z", subItems: [{ amount: -9600, ORDER_ID: "MGT-0001" }] },
    { _id: "inv3", type: "typeSomethingNew", amount: -40400, balanceAmount: 250000, createdAt: "2026-11-15T03:00:00.000Z" },
  ],
}
export const PAY_UNPAID = { success: true, data: { count: 1, cnote_no: ["JX0000000002"] } }
