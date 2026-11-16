import { describe, expect, it } from "vitest"
import { bucketsOf, paramsOf, periodFromParams, previousOf, rangeLabel, resolveCustom, resolvePreset, wibDay } from "../src/period"

// 14 Nov 2026 23:30 WIB = 16:30 UTC; 15 Nov 2026 00:30 WIB = 17:30 UTC (the WIB day turns before UTC does).
const NOW = Date.UTC(2026, 10, 14, 16, 30)
const AFTER_MIDNIGHT_WIB = Date.UTC(2026, 10, 14, 17, 30)

describe("period resolution (WIB)", () => {
  it("default 7 days = today and the 6 previous WIB days", () => {
    const p = periodFromParams({}, NOW)
    expect(p).toMatchObject({ preset: "7d", from: "2026-11-08", to: "2026-11-14", days: 7, granularity: "day" })
    expect(p.fromMs).toBe(Date.UTC(2026, 10, 7, 17))
    expect(p.toMs).toBe(Date.UTC(2026, 10, 14, 17))
    expect(rangeLabel(p)).toBe("8 – 14 Nov 2026")
  })
  it("today flips at WIB midnight, not UTC", () => {
    expect(wibDay(AFTER_MIDNIGHT_WIB)).toBe("2026-11-15")
    expect(resolvePreset("today", AFTER_MIDNIGHT_WIB)).toMatchObject({ from: "2026-11-15", to: "2026-11-15", granularity: "hour" })
  })
  it("presets", () => {
    expect(resolvePreset("yesterday", NOW)).toMatchObject({ from: "2026-11-13", to: "2026-11-13", days: 1 })
    expect(resolvePreset("this_month", NOW)).toMatchObject({ from: "2026-11-01", to: "2026-11-14" })
    expect(resolvePreset("last_month", NOW)).toMatchObject({ from: "2026-10-01", to: "2026-10-31", days: 31 })
    expect(resolvePreset("last_month", Date.UTC(2026, 0, 10))).toMatchObject({ from: "2025-12-01", to: "2025-12-31" })
    expect(resolvePreset("90d", NOW)).toMatchObject({ days: 90, granularity: "day" })
  })
  it("custom: swapped ends, future refused, max 180 days, week buckets beyond 92 days", () => {
    expect(resolveCustom("2026-11-14", "2026-11-08", NOW)).toMatchObject({ ok: true, period: { from: "2026-11-08", to: "2026-11-14" } })
    expect(resolveCustom("2026-11-10", "2026-11-15", NOW)).toMatchObject({ ok: false, error: "FUTURE" })
    expect(resolveCustom("2026-05-18", "2026-11-14", NOW)).toMatchObject({ ok: false, error: "TOO_LONG", message: "Maksimal 180 hari" })
    expect(resolveCustom("2026-05-19", "2026-11-14", NOW)).toMatchObject({ ok: true, period: { days: 180, granularity: "week" } })
    expect(resolveCustom("2026-02-30", "2026-03-01", NOW)).toMatchObject({ ok: false, error: "INVALID_DATE", message: "Tanggal tidak valid" })
  })
  it("URL state round-trips; invalid params fall back to the default", () => {
    const c = resolveCustom("2026-10-01", "2026-10-31", NOW)
    expect(c.ok && paramsOf(c.period)).toEqual({ dari: "2026-10-01", sampai: "2026-10-31" })
    expect(periodFromParams({ dari: "2026-10-01", sampai: "2026-10-31" }, NOW)).toMatchObject({ preset: null, days: 31 })
    expect(paramsOf(resolvePreset("this_month", NOW))).toEqual({ periode: "bulan-ini" })
    expect(periodFromParams({ periode: "bulan-ini" }, NOW).preset).toBe("this_month")
    expect(periodFromParams({ periode: "x", dari: "2030-01-01", sampai: "2030-01-02" }, NOW).preset).toBe("7d")
  })
  it("previous period of equal length and buckets", () => {
    const p = resolvePreset("7d", NOW)
    expect(previousOf(p)).toMatchObject({ from: "2026-11-01", to: "2026-11-07", days: 7 })
    expect(bucketsOf(p)).toHaveLength(7)
    expect(bucketsOf(resolvePreset("today", NOW))).toHaveLength(24)
    const long = resolveCustom("2026-06-01", "2026-11-14", NOW)
    expect(long.ok && bucketsOf(long.period)[0]).toBe("2026-06-01")
    expect(rangeLabel({ from: "2026-10-28", to: "2026-11-03" }, true)).toBe("28 Oktober sampai 3 November 2026")
  })
})
