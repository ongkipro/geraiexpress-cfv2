// `<slug>.gerai.cc` mini-site (TASK-501, DEC-207, PR-19, spec 05 §3, visual 03 §1). Routes:
//   GET  /                 Cek Ongkir (publish prices only) — POST / runs the quote (Turnstile + per-IP limit)
//   GET  /kirim            Kirim dari Rumah form — POST /kirim creates a 48 h QR pre-booking (Turnstile + IP limit)
//   GET  /kirim/:slug      the QR card for a pre-booking
//   GET  /lacak[?q=]       privacy-safe tracking — POST /lacak/:slug/buka is the 4-digit recipient-phone gate
//   GET  /area?q=          area search for the forms (KV-cached public lookup)
//   GET  /robots.txt, /sitemap.xml
// Tenant comes only from the classified host (never from the request). No cookies are set or read here.
import { qrSvg } from "@gx/thermal-print"
import { vaultFor } from "../do/gerai-vault/stub"
import type { PublicTrack } from "../do/gerai-vault"
import { searchAreas } from "../couriers/areas"
import { hit } from "../auth/throttle"
import { verifyTurnstile } from "../auth/turnstile"
import { clientIp, ipHash } from "../http/request"
import { escapeHtml as e, notFoundHtml } from "../http/pages"
import { AppError } from "../http/envelope"
import { parseQuoteInput, runQuote } from "../pricing/quote/service"
import { AREA_SCRIPT, page, rp, turnstile, TURNSTILE_SCRIPT, wa, type Shell } from "./html"

// `canonicalHost` = the gerai's custom domain once active and probed, else `<slug>.<zone>` (spec 11 §5 step 6).
type Ctx = { tenantId: string; tenantSlug: string; host: string; canonicalHost?: string }

const html = (body: string, status = 200, cache = "no-store") => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": cache, "x-robots-tag": status === 200 ? "all" : "noindex" } })

const isTurnstileTestKey = (k: string) => /^[123]x0{20,}[A-Za-z]{2}$/.test(k)

async function humanOk(env: Env, request: Request, token: unknown): Promise<boolean> {
  if (env.GX_ENV === "local" && isTurnstileTestKey(env.TURNSTILE_SECRET_KEY)) return typeof token === "string" && token.length > 0
  if (!env.TURNSTILE_SITE_KEY) return false
  return verifyTurnstile(env.TURNSTILE_SECRET_KEY, typeof token === "string" ? token : undefined, clientIp(request))
}

/** Routed, active gerai without a public profile yet (no outlet, or the object is not provisioned): a neutral page. */
async function preparing(env: Env, c: Ctx): Promise<Response> {
  const t = await env.DB.prepare("SELECT name FROM tenants WHERE id = ?").bind(c.tenantId).first<{ name: string }>()
  const name = e(t?.name ?? c.tenantSlug)
  return html(
    `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Gerai ${name}</title>
<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#203551;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box}main{max-width:440px;text-align:center}h1{font-size:26px;margin:0 0 8px}p{color:#55657D;line-height:1.5;margin:0}</style>
</head><body><main><h1>Gerai ${name}</h1><p>Halaman gerai ini sedang disiapkan. Silakan datang langsung ke gerai.</p></main></body></html>`,
  )
}

async function shell(env: Env, c: Ctx, tab: Shell["tab"], title: string, description: string, path: string, noindex = false): Promise<Shell | null> {
  const p = await vaultFor(env, c.tenantId).minisiteProfile(c.tenantId)
  if (!p.ok || !p.value) return null
  const apex = env.PLATFORM_APEX
  return {
    host: c.host,
    brandOrigin: env.GX_ENV === "local" ? `http://${apex}${c.host.includes(":") ? `:${c.host.split(":")[1]}` : ""}` : `https://${env.GX_ENV === "staging" ? `staging.${apex}` : apex}`,
    outlet: p.value,
    tab,
    title: `${title} - ${p.value.name}`,
    description,
    canonical: `https://${c.canonicalHost ?? c.host}${path}`,
    noindex,
    // Locally with Cloudflare's always-pass test keys the widget adds nothing: render a dev token instead, so the
    // pages work offline and in e2e (whose per-client header breaks the third-party script's CORS preflight).
    turnstileSiteKey: env.GX_ENV === "local" && isTurnstileTestKey(env.TURNSTILE_SECRET_KEY) ? null : env.TURNSTILE_SITE_KEY || null,
  }
}

