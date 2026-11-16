// TASK-503 isolation (spec 11 §8): a key of gerai A reads and writes only A; B's INVs, contacts and finance are 404 /
// invisible; a revoked key and a key of a suspended gerai are 401; keys never work on other hosts.
import { env, exports } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { resetMock } from "../../src/mengantar/mock"
import { checkoutGerai, post, readyInv } from "../dispatch/helpers"
import { APP } from "../webhooks/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

const ALL = ["rates:read", "finance:read", "finance:sync", "contacts:read", "contacts:write", "shipments:draft", "shipments:issue", "tracking:read"]
const v1 = (host: string, path: string, token: string, method = "GET", body?: unknown) =>
  exports.default.fetch(`${host}/api/v1${path}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "cf-connecting-ip": "192.0.2.88", "idempotency-key": "iso-key-0001" }, body: body ? JSON.stringify(body) : undefined })

describe("API key isolation", () => {
  it("A's key never reaches B's data; suspended gerai and other hosts refuse it", async () => {
    const a = await checkoutGerai("apiisoa")
    const b = await checkoutGerai("apiisob")
    const ka = ((await (await post("/api-keys", a.cookie, { name: "Kunci A", scopes: ALL, dailyIssueCapIdr: 1_000_000 })).json()) as { data: { token: string } }).data.token
    const sb = await readyInv(b)
    await post(`/shipments/${sb}/payment`, b.cookie, { method: "qris" }, `iso-${sb}`)
    const awbB = ((await (await post(`/shipments/${sb}/dispatch`, b.cookie, {})).json()) as { data: { awb: string } }).data.awb
    expect((await v1(APP, `/shipments/${sb}`, ka)).status).toBe(404)
    expect((await v1(APP, `/shipments/${sb}/issue`, ka, "POST")).status).toBe(404)
    expect((await v1(APP, `/shipments/${sb}/labels`, ka, "POST", {})).status).toBe(404)
    const listA = (await (await v1(APP, `/shipments?awb=${awbB}`, ka)).json()) as { data: { items: unknown[] } }
    expect(listA.data.items).toEqual([])
    const sendersA = JSON.stringify(await (await v1(APP, "/contacts/senders", ka)).json())
    expect(sendersA).toContain(a.sender)
    expect(sendersA).not.toContain(b.sender)
    // Other hosts: the Partner API exists only on app.
    for (const host of ["http://owner.geraiexpress.localhost:8787", "http://geraiexpress.localhost:8787", "http://apiisoa.geraimitra.localhost:8787", "http://hooks.geraiexpress.localhost:8787"]) {
      expect((await v1(host, "/areas?q=tebet", ka)).status, host).toBe(404)
    }
    await env.DB.prepare("UPDATE tenants SET status = 'suspended' WHERE id = ?").bind(a.tenantId).run()
    expect((await v1(APP, "/areas?q=tebet", ka)).status).toBe(401)
  })
})
