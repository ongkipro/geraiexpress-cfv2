// spec 10 §6 checks against a running relay (TASK-601). Reads RELAY_SECRET (and for steps 3/4 the Partner id +
// secret) from the environment, e.g. through `secrets-env run`. Usage:
//   secrets-env run -- node infra/partner-relay/verify.mjs <relay base URL> [--partner-sandbox|--partner-production]
// Steps 2 (auth/allowlist/duplicate) always run; steps 3/4 (a real `POST /sellers/list` through the relay) run only with
// a flag, need MENGANTAR_PARTNER_ID + MENGANTAR_PARTNER_SECRET in the environment and are owner-approved actions.
// Exits 1 on any failed check. Prints no secret and no response body.
import { createHash, createHmac, randomUUID } from "node:crypto"

const [base, flag] = process.argv.slice(2)
if (flag !== undefined && flag !== "--partner-sandbox" && flag !== "--partner-production") {
  console.error(`unknown flag ${flag} (use --partner-sandbox or --partner-production)`)
  process.exit(2)
}
const secret = process.env.RELAY_SECRET
if (!base || !secret) {
  console.error("usage: secrets-env run -- node infra/partner-relay/verify.mjs <relay base URL> [--partner-sandbox|--partner-production]")
  process.exit(2)
}
const sha = (b) => createHash("sha256").update(b).digest("hex")
const sign = (s, ts, id, target, body) => createHmac("sha256", s).update(`${ts}\n${id}\n${target}\n${sha(body)}`).digest("hex")
async function forward({ target = "/api/partner/v1/sellers/list", body = "{}", ts = Math.floor(Date.now() / 1000), id = randomUUID(), sig, extra = {} } = {}) {
  ts = String(ts)
  const res = await fetch(`${base.replace(/\/$/, "")}/forward`, {
    signal: AbortSignal.timeout(15_000),
    method: "POST",
    headers: { "content-type": "application/json", "x-relay-timestamp": String(ts), "x-relay-id": id, "x-relay-target": target, "x-relay-signature": sig ?? sign(secret, ts, id, target, body), ...extra },
    body,
  })
  const text = await res.text()
  let code
  try {
    code = JSON.parse(text).code ?? null
  } catch {
    code = "non_json_response"
  }
  return { status: res.status, code }
}

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`)
}

const h = await fetch(`${base.replace(/\/$/, "")}/healthz`, { signal: AbortSignal.timeout(15_000) })
check("healthz", h.status === 200 && (await h.text()).includes('"ok":true'), `status ${h.status}`)
let r = await forward({ sig: "0".repeat(64) })
check("bad HMAC → 401 relay_auth_failed", r.status === 401 && r.code === "relay_auth_failed", `${r.status} ${r.code}`)
r = await forward({ ts: Math.floor(Date.now() / 1000) - 120 })
check("timestamp older than 60 s → 401 relay_auth_failed", r.status === 401 && r.code === "relay_auth_failed", `${r.status} ${r.code}`)
r = await forward({ target: "/api/public/x/order" })
check("non-allowlisted target → 403 relay_target_denied", r.status === 403 && r.code === "relay_target_denied", `${r.status} ${r.code}`)
r = await forward({ target: "/api/partner/v1/sellers/api-key/regenerate/../../admin" })
check("path traversal target → 403 relay_target_denied", r.status === 403 && r.code === "relay_target_denied", `${r.status} ${r.code}`)
const big = "x".repeat(64 * 1024 + 10)
r = await forward({ body: big })
check("body > 64 KB → 413", r.status === 413, `${r.status} ${r.code}`)

if (flag === "--partner-sandbox" || flag === "--partner-production") {
  const pid = process.env.MENGANTAR_PARTNER_ID
  const psecret = process.env.MENGANTAR_PARTNER_SECRET
  if (!pid || !psecret) {
    check("partner call", false, "MENGANTAR_PARTNER_ID / MENGANTAR_PARTNER_SECRET not set")
  } else {
    const target = "/api/partner/v1/sellers/list"
    const body = JSON.stringify({ externalUserId: "relay-verify-probe" })
    const ts = String(Math.floor(Date.now() / 1000))
    // Mengantar Partner signature as the SDK computes it (TYPE empty for partner routes, spec 10 §4.2 item 3).
    const signature = sha(`POST:${target}::${body}:${ts}:${psecret}`)
    const id = randomUUID()
    r = await forward({ target, body, id, extra: { "partner-id": pid, timestamp: ts, signature } })
    check(`${flag.slice(2)} POST /sellers/list via relay → 200`, r.status === 200, `status ${r.status}`)
    const dup = await forward({ target, body, id, extra: { "partner-id": pid, timestamp: ts, signature } })
    check("same X-Relay-Id again → 409 relay_duplicate (no second upstream call)", dup.status === 409 && dup.code === "relay_duplicate", `${dup.status} ${dup.code}`)
  }
} else console.log("SKIP partner call and duplicate guard (no --partner-* flag; the guard is covered by relay.test.mjs)")
const failed = results.filter((x) => !x.ok)
console.log(failed.length ? `RELAY VERIFY FAIL (${failed.length})` : `RELAY VERIFY PASS (${results.length} checks)`)
process.exit(failed.length ? 1 : 0)