const field = (name: string, label: string, opts: { value?: string; type?: string; hint?: string; error?: string; attrs?: string } = {}) =>
  `<label for="${name}">${label}</label><input id="${name}" name="${name}" type="${opts.type ?? "text"}" value="${e(opts.value ?? "")}"${opts.attrs ?? ""}${opts.error ? ` aria-invalid="true" aria-describedby="${name}-err"` : ""}>${opts.error ? `<p class="err" id="${name}-err">${e(opts.error)}</p>` : opts.hint ? `<p class="hint">${e(opts.hint)}</p>` : ""}`

const areaField = (prefix: string, label: string, v: Record<string, string>, error?: string) =>
  `${field(`${prefix}Text`, label, { value: v[`${prefix}Label`] ?? v[`${prefix}Text`] ?? "", hint: "Ketik minimal 3 huruf, lalu pilih dari daftar.", error, attrs: ` data-area="${prefix}" autocomplete="off"` })}<input type="hidden" id="${prefix}Id" name="${prefix}Id" value="${e(v[`${prefix}Id`] ?? "")}"><input type="hidden" id="${prefix}Label" name="${prefix}Label" value="${e(v[`${prefix}Label`] ?? "")}">`

// ---- Cek Ongkir -----------------------------------------------------------------------------------------------

async function ongkir(env: Env, c: Ctx, request: Request): Promise<Response> {
  const s = await shell(env, c, "ongkir", "Cek Ongkir", "Bandingkan ongkir J&T, JNE, SiCepat dan ekspedisi lain dari gerai ini. Isi kecamatan tujuan dan berat paket.", "/")
  if (!s) return notFoundHtml()
  let v: Record<string, string> = { weight: "1000" }
  let result = ""
  let errors: Record<string, string> = {}
  if (request.method === "POST") {
    const f = await request.formData()
    v = Object.fromEntries([...f.entries()].map(([k, x]) => [k, String(x).slice(0, 200)]))
    if (!(await humanOk(env, request, f.get("cf-turnstile-response")))) errors.form = "Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi."
    else {
      const ip = await ipHash(env.AUTH_SESSION_PEPPER, request)
      const lim = await hit(env.DB, `ms-quote:${ip}`, 20, 60_000, Date.now())
      if (!lim.allowed) errors.form = "Terlalu banyak cek ongkir. Coba lagi sebentar lagi."
      else {
        const o = await vaultFor(env, c.tenantId).defaultOutlet(c.tenantId)
        const origin = o.ok ? o.value?.areaId : null
        if (!origin) errors.form = "Gerai ini belum siap menerima cek ongkir online."
        else {
          try {
            const unit = v.unit === "kg" ? 1000 : 1
            const input = parseQuoteInput({ destinationAreaId: v.destId, weightGram: Math.round(Number((v.weight ?? "").replace(",", ".")) * unit) || 0, mode: "none" }, origin)
            const q = await runQuote(env, c.tenantId, input, Date.now(), { rateKey: `ms-quote:${c.tenantId}`, perMinute: 60 })
            const cards = q.cards.filter((x) => x.available && x.serviceClass === "regular").sort((a, b) => a.flow.counterDueIdr - b.flow.counterDueIdr)
            result = cards.length
              ? `<h2 id="hasil">Perkiraan ongkir ke ${e(v.destLabel ?? "")}</h2><ul class="rates">${cards
                  .map((x) => `<li><span>${e(x.courierName)} · ${e(x.name)}<br><span class="tag">${e(x.eta ?? "")}${q.medals.termurah === x.serviceCode ? " · Termurah" : ""}${q.medals.tercepat === x.serviceCode ? " · Tercepat" : ""}</span></span><span class="num">${rp(x.P)}</span></li>`)
                  .join("")}</ul><p class="hint">Harga publik ekspedisi untuk ${(input.actualWeightGram / 1000).toLocaleString("id-ID")} kg. Harga akhir dihitung ulang di kasir saat paket ditimbang.</p><div class="row"><a class="cta" href="/kirim?dest=${encodeURIComponent(v.destId ?? "")}&destLabel=${encodeURIComponent(v.destLabel ?? "")}&weight=${input.actualWeightGram}">Isi Alamat dari Rumah</a></div>`
              : `<p class="err">Belum ada ekspedisi yang melayani rute ini dari gerai.</p>`
          } catch (err) {
            if (err instanceof AppError) errors = { ...err.fieldErrors, form: Object.keys(err.fieldErrors).length ? "" : err.userMessage }
            else errors.form = "Cek ongkir gagal. Coba lagi."
          }
        }
      }
    }
  }
  const body = `<form method="post" action="/#hasil" novalidate>
<h2>Cek ongkir dari ${e(s.outlet.name)}</h2>
${areaField("dest", "Kecamatan tujuan", v, errors.destinationAreaId)}
<div class="grid2"><div>${field("weight", "Berat paket", { value: v.weight, attrs: ' inputmode="decimal"', error: errors.weightGram })}</div>
<div><label for="unit">Satuan</label><select id="unit" name="unit"><option value="g"${v.unit !== "kg" ? " selected" : ""}>gram</option><option value="kg"${v.unit === "kg" ? " selected" : ""}>kg</option></select></div></div>
${turnstile(s.turnstileSiteKey)}
${errors.form ? `<p class="err" role="alert">${e(errors.form)}</p>` : ""}
<div class="row"><button class="cta" type="submit">Hitung Ongkir</button></div></form>
${result}`
  const why = `<section class="why"><div class="wrap"><h2>Kenapa kirim di ${e(s.outlet.name)}?</h2><ul>
<li>Banyak pilihan ekspedisi Reguler, Cargo dan COD dari satu meja kasir.</li>
<li>Cocok untuk olshop dan dropshipper: kirim atas nama toko sendiri.</li>
<li>Isi data dari rumah lewat menu Kirim dari Rumah — di gerai tinggal timbang dan tempel resi.</li></ul></div></section>`
  return html(page(s, body, AREA_SCRIPT + TURNSTILE_SCRIPT(s.turnstileSiteKey), why), errors.form || Object.keys(errors).length ? 422 : 200, request.method === "GET" ? "public, max-age=300" : "no-store")
}

