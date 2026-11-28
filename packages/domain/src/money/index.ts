// Exact integer Rupiah / basis-point math (spec 02 §2–§3, DEC-205, DEC-220, DEC-225, DEC-226, DEC-230, DEC-233).
// Every amount is an integer `_idr`; every rate an integer `_bps` (10000 = 100 %). `null` means unknown and is never
// coerced to 0 in a returned value; formulas use `I0 = I ?? 0` exactly as the spec does.

export const BPS = 10_000

export type CodFeeMode = "none" | "buyer_bears_fee" | "sender_bears_fee" | "cod_all_in" | "dfod"
export const COD_FEE_MODES: readonly CodFeeMode[] = ["none", "buyer_bears_fee", "sender_bears_fee", "cod_all_in", "dfod"]

export class MoneyRuleError extends Error {
  constructor(
    readonly code:
      | "COD_ALL_IN_INSUFFICIENT"
      | "COD_FEE_EXCEEDS_GOODS"
      | "PROMO_EXCEEDS_DUE"
      | "COD_GOODS_OUT_OF_RANGE"
      | "SERVICE_FEE_NOT_ALLOWED"
      | "SERVICE_FEE_OUT_OF_RANGE"
      | "COD_FEE_UNSTABLE"
      | "INVALID_AMOUNT",
    readonly userMessage: string,
  ) {
    super(code)
  }
}

const INVALID_AMOUNT_MESSAGE = "Nominal rupiah tidak valid."

/** Integer Rupiah guard; `name` stays in the technical message only, never in user text. */
export function assertIdr(name: string, v: number, min = 0): void {
  if (!Number.isSafeInteger(v) || v < min) {
    const e = new MoneyRuleError("INVALID_AMOUNT", INVALID_AMOUNT_MESSAGE)
    e.message = `INVALID_AMOUNT: ${name}`
    throw e
  }
}

/** Signed integer Rupiah (gaps, reconciled credits). */
export function assertSignedIdr(name: string, v: number): void {
  assertIdr(name, v, Number.MIN_SAFE_INTEGER)
}

/** Integer basis points `0..10000`. */
export function assertBps(name: string, v: number): void {
  if (!Number.isSafeInteger(v) || v < 0 || v > BPS) {
    const e = new MoneyRuleError("INVALID_AMOUNT", "Persentase tidak valid.")
    e.message = `INVALID_BPS: ${name}`
    throw e
  }
}

