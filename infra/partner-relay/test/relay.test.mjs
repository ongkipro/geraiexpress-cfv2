import { createHash, createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { createRelay } from "../relay.mjs"

const RELAY_TEST_VALUE = "relay-test-value" // synthetic, not a credential
const T = 1_790_000_000
const sign = (secret, ts, id, target, body) => createHmac("sha256", secret).update(`${ts}\n${id}\n${target}\n${createHash("sha256").update(body).digest("hex")}`).digest("hex")
const uuid = () => crypto.randomUUID()

function setup(opts = {}) {
  const calls = []
  const fetchImpl = opts.fetchImpl ?? (async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ success: true, data: { sellers: [] } }), { status: 200, headers: { "content-type": "application/json" } })
  })
  const relay = createRelay({ secret: RELAY_TEST_VALUE, previousSecret: opts.previous ?? "", upstreamOrigin: "https://partner.mengantar.example", fetchImpl, now: () => (opts.nowS ?? T) * 1000, log: () => {} })
  return { relay, calls }
}

function req(target = "/api/partner/v1/sellers/list", body = '{"page":1}', o = {}) {
  const ts = String(o.ts ?? T)
  const id = o.id ?? uuid()
  return {
    "x-relay-timestamp": ts,
    "x-relay-id": id,
    "x-relay-target": target,
    "x-relay-signature": o.sig ?? sign(o.secret ?? RELAY_TEST_VALUE, ts, id, target, body),
    "content-type": "application/json",
    "partner-id": "ongkirich",
    timestamp: ts,
    signature: "mengantar-sig",
    cookie: "should-not-forward",
    ...o.extra,
  }
}
const send = (relay, headers, body = '{"page":1}') => relay.handle("POST", "/forward", headers, Buffer.from(body))
const code = (r) => JSON.parse(String(r.body)).code

describe("partner relay (spec 10 §4.2)", () => {
  it("forwards an allowed, correctly signed request with exactly the 4 Mengantar headers and the exact body", async () => {
    const { relay, calls } = setup()
    const r = await send(relay, req())
    expect(r.status).toBe(200)
    expect(calls[0].url).toBe("https://partner.mengantar.example/api/partner/v1/sellers/list")
    expect(calls[0].init.headers).toEqual({ "content-type": "application/json", "partner-id": "ongkirich", timestamp: String(T), signature: "mengantar-sig" })
    expect(String(calls[0].init.body)).toBe('{"page":1}')
    expect(calls[0].init.redirect).toBe("manual")
  })
  it("refuses bad HMAC, stale timestamps, tampered bodies and missing headers (relay_auth_failed)", async () => {
    const { relay, calls } = setup()
    expect(code(await send(relay, req(undefined, undefined, { sig: "00" })))).toBe("relay_auth_failed")
    expect(code(await send(relay, req(undefined, undefined, { ts: T - 61 })))).toBe("relay_auth_failed")
    expect(code(await send(relay, req(), '{"page":2}'))).toBe("relay_auth_failed")
    expect(code(await send(relay, { ...req(), "x-relay-id": undefined }))).toBe("relay_auth_failed")
    expect(calls).toHaveLength(0)
  })
  it("accepts RELAY_SECRET_PREVIOUS during rotation only when configured", async () => {
    expect((await send(setup({ previous: "old" }).relay, req(undefined, undefined, { secret: "old" }))).status).toBe(200)
    expect(code(await send(setup().relay, req(undefined, undefined, { secret: "old" })))).toBe("relay_auth_failed")
  })
  it("allows only the 4 Partner paths (relay_target_denied)", async () => {
    const { relay, calls } = setup()
    for (const t of ["/api/partner/v1/sellers/delete", "/api/public/KEY/order", "/api/partner/v1/sellers/../admin"]) {
      expect(code(await send(relay, req(t)))).toBe("relay_target_denied")
    }
    expect(calls).toHaveLength(0)
  })
  it("answers a repeated X-Relay-Id within 120 s with relay_duplicate without calling Mengantar", async () => {
    const { relay, calls } = setup()
    const id = uuid()
    expect((await send(relay, req(undefined, undefined, { id }))).status).toBe(200)
    expect(code(await send(relay, req(undefined, undefined, { id })))).toBe("relay_duplicate")
    expect(calls).toHaveLength(1)
  })
  it("maps an upstream timeout to relay_upstream_timeout; health answers without upstream", async () => {
    const { relay } = setup({ fetchImpl: async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }) } })
    expect(code(await send(relay, req()))).toBe("relay_upstream_timeout")
    const h = await relay.handle("GET", "/healthz", {}, Buffer.alloc(0))
    expect(JSON.parse(String(h.body))).toEqual({ ok: true })
  })
  it("rejects oversize bodies and unknown paths", async () => {
    const { relay } = setup()
    expect(code(await relay.handle("POST", "/forward", req(), Buffer.alloc(64 * 1024 + 1)))).toBe("relay_body_too_large")
    expect((await relay.handle("POST", "/other", req(), Buffer.from("{}"))).status).toBe(404)
  })

  it("a call refused as busy is not remembered: its retry with the same X-Relay-Id is forwarded", async () => {
    let release
    const gate = new Promise((r) => (release = r))
    const calls = []
    const fetchImpl = async (url) => {
      calls.push(url)
      await gate
      return new Response('{"success":true,"data":{}}', { status: 200 })
    }
    const relay = createRelay({ secret: RELAY_TEST_VALUE, upstreamOrigin: "https://partner.mengantar.example", fetchImpl, now: () => T * 1000, log: () => {}, maxConcurrent: 1 })
    const first = send(relay, req())
    const h = req()
    expect(code(await send(relay, h))).toBe("relay_busy")
    release()
    await first
    expect((await send(relay, h)).status).toBe(200)
    expect(calls.length).toBe(2)
  })
})
