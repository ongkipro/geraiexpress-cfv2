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
    const standard = biaya.slice(biaya.indexOf('<div class="readout" data-plan="standar"'), biaya.indexOf('<div class="readout" data-plan="pro"'))
    expect(standard).toContain("Kunci API toko &amp; konektor MCP")
    expect(biaya).toContain("pelanggan tetap membayar tarif publik")
  })
})

// DEC-247 Borderless White-Gallery: one header with the phone [Masuk] [menu] dropdown on all ten pages, the dark
// closing band retired, no slop eyebrows or orphan links, porcelain closing + footer, the asymmetric radio pricing,
// the product screenshot served from the allow-list, and the Indonesian validation net on every page.
describe("brand site DEC-247", () => {
  const html = (p: string) => get(p).then((r) => r.text())

  it("one header on every page: desktop nav + Masuk + Daftar Gerai, phone [Masuk] [menu] with an inert dropdown", async () => {
    for (const p of PAGES) {
      const h = await html(p)
      expect(h.match(/<header class="hdr">/g)?.length, p).toBe(1)
      const nav = /<nav class="dnav" aria-label="Menu utama">(.*?)<\/nav>/.exec(h)![1]!
      expect([...nav.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]), p).toEqual(["/fitur", "/ekspedisi", "/cara-kerja", "/biaya-dan-paket", "/simulasi-kasir"])
      if (["/fitur", "/ekspedisi", "/cara-kerja", "/biaya-dan-paket", "/simulasi-kasir"].includes(p)) expect(nav, p).toContain(`<a href="${p}" aria-current="page">`)
      else expect(nav, p).not.toContain("aria-current")
      expect(h, p).toContain('<a class="login-lk" href="http://app.geraiexpress.localhost:8787/masuk">Masuk</a>')
      expect(h, p).toContain('<a class="hround acct" href="http://app.geraiexpress.localhost:8787/masuk" aria-label="Masuk ke ruang kerja"')
      expect(h, p).toContain('<button type="button" id="mnav-btn" class="hround burger" aria-label="Buka menu navigasi" aria-expanded="false" aria-controls="mnav">')
      expect(h, p).toContain('<nav id="mnav" class="mnav" aria-label="Menu navigasi" inert>')
      const menu = h.slice(h.indexOf('<nav id="mnav"'), h.indexOf("</nav>", h.indexOf('<nav id="mnav"')))
      expect([...menu.matchAll(/<span class="r-h">([^<]+)<\/span>/g)].length, p).toBe(7)
      expect(menu, p).toContain('Daftar Gerai <span aria-hidden="true">→</span>')
      expect(menu, p).toContain("Sudah terdaftar? <b>Masuk ke ruang kerja</b>")
      expect(h, p).not.toContain('<details class="mnav"')
      // Without JS the menu button is replaced by a link to the footer site map.
      expect(h, p).toContain('<a class="hround nojs-menu" href="#peta-situs"')
      expect(h, p).toContain('id="peta-situs"')
    }
  })

  it("white gallery: no dark #061B52 band, no eyebrow pills, no orphan trailing links, porcelain closing + footer on all pages", async () => {
    for (const p of PAGES) {
      const h = await html(p)
      expect(h.toUpperCase(), p).not.toContain("#061B52")
      expect(h, p).not.toContain('class="deep"')
      expect(h, p).not.toContain("pill-eyebrow")
      expect(h, p).not.toContain("next-links")
      expect(h, p).not.toMatch(/Pelajari [^<]*→/)
      expect(h, p).not.toContain('class="ic"')
      expect(h, p).toContain('<section class="closing" aria-labelledby="tutup-title">')
      expect(h, p).toContain('<footer class="ftr">')
    }
    const css = /<style>([\s\S]*?)<\/style>/.exec(await html("/"))![1]!
    expect(css).toContain("--tile:#F4F6FA")
    expect(css).toContain("--hairline:1px solid rgba(15,23,42,.07)")
    expect(css).toMatch(/footer\.ftr\{background:var\(--tile\);border-top:var\(--hairline\)/)
    expect(css).toMatch(/\.faq details\{border-bottom:var\(--hairline\)\}/)
  })

  it("home: 3D hero intact, Tinjau Tarif Loket card on a porcelain stage, nine courier tiles, 12-col bento 01-06, product screenshot", async () => {
    const h = await html("/")
    expect(h).toContain('<div id="stageWrapper">')
    expect(h).toContain('<canvas id="webglCanvas"></canvas>')
    expect(h).toContain('<div class="stage"><aside class="float" aria-labelledby="demo-title">')
    expect(h).toContain('<h2 id="demo-title" class="demo-title">Tinjau Tarif Loket</h2>')
    expect(h).not.toMatch(/Pratinjau/)
    expect(h.match(/<li class="pbadge"><img src="\/couriers\//g)?.length).toBe(9)
    const bento = h.slice(h.indexOf("<div class=\"bento\" data-bento>"), h.indexOf("</div>\n</div></section>", h.indexOf("data-bento")))
    expect([...bento.matchAll(/<article class="tile ([^"]+)">/g)].map((m) => m[1])).toEqual(["s6", "s6", "s4", "s4", "s4 b5", "s12"])
    expect([...bento.matchAll(/<span class="idx">(\d\d)<\/span>/g)].map((m) => m[1])).toEqual(["01", "02", "03", "04", "05", "06"])
    expect(bento).not.toMatch(/<a /)
    const img = /<img src="\/produk-kasir-loket\.webp"[^>]*>/.exec(h)![0]
    expect(img).toContain('width="1440" height="900" loading="lazy" decoding="async"')
    const alt = /alt="([^"]*)"/.exec(img)![1]!
    expect(alt.length).toBeGreaterThanOrEqual(10)
    expect(alt.length).toBeLessThanOrEqual(125)
  })

  it("/biaya-dan-paket: native radio tiers + readouts (:has, JS data-active, forced-colors) and an open comparison without brands", async () => {
    const h = await html("/biaya-dan-paket")
    expect([...h.matchAll(/<input type="radio" name="paket" value="(\w+)"( checked)?>/g)].map((m) => `${m[1]}${m[2] ?? ""}`)).toEqual(["standar checked", "pro"])
    expect(h).toContain("Mitra Gerai Standar")
    expect(h).toContain("Mitra Gerai + Domain Sendiri (Pro)")
    expect(h).toContain('<div class="readout" data-plan="standar" data-active>')
    expect(h).toContain('<div class="readout" data-plan="pro">')
    // No invented Pro price: the Pro tier asks the visitor to contact the partnership team.
    const pro = h.slice(h.indexOf('<div class="readout" data-plan="pro">'), h.indexOf("</ul>", h.indexOf('<div class="readout" data-plan="pro">')))
    expect(pro).toContain("Hubungi kami")
    expect(pro).not.toMatch(/Rp\s?\d/)
    expect(pro).toContain('href="/hubungi-kami"')
    const css = /<style>([\s\S]*?)<\/style>/.exec(h)![1]!
    expect(css).toContain(".pricing:has(input[value=standar]:checked) .readout[data-plan=standar]")
    expect(css).toContain("@supports not selector(:has(*)){.readout[data-active]{display:grid}")
    expect(css).toContain("@media(forced-colors:active)")
    expect(h).toContain('r.addEventListener("change",sync)')
    // DEC-247A home parity: the pricing block lives on / and /biaya-dan-paket only (one per page).
    for (const p of PAGES.filter((x) => x !== "/biaya-dan-paket" && x !== "/")) expect(await html(p), p).not.toContain("data-pricing")
    for (const p of ["/", "/biaya-dan-paket"]) expect((await html(p)).match(/<div class="pricing" data-pricing>/g), p).toHaveLength(1)
    const cmp = h.slice(h.indexOf('<table class="cmp">'), h.indexOf("</table>", h.indexOf('<table class="cmp">')))
    expect([...cmp.matchAll(/<th scope="col"[^>]*>(?:<span[^>]*><\/span>)?([^<]+)<\/th>/g)].map((m) => m[1])).toEqual(["Kebutuhan loket", "Manual ekspedisi satu-satu", "Sistem keagenan kunci perangkat", "GeraiExpress"])
    expect(cmp.match(/<td class="ours"/g)?.length).toBe(7)
    for (const brand of ["Pos Aja", "Mitra Bukalapak", "Shopee", "Tokopedia", "Lazada", "Kioser", "Agen46"]) expect(cmp, brand).not.toContain(brand)
  })

  it("/tanya-jawab: open hairline <details> rows, no boxed cards", async () => {
    const h = await html("/tanya-jawab")
    expect(h.match(/<details[ >]/g)?.length).toBe(12)
    expect(h.match(/<div class="faq-group"><h2>/g)?.length).toBe(3)
    expect(h).not.toContain('class="card"')
  })

  it("DEC-247 asset: the product screenshot is served as WebP from the allow-list", async () => {
    const r = await exports.default.fetch(`${APEX}/produk-kasir-loket.webp`, { headers: { cookie: "dev_ge_app=whatever" } })
    expect(r.status).toBe(200)
    expect(r.headers.get("content-type")).toContain("image/webp")
    expect(r.headers.get("set-cookie")).toBeNull()
    const bytes = new Uint8Array(await r.arrayBuffer())
    expect(bytes.length).toBeLessThan(150_000)
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe("WEBP")
    expect((await get("/produk-kasir-loket.webp.map")).status).toBe(404)
  })

  it("every page ships the Indonesian validation net and the menu script once; every <img> has an alt", async () => {
    for (const p of PAGES) {
      const h = await html(p)
      expect(h.match(/el\.setCustomValidity\(s\)/g)?.length, p).toBe(1)
      expect(h, p).toContain('"Kolom"+x+" wajib diisi."')
      // The label is read with real regex escapes (a template-literal `\\s` that collapsed to `s` once shipped `/s+/`).
      expect(h, p).toContain(String.raw`.replace(/\s+/g," ").replace(/[*:]+\s*$/,"")`)
      expect(h, p).toContain('Format email belum benar (contoh: nama@domain.com).')
      expect(h.match(/getElementById\("mnav-btn"\)/g)?.length, p).toBe(1)
      for (const m of h.matchAll(/<img\b[^>]*>/g)) expect(m[0], p).toMatch(/\salt="/)
      expect(h, p).not.toMatch(/Please (fill|include|enter)/)
    }
  })

  it("home parity (DEC-247A): layered showcase, proof band 01/02, pricing + comparison, five FAQ, closing steps", async () => {
    const h = await html("/")
    // 1. Layered product UI: faded KPI layer behind a floating table card, synthetic data labelled as such.
    expect(h).toContain('<figure class="layers">')
    expect(h).toMatch(/<div class="layer-back" aria-hidden="true">[\s\S]*Saldo Aman[\s\S]*<div class="spark">/)
    expect(h).toMatch(/<div class="layer-front float">[\s\S]*Ringkasan Ekspedisi Loket[\s\S]*Cocok 1:1/)
    expect(h).toContain("Data contoh untuk ilustrasi, bukan angka gerai sungguhan.")
    // 2. Two porcelain proof surfaces 01 and 02.
    expect(h).toMatch(/<div class="proof">[\s\S]*<span class="idx">01<\/span><h3>Dari catatan campur ke rekonsiliasi 1:1 per resi[\s\S]*<span class="idx">02<\/span><h3>Tiga lapis privasi/)
    // 3. The same pricing radios and open comparison as /biaya-dan-paket, on the home page.
    const biaya = await html("/biaya-dan-paket")
    const block = (x: string, open: string, close: string) => x.slice(x.indexOf(open), x.indexOf(close, x.indexOf(open)) + close.length)
    expect(block(h, '<div class="pricing" data-pricing>', "</fieldset>")).toBe(block(biaya, '<div class="pricing" data-pricing>', "</fieldset>"))
    expect(block(h, '<table class="cmp">', "</table>")).toBe(block(biaya, '<table class="cmp">', "</table>"))
    expect(h).not.toContain("Biaya kemitraan")
    // 4. Five FAQ rows, worded exactly as on /tanya-jawab, plus the link to all questions.
    const faq = block(h, '<section class="sec tight" aria-labelledby="faq-title">', "</section>")
    expect(faq.match(/<details/g)).toHaveLength(5)
    const all = await html("/tanya-jawab")
    for (const q of faq.matchAll(/<summary>([^<]+)<\/summary>/g)) expect(all).toContain(`<summary>${q[1]}</summary>`)
    expect(faq).toContain('<a href="/tanya-jawab">Semua pertanyaan →</a>')
    // 5. Closing with three numbered steps on every page.
    for (const p of PAGES) {
      const c = block(await html(p), '<section class="closing"', "</section>")
      expect(c, p).toMatch(/<ol class="cl-steps"[^>]*><li><span class="cl-n">1<\/span>Daftar akun pemilik<\/li><li><span class="cl-n">2<\/span>Verifikasi titik jemput &amp; akun Mengantar<\/li><li><span class="cl-n">3<\/span>Buka kasir &amp; cetak resi pertama<\/li><\/ol>/)
    }
    const css = /<style>([\s\S]*?)<\/style>/.exec(h)![1]!
    expect(css).toContain('.faq summary::after{content:"+"')
    expect(css).toContain(".faq details[open] summary::after{transform:rotate(45deg)")
  })
})