// ---- Kirim dari Rumah -----------------------------------------------------------------------------------------

async function kirimForm(env: Env, c: Ctx, request: Request, url: URL): Promise<Response> {
  const s = await shell(env, c, "kirim", "Kirim dari Rumah", "Isi data paket dari rumah, dapatkan kode QR, lalu tunjukkan ke kasir. Tidak perlu antre mengetik alamat.", "/kirim")
  if (!s) return notFoundHtml()
  let v: Record<string, string> = { weight: url.searchParams.get("weight") ?? "1000", recipientId: url.searchParams.get("dest") ?? "", recipientLabel: url.searchParams.get("destLabel") ?? "", cod: "0" }
  let errors: Record<string, string> = {}
  if (request.method === "POST") {
    const f = await request.formData()
    v = Object.fromEntries([...f.entries()].map(([k, x]) => [k, String(x).slice(0, 300)]))
    if (!(await humanOk(env, request, f.get("cf-turnstile-response")))) errors.form = "Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi."
    else {
      const ip = await ipHash(env.AUTH_SESSION_PEPPER, request)
      const lim = await hit(env.DB, `ms-draft:${ip}`, 5, 3600_000, Date.now())
      if (!lim.allowed) errors.form = "Terlalu banyak pengajuan dari jaringan ini. Coba lagi nanti atau langsung datang ke gerai."
      else {
        const r = await vaultFor(env, c.tenantId).createMinisiteDraft(
          c.tenantId,
          { cod: v.cod === "1", senderName: v.senderName, senderPhone: v.senderPhone, senderStore: v.senderStore, recipientName: v.recipientName, recipientPhone: v.recipientPhone, recipientAreaId: v.recipientId, recipientAreaLabel: v.recipientLabel, recipientStreet: v.recipientStreet, content: v.content, weightGram: Number(v.weight), codGoodsIdr: Number((v.codGoods ?? "").replace(/\D/g, "")) },
          ip,
        )
        if (r.ok) return new Response(null, { status: 303, headers: { location: `/kirim/${r.value.slug}`, "cache-control": "no-store" } })
        errors = r.errors ?? { form: "Gerai sedang tidak bisa menerima pengajuan. Coba lagi nanti." }
      }
    }
  }
  const body = `<form method="post" action="/kirim" novalidate>
<h2>Kirim dari Rumah</h2><p class="hint">Isi data di bawah, dapatkan kode QR, lalu tunjukkan ke kasir ${e(s.outlet.name)} dalam 48 jam.</p>
<fieldset style="border:0;padding:0;margin:14px 0 0"><legend style="font-weight:500;margin-bottom:6px">Jenis kiriman</legend><div class="seg">
<label><input type="radio" name="cod" value="0"${v.cod !== "1" ? " checked" : ""}> Non-COD</label><label><input type="radio" name="cod" value="1"${v.cod === "1" ? " checked" : ""}> COD (bayar di tempat)</label></div></fieldset>
<div class="grid2"><div><h2 style="margin-top:24px">Pengirim</h2>
${field("senderName", "Nama pengirim", { value: v.senderName, error: errors.senderName, attrs: ' autocomplete="name"' })}
${field("senderPhone", "No. WhatsApp pengirim", { value: v.senderPhone, error: errors.senderPhone, type: "tel", attrs: ' inputmode="tel" autocomplete="tel"' })}
${field("senderStore", "Nama toko (opsional)", { value: v.senderStore, hint: "Untuk dropshipper: nama toko yang dicetak di label." })}</div>
<div><h2 style="margin-top:24px">Penerima</h2>
${field("recipientName", "Nama penerima", { value: v.recipientName, error: errors.recipientName })}
${field("recipientPhone", "No. HP penerima", { value: v.recipientPhone, error: errors.recipientPhone, type: "tel", attrs: ' inputmode="tel"' })}
${areaField("recipient", "Kecamatan penerima", v, errors.recipientAreaId)}
${field("recipientStreet", "Alamat lengkap", { value: v.recipientStreet, error: errors.recipientStreet })}</div></div>
<h2 style="margin-top:24px">Paket</h2><div class="grid2"><div>${field("content", "Isi paket", { value: v.content, error: errors.content })}</div>
<div>${field("weight", "Perkiraan berat (gram)", { value: v.weight, error: errors.weightGram, attrs: ' inputmode="numeric"' })}</div></div>
${v.cod === "1" || errors.codGoodsIdr ? field("codGoods", "Harga barang COD (Rp)", { value: v.codGoods, error: errors.codGoodsIdr, attrs: ' inputmode="numeric"' }) : `<p class="hint">Untuk COD, pilih COD di atas lalu kirim ulang formulir untuk mengisi harga barang.</p>`}
${turnstile(s.turnstileSiteKey)}
${errors.form ? `<p class="err" role="alert">${e(errors.form)}</p>` : Object.keys(errors).length ? `<p class="err" role="alert">Periksa kembali isian yang ditandai.</p>` : ""}
<div class="row"><button class="cta" type="submit">Buat Kode QR</button></div></form>`
  return html(page(s, body, AREA_SCRIPT + TURNSTILE_SCRIPT(s.turnstileSiteKey)), Object.keys(errors).length ? 422 : 200)
}

