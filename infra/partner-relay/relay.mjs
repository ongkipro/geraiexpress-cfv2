// infra/partner-relay — stateless static-egress forwarder for the 4 Mengantar Partner routes (spec 10 §4.2, DEC-219).
// Node ≥ 22, zero dependencies. No Mengantar secret lives here; bodies and headers are never logged.
import { createHash, createHmac, timingSafeEqual } from "node:crypto"

export const ALLOWED_TARGETS = new Set(["/api/partner/v1/sellers", "/api/partner/v1/sellers/list", "/api/partner/v1/sellers/api-key", "/api/partner/v1/sellers/api-key/regenerate"])
const FORWARD_HEADERS = ["content-type", "partner-id", "timestamp", "signature"]
const MAX_BODY = 64 * 1024
const MAX_RESPONSE = 1024 * 1024
const WINDOW_S = 60
const DUP_TTL_MS = 120_000

export function createRelay({ secret, previousSecret = "", upstreamOrigin, fetchImpl = fetch, now = () => Date.now(), maxConcurrent = 4, log = (line) => console.log(line) }) {
  if (!secret || !upstreamOrigin) throw new Error("RELAY_SECRET and MENGANTAR_PARTNER_ORIGIN are required")
  const seen = new Map()
  let inFlight = 0
  const json = (status, code) => ({ status, body: JSON.stringify({ success: false, code }), headers: { "content-type": "application/json" } })

  function verify(sig, ts, id, target, body) {
    const msg = `${ts}\n${id}\n${target}\n${createHash("sha256").update(body).digest("hex")}`
    for (const s of [secret, previousSecret].filter(Boolean)) {
      const expected = Buffer.from(createHmac("sha256", s).update(msg).digest("hex"))
      const got = Buffer.from(String(sig))
      if (got.length === expected.length && timingSafeEqual(got, expected)) return true
    }
    return false
  }

  /** Pure handler: (method, path, headers, body Buffer) → { status, body, headers }. */
  async function handle(method, path, headers, body) {
    if (method === "GET" && path === "/healthz") return { status: 200, body: JSON.stringify({ ok: true }), headers: { "content-type": "application/json" } }
    if (method !== "POST" || path !== "/forward") return json(404, "relay_not_found")
    if (body.length > MAX_BODY) return json(413, "relay_body_too_large")
    const ts = headers["x-relay-timestamp"]
    const id = headers["x-relay-id"]
    const target = headers["x-relay-target"]
    const sig = headers["x-relay-signature"]
    if (!ts || !id || !target || !sig || !/^\d{9,11}$/.test(ts) || !/^[0-9a-f-]{36}$/i.test(id)) return json(401, "relay_auth_failed")
    if (Math.abs(Math.floor(now() / 1000) - Number(ts)) > WINDOW_S) return json(401, "relay_auth_failed")
    if (!verify(sig, ts, id, target, body)) return json(401, "relay_auth_failed")
    if (!ALLOWED_TARGETS.has(target)) return json(403, "relay_target_denied")
    const t = now()
    for (const [k, at] of seen) if (t - at > DUP_TTL_MS) seen.delete(k)
    if (seen.has(id)) return json(409, "relay_duplicate")
    seen.set(id, t)
    if (inFlight >= maxConcurrent) return json(503, "relay_busy")
    inFlight++
    const started = now()
    try {
      const fwd = {}
      for (const h of FORWARD_HEADERS) if (headers[h]) fwd[h] = headers[h]
      const res = await fetchImpl(`${upstreamOrigin.replace(/\/$/, "")}${target}`, { method: "POST", headers: fwd, body, redirect: "manual", signal: AbortSignal.timeout(15_000) })
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > MAX_RESPONSE) return json(502, "relay_response_too_large")
      log(JSON.stringify({ relay_id: id, target, status: res.status, ms: now() - started }))
      return { status: res.status, body: buf, headers: { "content-type": res.headers.get("content-type") ?? "application/json" } }
    } catch (e) {
      const timeout = e?.name === "TimeoutError" || e?.name === "AbortError"
      log(JSON.stringify({ relay_id: id, target, status: timeout ? "timeout" : "error", ms: now() - started }))
      return json(504, timeout ? "relay_upstream_timeout" : "relay_upstream_error")
    } finally {
      inFlight--
    }
  }

  return { handle }
}
