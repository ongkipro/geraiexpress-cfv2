import { describe, expect, it } from "vitest"
import { cleanText, normalizePhone08, riskBadge, validStreet, waNumber } from "../src/contacts"

describe("contacts", () => {
  it("normalises Indonesian mobile numbers to 08…", () => {
    for (const x of ["+62 812-3456-7890", "62812 3456 7890", "0812-3456-7890", "8123456 7890"]) expect(normalizePhone08(x)).toBe("081234567890")
    for (const x of ["021-5551234", "+1 202 555 0100", "0812", "08ab12345678", null]) expect(normalizePhone08(x)).toBeNull()
    expect(waNumber("081234567890")).toBe("6281234567890")
  })
  it("street needs ≥ 2 words, no URLs or markup", () => {
    expect(validStreet("Jl. Dago Asri No. 14")).toBe("Jl. Dago Asri No. 14")
    expect(validStreet("Dago")).toBeNull()
    expect(validStreet("Jl. <b>Dago</b> 1")).toBeNull()
    expect(validStreet("lihat https://x.y untuk alamat")).toBeNull()
    expect(cleanText("  Rina   Kartika ", 60)).toBe("Rina Kartika")
    expect(cleanText("<script>", 60)).toBeNull()
  })
  it("risk badge thresholds", () => {
    expect(riskBadge(0, 0)).toEqual({ badge: "baru", rtsBps: null })
    expect(riskBadge(6, 0)).toEqual({ badge: "hijau", rtsBps: 0 })
    expect(riskBadge(4, 1)).toEqual({ badge: "hijau", rtsBps: 2000 })
    expect(riskBadge(3, 2)).toEqual({ badge: "kuning", rtsBps: 4000 })
    expect(riskBadge(1, 2)).toEqual({ badge: "merah", rtsBps: 6666 })
  })
})