async function kirimCard(env: Env, c: Ctx, slug: string): Promise<Response> {
  const s = await shell(env, c, "kirim", `INV ${slug.toUpperCase()}`, "Kode QR pre-booking kiriman. Tunjukkan ke kasir gerai.", `/kirim/${slug}`, true)
  if (!s) return notFoundHtml()
  const t = await vaultFor(env, c.tenantId).minisiteTrack(c.tenantId, slug)
  if (!t.ok || !t.value) return notFoundHtml()
  const inv = slug.toUpperCase()
  const share = `Kode kiriman saya di ${s.outlet.name}: INV ${inv}. Lacak: https://${c.canonicalHost ?? c.host}/lacak?q=${inv}`
  const body = `<h2>Kode QR kiriman Anda</h2><p class="inv">INV ${e(inv)}</p>
<div class="qr">${qrSvg(`https://${c.canonicalHost ?? c.host}/kirim/${slug}`, { title: `QR INV ${inv}` })}</div>
<p>Tunjukkan QR <strong>INV ${e(inv)}</strong> ini ke kasir ${e(s.outlet.name)} dalam 48 jam. Tidak perlu antre mengetik alamat — kode yang sama dipakai untuk struk dan lacak paket Anda.</p>
<div class="row"><a class="cta" href="${e(wa("", "").replace(/62$/, ""))}${encodeURIComponent(share)}" rel="noopener">Kirim ke WA Saya</a><a class="cta ghost" href="/lacak?q=${e(inv)}">Lacak Paket</a></div>
<p class="hint">Simpan gambar: tekan lama pada QR lalu pilih Simpan, atau ambil tangkapan layar.</p>`
  return html(page(s, body.replace(`href="https://wa.me/62?text=`, `href="https://wa.me/?text=`)))
}

// ---- Lacak ---------------------------------------------------------------------------------------------------

