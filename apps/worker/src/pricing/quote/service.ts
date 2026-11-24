// Quote orchestration (TASK-303, spec 02 §3.3): one Non-COD `courier=all` estimate per provider weight, then for COD
// modes the per-service COD passes (`resolveCodFee`: fixed modes 1 estimate, fee-inclusive ≤ 3, else
// COD_FEE_UNSTABLE). Records `observed_bps` per service class for the TASK-207 verifier on every quote. Per-tenant
// quote rate limit (spec 10 §4.4). Quick check (`cek cepat`) allocates no slug and stores nothing but observations.
import { codAmountBase, MoneyRuleError, resolveCodFee, type CodFeeMode } from "@gx/domain/money"
import { isWeightInBounds } from "@gx/domain/weight"
import type { Courier } from "@gx/mengantar-sdk"
import { hit } from "../../auth/throttle"
import { vaultFor } from "../../do/gerai-vault/stub"
import type { FrozenQuote, ObservedRate } from "../../do/gerai-vault"
import { AppError } from "../../http/envelope"
import { recordObservation } from "../rules"
import { COD_BLOCK_TTL_MS, posCodMessage } from "./messages"
import { buildCard, codLimitReason, eligibleServices, medals, priceOf, QUOTE_TTL_MS, type CatalogEntry, type QuoteCard, type QuoteInput } from "./engine"

export const QUOTES_PER_MINUTE = 30
const AREA = /^[0-9a-f]{24}$/
const MODES: CodFeeMode[] = ["none", "buyer_bears_fee", "sender_bears_fee", "cod_all_in", "dfod"]

const int = (v: unknown, def: number) => (v === undefined || v === null || v === "" ? def : typeof v === "number" ? v : Number(v))

/** Validates a quote request (Indonesian field errors). */
export function parseQuoteInput(b: Record<string, unknown>, originAreaId: string): QuoteInput {
  const errors: Record<string, string> = {}
  const destination = typeof b.destinationAreaId === "string" && AREA.test(b.destinationAreaId) ? b.destinationAreaId : ""
  if (!destination) errors.destinationAreaId = "Pilih kecamatan tujuan dari daftar."
  const mode = MODES.includes(b.mode as CodFeeMode) ? (b.mode as CodFeeMode) : "none"
  const weight = int(b.weightGram, 1000)
  if (!isWeightInBounds(weight)) errors.weightGram = "Berat 10 g sampai 100 kg."
  const dimsRaw = [int(b.lengthCm, 0), int(b.widthCm, 0), int(b.heightCm, 0)]
  const anyDim = dimsRaw.some((d) => d > 0)
  if (anyDim && !dimsRaw.every((d) => Number.isSafeInteger(d) && d >= 1 && d <= 300)) errors.dims = "Isi panjang, lebar dan tinggi (1–300 cm) atau kosongkan semuanya."
  const G = mode === "none" || mode === "dfod" ? 0 : int(b.codGoodsIdr, 0)
  if (mode !== "none" && mode !== "dfod" && (!Number.isSafeInteger(G) || G < 10_000 || G > 5_000_000)) errors.codGoodsIdr = "Harga barang COD Rp10.000–Rp5.000.000."
  const K = int(b.packingIdr, 0)
  const S = int(b.serviceFeeIdr, 0)
  const V = int(b.promoIdr, 0)
  for (const [k, v] of Object.entries({ packingIdr: K, serviceFeeIdr: S, promoIdr: V })) if (!Number.isSafeInteger(v) || v < 0 || v > 10_000_000) errors[k] = "Nominal tidak valid."
  // DEC-238: Non-COD goods value (`goodsValue`), up to Mengantar's Rp10.000.000 non-COD ceiling; COD sends `COD` instead.
  const D = mode === "none" ? int(b.declaredValueIdr, 0) : 0
  if (!Number.isSafeInteger(D) || D < 0 || D > 10_000_000) errors.declaredValueIdr = "Nilai barang Rp0–Rp10.000.000."
  if (b.dangerousGoods !== undefined && typeof b.dangerousGoods !== "boolean") errors.dangerousGoods = "Pilihan barang berbahaya tidak valid."
  if (Object.keys(errors).length) throw new AppError(422, "INVALID_QUOTE", Object.values(errors)[0]!, errors)
  return {
    originAreaId,
    destinationAreaId: destination,
    mode,
    actualWeightGram: weight,
    dims: anyDim ? { lengthCm: dimsRaw[0]!, widthCm: dimsRaw[1]!, heightCm: dimsRaw[2]! } : null,
    codGoodsIdr: G,
    packingIdr: K,
    serviceFeeIdr: S,
    promoIdr: V,
    declaredValueIdr: D,
    dangerousGoods: b.dangerousGoods === true,
  }
}

