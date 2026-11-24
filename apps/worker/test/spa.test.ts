import { exports } from "cloudflare:workers"
import { describe, expect, it } from "vitest"

// Requires `pnpm build` first (pnpm check builds before test:worker).
const APP = "http://app.geraiexpress.localhost:8787"
const OWNER = "http://owner.geraiexpress.localhost:8787"

async function bundlePath(origin: string): Promise<string> {
  const html = await (await exports.default.fetch(`${origin}/`)).text()
  const m = html.match(/src="(\/assets\/[^"]+\.js)"/)
  if (!m?.[1]) throw new Error("no bundle script in shell")
  return m[1]
}

describe("SPA shells via ASSETS (spec 07 §3.1)", () => {
  it("each host serves its own shell for / and deep links, with no-cache", async () => {
    for (const [origin, title] of [
      [APP, "<title>GeraiExpress</title>"],
      [OWNER, "<title>GeraiExpress · Super Admin</title>"],
    ] as const) {
      for (const p of ["/", "/kiriman/8k4m2p7", "/gerai/kirim.tokobudi.id", "/index.html"]) {
        const res = await exports.default.fetch(`${origin}${p}`)
        expect(res.status, `${origin}${p}`).toBe(200)
        expect(res.headers.get("cache-control")).toBe("no-cache")
        expect(res.headers.get("x-frame-options")).toBe("DENY")
        expect(await res.text()).toContain(title)
      }
    }
  })

  it("serves a host's own bundle but never the other host's bundle", async () => {
    const appJs = await bundlePath(APP)
    const ownerJs = await bundlePath(OWNER)
    expect(appJs).not.toBe(ownerJs)
    const own = await exports.default.fetch(`${APP}${appJs}`)
    expect(own.status).toBe(200)
    expect(own.headers.get("cache-control")).toContain("immutable")
    expect((await exports.default.fetch(`${OWNER}${appJs}`)).status).toBe(404)
    expect((await exports.default.fetch(`${APP}${ownerJs}`)).status).toBe(404)
  })

  it("refuses source maps, traversal and encoded variants", async () => {
    const appJs = await bundlePath(APP)
    for (const p of [`${appJs}.map`, `${appJs}.MAP`, `${appJs}%2Emap`, "/assets/..%2F..%2Fowner%2Findex.html", "/%E0%A4%A", "/assets/x\\y.js"]) {
      expect((await exports.default.fetch(`${APP}${p}`)).status, p).toBe(404)
    }
  })

  it("non-SPA platform hosts never serve a shell", async () => {
    for (const h of ["geraiexpress.localhost", "hooks.geraiexpress.localhost", "berkahjaya.geraimitra.localhost"]) {
      const res = await exports.default.fetch(`http://${h}:8787/`)
      expect(await res.text()).not.toContain('<div id="root">')
    }
  })

  it("rejects unsafe methods on SPA hosts", async () => {
    expect((await exports.default.fetch(`${APP}/`, { method: "POST" })).status).toBe(405)
  })

  it("DEC-244 brand files: white favicon on app, navy favicon on owner, logo on both and on the brand apex", async () => {
    const appFav = await (await exports.default.fetch(`${APP}/favicon.svg`)).text()
    const ownerFav = await (await exports.default.fetch(`${OWNER}/favicon.svg`)).text()
    expect(appFav).toContain('fill="#fff"')
    expect(ownerFav).toContain('fill="#012676"')
    for (const origin of [APP, OWNER, "http://geraiexpress.localhost:8787"]) {
      const logo = await exports.default.fetch(`${origin}/logo.svg`)
      expect(logo.status, origin).toBe(200)
      expect(await logo.text()).toContain('viewBox="0 0 1044 618"')
      expect((await exports.default.fetch(`${origin}/favicon.ico`)).status, origin).toBe(200)
    }
    const shell = await (await exports.default.fetch(`${APP}/`)).text()
    expect(shell).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg"')
    const brand = await (await exports.default.fetch("http://geraiexpress.localhost:8787/")).text()
    expect(brand).toContain('<img src="/logo.svg"')
    expect(brand).not.toContain("data:image/svg+xml")
  })

  it("app CSP allows same-origin blob: PDF frames, map tiles, and geolocation=(self) while owner stays strict", async () => {
    const appRes = await exports.default.fetch(`${APP}/`)
    const ownerRes = await exports.default.fetch(`${OWNER}/`)
    const appCsp = appRes.headers.get("content-security-policy") ?? ""
    const ownerCsp = ownerRes.headers.get("content-security-policy") ?? ""
    expect(appCsp).toContain("frame-src blob: https://challenges.cloudflare.com")
    expect(appCsp).toContain("object-src blob:")
    expect(appCsp).toContain("https://tile.openstreetmap.org")
    expect(appCsp).toContain("frame-ancestors 'none'")
    expect(appRes.headers.get("permissions-policy")).toContain("geolocation=(self)")
    expect(ownerCsp).not.toContain("frame-src blob:")
    expect(ownerCsp).not.toContain("openstreetmap.org")
    expect(ownerCsp).toContain("frame-ancestors 'none'")
    expect(ownerRes.headers.get("permissions-policy")).toContain("geolocation=()")
  })
})
