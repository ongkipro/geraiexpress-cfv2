import { describe, expect, it } from "vitest"
import { classify, HostCache, normalizeHost, probeSignature, type HostRow, type HostNames } from "../../src/host/classify"

const NAMES: HostNames = { platformApex: "geraiexpress.com", tenantZone: "gerai.cc" }
const ROWS: Record<string, HostRow> = {
  "berkahjaya.gerai.cc": { hostname: "berkahjaya.gerai.cc", tenantId: "t-a", tenantSlug: "berkahjaya", hostState: "active", tenantStatus: "active", schemaState: "ok", routingVersion: 3 },
  "kirim.tokobudi.id": { hostname: "kirim.tokobudi.id", tenantId: "t-b", tenantSlug: "tokobudi", hostState: "active", tenantStatus: "active", schemaState: "ok", routingVersion: 1 },
  "pending.gerai.cc": { hostname: "pending.gerai.cc", tenantId: "t-c", tenantSlug: "pending", hostState: "pending", tenantStatus: "active", schemaState: "ok", routingVersion: 1 },
  "beku.gerai.cc": { hostname: "beku.gerai.cc", tenantId: "t-d", tenantSlug: "beku", hostState: "active", tenantStatus: "suspended", schemaState: "ok", routingVersion: 2 },
  "pulih.gerai.cc": { hostname: "pulih.gerai.cc", tenantId: "t-e", tenantSlug: "pulih", hostState: "active", tenantStatus: "active", schemaState: "recovery", routingVersion: 1 },
  "lama.gerai.cc": { hostname: "lama.gerai.cc", tenantId: "t-f", tenantSlug: "lama", hostState: "purged", tenantStatus: "active", schemaState: "ok", routingVersion: 1 },
  "baru.gerai.cc": { hostname: "baru.gerai.cc", tenantId: "t-g", tenantSlug: "baru", hostState: "active", tenantStatus: "pending_review", schemaState: "ok", routingVersion: 1 },
}

function setup(rows: Record<string, HostRow> = ROWS) {
  const calls: string[] = []
  const lookup = async (h: string) => {
    calls.push(h)
    return rows[h] ?? null
  }
  return { calls, lookup, cache: new HostCache() }
}

const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers })

describe("normalizeHost (spec 11 §3 step 2)", () => {
  it.each([
    ["App.GeraiExpress.com", "app.geraiexpress.com"],
    ["app.geraiexpress.com:443", "app.geraiexpress.com"],
    ["app.geraiexpress.com.", "app.geraiexpress.com"],
    ["BerkahJaya.Gerai.CC.:8787", "berkahjaya.gerai.cc"],
  ])("%s → %s", (raw, out) => expect(normalizeHost(raw)).toBe(out))
  it.each(["127.0.0.1", "10.0.0.1:80", "[::1]", "[::1]:8787", "localhost", "", "a..b.com", "-x.gerai.cc", "x".repeat(250) + ".cc", "app.geraiexpress.com:abc", "0177.0.0.1", "0x7f.0.0.1", "0x7f.0x0.0x0.0x1", "127.1", "127.0.1", "1.2.3.4.5", "host.c"])(
    "rejects %s",
    (raw) => expect(normalizeHost(raw)).toBeNull(),
  )
})

describe("classify — platform contexts", () => {
  it.each([
    ["https://geraiexpress.com/", "MARKETING_APEX"],
    ["https://www.geraiexpress.com/", "MARKETING_APEX"],
    ["https://app.geraiexpress.com/kiriman", "GERAI_WORKSPACE"],
    ["https://owner.geraiexpress.com/", "PLATFORM_OWNER"],
    ["https://hooks.geraiexpress.com/webhooks/mengantar/x", "WEBHOOK_INGEST"],
  ])("%s → %s without any tenant lookup", async (url, ctx) => {
    const s = setup()
    const r = await classify(req(url), NAMES, s.lookup, s.cache)
    expect(r).toMatchObject({ outcome: "ok", ctx: { kind: "platform", context: ctx } })
    expect(s.calls).toEqual([])
  })
  it("relay. and unknown platform subdomains are never served", async () => {
    const s = setup()
    for (const h of ["relay.geraiexpress.com", "api.geraiexpress.com", "x.app.geraiexpress.com"]) {
      expect(await classify(req(`https://${h}/`), NAMES, s.lookup, s.cache)).toEqual({ outcome: "not_found" })
    }
    expect(s.calls).toEqual([])
  })
  it("staging labels map to the same contexts (spec 07 §7)", async () => {
    const s = setup()
    const st: HostNames = { ...NAMES, stagingLabels: true }
    expect(await classify(req("https://app-staging.geraiexpress.com/"), st, s.lookup, s.cache)).toMatchObject({ ctx: { context: "GERAI_WORKSPACE" } })
    expect(await classify(req("https://app.geraiexpress.com/"), st, s.lookup, s.cache)).toEqual({ outcome: "not_found" })
  })
})

