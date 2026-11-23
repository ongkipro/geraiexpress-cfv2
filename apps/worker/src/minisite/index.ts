// `<slug>.geraimitra.com` mini-site (TASK-501, DEC-207, PR-19, spec 05 §3, visual 03 §1). Routes:
//   GET  /                 Cek Ongkir (publish prices only) — POST / runs the quote (Turnstile + per-IP limit)
//   GET  /kirim            Kirim dari Rumah form — POST /kirim creates a 48 h QR pre-booking (Turnstile + IP limit)
//   GET  /kirim/:slug      the QR card for a pre-booking
//   GET  /lacak[?q=]       privacy-safe tracking — POST /lacak/:slug/buka is the 4-digit recipient-phone gate
//   GET  /area?q=          area search for the forms (KV-cached public lookup)
//   GET  /logo             the outlet's own logo (purpose `logo`, image only, this host's tenant only) — DEC-247
//   GET  /couriers/<k>.svg courier logos from the app bundle (strict allow-list) — DEC-247
//   GET  /robots.txt, /sitemap.xml
// Tenant comes only from the classified host (never from the request). No cookies are set or read here.
import { qrSvg } from "@gx/thermal-print"
import { vaultFor } from "../do/gerai-vault/stub"
import type { PublicTrack } from "../do/gerai-vault"
import { parseDraft } from "../do/gerai-vault/minisite"
import { searchAreas } from "../couriers/areas"
import { hit } from "../auth/throttle"
import { verifyTurnstile } from "../auth/turnstile"
import { clientIp, ipHash } from "../http/request"
import { escapeHtml as e, notFoundHtml } from "../http/pages"
import { AppError } from "../http/envelope"
import { parseQuoteInput, runQuote } from "../pricing/quote/service"
import { medals } from "../pricing/quote/engine"
import { activeCatalog, mergeCouriers } from "../couriers/catalog"
import { AREA_SCRIPT, COD_SCRIPT, COURIER_KEYS, COURIER_LOGOS, courierImg, onTenantZone, page, rp, turnstile, TURNSTILE_SCRIPT, type Shell } from "./html"

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
  const p = await vaultFor(env, c.tenantId).minisiteShell(c.tenantId)
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
    // Owner 2026-11-18 (DEC-247B): "Didukung jaringan resmi GeraiExpress" on the tenant zone only; a custom domain is pure white-label.
    attribution: onTenantZone(c.host, env.TENANT_ZONE),
  }
}

const DIMS_MSG = "Isi panjang, lebar dan tinggi (1–300 cm) atau kosongkan semuanya."

const field = (name: string, label: string, opts: { value?: string; type?: string; hint?: string; error?: string; attrs?: string } = {}) =>
  `<label for="${name}">${label}</label><input id="${name}" name="${name}" type="${opts.type ?? "text"}" value="${e(opts.value ?? "")}"${opts.attrs ?? ""}${opts.error ? ` aria-invalid="true" aria-describedby="${name}-err"` : ""}>${opts.error ? `<p class="err" id="${name}-err">${e(opts.error)}</p>` : opts.hint ? `<p class="hint">${e(opts.hint)}</p>` : ""}`

const areaField = (prefix: string, label: string, v: Record<string, string>, error?: string) =>
  `${field(`${prefix}Text`, label, { value: v[`${prefix}Label`] ?? v[`${prefix}Text`] ?? "", hint: "Ketik minimal 3 huruf, lalu pilih dari daftar.", error, attrs: ` data-area="${prefix}" autocomplete="off" required` })}<input type="hidden" id="${prefix}Id" name="${prefix}Id" value="${e(v[`${prefix}Id`] ?? "")}"><input type="hidden" id="${prefix}Label" name="${prefix}Label" value="${e(v[`${prefix}Label`] ?? "")}">`

// ---- Cek Ongkir -----------------------------------------------------------------------------------------------

