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

/**
 * The counter's state publisher (Sol R2-F1 + R1 F6). One publication in flight at a time; inputs published meanwhile
 * coalesce to the newest, which goes next. Every send carries a strictly increasing `seq` (`max(clock, last + 1)`), which
 * the tenant object uses to drop an older write that arrives late. `send` resolves on success or on a permanent refusal
 * and rejects on a transient failure: that input is retried after each of `delays` while nothing newer was published
 * (a newer input or `stop()` cancels the retry). `schedule` and `clock` are injectable for tests.
 */
export function createPublisher<T>(opts: { send: (input: T, seq: number) => Promise<void>; delays?: readonly number[]; schedule?: Schedule; clock?: () => number }) {
  const delays = opts.delays ?? RETRY_DELAYS_MS
  const schedule = opts.schedule ?? timer
  const clock = opts.clock ?? Date.now
  let inFlight = false
  let next: { input: T } | null = null
  let attempt = 0
  let cancelRetry: (() => void) | null = null
  let stopped = false
  let lastSeq = 0
  function pump() {
    if (stopped || inFlight || !next) return
    const { input } = next
    next = null
    inFlight = true
    lastSeq = Math.max(clock(), lastSeq + 1)
    opts
      .send(input, lastSeq)
      .then(
        () => {
          attempt = 0
        },
        () => {
          if (stopped || next || attempt >= delays.length) {
            attempt = 0
            return
          }
          cancelRetry = schedule(() => {
            cancelRetry = null
            if (!stopped && !next) {
              next = { input }
              pump()
            }
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
      cancelRetry?.()
      cancelRetry = null
      attempt = 0
      next = { input }
      pump()
    },
    stop() {
      stopped = true
      cancelRetry?.()
    },
  }
}
