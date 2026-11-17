// DEC-244 Super Admin sync / recheck actions: aal2 only (an app session or no session is refused), audited, rate-
// limited, and operational reads only — no route here creates, pays, edits or cancels a gerai's shipment (DEC-209).
import { env, exports } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { resetMock } from "../../src/mengantar/mock"
import { ROUTES } from "../../src/api/registry"
import "../../src/index"
import { adminSession, ownerGet, ownerPost, submit } from "../onboarding/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

const OWNER = "http://owner.geraiexpress.localhost:8787"
const lastAudit = (action: string) => env.DB.prepare("SELECT reason, target_id, metadata_json FROM audit_logs WHERE action = ? ORDER BY at DESC LIMIT 1").bind(action).first<{ reason: string; target_id: string | null; metadata_json: string | null }>()

async function approved(slug: string) {
  const s = await submit(slug, `${slug}.seller@contoh.test`)
  const admin = await adminSession()
  expect((await ownerPost(`/gerai/applications/${s.applicationId}/approve`, admin, { reason: "data lengkap dan valid" })).status).toBe(200)
  return { ...s, slug, admin }
}

describe("recheck routes are registered aal2, owner context, role projection", () => {
  it("registry", () => {
    for (const path of ["/sistem/kesehatan/periksa", "/tarif/verifikasi-ulang", "/gerai/:slug/sinkron", "/domains/periksa", "/pengawasan/sinkron-keuangan"]) {
      const r = ROUTES.find((x) => x.context === "owner" && x.method === "POST" && x.path === path)
      expect(r, path).toBeDefined()
      expect(r!.auth).toBe("owner_aal2")
    }
  })
  it("no session → 401", async () => {
    const r = await exports.default.fetch(`${OWNER}/api/owner/sistem/kesehatan/periksa`, { method: "POST", headers: { "content-type": "application/json", origin: OWNER }, body: "{}" })
    expect(r.status).toBe(401)
  })
})

describe("Sistem: kesehatan + periksa ulang", () => {
  it("returns signals and an icon verdict; recheck is audited and rate-limited", async () => {
    const admin = await adminSession()
    const g = (await (await ownerGet("/sistem/kesehatan", admin)).json()) as { data: { signals: Array<{ id: string; state: string }>; icon: { tone: string; count: number }; relay: unknown } }
    expect(g.data.signals.map((s) => s.id)).toEqual(["partner", "diskon", "onboarding", "email", "domain"])
    expect(["healthy", "problem"]).toContain(g.data.icon.tone)
    expect(g.data).toHaveProperty("relay")
    const r = await ownerPost("/sistem/kesehatan/periksa", admin, {})
    expect(r.status).toBe(200)
    expect(((await r.json()) as { data: { overall: { checkedAt: number } } }).data.overall.checkedAt).toBeGreaterThan(0)
    expect((await lastAudit("platform.health_recheck"))?.reason).toBe("Periksa ulang sinyal sistem")
    for (let i = 0; i < 5; i++) await ownerPost("/sistem/kesehatan/periksa", admin, {})
    expect((await ownerPost("/sistem/kesehatan/periksa", admin, {})).status).toBe(429)
  })
})

describe("Tarif: verifikasi ulang diskon", () => {
  it("runs the verifier now for one gerai and audits it", async () => {
    const g = await approved("verifsatu")
    expect((await ownerPost(`/tarif/gerai/${g.tenantId}/JNE`, g.admin, { assignedBps: 2500, reason: "diskon awal gerai" })).status).toBe(200)
    const r = await ownerPost("/tarif/verifikasi-ulang", g.admin, { tenantId: g.tenantId })
    expect(r.status).toBe(200)
    const d = ((await r.json()) as { data: { tenants: number; observed: number; checkedAt: number } }).data
    expect(d.tenants).toBe(1)
    const a = await lastAudit("pricing.discount_recheck")
    expect(a?.target_id).toBe(g.tenantId)
  })
})

describe("Tarif: targeted verification never verifies another gerai (Sol R1 #1)", () => {
  it("A overdue, B requested → only B is observed by that call", async () => {
    const a = await approved("verifa")
    const b = await approved("verifb")
    const now = Date.now()
    await env.DB.prepare("UPDATE tenant_discount_rules SET next_check_at = ?, observed_at = NULL WHERE tenant_id = ?").bind(now - 3600_000, a.tenantId).run()
    await env.DB.prepare("UPDATE tenant_discount_rules SET next_check_at = ?, observed_at = NULL WHERE tenant_id = ?").bind(now + 3600_000, b.tenantId).run()
    const r = await ownerPost("/tarif/verifikasi-ulang", b.admin, { tenantId: b.tenantId })
    expect(((await r.json()) as { data: { tenants: number } }).data.tenants).toBe(1)
    // A processed rule gets a new schedule (next_check_at moves past now); an untouched one keeps its old value.
    const nextOf = async (id: string) => (await env.DB.prepare("SELECT MIN(next_check_at) AS t FROM tenant_discount_rules WHERE tenant_id = ?").bind(id).first<{ t: number | null }>())!.t
    expect(await nextOf(a.tenantId)).toBe(now - 3600_000)
    const tb = await nextOf(b.tenantId)
    expect(tb === null || tb > now).toBe(true)
  })
})

describe("Gerai: sinkron & periksa ulang + domain periksa", () => {
  it("syncs one gerai (finance + discount + domains) without touching shipments; audited", async () => {
    const g = await approved("sinkronsatu")
    const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM shipment_index WHERE tenant_id = ?").bind(g.tenantId).first<{ n: number }>()
    const r = await ownerPost(`/gerai/${g.slug}/sinkron`, g.admin, {})
    expect(r.status).toBe(200)
    const d = ((await r.json()) as { data: { onboardingState: string; financeSync: string; domainsChecked: number } }).data
    expect(d.onboardingState).toBe("connected")
    // Queued for the system's own cron sync — never run from Super Admin code (DEC-209).
    expect(d.financeSync).toBe("queued")
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM shipment_index WHERE tenant_id = ?").bind(g.tenantId).first<{ n: number }>())?.n).toBe(before?.n)
    expect((await lastAudit("tenant.sync_recheck"))?.target_id).toBe(g.tenantId)
    expect((await ownerPost("/gerai/tidakada/sinkron", g.admin, {})).status).toBe(404)
  })
  it("domain recheck: all (quota) or one unknown hostname → 404", async () => {
    const admin = await adminSession()
    const all = await ownerPost("/domains/periksa", admin, {})
    expect(all.status).toBe(200)
    expect((await ownerPost("/domains/periksa", admin, { hostname: "tidak.ada.id" })).status).toBe(404)
  })
})

describe("Pengawasan: sinkron keuangan semua gerai", () => {
  it("enqueues the finance fan-out once, then refuses a burst", async () => {
    const g = await approved("fanoutsatu")
    const r = await ownerPost("/pengawasan/sinkron-keuangan", g.admin, {})
    expect(r.status).toBe(200)
    expect(((await r.json()) as { data: { enqueued: number } }).data.enqueued).toBeGreaterThanOrEqual(1)
    await ownerPost("/pengawasan/sinkron-keuangan", g.admin, {})
    expect((await ownerPost("/pengawasan/sinkron-keuangan", g.admin, {})).status).toBe(429)
    const antrean = (await (await ownerGet("/pengawasan/antrean", g.admin)).json()) as { data: { queues: unknown[]; discountMismatch: number } }
    expect(antrean.data).toHaveProperty("discountMismatch")
  })
})
