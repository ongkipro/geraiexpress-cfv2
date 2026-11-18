// TASK-501 mini-site (DEC-207, spec 05 §3): publish-price quote with Turnstile, QR pre-booking (48 h) whose INV opens
// at the counter and keeps its slug, anonymous tracking with 0 PII (initials + district/city), the 4-digit gate,
// draft purge, robots/sitemap, and no cookies on tenant hosts.
import { env, exports } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { resetMock } from "../../src/mengantar/mock"
import { recordProviderObservation } from "../../src/do/gerai-vault/status"
import { checkoutGerai, post, DEST, ORIGIN } from "../dispatch/helpers"
import { appGet } from "../webhooks/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

async function site(slug: string) {
  const t = await checkoutGerai(slug)
  await env.DB.prepare("INSERT INTO tenant_hostnames (hostname, tenant_id, kind, state, created_at, activated_at) VALUES (?1, ?2, 'platform_subdomain', 'active', 1, 1) ON CONFLICT DO NOTHING").bind(`${slug}.geraimitra.localhost`, t.tenantId).run()
  return { ...t, base: `http://${slug}.geraimitra.localhost:8787` }
}
const form = (o: Record<string, string>) => new URLSearchParams(o)
let ipN = 0
const ip = () => `198.51.100.${(ipN++ % 200) + 1}`
const get = (url: string) => exports.default.fetch(url, { headers: { "cf-connecting-ip": ip() } })
const postForm = (url: string, body: Record<string, string>) => exports.default.fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": ip() }, body: form(body), redirect: "manual" })

const DRAFT = { cod: "0", senderName: "Ibu Siti Nisa", senderPhone: "081234567890", senderStore: "Toko Hijab Nisa", recipientName: "Rina Kartika", recipientPhone: "085799998821", recipientId: DEST, recipientLabel: "Tebet Barat, Tebet, Jakarta Selatan, DKI Jakarta", recipientStreet: "Jl. Tebet Barat No. 14 RT 02", content: "Pakaian", weight: "1000", "cf-turnstile-response": "ok" }

