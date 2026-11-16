// TASK-503 `/api/v1` (spec 08 §1–3, DEC-214): owner-managed keys shown once and stored hashed; Bearer only (cookies
// ignored); scope denial; Kasir-style projection without `finance:read`; idempotent issue with a per-key daily
// Rupiah cap; counter payment never reachable; OpenAPI 3.1 generated from the same route table; audit actor type.
import { env, exports } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { mockSeller, resetMock } from "../../src/mengantar/mock"
import { ownerOnlyKeysIn } from "../../src/dto/projection"
import { checkoutGerai, post, DEST } from "../dispatch/helpers"
import { APP, appGet } from "../webhooks/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

async function key(cookie: string, scopes: string[], extra: Record<string, unknown> = {}) {
  const r = await post("/api-keys", cookie, { name: "Toko Online", scopes, ...extra })
  expect(r.status).toBe(201)
  return ((await r.json()) as { data: { id: string; token: string } }).data
}
const v1 = (path: string, token: string | null, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
  exports.default.fetch(`${APP}/api/v1${path}`, {
    method: init.method ?? "GET",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.body ? { "content-type": "application/json" } : {}), "cf-connecting-ip": "192.0.2.77", ...init.headers },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })

describe("/api/v1", () => {
  it("keys: shown once, stored as hash, Kasir 403, owner revoke; Bearer only — a session cookie is ignored", async () => {
    const t = await checkoutGerai("apikunci")
    const k = await key(t.cookie, ["rates:read"])
    expect(k.token).toMatch(/^gx_live_[A-Za-z0-9_-]{43}$/)
    const row = await env.DB.prepare("SELECT token_hash, token_prefix FROM tenant_api_keys WHERE id = ?").bind(k.id).first<{ token_hash: string; token_prefix: string }>()
    expect(row!.token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(row!.token_hash).not.toContain(k.token.slice(8))
    const list = await (await appGet("/api-keys", t.cookie)).text()
    expect(list).not.toContain(k.token)
    expect((await v1("/areas?q=tebet", null, { headers: { cookie: t.cookie } })).status).toBe(401)
    expect((await v1("/areas?q=tebet", k.token)).status).toBe(200)
    expect((await post(`/api-keys/${k.id}/revoke`, t.cookie, {})).status).toBe(200)
    expect((await v1("/areas?q=tebet", k.token)).status).toBe(401)
    expect((await post("/api-keys", t.cookie, { name: "x", scopes: ["admin"] })).status).toBe(422)
  })

  it("scope denial on every route family; payment routes do not exist", async () => {
    const t = await checkoutGerai("apiscope")
    const k = await key(t.cookie, ["rates:read"])
    const denied: Array<[string, string, unknown?]> = [
      ["GET", "/shipments"],
      ["POST", "/shipments", { destination_area_id: DEST, service_code: "JT" }],
      ["POST", "/shipments/abcdefg/issue"],
      ["GET", "/contacts/senders"],
      ["POST", "/contacts/recipients", { name: "A", phone: "081234567890" }],
      ["GET", "/finance/summary"],
      ["POST", "/finance/sync"],
      ["POST", "/labels/bulk", { slugs: ["abcdefg"] }],
    ]
    for (const [m, p, b] of denied) {
      const r = await v1(p, k.token, { method: m, body: b })
      expect(r.status, `${m} ${p}`).toBe(403)
      expect(((await r.json()) as { error: { code: string } }).error.code).toBe("SCOPE_REQUIRED")
    }
    const all = await key(t.cookie, ["rates:read", "finance:read", "finance:sync", "contacts:read", "contacts:write", "shipments:draft", "shipments:issue", "tracking:read"], { dailyIssueCapIdr: 1_000_000 })
    for (const p of ["/shipments/abcdefg/payment", "/shipments/abcdefg/cod-payout", "/shipments/abcdefg/cancel"]) expect((await v1(p, all.token, { method: "POST", body: {} })).status, p).toBe(404)
  })

  it("quote: customer prices without finance:read, net cost with it; draft → issue with Idempotency-Key and the daily cap; audit says api_key", async () => {
    const t = await checkoutGerai("apiterbit")
    const reseller = await key(t.cookie, ["rates:read", "shipments:draft", "shipments:issue", "tracking:read", "contacts:write"], { dailyIssueCapIdr: 40_000 })
    const owner = await key(t.cookie, ["rates:read", "finance:read"])
    const q1 = await (await v1("/quotes", reseller.token, { method: "POST", body: { destination_area_id: DEST, weight_gram: 1000 } })).json()
    expect(ownerOnlyKeysIn(q1)).toEqual([])
    const q2 = (await (await v1("/quotes", owner.token, { method: "POST", body: { destination_area_id: DEST } })).json()) as { data: { cards: Array<{ providerNetShippingIdr?: number }> } }
    expect(q2.data.cards.some((c) => typeof c.providerNetShippingIdr === "number")).toBe(true)
    expect((await v1("/quotes", reseller.token, { method: "POST", body: { destination_area_id: "x" } })).status).toBe(422)
    const issued: string[] = []
    for (let i = 0; i < 3; i++) {
      const d = await v1("/shipments", reseller.token, { method: "POST", body: { destination_area_id: DEST, weight_gram: 1000, service_code: "JT", sender_id: t.sender, recipient_id: t.recipient, content: "Pakaian" } })
      expect(d.status).toBe(201)
      const slug = ((await d.json()) as { data: { slug: string } }).data.slug
      await post(`/shipments/${slug}/parties`, t.cookie, { prohibitedAck: true })
      expect((await v1(`/shipments/${slug}/issue`, reseller.token, { method: "POST" })).status).toBe(400)
      const r = await v1(`/shipments/${slug}/issue`, reseller.token, { method: "POST", headers: { "idempotency-key": `api-${slug}` } })
      if (r.status === 200) issued.push(slug)
      else {
        expect(r.status).toBe(429)
        expect(((await r.json()) as { error: { code: string } }).error.code).toBe("DAILY_CAP_REACHED")
      }
    }
    // Each issue reserves due + cost (12.500 + 10.000); a 40.000 cap allows one, not three.
    expect(issued.length).toBe(1)
    // Re-issuing an already issued INV never consumes the cap again.
    expect((await v1(`/shipments/${issued[0]}/issue`, reseller.token, { method: "POST", headers: { "idempotency-key": `api-again` } })).status).toBe(200)
    const actorTypes = await runInDurableObject(t.vault, (_i, s) => s.storage.sql.exec<{ actor_type: string }>("SELECT DISTINCT actor_type FROM audit_logs WHERE action = 'shipment.dispatch'").toArray().map((x) => x.actor_type))
    expect(actorTypes).toEqual(["api_key"])
    const detail = await (await v1(`/shipments/${issued[0]}`, reseller.token)).json()
    expect(ownerOnlyKeysIn(detail)).toEqual([])
  })

  it("cap: a balance-held issue keeps its reservation (recovery cannot exceed the cap), pay-unpaid never counts it twice; a rejection releases; finance/sync hides the balance (Sol delta C-2)", async () => {
    const t = await checkoutGerai("apicapsaldo")
    const k = await key(t.cookie, ["rates:read", "shipments:draft", "shipments:issue", "tracking:read", "finance:sync"], { dailyIssueCapIdr: 30_000 })
    const draft = async () => {
      const d = await v1("/shipments", k.token, { method: "POST", body: { destination_area_id: DEST, weight_gram: 1000, service_code: "JT", sender_id: t.sender, recipient_id: t.recipient, content: "Pakaian" } })
      const slug = ((await d.json()) as { data: { slug: string } }).data.slug
      await post(`/shipments/${slug}/parties`, t.cookie, { prohibitedAck: true })
      return slug
    }
    const used = async () => (await env.DB.prepare("SELECT COALESCE(SUM(issued_idr), 0) AS n FROM api_key_daily_usage WHERE key_id = ?").bind(k.id).first<{ n: number }>())!.n
    const slug = await draft()
    mockSeller.balanceIdr = 0
    const held = await v1(`/shipments/${slug}/issue`, k.token, { method: "POST", headers: { "idempotency-key": `held-${slug}` } })
    expect(((await held.json()) as { data: { state: string } }).data.state).toBe("provider_unpaid_hold")
    const reserved = await used()
    expect(reserved).toBe(22_500) // 12.500 counter due + 10.000 gerai cost, held until the order resolves
    // A second held issue would exceed the 30.000 cap: refused before Mengantar is called.
    const second = await draft()
    const calls = mockSeller.createCalls
    expect((await v1(`/shipments/${second}/issue`, k.token, { method: "POST", headers: { "idempotency-key": `held2-${second}` } })).status).toBe(429)
    expect(mockSeller.createCalls).toBe(calls)
    mockSeller.balanceIdr = 100_000
    const paid = await v1(`/shipments/${slug}/pay-unpaid`, k.token, { method: "POST", headers: { "idempotency-key": `pay-${slug}` } })
    expect(((await paid.json()) as { data: { state: string } }).data.state).toBe("issued")
    expect(await used()).toBe(reserved) // the same INV is never counted twice
    const sync = (await (await v1("/finance/sync", k.token, { method: "POST" })).json()) as { data: Record<string, unknown> }
    expect(sync.data.balance).toBeUndefined()
  })

  it("cap: a provider rejection releases the reservation (Sol delta C-2)", async () => {
    const { mockFaults } = await import("../../src/mengantar/mock")
    const t = await checkoutGerai("apitolak")
    const k = await key(t.cookie, ["shipments:draft", "shipments:issue"], { dailyIssueCapIdr: 30_000 })
    const d = await v1("/shipments", k.token, { method: "POST", body: { destination_area_id: DEST, weight_gram: 1000, service_code: "JT", sender_id: t.sender, recipient_id: t.recipient, content: "Pakaian" } })
    const slug = ((await d.json()) as { data: { slug: string } }).data.slug
    await post(`/shipments/${slug}/parties`, t.cookie, { prohibitedAck: true })
    mockFaults.order = "validation_error"
    expect((await v1(`/shipments/${slug}/issue`, k.token, { method: "POST", headers: { "idempotency-key": `tolak-${slug}` } })).status).toBe(422)
    expect((await env.DB.prepare("SELECT COALESCE(SUM(issued_idr), 0) AS n FROM api_key_daily_usage WHERE key_id = ?").bind(k.id).first<{ n: number }>())!.n).toBe(0)
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM api_key_spend_items WHERE key_id = ?").bind(k.id).first<{ n: number }>()).toEqual({ n: 0 })
  })

  it("bulk commit reserves each row's frozen counter total + gerai cost, all or nothing (Sol delta C-4)", async () => {
    const { checkBatch } = await import("../../src/bulk/service")
    const t = await checkoutGerai("apimassal")
    const csv = ["Nama Penerima,No HP,Alamat,Kecamatan/Kota,Kode Pos,Isi Paket,Berat (gram)", "Rina Kartika,0857-1234-8821,Jl. Tebet Barat No. 14,Tebet Barat,12810,Pakaian,1000", "Rina Dua,0857-1234-8822,Jl. Tebet Barat No. 15,Tebet Barat,12810,Buku,1000"].join("\r\n")
    const make = async (cap: number) => {
      const k = await key(t.cookie, ["shipments:issue"], { dailyIssueCapIdr: cap })
      const b = await v1("/bulk-imports", k.token, { method: "POST", body: { sender_id: t.sender, service_code: "JT", csv } })
      expect(b.status).toBe(201)
      const id = ((await b.json()) as { data: { id: string } }).data.id
      for (let i = 0; i < 3 && (await checkBatch(env, t.tenantId, id)).more; i++);
      return { k, id }
    }
    // Two rows × (12.500 due + 10.000 cost) = 45.000: exactly the cap → accepted (publish-price math would refuse).
    const ok = await make(45_000)
    const r = await v1(`/bulk-imports/${ok.id}/commit`, ok.k.token, { method: "POST", body: { prohibited_ack: true }, headers: { "idempotency-key": `c-${ok.id}` } })
    expect(r.status).toBe(200)
    expect((await env.DB.prepare("SELECT issued_idr FROM api_key_daily_usage WHERE key_id = ?").bind(ok.k.id).first<{ issued_idr: number }>())!.issued_idr).toBe(45_000)
    // One Rupiah short → refused, and nothing stays reserved.
    const short = await make(44_999)
    expect((await v1(`/bulk-imports/${short.id}/commit`, short.k.token, { method: "POST", body: { prohibited_ack: true }, headers: { "idempotency-key": `c-${short.id}` } })).status).toBe(429)
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM api_key_spend_items WHERE key_id = ?").bind(short.k.id).first<{ n: number }>()).toEqual({ n: 0 })
    expect((await env.DB.prepare("SELECT COALESCE(SUM(issued_idr), 0) AS n FROM api_key_daily_usage WHERE key_id = ?").bind(short.k.id).first<{ n: number }>())!.n).toBe(0)
  })

  it("OpenAPI 3.1 document is generated from the route table (every route, scopes, Idempotency-Key)", async () => {
    const doc = (await (await v1("/openapi.json", null)).json()) as { openapi: string; paths: Record<string, Record<string, { security: Array<{ bearer: string[] }>; parameters: Array<{ name: string; in: string }> }>> }
    expect(doc.openapi).toBe("3.1.0")
    const { ROUTES } = await import("../../src/api-v1")
    expect(Object.values(doc.paths).reduce((n, p) => n + Object.keys(p).length, 0)).toBe(ROUTES.length)
    expect(doc.paths["/shipments/{slug}/issue"]!.post!.security).toEqual([{ bearer: ["shipments:issue"] }])
    expect(doc.paths["/shipments/{slug}/issue"]!.post!.parameters.map((p) => `${p.in}:${p.name}`)).toEqual(["path:slug", "header:Idempotency-Key"])
    expect(JSON.stringify(doc)).not.toMatch(/mark_paid|cod-payout|void_payment/)
    expect((await v1("/docs", null)).headers.get("content-type")).toContain("text/html")
  })

  it("route scan: every route has a known scope and no counter-payment path (fixture goes red)", async () => {
    const { ROUTES } = await import("../../src/api-v1")
    const { SCOPES } = await import("../../src/api-v1/keys")
    const { scanApiV1 } = await import("../../../../scripts/ci/route-scan-lib.mjs")
    expect(scanApiV1(ROUTES, SCOPES)).toEqual([])
    expect(scanApiV1([...ROUTES, { method: "POST", path: "/shipments/{slug}/payment", scope: "shipments:issue" }], SCOPES)).toContainEqual(expect.stringContaining("POS-only"))
    expect(scanApiV1([{ method: "GET", path: "/x", scope: "admin" }], SCOPES)).toContainEqual(expect.stringContaining("scope"))
  })
})
