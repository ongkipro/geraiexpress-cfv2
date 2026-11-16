// Deferred cashback ledger states (spec 02 §2 instrument 4): PENDING at dispatch → RELEASED 24 h after `delivered`
// with no dispute → or CLAWBACK on RTS / cancellation. Integer IDR; a final state never changes.
export type CashbackState = "PENDING" | "RELEASED" | "CLAWBACK"
export type CashbackEvent = { kind: "delivered"; at: number } | { kind: "rts" } | { kind: "cancelled" } | { kind: "dispute_opened" } | { kind: "dispute_closed" } | { kind: "tick"; now: number }

export interface CashbackEntry {
  state: CashbackState
  amountIdr: number
  deliveredAt: number | null
  disputed: boolean
}

export const RELEASE_AFTER_MS = 24 * 3600_000

/** `floor(base × bps / 10000)` with integer guards. */
export function cashbackAmountIdr(baseIdr: number, bps: number): number {
  if (!Number.isSafeInteger(baseIdr) || baseIdr < 0) throw new RangeError("baseIdr must be a non-negative integer")
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 10_000) throw new RangeError("bps must be 0..10000")
  return Math.floor((baseIdr * bps) / 10_000)
}

export function applyCashbackEvent(e: CashbackEntry, ev: CashbackEvent): CashbackEntry {
  if (e.state !== "PENDING") return e
  switch (ev.kind) {
    case "delivered":
      return { ...e, deliveredAt: e.deliveredAt ?? ev.at }
    case "rts":
    case "cancelled":
      return { ...e, state: "CLAWBACK" }
    case "dispute_opened":
      return { ...e, disputed: true }
    case "dispute_closed":
      return { ...e, disputed: false }
    case "tick":
      return e.deliveredAt !== null && !e.disputed && ev.now - e.deliveredAt >= RELEASE_AFTER_MS ? { ...e, state: "RELEASED" } : e
  }
}
