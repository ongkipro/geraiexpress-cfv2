// M5 isolation matrix (spec 11 §8) for MCP (TASK-504): A's key on the outlet MCP never reaches B's INV, contacts or
// risk history; MCP never answers on owner./apex/hooks.; a tenant host's public MCP is bound to that host's tenant.
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

let n = 0
const call = async (url: string, token: string | null, name: string, args: Record<string, unknown>) => {
  const r = await exports.default.fetch(url, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.91", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }) })
  return { status: r.status, body: r.status === 200 ? ((await r.json()) as { result: { isError: boolean; structuredContent: Record<string, unknown> } }).result : null }
}

describe("MCP isolation", () => {
  it("A's key: B's INV/AWB not found, B's contacts and risk invisible; other hosts 404", async () => {
    const a = await checkoutGerai("mcpisoa")
    const b = await checkoutGerai("mcpisob")
    const ka = ((await (await post("/api-keys", a.cookie, { name: "Kunci A", scopes: ["tracking:read", "contacts:read", "contacts:write"] })).json()) as { data: { token: string } }).data.token
    const sb = await readyInv(b)
    await post(`/shipments/${sb}/payment`, b.cookie, { method: "qris" }, `mcpiso-${sb}`)
    const awb = ((await (await post(`/shipments/${sb}/dispatch`, b.cookie, {})).json()) as { data: { awb: string } }).data.awb
    const mcp = `${APP}/mcp`
    for (const args of [{ inv: sb }, { awb }]) {
      const r = await call(mcp, ka, "get_shipment_by_inv_or_awb", args)
      expect(r.body!.isError, JSON.stringify(args)).toBe(true)
      expect(JSON.stringify(r.body)).not.toContain("Rina")
    }
    // Same phone exists at B with history; A's view counts only A's rows (A has the same recipient seeded → 0 COD).
    const risk = await call(mcp, ka, "check_cod_recipient_risk", { phone: "085712348821" })
    expect(risk.body!.structuredContent).toMatchObject({ delivered_count: 0, rts_count: 0 })
    // A cannot update B's contact by id.
    const upd = await call(mcp, ka, "upsert_sender_or_recipient_contact", { kind: "recipient", id: b.recipient, name: "Diubah A", phone: "085712348821", street: "Jl. Uji No. 1 RT 01", area_id: "5fc64714f8f44b34aa4cdd60" })
    expect(upd.body!.isError).toBe(true)
    expect(await (await import("cloudflare:test")).runInDurableObject(b.vault, (_i, s) => s.storage.sql.exec<{ name: string }>("SELECT name FROM recipient_contacts WHERE id = ?", b.recipient).one().name)).toBe("Rina Kartika")
    for (const host of ["http://owner.geraiexpress.localhost:8787", "http://geraiexpress.localhost:8787", "http://hooks.geraiexpress.localhost:8787"]) {
      expect((await call(`${host}/mcp`, ka, "list_pending_returns_at_gerai", {})).status, host).toBe(404)
    }
  })

  it("public MCP on B's host tracks only B; A's key means nothing there", async () => {
    const a = await checkoutGerai("mcppisa")
    const b = await checkoutGerai("mcppisb")
    await env.DB.prepare("INSERT INTO tenant_hostnames (hostname, tenant_id, kind, state, created_at, activated_at) VALUES ('mcppisb.geraimitra.localhost', ?, 'platform_subdomain', 'active', 1, 1)").bind(b.tenantId).run()
    const sa = await readyInv(a)
    const pub = "http://mcppisb.geraimitra.localhost:8787/mcp"
    expect((await call(pub, null, "track_public_shipment_privacy_safe", { code: sa.toUpperCase() })).body!.isError).toBe(true)
    const ka = ((await (await post("/api-keys", a.cookie, { name: "Kunci A", scopes: ["tracking:read"] })).json()) as { data: { token: string } }).data.token
    // The outlet tool does not exist on the public server: JSON-RPC error, no result.
    const raw = await exports.default.fetch(pub, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.92", authorization: `Bearer ${ka}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_shipment_by_inv_or_awb", arguments: { inv: sa } } }) })
    const j = (await raw.json()) as { result?: unknown; error?: { code: number; message: string } }
    expect(j.result).toBeUndefined()
    expect(j.error).toMatchObject({ code: -32602 })
  })
})
