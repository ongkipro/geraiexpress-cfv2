import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { wibDay } from "../../src/do/partner-quota"

const quota = (name: string) => env.PARTNER_QUOTA.getByName(name)

describe("PartnerQuotaDO (spec 10 §4.2 item 4)", () => {
  it("60 calls per fixed minute; the 61st is refused with Retry-After; the next minute opens", async () => {
    const q = quota("q-minute")
    const t = Date.UTC(2026, 10, 16, 3, 0, 10)
    for (let i = 0; i < 60; i++) expect(await q.reserve("call", t)).toEqual({ ok: true })
    expect(await q.reserve("call", t + 1000)).toEqual({ ok: false, reason: "minute", retryAfterSeconds: 49 })
    expect(await q.reserve("call", t + 50_000)).toEqual({ ok: true })
  })

  it("1,000 registrations per WIB day; resets at midnight WIB, not UTC", async () => {
    const q = quota("q-day")
    const limits = { perMinute: 10_000, perDay: 1000 }
    const t = Date.parse("2026-11-16T16:00:00.000Z") // 23:00 WIB
    for (let i = 0; i < 1000; i++) {
      const r = await q.reserve("register", t + i, limits)
      if (!r.ok) throw new Error(`refused at ${i}`)
    }
    const refused = await q.reserve("register", t + 2000, limits)
    expect(refused).toMatchObject({ ok: false, reason: "day" })
    expect((refused as { retryAfterSeconds: number }).retryAfterSeconds).toBe(3598)
    // A call (non-registration) is still allowed.
    expect(await q.reserve("call", t + 2000, limits)).toEqual({ ok: true })
    // 00:00:01 WIB next day.
    expect(await q.reserve("register", Date.parse("2026-11-16T17:00:01.000Z"), limits)).toEqual({ ok: true })
    expect(wibDay(Date.parse("2026-11-16T17:00:01.000Z"))).toBe("2026-11-17")
  }, 60_000)

  it("a refused registration can give its daily unit back", async () => {
    const q = quota("q-release")
    const t = Date.UTC(2026, 10, 16, 3, 0, 0)
    await q.reserve("register", t)
    expect((await q.usage(t)).day).toBe(1)
    await q.releaseRegistration(t)
    expect((await q.usage(t)).day).toBe(0)
  })
})
