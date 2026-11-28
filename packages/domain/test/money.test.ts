import { describe, expect, it } from "vitest"
import {
  bandForCourier,
  codAmountBase,
  commercialCostIdr,
  effectiveCostIdr,
  mulDivFloor,
  COD_FEE_MODES,
  computeFlow,
  effectiveBps,
  formatBps,
  formatIdr,
  isAssignedBpsAllowed,
  isQuoteDrift,
  labaKasIdr,
  MoneyRuleError,
  nextVerificationState,
  observedBpsFromDiscount,
  observedBpsFromNet,
  PLATFORM_DISCOUNT_BAND,
  resolveCodFee,
  tariffGapIdr,
  verificationCheckTimes,
  type CodFeeMode,
  type FlowInput,
} from "../src/money"

// Spec 02 §3.4 fixture: P = 12.000, N = 9.600, I = NULL, F = 5.560, K = 3.000, S = 0, V = 0, G = 150.000.
const FIX: FlowInput = { P: 12_000, N: 9_600, I: null, F: 5_560, K: 3_000, S: 0, V: 0, G: 150_000 }

describe("spec 02 §3.4 worked examples (exact)", () => {
  const rows: Record<CodFeeMode, [due: number, collects: number, credit: number, payable: number, margin: number]> = {
    none: [15_000, 0, 0, 0, 5_400],
    buyer_bears_fee: [3_000, 167_560, 152_400, 150_000, 5_400],
    sender_bears_fee: [3_000, 162_000, 146_840, 144_440, 5_400],
    cod_all_in: [3_000, 150_000, 134_840, 132_440, 5_400],
    dfod: [3_000, 17_560, 2_400, 0, 5_400],
  }
  it.each(Object.entries(rows))("%s", (mode, [due, collects, credit, payable, margin]) => {
    const f = computeFlow(mode as CodFeeMode, FIX)
    expect(f.counterDueIdr).toBe(due)
    expect(f.codCollectionTotalIdr).toBe(collects)
    expect(f.expectedProviderCodCreditIdr).toBe(credit)
    expect(f.senderCodPayableIdr).toBe(payable)
    expect(f.outletMarginIdr).toBe(margin)
  })
  it("Non-COD debits N + I0 instead of crediting", () => {
    expect(computeFlow("none", FIX).providerDebitIdr).toBe(9_600)
    expect(computeFlow("none", { ...FIX, I: 1_000 }).providerDebitIdr).toBe(10_600)
  })
  it("seller credit − sender payable = P − N for every COD mode", () => {
    for (const mode of COD_FEE_MODES.filter((m) => m !== "none")) {
      const f = computeFlow(mode, FIX)
      expect(f.expectedProviderCodCreditIdr - f.senderCodPayableIdr, mode).toBe(FIX.P - FIX.N)
    }
  })
  it("per-mode fee fixture keeps the identity (F differs per mode in production)", () => {
    const fees: Record<string, number> = { buyer_bears_fee: 5_700, sender_bears_fee: 5_490, cod_all_in: 4_500, dfod: 600 }
    for (const [mode, F] of Object.entries(fees)) {
      const f = computeFlow(mode as CodFeeMode, { ...FIX, F, I: 1_000 })
      expect(f.expectedProviderCodCreditIdr - f.senderCodPayableIdr, mode).toBe(FIX.P - FIX.N)
      expect(f.expectedProviderCodCreditIdr, mode).toBe(f.codCollectionTotalIdr - (FIX.N + F + 1_000))
    }
  })
})

