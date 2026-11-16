import { createHash, createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { PartnerClient, partnerSignature, PARTNER_ROUTES } from "../src/partner"
import { createRelay } from "../../../infra/partner-relay/relay.mjs"

const BODY = '{"name":"Toko Sinar Jaya","email":"owner@example.com","phone":"081234567890","externalUserId":"webstore-user-1"}'

describe("Partner signature (spec 10 §4.2 item 3)", () => {
  it("equals sha256(METHOD:PATH::BODY:TIMESTAMP:SECRET) — parity with the documented openssl example", async () => {
    const expected = createHash("sha256").update(`POST:/api/partner/v1/sellers::${BODY}:1790000000:partner-secret`).digest("hex")
    expect(await partnerSignature({ method: "POST", path: "/api/partner/v1/sellers", body: BODY, timestamp: "1790000000", secret: "partner-secret" })).toBe(expected)
    // The path is inside the signature: api-key and regenerate never share one.
    const a = await partnerSignature({ method: "POST", path: PARTNER_ROUTES.apiKey, body: '{"sellerId":"x"}', timestamp: "1", secret: "s" })
    const b = await partnerSignature({ method: "POST", path: PARTNER_ROUTES.regenerate, body: '{"sellerId":"x"}', timestamp: "1", secret: "s" })
    expect(a).not.toBe(b)
  })
})

function directClient(responses: Array<{ status: number; json: unknown } | "timeout">) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  let i = 0
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const r = responses[i++]
    if (r === "timeout") throw Object.assign(new Error("t"), { name: "TimeoutError" })
    return new Response(JSON.stringify(r!.json), { status: r!.status })
  }) as unknown as typeof fetch
  return { calls, client: new PartnerClient({ transport: "direct", partnerId: "ongkirich", partnerSecret: "partner-secret", partnerOrigin: "https://partner.example", fetchImpl, now: () => 1_790_000_000_000 }) }
}

describe("PartnerClient direct", () => {
  it("signs the exact bytes it sends and maps outcomes", async () => {
    const { calls, client } = directClient([
      { status: 201, json: { success: true, alreadyRegistered: false, data: { sellerId: "s1", email: "e", apiKey: "API-1" } } },
      { status: 409, json: { success: false, code: "EMAIL_ALREADY_REGISTERED", message: "exists" } },
      { status: 503, json: { success: false, code: "KEY_PROVISIONING_FAILED", message: "retry" } },
      { status: 500, json: { success: false, code: "INTERNAL_ERROR" } },
      "timeout",
    ])
    const ok = await client.register({ name: "Toko", email: "e@x.test", phone: "081234567890", externalUserId: "t1" })
    expect(ok).toMatchObject({ kind: "ok", status: 201, data: { sellerId: "s1" } })
    const h = calls[0]!.init.headers as Record<string, string>
    expect(h["partner-id"]).toBe("ongkirich")
    expect(h.timestamp).toBe("1790000000")
    expect(h.signature).toBe(createHash("sha256").update(`POST:/api/partner/v1/sellers::${String(calls[0]!.init.body)}:1790000000:partner-secret`).digest("hex"))
    expect(await client.register({ name: "T", email: "e", phone: "08", externalUserId: "t2" })).toMatchObject({ kind: "error", status: 409, code: "EMAIL_ALREADY_REGISTERED" })
    expect(await client.register({ name: "T", email: "e", phone: "08", externalUserId: "t3" })).toMatchObject({ kind: "error", status: 503, code: "KEY_PROVISIONING_FAILED" })
    expect(await client.list()).toEqual({ kind: "maybe_sent", reason: "upstream_5xx" })
    expect(await client.regenerate("s1")).toEqual({ kind: "maybe_sent", reason: "timeout" })
  })

  it("a 200 whose body cannot be read is maybe_sent (regenerate may have rotated the key) — never an error", async () => {
    const fetchImpl = (async () => new Response("<html>truncated", { status: 200 })) as unknown as typeof fetch
    const client = new PartnerClient({ transport: "direct", partnerId: "ongkirich", partnerSecret: "partner-secret", partnerOrigin: "https://partner.example", fetchImpl, now: () => 1_790_000_000_000 })
    expect(await client.regenerate("s1")).toMatchObject({ kind: "maybe_sent" })
  })

  it("a 200 with a valid JSON body but no success envelope ({} / null / success without data) is maybe_sent", async () => {
    for (const body of ["{}", "null", '{"success":true}', '{"success":false}']) {
      const fetchImpl = (async () => new Response(body, { status: 200 })) as unknown as typeof fetch
      const client = new PartnerClient({ transport: "direct", partnerId: "ongkirich", partnerSecret: "partner-secret", partnerOrigin: "https://partner.example", fetchImpl, now: () => 1_790_000_000_000 })
      expect(await client.regenerate("s1")).toMatchObject({ kind: "maybe_sent" })
    }
  })
})

