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

type Outcome = "applied" | "fail" | "refused" | { stale: number }

/** A controllable `send`: every call is recorded with its seq and settled by the test; `server` mimics the DO gate. */
function harness(opts: { floor?: () => number; clock?: number; serverSeq?: number } = {}) {
  const sends: Array<{ input: string; seq: number; settle: (o: Outcome) => void }> = []
  const timers: Array<{ ms: number; fn: () => void; cleared: boolean }> = []
  let now = opts.clock ?? 1_000
  const pub = createPublisher<string>({
    keyOf: (x) => x,
    floor: opts.floor,
    send: (input, seq) =>
      new Promise((resolve, reject) =>
        sends.push({
          input,
          seq,
          settle: (o) => (o === "fail" ? reject(new Error("network")) : o === "refused" ? resolve(null) : o === "applied" ? resolve({ applied: true, seq }) : resolve({ applied: false, seq: o.stale })),
        }),
      ),
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
  return { pub, sends, timers, fire, inputs: () => sends.map((x) => x.input), setNow: (n: number) => (now = n) }
}

describe("createPublisher (Sol R2-F1, R3-F1, R3-F2, R1 F6)", () => {
  it("never has two sends in flight; inputs declared meanwhile coalesce to the newest; seq strictly increases", async () => {
    const h = harness()
    h.pub.publish("A")
    h.pub.publish("B")
    h.pub.publish("C")
    expect(h.inputs()).toEqual(["A"])
    h.sends[0]!.settle("applied")
    await tick()
    expect(h.inputs()).toEqual(["A", "C"])
    expect(h.sends[1]!.seq).toBeGreaterThan(h.sends[0]!.seq)
    h.setNow(500) // a clock that moves backwards never lowers seq
    h.sends[1]!.settle("applied")
    h.pub.publish("D")
    await tick()
    expect(h.sends[2]!.seq).toBeGreaterThan(h.sends[1]!.seq)
  })

  it("R3-F1: A applied → B fails → back to A before B's retry: the retry is cancelled, A is sent, B never again", async () => {
    const h = harness()
    h.pub.publish("A")
    h.sends[0]!.settle("applied")
    await tick()
    h.pub.publish("B")
    h.sends[1]!.settle("fail")
    await tick()
    const bRetry = h.timers.at(-1)!
    expect(bRetry.cleared).toBe(false)
    h.pub.publish("A") // back to A (B's outcome is unknown, so A is re-sent rather than skipped)
    expect(bRetry.cleared).toBe(true)
    await tick()
    expect(h.inputs()).toEqual(["A", "B", "A"])
    h.sends[2]!.settle("applied")
    await tick()
    bRetry.fn() // even a timer that fired anyway sends nothing for B
    for (let i = 0; i < 3; i++) h.fire()
    await tick()
    expect(h.inputs()).toEqual(["A", "B", "A"])
  })

  it("R3-F1: the current input is skipped only when the server holds it and nothing else is in flight", async () => {
    const h = harness()
    h.pub.publish("A")
    h.sends[0]!.settle("applied")
    await tick()
    h.pub.publish("A")
    await tick()
    expect(h.inputs()).toEqual(["A"]) // clean no-op
    h.pub.publish("B")
    h.pub.publish("A") // back to A while B is in flight: B lands, then A must follow
    expect(h.inputs()).toEqual(["A", "B"])
    h.sends[1]!.settle("applied")
    await tick()
    expect(h.inputs()).toEqual(["A", "B", "A"])
  })

  it("R4-F1: A applied → B in flight → back to A → B answers stale at 2000: A is sent again above 2000", async () => {
    const h = harness()
    h.pub.publish("A")
    h.sends[0]!.settle("applied") // acked = A at seq 1000
    await tick()
    h.pub.publish("B") // B in flight at 1001; meanwhile another tab stored C at 2000
    h.pub.publish("A") // back to A while B is in flight
    expect(h.inputs()).toEqual(["A", "B"])
    h.sends[1]!.settle({ stale: 2_000 })
    await tick()
    expect(h.inputs()).toEqual(["A", "B", "A"]) // the old acknowledgement of A no longer suppresses it
    expect(h.sends[2]!.seq).toBeGreaterThan(2_000)
    h.sends[2]!.settle("applied")
    await tick()
    h.pub.publish("A")
    await tick()
    expect(h.inputs()).toEqual(["A", "B", "A"]) // acknowledged again: a clean no-op
  })

  it("R3-F2: a fresh publisher with an earlier clock numbers above the pairing's stored mark (floor)", async () => {
    const h = harness({ clock: 1_000, floor: () => 2_000 })
    h.pub.publish("B")
    expect(h.sends[0]!.seq).toBe(2_001)
  })

  it("R3-F2: a stale answer for the current input lifts the numbering and resends once; it is then acknowledged", async () => {
    const h = harness({ clock: 1_000 }) // no floor known (e.g. status not loaded): the server answers stale
    h.pub.publish("B")
    h.sends[0]!.settle({ stale: 2_000 })
    await tick()
    expect(h.inputs()).toEqual(["B", "B"])
    expect(h.sends[1]!.seq).toBe(2_001)
    h.sends[1]!.settle("applied")
    await tick()
    h.pub.publish("B")
    await tick()
    expect(h.inputs()).toEqual(["B", "B"]) // not falsely acknowledged before, cleanly acknowledged now
  })

  it("R3-F2: a stale answer for a superseded input is dropped; a second stale for the current input stops (no loop)", async () => {
    const h = harness()
    h.pub.publish("A")
    h.pub.publish("B")
    h.sends[0]!.settle({ stale: 9_000 }) // A is no longer current: never republished
    await tick()
    expect(h.inputs()).toEqual(["A", "B"])
    expect(h.sends[1]!.seq).toBeGreaterThan(9_000)
    h.sends[1]!.settle({ stale: 50_000 })
    await tick()
    h.sends[2]!.settle({ stale: 60_000 })
    await tick()
    expect(h.inputs()).toEqual(["A", "B", "B"])
    h.pub.publish("B") // declaring it again (a real input change back) earns a fresh attempt
    await tick()
    expect(h.inputs()).toEqual(["A", "B", "B", "B"])
    expect(h.sends[3]!.seq).toBeGreaterThan(60_000)
  })

  it("F6: the current input is retried with the bounded delays, then given up; a permanent refusal is not retried", async () => {
    const h = harness()
    h.pub.publish("A")
    for (let i = 0; i < 4; i++) {
      h.sends[i]!.settle("fail")
      await tick()
      h.fire()
      await tick()
    }
    expect(h.inputs()).toEqual(["A", "A", "A", "A"])
    expect(h.timers.map((t) => t.ms)).toEqual([1500, 3000, 6000])
    expect(new Set(h.sends.map((x) => x.seq)).size).toBe(4)
    h.pub.publish("R")
    h.sends[4]!.settle("refused")
    await tick()
    expect(h.inputs()).toEqual(["A", "A", "A", "A", "R"])
    expect(h.timers).toHaveLength(3)
  })

  it("F6: recovers on a retry; stop() cancels a pending retry and a late timer sends nothing", async () => {
    const h = harness()
    h.pub.publish("A")
    h.sends[0]!.settle("fail")
    await tick()
    h.fire()
    await tick()
    h.sends[1]!.settle("applied")
    await tick()
    expect(h.inputs()).toEqual(["A", "A"])
    h.pub.publish("B")
    h.sends[2]!.settle("fail")
    await tick()
    h.pub.stop()
    expect(h.timers.at(-1)!.cleared).toBe(true)
    h.timers.at(-1)!.fn()
    await tick()
    expect(h.inputs()).toEqual(["A", "A", "B"])
  })
})
