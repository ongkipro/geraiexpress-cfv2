import { describe, expect, it } from "vitest"
import { createPublisher, createViewSync, isHintFor, isNewer } from "./display-sync"

const deferred = <T>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

describe("isHintFor (Sol R1 F2)", () => {
  it("accepts only the same gerai and, once known, the same pairing", () => {
    expect(isHintFor({ tenantSlug: "a", pairId: "p1" }, "a", "p1")).toBe(true)
    expect(isHintFor({ tenantSlug: "a", pairId: "p2" }, "a", "p1")).toBe(false) // another member's pairing
    expect(isHintFor({ tenantSlug: "b", pairId: "p1" }, "a", "p1")).toBe(false)
    expect(isHintFor({ tenantSlug: "a", pairId: "p2" }, "a", null)).toBe(true) // first view not loaded yet: refresh is harmless
    for (const junk of [null, "a", 1, { pairId: "p1" }]) expect(isHintFor(junk, "a", "p1")).toBe(false)
  })
})

describe("view ordering (Sol R1 F5)", () => {
  it("isNewer keeps the newest revision per pairing", () => {
    expect(isNewer(null, { pairId: "p", updatedAt: 1 })).toBe(true)
    expect(isNewer({ pairId: "p", updatedAt: 5 }, { pairId: "p", updatedAt: 4 })).toBe(false)
    expect(isNewer({ pairId: "p", updatedAt: 5 }, { pairId: "p", updatedAt: 5 })).toBe(true)
    expect(isNewer({ pairId: "p", updatedAt: 5 }, { pairId: "q", updatedAt: 1 })).toBe(true)
  })

  it("never overlaps fetches, runs one queued refresh, and drops an older response", async () => {
    const calls: Array<ReturnType<typeof deferred<{ pairId: string; updatedAt: number; s: string } | null>>> = []
    const shown: string[] = []
    const sync = createViewSync({
      fetchView: () => {
        const d = deferred<{ pairId: string; updatedAt: number; s: string } | null>()
        calls.push(d)
        return d.promise
      },
      onView: (v) => shown.push(v.s),
    })
    void sync.refresh()
    void sync.refresh()
    void sync.refresh()
    expect(calls).toHaveLength(1) // in flight: the others queue as one
    calls[0]!.resolve({ pairId: "p", updatedAt: 20, s: "paid" })
    await tick()
    expect(calls).toHaveLength(2)
    // The queued refresh answers with an older checkout (a delayed server read): it must not replace `paid`.
    calls[1]!.resolve({ pairId: "p", updatedAt: 10, s: "checkout-lama" })
    await tick()
    expect(shown).toEqual(["paid"])
    void sync.refresh()
    calls[2]!.resolve({ pairId: "p", updatedAt: 30, s: "idle" })
    await tick()
    expect(shown).toEqual(["paid", "idle"])
    sync.stop()
    void sync.refresh()
    expect(calls).toHaveLength(3)
  })
})

/** A controllable `send`: every call is recorded with its seq and settled by the test. */
function harness() {
  const sends: Array<{ input: string; seq: number; settle: (ok: boolean) => void }> = []
  const timers: Array<{ ms: number; fn: () => void; cleared: boolean }> = []
  let now = 1_000
  const pub = createPublisher<string>({
    send: (input, seq) =>
      new Promise<void>((resolve, reject) => sends.push({ input, seq, settle: (ok) => (ok ? resolve() : reject(new Error("network"))) })),
    delays: [1500, 3000, 6000],
    schedule: (fn, ms) => {
      const t = { ms, fn, cleared: false }
      timers.push(t)
      return () => (t.cleared = true)
    },
    clock: () => now,
  })
  const fire = () => {
    const t = timers.find((x) => !x.cleared)
    if (t) {
      t.cleared = true
      t.fn()
    }
  }
  return { pub, sends, timers, fire, setNow: (n: number) => (now = n) }
}

describe("createPublisher (Sol R2-F1, R1 F6)", () => {
  it("never has two publications in flight; inputs published meanwhile coalesce to the newest; seq strictly increases", async () => {
    const h = harness()
    h.pub.publish("A")
    h.pub.publish("B")
    h.pub.publish("C")
    expect(h.sends.map((x) => x.input)).toEqual(["A"]) // B and C wait; only the newest (C) will go
    h.sends[0]!.settle(true)
    await tick()
    expect(h.sends.map((x) => x.input)).toEqual(["A", "C"])
    expect(h.sends[1]!.seq).toBeGreaterThan(h.sends[0]!.seq) // clock unchanged: last + 1
    h.setNow(500) // a clock that moves backwards never lowers seq
    h.sends[1]!.settle(true)
    h.pub.publish("D")
    await tick()
    expect(h.sends[2]!.seq).toBeGreaterThan(h.sends[1]!.seq)
  })

  it("an older failed publication is not retried once a newer input exists (no stale rewrite)", async () => {
    const h = harness()
    h.pub.publish("A")
    h.pub.publish("B")
    h.sends[0]!.settle(false) // A fails while B is queued
    await tick()
    expect(h.sends.map((x) => x.input)).toEqual(["A", "B"])
    h.sends[1]!.settle(true)
    await tick()
    expect(h.timers).toHaveLength(0)
    expect(h.sends.map((x) => x.input)).toEqual(["A", "B"])
  })

  it("F6: the newest input is retried with the bounded delays, then given up", async () => {
    const h = harness()
    h.pub.publish("A")
    for (let i = 0; i < 4; i++) {
      h.sends[i]!.settle(false)
      await tick()
      h.fire()
      await tick()
    }
    expect(h.sends.map((x) => x.input)).toEqual(["A", "A", "A", "A"])
    expect(h.timers.map((t) => t.ms)).toEqual([1500, 3000, 6000])
    expect(new Set(h.sends.map((x) => x.seq)).size).toBe(4) // every retry is a new, higher publication
  })

  it("F6: recovers on a retry; a newer input or stop() cancels a pending retry", async () => {
    const h = harness()
    h.pub.publish("A")
    h.sends[0]!.settle(false)
    await tick()
    h.fire()
    await tick()
    h.sends[1]!.settle(true)
    await tick()
    expect(h.sends.map((x) => x.input)).toEqual(["A", "A"])

    h.pub.publish("B")
    h.sends[2]!.settle(false)
    await tick()
    expect(h.timers.at(-1)!.cleared).toBe(false)
    h.pub.publish("C") // supersedes B's retry
    expect(h.timers.at(-1)!.cleared).toBe(true)
    await tick()
    expect(h.sends.map((x) => x.input)).toEqual(["A", "A", "B", "C"])
    h.sends[3]!.settle(false)
    await tick()
    h.pub.stop()
    expect(h.timers.at(-1)!.cleared).toBe(true)
    h.timers.at(-1)!.fn() // a timer that fires anyway after stop sends nothing
    await tick()
    expect(h.sends).toHaveLength(4)
  })
})
