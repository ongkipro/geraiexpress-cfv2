// TASK-502 brand site (DEC-202, DEC-218, visual 03 §2): every page renders, no cookies on the apex (even with an app
// cookie present), API families 404, titles `X - GeraiExpress`, meta descriptions 120–155 chars, valid sitemap and
// robots, legal footer renders only filled fields (NULL vs filled).
import { env, exports } from "cloudflare:workers"
import { describe, expect, it } from "vitest"

/** SHA-256 of the home 3D studio hero markup on `main` before DEC-249 (owner: "do not modify it at all"). */
const HERO_SHA256 = "0c41edbc5b85f6e3f6e79771f53968b4ecc1eb19a30a73dbddc217cee2250ca1"

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
    // DEC-249: the nine couriers run in a marquee; the duplicate track is hidden from assistive tech.
    expect(h.match(/<ul class="mq-list" aria-label="Sembilan ekspedisi mitra Mengantar">(<li class="pbadge"><img src="\/couriers\/\w+\.svg" alt="[^"]+"[^>]*><\/li>){9}<\/ul>/)).not.toBeNull()
    expect(h.match(/<ul class="mq-list" aria-hidden="true">(<li class="pbadge"><img src="\/couriers\/\w+\.svg" alt=""[^>]*><\/li>){9}<\/ul>/)).not.toBeNull()
    const bento = h.slice(h.indexOf("<div class=\"bento\" data-bento>"), h.indexOf("</div>\n<p class=\"note\">Ilustrasi fitur", h.indexOf("data-bento")))
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
    expect(h.match(/<details[ >]/g)?.length).toBe(14)
    // DEC-247B: four 4fr/8fr groups, each reachable from a pill in the page head.
    const ids = [...h.matchAll(/<section class="fgroup" id="([a-z-]+)"/g)].map((m) => m[1])
    expect(ids).toEqual(["pendaftaran-lokasi", "perangkat-cetak", "saldo-cod-keuangan", "operasional-retur"])
    const head = h.slice(h.indexOf('<section class="phead"'), h.indexOf("</section>", h.indexOf('<section class="phead"')))
    expect([...head.matchAll(/<a href="#([a-z-]+)">/g)].map((m) => m[1])).toEqual(ids)
    expect(h).not.toContain('class="card"')
  })

  it("DEC-249 home: hero byte-identical, seven blocks, courier marquee, Raka storefront section with eight store types", async () => {
    const h = await html("/")
    // The 3D studio hero is untouched (owner 2026-11-19): byte-identical markup and the same two scripts.
    const hero = h.slice(h.indexOf('<section class="hero-bleed"'), h.indexOf("</section>", h.indexOf('<section class="hero-bleed"')) + 10)
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hero)))].map((b) => b.toString(16).padStart(2, "0")).join("")
    expect(digest).toBe(HERO_SHA256)
    expect(h).toContain('<script defer src="/three.min.js"></script><script defer src="/hero-studio-3d.min.js"></script>')
    // Seven blocks after the hero: intro, marquee, Raka, bento, screenshot, pricing, FAQ (+ the shared closing).
    const main = h.slice(h.indexOf("</section>", h.indexOf('<section class="hero-bleed"')))
    expect([...main.matchAll(/<section class="([^"]+)"(?: id="[^"]+")?(?: aria-labelledby="([^"]+)")?/g)].map((m) => m[2] ?? m[1])).toEqual([
      "sec", "mitra-title", "toko-title", "enam-title", "layar-title", "paket-title", "faq-title", "tutup-title",
    ])
    // Marquee: CSS-only, pauses on hover/focus, a static wrap under reduced motion.
    const css = /<style>([\s\S]*?)<\/style>/.exec(h)![1]!
    expect(css).toContain(".marquee:hover .mq-track,.marquee:focus-within .mq-track{animation-play-state:paused}")
    expect(css).toContain("@media(prefers-reduced-motion:reduce){.marquee{-webkit-mask-image:none;mask-image:none;padding:0}.mq-track{animation:none;width:auto;display:block}")
    expect(css).toContain("mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)")
    // Raka: a labelled illustration, motion only on screen and never under reduced motion.
    const raka = h.slice(h.indexOf('<section class="sec" aria-labelledby="toko-title">'), h.indexOf("</section>", h.indexOf('aria-labelledby="toko-title"')))
    expect(raka).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 470" class="raka-svg" role="img" aria-labelledby="rk-t">')
    expect(raka).toMatch(/<title id="rk-t">Ilustrasi Raka, mitra loket GeraiExpress[^<]+<\/title>/)
    expect(raka).toContain('<h2 id="toko-title">Ubah tokomu jadi titik kirim paket warga &amp; penjual online sekitar</h2>')
    expect([...raka.matchAll(/<li>([^<]+)<\/li>/g)].map((m) => m[1])).toEqual([
      "Konter Pulsa &amp; Kuota", "Fotokopi &amp; Percetakan", "Warung &amp; Toko Kelontong", "Toko ATK &amp; Buku",
      "Ruko Jasa &amp; Laundry", "Koperasi &amp; BUMDes", "Dropshipper &amp; Reseller", "Gudang UMKM Online",
    ])
    expect(h).toContain('var r=document.querySelector("[data-raka]");\n  if(!r||!("IntersectionObserver" in window)||matchMedia("(prefers-reduced-motion: reduce)").matches)return;')
    expect(css).toContain("@media(prefers-reduced-motion:reduce){.raka-stage .rk-float,.raka-stage .rk-scan path{animation:none!important}}")
  })

  it("DEC-247B inner pages: centered PageHead with eyebrow pill and dot grid on all nine inner pages", async () => {
    const eyebrows: Record<string, string> = {
      "/fitur": "Fitur loket", "/ekspedisi": "Jaringan kurir", "/cara-kerja": "Alur kemitraan", "/biaya-dan-paket": "Skema kemitraan",
      "/simulasi-kasir": "Simulasi meja kasir", "/tanya-jawab": "Pusat jawaban", "/hubungi-kami": "Hubungi kami",
      "/ketentuan": "Ketentuan layanan", "/privasi": "Kebijakan privasi",
    }
    for (const [p, eyebrow] of Object.entries(eyebrows)) {
      const h = await html(p)
      expect(h, p).toMatch(new RegExp(`<section class="phead" aria-labelledby="page-title"><div class="dots" aria-hidden="true"></div><div class="wrap head">\n<p class="eyebrow"><span class="esq" aria-hidden="true"></span>${eyebrow}</p>\n<h1 id="page-title">`))
      expect(h.match(/<h1[ >]/g)?.length, p).toBe(1)
    }
    const css = await (await get("/")).text()
    expect(css).toContain("radial-gradient(rgb(15 23 42 / .09) 1px,transparent 1.4px);background-size:22px 22px")
    expect(css).toContain(".phead .head{position:relative;display:grid;gap:16px;justify-items:center;text-align:center}")
  })

  it("DEC-247B /fitur: six alternating pillar rows (screen, artifacts, specs) and the everyday capability list", async () => {
    const h = await html("/fitur")
    const rows = [...h.matchAll(/<article class="prow( flip)?" id="([a-z-]+)"/g)]
    expect(rows.map((m) => m[2])).toEqual(["kasir", "kirim-dari-rumah", "paket-massal", "pickup", "retur", "keuangan"])
    expect(rows.map((m) => Boolean(m[1]))).toEqual([false, true, false, true, false, true])
    // Each point is one grid item (a bare <code> would otherwise become its own column).
    expect(h.match(/<ul class="sqlist">(?:<li><span>[^]*?<\/span><\/li>){3}<\/ul>/g)?.length).toBe(6)
    expect(h).toContain('<figure class="shot pshot"><div class="shot-stage"><img src="/produk-kasir-loket.webp"')
    expect(h.match(/<dl class="spec"/g)?.length).toBe(2)
    expect(h).toContain("<dt>200 baris</dt>")
    const caps = h.slice(h.indexOf('<dl class="caps">'), h.indexOf("</dl>", h.indexOf('<dl class="caps">')))
    expect(caps.match(/<div><dt>/g)?.length).toBe(6)
    expect(h).toContain('<h2 id="harian-title">Dan yang Anda perlukan setiap hari</h2>')
    expect(h).not.toContain('class="grid3"')
  })

  it("DEC-247B /cara-kerja: jump strip, five step rows with roles, and the motion-guarded pipeline", async () => {
    const h = await html("/cara-kerja")
    expect([...h.matchAll(/<li><a href="#(langkah-\d)">/g)].map((m) => m[1])).toEqual(["langkah-1", "langkah-2", "langkah-3", "langkah-4", "langkah-5"])
    expect(h.match(/<article class="prow( flip)?" id="langkah-\d"/g)?.length).toBe(5)
    expect(h.match(/<dl class="who"><div><dt>[^<]+<\/dt><dd>[^<]+<\/dd><\/div><div><dt>Sistem GeraiExpress &amp; Mengantar<\/dt>/g)?.length).toBe(5)
    expect(h).toContain('<section class="sec tight pipeline" aria-labelledby="alur-title" data-pipeline>')
    expect(h.match(/<li class="stop" style="--n:\d">/g)?.length).toBe(5)
    expect(h).toContain('<li class="pulse" aria-hidden="true"></li>')
    expect(h).toContain('IntersectionObserver" in window)||matchMedia("(prefers-reduced-motion: reduce)").matches)return')
    expect(h).toContain("@media(prefers-reduced-motion:reduce){.pipeline .node,.pipeline .pulse{animation:none!important")
    expect(h).not.toContain('<ol class="steps">')
    // Sol R1 P1: the two payment paths are told apart (spec 02 §3.3) — Non-COD pays at the counter and is debited at
    // issue; COD is paid by the recipient to the courier and netted from the COD credit when it settles.
    const pipe = h.slice(h.indexOf('<ol class="pipe">'), h.indexOf("</ol>", h.indexOf('<ol class="pipe">')))
    // Sol R2: COD Barang vs COD Ongkir (DFOD): the service fee is Non-COD/DFOD only (spec 02 §3.3 `S`), and COD credits
    // net proceeds (Mengantar deducts its charges) rather than debiting the seller balance.
    expect(pipe).toContain("COD Barang dan COD Ongkir: penerima membayar tagihan kurir saat paket tiba. Biaya jasa loket hanya untuk Non-COD dan COD Ongkir.")
    expect(pipe).toContain("(hanya Non-COD yang memotong saldo saat itu)")
    expect(pipe).toContain("Untuk COD, Mengantar memotong ongkir dan biaya COD dari dana tagihan, lalu mengkreditkan sisanya ke saldo.")
    expect(h).toContain("COD Barang: hanya packing bila dipilih. COD Ongkir: packing dan biaya jasa loket bila ada.")
    expect(h).toContain("COD tidak memotong saldo: Mengantar memotong ongkir dan biaya COD dari dana tagihan, lalu mengkreditkan sisanya ke saldo.")
    expect(h).toContain("apakah saldo dipotong saat resi terbit (Non-COD) atau menerima dana COD bersih")
    for (const wrong of ["Pelanggan membayar tarif publik di loket dan kasnya tercatat", "dilewati setiap kiriman, dicatat otomatis", "biaya packing dan layanan untuk COD", "packing atau biaya layanan bila ada", "kapan saldo terpotong"])
      expect(h, wrong).not.toContain(wrong)
  })

  it("DEC-247B /hubungi-kami: two borderless porcelain panels, partners vs senders and recipients", async () => {
    const h = await html("/hubungi-kami")
    expect([...h.matchAll(/<section class="cpanel" aria-labelledby="([a-z-]+)">\n<h2 id="\1">([^<]+)<\/h2>/g)].map((m) => m[2])).toEqual([
      "Calon Mitra &amp; Pemilik Gerai",
      "Pengirim / Penerima Paket di Salah Satu Gerai",
    ])
    expect(h).toMatch(/<a href="[^"]+\/masuk">Masuk ke ruang kerja gerai<\/a>/)
    expect(h).toContain("UU PDP")
    expect(h).not.toContain('class="tile"')
  })

  it("DEC-247B /simulasi-kasir: zero native <select>, four custom listboxes feeding hidden inputs", async () => {
    const h = await html("/simulasi-kasir")
    expect(h).not.toMatch(/<select[ >]/)
    const ids = [...h.matchAll(/<div class="sel" data-sel><input type="hidden" id="(\w+)" value="[^"]*">\n<button type="button" id="\1-btn" class="sel-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="\1-list" aria-labelledby="\1-lbl \1-val">/g)].map((m) => m[1])
    expect(ids).toEqual(["kota", "cod", "pack", "bayar"])
    expect(h.match(/role="listbox" tabindex="-1"/g)?.length).toBe(4)
    expect(h.match(/<svg class="opt-check"/g)?.length).toBe(4 + 2 + 3 + 3)
    expect(h).toContain('<form class="sim-stage" id="sim"')
    expect(h).not.toMatch(/<form[^>]*style=|<div class="grid2" style=|<h2 style=/)
    expect(h).toContain("list.forEach(function(o){if(o!==me)o.close(false)})")
    // Sol R1 P2: 16px option text on phones.
    expect(h).toContain("@media(max-width:640px){.sim .opt-main{font-size:1rem}}")
  })

  it("DEC-247B footer: compact link rhythm and two link columns on phones", async () => {
    const css = await (await get("/")).text()
    expect(css).toContain(".fcol ul{list-style:none;margin:0;padding:0;display:grid;gap:6px;align-content:start}")
    expect(css).toContain(".fcol a{color:var(--body);text-decoration:none;display:inline-flex;align-items:center;min-height:28px;line-height:1.45}")
    expect(css).toContain(".fgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px 24px}.fbrand{grid-column:1/-1}")
    expect(css).not.toContain("min-height:44px}.fcol a:hover")
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

  it("home + /fitur (DEC-247A, slimmed by DEC-249): showcase and proof band on /fitur, pricing + link, five FAQ, quiet closing", async () => {
    const home = await html("/")
    const h = await html("/fitur")
    // DEC-249: the layered showcase and the proof band moved from the home page to the top of /fitur.
    for (const moved of ['<figure class="layers">', '<div class="proof">', '<table class="cmp">', 'aria-labelledby="layanan-title"', 'aria-labelledby="alat-title"']) expect(home, moved).not.toContain(moved)
    expect(h.indexOf('aria-labelledby="satu-layar-title"')).toBeGreaterThan(h.indexOf('<section class="phead"'))
    expect(h.indexOf('aria-labelledby="bukti-title"')).toBeLessThan(h.indexOf('<section class="sec tight" aria-label="Enam modul GeraiExpress">'))
    // 1. Layered product UI: faded KPI layer behind a floating table card, synthetic data labelled as such.
    expect(h).toContain('<figure class="layers">')
    expect(h).toMatch(/<div class="layer-back" aria-hidden="true">[\s\S]*Saldo Aman[\s\S]*<div class="spark">/)
    expect(h).toMatch(/<div class="layer-front float">[\s\S]*Ringkasan Ekspedisi Loket[\s\S]*Cocok 1:1/)
    expect(h).toContain("Data contoh untuk ilustrasi, bukan angka gerai sungguhan.")
    // Sol R1 (non-blocking P2): every synthetic visual says it is an illustration.
    expect(home).toMatch(/<div class="bento" data-bento>[\s\S]*?<\/div>\n<p class="note">Ilustrasi fitur dengan data contoh, bukan transaksi gerai sungguhan\.<\/p>\n<\/div><\/section>/)
    expect(h).toMatch(/<div class="float rb"[\s\S]*?<p class="rb-note">Ilustrasi alur, bukan angka pengukuran\.<\/p>\n<\/div>/)
    // 2. Two porcelain proof surfaces 01 and 02.
    expect(h).toMatch(/<div class="proof">[\s\S]*<span class="idx">01<\/span><h3>Dari catatan campur ke rekonsiliasi 1:1 per resi[\s\S]*<span class="idx">02<\/span><h3>Tiga lapis privasi/)
    // 3. The same pricing radios as /biaya-dan-paket on the home page; the comparison stays on /biaya-dan-paket (linked).
    const biaya = await html("/biaya-dan-paket")
    const block = (x: string, open: string, close: string) => x.slice(x.indexOf(open), x.indexOf(close, x.indexOf(open)) + close.length)
    expect(block(home, '<div class="pricing" data-pricing>', "</fieldset>")).toBe(block(biaya, '<div class="pricing" data-pricing>', "</fieldset>"))
    expect(biaya).toContain('<table class="cmp">')
    expect(home).toContain('<p class="more"><a href="/biaya-dan-paket">Lihat tabel perbandingan &amp; skema komisi →</a></p>')
    expect(home).not.toContain("Biaya kemitraan")
    // 4. Five FAQ rows, worded exactly as on /tanya-jawab, plus the link to all questions.
    const faq = block(home, '<section class="sec tight" aria-labelledby="faq-title">', "</section>")
    expect(faq.match(/<details/g)).toHaveLength(5)
    const all = await html("/tanya-jawab")
    for (const q of faq.matchAll(/<summary>([^<]+)<\/summary>/g)) expect(all).toContain(`<summary>${q[1]}</summary>`)
    expect(faq).toContain('<a href="/tanya-jawab">Semua pertanyaan →</a>')
    // 5. DEC-248 (owner 2026-11-19): the closing is quiet — title, one sentence, two actions; no three-step pills.
    for (const p of PAGES) {
      const c = block(await html(p), '<section class="closing"', "</section>")
      expect(c, p).toMatch(/^<section class="closing" aria-labelledby="tutup-title"><div class="wrap"><div class="callout">\n<h2 id="tutup-title">Siap membuka loket kirim paket di toko Anda\?<\/h2>\n<p>[^<]+<\/p>\n<div class="row"><a class="cta" href="[^"]+\/daftar-akun">Daftar Gerai<\/a><a class="cta ghost" href="\/[a-z-]+">[^<]+<\/a><\/div>/)
      expect(c, p).not.toMatch(/cl-steps|cl-n|<ol/)
    }
    const css = /<style>([\s\S]*?)<\/style>/.exec(h)![1]!
    expect(css).toContain('.faq summary::after{content:"+"')
    expect(css).toContain(".faq details[open] summary::after{transform:rotate(45deg)")
    expect(css).not.toContain(".cl-steps")
  })
})