describe("insurance NULL vs 0", () => {
  it("NULL insurance behaves as I0 = 0 in flows but is never turned into a stored 0", () => {
    const withNull = computeFlow("none", FIX)
    const withZero = computeFlow("none", { ...FIX, I: 0 })
    expect(withNull.counterDueIdr).toBe(withZero.counterDueIdr)
    expect(FIX.I).toBeNull()
  })
  it("insured Non-COD Laba Kas (I = 1.000): 16.000 − 10.600 = 5.400", () => {
    const f = computeFlow("none", { ...FIX, I: 1_000 })
    expect(f.counterDueIdr).toBe(16_000)
    expect(labaKasIdr({ mode: "none", counterPaymentStatus: "paid", counterDueIdr: f.counterDueIdr, providerReconciledCostIdr: 10_600, reconciledProviderCodCreditIdr: null, senderCodPayableIdr: 0, K: 3_000, S: 0, V: 0 })).toBe(5_400)
  })
  it("Laba Kas stays null until the counter is paid and the provider side is reconciled", () => {
    const base = { mode: "none" as const, counterDueIdr: 15_000, reconciledProviderCodCreditIdr: null, senderCodPayableIdr: 0, K: 3_000, S: 0, V: 0 }
    expect(labaKasIdr({ ...base, counterPaymentStatus: "unpaid", providerReconciledCostIdr: 9_600 })).toBeNull()
    expect(labaKasIdr({ ...base, counterPaymentStatus: "paid", providerReconciledCostIdr: null })).toBeNull()
    expect(labaKasIdr({ ...base, counterPaymentStatus: "not_required", providerReconciledCostIdr: 9_600 })).toBe(5_400)
    const cod = computeFlow("buyer_bears_fee", FIX)
    expect(labaKasIdr({ mode: "buyer_bears_fee", counterPaymentStatus: "paid", counterDueIdr: 3_000, providerReconciledCostIdr: null, reconciledProviderCodCreditIdr: cod.expectedProviderCodCreditIdr, senderCodPayableIdr: cod.senderCodPayableIdr, K: 3_000, S: 0, V: 0 })).toBe(5_400)
  })
})

describe("guards", () => {
  it("cod_all_in rejects G < P + I0 + F + 1000 and never stores a negative payable", () => {
    expect(() => computeFlow("cod_all_in", { ...FIX, G: 12_000 + 5_560 + 999 })).toThrow(MoneyRuleError)
    expect(computeFlow("cod_all_in", { ...FIX, G: 12_000 + 5_560 + 1_000 }).senderCodPayableIdr).toBe(1_000)
  })
  it("promo cannot push counter due below zero", () => {
    expect(() => computeFlow("buyer_bears_fee", { ...FIX, V: 3_001 })).toThrow(/promo/i)
    expect(computeFlow("none", { ...FIX, V: 15_000 }).counterDueIdr).toBe(0)
  })
  it("service fee only on none/dfod within Rp1.000–Rp200.000", () => {
    expect(() => computeFlow("buyer_bears_fee", { ...FIX, S: 2_000 })).toThrow(MoneyRuleError)
    expect(() => computeFlow("none", { ...FIX, S: 999 })).toThrow(MoneyRuleError)
    expect(computeFlow("dfod", { ...FIX, S: 2_000 }).counterDueIdr).toBe(5_000)
  })
  it("COD goods bounds Rp10.000–Rp5.000.000", () => {
    expect(() => computeFlow("buyer_bears_fee", { ...FIX, G: 9_999 })).toThrow(MoneyRuleError)
    expect(() => computeFlow("buyer_bears_fee", { ...FIX, G: 5_000_001 })).toThrow(MoneyRuleError)
  })
  it("rejects non-integer money", () => {
    expect(() => computeFlow("none", { ...FIX, P: 12_000.5 })).toThrow(MoneyRuleError)
  })
  it("sender_bears_fee rejects G < F (never a negative payable)", () => {
    expect(() => computeFlow("sender_bears_fee", { ...FIX, P: 300_000, G: 10_000, F: 10_850 })).toThrow(MoneyRuleError)
    expect(computeFlow("sender_bears_fee", { ...FIX, G: 10_000, F: 10_000 }).senderCodPayableIdr).toBe(0)
  })
  it("invalid amounts raise an Indonesian message without internal names", () => {
    try {
      computeFlow("none", { ...FIX, P: 1.5 })
      expect.unreachable()
    } catch (e) {
      expect((e as MoneyRuleError).userMessage).toBe("Nominal rupiah tidak valid.")
      expect((e as MoneyRuleError).message).toContain("P")
    }
  })
  it("rejects non-integer / out-of-range bps and unsafe math", () => {
    expect(() => effectiveBps(2000.5, 2500)).toThrow(MoneyRuleError)
    expect(() => commercialCostIdr(12_000, 9_600, -1)).toThrow(MoneyRuleError)
    expect(() => commercialCostIdr(12_000, 9_600, 10_001)).toThrow(MoneyRuleError)
    expect(() => mulDivFloor(-1, 1, 2)).toThrow(MoneyRuleError)
    expect(() => mulDivFloor(1, 1, 0)).toThrow(MoneyRuleError)
    expect(() => mulDivFloor(Number.MAX_SAFE_INTEGER, 10_000, 1)).toThrow(MoneyRuleError)
    expect(() => tariffGapIdr(9_000.5, 9_600)).toThrow(MoneyRuleError)
    expect(() => codAmountBase("buyer_bears_fee", 12_000.5, null, 150_000)).toThrow(MoneyRuleError)
  })
  it("error messages are Indonesian", () => {
    try {
      computeFlow("cod_all_in", { ...FIX, G: 10_000 })
    } catch (e) {
      expect((e as MoneyRuleError).userMessage).toBe("COD all-in tidak cukup menutup ongkir dan biaya COD.")
    }
  })
})

