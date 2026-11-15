import { DurableObject } from "cloudflare:workers"

// Global Partner API quota (TASK-202, spec 10 §4.2 item 4): Mengantar counts per partner, not per server — 60 requests
// per fixed minute and 1,000 seller registrations per day (reset at midnight WIB). One instance ("global") is the
// single writer; a reservation is taken BEFORE the call so concurrent Workers can never exceed the limits.
export const PER_MINUTE = 60
export const REGISTRATIONS_PER_DAY = 1000
const WIB_OFFSET_MS = 7 * 3600_000

export type QuotaDecision = { ok: true } | { ok: false; reason: "minute" | "day"; retryAfterSeconds: number }

export function wibDay(nowMs: number): string {
  return new Date(nowMs + WIB_OFFSET_MS).toISOString().slice(0, 10)
}

export class PartnerQuotaDO extends DurableObject<Env> {
  private ensure() {
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS quota (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL)")
  }

  /** Reserves one request (and one registration when `register`). Rejected reservations consume nothing. */
  async reserve(kind: "call" | "register", nowMs: number = Date.now(), limits = { perMinute: PER_MINUTE, perDay: REGISTRATIONS_PER_DAY }): Promise<QuotaDecision> {
    this.ensure()
    const minute = `m:${Math.floor(nowMs / 60_000)}`
    const day = `d:${wibDay(nowMs)}`
    return this.ctx.storage.transactionSync(() => {
      const get = (b: string) => this.ctx.storage.sql.exec<{ count: number }>("SELECT count FROM quota WHERE bucket = ?", b).toArray()[0]?.count ?? 0
      if (get(minute) >= limits.perMinute) return { ok: false as const, reason: "minute" as const, retryAfterSeconds: 60 - Math.floor((nowMs % 60_000) / 1000) }
      if (kind === "register" && get(day) >= limits.perDay) {
        const nextWibMidnight = Date.parse(`${wibDay(nowMs)}T00:00:00.000+07:00`) + 24 * 3600_000
        return { ok: false as const, reason: "day" as const, retryAfterSeconds: Math.ceil((nextWibMidnight - nowMs) / 1000) }
      }
      const bump = (b: string) => this.ctx.storage.sql.exec("INSERT INTO quota (bucket, count) VALUES (?, 1) ON CONFLICT(bucket) DO UPDATE SET count = count + 1", b)
      bump(minute)
      if (kind === "register") bump(day)
      // Keep the table small: drop minute buckets older than 10 minutes and day buckets older than 3 days.
      this.ctx.storage.sql.exec("DELETE FROM quota WHERE (bucket LIKE 'm:%' AND CAST(substr(bucket, 3) AS INTEGER) < ?)", Math.floor(nowMs / 60_000) - 10)
      return { ok: true as const }
    })
  }

  /** A registration that Mengantar refused (4xx before creation) gives its daily unit back. */
  async releaseRegistration(nowMs: number = Date.now()): Promise<void> {
    this.ensure()
    this.ctx.storage.sql.exec("UPDATE quota SET count = MAX(0, count - 1) WHERE bucket = ?", `d:${wibDay(nowMs)}`)
  }

  async usage(nowMs: number = Date.now()): Promise<{ minute: number; day: number }> {
    this.ensure()
    const get = (b: string) => this.ctx.storage.sql.exec<{ count: number }>("SELECT count FROM quota WHERE bucket = ?", b).toArray()[0]?.count ?? 0
    return { minute: get(`m:${Math.floor(nowMs / 60_000)}`), day: get(`d:${wibDay(nowMs)}`) }
  }
}

export const quotaFor = (env: Pick<Env, "PARTNER_QUOTA">) => env.PARTNER_QUOTA.getByName("global", { locationHint: "apac" })
