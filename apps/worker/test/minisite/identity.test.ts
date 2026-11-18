// DEC-247 §2.2 / §2.4 mini-site: the outlet's own identity (logo via `/logo` scoped to the host's tenant and purpose
// `logo`, initials favicon and monogram, never the platform mark), `Buka Peta`, the enabled-courier strip with
// same-origin courier logos, Reguler/Kargo + P×L×T quote, the COD field toggle, WhatsApp only outside the header (Lokasi card + phone menu, DEC-247B), the footer attribution rule,
// Indonesian constraint validation, < 35 KB pages and no cookies anywhere.
import { env, exports } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { resetMock } from "../../src/mengantar/mock"
import { COD_SCRIPT, favicon, MENU_SCRIPT, VALIDATION_SCRIPT } from "../../src/minisite/html"
import { checkoutGerai, DEST, ORIGIN, post } from "../dispatch/helpers"
import { APP } from "../webhooks/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

async function site(slug: string) {
  const t = await checkoutGerai(slug)
  await env.DB.prepare("INSERT INTO tenant_hostnames (hostname, tenant_id, kind, state, created_at, activated_at) VALUES (?1, ?2, 'platform_subdomain', 'active', 1, 1) ON CONFLICT DO NOTHING").bind(`${slug}.geraimitra.localhost`, t.tenantId).run()
  return { ...t, base: `http://${slug}.geraimitra.localhost:8787` }
}
let ipN = 0
const ip = () => `203.0.113.${(ipN++ % 200) + 1}`
const get = (url: string, method = "GET") => exports.default.fetch(url, { method, headers: { "cf-connecting-ip": ip() } })
const postForm = (url: string, body: Record<string, string>) => exports.default.fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": ip() }, body: new URLSearchParams(body), redirect: "manual" })

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
async function upload(cookie: string, purpose: "logo" | "qris") {
  const r = await exports.default.fetch(`${APP}/api/app/media?purpose=${purpose}`, { method: "POST", headers: { origin: APP, cookie, "content-type": "application/octet-stream" }, body: PNG })
  expect(r.status).toBe(201)
  return ((await r.json()) as { data: { id: string } }).data.id
}
const PROFILE = { name: "Gerai Berkah Jaya", areaId: ORIGIN, areaLabel: "Dago, Coblong, Kota Bandung", street: "Jl. Merdeka No. 45", whatsapp: "081234560045", openingHours: "08.00–21.00" }
const setOutlet = (t: Awaited<ReturnType<typeof site>>, sql: string, ...args: unknown[]) => runInDurableObject(t.vault, (_i, st) => void st.storage.sql.exec(sql, ...args))
const size = (s: string) => new TextEncoder().encode(s).byteLength