describe("discounts (spec 02 §2, §2.1; DEC-230, DEC-233)", () => {
  it("9599 regression: observed 2000 bps, assigned 2000 → cost is the exact net 9.599, not 9.600", () => {
    expect(observedBpsFromNet(12_000, 9_599)).toBe(2000)
    expect(commercialCostIdr(12_000, 9_599, 2000)).toBe(9_599)
  })
  it("effective cost uses N whenever assigned ≥ observed (9599 kept), bps only when assigned < observed", () => {
    expect(effectiveCostIdr(12_000, 9_599, 2500)).toBe(9_599)
    expect(effectiveCostIdr(12_000, 9_599, 2000)).toBe(9_599)
    expect(effectiveCostIdr(12_000, 9_000, 2000)).toBe(9_600) // observed 25 %, assigned 20 % → 12.000 − 2.400
  })
  it("not-yet-applied fixture: assigned 2500 while Mengantar gives 2000 → M = 9.000, effective 2000, N = 9.600", () => {
    const observed = observedBpsFromNet(12_000, 9_600)
    expect(observed).toBe(2000)
    expect(effectiveBps(2500, observed)).toBe(2000)
    const M = commercialCostIdr(12_000, 9_600, 2500)
    expect(M).toBe(9_000)
    expect(tariffGapIdr(M, 9_600)).toBe(-600)
    // Flows still use N (no subsidy): Estimasi Laba 5.400.
    expect(computeFlow("none", FIX).outletMarginIdr).toBe(5_400)
  })
  it("observed discount per service class (regular discount/price, cargo cargoDiscount/cargoPrice)", () => {
    expect(observedBpsFromDiscount(2_400, 12_000)).toBe(2000)
    expect(observedBpsFromDiscount(15_000, 60_000)).toBe(2500)
  })
  it("platform band 2000..2500, default 2500 (DEC-258); per-courier band overrides with platform fallback", () => {
    expect(PLATFORM_DISCOUNT_BAND).toEqual({ defaultBps: 2500, minBps: 2000, maxBps: 2500 })
    expect(isAssignedBpsAllowed(1999, bandForCourier(null))).toBe(false)
    expect(isAssignedBpsAllowed(2000, bandForCourier(null))).toBe(true)
    expect(isAssignedBpsAllowed(2500, bandForCourier(null))).toBe(true)
    expect(isAssignedBpsAllowed(2501, bandForCourier(undefined))).toBe(false)
    const jne = { defaultBps: 2200, minBps: 2200, maxBps: 2800 }
    expect(isAssignedBpsAllowed(2100, bandForCourier(jne))).toBe(false)
    expect(isAssignedBpsAllowed(2900, bandForCourier(jne))).toBe(false)
    expect(isAssignedBpsAllowed(2500, bandForCourier(jne))).toBe(true)
  })
  it("verification state table incl. 2000 vs 1999 → Sesuai and drift to 1000 → Selisih", () => {
    const t0 = 1_700_000_000_000
    const base = { assignedBps: 2000, requestedAt: t0, applySlaMinutes: 60 }
    expect(nextVerificationState({ ...base, state: "belum_diterapkan", observedBps: 1999, now: t0 + 15 * 60_000 })).toBe("sesuai")
    expect(nextVerificationState({ ...base, state: "belum_diterapkan", observedBps: 1500, now: t0 + 60 * 60_000 })).toBe("belum_diterapkan")
    expect(nextVerificationState({ ...base, state: "belum_diterapkan", observedBps: 1500, now: t0 + 120 * 60_000 })).toBe("selisih")
    expect(nextVerificationState({ ...base, state: "sesuai", observedBps: 1000, now: t0 })).toBe("selisih")
    expect(nextVerificationState({ ...base, state: "sesuai", observedBps: 2001, now: t0 })).toBe("sesuai")
    expect(nextVerificationState({ ...base, state: "selisih", observedBps: 2000, now: t0 })).toBe("sesuai")
    expect(verificationCheckTimes(t0)).toEqual([t0 + 900_000, t0 + 3_600_000, t0 + 7_200_000])
  })
})

