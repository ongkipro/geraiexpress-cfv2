// TASK-502 brand site (DEC-202, DEC-218, visual 03 §2): every page renders, no cookies on the apex (even with an app
// cookie present), API families 404, titles `X - GeraiExpress`, meta descriptions 120–155 chars, valid sitemap and
// robots, legal footer renders only filled fields (NULL vs filled).
import { env, exports } from "cloudflare:workers"
import { describe, expect, it } from "vitest"

const APEX = "http://geraiexpress.localhost:8787"
const get = (path: string, headers: Record<string, string> = {}) => exports.default.fetch(`${APEX}${path}`, { headers })
const PAGES = ["/", "/fitur", "/cara-kerja", "/simulasi-kasir", "/hubungi-kami", "/ketentuan", "/privasi"]

describe("brand site", () => {
  it("pages: 200, title pattern, description 120–155, canonical, single h1, no Set-Cookie even with an app cookie", async () => {
    for (const p of PAGES) {
      const r = await get(p, { cookie: "dev_ge_app=whatever" })
      expect(r.status, p).toBe(200)
      expect(r.headers.get("set-cookie"), p).toBeNull()
      const h = await r.text()
      expect(h, p).toMatch(/<title>[^<]+ - GeraiExpress<\/title>/)
      const d = /<meta name="description" content="([^"]+)">/.exec(h)![1]!
      expect(d.length, `${p}: ${d.length}`).toBeGreaterThanOrEqual(120)
      expect(d.length, `${p}: ${d.length}`).toBeLessThanOrEqual(155)
      expect(h).toContain(`<link rel="canonical" href="https://geraiexpress.localhost${p}">`)
      expect(h.match(/<h1>/g)?.length, p).toBe(1)
      expect(h, p).not.toContain("noindex")
    }
    for (const p of ["/api/app/workspace", "/api/owner/overview", "/mcp", "/webhooks/mengantar/x", "/internal/ops/do-migrate"]) expect((await get(p)).status, p).toBe(404)
    expect((await get("/tidak-ada")).status).toBe(404)
  })

  it("sitemap lists the seven pages; robots points to it", async () => {
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
})
