import { describe, expect, it } from "vitest"
import { destinationMark, displayInv, generateSlug, isSlug, normalizeSlug, SLUG_ALPHABET } from "../src/slug"

describe("INV slug (DEC-211)", () => {
  it("alphabet has 30 symbols and excludes 0/O/1/I/L/U", () => {
    expect(SLUG_ALPHABET).toHaveLength(30)
    for (const c of "0o1ilu") expect(SLUG_ALPHABET.includes(c)).toBe(false)
  })
  it("generates 7 chars from the alphabet", () => {
    for (let i = 0; i < 1_000; i++) expect(isSlug(generateSlug())).toBe(true)
  })
  it("10,000 slugs in one tenant → 0 duplicates", () => {
    const seen = new Set<string>()
    for (let i = 0; i < 10_000; i++) seen.add(generateSlug())
    expect(seen.size).toBe(10_000)
  })
  it("rejects biased bytes (>= 240) instead of folding them", () => {
    let call = 0
    const fake = (b: Uint8Array) => {
      b.fill(call++ === 0 ? 250 : 0)
    }
    expect(generateSlug(fake)).toBe("2222222")
  })
  it("case-insensitive normalisation and display", () => {
    expect(normalizeSlug("8K4M2P7")).toBe("8k4m2p7")
    expect(normalizeSlug("INV 8K4M2P7")).toBe("8k4m2p7")
    expect(normalizeSlug("INV: 8K4M2P7")).toBe("8k4m2p7")
    expect(normalizeSlug("INV #8K4M2P7")).toBe("8k4m2p7")
    expect(() => displayInv("bad")).toThrow()
    expect(normalizeSlug("#8k4m2p7")).toBe("8k4m2p7")
    expect(normalizeSlug("8k4m2p0")).toBeNull()
    expect(normalizeSlug("8k4m2p")).toBeNull()
    expect(displayInv("8k4m2p7")).toBe("INV 8K4M2P7")
    expect(destinationMark("8k4m2p7")).toBe("8K4M2P7")
  })
})