describe("classify — tenant hosts", () => {
  it("active subdomain and active custom domain resolve to their tenant", async () => {
    const s = setup()
    expect(await classify(req("https://berkahjaya.gerai.cc/"), NAMES, s.lookup, s.cache)).toMatchObject({
      outcome: "ok",
      ctx: { kind: "tenant", tenantId: "t-a", tenantSlug: "berkahjaya", routingVersion: 3 },
    })
    expect(await classify(req("https://kirim.tokobudi.id/lacak"), NAMES, s.lookup, s.cache)).toMatchObject({ ctx: { tenantId: "t-b" } })
  })
  it("unknown, pending, purged and not-yet-active tenants → neutral 404", async () => {
    const s = setup()
    for (const h of ["nope.gerai.cc", "pending.gerai.cc", "lama.gerai.cc", "baru.gerai.cc", "unknown.example.com"]) {
      expect(await classify(req(`https://${h}/`), NAMES, s.lookup, s.cache), h).toEqual({ outcome: "not_found" })
    }
  })
  it("suspended → 403, recovery → 503", async () => {
    const s = setup()
    expect(await classify(req("https://beku.gerai.cc/"), NAMES, s.lookup, s.cache)).toEqual({ outcome: "suspended" })
    expect(await classify(req("https://pulih.gerai.cc/"), NAMES, s.lookup, s.cache)).toEqual({ outcome: "recovery" })
  })
  it("the tenant zone apex and two-level names under it are not tenants", async () => {
    const s = setup({ ...ROWS, "gerai.cc": ROWS["berkahjaya.gerai.cc"]!, "a.berkahjaya.gerai.cc": ROWS["berkahjaya.gerai.cc"]! })
    expect(await classify(req("https://gerai.cc/"), NAMES, s.lookup, s.cache)).toEqual({ outcome: "not_found" })
    expect(await classify(req("https://a.berkahjaya.gerai.cc/"), NAMES, s.lookup, s.cache)).toEqual({ outcome: "not_found" })
    expect(s.calls).toEqual([])
  })
  it("ignores X-Forwarded-Host", async () => {
    const s = setup()
    const r = await classify(req("https://nope.gerai.cc/", { "x-forwarded-host": "berkahjaya.gerai.cc" }), NAMES, s.lookup, s.cache)
    expect(r).toEqual({ outcome: "not_found" })
    expect(s.calls).toEqual(["nope.gerai.cc"])
  })
  it("Host header wins over a forged absolute URL host", async () => {
    const s = setup()
    const r = await classify(req("https://berkahjaya.gerai.cc/", { host: "nope.gerai.cc" }), NAMES, s.lookup, s.cache)
    expect(r).toEqual({ outcome: "not_found" })
  })
  it("IP-literal hosts are rejected before any lookup", async () => {
    const s = setup()
    expect(await classify(req("http://127.0.0.1/", { host: "127.0.0.1:8787" }), NAMES, s.lookup, s.cache)).toEqual({ outcome: "bad_request" })
    expect(s.calls).toEqual([])
  })
})

