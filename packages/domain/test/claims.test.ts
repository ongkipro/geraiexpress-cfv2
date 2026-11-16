import { describe, expect, it } from "vitest"
import { claimDeadline, countdown, stuckBand } from "../src/claims"

const T = Date.UTC(2026, 10, 10, 3, 0)
const H = 3600_000

describe("claim deadlines (Mengantar help 8140017)", () => {
  it("J&T: lost 3×24 h from the lost status; damage 5 days from the last status; contents 30 days", () => {
    expect(claimDeadline("JT", "hilang", { lastStatusAt: T - 10 * H, lostAt: T, pickedUpAt: null, deliveredOrRtsAt: null })).toBe(T + 72 * H)
    expect(claimDeadline("JT", "rusak", { lastStatusAt: T, lostAt: null, pickedUpAt: null, deliveredOrRtsAt: null })).toBe(T + 5 * 24 * H)
    expect(claimDeadline("JT", "isi_kurang", { lastStatusAt: T, lostAt: null, pickedUpAt: null, deliveredOrRtsAt: T })).toBe(T + 30 * 24 * H)
  })
  it("SiCepat lost 14 days; SAP and Lion lost windows run from pickup; unknown courier or anchor → null", () => {
    expect(claimDeadline("SiCepat", "hilang", { lastStatusAt: null, lostAt: T, pickedUpAt: null, deliveredOrRtsAt: null })).toBe(T + 14 * 24 * H)
    expect(claimDeadline("Sap", "hilang", { lastStatusAt: T, lostAt: T, pickedUpAt: T - 24 * H, deliveredOrRtsAt: null })).toBe(T - 24 * H + 60 * 24 * H)
    expect(claimDeadline("lion", "hilang", { lastStatusAt: T, lostAt: T, pickedUpAt: null, deliveredOrRtsAt: null })).toBeNull()
    expect(claimDeadline("ninja", "hilang", { lastStatusAt: T, lostAt: T, pickedUpAt: T, deliveredOrRtsAt: T })).toBeNull()
  })
  it("countdown chips and stuck bands", () => {
    expect(countdown(T + 18 * H, T)).toEqual({ label: "sisa 18 jam", tone: "danger", expired: false })
    expect(countdown(T + 30 * H, T)).toEqual({ label: "sisa 30 jam", tone: "warn", expired: false })
    expect(countdown(T + 5 * 24 * H, T)).toEqual({ label: "sisa 5 hari", tone: "safe", expired: false })
    expect(countdown(T - 1, T)).toMatchObject({ label: "Kedaluwarsa", expired: true })
    expect(countdown(null, T).label).toBe("Batas tidak diketahui")
    expect(stuckBand(T - 47 * H, T)).toBeNull()
    expect(stuckBand(T - 49 * H, T)).toBe("48j-4h")
    expect(stuckBand(T - 6 * 24 * H, T)).toBe("5-14h")
    expect(stuckBand(T - 20 * 24 * H, T)).toBe("15-30h")
    expect(stuckBand(T - 31 * 24 * H, T)).toBe(">30h")
  })
})
