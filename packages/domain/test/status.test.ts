import { describe, expect, it } from "vitest"
import { combine, mapMengantarCategory, parseJakartaMinute, reduceCustody, reduceProvider, type CustodyStage, type ProviderObservation, type ProviderStatus } from "../src/status"

const at = (hhmmss: string) => Date.parse(`2026-11-15T${hhmmss}+07:00`)
const fold = (obs: ProviderObservation[]) => obs.reduce<ProviderObservation | null>((c, o) => reduceProvider(c, o), null)

describe("status ordering rule (spec 01 §3)", () => {
  it("webhook in_transit 10:15:40 vs poll rts_in_transit 10:15 → rts_in_transit, both orders", () => {
    const a = { status: "in_transit" as const, eventAt: at("10:15:40") }
    const b = { status: "rts_in_transit" as const, eventAt: parseJakartaMinute("15-11-2026 10:15")! }
    expect(fold([a, b])!.status).toBe("rts_in_transit")
    expect(fold([b, a])!.status).toBe("rts_in_transit")
  })
  it("local handover then a later provider ready_for_pickup → handed_to_courier", () => {
    const p = fold([{ status: "ready_for_pickup", eventAt: at("11:00:00") }])
    expect(combine(p!.status, "handed_to_courier")).toEqual({ status: "handed_to_courier", conflict: false })
  })
  it("Meja Retur intake then a later provider in_transit → rts_at_gerai", () => {
    expect(combine("in_transit", "rts_at_gerai")).toEqual({ status: "rts_at_gerai", conflict: false })
  })
  it("verified handback then provider delivered → rts_returned_to_sender + conflict", () => {
    expect(combine("delivered", "rts_returned_to_sender")).toEqual({ status: "rts_returned_to_sender", conflict: true })
  })
  it("read-back-confirmed local cancel → cancelled; conflict when provider moved on", () => {
    expect(combine(null, "cancelled_local")).toEqual({ status: "cancelled", conflict: false })
    expect(combine("in_transit", "cancelled_local")).toEqual({ status: "cancelled", conflict: true })
    // Mengantar confirming the cancellation agrees with the counter: no conflict (final Carbon pass, M2B #1).
    expect(combine("cancelled", "cancelled_local")).toEqual({ status: "cancelled", conflict: false })
  })
  it("terminal never regresses; a later non-terminal is ignored", () => {
    expect(fold([{ status: "delivered", eventAt: at("09:00:00") }, { status: "in_transit", eventAt: at("12:00:00") }])!.status).toBe("delivered")
  })
  it("custody is monotone", () => {
    expect(reduceCustody("rts_at_gerai", "handed_to_courier")).toBe("rts_at_gerai")
    expect(reduceCustody("handed_to_courier", "rts_returned_to_sender")).toBe("rts_returned_to_sender")
  })
  it("property: 30,000 random permutations give one effective status per observation set", () => {
    const statuses: ProviderStatus[] = ["ready_for_pickup", "in_transit", "undelivery_hold", "rts_in_transit", "provider_returned", "cancelled", "lost", "delivered"]
    const custody: CustodyStage[] = ["none", "handed_to_courier", "rts_at_gerai", "rts_returned_to_sender", "cancelled_local"]
    const r = new Uint32Array(16)
    for (let n = 0; n < 6_000; n++) {
      crypto.getRandomValues(r)
      const count = 1 + (r[0]! % 6)
      const obs: ProviderObservation[] = Array.from({ length: count }, (_, i) => ({ status: statuses[r[i + 1]! % statuses.length]!, eventAt: at("10:00:00") + (r[i + 7]! % 600) * 1000 }))
      const cust: CustodyStage[] = Array.from({ length: r[13]! % 3 }, (_, i) => custody[r[14 + (i % 2)]! % custody.length]!)
      const results = new Set<string>()
      for (let p = 0; p < 5; p++) {
        const order = [...obs].sort(() => (crypto.getRandomValues(new Uint8Array(1))[0]! & 1 ? 1 : -1))
        const corder = [...cust].reverse()
        const prov = fold(order)
        const c = (p % 2 ? corder : cust).reduce<CustodyStage>((a, b) => reduceCustody(a, b), "none")
        const out = combine(prov?.status ?? null, c)
        results.add(`${out.status}|${out.conflict}`)
      }
      expect(results.size, JSON.stringify({ obs, cust })).toBe(1)
    }
  })
})

describe("Mengantar mapping and dates", () => {
  it("handles both cancellation spellings and unknown categories", () => {
    expect(mapMengantarCategory("CANCELED")).toBe("cancelled")
    expect(mapMengantarCategory("cancelled")).toBe("cancelled")
    expect(mapMengantarCategory("DELIVERED")).toBe("delivered")
    expect(mapMengantarCategory("SOMETHING NEW")).toBeNull()
  })
  it("parses DD-MM-YYYY HH:mm in Asia/Jakarta", () => {
    expect(parseJakartaMinute("15-11-2026 10:15")).toBe(Date.parse("2026-11-15T03:15:00Z"))
    expect(parseJakartaMinute("31-02-2026 10:15")).toBeNull()
    expect(parseJakartaMinute("2026-11-15 10:15")).toBeNull()
  })
})
