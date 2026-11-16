// TASK-505 isolation (spec 11 §8) for custom domains: A's active custom host serves only A's mini-site and tracking;
// B cannot claim A's host; B's session cookie, A's or B's API key and every API family are refused on A's custom
// host; a pending host answers only the probe; suspending A turns its custom host into 403 within the cache window.
import { env, exports } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { probeSignature } from "../../src/host/classify"
import { mockCf } from "../../src/hostnames/cloudflare"
import { createAtCloudflare, refreshHost } from "../../src/hostnames/service"
import { resetMock } from "../../src/mengantar/mock"
import { checkoutGerai, post, readyInv } from "../dispatch/helpers"
import { appPost } from "../webhooks/helpers"

beforeEach(() => {
  mockCf.reset()
  resetMock()
  hostCache.clear()
})

const get = (host: string, path: string, headers: Record<string, string> = {}) => exports.default.fetch(`http://${host}${path}`, { headers: { host, "cf-connecting-ip": "203.0.113.77", ...headers }, redirect: "manual" })
const probe = () => async (url: string) => new Response(await probeSignature(env.PROBE_SECRET, new URL(url).hostname, new URL(url).pathname.split("/").pop()!))

describe("custom domain isolation", () => {
  it("A's custom host is A-only; B cannot claim it; cookies/keys/API families refused; pending answers only the probe", async () => {
    const a = await checkoutGerai("cdisoa")
    const b = await checkoutGerai("cdisob")
    await env.DB.prepare("UPDATE tenants SET custom_domain_enabled = 1 WHERE id IN (?, ?)").bind(a.tenantId, b.tenantId).run()
    expect((await appPost("/custom-domain", a.cookie, { hostname: "kirim.isoa.id" })).status).toBe(201)
    await createAtCloudflare(env, "kirim.isoa.id", Date.now())
    // Pending: only the probe answers; the mini-site does not leak that a tenant exists.
    const nonce = "n".repeat(24)
    const pr = await get("kirim.isoa.id", `/.well-known/geraiexpress-probe/${nonce}`)
    expect(await pr.text()).toBe(await probeSignature(env.PROBE_SECRET, "kirim.isoa.id", nonce))
    expect((await get("kirim.isoa.id", "/")).status).toBe(404)
    // B cannot take A's host (pending or active).
    expect((await appPost("/custom-domain", b.cookie, { hostname: "kirim.isoa.id" })).status).toBe(409)
    mockCf.advance("kirim.isoa.id", "active", "active")
    await refreshHost(env, "kirim.isoa.id", Date.now(), { probeFetch: probe() })
    hostCache.clear()
    expect((await appPost("/custom-domain", b.cookie, { hostname: "kirim.isoa.id" })).status).toBe(409)

    // B's INV is not trackable on A's custom host; A's is.
    const sb = await readyInv(b)
    await post(`/shipments/${sb}/payment`, b.cookie, { method: "qris" }, `iso-cd-${sb}`)
    await post(`/shipments/${sb}/dispatch`, b.cookie, {})
    expect((await get("kirim.isoa.id", `/lacak?q=${sb.toUpperCase()}`)).status).toBe(404)
    const sa = await readyInv(a)
    await post(`/shipments/${sa}/payment`, a.cookie, { method: "qris" }, `iso-cd-${sa}`)
    await post(`/shipments/${sa}/dispatch`, a.cookie, {})
    expect((await get("kirim.isoa.id", `/lacak?q=${sa.toUpperCase()}`)).status).toBe(200)

    // Cookies and keys mean nothing here; API families are foreign on a custom host too.
    const ka = ((await (await appPost("/api-keys", a.cookie, { name: "Kunci A", scopes: ["tracking:read"] })).json()) as { data: { token: string } }).data.token
    for (const path of ["/api/app/workspace", "/api/owner/overview", "/api/v1/shipments", "/webhooks/mengantar/x", "/internal/ops/do-migrate"]) {
      for (const headers of [{ cookie: b.cookie }, { cookie: a.cookie }, { authorization: `Bearer ${ka}` }] as Array<Record<string, string>>) expect((await get("kirim.isoa.id", path, headers)).status, path).toBe(404)
    }
    const home = await get("kirim.isoa.id", "/", { cookie: b.cookie })
    expect(home.headers.get("set-cookie")).toBeNull()
    expect(await home.text()).not.toContain("cdisob")

    // Suspend A: its custom host answers 403 after the cache window.
    await env.DB.prepare("UPDATE tenants SET status = 'suspended', routing_version = routing_version + 1 WHERE id = ?").bind(a.tenantId).run()
    hostCache.clear()
    expect((await get("kirim.isoa.id", "/")).status).toBe(403)
  })
})
