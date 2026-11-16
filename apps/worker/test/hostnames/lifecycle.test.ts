// TASK-505 custom-domain lifecycle (spec 11 §5–7) with a mocked Cloudflare for SaaS API and an injected clock:
// request → create before CNAME (queue, 15/min) → poll → HMAC probe → active + routing; poll cadence; 7-day reaper;
// quota alert at 80 %; Pro gate, platform names, one domain per gerai, root + www; remedies; Kasir 403.
import { env, exports } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { probeSignature } from "../../src/host/classify"
import { mockCf } from "../../src/hostnames/cloudflare"
import { checkQuota, createAtCloudflare, planDomain, pollHosts, POLL_EVERY_MS, primaryHost, reapHosts, REAP_AFTER_MS, refreshHost, remedyOf, type DomainRow } from "../../src/hostnames/service"
import { appGet, appPost, seedConnected } from "../webhooks/helpers"
import { checkoutGerai } from "../dispatch/helpers"

beforeEach(async () => {
  mockCf.reset()
  hostCache.clear()
  await env.DB.prepare("DELETE FROM auth_throttle WHERE key = 'cf-saas-issue'").run()
})

/** A probe that answers like this deployment would (HMAC) for the given hosts, 404 otherwise. */
const probeVia = (reachable: Set<string>) => async (url: string) => {
  const u = new URL(url)
  if (!reachable.has(u.hostname)) return new Response("nope", { status: 404 })
  return new Response(await probeSignature(env.PROBE_SECRET, u.hostname, u.pathname.split("/").pop()!))
}
const wrongProbe = async () => new Response("0".repeat(64))

async function pro(slug: string, enabled = true) {
  const t = await checkoutGerai(slug)
  await env.DB.prepare("INSERT INTO tenant_hostnames (hostname, tenant_id, kind, state, created_at, activated_at) VALUES (?1, ?2, 'platform_subdomain', 'active', 1, 1)").bind(`${slug}.geraimitra.localhost`, t.tenantId).run()
  if (enabled) await env.DB.prepare("UPDATE tenants SET custom_domain_enabled = 1 WHERE id = ?").bind(t.tenantId).run()
  return t
}
const row = (h: string) => env.DB.prepare("SELECT * FROM tenant_hostnames WHERE hostname = ?").bind(h).first<DomainRow & { routing_version?: number }>()
const rv = (tenantId: string) => env.DB.prepare("SELECT routing_version FROM tenants WHERE id = ?").bind(tenantId).first<{ routing_version: number }>().then((r) => r!.routing_version)
const site = (host: string, path = "/") => exports.default.fetch(`http://${host}${path}`, { headers: { host, "cf-connecting-ip": "198.51.100.7" }, redirect: "manual" })

