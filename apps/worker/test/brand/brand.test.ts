// TASK-502 brand site (DEC-202, DEC-218, visual 03 §2): every page renders, no cookies on the apex (even with an app
// cookie present), API families 404, titles `X - GeraiExpress`, meta descriptions 120–155 chars, valid sitemap and
// robots, legal footer renders only filled fields (NULL vs filled).
import { env, exports } from "cloudflare:workers"
import { describe, expect, it } from "vitest"

const APEX = "http://geraiexpress.localhost:8787"
const get = (path: string, headers: Record<string, string> = {}) => exports.default.fetch(`${APEX}${path}`, { headers })
const PAGES = [
  "/",
  "/fitur",
  "/ekspedisi",
  "/cara-kerja",
  "/biaya-dan-paket",
  "/simulasi-kasir",
  "/tanya-jawab",
  "/hubungi-kami",
  "/ketentuan",
  "/privasi",
]

describe("brand site", () => {
  it("pages: 200, title pattern, description 120–155, canonical, single h1, no Set-Cookie even with an app cookie", async () => {
    for (const p of PAGES) {
      const r = await get(p, { cookie: "dev_ge_app=whatever" })
      expect(r.status, p).toBe(200)
      expect(r.headers.get("set-cookie"), p).toBeNull()
      const h = await r.text()
      const t = /<title>([^<]+) - GeraiExpress<\/title>/.exec(h)
      expect(t, p).not.toBeNull()
      const fullTitle = `${t![1]} - GeraiExpress`
      expect(fullTitle.length, `${p} title: ${fullTitle.length}`).toBeGreaterThanOrEqual(55)
      expect(fullTitle.length, `${p} title: ${fullTitle.length}`).toBeLessThanOrEqual(70)
      const d = /<meta name="description" content="([^"]+)">/.exec(h)![1]!
      expect(d.length, `${p}: ${d.length}`).toBeGreaterThanOrEqual(120)
      expect(d.length, `${p}: ${d.length}`).toBeLessThanOrEqual(155)
      expect(h).toContain(`<link rel="canonical" href="https://geraiexpress.localhost${p}">`)
      expect(h.match(/<h1[\s>]/g)?.length, p).toBe(1)
      expect(h, p).not.toContain("noindex")
    }
    for (const p of ["/api/app/workspace", "/api/owner/overview", "/mcp", "/webhooks/mengantar/x", "/internal/ops/do-migrate"]) expect((await get(p)).status, p).toBe(404)
    expect((await get("/tidak-ada")).status).toBe(404)
  })

  it("sitemap lists all ten pages; robots points to it", async () => {
    const sm = await (await get("/sitemap.xml")).text()
    expect(sm.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])).toEqual(PAGES.map((p) => `https://geraiexpress.localhost${p}`))
    expect(await (await get("/robots.txt")).text()).toBe("User-agent: *\nAllow: /\nSitemap: https://geraiexpress.localhost/sitemap.xml\n")
  })

  it("legal footer: NULL fields render nothing; filled fields render (DEC-218)", async () => {
    await env.DB.prepare("UPDATE platform_legal_profile SET legal_name = NULL, nib = NULL, registered_address = NULL, pse_registration_number = NULL WHERE id = 1").run()
    const empty = await (await get("/")).text()
    expect(empty).not.toMatch(/NIB |Terdaftar PSE|PT /)
    expect(empty).toContain("© ")
    await env.DB.prepare("UPDATE platform_legal_profile SET legal_name = 'PT Contoh Kirim Nusantara', nib = '1234567890123', registered_address = 'Jl. Contoh Raya No. 1, Bandung' WHERE id = 1").run()
    const filled = await (await get("/")).text()
    expect(filled).toContain("PT Contoh Kirim Nusantara · NIB 1234567890123 · Jl. Contoh Raya No. 1, Bandung")
    expect(filled).not.toContain("Terdaftar PSE")
    expect(await (await get("/ketentuan")).text()).toContain("dioperasikan oleh PT Contoh Kirim Nusantara")
    await env.DB.prepare("UPDATE platform_legal_profile SET legal_name = NULL, nib = NULL, registered_address = NULL WHERE id = 1").run()
  })

  it("simulasi kasir works without login and calls no API", async () => {
    const h = await (await get("/simulasi-kasir")).text()
    expect(h).toContain('id="rates"')
    expect(h).not.toMatch(/fetch\(|\/api\//)
  })

  it("DEC-245 assets: only the BRAND_ASSETS allow-list is served on the apex (GET/HEAD), with type, cache and no cookie", async () => {
    const allowed: Array<[string, string]> = [
      ["/couriers/jne.svg", "image/svg+xml"],
      ["/couriers/spx.svg", "image/svg+xml"],
      ["/og-geraiexpress.png", "image/png"],
      ["/logo-192.png", "image/png"],
      ["/three.min.js", "javascript"],
      ["/hero-studio-3d.min.js", "javascript"],
    ]
    for (const [p, type] of allowed) {
      for (const method of ["GET", "HEAD"]) {
        const r = await exports.default.fetch(`${APEX}${p}`, { method, headers: { cookie: "dev_ge_app=whatever" } })
        expect(r.status, `${method} ${p}`).toBe(200)
        expect(r.headers.get("content-type"), p).toContain(type)
        expect(r.headers.get("cache-control"), p).toBe("public, max-age=86400")
        expect(r.headers.get("x-content-type-options"), p).toBe("nosniff")
        expect(r.headers.get("set-cookie"), p).toBeNull()
        await r.body?.cancel()
      }
    }
    // Anything else in the app bundle (SPA shell, hashed JS, maps, the /app prefix itself, Ninja) stays 404.
    for (const p of ["/couriers/ninja.svg", "/app/logo.svg", "/index.html", "/assets/", "/manifest.webmanifest", "/logo.svg.map", "/three.min.js.map", "//couriers/jne.svg", "/couriers%2Fjne.svg", "/couriers/../index.html"]) {
      const r = await get(p)
      expect(r.status, p).toBe(404)
      expect(r.headers.get("set-cookie"), p).toBeNull()
      await r.body?.cancel()
    }
    expect((await get("/couriers/jne.svg/")).status).toBe(200)
    expect((await exports.default.fetch(`${APEX}/couriers/jne.svg`, { method: "POST" })).status).toBe(404)
  })

  it("DEC-245 home loads three.js only on `/`, deferred; the demos call no API", async () => {
    const home = await (await get("/")).text()
    expect(home).toContain('<script defer src="/three.min.js"></script><script defer src="/hero-studio-3d.min.js"></script>')
    for (const p of PAGES.slice(1)) expect(await (await get(p)).text(), p).not.toContain("three.min.js")
    for (const p of ["/", "/simulasi-kasir"]) expect(await (await get(p)).text(), p).not.toMatch(/fetch\(|XMLHttpRequest|\/api\//)
  })

  it("DEC-245 copy stays truthful: nine couriers, no fixed discount, no KYC, catalog services, real volumetric rule", async () => {
    const all = (await Promise.all(PAGES.map(async (p) => (await get(p)).text()))).join("\n")
    for (const banned of ["Ninja", "10+ ekspedisi", "10+ kurir", "25%", "KYC", "SAMEDAY", "Next Day", "BIGPACK", "J&amp;T Cargo", "JTR", "GOKIL", "iDtruck", "SAP Lite", "Pos Kargo", "08.30", "20%–30%"]) {
      expect(all, banned).not.toContain(banned)
    }
    const eks = await (await get("/ekspedisi")).text()
    expect(eks).toContain("<code>4.000</code> untuk JNE Reguler dan iDexpress Cargo, <code>6.000</code> untuk layanan lain")
    expect([...eks.matchAll(/<img src="\/couriers\/(\w+)\.svg"/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i)).toHaveLength(9)
    for (const cargo of ["JNE Cargo", "SiCepat Cargo", "SAP Cargo", "iDexpress Cargo"]) expect(eks).toContain(`${cargo} (≥ 5 kg, Non-COD)`)
    const biaya = await (await get("/biaya-dan-paket")).text()
    const standard = biaya.slice(biaya.indexOf("Mitra Gerai Standar"), biaya.indexOf("Opsi Domain Sendiri (Pro)"))
    expect(standard).toContain("Kunci API toko &amp; konektor MCP")
    expect(biaya).toContain("pelanggan tetap membayar tarif publik")
  })
})
