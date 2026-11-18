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

/**
 * F6: runs `task`; on failure retries after each delay in turn while not cancelled. Returns the cancel function (call it
 * when the input or pairing changes, or on unmount). `schedule` is injectable for tests.
 */
export function runWithRetry(
  task: () => Promise<void>,
  delays: readonly number[] = RETRY_DELAYS_MS,
  schedule: (fn: () => void, ms: number) => () => void = (fn, ms) => {
    const id = setTimeout(fn, ms)
    return () => clearTimeout(id)
  },
): () => void {
  let cancelled = false
  let clear: (() => void) | null = null
  const attempt = (n: number) => {
    task().catch(() => {
      if (cancelled || n >= delays.length) return
      clear = schedule(() => !cancelled && attempt(n + 1), delays[n]!)
    })
  }
  attempt(0)
  return () => {
    cancelled = true
    clear?.()
  }
}