/** Couriers this gerai actually offers (catalog active ∩ not disabled in its prefs), with a known logo. */
async function enabledCouriers(env: Env, tenantId: string): Promise<string[]> {
  const [catalog, prefs] = await Promise.all([activeCatalog(env.DB), vaultFor(env, tenantId).courierPrefs(tenantId)])
  if (!prefs.ok) return []
  return mergeCouriers(catalog, prefs.value)
    .filter((c) => c.enabled && COURIER_LOGOS[c.courierCode])
    .map((c) => c.courierCode)
}

const dimField = (name: string, label: string, v: Record<string, string>) => `<input id="${name}" name="${name}" value="${e(v[name] ?? "")}" inputmode="numeric" pattern="[0-9]{1,3}" data-msg-invalid="Isi ukuran dalam cm, 1–300." aria-label="${label}" placeholder="${label[0]}">`

async function ongkir(env: Env, c: Ctx, request: Request): Promise<Response> {
  const [s, couriers] = await Promise.all([
    shell(env, c, "ongkir", "Cek Ongkir", "Bandingkan ongkir J&T, JNE, SiCepat dan ekspedisi lain dari gerai ini. Reguler dan Kargo, isi kecamatan tujuan dan berat paket.", "/"),
    enabledCouriers(env, c.tenantId),
  ])
  if (!s) return preparing(env, c)
  let v: Record<string, string> = { weight: "1000", svc: "regular" }
  let result = ""
  let errors: Record<string, string> = {}
  if (request.method === "POST") {
    const f = await request.formData()
    // One lookup for everything (last value wins); only the redisplayed copy is capped at 200 characters.
    const raw: Record<string, string> = Object.fromEntries([...f.entries()].map(([k, x]) => [k, String(x)]))
    v = Object.fromEntries(Object.entries(raw).map(([k, x]) => [k, x.slice(0, 200)]))
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
            const svc = v.svc === "cargo" ? "cargo" : "regular"
            // P×L×T exactly as submitted (untrimmed, uncapped, the browser's `[0-9]{1,3}`): none, or all three 1..300.
            // `020` is 20; ` 40 `, `-20`, `1.5`, `0`, a suffix past the display cap and a repeated field are refused.
            const keys = ["lengthCm", "widthCm", "heightCm"] as const
            const dims = keys.map((k) => raw[k] ?? "")
            const repeated = keys.some((k) => f.getAll(k).length > 1)
            if (repeated || (dims.some(Boolean) && !dims.every((x) => /^\d{1,3}$/.test(x) && Number(x) >= 1 && Number(x) <= 300))) throw new AppError(422, "INVALID_QUOTE", DIMS_MSG, { dims: DIMS_MSG })
            const input = parseQuoteInput({ destinationAreaId: v.destId, weightGram: Math.round(Number((v.weight ?? "").replace(",", ".")) * unit) || 0, mode: "none", lengthCm: dims[0] ? Number(dims[0]) : "", widthCm: dims[1] ? Number(dims[1]) : "", heightCm: dims[2] ? Number(dims[2]) : "" }, origin)
            const q = await runQuote(env, c.tenantId, input, Date.now(), { rateKey: `ms-quote:${c.tenantId}`, perMinute: 60 })
            const ofClass = q.cards.filter((x) => x.serviceClass === svc)
            const cards = ofClass.filter((x) => x.available).sort((a, b) => a.flow.counterDueIdr - b.flow.counterDueIdr)
            const best = medals(cards, "none")
            const kg = (g: number) => `${(g / 1000).toLocaleString("id-ID")} kg`
            const tooLight = svc === "cargo" && !cards.length && ofClass.some((x) => x.unavailableReason === "Cargo untuk paket mulai 5 kg.")
            result = `<div class="out" id="hasil">${
              cards.length
                ? `<h2>Ongkir ${svc === "cargo" ? "Kargo" : "Reguler"} ke ${e(v.destLabel ?? "")}</h2><ul class="rates">${cards
                    .map((x) => {
                      const tags = [x.eta ?? "", x.billableWeightGram > input.actualWeightGram ? `dihitung ${kg(x.billableWeightGram)}` : ""].filter(Boolean).map((t) => e(t))
                      if (best.termurah === x.serviceCode) tags.push('<span class="best">Termurah</span>')
                      if (best.tercepat === x.serviceCode) tags.push('<span class="best">Tercepat</span>')
                      return `<li><span class="clogo">${courierImg(x.courierCode, true)}</span><span class="rn">${e(x.name.startsWith(x.courierName.split(" ")[0]!) ? x.name : `${x.courierName} · ${x.name}`)}<span class="tag">${tags.join(" · ")}</span></span><span class="num">${rp(x.P)}</span></li>`
                    })
                    .join("")}</ul><p class="hint">Harga publik ekspedisi untuk ${kg(input.actualWeightGram)}${input.dims ? ` (${input.dims.lengthCm}×${input.dims.widthCm}×${input.dims.heightCm} cm)` : ""}. Harga akhir dihitung ulang di kasir saat paket ditimbang.</p><div class="row"><a class="btn pri" href="/kirim?destId=${encodeURIComponent(v.destId ?? "")}&amp;destLabel=${encodeURIComponent(v.destLabel ?? "")}&amp;weight=${input.actualWeightGram}">Isi Alamat dari Rumah</a></div>`
                : `<p class="err">${tooLight ? "Kargo untuk paket mulai 5 kg (berat asli atau berat volume). Pilih Reguler untuk paket lebih ringan." : "Belum ada ekspedisi yang melayani rute ini dari gerai."}</p>`
            }</div>`
          } catch (err) {
            if (err instanceof AppError) errors = { ...err.fieldErrors, form: Object.keys(err.fieldErrors).length ? "" : err.userMessage }
            else errors.form = "Cek ongkir gagal. Coba lagi."
          }
        }
      }
    }
  }
  const radio = (name: string, value: string, label: string, on: boolean) => `<label><input type="radio" name="${name}" value="${value}"${on ? " checked" : ""}> ${label}</label>`
  const form = `<div class="stage"><div class="card"><form method="post" action="/#hasil">
<h2>Cek ongkir</h2><p class="hint sub">Harga publik, dari ${e(s.outlet.name)}.</p>
${areaField("dest", "Kecamatan tujuan", v, errors.destinationAreaId)}
<div class="grid2 pair"><div>${field("weight", "Berat paket", { value: v.weight, attrs: ' inputmode="decimal" required pattern="[0-9]+([.,][0-9]+)?" data-msg-invalid="Isi berat dengan angka, contoh 1000 atau 1,5."', error: errors.weightGram })}</div>
<fieldset><legend>Satuan</legend><div class="seg unit">${radio("unit", "g", "gram", v.unit !== "kg")}${radio("unit", "kg", "kg", v.unit === "kg")}</div></fieldset></div>
<fieldset><legend>Ukuran paket, P × L × T cm (opsional)</legend><div class="dims">${dimField("lengthCm", "Panjang (cm)", v)}<span aria-hidden="true">×</span>${dimField("widthCm", "Lebar (cm)", v)}<span aria-hidden="true">×</span>${dimField("heightCm", "Tinggi (cm)", v)}</div>
${errors.dims ? `<p class="err" role="alert">${e(errors.dims)}</p>` : `<p class="hint">Untuk paket besar tapi ringan: ongkir memakai berat volume bila lebih besar.</p>`}</fieldset>
<fieldset><legend>Layanan</legend><div class="seg">${radio("svc", "regular", "Reguler", v.svc !== "cargo")}${radio("svc", "cargo", "Kargo (mulai 5 kg, Non-COD)", v.svc === "cargo")}</div></fieldset>
${turnstile(s.turnstileSiteKey)}
${errors.form ? `<p class="err" role="alert">${e(errors.form)}</p>` : ""}
<div class="row"><button class="btn pri" type="submit">Hitung Ongkir</button></div></form>
${result}</div></div>`
  const body = `<div class="hero"><div class="lead"><h2>Kirim paket dari ${e(s.outlet.name)}</h2><p>Bandingkan ongkir beberapa ekspedisi sekaligus, lalu isi alamat dari rumah supaya di gerai tinggal timbang dan bayar.</p></div>${form}</div>`
  const strip = couriers.length
    ? `<section class="sec" aria-labelledby="eksp"><h2 id="eksp">Ekspedisi di gerai ini</h2><p>Pilih yang paling cocok untuk tujuan dan budget Anda.</p><ul class="strip">${couriers.map((code) => `<li>${courierImg(code, false, 26)}</li>`).join("")}</ul></section>`
    : ""
  const why = `<section class="sec" aria-labelledby="why"><h2 id="why">Kenapa kirim di ${e(s.outlet.name)}?</h2><ul class="why">
<li><b>Banyak pilihan ekspedisi</b>Reguler, Kargo dan COD dari satu meja kasir.</li>
<li><b>Cocok untuk olshop</b>Dropshipper bisa kirim atas nama toko sendiri.</li>
<li><b>Isi data dari rumah</b>Lewat menu Kirim dari Rumah, di gerai tinggal timbang dan tempel resi.</li></ul></section>`
  return html(page(s, body, AREA_SCRIPT + TURNSTILE_SCRIPT(s.turnstileSiteKey), strip + why), errors.form || Object.keys(errors).length ? 422 : 200, request.method === "GET" ? "public, max-age=300" : "no-store")
}