/** `floor(a × b / c)` for non-negative safe integers and `c ≥ 1`; the result must stay a safe integer. */
export function mulDivFloor(a: number, b: number, c: number): number {
  assertIdr("mulDiv.a", a)
  assertIdr("mulDiv.b", b)
  assertIdr("mulDiv.c", c, 1)
  const out = Number((BigInt(a) * BigInt(b)) / BigInt(c))
  assertIdr("mulDiv.result", out)
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// Discounts (spec 02 §2, §2.1)

/** Lossy display/control value: `floor((P − N) × 10000 / P)`. */
export function observedBpsFromNet(publishIdr: number, netIdr: number): number {
  assertIdr("publish", publishIdr, 1)
  assertIdr("net", netIdr)
  if (netIdr >= publishIdr) return 0
  return mulDivFloor(publishIdr - netIdr, BPS, publishIdr)
}

/** Observed discount per service class: `floor(discount × 10000 / price)` (regular `discount/price`, cargo `cargoDiscount/cargoPrice`). */
export function observedBpsFromDiscount(discountIdr: number, priceIdr: number): number {
  assertIdr("discount", discountIdr)
  assertIdr("price", priceIdr, 1)
  return mulDivFloor(Math.min(discountIdr, priceIdr), BPS, priceIdr)
}

/** Cost always uses `min(assigned, observed)`: a requested rate not yet applied never lowers cost (no subsidy). */
export function effectiveBps(assignedBps: number, observedBps: number): number {
  assertBps("assigned", assignedBps)
  assertBps("observed", observedBps)
  return Math.min(assignedBps, observedBps)
}

/**
 * `M` — the Super Admin commercial estimate (display/guard only, never a money flow).
 * When the requested rate equals the observed one, `M` is the exact provider net `N` (never re-derived from bps, the
 * `9599` regression); otherwise `M = P − floor(P × assigned / 10000)` (e.g. requested 25 % not yet applied → 9000).
 */
export function commercialCostIdr(publishIdr: number, netIdr: number, assignedBps: number): number {
  assertBps("assigned", assignedBps)
  const observed = observedBpsFromNet(publishIdr, netIdr)
  if (assignedBps === observed) return netIdr
  return publishIdr - mulDivFloor(publishIdr, assignedBps, BPS)
}

/**
 * Cost at `effective_bps = min(assigned, observed)` (spec 02 §2 table, `effective_gerai_cost_idr`): the exact provider
 * net `N` whenever the requested rate is at or above what Mengantar gives (never re-derived from bps — `9599`), else
 * `P − floor(P × assigned / 10000)`. No subsidy: a requested rate not yet applied never lowers cost.
 */
export function effectiveCostIdr(publishIdr: number, netIdr: number, assignedBps: number): number {
  assertBps("assigned", assignedBps)
  const observed = observedBpsFromNet(publishIdr, netIdr)
  if (assignedBps >= observed) return netIdr
  return publishIdr - mulDivFloor(publishIdr, assignedBps, BPS)
}

/** `Selisih tarif` = `M − N`, information only (never booked). */
export function tariffGapIdr(commercialIdr: number, netIdr: number): number {
  assertIdr("commercial", commercialIdr)
  assertIdr("net", netIdr)
  return commercialIdr - netIdr
}

export interface DiscountBand {
  defaultBps: number
  minBps: number
  maxBps: number
}

/** Platform defaults (DEC-230, DEC-233, DEC-258); `courier_discount_policy` rows override per courier. */
export const PLATFORM_DISCOUNT_BAND: DiscountBand = { defaultBps: 2500, minBps: 2000, maxBps: 2500 }
export const DEFAULT_APPLY_SLA_MINUTES = 60

/** Per-courier band with platform fallback for a courier without a policy row. */
export function bandForCourier(courierPolicy: DiscountBand | null | undefined, platform: DiscountBand = PLATFORM_DISCOUNT_BAND): DiscountBand {
  return courierPolicy ?? platform
}

/** The only validation when saving a rule (spec 02 §2.1 Guards). */
export function isAssignedBpsAllowed(assignedBps: number, band: DiscountBand): boolean {
  return Number.isSafeInteger(assignedBps) && assignedBps >= band.minBps && assignedBps <= band.maxBps
}

export type VerificationState = "belum_diterapkan" | "sesuai" | "selisih"
export const VERIFICATION_TOLERANCE_BPS = 1

/**
 * One verifier step (spec 02 §2.1 state table). `now`/`requestedAt` are epoch ms. Observations never rewrite rules.
 */
export function nextVerificationState(input: {
  state: VerificationState
  assignedBps: number
  observedBps: number | null
  requestedAt: number
  now: number
  applySlaMinutes: number
}): VerificationState {
  const { state, assignedBps, observedBps, requestedAt, now, applySlaMinutes } = input
  assertBps("assigned", assignedBps)
  if (observedBps !== null) assertBps("observed", observedBps)
  if (!Number.isSafeInteger(applySlaMinutes) || applySlaMinutes < 1) throw new RangeError("applySlaMinutes must be a positive integer")
  if (observedBps === null) {
    if (state === "belum_diterapkan" && now - requestedAt >= 2 * applySlaMinutes * 60_000) return "selisih"
    return state
  }
  const within = Math.abs(assignedBps - observedBps) <= VERIFICATION_TOLERANCE_BPS
  switch (state) {
    case "belum_diterapkan":
      if (within) return "sesuai"
      return now - requestedAt >= 2 * applySlaMinutes * 60_000 ? "selisih" : "belum_diterapkan"
    case "sesuai":
      return within ? "sesuai" : "selisih"
    case "selisih":
      return within ? "sesuai" : "selisih"
  }
}

/** Scheduled verifier checks after a rule change: +15, +60 and +120 min (then daily). */
export function verificationCheckTimes(requestedAt: number): number[] {
  return [15, 60, 120].map((m) => requestedAt + m * 60_000)
}

/** The `step`-th scheduled check (0-based): +15, +60, +120 min, then every 24 h after the last one. */
export function verificationCheckAt(requestedAt: number, step: number): number {
  const fixed = verificationCheckTimes(requestedAt)
  return step < fixed.length ? fixed[step]! : fixed.at(-1)! + (step - fixed.length + 1) * 24 * 3600_000
}

/** A band is valid when min <= default <= max, all integers in 0..10000. */
export function parseDiscountBand(b: { defaultBps: unknown; minBps: unknown; maxBps: unknown }): DiscountBand | null {
  const v = [b.defaultBps, b.minBps, b.maxBps]
  if (!v.every((x) => typeof x === "number" && Number.isSafeInteger(x) && x >= 0 && x <= 10_000)) return null
  const [d, mn, mx] = v as [number, number, number]
  return mn <= d && d <= mx ? { defaultBps: d, minBps: mn, maxBps: mx } : null
}

// ---------------------------------------------------------------------------------------------------------------
// Collection modes and exact flows (spec 02 §3)

export interface FlowInput {
  /** Publish tariff paid by the customer. */
  P: number
  /** Provider net shipping charge (`estimatedSpecialPrice − codFee` of the final estimate). */
  N: number
  /** Insurance fee; `null` until a verified provider field exists. */
  I: number | null
  /** COD fee from the final estimate (`0` for `none`). */
  F: number
  /** Packing add-ons (outlet-kept). */
  K: number
  /** Optional counter service fee (`Biaya Layanan Loket`). */
  S: number
  /** Counter promo (outlet-funded). */
  V: number
  /** COD goods amount (`0` for `none` and `dfod`). */
  G: number
}

export interface Flow {
  mode: CodFeeMode
  counterDueIdr: number
  codCollectionTotalIdr: number
  /** Mengantar seller COD credit; `0` for `none` (the provider debits `N + I0` instead). */
  expectedProviderCodCreditIdr: number
  /** Provider debit for Non-COD (`N + I0`); `0` for COD modes (netted from the credit). */
  providerDebitIdr: number
  senderCodPayableIdr: number
  /** `Estimasi Laba` (accrued). */
  outletMarginIdr: number
}

export const COD_GOODS_MIN_IDR = 10_000
export const COD_GOODS_MAX_IDR = 5_000_000
export const SERVICE_FEE_MIN_IDR = 1_000
export const SERVICE_FEE_MAX_IDR = 200_000
export const COD_ALL_IN_MIN_HEADROOM_IDR = 1_000

const isCodGoodsMode = (m: CodFeeMode) => m === "buyer_bears_fee" || m === "sender_bears_fee" || m === "cod_all_in"

export function computeFlow(mode: CodFeeMode, input: FlowInput): Flow {
  const { P, N, I, K, S, V } = input
  for (const [k, v] of Object.entries({ P, N, K, S, V })) assertIdr(k, v)
  if (I !== null) assertIdr("I", I)
  const I0 = I ?? 0
  const F = mode === "none" ? 0 : input.F
  const G = mode === "none" || mode === "dfod" ? 0 : input.G
  assertIdr("F", F)
  assertIdr("G", G)

  if (isCodGoodsMode(mode) && (G < COD_GOODS_MIN_IDR || G > COD_GOODS_MAX_IDR)) {
    throw new MoneyRuleError("COD_GOODS_OUT_OF_RANGE", "Harga barang COD harus antara Rp10.000 dan Rp5.000.000.")
  }
  if (S !== 0) {
    if (isCodGoodsMode(mode)) {
      throw new MoneyRuleError("SERVICE_FEE_NOT_ALLOWED", "Biaya Layanan Loket hanya untuk kiriman Non-COD atau COD Ongkir.")
    }
    if (S < SERVICE_FEE_MIN_IDR || S > SERVICE_FEE_MAX_IDR) {
      throw new MoneyRuleError("SERVICE_FEE_OUT_OF_RANGE", "Biaya Layanan Loket harus antara Rp1.000 dan Rp200.000.")
    }
  }
  const promoCap = mode === "none" ? P + I0 + K + S : K + S
  if (V > promoCap) throw new MoneyRuleError("PROMO_EXCEEDS_DUE", "Potongan promo melebihi jumlah yang dibayar di loket.")
  if (mode === "cod_all_in" && G < P + I0 + F + COD_ALL_IN_MIN_HEADROOM_IDR) {
    throw new MoneyRuleError("COD_ALL_IN_INSUFFICIENT", "COD all-in tidak cukup menutup ongkir dan biaya COD.")
  }
  // Never store a negative payable (spec 02 §3.3): the sender bears F out of G.
  if (mode === "sender_bears_fee" && G < F) {
    throw new MoneyRuleError("COD_FEE_EXCEEDS_GOODS", "Harga barang COD tidak cukup menutup biaya COD.")
  }

  const margin = P - N + K + S - V
  switch (mode) {
    case "none":
      return { mode, counterDueIdr: P + I0 + K + S - V, codCollectionTotalIdr: 0, expectedProviderCodCreditIdr: 0, providerDebitIdr: N + I0, senderCodPayableIdr: 0, outletMarginIdr: margin }
    case "buyer_bears_fee": {
      const C = G + P + I0 + F
      return { mode, counterDueIdr: K + S - V, codCollectionTotalIdr: C, expectedProviderCodCreditIdr: C - (N + F + I0), providerDebitIdr: 0, senderCodPayableIdr: G, outletMarginIdr: margin }
    }
    case "sender_bears_fee": {
      const C = G + P + I0
      return { mode, counterDueIdr: K + S - V, codCollectionTotalIdr: C, expectedProviderCodCreditIdr: C - (N + F + I0), providerDebitIdr: 0, senderCodPayableIdr: G - F, outletMarginIdr: margin }
    }
    case "cod_all_in": {
      const C = G
      return { mode, counterDueIdr: K + S - V, codCollectionTotalIdr: C, expectedProviderCodCreditIdr: C - (N + F + I0), providerDebitIdr: 0, senderCodPayableIdr: G - P - I0 - F, outletMarginIdr: margin }
    }
    case "dfod": {
      const C = P + I0 + F
      return { mode, counterDueIdr: K + S - V, codCollectionTotalIdr: C, expectedProviderCodCreditIdr: C - (N + F + I0), providerDebitIdr: 0, senderCodPayableIdr: 0, outletMarginIdr: margin }
    }
  }
}

/** COD amount base before the fee for fee-inclusive modes, or the fixed collection for fixed modes (spec 02 §3.3). */
export function codAmountBase(mode: Exclude<CodFeeMode, "none">, P: number, I: number | null, G: number): { kind: "fixed" | "fee_inclusive"; amount: number } {
  assertIdr("P", P)
  if (I !== null) assertIdr("I", I)
  assertIdr("G", G)
  const I0 = I ?? 0
  switch (mode) {
    case "sender_bears_fee":
      return { kind: "fixed", amount: G + P + I0 }
    case "cod_all_in":
      return { kind: "fixed", amount: G }
    case "buyer_bears_fee":
      return { kind: "fee_inclusive", amount: G + P + I0 }
    case "dfod":
      return { kind: "fee_inclusive", amount: P + I0 }
  }
}

/**
 * Quote passes for `codFee` (spec 02 §3.3): fixed modes take one estimate at `C`; fee-inclusive modes iterate to a
 * fixed point (at most 3 estimates) or fail with `COD_FEE_UNSTABLE`. Returns the frozen `F` and `C` of the final
 * estimate, which create-order must send unchanged.
 */
export async function resolveCodFee(
  mode: Exclude<CodFeeMode, "none">,
  base: { P: number; I: number | null; G: number },
  estimateCodFee: (codAmountIdr: number) => Promise<number>,
): Promise<{ F: number; C: number; estimates: number }> {
  const { kind, amount: B } = codAmountBase(mode, base.P, base.I, base.G)
  if (kind === "fixed") {
    const F = await estimateCodFee(B)
    assertIdr("codFee", F)
    return { F, C: B, estimates: 1 }
  }
  const F0 = await estimateCodFee(B)
  assertIdr("codFee", F0)
  const F1 = await estimateCodFee(B + F0)
  assertIdr("codFee", F1)
  if (F1 === F0) return { F: F0, C: B + F0, estimates: 2 }
  const F2 = await estimateCodFee(B + F1)
  assertIdr("codFee", F2)
  if (F2 === F1) return { F: F1, C: B + F1, estimates: 3 }
  throw new MoneyRuleError("COD_FEE_UNSTABLE", "Biaya COD berubah, ulangi cek ongkir.")
}

/** `quote_drift` when the order's `COD_FEE` text differs from the frozen `F` by 1 Rupiah or more (spec 02 §3.3 item 5). */
export function isQuoteDrift(frozenF: number, orderCodFeeText: string | null): boolean {
  assertIdr("frozenF", frozenF)
  if (orderCodFeeText === null) return false
  // Mengantar returns a plain decimal string ("5560", "5560.0"); anything else is unreadable → flag for reconciliation.
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(orderCodFeeText.trim())
  if (!m) return true
  const frac = m[3] ?? ""
  const scale = 10n ** BigInt(frac.length)
  const value = BigInt(`${m[2]}${frac}`) * (m[1] ? -1n : 1n)
  const diff = value - BigInt(frozenF) * scale
  return (diff < 0n ? -diff : diff) >= scale
}

// ---------------------------------------------------------------------------------------------------------------
// Profit labels (spec 02 §3.5)

export interface LabaKasInput {
  mode: CodFeeMode
  counterPaymentStatus: "not_required" | "unpaid" | "paid" | "voided"
  counterDueIdr: number
  /** Total Mengantar debit for the INV (shipping + insurance); `null` until synced. */
  providerReconciledCostIdr: number | null
  reconciledProviderCodCreditIdr: number | null
  senderCodPayableIdr: number
  K: number
  S: number
  V: number
}

/** `Laba Kas` (cash-realized) or `null` when not yet realized. Never summed with `Estimasi Laba`. */
export function labaKasIdr(x: LabaKasInput): number | null {
  assertIdr("counterDue", x.counterDueIdr)
  assertIdr("senderPayable", x.senderCodPayableIdr)
  assertIdr("K", x.K)
  assertIdr("S", x.S)
  assertIdr("V", x.V)
  if (x.providerReconciledCostIdr !== null) assertIdr("reconciledCost", x.providerReconciledCostIdr)
  if (x.reconciledProviderCodCreditIdr !== null) assertSignedIdr("reconciledCredit", x.reconciledProviderCodCreditIdr)
  if (x.counterPaymentStatus !== "paid" && x.counterPaymentStatus !== "not_required") return null
  if (x.mode === "none") {
    if (x.providerReconciledCostIdr === null) return null
    return x.counterDueIdr - x.providerReconciledCostIdr
  }
  if (x.reconciledProviderCodCreditIdr === null) return null
  return x.reconciledProviderCodCreditIdr - x.senderCodPayableIdr + x.K + x.S - x.V
}

// ---------------------------------------------------------------------------------------------------------------
// Display

/** `Rp12.000`, `−Rp600`; Indonesian thousands separator, integers only. */
export function formatIdr(v: number): string {
  assertSignedIdr("amount", v)
  const digits = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  return `${v < 0 ? "−" : ""}Rp${digits}`
}

/** `20 %` / `20,5 %` from bps. */
export function formatBps(bps: number): string {
  if (!Number.isSafeInteger(bps)) throw new RangeError("bps must be an integer")
  const sign = bps < 0 ? "−" : ""
  const a = Math.abs(bps)
  const whole = Math.floor(a / 100)
  const frac = a % 100
  return frac ? `${sign}${whole},${String(frac).padStart(2, "0").replace(/0$/, "")} %` : `${sign}${whole} %`
}