export interface QuoteResult {
  input: QuoteInput
  cards: QuoteCard[]
  medals: ReturnType<typeof medals>
  quotedAt: number
  expiresAt: number
}

/** Runs a quote for a tenant. Throws `AppError` 429 when the per-tenant quote limit is exceeded. */
export async function runQuote(env: Env, tenantId: string, input: QuoteInput, now: number, opts: { rateKey?: string; perMinute?: number; serviceCode?: string | null; skipObserve?: boolean } = {}): Promise<QuoteResult> {
  const limit = await hit(env.DB, opts.rateKey ?? `quote:${tenantId}`, opts.perMinute ?? QUOTES_PER_MINUTE, 60_000, now)
  if (!limit.allowed) throw new AppError(429, "QUOTE_RATE_LIMITED", "Terlalu banyak cek ongkir. Coba lagi sebentar lagi.", {}, { "retry-after": String(Math.ceil(limit.retryAfterMs / 1000)) })
  const vault = vaultFor(env, tenantId)
  const [catalog, prefs, rules] = await Promise.all([
    env.DB.prepare(
      "SELECT service_code, courier_code, courier_name, display_name, service_class, cod_supported, rounding_tolerance_gram, min_weight_gram, max_weight_gram, min_cod_idr, max_cod_idr, min_goods_value_idr, max_goods_value_idr, dg_supported, booking_eco FROM courier_service_catalog WHERE is_active = 1 ORDER BY sort_order",
    ).all<CatalogEntry>(),
    vault.courierPrefs(tenantId),
    env.DB.prepare("SELECT service_code, assigned_bps FROM tenant_discount_rules WHERE tenant_id = ?").bind(tenantId).all<{ service_code: string; assigned_bps: number }>(),
  ])
  if (!prefs.ok) throw new AppError(503, "TENANT_NOT_READY", "Data gerai sedang diperbarui. Coba lagi sebentar lagi.")
  const disabled = new Set(prefs.value.filter((p) => p.enabled === 0).map((p) => p.courier_code))
  const dropOff = new Set(prefs.value.filter((p) => p.pickup_mode === "drop_off_only").map((p) => p.courier_code))
  // Pos Indonesia refused COD for this seller (403 new_seller / insufficient / blocked) within the last 24 h.
  const codBlocked = new Map(prefs.value.filter((p) => p.cod_blocked_at !== null && now - (p.cod_blocked_at ?? 0) < COD_BLOCK_TTL_MS).map((p) => [p.courier_code, p]))
  const assigned = new Map(rules.results.map((r) => [r.service_code, r.assigned_bps]))
  // Paket Massal quotes one chosen service per row (spec 03 §1.3): never fan out COD passes across the whole catalog.
  const services = eligibleServices(opts.serviceCode ? catalog.results.filter((c) => c.service_code === opts.serviceCode) : catalog.results, disabled, input)

  // Pass 1: one Non-COD `courier=all` estimate per distinct provider weight (usually one).
  const weights = [...new Set(services.filter((s) => !s.reason).map((s) => s.weightKg))]
  const pass1 = new Map<number, Record<string, ObservedRate> | null>()
  await Promise.all(
    weights.map(async (w) => {
      const r = await vault.estimateRates(tenantId, { originId: input.originAreaId, destinationId: input.destinationAreaId, courier: "all", weightKg: w, dangerousGoods: input.dangerousGoods })
      if (!r.ok && r.refused === "NO_KEY") throw new AppError(409, "NOT_CONNECTED", "Gerai belum terhubung ke Mengantar atau kunci sedang dirotasi.")
      pass1.set(w, r.ok ? r.value : null)
    }),
  )
  if (weights.length && [...pass1.values()].every((v) => v === null)) throw new AppError(502, "PROVIDER_UNAVAILABLE", "Mengantar sedang tidak bisa dihubungi. Coba lagi sebentar lagi.")

  const cards: QuoteCard[] = []
  const observations: Array<{ serviceCode: string; bps: number }> = []
  await Promise.all(
    services.map(async ({ entry, billable, weightKg, reason }) => {
      const base = {
        serviceCode: entry.service_code,
        courierCode: entry.courier_code,
        courierName: entry.courier_name,
        name: entry.display_name,
        serviceClass: entry.service_class,
        billableWeightGram: billable,
        providerWeightKg: weightKg,
        eta: null as string | null,
        dropOffOnly: dropOff.has(entry.courier_code),
        available: false,
        unavailableReason: reason,
      }
      if (reason) return void cards.push(unavailable(base))
      const row = pass1.get(weightKg)?.[entry.service_code]
      if (!row) return void cards.push(unavailable({ ...base, unavailableReason: entry.booking_eco ? "J&T ECO tidak tersedia untuk rute ini." : "Layanan tidak tersedia untuk rute ini." }))
      if (input.dangerousGoods && row.dgSupported === false) return void cards.push(unavailable({ ...base, unavailableReason: "Kurir ini tidak menerima barang berbahaya untuk rute ini." }))
      base.eta = row.eta
      base.dropOffOnly = base.dropOffOnly || row.unsupportedPickup
      const p1 = priceOf(entry.service_class, row)
      if (!p1) return void cards.push(unavailable({ ...base, unavailableReason: "Layanan tidak tersedia untuk rute ini." }))
      if (p1.observedBps !== null) observations.push({ serviceCode: entry.service_code, bps: p1.observedBps })
      if (input.mode !== "none" && row.unsupportedCod) return void cards.push(unavailable({ ...base, unavailableReason: "COD tidak tersedia untuk rute ini." }))
      const blocked = input.mode !== "none" ? codBlocked.get(entry.courier_code) : undefined
      if (blocked) return void cards.push(unavailable({ ...base, unavailableReason: posCodMessage(blocked.cod_blocked_status, blocked.cod_delivered_rate) }))
      try {
        if (input.mode === "none") {
          cards.push({ ...buildCard({ ...base, available: true }, { ...p1, F: 0 }, input, assigned.get(entry.service_code) ?? null) })
          return
        }
        // COD passes: F from the estimate whose COD_AMOUNT equals the final collection C; N re-read from that row.
        let finalRow: ObservedRate | null = null
        const codMode = input.mode
        const { F, C } = await resolveCodFee(codMode, { P: p1.P, I: null, G: input.codGoodsIdr }, async (codAmount) => {
          // J&T ECO has no `courier` value of its own: its COD row exists only in a `courier=all` estimate (v2.0.0).
          const r = await vault.estimateRates(tenantId, { originId: input.originAreaId, destinationId: input.destinationAreaId, courier: entry.booking_eco ? "all" : (entry.courier_code as Courier), weightKg, codAmountIdr: codAmount, dangerousGoods: input.dangerousGoods })
          const x = r.ok ? r.value[entry.service_code] : undefined
          if (!x || x.codFee === null || !Number.isSafeInteger(x.codFee)) throw new AppError(502, "PROVIDER_UNAVAILABLE", "Biaya COD tidak bisa dihitung saat ini.")
          finalRow = x
          return x.codFee
        })
        const fin = finalRow ? priceOf("regular", finalRow) : null
        if (!fin || fin.F !== F) throw new MoneyRuleError("COD_FEE_UNSTABLE", "Biaya COD berubah, ulangi cek ongkir.")
        const card = buildCard({ ...base, available: true }, fin, input, assigned.get(entry.service_code) ?? null)
        // Mengantar rejects a COD outside the courier's bounds at create-order: say so before the counter sells it.
        const over = codLimitReason(entry, card.flow.codCollectionTotalIdr)
        void C
        cards.push(over ? unavailable({ ...base, unavailableReason: over }) : card)
      } catch (err) {
        const msg = err instanceof MoneyRuleError ? err.userMessage : err instanceof AppError ? err.userMessage : "Layanan tidak bisa dihitung."
        cards.push(unavailable({ ...base, unavailableReason: msg }))
      }
    }),
  )
  // Every quote feeds the discount verifier (spec 02 §2.1); best effort, never blocks the counter (skipped for demo).
  if (!opts.skipObserve) await Promise.allSettled(observations.map((o) => recordObservation(env, { tenantId, serviceCode: o.serviceCode, observedBps: o.bps, now, scheduled: false })))
  const order = new Map(catalog.results.map((c, i) => [c.service_code, i]))
  cards.sort((a, b) => Number(b.available) - Number(a.available) || (order.get(a.serviceCode) ?? 0) - (order.get(b.serviceCode) ?? 0))
  return { input, cards, medals: medals(cards, input.mode), quotedAt: now, expiresAt: now + QUOTE_TTL_MS }
}

