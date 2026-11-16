// TASK-602 operator checks (OBSERVABILITY.md): each alert fires on a synthetic breach and stays quiet just below its
// threshold; the Public API hook counts outcomes without a key and alerts on IP_NOT_ALLOWED; the drill endpoint
// sends one message per alert key.
import { env, exports } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import type { HealthSnapshot } from "../../src/do/gerai-vault"
import { discountOverdue, emailFailureRate, financeSyncAge, issueHealth, issueVolumeSpike, publicApiAuthSpike, relayDown, webhookInboxAge } from "../../src/telemetry/checks"
import { ALERT_KEYS } from "../../src/ops/alert-drill"
import { publicClient, routeLabel } from "../../src/mengantar/factory"
import { mockFaults, resetMock } from "../../src/mengantar/mock"
import { checkoutGerai } from "../dispatch/helpers"

const NOW = 2_100_000_000_000
const base: HealthSnapshot = { oldestInboxAgeMs: null, issues30m: 0, reconciliation30m: 0, failedStreak: false, financeLastOkAgeMs: 1000, financeEverRan: true, connected: true, issuesLastHour: 0, issuesBaselineHourly: 0 }
const ctx = (snaps: Array<Partial<HealthSnapshot>>, fetchImpl: typeof fetch = fetch) => ({ snapshots: async () => snaps.map((s, i) => ({ tenantId: `t${i}`, s: { ...base, ...s } })), fetchImpl })
const e = { DB: env.DB, GX_ENV: "staging" as const }

beforeEach(() => resetMock())