// ---- Kirim dari Rumah -----------------------------------------------------------------------------------------

/**
 * DEC-251D: `Isi Alamat dari Rumah` from a Cek Ongkir result carries the destination and weight. Only well-formed values
 * prefill the form (a 24-hex Mengantar area id with its label, ≤ 120 chars; 10..100000 g); anything else is ignored.
 */
export function handoff(q: URLSearchParams): { weight: string; recipientId: string; recipientLabel: string } {
  const id = q.get("destId") ?? ""
  const label = (q.get("destLabel") ?? "").trim().slice(0, 120)
  const okArea = /^[0-9a-f]{24}$/.test(id) && label !== ""
  const w = q.get("weight") ?? ""
  const okWeight = /^[1-9][0-9]{1,5}$/.test(w) && Number(w) >= 10 && Number(w) <= 100_000
  return { weight: okWeight ? w : "1000", recipientId: okArea ? id : "", recipientLabel: okArea ? label : "" }
}

async function kirimForm(env: Env, c: Ctx, request: Request, url: URL): Promise<Response> {
  const s = await shell(env, c, "kirim", "Kirim dari Rumah", "Isi data paket dari rumah, dapatkan kode QR, lalu tunjukkan ke kasir. Tidak perlu antre mengetik alamat.", "/kirim")
  if (!s) return preparing(env, c)
  let v: Record<string, string> = { ...handoff(url.searchParams), cod: "0" }
  let errors: Record<string, string> = {}
  if (request.method === "POST") {
    const f = await request.formData()
    v = Object.fromEntries([...f.entries()].map(([k, x]) => [k, String(x).slice(0, 300)]))
    const draftInput = {
      cod: v.cod === "1",
      senderName: v.senderName,
      senderPhone: v.senderPhone,
      senderStore: v.senderStore,
      recipientName: v.recipientName,
      recipientPhone: v.recipientPhone,
      recipientAreaId: v.recipientId,
      recipientAreaLabel: v.recipientLabel,
      recipientStreet: v.recipientStreet,
      content: v.content,
      weightGram: Number(v.weight),
      codGoodsIdr: Number((v.codGoods ?? "").replace(/\D/g, "")),
    }
    if (!(await humanOk(env, request, f.get("cf-turnstile-response")))) errors.form = "Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi."
    else {
      // Validate form fields BEFORE spending the per-IP creation quota so a customer typo doesn't lock them out.
      const precheck = parseDraft(draftInput)
      if (!precheck.ok) errors = precheck.errors
      else {
        const ip = await ipHash(env.AUTH_SESSION_PEPPER, request)
        const lim = await hit(env.DB, `ms-draft:${ip}`, 5, 3600_000, Date.now())
        if (!lim.allowed) errors.form = "Terlalu banyak pengajuan dari jaringan ini. Coba lagi nanti atau langsung datang ke gerai."
        else {
          const r = await vaultFor(env, c.tenantId).createMinisiteDraft(c.tenantId, draftInput, ip)
          if (r.ok) return new Response(null, { status: 303, headers: { location: `/kirim/${r.value.slug}`, "cache-control": "no-store" } })
          errors = r.errors ?? { form: "Gerai sedang tidak bisa menerima pengajuan. Coba lagi nanti." }
        }
      }
    }
  }
  const body = `<div class="stage"><div class="card"><form method="post" action="/kirim">
<h2>Kirim dari Rumah</h2><p class="hint sub">Isi data di bawah, dapatkan kode QR, lalu tunjukkan ke kasir ${e(s.outlet.name)} dalam 48 jam.</p>
<fieldset><legend>Jenis kiriman</legend><div class="seg">
<label><input type="radio" name="cod" value="0"${v.cod !== "1" ? " checked" : ""}> Non-COD</label><label><input type="radio" name="cod" value="1"${v.cod === "1" ? " checked" : ""}> COD (bayar di tempat)</label></div></fieldset>
<div class="grid2"><div><h3>Pengirim</h3>
${field("senderName", "Nama pengirim", { value: v.senderName, error: errors.senderName, attrs: ' autocomplete="name" required minlength="2" maxlength="80"' })}
${field("senderPhone", "No. WhatsApp pengirim", { value: v.senderPhone, error: errors.senderPhone, type: "tel", attrs: ' inputmode="tel" autocomplete="tel" required maxlength="20"' })}
${field("senderStore", "Nama toko (opsional)", { value: v.senderStore, hint: "Untuk dropshipper: nama toko yang dicetak di label.", attrs: ' maxlength="60"' })}</div>
<div><h3>Penerima</h3>
${field("recipientName", "Nama penerima", { value: v.recipientName, error: errors.recipientName, attrs: ' required minlength="2" maxlength="80"' })}
${field("recipientPhone", "No. HP penerima", { value: v.recipientPhone, error: errors.recipientPhone, type: "tel", attrs: ' inputmode="tel" required maxlength="20"' })}
${areaField("recipient", "Kecamatan penerima", v, errors.recipientAreaId)}
${field("recipientStreet", "Alamat lengkap", { value: v.recipientStreet, error: errors.recipientStreet, attrs: ' required minlength="5"' })}</div></div>
<h3>Paket</h3><div class="grid2"><div>${field("content", "Isi paket", { value: v.content, error: errors.content, attrs: ' required minlength="3" maxlength="60"' })}</div>
<div>${field("weight", "Perkiraan berat (gram)", { value: v.weight, error: errors.weightGram, attrs: ' inputmode="numeric" required pattern="[0-9]{2,6}" data-msg-invalid="Isi berat dalam gram, contoh 1000."' })}</div></div>
<div id="codBox">${field("codGoods", "Harga barang COD (Rp)", { value: v.codGoods, error: errors.codGoodsIdr, hint: "Isi hanya untuk kiriman COD: harga barang yang ditagih ke penerima.", attrs: ' inputmode="numeric"' })}</div>
${turnstile(s.turnstileSiteKey)}
${errors.form ? `<p class="err" role="alert">${e(errors.form)}</p>` : Object.keys(errors).length ? `<p class="err" role="alert">Periksa kembali isian yang ditandai.</p>` : ""}
<div class="row"><button class="btn pri" type="submit">Buat Kode QR</button></div></form></div></div>`
  return html(page(s, body, COD_SCRIPT + AREA_SCRIPT + TURNSTILE_SCRIPT(s.turnstileSiteKey)), Object.keys(errors).length ? 422 : 200)
}

