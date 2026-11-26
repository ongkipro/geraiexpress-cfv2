import { describe, expect, it } from "vitest"
import { billedKg, DEFAULT_WEIGHT_GRAM, formatKg, isWeightInBounds, kgToGram, providerWeightKg, rawWeightGram, unitMistake, volumetricWeightGram } from "../src/weight"

describe("weight (spec 02 §1, DEC-215)", () => {
  it("default is 1000 g", () => expect(DEFAULT_WEIGHT_GRAM).toBe(1000))
  it("volumetric = ceil(L×W×H×1000/divisor) in grams", () => {
    expect(volumetricWeightGram({ lengthCm: 30, widthCm: 20, heightCm: 15 }, 6000)).toBe(1500)
    expect(volumetricWeightGram({ lengthCm: 30, widthCm: 20, heightCm: 15 }, 4000)).toBe(2250)
    expect(volumetricWeightGram({ lengthCm: 7, widthCm: 7, heightCm: 7 }, 6000)).toBe(58) // 57.16 → 58
  })
  it("visual 05: 1200 g with 30×20×15 bills 2 kg (1500 g at /6000; 2250 g at /4000 within the 300 g tolerance)", () => {
    const raw = rawWeightGram(1200, { lengthCm: 30, widthCm: 20, heightCm: 15 }, 4000)
    expect(raw).toBe(2250)
    expect(billedKg(raw)).toBe(2)
    expect(billedKg(2301)).toBe(3)
    expect(billedKg(rawWeightGram(1200, { lengthCm: 30, widthCm: 20, heightCm: 15 }, 6000))).toBe(2)
  })
  it("billed kg rounding with tolerance", () => {
    expect(billedKg(2000)).toBe(2)
    expect(billedKg(2300)).toBe(2)
    expect(billedKg(2301)).toBe(3)
    expect(billedKg(2310, 310)).toBe(2) // custom 310 g tolerance
    expect(billedKg(1299, 299)).toBe(1) // SAP / SPX live tolerance (1.29 kg -> 1 kg)
    expect(billedKg(1300, 299)).toBe(2) // SAP / SPX live boundary (1.30 kg -> 2 kg)
    expect(billedKg(999)).toBe(1)
  })
  it("sub-kg services send decimal kg; 1 kg-minimum routes send 1", () => {
    expect(providerWeightKg(450, 500)).toBe(0.45)
    expect(providerWeightKg(450, 1000)).toBe(1)
    expect(providerWeightKg(1250, 500)).toBe(1)
  })
  it("unit-mistake guard: < 10 in gram mode, >= 100 in kg mode", () => {
    expect(unitMistake(9, "gram")).toBe("gram_too_small")
    expect(unitMistake(10, "gram")).toBeNull()
    expect(unitMistake(100, "kg")).toBe("kg_too_large")
    expect(unitMistake(99.9, "kg")).toBeNull()
  })
  it("kg ⇄ gram display (1250 g ⇄ 1,25 kg)", () => {
    expect(kgToGram(1.25)).toBe(1250)
    expect(formatKg(1250)).toBe("1,25 kg")
    expect(formatKg(1200)).toBe("1,2 kg")
    expect(formatKg(2000)).toBe("2 kg")
  })
  it("bounds 10..100000 g, integers only", () => {
    expect(isWeightInBounds(10)).toBe(true)
    expect(isWeightInBounds(9)).toBe(false)
    expect(isWeightInBounds(100_001)).toBe(false)
    expect(isWeightInBounds(1000.5)).toBe(false)
    expect(() => rawWeightGram(1000.5, null, 6000)).toThrow()
    expect(() => volumetricWeightGram({ lengthCm: 1, widthCm: 1, heightCm: 1 }, 5000 as 6000)).toThrow()
  })
})