const STEPS = ["Diterima gerai", "Diserahkan ke kurir", "Dalam perjalanan", "Terkirim"]
const stepOf = (status: string) => (status === "delivered" ? 3 : ["in_transit", "undelivery_hold", "rts_in_transit"].includes(status) ? 2 : ["handed_to_courier"].includes(status) ? 1 : 0)

function trackBody(t: PublicTrack, host: string, unlocked?: { recipientName: string; note: string | null }, gateError?: string, siteKey: string | null = null): string {
  const when = (ms: number) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(ms)
  const step = stepOf(t.status)
  return `<h2>INV ${e(t.inv.toUpperCase())}${t.awb ? ` · ${e(t.awb)}` : ""}</h2>
<p><strong>${e(t.statusLabel)}</strong>${t.courier ? ` · ${e(t.courier)}` : ""}</p>
<p>${t.sender ? `Dari ${e(t.sender)}` : ""}${t.originArea ? ` (${e(t.originArea)})` : ""}${t.recipient ? ` → ${e(t.recipient)}` : ""}${t.destinationArea ? ` (${e(t.destinationArea)})` : ""}</p>
${t.status === "draft" ? "" : `<ol class="steps" aria-label="Tahap pengiriman">${STEPS.map((x, i) => `<li${i <= step ? ' aria-current="step"' : ""}>${i <= step ? "<strong>" : ""}${x}${i <= step ? "</strong>" : ""}</li>`).join("")}</ol>`}
${t.timeline.length ? `<h2>Riwayat</h2><ul class="rates">${t.timeline.map((x) => `<li><span>${e(x.label)}</span><span class="tag">${when(x.at)}</span></li>`).join("")}</ul>` : ""}
${
  t.delivered
    ? unlocked
      ? `<p role="status" style="margin-top:16px"><strong>Diterima oleh: ${e(unlocked.recipientName)}</strong>${unlocked.note ? `<br>${e(unlocked.note)}` : ""}</p>`
      : `<form method="post" action="/lacak/${e(t.inv)}/buka" novalidate style="margin-top:16px"><label for="last4">Masukkan 4 angka terakhir No. HP penerima untuk membuka rincian penerima</label><input id="last4" name="last4" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" style="max-width:160px"${gateError ? ' aria-invalid="true" aria-describedby="last4-err"' : ""}>${gateError ? `<p class="err" id="last4-err" role="alert">${e(gateError)}</p>` : ""}${turnstile(siteKey)}<div class="row"><button class="cta ghost" type="submit">Buka Rincian</button></div></form>`
    : ""
}
${t.outletContact?.whatsapp ? `<div class="row"><a class="cta ghost" href="${e(wa(t.outletContact.whatsapp, `Halo ${t.outletContact.name}, saya ingin menanyakan kiriman INV ${t.inv.toUpperCase()}.`))}" rel="noopener">Tanya Gerai via WhatsApp</a></div>` : ""}
<p class="hint" style="margin-top:16px">Untuk keamanan, nama ditampilkan sebagai inisial dan nomor HP, alamat, serta nilai COD tidak pernah ditampilkan. Tautan: https://${e(host)}/lacak?q=${e(t.inv.toUpperCase())}</p>`
}

async function lacak(env: Env, c: Ctx, request: Request, url: URL): Promise<Response> {
  const s = await shell(env, c, "lacak", "Lacak Paket", "Lacak kiriman dari gerai ini dengan nomor INV atau resi. Data penerima dilindungi.", "/lacak", true)
  if (!s) return notFoundHtml()
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 40)
  let result = ""
  let status = 200
  if (q) {
    const ip = await ipHash(env.AUTH_SESSION_PEPPER, request)
    const lim = await hit(env.DB, `ms-track:${ip}`, 30, 60_000, Date.now())
    if (!lim.allowed) {
      result = `<p class="err" role="alert">Terlalu banyak pencarian. Coba lagi sebentar lagi.</p>`
      status = 429
    } else {
      const t = await vaultFor(env, c.tenantId).minisiteTrack(c.tenantId, q)
      if (t.ok && t.value) result = trackBody(t.value, c.host, undefined, undefined, s.turnstileSiteKey)
      else {
        result = `<p class="err" role="alert">Kiriman tidak ditemukan di gerai ini. Periksa kembali nomor INV atau resi.</p>`
        status = 404
      }
    }
  }
  const body = `<form method="get" action="/lacak" role="search"><h2>Lacak paket</h2>${field("q", "Nomor INV atau resi", { value: q, hint: "Contoh: INV 8K4M2P7 atau nomor resi ekspedisi." })}<div class="row"><button class="cta" type="submit">Lacak</button></div></form>${result}`
  return html(page(s, body, TURNSTILE_SCRIPT(s.turnstileSiteKey)), status)
}