async function kirimCard(env: Env, c: Ctx, slug: string): Promise<Response> {
  const s = await shell(env, c, "kirim", `INV ${slug.toUpperCase()}`, "Kode QR pre-booking kiriman. Tunjukkan ke kasir gerai.", `/kirim/${slug}`, true)
  if (!s) return notFoundHtml()
  const t = await vaultFor(env, c.tenantId).minisiteTrack(c.tenantId, slug)
  if (!t.ok || !t.value) return notFoundHtml()
  const inv = slug.toUpperCase()
  const share = `Kode kiriman saya di ${s.outlet.name}: INV ${inv}. Lacak: https://${c.canonicalHost ?? c.host}/lacak?q=${inv}`
  // The page's one WhatsApp CTA is "send it to my own WA" (no recipient: the visitor picks the chat), so no gerai chat.
  const body = `<div class="stage"><div class="card"><h2>Kode QR kiriman Anda</h2><p class="inv">INV ${e(inv)}</p>
<div class="qr">${qrSvg(`https://${c.canonicalHost ?? c.host}/kirim/${slug}`, { title: `QR INV ${inv}` })}</div>
<p>Tunjukkan QR <strong>INV ${e(inv)}</strong> ini ke kasir ${e(s.outlet.name)} dalam 48 jam. Tidak perlu antre mengetik alamat — kode yang sama dipakai untuk struk dan lacak paket Anda.</p>
<div class="row"><a class="btn pri" href="https://wa.me/?text=${e(encodeURIComponent(share))}" rel="noopener">Kirim ke WA Saya</a><a class="btn plain" href="/lacak?q=${e(inv)}">Lacak Paket</a></div>
<p class="hint">Simpan gambar: tekan lama pada QR lalu pilih Simpan, atau ambil tangkapan layar.</p></div></div>`
  return html(page({ ...s, wa: false }, body))
}

// ---- Lacak ---------------------------------------------------------------------------------------------------

const STEPS = ["Diterima gerai", "Diserahkan ke kurir", "Dalam perjalanan", "Terkirim"]
const NO_STEPPER = new Set(["draft", "cancelled", "lost", "rts_in_transit", "provider_returned", "rts_at_gerai", "rts_returned_to_sender"])
const stepOf = (status: string) => (status === "delivered" ? 3 : ["in_transit", "undelivery_hold"].includes(status) ? 2 : ["handed_to_courier"].includes(status) ? 1 : 0)

function trackBody(t: PublicTrack, host: string, unlocked?: { recipientName: string; note: string | null }, gateError?: string, siteKey: string | null = null): string {
  const when = (ms: number) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(ms)
  const step = stepOf(t.status)
  const courier = t.courier ? (COURIER_LOGOS[t.courier]?.name ?? t.courier) : null
  const logo = courierImg(t.courier, true)
  return `<div class="out" id="hasil"><h2>INV ${e(t.inv.toUpperCase())}${t.awb ? ` · ${e(t.awb)}` : ""}</h2>
<div class="trk">${logo ? `<span class="clogo">${logo}</span>` : ""}<div><p class="st">${e(t.statusLabel)}</p>${courier ? `<p class="tag">${e(courier)}</p>` : ""}</div></div>
<p>${t.sender ? `Dari ${e(t.sender)}` : ""}${t.originArea ? ` (${e(t.originArea)})` : ""}${t.recipient ? ` → ${e(t.recipient)}` : ""}${t.destinationArea ? ` (${e(t.destinationArea)})` : ""}</p>
${NO_STEPPER.has(t.status) ? "" : `<ol class="steps" aria-label="Tahap pengiriman">${STEPS.map((x, i) => `<li${i === step ? ' aria-current="step"' : i < step ? ' class="done"' : ""}>${x}</li>`).join("")}</ol>`}
${t.timeline.length ? `<h3>Riwayat</h3><ul class="rates">${t.timeline.map((x) => `<li><span class="rn">${e(x.label)}</span><span class="tag">${when(x.at)}</span></li>`).join("")}</ul>` : ""}
${
  t.delivered
    ? unlocked
      ? `<p role="status" style="margin-top:16px"><strong>Diterima oleh: ${e(unlocked.recipientName)}</strong>${unlocked.note ? `<br>${e(unlocked.note)}` : ""}</p>`
      : `<form method="post" action="/lacak/${e(t.inv)}/buka" style="margin-top:16px"><label for="last4">Masukkan 4 angka terakhir No. HP penerima untuk membuka rincian penerima</label><input id="last4" name="last4" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" required data-msg-invalid="Masukkan 4 angka terakhir No. HP penerima." style="max-width:160px"${gateError ? ' aria-invalid="true" aria-describedby="last4-err"' : ""}>${gateError ? `<p class="err" id="last4-err" role="alert">${e(gateError)}</p>` : ""}${turnstile(siteKey)}<div class="row"><button class="btn plain" type="submit">Buka Rincian</button></div></form>`
    : ""
}
<p class="hint" style="margin-top:16px">Untuk keamanan, nama ditampilkan sebagai inisial dan nomor HP, alamat, serta nilai COD tidak pernah ditampilkan. Tautan: https://${e(host)}/lacak?q=${e(t.inv.toUpperCase())}</p></div>`
}

