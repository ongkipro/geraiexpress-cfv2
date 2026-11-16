// Quote engine (TASK-303, spec 02 §1–3, PR-06). Pure functions over estimate rows (`ObservedRate`) so every rule is
// unit-testable without Mengantar: billable weight per service class, cargo isolation (Non-COD, ≥ 5,000 g and the
// courier minimum), provider net `N = estimatedSpecialPrice − codFee` (exact integer), observed discount per class,
// effective cost at `min(assigned, observed)`, and the exact money flow per `cod_fee_mode`.
import { computeFlow, effectiveCostIdr, MoneyRuleError, observedBpsFromDiscount, type CodFeeMode } from "@gx/domain/money"
import { providerWeightKg, rawWeightGram, type Dimensions, type VolumetricDivisor } from "@gx/domain/weight"
import type { ObservedRate } from "../../do/gerai-vault"

export const CARGO_RECOMMEND_GRAM = 5000
export const QUOTE_TTL_MS = 30 * 60_000

export interface CatalogEntry {
  service_code: string
  courier_code: string
  courier_name: string
  display_name: string
  service_class: "regular" | "cargo"
  cod_supported: number
  rounding_tolerance_gram: number
  min_weight_gram: number | null
  max_weight_gram: number | null
  /** DEC-238 courier limits (check-shipping-fee "Courier limits"); null = no limit of its own. */
  min_cod_idr: number | null
  max_cod_idr: number | null
  min_goods_value_idr: number | null
  max_goods_value_idr: number | null
  dg_supported: number
  booking_eco: number
}

export interface QuoteInput {
  originAreaId: string
  destinationAreaId: string
  mode: CodFeeMode
  actualWeightGram: number
  dims: Dimensions | null
  /** COD goods amount `G` (COD Barang modes only). */
  codGoodsIdr: number
  packingIdr: number
  serviceFeeIdr: number
  promoIdr: number
  /** Non-COD goods value sent as `goodsValue` (DEC-238); 0 = not declared. */
  declaredValueIdr: number
  /** `isDangerousGoods` (SiCepat HALU / iDexpress regular only). */
  dangerousGoods: boolean
}

/** spec 02 §1.2: 4000 for JNE Regular and iDexpress Cargo (Mengantar help 5387484), 6000 otherwise. */
export function divisorFor(serviceCode: string): VolumetricDivisor {
  return serviceCode === "JNE" || serviceCode === "iDexpressCargo" ? 4000 : 6000
}

export function billableGram(serviceCode: string, actualGram: number, dims: Dimensions | null): number {
  return rawWeightGram(actualGram, dims, divisorFor(serviceCode))
}

/** Provider net + publish tariff from one row, by service class (cargo reads only cargo fields, spec 02 §1.4). */
export function priceOf(serviceClass: "regular" | "cargo", r: ObservedRate): { P: number; N: number; F: number; observedBps: number | null; rawDiscount: string | null } | null {
  if (r.unsupported) return null
  if (serviceClass === "cargo") {
    if (r.cargoPrice === null || r.cargoEstimatedSpecialPrice === null || r.cargoPrice <= 0) return null
    // Cargo requires cargoEstimatedPrice == cargoPrice (no hidden surcharge in the publish tariff).
    if (r.cargoEstimatedPrice !== null && r.cargoEstimatedPrice !== r.cargoPrice) return null
    const P = r.cargoPrice
    const N = r.cargoEstimatedSpecialPrice
    if (!Number.isSafeInteger(P) || !Number.isSafeInteger(N) || N < 0 || N > P) return null
    return { P, N, F: 0, observedBps: observedCargoBps(r), rawDiscount: r.cargoDiscount !== null ? String(r.cargoDiscount + (r.cargoDiscountExtra ?? 0)) : null }
  }
  if (r.price === null || r.estimatedSpecialPrice === null || r.price <= 0) return null
  const F = r.codFee ?? 0
  const P = r.price
  // `estimatedSpecialPrice` already nets `discount` and the v2.0.0 `discountExtra`, so N stays exact.
  const N = r.estimatedSpecialPrice - F
  if (![P, N, F].every(Number.isSafeInteger) || N < 0 || F < 0) return null
  return { P, N, F, observedBps: observedRegularBps(r), rawDiscount: rawDiscountText(r) }
}

/**
 * Observed seller discount on a regular row: the extra promo counts (Mengantar grants it on top of the seller rate),
 * so an extra 5 % never makes the TASK-207 verifier report `Selisih` against the assigned rate.
 */
export function observedRegularBps(r: Pick<ObservedRate, "price" | "discount" | "discountPercent" | "discountExtra" | "discountExtraPercent">): number | null {
  if (r.discount !== null && r.price !== null && r.price > 0) return observedBpsFromDiscount(r.discount + (r.discountExtra ?? 0), r.price)
  if (r.discountPercent !== null && r.discountPercent >= 0 && r.discountPercent <= 100) return Math.round((r.discountPercent + (r.discountExtraPercent ?? 0)) * 100)
  return null
}

/** Observed cargo discount: base + the v2.0.0 extra cargo promo, over the cargo publish price. */
export function observedCargoBps(r: Pick<ObservedRate, "cargoPrice" | "cargoDiscount" | "cargoDiscountExtra">): number | null {
  if (r.cargoDiscount === null || r.cargoPrice === null || r.cargoPrice <= 0) return null
  return observedBpsFromDiscount(r.cargoDiscount + (r.cargoDiscountExtra ?? 0), r.cargoPrice)
}

