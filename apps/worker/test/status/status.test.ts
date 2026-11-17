// DEC-244 `Status Operasional`: the verdict separates setup from faults; the routes are owner-only (Kasir 403), the
// recheck is rate-limited, and the payload carries no money amounts or PII.
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { buildGeraiStatus, type StatusInputs } from "../../src/status/gerai"
import { ownerOnlyKeysIn } from "../../src/dto/projection"
import { appUser } from "../onboarding/helpers"
import { appGet, appPost, configureWebhook, seedConnected } from "../webhooks/helpers"
import "../../src/index"

const NOW = 1_800_000_000_000
const base: StatusInputs = {
  now: NOW,
  onboardingState: "connected",
  webhookState: "active",
  webhookLastEventAt: NOW - 60_000,
  health: { oldestInboxAgeMs: null, issues30m: 3, reconciliation30m: 0, failedStreak: false, financeLastOkAgeMs: 60_000, financeEverRan: true, connected: true, issuesLastHour: 1, issuesBaselineHourly: 1 },
  counts: { reconciliationNeeded: 0, unpaidHold: 0, failed24h: 0, discrepancies: 0, financeLastOkAt: NOW - 60_000, financeLastRunAt: NOW - 60_000, financeLastError: null, printFormat: "label_10x15_with_stub", outletReady: true, hasCoordinates: true },
  miniSiteHost: "sinarjaya.geraimitra.com",
  domains: [],
}

describe("buildGeraiStatus", () => {
  it("all green → healthy, icon count 0", () => {
    const s = buildGeraiStatus(base)
    expect(s.overall.tone).toBe("healthy")
    expect(s.icon).toEqual({ tone: "healthy", label: "Status operasional: Semua sinyal sehat", count: 0 })
    expect(s.signals.map((x) => x.state)).toEqual(["healthy", "healthy", "healthy", "healthy"])
  })
  it("an unfinished setup is `setup`, never a fault", () => {
    const s = buildGeraiStatus({ ...base, webhookState: "awaiting_seller_setup" })
    expect(s.overall.tone).toBe("setup")
    expect(s.setupSteps.find((x) => x.id === "webhook")!.done).toBe(false)
    expect(s.signals.find((x) => x.id === "webhook")!.state).toBe("unknown")
    const n = buildGeraiStatus({ ...base, onboardingState: "not_connected", webhookState: null, health: null })
    expect(n.overall.tone).toBe("setup")
    expect(n.signals.every((x) => x.state !== "degraded")).toBe(true)
  })
  it("faults win over setup: secret mismatch, unpaid hold, stale finance, broken domain", () => {
    expect(buildGeraiStatus({ ...base, webhookState: "secret_mismatch" }).overall.tone).toBe("problem")
    const hold = buildGeraiStatus({ ...base, counts: { ...base.counts!, unpaidHold: 2 } })
    expect(hold.overall.tone).toBe("problem")
    expect(hold.signals[0]).toMatchObject({ state: "degraded", actionTo: "/kiriman?tab=menunggu-saldo" })
    expect(buildGeraiStatus({ ...base, counts: { ...base.counts!, financeLastOkAt: NOW - 2 * 3600_000 } }).signals[2]!.state).toBe("degraded")
    const dom = buildGeraiStatus({ ...base, domains: [{ hostname: "kirim.toko.id", state: "moved", lastCheckedAt: NOW }] })
    expect(dom.icon).toMatchObject({ tone: "problem", count: 1 })
    expect(dom.signals[3]).toMatchObject({ state: "degraded", recheck: "domain_check" })
  })
})

describe("GET /status, POST /status/recheck", () => {
  it("owner gets the verdict; Kasir is refused; recheck answers the fresh view and is rate-limited", async () => {
    const o = await seedConnected("statuspemilik")
    const r = (await (await appGet("/status", o.cookie)).json()) as { data: ReturnType<typeof buildGeraiStatus> }
    expect(r.data.overall.tone).toBe("setup") // webhook not configured yet
    expect(r.data.setupSteps.map((x) => x.id)).toEqual(["mengantar", "profil", "webhook", "printer", "minisite"])
    expect(ownerOnlyKeysIn(r.data)).toEqual([])
    await configureWebhook(o.cookie)
    const k = await appUser("kasir.status@contoh.test")
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'cashier', 'active', ?)").bind(o.tenantId, k.id, Date.now()),
      env.DB.prepare("UPDATE sessions SET active_tenant_id = ? WHERE user_id = ?").bind(o.tenantId, k.id),
    ])
    expect((await appGet("/status", k.cookie)).status).toBe(403)
    expect((await appPost("/status/recheck", k.cookie, {})).status).toBe(403)
    const re = await appPost("/status/recheck", o.cookie, {})
    expect(re.status).toBe(200)
    expect(((await re.json()) as { data: { signals: unknown[] } }).data.signals).toHaveLength(4)
    for (let i = 0; i < 5; i++) await appPost("/status/recheck", o.cookie, {})
    const limited = await appPost("/status/recheck", o.cookie, {})
    expect(limited.status).toBe(429)
    expect(((await limited.json()) as { error: { code: string } }).error.code).toBe("RECHECK_RATE_LIMITED")
  })
})