/**
 * The shell for a tracking result. ADR-0005: a dropship (masked) shipment shows no outlet mark, name, place or chat
 * (the label printed the reseller's store, not this gerai). Otherwise the WhatsApp action asks about this INV.
 */
const trackWa = (s: Shell, t: PublicTrack | null | undefined): Shell =>
  t?.maskedOutlet
    ? { ...s, masked: true, wa: false, title: "Lacak Paket" }
    : t?.outletContact?.whatsapp
      ? { ...s, wa: { text: `Halo ${t.outletContact.name}, saya ingin menanyakan kiriman INV ${t.inv.toUpperCase()}.` } }
      : s

const trackPage = (q: string, result: string) =>
  `<div class="stage"><div class="card"><form method="get" action="/lacak" role="search"><h2>Lacak paket</h2>${field("q", "Nomor INV atau resi", { value: q, hint: "Contoh: INV 8K4M2P7 atau nomor resi ekspedisi.", attrs: ' required maxlength="40" autocomplete="off"' })}<div class="row"><button class="btn pri" type="submit">Lacak</button></div></form>${result}</div></div>`

async function lacak(env: Env, c: Ctx, request: Request, url: URL): Promise<Response> {
  const s = await shell(env, c, "lacak", "Lacak Paket", "Lacak kiriman dari gerai ini dengan nomor INV atau resi. Data penerima dilindungi.", "/lacak", true)
  if (!s) return preparing(env, c)
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 40)
  let result = ""
  let status = 200
  let found: PublicTrack | null = null
  const shareHost = c.canonicalHost ?? c.host
  if (q) {
    const ip = await ipHash(env.AUTH_SESSION_PEPPER, request)
    const lim = await hit(env.DB, `ms-track:${ip}`, 30, 60_000, Date.now())
    if (!lim.allowed) {
      result = `<p class="err" role="alert">Terlalu banyak pencarian. Coba lagi sebentar lagi.</p>`
      status = 429
    } else {
      const t = await vaultFor(env, c.tenantId).minisiteTrack(c.tenantId, q)
      if (t.ok && t.value) result = trackBody((found = t.value), shareHost, undefined, undefined, s.turnstileSiteKey)
      else {
        result = `<p class="err" role="alert">Kiriman tidak ditemukan di gerai ini. Periksa kembali nomor INV atau resi.</p>`
        status = 404
      }
    }
  }
  return html(page(trackWa(s, found), trackPage(q, result), TURNSTILE_SCRIPT(s.turnstileSiteKey)), status)
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
  const found = t.value
  const shareHost = c.canonicalHost ?? c.host
  const view = (body: string, status = 200) => html(page(trackWa(s, found), trackPage(found.inv.toUpperCase(), body), TURNSTILE_SCRIPT(k)), status)
  if (!lim.allowed) return view(trackBody(t.value, shareHost, undefined, "Terlalu banyak percobaan dari jaringan ini. Coba lagi nanti.", k), 429)
  // The recipient-name gate is a human check too (no scripted guessing across INVs).
  if (!(await humanOk(env, request, f.get("cf-turnstile-response")))) return view(trackBody(t.value, shareHost, undefined, "Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi.", k), 400)
  const u = await vaultFor(env, c.tenantId).minisiteUnlock(c.tenantId, slug, String(f.get("last4") ?? "").trim())
  if (!u.ok) return notFoundHtml()
  if (u.value.ok) return view(trackBody(t.value, shareHost, u.value.value))
  const msg = u.value.code === "LOCKED" ? "Terlalu banyak angka salah. Coba lagi dalam 15 menit." : u.value.code === "NOT_DELIVERED" ? "Rincian penerima hanya bisa dibuka setelah paket terkirim." : "Angka tidak cocok."
  return view(trackBody(t.value, shareHost, undefined, msg, k), u.value.code === "LOCKED" ? 429 : 400)
}

