// Locked demo account (`demo@geraiexpress.com` / `geraiexpress123`): idempotent seed via OPS_TOKEN, populated
// analytics/shipments/contacts/finance/returns/claims, simulated quotes & non-recording label preview allowed,
// and every mutating route blocked server-side with 403 DEMO_READ_ONLY.
import { SELF } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { DEMO_DEFAULT_PASSWORD, DEMO_EMAIL } from "../../src/demo/constants"

const APP = "http://app.geraiexpress.localhost"
const OWNER = "http://owner.geraiexpress.localhost"

function cookieFrom(res: Response): string {
  const raw = res.headers.get("set-cookie") ?? ""
  return raw.split(";")[0] ?? ""
}

describe("Demo Account", () => {
  it("seeds idempotently, populates dashboard/shipments/contacts/finance, allows quotes+preview, and locks mutations", async () => {
    // 1. Seed requires OPS_TOKEN and is idempotent.
    const unauth = await SELF.fetch(`${OWNER}/internal/ops/seed-demo`, { method: "POST" })
    expect(unauth.status).toBe(401)

    const seed1 = await SELF.fetch(`${OWNER}/internal/ops/seed-demo`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.OPS_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(seed1.status).toBe(201)
    const d1 = ((await seed1.json()) as { data: { shipments: number; senders: number; recipients: number; slug: string } }).data
    expect(d1.slug).toBe("demo")
    expect(d1.shipments).toBe(42)
    expect(d1.senders).toBe(12)
    expect(d1.recipients).toBe(24)

    // Re-running seed stays clean and idempotent.
    const seed2 = await SELF.fetch(`${OWNER}/internal/ops/seed-demo`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.OPS_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(seed2.status).toBe(201)

    // 2. Login works and emits zero security_alert emails to demo@geraiexpress.com.
    const loginRes = await SELF.fetch(`${APP}/api/app/auth/login`, {
      method: "POST",
      headers: { origin: APP, "content-type": "application/json" },
      body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_DEFAULT_PASSWORD, turnstileToken: "ok" }),
    })
    expect(loginRes.status).toBe(200)
    const cookie = cookieFrom(loginRes)
    expect(cookie).toContain("ge_app=")
    const alerts = await env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE template_id = 'security_alert'").first<{ n: number }>()
    expect(alerts?.n ?? 0).toBe(0)

    const get = (path: string) => SELF.fetch(`${APP}/api/app${path}`, { headers: { cookie } })
    const post = (path: string, body: Record<string, unknown> = {}) =>
      SELF.fetch(`${APP}/api/app${path}`, {
        method: "POST",
        headers: { origin: APP, cookie, "content-type": "application/json" },
        body: JSON.stringify(body),
      })

    // 3. Workspace exposes demo=true and all core views are richly populated.
    const ws = ((await (await get("/workspace")).json()) as { data: { demo: boolean; tenant: { slug: string } } }).data
    expect(ws.demo).toBe(true)
    expect(ws.tenant.slug).toBe("demo")

    const dash = ((await (await get("/dashboard?periode=30d")).json()) as { data: { kind: string; data: { kpi: { shipments: number; paidIdr: number; estimated_margin_idr: number; cash_profit_idr: number }; couriers: unknown[]; topSenders: unknown[] } } }).data
    expect(dash.kind).toBe("owner")
    expect(dash.data.kpi.shipments).toBeGreaterThanOrEqual(25)
    expect(dash.data.kpi.paidIdr).toBeGreaterThan(0)
    expect(dash.data.kpi.estimated_margin_idr).toBeGreaterThan(0)
    expect(dash.data.kpi.cash_profit_idr).toBeGreaterThan(0)
    expect(dash.data.couriers.length).toBeGreaterThanOrEqual(5)
    expect(dash.data.topSenders.length).toBeGreaterThanOrEqual(3)

    const todayDash = ((await (await get("/dashboard?periode=hari-ini")).json()) as { data: { kind: string; data: { kpi: { shipments: number } } } }).data
    expect(todayDash.data.kpi.shipments).toBe(5)

    const list = ((await (await get("/shipments?tab=semua")).json()) as { data: { items: Array<{ slug: string; print_count: number }> } }).data
    expect(list.items.length).toBeGreaterThanOrEqual(20)
    const senders = ((await (await get("/contacts/senders")).json()) as { data: { items: unknown[] } }).data
    expect(senders.items.length).toBe(12)
    const recipients = ((await (await get("/contacts/recipients")).json()) as { data: { items: unknown[] } }).data
    expect(recipients.items.length).toBe(24)
    const returns = ((await (await get("/returns")).json()) as { data: { open: unknown[]; returned: unknown[] } }).data
    expect(returns.open.length).toBeGreaterThanOrEqual(2)
    const exc = ((await (await get("/exceptions?bucket=tidak_bergerak")).json()) as { data: { rows: unknown[] } }).data
    expect(exc.rows.length).toBeGreaterThanOrEqual(2)

    // 4. Simulated Cek Ongkir works without touching live Mengantar.
    const quoteRes = await post("/quotes", { destinationAreaId: "5fc62f5df8f44b34aa4c0d8d", mode: "none", weightGram: 1000 })
    expect(quoteRes.status).toBe(200)
    const qData = ((await quoteRes.json()) as { data: { cards: Array<{ available: boolean; estimatedProfitIdr?: number }> } }).data
    expect(qData.cards.some((c) => c.available && typeof c.estimatedProfitIdr === "number")).toBe(true)

    // 5. Print preview works and never mutates print_count.
    const unprinted = list.items.find((x) => x.print_count === 0) ?? list.items[0]!
    const printRes = await post("/print", { slugs: [unprinted.slug], format: "label_10x15_with_stub", preview: false, as: "svg" })
    expect(printRes.status).toBe(200)
    const detail = ((await (await get(`/shipments/${unprinted.slug}`)).json()) as { data: { shipment: { print_count: number } } }).data
    expect(detail.shipment.print_count).toBe(unprinted.print_count)

    // 6. All mutating routes are locked with 403 DEMO_READ_ONLY.
    for (const [path, payload] of [
      ["/account/password", { current: DEMO_DEFAULT_PASSWORD, next: "baru-kuat-999" }],
      ["/settings/profile", { name: "Diubah Orang" }],
      ["/settings/receipt", { defaultLabelFormat: "label_10x10", unboxingRemark: "", showCommission: false }],
      ["/quotes/freeze", { destinationAreaId: "5fc62f5df8f44b34aa4c0d8d", mode: "none", weightGram: 1000, serviceCode: "JNE" }],
      ["/contacts/senders", { senderKind: "walk_in", trueName: "Orang Baru", truePhone: "081234567890" }],
      ["/notifications/read", { all: true }],
    ] as const) {
      const res = await post(path, payload)
      expect(res.status, path).toBe(403)
      expect(((await res.json()) as { error: { code: string } }).error.code, path).toBe("DEMO_READ_ONLY")
    }

    // 7. Forgot-password for demo@geraiexpress.com is also refused.
    const forgotRes = await SELF.fetch(`${APP}/api/app/auth/password/forgot`, {
      method: "POST",
      headers: { origin: APP, "content-type": "application/json" },
      body: JSON.stringify({ email: DEMO_EMAIL, turnstileToken: "ok" }),
    })
    expect(forgotRes.status).toBe(403)
    expect(((await forgotRes.json()) as { error: { code: string } }).error.code).toBe("DEMO_READ_ONLY")
  })
})