describe("COD fee quote passes (spec 02 §3.3)", () => {
  it("fixed modes: one estimate at C", async () => {
    const r = await resolveCodFee("sender_bears_fee", { P: 12_000, I: null, G: 150_000 }, async () => 5_490)
    expect(r).toEqual({ F: 5_490, C: 162_000, estimates: 1 })
  })
  it("fee-inclusive: accepts when F1 = F0", async () => {
    const r = await resolveCodFee("buyer_bears_fee", { P: 12_000, I: null, G: 150_000 }, async () => 5_560)
    expect(r).toEqual({ F: 5_560, C: 167_560, estimates: 2 })
  })
  it("fee-inclusive: re-estimates once more then fixes", async () => {
    // 3 % fee, rounded: 162000 → 4860; 166860 → 5006; 167006 → 5010? use step fn to converge on the 3rd.
    const fee = (c: number) => (c < 166_000 ? 4_860 : 5_006)
    const r = await resolveCodFee("buyer_bears_fee", { P: 12_000, I: null, G: 150_000 }, async (c) => fee(c))
    expect(r).toEqual({ F: 5_006, C: 167_006, estimates: 3 })
  })
  it("fails with COD_FEE_UNSTABLE when still changing after 3 estimates", async () => {
    let n = 0
    await expect(resolveCodFee("dfod", { P: 12_000, I: null, G: 0 }, async () => 500 + n++)).rejects.toMatchObject({ code: "COD_FEE_UNSTABLE" })
  })
  it("quote_drift when order COD_FEE differs by ≥ Rp1; unreadable text is drift", () => {
    expect(isQuoteDrift(5_560, "5560")).toBe(false)
    expect(isQuoteDrift(5_560, " 5560.0 ")).toBe(false)
    expect(isQuoteDrift(5_560, "5560.99")).toBe(false)
    expect(isQuoteDrift(5_560, "5561.0")).toBe(true)
    expect(isQuoteDrift(5_560, "5559.00")).toBe(true)
    expect(isQuoteDrift(5_560, null)).toBe(false)
    for (const t of ["", "  ", "—", "N/A", "1e4", "5560,50", "Rp5.560"]) expect(isQuoteDrift(0, t), t).toBe(true)
  })
})

describe("property: integer Rupiah everywhere", () => {
  it("no flow field is ever non-integer and the spread identity holds (2.000 random cases)", () => {
    const r = new Uint32Array(8)
    for (let i = 0; i < 2_000; i++) {
      crypto.getRandomValues(r)
      const P = 5_000 + (r[0]! % 200_000)
      const N = Math.floor((P * (6_000 + (r[1]! % 3_000))) / 10_000)
      const F = r[2]! % 20_000
      const K = (r[3]! % 10) * 1_000
      const I = r[4]! % 2 ? null : r[4]! % 5_000
      const G = 10_000 + (r[5]! % 4_990_000)
      const mode = COD_FEE_MODES[r[6]! % 5]!
      const S = (mode === "none" || mode === "dfod") && r[7]! % 2 ? 1_000 + (r[7]! % 199_001) : 0
      let Gm = mode === "cod_all_in" ? Math.max(G, P + (I ?? 0) + F + 1_000) : G
      if (mode === "sender_bears_fee") Gm = Math.max(Gm, F)
      const cap = mode === "none" ? P + (I ?? 0) + K + S : K + S
      const V = r[7]! % 3 === 0 ? r[3]! % (cap + 1) : 0
      const input: FlowInput = { P, N, I, F, K, S, V, G: Gm }
      if (input.G > 5_000_000 || input.G < 10_000) continue
      const f = computeFlow(mode, input)
      for (const [k, v] of Object.entries(f)) if (k !== "mode") expect(Number.isSafeInteger(v), `${mode}.${k}`).toBe(true)
      expect(f.counterDueIdr).toBeGreaterThanOrEqual(0)
      expect(f.senderCodPayableIdr).toBeGreaterThanOrEqual(0)
      if (mode !== "none") expect(f.expectedProviderCodCreditIdr - f.senderCodPayableIdr).toBe(P - N)
    }
  })
})

describe("display", () => {
  it("formats Rupiah and bps the Indonesian way", () => {
    expect(formatIdr(167_560)).toBe("Rp167.560")
    expect(formatIdr(-600)).toBe("−Rp600")
    expect(formatBps(2000)).toBe("20 %")
    expect(formatBps(2050)).toBe("20,5 %")
    expect(formatBps(-50)).toBe("−0,5 %")
  })
})