describe("PartnerClient through the relay program (local stub run)", () => {
  it("relay envelope verifies; 409 relay_duplicate becomes maybe_sent; denied targets never reach Mengantar", async () => {
    const upstream: string[] = []
    const relay = createRelay({
      secret: "relay-secret",
      upstreamOrigin: "https://partner.example",
      now: () => 1_790_000_000_000,
      log: () => {},
      fetchImpl: async (url: string) => {
        upstream.push(url)
        return new Response(JSON.stringify({ success: true, data: { sellers: [], total: 0 } }), { status: 200, headers: { "content-type": "application/json" } })
      },
    })
    let fixedId: string | null = null
    const fetchImpl = (async (url: string, init: RequestInit) => {
      expect(url).toBe("https://relay.example/forward")
      const headers = Object.fromEntries(Object.entries(init.headers as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]))
      if (fixedId) headers["x-relay-id"] = fixedId
      if (fixedId) {
        const body = String(init.body)
        headers["x-relay-signature"] = createHmac("sha256", "relay-secret").update(`${headers["x-relay-timestamp"]}\n${fixedId}\n${headers["x-relay-target"]}\n${createHash("sha256").update(body).digest("hex")}`).digest("hex")
      }
      const out = await relay.handle("POST", "/forward", headers, Buffer.from(String(init.body)))
      return new Response(typeof out.body === "string" ? out.body : new TextDecoder().decode(out.body), { status: out.status, headers: out.headers })
    }) as unknown as typeof fetch
    const client = new PartnerClient({ transport: "relay", partnerId: "ongkirich", partnerSecret: "ps", partnerOrigin: "https://unused.example", relayUrl: "https://relay.example", relaySecret: "relay-secret", fetchImpl, now: () => 1_790_000_000_000 })
    expect(await client.list({ externalUserId: "t1" })).toMatchObject({ kind: "ok", data: { total: 0 } })
    expect(upstream).toEqual(["https://partner.example/api/partner/v1/sellers/list"])
    fixedId = crypto.randomUUID()
    await client.list()
    expect(await client.list()).toEqual({ kind: "maybe_sent", reason: "relay_duplicate" })
    expect(upstream).toHaveLength(2)
    // A client with the wrong relay secret is refused by the relay, never by Mengantar.
    fixedId = null
    const bad = new PartnerClient({ transport: "relay", partnerId: "ongkirich", partnerSecret: "ps", partnerOrigin: "https://unused.example", relayUrl: "https://relay.example", relaySecret: "wrong", fetchImpl, now: () => 1_790_000_000_000 })
    expect(await bad.apiKey("s1")).toEqual({ kind: "relay_refused", status: 401, code: "relay_auth_failed" })
    expect(upstream).toHaveLength(2)
  })
  it("relay transport requires its URL and secret", () => {
    expect(() => new PartnerClient({ transport: "relay", partnerId: "p", partnerSecret: "s", partnerOrigin: "o" })).toThrow()
  })
})