async function unlockGate(env: Env, c: Ctx, request: Request, slug: string): Promise<Response> {
  const s = await shell(env, c, "lacak", "Lacak Paket", "Lacak kiriman dari gerai ini.", "/lacak", true)
  if (!s) return notFoundHtml()
  const ip = await ipHash(env.AUTH_SESSION_PEPPER, request)
  const lim = await hit(env.DB, `ms-unlock:${ip}`, 10, 3600_000, Date.now())
  const f = await request.formData()
  const t = await vaultFor(env, c.tenantId).minisiteTrack(c.tenantId, slug)
  if (!t.ok || !t.value) return notFoundHtml()
  const k = s.turnstileSiteKey
  const view = (body: string, status = 200) => html(page(s, body, TURNSTILE_SCRIPT(k)), status)
  if (!lim.allowed) return view(trackBody(t.value, c.host, undefined, "Terlalu banyak percobaan dari jaringan ini. Coba lagi nanti.", k), 429)
  // The recipient-name gate is a human check too (no scripted guessing across INVs).
  if (!(await humanOk(env, request, f.get("cf-turnstile-response")))) return view(trackBody(t.value, c.host, undefined, "Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi.", k), 400)
  const u = await vaultFor(env, c.tenantId).minisiteUnlock(c.tenantId, slug, String(f.get("last4") ?? "").trim())
  if (!u.ok) return notFoundHtml()
  if (u.value.ok) return view(trackBody(t.value, c.host, u.value.value))
  const msg = u.value.code === "LOCKED" ? "Terlalu banyak angka salah. Coba lagi dalam 15 menit." : u.value.code === "NOT_DELIVERED" ? "Rincian penerima hanya bisa dibuka setelah paket terkirim." : "Angka tidak cocok."
  return view(trackBody(t.value, c.host, undefined, msg, k), u.value.code === "LOCKED" ? 429 : 400)
}

// ---- Router ----------------------------------------------------------------------------------------------------

export async function handleMinisite(request: Request, env: Env, c: Ctx): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, "") || "/"
  const m = request.method
  if (path === "/robots.txt" && m === "GET") return new Response(`User-agent: *\nAllow: /\nDisallow: /lacak\nDisallow: /kirim/\nSitemap: https://${c.canonicalHost ?? c.host}/sitemap.xml\n`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } })
  if (path === "/sitemap.xml" && m === "GET") return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://${c.canonicalHost ?? c.host}/</loc></url><url><loc>https://${c.canonicalHost ?? c.host}/kirim</loc></url></urlset>\n`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } })
  if (path === "/area" && m === "GET") {
    const ip = await ipHash(env.AUTH_SESSION_PEPPER, request)
    const lim = await hit(env.DB, `ms-area:${ip}`, 60, 60_000, Date.now())
    if (!lim.allowed) return Response.json({ items: [] }, { status: 429 })
    return Response.json({ items: (await searchAreas(env, url.searchParams.get("q") ?? "")).items }, { headers: { "cache-control": "public, max-age=3600" } })
  }
  if (path === "/" && (m === "GET" || m === "HEAD" || m === "POST")) {
    const p = await vaultFor(env, c.tenantId).minisiteProfile(c.tenantId)
    if (!p.ok || !p.value) return preparing(env, c)
    return ongkir(env, c, request)
  }
  if (path === "/kirim" && (m === "GET" || m === "HEAD" || m === "POST")) return kirimForm(env, c, request, url)
  const card = /^\/kirim\/([23456789abcdefghjkmnpqrstvwxyz]{7})$/.exec(path.toLowerCase())
  if (card && m === "GET") return kirimCard(env, c, card[1]!)
  if (path === "/lacak" && (m === "GET" || m === "HEAD")) return lacak(env, c, request, url)
  const lacakSlug = /^\/lacak\/([23456789abcdefghjkmnpqrstvwxyz]{7})$/.exec(path.toLowerCase())
  if (lacakSlug && m === "GET") return new Response(null, { status: 302, headers: { location: `/lacak?q=${lacakSlug[1]!.toUpperCase()}` } })
  const gate = /^\/lacak\/([23456789abcdefghjkmnpqrstvwxyz]{7})\/buka$/.exec(path.toLowerCase())
  if (gate && m === "POST") return unlockGate(env, c, request, gate[1]!)
  return notFoundHtml()
}
