// Integer gram weight and volumetric math (spec 02 §1, DEC-215). All inputs and outputs are integers.

export const DEFAULT_WEIGHT_GRAM = 1000
export const MIN_WEIGHT_GRAM = 10
export const MAX_WEIGHT_GRAM = 100_000
export const DEFAULT_ROUNDING_TOLERANCE_GRAM = 300

export type VolumetricDivisor = 6000 | 4000

export interface Dimensions {
  lengthCm: number
  widthCm: number
  heightCm: number
}

function assertInt(name: string, v: number, min = 0): void {
  if (!Number.isSafeInteger(v) || v < min) throw new RangeError(`${name} must be an integer >= ${min}`)
}

/** `ceil(L × W × H × 1000 / divisor)` in grams; integer arithmetic only. */
export function volumetricWeightGram(d: Dimensions, divisor: VolumetricDivisor): number {
  if (divisor !== 6000 && divisor !== 4000) throw new RangeError("volumetric divisor must be 6000 or 4000")
  assertInt("lengthCm", d.lengthCm, 1)
  assertInt("widthCm", d.widthCm, 1)
  assertInt("heightCm", d.heightCm, 1)
  const numerator = d.lengthCm * d.widthCm * d.heightCm * 1000
  assertInt("volume", numerator)
  const out = Math.floor((numerator + divisor - 1) / divisor)
  assertInt("volumetricGram", out)
  return out
}

/** `max(actual, volumetric)`; dimensions are optional. */
export function rawWeightGram(actualWeightGram: number, dims: Dimensions | null, divisor: VolumetricDivisor): number {
  assertInt("actualWeightGram", actualWeightGram, 1)
  if (!dims) return actualWeightGram
  return Math.max(actualWeightGram, volumetricWeightGram(dims, divisor))
}

/**
 * Integer kilograms sent to Mengantar (spec 02 §1.3). Sub-kilogram parcels on a 1 kg-minimum route bill 1 kg;
 * sub-kilogram services (`routeMinWeightGram < 1000`) are handled by {@link providerWeightKg}.
 */
export function billedKg(rawGram: number, toleranceGram: number = DEFAULT_ROUNDING_TOLERANCE_GRAM): number {
  assertInt("rawGram", rawGram, 1)
  assertInt("toleranceGram", toleranceGram)
  if (rawGram < 1000) return 1
  const whole = Math.floor(rawGram / 1000)
  const rest = rawGram % 1000
  if (rest === 0) return whole
  return rest <= toleranceGram ? whole : whole + 1
}

/** The exact `weight` value for estimate/order: decimal kg only for explicit sub-kg services. */
export function providerWeightKg(rawGram: number, routeMinWeightGram: number, toleranceGram?: number): number {
  assertInt("routeMinWeightGram", routeMinWeightGram, 1)
  if (rawGram < 1000 && routeMinWeightGram < 1000) {
    assertInt("rawGram", rawGram, 1)
    return rawGram / 1000
  }
  return billedKg(rawGram, toleranceGram)
}

export type UnitMistake = "gram_too_small" | "kg_too_large" | null

/** Unit-mistake guard (DEC-215): `< 10` typed in gram mode, `>= 100` typed in kg mode. */
export function unitMistake(typed: number, unit: "gram" | "kg"): UnitMistake {
  if (unit === "gram" && typed < 10) return "gram_too_small"
  if (unit === "kg" && typed >= 100) return "kg_too_large"
  return null
}

/** Converts a kg input (may be decimal, e.g. 1.25) to integer grams, rounding half up to the gram. */
export function kgToGram(kg: number): number {
  if (!Number.isFinite(kg) || kg <= 0) throw new RangeError("kg must be positive")
  const g = Math.round(kg * 1000)
  assertInt("gram", g, 1)
  return g
}

/** Indonesian display `1,25 kg` (comma decimal, no trailing zeros). */
export function formatKg(gram: number): string {
  assertInt("gram", gram)
  const whole = Math.floor(gram / 1000)
  const frac = String(gram % 1000).padStart(3, "0").replace(/0+$/, "")
  return frac ? `${whole},${frac} kg` : `${whole} kg`
}

export function isWeightInBounds(gram: number): boolean {
  return Number.isSafeInteger(gram) && gram >= MIN_WEIGHT_GRAM && gram <= MAX_WEIGHT_GRAM
}
