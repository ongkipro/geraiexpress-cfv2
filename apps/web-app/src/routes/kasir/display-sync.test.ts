import { describe, expect, it } from "vitest"
import { createViewSync, isHintFor, isNewer, runWithRetry } from "./display-sync"

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

describe("runWithRetry (Sol R1 F6)", () => {
  it("retries a failed publication with the bounded delays, then stops", async () => {
    const waits: number[] = []
    const queue: Array<() => void> = []
    let n = 0
    runWithRetry(
      async () => {
        n++
        throw new Error("network")
      },
      [1500, 3000, 6000],
      (fn, ms) => {
        waits.push(ms)
        queue.push(fn)
        return () => undefined
      },
    )
    for (let i = 0; i < 5; i++) {
      await tick()
      queue.shift()?.()
    }
    await tick()
    expect(n).toBe(4) // first try + 3 retries
    expect(waits).toEqual([1500, 3000, 6000])
  })

  it("recovers on the next attempt and is cancellable", async () => {
    const queue: Array<() => void> = []
    let n = 0
    let sent = 0
    runWithRetry(
      async () => {
        n++
        if (n === 1) throw new Error("503")
        sent++
      },
      [1500],
      (fn) => (queue.push(fn), () => undefined),
    )
    await tick()
    queue.shift()!()
    await tick()
    expect(sent).toBe(1)

    let cleared = false
    const pending: Array<() => void> = []
    let tries = 0
    const cancel = runWithRetry(
      async () => {
        tries++
        throw new Error("x")
      },
      [1500, 3000],
      (fn) => (pending.push(fn), () => (cleared = true)),
    )
    await tick()
    cancel()
    expect(cleared).toBe(true)
    pending.shift()?.() // a timer that fired anyway does nothing after cancel
    await tick()
    expect(tries).toBe(1) // a timer that fires after cancel runs no attempt
    expect(pending).toHaveLength(0)
  })
})