describe("mini-site", () => {
  it("home renders the outlet; quote shows publish prices only; Turnstile required; no cookies", async () => {
    const t = await site("msongkir")
    const home = await get(`${t.base}/`)
    expect(home.status).toBe(200)
    expect(home.headers.get("set-cookie")).toBeNull()
    const h = await home.text()
    expect(h).toContain("<h1>msongkir</h1>")
    expect(h).toContain("Didukung jaringan resmi GeraiExpress")
    expect((await postForm(`${t.base}/`, { destId: DEST, destLabel: "Tebet", weight: "1000", unit: "g" })).status).toBe(422)
    const q = await postForm(`${t.base}/`, { destId: DEST, destLabel: "Tebet", weight: "1", unit: "kg", "cf-turnstile-response": "ok" })
    const body = await q.text()
    expect(q.status).toBe(200)
    expect(body).toMatch(/J&amp;T Express[\s\S]*Rp 12\.500/)
    // Never cost or margin on a public page: provider net (Rp 10.000 for J&T 1 kg at 20 %) must not appear.
    expect(body).not.toContain("Rp 10.000")
    expect(body.replace(/<style>[\s\S]*?<\/style>/, "")).not.toMatch(/laba|margin|biaya gerai/i)
    expect(await (await get(`${t.base}/robots.txt`)).text()).toContain("Disallow: /lacak")
    expect(await (await get(`${t.base}/sitemap.xml`)).text()).toContain(`<loc>https://msongkir.geraimitra.localhost/</loc>`)
  })

  it("QR pre-booking: 48 h draft → card with QR → counter claim keeps the INV → issue → anonymous tracking has 0 PII", async () => {
    const t = await site("msqr")
    const bad = await postForm(`${t.base}/kirim`, { ...DRAFT, recipientPhone: "12" })
    expect(bad.status).toBe(422)
    expect(await bad.text()).toContain("Nomor HP penerima tidak valid.")
    const r = await postForm(`${t.base}/kirim`, DRAFT)
    expect(r.status).toBe(303)
    const slug = /\/kirim\/([a-z0-9]{7})$/.exec(r.headers.get("location")!)![1]!
    const card = await (await get(`${t.base}/kirim/${slug}`)).text()
    expect(card).toContain(`INV ${slug.toUpperCase()}`)
    expect(card).toContain("<svg")
    const d = await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec<{ expires_at: number; created_at: number }>("SELECT expires_at, created_at FROM minisite_drafts WHERE slug = ?", slug).one())
    expect(d.expires_at - d.created_at).toBe(48 * 3600_000)
    // Counter: claim → quote frozen under the same INV → parties → dispatch.
    const claim = ((await (await post(`/minisite-drafts/${slug}/claim`, t.cookie, {})).json()) as { data: { senderId: string; recipientId: string; destination: { id: string }; weightGram: number } }).data
    expect(claim.destination.id).toBe(DEST)
    const f = ((await (await post("/quotes/freeze", t.cookie, { slug, destinationAreaId: DEST, weightGram: claim.weightGram, mode: "none", serviceCode: "JT" })).json()) as { data: { slug: string } }).data
    expect(f.slug).toBe(slug)
    await post(`/contacts/senders/${claim.senderId}/verify-wa`, t.cookie, {})
    await post(`/shipments/${slug}/parties`, t.cookie, { senderId: claim.senderId, recipientId: claim.recipientId, content: "Pakaian", prohibitedAck: true, maskPreset: "standar_gerai" })
    const awb = ((await (await post(`/shipments/${slug}/dispatch`, t.cookie, {})).json()) as { data: { awb: string } }).data.awb
    expect(awb).toMatch(/^JT/)
    const ch = await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec<{ entry_channel: string }>("SELECT entry_channel FROM shipments WHERE slug = ?", slug).one().entry_channel)
    expect(ch).toBe("minisite_qr")
    for (const q of [slug.toUpperCase(), awb]) {
      const page = await (await get(`${t.base}/lacak?q=${q}`)).text()
      expect(page).toContain(`INV ${slug.toUpperCase()}`)
      expect(page).toContain("R*** K******")
      expect(page).toContain("Tebet, Jakarta Selatan")
      for (const pii of ["Rina", "Kartika", "085799998821", "8821", "Tebet Barat No. 14", "081234567890", "Siti Nisa", "Pakaian"]) expect(page, pii).not.toContain(pii)
    }
  })

  it("4-digit gate: only after delivered; wrong → refused; 5 wrong lock; right digits reveal the recipient name", async () => {
    const t = await site("msgate")
    const r = await postForm(`${t.base}/kirim`, DRAFT)
    const slug = /\/kirim\/([a-z0-9]{7})$/.exec(r.headers.get("location")!)![1]!
    const claim = ((await (await post(`/minisite-drafts/${slug}/claim`, t.cookie, {})).json()) as { data: { senderId: string; recipientId: string } }).data
    await post("/quotes/freeze", t.cookie, { slug, destinationAreaId: DEST, weightGram: 1000, mode: "none", serviceCode: "JT" })
    await post(`/shipments/${slug}/parties`, t.cookie, { senderId: claim.senderId, recipientId: claim.recipientId, content: "Pakaian", prohibitedAck: true })
    await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    expect((await postForm(`${t.base}/lacak/${slug}/buka`, { last4: "8821", "cf-turnstile-response": "ok" })).status).toBe(400)
    await runInDurableObject(t.vault, (_i, st) => recordProviderObservation(st.storage.sql, { slug, eventKey: `dl-${slug}`, source: "webhook", rawCategory: "DELIVERED", mapped: "delivered", eventAt: Date.now() + 60_000, eventAtText: null }, Date.now()))
    const before = await (await get(`${t.base}/lacak?q=${slug}`)).text()
    expect(before).toContain("4 angka terakhir No. HP penerima")
    expect(before).not.toContain("Rina")
    const wrong = await postForm(`${t.base}/lacak/${slug}/buka`, { last4: "0000", "cf-turnstile-response": "ok" })
    expect(wrong.status).toBe(400)
    expect(await wrong.text()).not.toContain("Rina")
    // Without the human check the gate refuses (Turnstile, final Carbon pass M5 #6).
    expect((await postForm(`${t.base}/lacak/${slug}/buka`, { last4: "8821" })).status).toBe(400)
    const ok = await postForm(`${t.base}/lacak/${slug}/buka`, { last4: "8821", "cf-turnstile-response": "ok" })
    expect(ok.status).toBe(200)
    expect(await ok.text()).toContain("Diterima oleh: Rina Kartika")
    let last = 0
    for (let i = 0; i < 5; i++) last = (await postForm(`${t.base}/lacak/${slug}/buka`, { last4: "1111", "cf-turnstile-response": "ok" })).status
    expect(last).toBe(429)
    expect((await postForm(`${t.base}/lacak/${slug}/buka`, { last4: "8821", "cf-turnstile-response": "ok" })).status).toBe(429)
  })

  it("ADR-0005 (Sol R1 P1): a dropship shipment's tracking page and unlock show no outlet mark, name, place, map or chat", async () => {
    const t = await site("msmasked")
    const profile = { name: "Gerai Berkah Jaya", areaId: ORIGIN, areaLabel: "Dago, Coblong, Kota Bandung", street: "Jl. Merdeka No. 45", whatsapp: "081234560045", openingHours: "08.00–21.00" }
    expect((await post("/settings/profile", t.cookie, profile)).status).toBe(200)
    await runInDurableObject(t.vault, (_i, st) => void st.storage.sql.exec("UPDATE tenant_outlets SET latitude = -6.8915, longitude = 107.6107 WHERE is_default = 1"))
    const r = await postForm(`${t.base}/kirim`, DRAFT)
    const slug = /\/kirim\/([a-z0-9]{7})$/.exec(r.headers.get("location")!)![1]!
    const claim = ((await (await post(`/minisite-drafts/${slug}/claim`, t.cookie, {})).json()) as { data: { senderId: string; recipientId: string } }).data
    await post("/quotes/freeze", t.cookie, { slug, destinationAreaId: DEST, weightGram: 1000, mode: "none", serviceCode: "JT" })
    await post(`/shipments/${slug}/parties`, t.cookie, { senderId: claim.senderId, recipientId: claim.recipientId, content: "Pakaian", prohibitedAck: true })
    await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    await runInDurableObject(t.vault, (_i, st) => recordProviderObservation(st.storage.sql, { slug, eventKey: `dl-${slug}`, source: "webhook", rawCategory: "DELIVERED", mapped: "delivered", eventAt: Date.now() + 60_000, eventAtText: null }, Date.now()))
    // The header's kecamatan line is outlet identity; the body's origin district (spec 05 §3) is not and stays.
    const OUTLET = ["Gerai Berkah Jaya", "Jl. Merdeka", "google.com/maps", "wa.me/62812", "/logo?v=", 'id="lokasi"', "<small>Coblong, Kota Bandung</small>", "Chat WhatsApp Gerai"]
    // Ordinary (outlet-branded) label: the outlet identity is part of the page.
    const plain = await (await get(`${t.base}/lacak?q=${slug}`)).text()
    for (const x of OUTLET.filter((x) => x !== "/logo?v=")) expect(plain, x).toContain(x)
    expect(plain).toContain('<span class="mark mono" aria-hidden="true">GB</span>')
    // Dropship label: nothing of the outlet, on the result and on the unlock response.
    await runInDurableObject(t.vault, (_i, st) => void st.storage.sql.exec("UPDATE shipments SET mask_preset = 'dropship_toko' WHERE slug = ?", slug))
    const masked = await get(`${t.base}/lacak?q=${slug}`)
    expect(masked.status).toBe(200)
    const unlock = await postForm(`${t.base}/lacak/${slug}/buka`, { last4: "8821", "cf-turnstile-response": "ok" })
    expect(unlock.status).toBe(200)
    for (const h of [await masked.text(), await unlock.text()]) {
      expect(h).toContain(`INV ${slug.toUpperCase()}`)
      expect(h).toContain("<h1>Lacak Paket</h1>")
      expect(h).toContain('<span class="mark mono" aria-hidden="true">#</span>')
      expect(h).toContain("<title>Lacak Paket</title>")
      for (const x of OUTLET) expect(h, x).not.toContain(x)
    }
    expect(await (await get(`${t.base}/`)).text()).toContain("<h1>Gerai Berkah Jaya</h1>")
  })

  it("expired draft refused at the counter and purged by the sweep; draft from another gerai not found", async () => {
    const t = await site("msbasi")
    const other = await site("mslain")
    const r = await postForm(`${t.base}/kirim`, DRAFT)
    const slug = /\/kirim\/([a-z0-9]{7})$/.exec(r.headers.get("location")!)![1]!
    expect((await post(`/minisite-drafts/${slug}/claim`, other.cookie, {})).status).toBe(404)
    expect((await get(`${other.base}/lacak?q=${slug}`)).status).toBe(404)
    await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec("UPDATE minisite_drafts SET expires_at = ? WHERE slug = ?", Date.now() - 1, slug))
    expect(((await (await post(`/minisite-drafts/${slug}/claim`, t.cookie, {})).json()) as { error: { code: string; message: string } }).error).toMatchObject({ code: "DRAFT_EXPIRED", message: "Kode QR sudah lewat 48 jam. Minta pelanggan mengisi ulang." })
    await t.vault.pollStatus(t.tenantId, Date.now())
    const left = await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM minisite_drafts").one().n)
    expect(left).toBe(0)
    // The app session cookie is never sent to tenant hosts; API families are foreign there.
    expect((await get(`${t.base}/api/app/workspace`)).status).toBe(404)
    void appGet
  })
})
