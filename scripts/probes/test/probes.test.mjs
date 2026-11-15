import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { alertPayload, parseProbes, postAlert, probeUrlsFor, runProbe } from "../probes-lib.mjs"

const PROBES = parseProbes(readFileSync(new URL("../../../OBSERVABILITY.md", import.meta.url), "utf8"))

describe("probes (OBSERVABILITY.md)", () => {
  it("parses all six probe lines of the real OBSERVABILITY.md", () => {
    expect(PROBES.map((p) => p.name)).toEqual(["brand-health", "app-health", "owner-health", "hooks-health", "minisite-probe", "relay-health"])
    expect(PROBES[0]).toEqual({ name: "brand-health", url: "https://geraiexpress.com/healthz", status: 200, contains: '"ok":true', maxMs: 1000 })
  })
  it("maps exact hosts per environment; the relay only in production; unknown env refused", () => {
    expect(probeUrlsFor(PROBES, "local", 8787).map((p) => p.url)).toEqual([
      "http://geraiexpress.localhost:8787/healthz",
      "http://app.geraiexpress.localhost:8787/healthz",
      "http://owner.geraiexpress.localhost:8787/healthz",
      "http://hooks.geraiexpress.localhost:8787/healthz",
      "http://probe.gerai.localhost:8787/healthz",
    ])
    expect(probeUrlsFor(PROBES, "staging").map((p) => p.url)).toEqual([
      "https://staging.geraiexpress.com/healthz",
      "https://app-staging.geraiexpress.com/healthz",
      "https://owner-staging.geraiexpress.com/healthz",
      "https://hooks-staging.geraiexpress.com/healthz",
      "https://probe-stg.gerai.cc/healthz",
    ])
    expect(probeUrlsFor(PROBES, "production").map((p) => p.url)).toEqual(PROBES.map((p) => p.url))
    expect(() => probeUrlsFor(PROBES, "stg")).toThrow()
  })
  it("fails on status, body, latency and network errors; forced failure for drills", async () => {
    const p = { name: "x", url: "http://x/healthz", status: 200, contains: '"ok":true', maxMs: 1000 }
    const ok = async () => new Response('{"ok":true}', { status: 200 })
    expect((await runProbe(p, { fetchImpl: ok })).ok).toBe(true)
    expect(await runProbe(p, { fetchImpl: async () => new Response("x", { status: 503 }) })).toMatchObject({ ok: false, reason: "status 503, seharusnya 200" })
    expect(await runProbe(p, { fetchImpl: async () => new Response("{}", { status: 200 }) })).toMatchObject({ ok: false, reason: "isi respons tidak sesuai" })
    expect(await runProbe({ ...p, maxMs: -1 }, { fetchImpl: ok })).toMatchObject({ ok: false })
    expect((await runProbe({ ...p, maxMs: -1 }, { fetchImpl: ok })).reason).toMatch(/^latensi/)
    expect((await runProbe(p, { fetchImpl: async () => { throw new Error("ECONNREFUSED") } })).ok).toBe(false)
    expect(await runProbe(p, { fetchImpl: ok, forceFail: true })).toMatchObject({ ok: false, reason: "kegagalan uji (--force-fail)" })
  })
  it("alert payload is Indonesian; delivery failures are reported without the URL", async () => {
    const a = alertPayload("staging", [{ probe: { name: "app-health", url: "u" }, result: { reason: "status 503, seharusnya 200" } }])
    expect(a.text).toBe("GeraiExpress [staging] probe gagal: app-health (status 503, seharusnya 200)")
    expect(await postAlert("https://hook.example/secret", a, async () => new Response("no", { status: 500 }))).toEqual({ ok: false, status: 500 })
    const thrown = await postAlert("not a url", a, async () => { throw new TypeError("Invalid URL: not a url") })
    expect(JSON.stringify(thrown)).not.toContain("not a url")
  })
})