describe("classify — DCV and probe", () => {
  it("DCV paths pass through on candidate tenant hosts (GET/HEAD), before the lookup", async () => {
    const s = setup()
    for (const p of ["/.well-known/acme-challenge/abc", "/.well-known/pki-validation/x.txt"]) {
      expect(await classify(req(`https://nope.gerai.cc${p}`), NAMES, s.lookup, s.cache)).toEqual({ outcome: "dcv" })
      expect(await classify(req(`https://kirim.tokobudi.id${p}`), NAMES, s.lookup, s.cache)).toEqual({ outcome: "dcv" })
    }
    expect(s.calls).toEqual([])
  })
  it("DCV is never passed through on platform hosts, relay., or for unsafe methods", async () => {
    const s = setup()
    const p = "/.well-known/acme-challenge/abc"
    for (const h of ["relay.geraiexpress.com", "app.geraiexpress.com", "geraiexpress.com", "x.y.gerai.cc"]) {
      expect(await classify(req(`https://${h}${p}`), NAMES, s.lookup, s.cache), h).toEqual({ outcome: "not_found" })
    }
    expect(await classify(new Request(`https://nope.gerai.cc${p}`, { method: "POST" }), NAMES, s.lookup, s.cache)).toEqual({ outcome: "not_found" })
  })
  it("probe is answered for pending hosts but every other path on a pending host stays 404", async () => {
    const s = setup()
    const nonce = "n".repeat(24)
    expect(await classify(req(`https://pending.gerai.cc/.well-known/geraiexpress-probe/${nonce}`), NAMES, s.lookup, s.cache)).toEqual({
      outcome: "probe",
      host: "pending.gerai.cc",
      nonce,
    })
    expect(await classify(req("https://pending.gerai.cc/"), NAMES, s.lookup, s.cache)).toEqual({ outcome: "not_found" })
    expect(await classify(req(`https://nope.gerai.cc/.well-known/geraiexpress-probe/${nonce}`), NAMES, s.lookup, s.cache)).toEqual({ outcome: "not_found" })
    expect(await classify(req(`https://lama.gerai.cc/.well-known/geraiexpress-probe/${nonce}`), NAMES, s.lookup, s.cache)).toEqual({ outcome: "not_found" })
  })
  it("probe signature is HMAC-SHA256(secret, host:nonce) — no cross-TLD collision", async () => {
    const a = await probeSignature("s", "kirim.tokobudi.id", "n1")
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await probeSignature("s", "kirim.tokobudi.id", "n2")).not.toBe(a)
    expect(await probeSignature("s", "other.id", "n1")).not.toBe(a)
    // kirim.toko.co + "m<nonce>" must not equal kirim.toko.com + "<nonce>"
    expect(await probeSignature("s", "kirim.toko.co", "mabcdefghijklmnop")).not.toBe(await probeSignature("s", "kirim.toko.com", "abcdefghijklmnop"))
  })
  it("probe is GET only and refused for suspended tenants and moved/purged hosts", async () => {
    const nonce = "n".repeat(24)
    const s = setup({ ...ROWS, "pindah.gerai.cc": { ...ROWS["berkahjaya.gerai.cc"]!, hostname: "pindah.gerai.cc", hostState: "moved" } })
    expect(await classify(new Request(`https://pending.gerai.cc/.well-known/geraiexpress-probe/${nonce}`, { method: "POST" }), NAMES, s.lookup, s.cache)).toEqual({ outcome: "not_found" })
    for (const h of ["beku.gerai.cc", "pindah.gerai.cc", "lama.gerai.cc"]) {
      expect(await classify(req(`https://${h}/.well-known/geraiexpress-probe/${nonce}`), NAMES, s.lookup, s.cache), h).toEqual({ outcome: "not_found" })
    }
  })
})

describe("in-isolate cache ≤ 30 s (suspension visible within the window)", () => {
  it("caches positive and negative answers for at most 30 s", async () => {
    const rows = { ...ROWS }
    const s = setup(rows)
    const t0 = 1_000_000
    expect(await classify(req("https://berkahjaya.gerai.cc/"), NAMES, s.lookup, s.cache, t0)).toMatchObject({ outcome: "ok" })
    rows["berkahjaya.gerai.cc"] = { ...rows["berkahjaya.gerai.cc"]!, tenantStatus: "suspended", schemaState: "ok", routingVersion: 4 }
    expect(await classify(req("https://berkahjaya.gerai.cc/"), NAMES, s.lookup, s.cache, t0 + 29_999)).toMatchObject({ outcome: "ok" })
    expect(await classify(req("https://berkahjaya.gerai.cc/"), NAMES, s.lookup, s.cache, t0 + 30_000)).toEqual({ outcome: "suspended" })
    expect(s.calls).toEqual(["berkahjaya.gerai.cc", "berkahjaya.gerai.cc"])
  })
})