describe("mini-site identity (DEC-247)", () => {
  it("/logo serves only this host's tenant logo-purpose image; otherwise 404 and a monogram; never cookies", async () => {
    const a = await site("msidlogo")
    const b = await site("msidlain")
    const logoId = await upload(a.cookie, "logo")
    expect((await post("/settings/profile", a.cookie, { ...PROFILE, logoMediaId: logoId })).status).toBe(200)
    const res = await get(`${a.base}/logo`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/png")
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600")
    expect(res.headers.get("set-cookie")).toBeNull()
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG)
    const home = await (await get(`${a.base}/`)).text()
    expect(home).toContain(`<img class="mark" src="/logo?v=${logoId.slice(0, 8)}" alt="Logo Gerai Berkah Jaya"`)
    expect(home).not.toContain(logoId)

    // Another gerai: no logo → 404 + monogram; pointing its outlet at gerai A's media id still 404 (not in its object).
    expect((await get(`${b.base}/logo`)).status).toBe(404)
    await setOutlet(b, "UPDATE tenant_outlets SET logo_media_id = ? WHERE is_default = 1", logoId)
    expect((await get(`${b.base}/logo`)).status).toBe(404)
    expect((await get(`${b.base}/logo?id=${logoId}`)).status).toBe(404)
    const bHome = await (await get(`${b.base}/`)).text()
    expect(bHome).toContain('<span class="mark mono" aria-hidden="true">M</span>')
    expect(bHome).not.toContain("/logo?v=")

    // A QRIS (or any non-logo purpose) set as the logo id is never served publicly.
    const qrisId = await upload(a.cookie, "qris")
    await setOutlet(a, "UPDATE tenant_outlets SET logo_media_id = ? WHERE is_default = 1", qrisId)
    expect((await get(`${a.base}/logo`)).status).toBe(404)
    expect(await (await get(`${a.base}/`)).text()).toContain('<span class="mark mono" aria-hidden="true">GB</span>')
    expect((await get(`${a.base}/logo`, "POST")).status).toBe(404)

    // Sol R1 P2: a logo-purpose row owned by another tenant (present in this object) is never published by the shell.
    const ownId = await upload(a.cookie, "logo")
    await setOutlet(a, "UPDATE tenant_outlets SET logo_media_id = ? WHERE is_default = 1", ownId)
    expect(await (await get(`${a.base}/`)).text()).toContain(`/logo?v=${ownId.slice(0, 8)}`)
    await setOutlet(a, "UPDATE media_objects SET tenant_id = ? WHERE id = ?", b.tenantId, ownId)
    const foreign = await (await get(`${a.base}/`)).text()
    expect(foreign).not.toContain("/logo?v=")
    expect(foreign).toContain('<span class="mark mono" aria-hidden="true">GB</span>')
    expect((await get(`${a.base}/logo`)).status).toBe(404)
  })

  it("Sol R1 P1: a name starting with a supplementary-plane letter renders (initials by code point, valid favicon)", async () => {
    const t = await site("msidkanji")
    expect((await post("/settings/profile", t.cookie, { ...PROFILE, name: "𠮷野家 Berkah" })).status).toBe(200)
    const r = await get(`${t.base}/`)
    expect(r.status).toBe(200)
    const h = await r.text()
    expect(h).toContain('<span class="mark mono" aria-hidden="true">𠮷B</span>')
    expect(h).toContain(`href="${favicon("𠮷野家 Berkah").replace(/&/g, "&amp;")}"`)
    expect(decodeURIComponent(favicon("𠮷野家 Berkah"))).toContain(">𠮷</text>")
    for (const p of ["/kirim", "/lacak"]) expect((await get(`${t.base}${p}`)).status, p).toBe(200)
  })

  it("favicon carries the outlet initial (white-label); Buka Peta uses the pin, else street + area, else nothing", async () => {
    const t = await site("msidpeta")
    const h0 = await (await get(`${t.base}/`)).text()
    // checkoutGerai's outlet: street only, no coordinates → a street search.
    expect(h0).toContain(`href="https://www.google.com/maps/search/?api=1&amp;query=Jl.%20Dago%20No.%201"`)
    expect((await post("/settings/profile", t.cookie, { ...PROFILE, latitude: "-6.9456", longitude: "107.5703" })).status).toBe(200)
    const h = await (await get(`${t.base}/`)).text()
    expect(h).toContain('href="https://www.google.com/maps/search/?api=1&amp;query=-6.9456,107.5703" target="_blank" rel="noopener">Buka Peta</a>')
    expect(h).toContain("<p>Jl. Merdeka No. 45, Dago, Coblong, Kota Bandung</p><p>Buka 08.00–21.00</p>")
    // Header line under the name: kecamatan + kota.
    expect(h).toContain("<h1>Gerai Berkah Jaya</h1><small>Coblong, Kota Bandung</small>")
    const icon = /<link rel="icon" type="image\/svg\+xml" href="([^"]+)">/.exec(h)![1]!
    expect(icon).toBe(favicon("Gerai Berkah Jaya").replace(/'/g, "&#39;"))
    expect(decodeURIComponent(icon.replace("data:image/svg+xml,", ""))).toContain(">G</text>")
    // White-label: no platform logo or favicon on the page chrome.
    expect(h).not.toMatch(/\/logo\.svg|favicon\.svg|og-geraiexpress/)
    await setOutlet(t, "UPDATE tenant_outlets SET latitude = NULL, longitude = NULL, street_address = NULL, subdistrict_name = NULL WHERE is_default = 1")
    expect(await (await get(`${t.base}/`)).text()).not.toContain("Buka Peta")
  })

  it("courier strip lists only the couriers this gerai enabled; logos are same-origin, allow-listed, cookie-free", async () => {
    const t = await site("msidkurir")
    expect((await post("/settings/couriers/JT", t.cookie, { enabled: false })).status).toBe(200)
    const h = await (await get(`${t.base}/`)).text()
    const strip = /<ul class="strip">([\s\S]*?)<\/ul>/.exec(h)![1]!
    expect(strip).toContain('src="/couriers/jne.svg" alt="JNE"')
    expect(strip).toContain('src="/couriers/spx.svg"')
    expect(strip).not.toContain("/couriers/jt.svg")
    expect(strip.match(/<img /g)).toHaveLength(8)
    const svg = await get(`${t.base}/couriers/jt.svg`)
    expect(svg.status).toBe(200)
    expect(svg.headers.get("content-type")).toBe("image/svg+xml")
    expect(svg.headers.get("x-content-type-options")).toBe("nosniff")
    expect(svg.headers.get("set-cookie")).toBeNull()
    expect(await svg.text()).toContain("<svg")
    for (const p of ["/couriers/ninja.svg", "/couriers/JT.svg", "/couriers/../index.html", "/couriers%2Fjne.svg", "/app/couriers/jne.svg", "/couriers/jne.svg.map", "/logo.svg"]) expect((await get(`${t.base}${p}`)).status, p).toBe(404)
    expect((await get(`${t.base}/couriers/jne.svg`, "POST")).status).toBe(404)
  })

  it("Cek Ongkir: Reguler/Kargo choice + optional P×L×T; cargo only from 5 kg; courier logos on results", async () => {
    const t = await site("msidkargo")
    const h = await (await get(`${t.base}/`)).text()
    for (const x of ['name="svc" value="regular" checked', 'name="svc" value="cargo"', 'id="lengthCm" name="lengthCm"', 'id="widthCm" name="widthCm"', 'id="heightCm" name="heightCm"', "Kargo (mulai 5 kg, Non-COD)"]) expect(h).toContain(x)
    const q = (b: Record<string, string>) => postForm(`${t.base}/`, { destId: DEST, destLabel: "Tebet", unit: "kg", "cf-turnstile-response": "ok", ...b })
    const light = await (await q({ weight: "1", svc: "cargo" })).text()
    expect(light).toContain("Kargo untuk paket mulai 5 kg")
    const cargo = await q({ weight: "6", svc: "cargo" })
    expect(cargo.status).toBe(200)
    const c = await cargo.text()
    expect(c).toContain("Ongkir Kargo ke Tebet")
    expect(c).toMatch(/<span class="clogo"><img src="\/couriers\/jne\.svg" alt=""[^>]*><\/span><span class="rn">JNE Cargo</)
    expect(c).toContain("Rp 66.000")
    expect(c).not.toMatch(/<span class="rn">J&amp;T/)
    // Volumetric: a light but large parcel is billed by volume (shown per row), regular only.
    const vol = await (await q({ weight: "1", svc: "regular", lengthCm: "50", widthCm: "40", heightCm: "30" })).text()
    expect(vol).toContain("Ongkir Reguler ke Tebet")
    expect(vol).toContain("(50×40×30 cm)")
    expect(vol).toMatch(/dihitung \d+ kg/)
    expect(vol).not.toContain("JNE Cargo")
    const bad = await q({ weight: "1", svc: "regular", lengthCm: "50" })
    expect(bad.status).toBe(422)
    expect(await bad.text()).toContain("Isi panjang, lebar dan tinggi (1–300 cm) atau kosongkan semuanya.")
    // Sol R1 P2: dimensions are validated as submitted, never rewritten (`-20` → 20, `1.5` → 15) or dropped (three zeroes).
    for (const dims of [["-20", "40", "30"], ["1.5", "40", "30"], ["0", "0", "0"], ["50", "40", "0"], ["301", "40", "30"], ["50", "", "30"], ["5O", "40", "30"]]) {
      const r = await q({ weight: "1", svc: "regular", lengthCm: dims[0]!, widthCm: dims[1]!, heightCm: dims[2]! })
      expect(r.status, dims.join("x")).toBe(422)
      const h = await r.text()
      expect(h, dims.join("x")).toContain("Isi panjang, lebar dan tinggi (1–300 cm) atau kosongkan semuanya.")
      expect(h, dims.join("x")).not.toContain("Ongkir Reguler ke")
    }
  })

  it("/kirim: COD price field is always in the HTML (no-JS) and toggled by the inline COD script", async () => {
    const t = await site("msidcod")
    const k = await (await get(`${t.base}/kirim`)).text()
    expect(k).toMatch(/<div id="codBox"><label for="codGoods">Harga barang COD \(Rp\)<\/label><input id="codGoods" name="codGoods"/)
    expect(k).toContain('name="cod" value="0" checked')
    expect(k).toContain(COD_SCRIPT)
    expect(COD_SCRIPT).toContain("b.hidden=f.elements.cod.value!=='1'")
    // Server validation stays authoritative: COD without a price is refused in Indonesian.
    const r = await postForm(`${t.base}/kirim`, { cod: "1", senderName: "Ibu Siti Nisa", senderPhone: "081234567890", recipientName: "Rina Kartika", recipientPhone: "085799998821", recipientId: DEST, recipientLabel: "Tebet Barat, Tebet, Jakarta Selatan, DKI Jakarta", recipientStreet: "Jl. Tebet Barat No. 14", content: "Pakaian", weight: "1000", "cf-turnstile-response": "ok" })
    expect(r.status).toBe(422)
    expect(await r.text()).toContain("Harga barang COD Rp10.000–Rp5.000.000.")
  })

  it("WhatsApp: never in the header — in the Lokasi & Jam Buka card beside Buka Peta and as the phone menu's last row; < 35 KB, no cookies", async () => {
    const t = await site("msidwa")
    expect((await post("/settings/profile", t.cookie, PROFILE)).status).toBe(200)
    const r = await postForm(`${t.base}/kirim`, { cod: "0", senderName: "Ibu Siti Nisa", senderPhone: "081234567890", recipientName: "Rina Kartika", recipientPhone: "085799998821", recipientId: DEST, recipientLabel: "Tebet Barat, Tebet, Jakarta Selatan, DKI Jakarta", recipientStreet: "Jl. Tebet Barat No. 14", content: "Pakaian", weight: "1000", "cf-turnstile-response": "ok" })
    const slug = /\/kirim\/([a-z0-9]{7})$/.exec(r.headers.get("location")!)![1]!
    const quote = postForm(`${t.base}/`, { destId: DEST, destLabel: "Tebet", weight: "1", unit: "kg", svc: "regular", "cf-turnstile-response": "ok" })
    const pages: Array<[string, Promise<Response>]> = [
      ["/", get(`${t.base}/`)],
      ["POST /", quote],
      ["/kirim", get(`${t.base}/kirim`)],
      ["/lacak", get(`${t.base}/lacak`)],
      [`/lacak?q=${slug}`, get(`${t.base}/lacak?q=${slug.toUpperCase()}`)],
    ]
    const chat = 'href="https://wa.me/6281234560045" rel="noopener">Chat WhatsApp Gerai'
    for (const [name, p] of pages) {
      const res = await p
      expect(res.status, name).toBe(200)
      expect(res.headers.get("set-cookie"), name).toBeNull()
      const h = await res.text()
      const header = /<header class="hdr">([\s\S]*?)<\/header>/.exec(h)![1]!
      expect(header, name).not.toMatch(/wa\.me|WhatsApp/)
      expect(header, name).toContain('<a class="btn pri send" href="/kirim">Kirim Paket</a>')
      expect(header, name).toContain('id="mnav-btn" href="#mnav" role="button" aria-controls="mnav" aria-expanded="false" aria-label="Buka menu"><i aria-hidden="true"></i>Menu</a>')
      const visit = /<section class="sec" id="lokasi"[\s\S]*?<\/section>/.exec(h)![0]
      expect(visit, name).toMatch(/<h2 id="visit">Lokasi &amp; Jam Buka<\/h2>[\s\S]*>Buka Peta<\/a><a class="btn soft" href="https:\/\/wa\.me\/6281234560045" rel="noopener">Chat WhatsApp Gerai<\/a><\/div>/)
      const menu = /<nav class="mnav" id="mnav"[^>]*>([\s\S]*?)<\/nav>/.exec(h)![1]!
      expect(menu, name).toMatch(/<a class="mwa" href="https:\/\/wa\.me\/6281234560045" rel="noopener">Chat WhatsApp Gerai<small>Tanya gerai langsung<\/small><\/a>$/)
      expect(h.match(/https:\/\/wa\.me\//g) ?? [], name).toHaveLength(2)
      expect(size(h), name).toBeLessThan(35 * 1024)
      expect(h, name).toContain(VALIDATION_SCRIPT)
      expect(h, name).toContain(MENU_SCRIPT)
    }
    // The QR card's own WA action ("Kirim ke WA Saya") is its only WA link: no gerai chat in the card or the menu.
    const card = await get(`${t.base}/kirim/${slug}`)
    const ch = await card.text()
    expect(card.headers.get("set-cookie")).toBeNull()
    expect(size(ch)).toBeLessThan(35 * 1024)
    expect(ch).toContain('href="https://wa.me/?text=Kode%20kiriman%20saya')
    expect(ch.match(/https:\/\/wa\.me\//g)).toHaveLength(1)
    expect(ch).not.toContain(chat)
  })

  it("footer attribution: shown on the tenant zone, omitted on a custom domain (pure white-label)", async () => {
    const t = await site("msidfoot")
    const zone = await (await get(`${t.base}/`)).text()
    expect(zone).toContain("<footer><div class=\"wrap\"><span>Didukung jaringan resmi GeraiExpress</span>")
    await env.DB.prepare("INSERT INTO tenant_hostnames (hostname, tenant_id, kind, role, state, created_at, activated_at) VALUES ('kirim.tokoberkah.id', ?1, 'custom', 'primary', 'active', 1, 1)").bind(t.tenantId).run()
    hostCache.clear()
    for (const p of ["/", "/kirim", "/lacak"]) {
      const res = await get(`http://kirim.tokoberkah.id${p}`)
      expect(res.status, p).toBe(200)
      const h = await res.text()
      expect(h, p).toContain("<h1>msidfoot</h1>")
      expect(h, p).not.toContain("Didukung jaringan resmi GeraiExpress")
      expect(h, p).not.toMatch(/GeraiExpress/)
      expect(h, p).toContain('<footer><div class="wrap"><span>msidfoot</span>')
    }
  })

  it("Indonesian validation: the public forms are constraint-validated and the net speaks Indonesian", async () => {
    const t = await site("msidval")
    const home = await (await get(`${t.base}/`)).text()
    expect(home).toMatch(/<form method="post" action="\/#hasil">/)
    expect(home).toMatch(/id="destText" name="destText" type="text" value="" data-area="dest" autocomplete="off" required/)
    const kirim = await (await get(`${t.base}/kirim`)).text()
    expect(kirim).toMatch(/<form method="post" action="\/kirim">/)
    for (const x of ['id="senderName" name="senderName" type="text" value="" autocomplete="name" required minlength="2"', 'id="content" name="content" type="text" value="" required minlength="3" maxlength="60"', 'id="recipientText" name="recipientText" type="text" value="" data-area="recipient" autocomplete="off" required']) expect(kirim).toContain(x)
    expect(await (await get(`${t.base}/lacak`)).text()).toMatch(/<input id="q" name="q" type="text" value="" required maxlength="40"/)
    for (const h of [home, kirim]) expect(h).not.toContain("novalidate")
    for (const x of ["'Kolom'+n+' wajib diisi.'", "'Minimal '+f.minLength+' karakter.'", "data-msg-invalid", "setCustomValidity(m)"]) expect(VALIDATION_SCRIPT).toContain(x)
    for (const x of ["Please", "fill out", "this field"]) expect(VALIDATION_SCRIPT).not.toContain(x)
  })
})
