// Layar Pelanggan synchronisation (TASK-701, Sol R1 F2/F5/F6). Pure helpers shared by `/kasir` (publisher) and
// `/kasir/layar-pelanggan` (display), unit-tested in `display-sync.test.ts`.

/** Same-PC hint channel. A message is only a "refresh now" signal; its contents are never displayed (F2). */
export const DISPLAY_CHANNEL = "gx-layar-pelanggan"
export type DisplayHint = { tenantSlug: string; pairId: string | null }

/** Whether a channel message asks this display to refresh: same gerai and, once the display knows its pairing, the
 *  same pairing. Anything else (another gerai, another member's pairing, junk) is ignored. */
export function isHintFor(msg: unknown, tenantSlug: string, pairId: string | null): boolean {
  if (!msg || typeof msg !== "object") return false
  const m = msg as Partial<DisplayHint>
  if (m.tenantSlug !== tenantSlug) return false
  return pairId === null || m.pairId === pairId
}

export interface Revision {
  pairId: string
  updatedAt: number
}

/** F5: a server view replaces the screen only when it is not older than what is shown for the same pairing. */
export function isNewer(shown: Revision | null, next: Revision): boolean {
  return !shown || shown.pairId !== next.pairId || next.updatedAt >= shown.updatedAt
}

/**
 * F5: serialised view fetching. One request at a time; a refresh asked for while one is in flight runs once after it;
 * a response older than the newest one already accepted is dropped.
 */
export function createViewSync<V extends Revision>(opts: { fetchView: () => Promise<V | null>; onView: (v: V) => void }) {
  let inFlight = false
  let again = false
  let stopped = false
  let shown: Revision | null = null
  async function refresh(): Promise<void> {
    if (stopped) return
    if (inFlight) {
      again = true
      return
    }
    inFlight = true
    try {
      const v = await opts.fetchView()
      if (!stopped && v && isNewer(shown, v)) {
        shown = { pairId: v.pairId, updatedAt: v.updatedAt }
        opts.onView(v)
      }
    } finally {
      inFlight = false
      if (again && !stopped) {
        again = false
        void refresh()
      }
    }
  }
  return {
    refresh,
    stop: () => {
      stopped = true
    },
  }
}

/** F6: delays between attempts of a failed state publication. */
export const RETRY_DELAYS_MS = [1500, 3000, 6000] as const

type Schedule = (fn: () => void, ms: number) => () => void
const timer: Schedule = (fn, ms) => {
  const id = setTimeout(fn, ms)
  return () => clearTimeout(id)
}

/** What the server said about one publication: applied, or dropped as stale; `seq` = the pairing's high-water mark. */
export type PublishResult = { applied: boolean; seq: number | null }

/**
 * The counter's state publisher (Sol R2-F1, R3-F1, R3-F2, R1 F6). `publish(input)` declares the counter's CURRENT input.
 *
 * - One send in flight. A newer input waits and goes next; an intermediate one is never sent after it is superseded.
 * - Dedup lives here (R3-F1): the current input is skipped only when the server is known to hold exactly it (`acked`)
 *   and nothing else is in flight. Every `publish()` cancels a pending retry, including a return to an earlier input. A
 *   transient failure makes the server's content unknown (`acked = null`), so returning to the earlier input sends it.
 * - Numbering: `seq = max(clock, last + 1, floor + 1)`; `floor()` is the pairing's stored mark from status/pair/state
 *   (R3-F2), so a remounted page or a slower clock still numbers above the server.
 * - `send` resolves `{ applied, seq }`, resolves `null` for a permanent refusal (not retried), and rejects on a
 *   transient failure: the input is retried after each of `delays` while it is still the current input.
 * - A `stale` answer proves something newer is stored, so it clears `acked` (R4-F1). For the input that is still current
 *   it lifts the numbering to the server's mark and sends it once more; a superseded input is dropped, never resent.
 */
export function createPublisher<T>(opts: {
  send: (input: T, seq: number) => Promise<PublishResult | null>
  keyOf: (input: T) => string
  floor?: () => number
  delays?: readonly number[]
  schedule?: Schedule
  clock?: () => number
}) {
  const delays = opts.delays ?? RETRY_DELAYS_MS
  const schedule = opts.schedule ?? timer
  const clock = opts.clock ?? Date.now
  const floor = opts.floor ?? (() => 0)
  let target: { key: string; input: T } | null = null
  let acked: string | null = null // the key the server is known to hold from this publisher
  let parked: string | null = null // the current key we stopped trying (refused, retries spent, stale twice)
  let rebased: string | null = null // the current key already resent once after a stale answer
  let inFlight = false
  let waiting = false
  let attempt = 0
  let cancelRetry: (() => void) | null = null
  let stopped = false
  let lastSeq = 0
  function pump() {
    if (stopped || inFlight || waiting || !target || target.key === acked || target.key === parked) return
    const { key, input } = target
    inFlight = true
    lastSeq = Math.max(clock(), lastSeq + 1, floor() + 1)
    const current = () => target?.key === key
    opts
      .send(input, lastSeq)
      .then(
        (r) => {
          attempt = 0
          if (!r) {
            if (current()) parked = key
            return
          }
          if (r.seq !== null) lastSeq = Math.max(lastSeq, r.seq)
          if (r.applied) {
            acked = key
            return
          }
          // Stale: something newer is stored (another tab or counter), so whatever we last acknowledged may be gone
          // (Sol R4-F1) — forget it before anything else. Only the still-current input earns one resend above the mark.
          acked = null
          if (!current()) return
          if (rebased === key) parked = key
          else rebased = key
        },
        () => {
          acked = null // the request may or may not have landed
          if (stopped || !current() || attempt >= delays.length) {
            if (current()) parked = key
            attempt = 0
            return
          }
          waiting = true
          cancelRetry = schedule(() => {
            cancelRetry = null
            waiting = false
            pump()
          }, delays[attempt++]!)
        },
      )
      .finally(() => {
        inFlight = false
        pump()
      })
  }
  return {
    publish(input: T) {
      if (stopped) return
      const key = opts.keyOf(input)
      cancelRetry?.()
      cancelRetry = null
      waiting = false
      attempt = 0
      parked = null
      if (target?.key !== key) rebased = null
      target = { key, input }
      pump()
    },
    stop() {
      stopped = true
      cancelRetry?.()
    },
  }
}
