import { describe, expect, it } from "vitest"
import { applyCashbackEvent, cashbackAmountIdr, parseDiscountBand, verificationCheckAt, type CashbackEntry } from "../src"

const t0 = Date.parse("2026-11-16T09:00:00+07:00")

describe("verification schedule and band (spec 02 §2.1; the state table is tested in money.test.ts)", () => {
  it("checks at +15/+60/+120 min, then daily", () => {
    expect([0, 1, 2, 3, 4].map((s) => (verificationCheckAt(t0, s) - t0) / 60_000)).toEqual([15, 60, 120, 120 + 1440, 120 + 2880])
  })
  it("a band needs min <= default <= max within 0..10000", () => {
    expect(parseDiscountBand({ defaultBps: 2000, minBps: 2000, maxBps: 3500 })).toEqual({ defaultBps: 2000, minBps: 2000, maxBps: 3500 })
    expect(parseDiscountBand({ defaultBps: 1500, minBps: 2000, maxBps: 3000 })).toBeNull()
    expect(parseDiscountBand({ defaultBps: 2000, minBps: 2000, maxBps: 10001 })).toBeNull()
    expect(parseDiscountBand({ defaultBps: "2000", minBps: 2000, maxBps: 3000 })).toBeNull()
  })
})

describe("cashback ledger states", () => {
  const pending: CashbackEntry = { state: "PENDING", amountIdr: cashbackAmountIdr(12000, 250), deliveredAt: null, disputed: false }
  it("amount is floor(base × bps / 10000)", () => {
    expect(pending.amountIdr).toBe(300)
    expect(cashbackAmountIdr(9999, 1)).toBe(0)
    expect(() => cashbackAmountIdr(-1, 100)).toThrow()
  })
  it("RELEASED 24 h after delivered without a dispute; dispute holds it", () => {
    const d = applyCashbackEvent(pending, { kind: "delivered", at: t0 })
    expect(applyCashbackEvent(d, { kind: "tick", now: t0 + 23 * 3600_000 }).state).toBe("PENDING")
    expect(applyCashbackEvent(d, { kind: "tick", now: t0 + 24 * 3600_000 }).state).toBe("RELEASED")
    const disputed = applyCashbackEvent(d, { kind: "dispute_opened" })
    expect(applyCashbackEvent(disputed, { kind: "tick", now: t0 + 48 * 3600_000 }).state).toBe("PENDING")
    expect(applyCashbackEvent(applyCashbackEvent(disputed, { kind: "dispute_closed" }), { kind: "tick", now: t0 + 48 * 3600_000 }).state).toBe("RELEASED")
  })
  it("CLAWBACK on RTS or cancel; final states never change", () => {
    expect(applyCashbackEvent(pending, { kind: "rts" }).state).toBe("CLAWBACK")
    expect(applyCashbackEvent(pending, { kind: "cancelled" }).state).toBe("CLAWBACK")
    const released: CashbackEntry = { ...pending, state: "RELEASED" }
    expect(applyCashbackEvent(released, { kind: "rts" }).state).toBe("RELEASED")
  })
})