function unavailable(base: Omit<QuoteCard, "P" | "N" | "F" | "observedBps" | "rawDiscount" | "assignedBps" | "effectiveCostIdr" | "flow">): QuoteCard {
  return { ...base, available: false, P: 0, N: 0, F: 0, observedBps: null, rawDiscount: null, assignedBps: null, effectiveCostIdr: 0, flow: { mode: "none", counterDueIdr: 0, codCollectionTotalIdr: 0, expectedProviderCodCreditIdr: 0, providerDebitIdr: 0, senderCodPayableIdr: 0, outletMarginIdr: 0 } }
}

/** Customer-facing view of a card: publish price and what the counter collects; never cost, discount or margin. */
export function cashierCard(c: QuoteCard) {
  return {
    serviceCode: c.serviceCode,
    courierCode: c.courierCode,
    courierName: c.courierName,
    name: c.name,
    serviceClass: c.serviceClass,
    billableWeightGram: c.billableWeightGram,
    eta: c.eta,
    dropOffOnly: c.dropOffOnly,
    available: c.available,
    unavailableReason: c.unavailableReason,
    publishShippingIdr: c.P,
    codFeeIdr: c.F,
    counterDueIdr: c.flow.counterDueIdr,
    codCollectionTotalIdr: c.flow.codCollectionTotalIdr,
    senderCodPayableIdr: c.flow.senderCodPayableIdr,
  }
}

