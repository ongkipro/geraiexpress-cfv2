// TASK-501 isolation (spec 11 §8): `/lacak` on gerai A never resolves an INV/AWB of gerai B; anonymous tracking never
// serialises phone numbers, streets, COD amounts or item names for any status; tenant hosts reject API families
// and never set cookies.
import { env, exports } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { resetMock } from "../../src/mengantar/mock"
import { recordProviderObservation } from "../../src/do/gerai-vault/status"
import { checkoutGerai, post, readyInv } from "../dispatch/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

async function site(slug: string) {
  const t = await checkoutGerai(slug)
  await env.DB.prepare("INSERT INTO tenant_hostnames (hostname, tenant_id, kind, state, created_at, activated_at) VALUES (?1, ?2, 'platform_subdomain', 'active', 1, 1) ON CONFLICT DO NOTHING").bind(`${slug}.geraimitra.localhost`, t.tenantId).run()
  return { ...t, base: `http://${slug}.geraimitra.localhost:8787` }
}
const get = (url: string, cookie?: string) => exports.default.fetch(url, { headers: { "cf-connecting-ip": "203.0.113.9", ...(cookie ? { cookie } : {}) } })

describe("/lacak isolation", () => {
  it("cross-tenant INV and AWB are not found; no PII for COD shipments in any status; no cookies, no API on tenant hosts", async () => {
    const a = await site("lacaka")
    const b = await site("lacakb")
    const slug = await readyInv(b, { mode: "sender_bears_fee", codGoodsIdr: 150000 })
    await post(`/shipments/${slug}/payment`, b.cookie, { method: "qris" }, `li-${slug}`)
    const awb = ((await (await post(`/shipments/${slug}/dispatch`, b.cookie, {})).json()) as { data: { awb: string } }).data.awb
    for (const q of [slug, slug.toUpperCase(), awb]) expect((await get(`${a.base}/lacak?q=${q}`)).status, q).toBe(404)
    for (const status of ["in_transit", "undelivery_hold", "delivered", "rts_in_transit"] as const) {
      await runInDurableObject(b.vault, (_i, st) => recordProviderObservation(st.storage.sql, { slug, eventKey: `${status}-${slug}`, source: "webhook", rawCategory: status.toUpperCase(), mapped: status, eventAt: Date.now() + 60_000 * (1 + ["in_transit", "undelivery_hold", "delivered", "rts_in_transit"].indexOf(status)), eventAtText: null }, Date.now()))
      const res = await get(`${b.base}/lacak?q=${awb}`, b.cookie)
      expect(res.status).toBe(200)
      expect(res.headers.get("set-cookie")).toBeNull()
      const page = await res.text()
      for (const pii of ["085712348821", "081234567890", "Rina", "Kartika", "Ibu Siti", "Jl. Tebet", "150.000", "152.000", "Pakaian", "pod", "photo"]) expect(page, `${status}:${pii}`).not.toContain(pii)
    }
    for (const path of ["/api/app/workspace", "/api/owner/overview", "/internal/ops/do-migrate", "/api/v1/shipments", "/webhooks/mengantar/x"]) expect((await get(`${b.base}${path}`, b.cookie)).status, path).toBe(404)
    // `/mcp` on a tenant host is the public mini-site MCP (TASK-504): POST-only, no stream.
    expect((await get(`${b.base}/mcp`, b.cookie)).status).toBe(405)
  })
})
