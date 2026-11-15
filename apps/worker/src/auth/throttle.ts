// Fixed-window counters and locks in D1 (never KV: limits must be consistent). Keys are hashed by callers.
export interface ThrottleResult {
  allowed: boolean
  count: number
  retryAfterMs: number
}

/** Counts one event in a window; refuses when `limit` is exceeded or a lock is active. */
export async function hit(db: D1Database, key: string, limit: number, windowMs: number, now: number): Promise<ThrottleResult> {
  const row = await db
    .prepare(
      `INSERT INTO auth_throttle (key, count, window_started_at) VALUES (?1, 1, ?2)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN auth_throttle.window_started_at <= ?2 - ?3 THEN 1 ELSE auth_throttle.count + 1 END,
         window_started_at = CASE WHEN auth_throttle.window_started_at <= ?2 - ?3 THEN ?2 ELSE auth_throttle.window_started_at END
       RETURNING count, window_started_at, locked_until`,
    )
    .bind(key, now, windowMs)
    .first<{ count: number; window_started_at: number; locked_until: number | null }>()
  if (!row) return { allowed: false, count: 0, retryAfterMs: windowMs }
  if (row.locked_until && row.locked_until > now) return { allowed: false, count: row.count, retryAfterMs: row.locked_until - now }
  if (row.count > limit) return { allowed: false, count: row.count, retryAfterMs: row.window_started_at + windowMs - now }
  return { allowed: true, count: row.count, retryAfterMs: 0 }
}

export async function lockedUntil(db: D1Database, key: string, now: number): Promise<number | null> {
  const row = await db.prepare("SELECT locked_until FROM auth_throttle WHERE key = ?").bind(key).first<{ locked_until: number | null }>()
  return row?.locked_until && row.locked_until > now ? row.locked_until : null
}

export function lock(db: D1Database, key: string, until: number, now: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO auth_throttle (key, count, window_started_at, locked_until) VALUES (?1, 0, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET locked_until = ?3, count = 0, window_started_at = ?2`,
    )
    .bind(key, now, until)
}

export function clear(db: D1Database, key: string): D1PreparedStatement {
  return db.prepare("DELETE FROM auth_throttle WHERE key = ?").bind(key)
}