// ---- Static identity: outlet logo + courier logos (DEC-247) ----------------------------------------------------

const STATIC_HEADERS = { "x-content-type-options": "nosniff", "content-disposition": "inline", "cross-origin-resource-policy": "same-origin" }

/** The outlet's uploaded logo: only purpose `logo` (image types) of THIS host's tenant, from its own R2 prefix. */
async function logo(env: Env, c: Ctx, method: string): Promise<Response> {
  const r = await vaultFor(env, c.tenantId).minisiteLogo(c.tenantId)
  const m = r.ok ? r.value : null
  const obj = m && m.key.startsWith(`t/${c.tenantId}/logo/`) ? await env.BUCKET.get(m.key) : null
  if (!m || !obj) return notFoundHtml()
  // `/logo?v=<media prefix>` changes with every new logo, so an hour of browser cache never shows a stale one for long.
  return new Response(method === "HEAD" ? null : obj.body, { headers: { ...STATIC_HEADERS, "content-type": m.contentType, "cache-control": "public, max-age=3600" } })
}

const COURIER_PATH = /^\/couriers\/([a-z]+)\.svg$/

/** Courier logos from the app bundle (`/app/couriers/*.svg`), same-origin on the mini-site; strict allow-list. */
async function courierLogo(env: Env, url: URL, path: string): Promise<Response> {
  const key = COURIER_PATH.exec(path)?.[1]
  if (!key || !COURIER_KEYS.has(key)) return notFoundHtml()
  const res = await env.ASSETS.fetch(new Request(new URL(`/app/couriers/${key}.svg`, url.origin)))
  if (res.status !== 200) return notFoundHtml()
  return new Response(res.body, { headers: { ...STATIC_HEADERS, "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } })
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
  if ((path === "/logo" || COURIER_PATH.test(path)) && (m === "GET" || m === "HEAD")) return path === "/logo" ? logo(env, c, m) : courierLogo(env, url, path)
  if (path === "/" && (m === "GET" || m === "HEAD" || m === "POST")) return ongkir(env, c, request)
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