/** Owner view adds cost, discount and the estimated margin (`👁` toggle in the UI). */
export function ownerCard(c: QuoteCard) {
  return { ...cashierCard(c), providerNetShippingIdr: c.N, observedBps: c.observedBps, assignedBps: c.assignedBps, effectiveGeraiCostIdr: c.effectiveCostIdr, estimatedProfitIdr: c.flow.outletMarginIdr }
}

/** Frozen snapshot of the chosen card for an allocated INV slug (create-order sends these values unchanged). */
export function frozenFrom(slug: string, q: QuoteResult, c: QuoteCard): FrozenQuote {
  const { input } = q
  return {
    shipment_slug: slug,
    origin_area_id: input.originAreaId,
    destination_area_id: input.destinationAreaId,
    cod_fee_mode: input.mode,
    actual_weight_gram: input.actualWeightGram,
    length_cm: input.dims?.lengthCm ?? null,
    width_cm: input.dims?.widthCm ?? null,
    height_cm: input.dims?.heightCm ?? null,
    volumetric_divisor: c.serviceCode === "JNE" || c.serviceCode === "iDexpressCargo" ? 4000 : 6000,
    billable_weight_gram: c.billableWeightGram,
    provider_weight_kg_text: String(c.providerWeightKg),
    courier_code: c.courierCode,
    service_code: c.serviceCode,
    service_class: c.serviceClass,
    publish_shipping_idr: c.P,
    provider_net_shipping_idr: c.N,
    raw_discount_percent: c.rawDiscount,
    provider_observed_discount_bps: c.observedBps,
    assigned_gerai_discount_bps: c.assignedBps,
    effective_gerai_cost_idr: c.effectiveCostIdr,
    insurance_fee_idr: null,
    declared_value_idr: input.declaredValueIdr,
    is_dangerous_goods: input.dangerousGoods ? 1 : 0,
    cod_fee_idr: c.F,
    cod_goods_amount_idr: input.codGoodsIdr,
    cod_collection_total_idr: c.flow.codCollectionTotalIdr,
    counter_due_idr: c.flow.counterDueIdr,
    sender_cod_payable_idr: c.flow.senderCodPayableIdr,
    expected_provider_cod_credit_idr: c.flow.expectedProviderCodCreditIdr,
    packing_addon_idr: input.packingIdr,
    counter_service_fee_idr: input.serviceFeeIdr,
    promo_discount_idr: input.promoIdr,
    estimated_margin_idr: c.flow.outletMarginIdr,
    quoted_at: q.quotedAt,
    expires_at: q.expiresAt,
  }
}

export { codAmountBase }