describe("custom domain lifecycle", () => {
  it("planDomain: normalises, refuses platform names, root → root + www, www/subdomain branches", () => {
    const e = { TENANT_ZONE: "geraimitra.localhost", PLATFORM_APEX: "geraiexpress.localhost" }
    expect(planDomain(e, "  https://Kirim.TokoBudi.id/ ", null)).toEqual({ hosts: [{ hostname: "kirim.tokobudi.id", role: "primary" }], branch: "subdomain" })
    expect(planDomain(e, "tokobudi.id", null)).toEqual({ hosts: [{ hostname: "tokobudi.id", role: "primary" }, { hostname: "www.tokobudi.id", role: "redirect" }], branch: "root_primary" })
    expect(planDomain(e, "tokobudi.co.id", "www_primary")).toEqual({ hosts: [{ hostname: "www.tokobudi.co.id", role: "primary" }], branch: "www_primary" })
    expect(planDomain(e, "www.tokobudi.co.id", null).branch).toBe("www_primary")
    expect(planDomain(e, "kirim.tokobudi.co.id", null).branch).toBe("subdomain")
    for (const bad of ["budi.geraimitra.com", "geraimitra.com", "app.geraiexpress.com", "x.geraimitra.localhost", "127.0.0.1", "tokobudi", "", "xn--mnchen-3ya.de"]) expect(() => planDomain(e, bad, null), bad).toThrow()
  })

  it("request → create at Cloudflare first (queue) → pending 404 → active+ssl → probe → active, routing bump, canonical switch", async () => {
    const t = await pro("cdhidup")
    const r = await appPost("/custom-domain", t.cookie, { hostname: "kirim.tokohidup.id" })
    expect(r.status).toBe(201)
    let h = (await row("kirim.tokohidup.id"))!
    expect(h.state).toBe("pending")
    // The queue may or may not have run yet; run the create step explicitly (idempotent).
    await createAtCloudflare(env, "kirim.tokohidup.id", Date.now())
    await createAtCloudflare(env, "kirim.tokohidup.id", Date.now())
    expect(mockCf.calls.filter((c) => c.startsWith("create")).length).toBe(1)
    h = (await row("kirim.tokohidup.id"))!
    expect(h.cf_custom_hostname_id).toBeTruthy()
    expect(JSON.parse(h.dns_records_json!).ownership.name).toBe("_cf-custom-hostname.kirim.tokohidup.id")
    // Pending host: every path but the probe is a neutral 404.
    expect((await site("kirim.tokohidup.id")).status).toBe(404)
    const view = (await (await appGet("/custom-domain", t.cookie)).json()) as { data: { cnameTarget: string; domains: Array<{ state: string; remedy: { code: string } }> } }
    expect(view.data.cnameTarget).toBe("cname.geraimitra.localhost")
    expect(view.data.domains[0]!.remedy.code).toBe("dns")

    const before = await rv(t.tenantId)
    const now = Date.now()
    // Cloudflare active but the host does not reach us → stays pending, remedy "probe".
    mockCf.advance("kirim.tokohidup.id", "active", "active")
    await refreshHost(env, "kirim.tokohidup.id", now, { probeFetch: wrongProbe })
    h = (await row("kirim.tokohidup.id"))!
    expect(h.state).toBe("pending")
    expect(remedyOf(h)!.code).toBe("probe")
    expect(await primaryHost(env, t.tenantId, "cdhidup")).toBe("cdhidup.geraimitra.localhost")
    // Probe matches → active.
    await refreshHost(env, "kirim.tokohidup.id", now + 1, { probeFetch: probeVia(new Set(["kirim.tokohidup.id"])) })
    h = (await row("kirim.tokohidup.id"))!
    expect(h.state).toBe("active")
    expect(h.probe_ok_at).toBe(now + 1)
    expect(await rv(t.tenantId)).toBe(before + 1)
    expect(await primaryHost(env, t.tenantId, "cdhidup")).toBe("kirim.tokohidup.id")
    hostCache.clear()
    const home = await site("kirim.tokohidup.id", "/")
    expect(home.status).toBe(200)
    expect(await home.text()).toContain('rel="canonical" href="https://kirim.tokohidup.id/"')
    // The platform subdomain keeps working and points canonical at the custom host.
    expect(await (await site("cdhidup.geraimitra.localhost", "/")).text()).toContain('href="https://kirim.tokohidup.id/"')
  })

  it("root_primary: www redirects to the root once active; one domain per gerai; taken by another gerai; Pro gate; Kasir 403", async () => {
    const a = await pro("cdakar")
    expect((await appPost("/custom-domain", a.cookie, { hostname: "tokoakar.id" })).status).toBe(201)
    expect((await appPost("/custom-domain", a.cookie, { hostname: "lain.tokoakar.id" })).status).toBe(409)
    const b = await pro("cdlain")
    const taken = await appPost("/custom-domain", b.cookie, { hostname: "www.tokoakar.id" })
    expect(taken.status).toBe(409)
    expect(((await taken.json()) as { error: { message: string } }).error.message).toBe("Domain ini sudah dipakai gerai lain.")
    const free = await pro("cdgratis", false)
    expect((await appPost("/custom-domain", free.cookie, { hostname: "tokogratis.id" })).status).toBe(403)
    const kasir = await seedConnected("cdkasir", { role: "cashier" })
    expect((await appGet("/custom-domain", kasir.cookie)).status).toBe(403)

    for (const h of ["tokoakar.id", "www.tokoakar.id"]) {
      await createAtCloudflare(env, h, Date.now())
      mockCf.advance(h, "active", "active")
      await refreshHost(env, h, Date.now(), { probeFetch: probeVia(new Set(["tokoakar.id", "www.tokoakar.id"])) })
    }
    hostCache.clear()
    const w = await site("www.tokoakar.id", "/lacak?q=ABC")
    expect(w.status).toBe(301)
    expect(w.headers.get("location")).toBe("https://tokoakar.id/lacak?q=ABC")
    expect((await site("tokoakar.id", "/")).status).toBe(200)
  })

  it("poll cadence: only hosts not checked for ~10 min are polled; a probe failure on an active host alerts after 3", async () => {
    const t = await pro("cdpoll")
    await appPost("/custom-domain", t.cookie, { hostname: "kirim.tokopoll.id" })
    await createAtCloudflare(env, "kirim.tokopoll.id", Date.now())
    const t0 = Date.now()
    await env.DB.prepare("UPDATE tenant_hostnames SET last_checked_at = ? WHERE hostname = 'kirim.tokopoll.id'").bind(t0).run()
    const id = (await row("kirim.tokopoll.id"))!.cf_custom_hostname_id!
    mockCf.calls = []
    await pollHosts(env, t0 + 5 * 60_000, wrongProbe)
    expect(mockCf.calls).not.toContain(`get ${id}`)
    expect((await row("kirim.tokopoll.id"))!.last_checked_at).toBe(t0)
    await pollHosts(env, t0 + POLL_EVERY_MS, wrongProbe)
    expect(mockCf.calls.filter((c) => c === `get ${id}`).length).toBe(1)
    expect((await row("kirim.tokopoll.id"))!.last_checked_at).toBe(t0 + POLL_EVERY_MS)
    // Active host failing its probe 3× in a row raises one alert (deduped key).
    mockCf.advance("kirim.tokopoll.id", "active", "active")
    await refreshHost(env, "kirim.tokopoll.id", t0 + POLL_EVERY_MS * 2, { probeFetch: probeVia(new Set(["kirim.tokopoll.id"])) })
    expect((await row("kirim.tokopoll.id"))!.state).toBe("active")
    for (let i = 3; i <= 5; i++) await refreshHost(env, "kirim.tokopoll.id", t0 + POLL_EVERY_MS * i, { probeFetch: wrongProbe })
    expect((await row("kirim.tokopoll.id"))!.probe_failures).toBe(3)
    expect(await env.DB.prepare("SELECT count FROM alert_state WHERE alert_key = 'hostname_probe.kirim.tokopoll.id'").first()).toMatchObject({ count: 1 })
    // Customer removed the CNAME: Cloudflare reports moved → stops routing.
    mockCf.advance("kirim.tokopoll.id", "moved", "active")
    await refreshHost(env, "kirim.tokopoll.id", t0 + POLL_EVERY_MS * 6, { probeFetch: wrongProbe })
    expect((await row("kirim.tokopoll.id"))!.state).toBe("moved")
    hostCache.clear()
    expect((await site("kirim.tokopoll.id")).status).toBe(404)
  })

  it("reaper: pending/failed ≥ 7 days and moved are deleted at Cloudflare and purged; younger pending and active stay", async () => {
    const t = await pro("cdreap")
    const t0 = Date.now()
    await appPost("/custom-domain", t.cookie, { hostname: "lama.tokoreap.id" })
    await createAtCloudflare(env, "lama.tokoreap.id", t0)
    await env.DB.prepare("UPDATE tenant_hostnames SET state_changed_at = ? WHERE hostname = 'lama.tokoreap.id'").bind(t0 + 6 * 86_400_000 - REAP_AFTER_MS).run()
    const u = await pro("cdbaru")
    await appPost("/custom-domain", u.cookie, { hostname: "baru.tokoreap.id" })
    await createAtCloudflare(env, "baru.tokoreap.id", t0)
    const idOld = (await row("lama.tokoreap.id"))!.cf_custom_hostname_id!
    // Six days later: only the 7-day-old pending host goes; the 6-day-old one stays.
    const reaped = await reapHosts(env, t0 + 6 * 86_400_000)
    expect(reaped).toContain("lama.tokoreap.id")
    expect(reaped).not.toContain("baru.tokoreap.id")
    expect(mockCf.calls).toContain(`delete ${idOld}`)
    expect(mockCf.hosts.has(idOld)).toBe(false)
    expect((await row("lama.tokoreap.id"))!.state).toBe("purged")
    expect((await row("baru.tokoreap.id"))!.state).toBe("pending")
    // A purged name can be requested again (row reused).
    expect((await appPost("/custom-domain", t.cookie, { hostname: "lama.tokoreap.id" })).status).toBe(201)
  })

  it("quota: snapshot stored daily; alert at ≥ 80 % of allocated, not below", async () => {
    mockCf.quota.allocated = 10
    const sent: string[] = []
    const hook = async (_u: RequestInfo | URL, init?: RequestInit) => (sent.push(String(init?.body)), new Response("ok"))
    const envWithHook = { ...env, ALERT_WEBHOOK_URL: "https://alerts.test/hook" } as Env
    for (let i = 0; i < 7; i++) mockCf.hosts.set(`q${i}`, { id: `q${i}`, hostname: `q${i}.test`, status: "active", ssl: { status: "active", method: "http" } })
    let q = await checkQuota(envWithHook, Date.now(), undefined, hook as typeof fetch)
    expect(q).toEqual({ used: 7, allocated: 10, alerted: false })
    mockCf.hosts.set("q7", { id: "q7", hostname: "q7.test", status: "active", ssl: { status: "active", method: "http" } })
    q = await checkQuota(envWithHook, Date.now(), undefined, hook as typeof fetch)
    expect(q.alerted).toBe(true)
    expect(sent.join()).toContain("8/10")
    expect(await env.DB.prepare("SELECT used, allocated FROM custom_hostname_quota WHERE id = 1").first()).toEqual({ used: 8, allocated: 10 })
  })

  it("issuance is throttled to 15 per minute (queue retries the rest)", async () => {
    const t = await pro("cdantre")
    const now = Date.now()
    const out: string[] = []
    for (let i = 0; i < 17; i++) {
      const h = `k${i}.tokoantre.id`
      await env.DB.prepare("INSERT INTO tenant_hostnames (hostname, tenant_id, kind, role, state, ssl_method, created_at, state_changed_at) VALUES (?, ?, 'custom', 'primary', 'pending', 'http', ?, ?)").bind(h, t.tenantId, now, now).run()
      out.push(await createAtCloudflare(env, h, now))
    }
    // Queue consumers from earlier tests may still take a slot of the same per-minute budget: never more than 15.
    const created = out.filter((x) => x === "created").length
    expect(created).toBeLessThanOrEqual(15)
    expect(created).toBeGreaterThanOrEqual(12)
    expect(out.slice(-2)).toEqual(["throttled", "throttled"])
  })

  it("Periksa Lagi restarts validation with PATCH; switching to TXT shows TXT records; remove deletes at Cloudflare", async () => {
    const t = await pro("cdcek")
    await appPost("/custom-domain", t.cookie, { hostname: "kirim.tokocek.id" })
    await createAtCloudflare(env, "kirim.tokocek.id", Date.now())
    mockCf.calls = []
    const r = await appPost("/custom-domain/check", t.cookie, { method: "txt" })
    expect(r.status).toBe(200)
    expect(mockCf.calls.some((c) => c.startsWith("patch") && c.endsWith(" txt"))).toBe(true)
    const v = (await r.json()) as { data: { domains: Array<{ sslMethod: string; records: { ssl: Array<{ txt_name: string }> } }> } }
    expect(v.data.domains[0]!.sslMethod).toBe("txt")
    expect(v.data.domains[0]!.records.ssl[0]!.txt_name).toBe("_acme-challenge.kirim.tokocek.id")
    expect((await appPost("/custom-domain/remove", t.cookie, { confirm: "salah.id" })).status).toBe(422)
    const id = (await row("kirim.tokocek.id"))!.cf_custom_hostname_id!
    expect((await appPost("/custom-domain/remove", t.cookie, { confirm: "kirim.tokocek.id" })).status).toBe(200)
    expect(mockCf.hosts.has(id)).toBe(false)
    expect((await row("kirim.tokocek.id"))!.state).toBe("purged")
  })

  it("a moved host recovers through the real probe path (classify answers it again)", async () => {
    const t = await pro("cdpulih")
    await appPost("/custom-domain", t.cookie, { hostname: "kirim.tokopulih.id" })
    await createAtCloudflare(env, "kirim.tokopulih.id", Date.now())
    // The probe goes through the Worker itself (no shortcut): the host must be probe-able in its current state.
    const viaWorker = async (url: string) => {
      const u = new URL(url)
      return exports.default.fetch(`http://${u.hostname}${u.pathname}`, { headers: { host: u.hostname } })
    }
    mockCf.advance("kirim.tokopulih.id", "active", "active")
    await refreshHost(env, "kirim.tokopulih.id", Date.now(), { probeFetch: viaWorker })
    expect((await row("kirim.tokopulih.id"))!.state).toBe("active")
    mockCf.advance("kirim.tokopulih.id", "moved", "active")
    await refreshHost(env, "kirim.tokopulih.id", Date.now(), { probeFetch: viaWorker })
    expect((await row("kirim.tokopulih.id"))!.state).toBe("moved")
    hostCache.clear()
    mockCf.advance("kirim.tokopulih.id", "active", "active")
    await refreshHost(env, "kirim.tokopulih.id", Date.now(), { probeFetch: viaWorker })
    expect((await row("kirim.tokopulih.id"))!.state).toBe("active")
  })

  it("root_primary: www never 301s to the platform subdomain before the root is active; deleting one deletes both", async () => {
    const t = await pro("cdsetengah")
    await appPost("/custom-domain", t.cookie, { hostname: "tokosetengah.id" })
    for (const h of ["tokosetengah.id", "www.tokosetengah.id"]) await createAtCloudflare(env, h, Date.now())
    mockCf.advance("www.tokosetengah.id", "active", "active")
    await refreshHost(env, "www.tokosetengah.id", Date.now(), { probeFetch: probeVia(new Set(["www.tokosetengah.id"])) })
    hostCache.clear()
    const w = await site("www.tokosetengah.id", "/")
    expect(w.status).toBe(200)
    // Reaping the stale root purges the www twin too (no orphan the owner cannot remove).
    await env.DB.prepare("UPDATE tenant_hostnames SET state_changed_at = ? WHERE hostname = 'tokosetengah.id'").bind(Date.now() - REAP_AFTER_MS - 1).run()
    await reapHosts(env, Date.now())
    expect((await row("www.tokosetengah.id"))!.state).toBe("purged")
  })

  it("a lost race undoes only this request's rows, never a concurrent winner's (same tenant, same ms) (Sol delta C-8)", async () => {
    const { requestDomain } = await import("../../src/hostnames/service")
    const t = await pro("tokobalap")
    const now = Date.now()
    // A concurrent request of the same tenant commits `www.tokobalap.id` between our precheck and our batch.
    const realBatch = env.DB.batch.bind(env.DB)
    let injected = false
    const db = new Proxy(env.DB, {
      get(target, prop) {
        if (prop === "batch") {
          return async (stmts: D1PreparedStatement[]) => {
            if (!injected) {
              injected = true
              await env.DB.prepare("INSERT INTO tenant_hostnames (hostname, tenant_id, kind, role, state, dns_branch, ssl_method, created_at, state_changed_at, probe_failures, request_id) VALUES ('www.tokobalap.id', ?1, 'custom', 'primary', 'pending', 'www_primary', 'http', ?2, ?2, 0, 'pemenang')").bind(t.tenantId, now).run()
            }
            return realBatch(stmts)
          }
        }
        const v = Reflect.get(target, prop)
        return typeof v === "function" ? v.bind(target) : v
      },
    })
    await expect(requestDomain({ ...env, DB: db }, t.tenantId, "tokobalap.id", "root_primary", now)).rejects.toMatchObject({ code: "DOMAIN_TAKEN" })
    expect(await row("www.tokobalap.id")).toMatchObject({ state: "pending", request_id: "pemenang" })
    expect((await row("tokobalap.id"))!.state).toBe("purged")
  })
})