describe("operator checks fire on a synthetic breach (TASK-602)", () => {
  it("issue health: reconciliation > 2 % of ≥ 10 issues; failed streak", async () => {
    expect(await issueHealth(e, NOW, ctx([{ issues30m: 100, reconciliation30m: 2 }]))).toBeNull()
    expect((await issueHealth(e, NOW, ctx([{ issues30m: 100, reconciliation30m: 3 }])))!.key).toBe("issue_reconciliation_rate")
    expect((await issueHealth(e, NOW, ctx([{ failedStreak: true }])))!.key).toBe("issue_failed_streak")
    // Separate checks: a streak at one gerai never hides a reconciliation storm elsewhere.
    const { issueReconciliationRate } = await import("../../src/telemetry/checks")
    expect((await issueReconciliationRate(e, NOW, ctx([{ failedStreak: true }, { issues30m: 100, reconciliation30m: 10 }])))!.key).toBe("issue_reconciliation_rate")
  })

  it("webhook inbox older than 15 min; finance sync older than 60 min (connected, ran before)", async () => {
    expect(await webhookInboxAge(e, NOW, ctx([{ oldestInboxAgeMs: 15 * 60_000 }]))).toBeNull()
    expect((await webhookInboxAge(e, NOW, ctx([{ oldestInboxAgeMs: 15 * 60_000 + 1 }])))!.key).toBe("webhook_inbox_age")
    expect(await financeSyncAge(e, NOW, ctx([{ financeLastOkAgeMs: 60 * 60_000 }]))).toBeNull()
    expect(await financeSyncAge(e, NOW, ctx([{ financeLastOkAgeMs: 2 * 3600_000, connected: false }]))).toBeNull()
    // Connected but never synced (measured from connection time) also alerts once 60 min passed.
    expect((await financeSyncAge(e, NOW, ctx([{ financeLastOkAgeMs: 61 * 60_000, financeEverRan: false }])))!.key).toBe("finance_sync_age")
    expect((await financeSyncAge(e, NOW, ctx([{ financeLastOkAgeMs: 60 * 60_000 + 1 }])))!.key).toBe("finance_sync_age")
  })

  it("issue volume > 3× baseline (floor 20/h); Public API 401/403 spike ≥ 5 per tenant per hour", async () => {
    expect(await issueVolumeSpike(e, NOW, ctx([{ issuesLastHour: 30, issuesBaselineHourly: 10 }]))).toBeNull()
    expect((await issueVolumeSpike(e, NOW, ctx([{ issuesLastHour: 31, issuesBaselineHourly: 10 }])))!.key).toBe("public_api_issue_volume_spike")
    const m = Math.floor(NOW / 60_000)
    await env.DB.prepare("INSERT INTO public_api_events (tenant_id, minute, outcome, route, count) VALUES ('spike-t', ?, 'unauthorized', '/order', 4)").bind(m - 10).run()
    expect(await publicApiAuthSpike(e, NOW, ctx([]))).toBeNull()
    await env.DB.prepare("INSERT INTO public_api_events (tenant_id, minute, outcome, route, count) VALUES ('spike-t', ?, 'forbidden', '/order', 1)").bind(m - 5).run()
    expect((await publicApiAuthSpike(e, NOW, ctx([])))!.key).toBe("public_api_auth_spike")
  })

  it("relay down ≥ 5 minutes (two checks), cleared when reachable", async () => {
    const relayEnv = { ...e, PARTNER_RELAY_URL: "https://relay.test", PARTNER_TRANSPORT: "relay" as const }
    const down = async () => new Response("no", { status: 502 })
    const up = async () => new Response('{"ok":true}')
    await env.DB.prepare("DELETE FROM alert_state WHERE alert_key = 'relay_down_since'").run()
    expect(await relayDown(relayEnv, NOW, ctx([], down))).toBeNull()
    expect(await relayDown(relayEnv, NOW + 4 * 60_000, ctx([], down))).toBeNull()
    expect((await relayDown(relayEnv, NOW + 5 * 60_000, ctx([], down)))!.key).toBe("relay_down")
    expect(await relayDown(relayEnv, NOW + 6 * 60_000, ctx([], up))).toBeNull()
    expect(await relayDown(relayEnv, NOW + 7 * 60_000, ctx([], down))).toBeNull()
  })

  it("email failure > 5 % of ≥ 20 per hour; discount rules past 2 × SLA", async () => {
    const t = NOW - 10 * 60_000
    const ins = (i: number, state: string) => env.DB.prepare("INSERT INTO email_outbox (id, template_id, to_email_hash, state, attempts, next_attempt_at, expires_at, created_at) VALUES (?, 'signup_otp', 'h', ?, 1, 0, ?, ?)").bind(`drill-mail-${i}`, state, NOW + 1, t)
    await env.DB.batch([...Array.from({ length: 19 }, (_, i) => ins(i, "sent")), ins(19, "failed")])
    expect(await emailFailureRate(e, NOW, ctx([]))).toBeNull() // 1/20 = 5 %, not above
    await env.DB.batch([ins(20, "expired")])
    expect((await emailFailureRate(e, NOW, ctx([])))!.key).toBe("email_failure_rate")
    await env.DB.prepare("DELETE FROM email_outbox WHERE id LIKE 'drill-mail-%'").run()
    // Hard bounces per day: > 5 % of sent + bounced (min 20) alerts.
    const { emailBounceRate } = await import("../../src/telemetry/checks")
    const ins2 = (i: number, state: string, code: string | null) => env.DB.prepare("INSERT INTO email_outbox (id, template_id, to_email_hash, state, attempts, next_attempt_at, expires_at, created_at, last_error_code) VALUES (?, 'signup_otp', 'h', ?, 1, 0, ?, ?, ?)").bind(`drill-b-${i}`, state, NOW + 1, t, code)
    await env.DB.batch([...Array.from({ length: 19 }, (_, i) => ins2(i, "sent", null)), ins2(19, "suppressed", "E_DELIVERY_FAILED")])
    expect(await emailBounceRate(e, NOW, ctx([]))).toBeNull()
    await env.DB.batch([ins2(20, "suppressed", "E_DELIVERY_FAILED")])
    expect((await emailBounceRate(e, NOW, ctx([])))!.key).toBe("email_bounce_rate")
    await env.DB.prepare("DELETE FROM email_outbox WHERE id LIKE 'drill-b-%'").run()

    const g = await checkoutGerai("alertdiskon")
    await env.DB.prepare("UPDATE tenant_discount_rules SET verification_state = 'sesuai' WHERE verification_state = 'belum_diterapkan'").run()
    expect(await discountOverdue(e, NOW, ctx([]))).toBeNull()
    await env.DB.prepare("UPDATE tenant_discount_rules SET verification_state = 'belum_diterapkan', requested_at = ? WHERE tenant_id = ? AND service_code = (SELECT MIN(service_code) FROM tenant_discount_rules WHERE tenant_id = ?)").bind(NOW - 121 * 60_000, g.tenantId, g.tenantId).run()
    expect((await discountOverdue(e, NOW, ctx([])))!.key).toBe("discount_overdue")
  })

  it("Public API hook: counts per tenant/minute/outcome/route without the key; IP_NOT_ALLOWED alerts at once", async () => {
    expect(routeLabel("https://x.test/api/public/SECRETKEY123/order/estimate?a=1")).toBe("/order/estimate")
    const g = await checkoutGerai("alertpublik")
    await env.DB.prepare("DELETE FROM alert_state WHERE alert_key = 'public_api_ip_not_allowed'").run()
    await publicClient(env, "SECRETKEY123", g.tenantId).searchArea("tebet")
    mockFaults.publicIpNotAllowed = true
    await expect(publicClient(env, "SECRETKEY123", g.tenantId).searchArea("tebet")).rejects.toThrow()
    const rows = await env.DB.prepare("SELECT outcome, route, count FROM public_api_events WHERE tenant_id = ? ORDER BY outcome").bind(g.tenantId).all<{ outcome: string; route: string; count: number }>()
    expect(rows.results).toEqual([{ outcome: "ip_not_allowed", route: "/address/search", count: 1 }, { outcome: "ok", route: "/address/search", count: 1 }])
    expect(JSON.stringify(rows.results)).not.toContain("SECRETKEY123")
    expect(await env.DB.prepare("SELECT count FROM alert_state WHERE alert_key = 'public_api_ip_not_allowed'").first()).toEqual({ count: 1 })
  })

  it("health snapshot from a real object; drill endpoint sends one message per alert key", async () => {
    const g = await checkoutGerai("alertsnap")
    const { vaultFor } = await import("../../src/do/gerai-vault/stub")
    const s = await vaultFor(env, g.tenantId).healthSnapshot(g.tenantId, Date.now())
    expect(s).toMatchObject({ ok: true, value: { connected: true, issues30m: 0, oldestInboxAgeMs: null } })
    const r = await exports.default.fetch("http://owner.geraiexpress.localhost:8787/internal/ops/alert-drill", { method: "POST", headers: { authorization: "Bearer test-ops-token" } })
    expect(r.status).toBe(200)
    const d = ((await r.json()) as { data: { results: Record<string, string> } }).data.results
    expect(Object.keys(d).sort()).toEqual([...ALERT_KEYS].sort())
    expect((await exports.default.fetch("http://owner.geraiexpress.localhost:8787/internal/ops/alert-drill", { method: "POST" })).status).toBe(401)
  })
})