const rawDiscountText = (r: Pick<ObservedRate, "discountPercent" | "discountExtraPercent">) => (r.discountPercent === null ? null : r.discountExtraPercent ? `${r.discountPercent}+${r.discountExtraPercent}` : String(r.discountPercent))

const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`

/** Courier limits that need the final COD amount (known only after the COD passes); null = within limits. */
export function codLimitReason(c: Pick<CatalogEntry, "min_cod_idr" | "max_cod_idr">, codCollectionIdr: number): string | null {
  if (c.max_cod_idr !== null && codCollectionIdr > c.max_cod_idr) return `Total COD maksimal ${rp(c.max_cod_idr)} untuk kurir ini.`
  if (c.min_cod_idr !== null && codCollectionIdr < c.min_cod_idr) return `Total COD minimal ${rp(c.min_cod_idr)} untuk kurir ini.`
  return null
}

export interface CardBase {
  serviceCode: string
  courierCode: string
  courierName: string
  name: string
  serviceClass: "regular" | "cargo"
  billableWeightGram: number
  providerWeightKg: number
  eta: string | null
  dropOffOnly: boolean
  available: boolean
  unavailableReason: string | null
}

/** Which services can be quoted for this request, and at which provider weight (cargo rules, mode, prefs). */
export function eligibleServices(catalog: CatalogEntry[], disabledCouriers: Set<string>, input: QuoteInput): Array<{ entry: CatalogEntry; billable: number; weightKg: number; reason: string | null }> {
  return catalog
    .filter((c) => !disabledCouriers.has(c.courier_code))
    .map((c) => {
      const billable = billableGram(c.service_code, input.actualWeightGram, input.dims)
      const weightKg = providerWeightKg(billable, c.min_weight_gram ?? 1000, c.rounding_tolerance_gram)
      let reason: string | null = null
      // DFOD collects the shipping fee as COD, so only `none` sends `goodsValue`.
      const nonCod = input.mode === "none"
      if (input.dangerousGoods && c.dg_supported !== 1) reason = "Barang berbahaya hanya lewat SiCepat (HALU) atau iDexpress."
      else if (c.service_class === "cargo" && input.mode !== "none") reason = "Cargo hanya untuk kiriman Non-COD."
      else if (c.service_class === "cargo" && billable < CARGO_RECOMMEND_GRAM) reason = "Cargo untuk paket mulai 5 kg."
      else if (input.mode !== "none" && c.cod_supported !== 1) reason = "Layanan ini tidak menerima COD."
      else if (c.max_weight_gram !== null && billable > c.max_weight_gram) reason = `Maksimal ${c.max_weight_gram / 1000} kg untuk layanan ini.`
      else if (nonCod && c.min_goods_value_idr !== null && input.declaredValueIdr < c.min_goods_value_idr) reason = `Isi Nilai Barang minimal ${rp(c.min_goods_value_idr)} untuk kurir ini.`
      else if (nonCod && c.max_goods_value_idr !== null && input.declaredValueIdr > c.max_goods_value_idr) reason = `Nilai Barang maksimal ${rp(c.max_goods_value_idr)} untuk kurir ini.`
      return { entry: c, billable, weightKg, reason }
    })
}

export interface QuoteCard extends CardBase {
  P: number
  N: number
  F: number
  observedBps: number | null
  rawDiscount: string | null
  assignedBps: number | null
  effectiveCostIdr: number
  flow: ReturnType<typeof computeFlow>
}

/** Builds one card from the final row of this service (Non-COD row, or the final COD row for COD modes). */
export function buildCard(base: CardBase, price: { P: number; N: number; F: number; observedBps: number | null; rawDiscount: string | null }, input: QuoteInput, assignedBps: number | null): QuoteCard {
  const flow = computeFlow(input.mode, { P: price.P, N: price.N, I: null, F: input.mode === "none" ? 0 : price.F, K: input.packingIdr, S: input.serviceFeeIdr, V: input.promoIdr, G: input.codGoodsIdr })
  return {
    ...base,
    ...price,
    assignedBps,
    effectiveCostIdr: assignedBps === null ? price.N : effectiveCostIdr(price.P, price.N, assignedBps),
    flow,
  }
}

/** Medals (visual 05 §2): cheapest by customer price, fastest by ETA lower bound, largest COD credit to the sender. */
export function medals(cards: QuoteCard[], mode: CodFeeMode): { termurah: string | null; tercepat: string | null; cairTerbesar: string | null } {
  const ok = cards.filter((c) => c.available)
  const days = (eta: string | null) => (eta ? Number(/(\d+)/.exec(eta)?.[1] ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY)
  const by = <T>(xs: QuoteCard[], f: (c: QuoteCard) => T, cmp: (a: T, b: T) => number) => (xs.length ? xs.reduce((a, b) => (cmp(f(b), f(a)) < 0 ? b : a)).serviceCode : null)
  const total = (c: QuoteCard) => (mode === "none" ? c.flow.counterDueIdr : c.flow.codCollectionTotalIdr)
  return {
    termurah: by(ok, total, (a, b) => a - b),
    tercepat: by(ok.filter((c) => Number.isFinite(days(c.eta))), (c) => days(c.eta), (a, b) => a - b),
    cairTerbesar: mode === "none" ? null : by(ok, (c) => c.flow.senderCodPayableIdr, (a, b) => b - a),
  }
}

export { MoneyRuleError }
