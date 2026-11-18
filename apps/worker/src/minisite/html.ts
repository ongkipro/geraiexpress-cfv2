// Mini-site HTML (TASK-501, visual 03 §1, DEC-207, DEC-247 §2.2 borderless white-gallery): server-rendered, light,
// mobile-first, < 35 KB per page. White canvas, #F4F6FA soft surfaces with no border, one floating white artifact per
// surface, hairlines only between open rows, one accent. White-label (DEC-202): the gerai's own logo or monogram and
// a favicon with its initial — never the GeraiExpress mark. Plain strings with every dynamic value escaped; scripts
// are progressive enhancement only (area search, COD field, Indonesian validation, Turnstile) on working HTML forms.
import { escapeHtml as e } from "../http/pages"

export interface Outlet {
  name: string
  whatsapp: string | null
  openingHours: string | null
  address: string | null
  area: string | null
  latitude: number | null
  longitude: number | null
  /** Cache-buster for `/logo`; null = no servable logo (monogram instead). */
  logoVersion: string | null
}

export interface Shell {
  host: string
  /** Platform brand origin for the privacy link (`https://geraiexpress.com`, staging/local equivalents). */
  brandOrigin: string
  outlet: Outlet
  tab: "ongkir" | "kirim" | "lacak"
  title: string
  description: string
  canonical: string
  noindex?: boolean
  turnstileSiteKey: string | null
  /** The gerai WhatsApp chat (optionally prefilled), or none when the page has its own WA action (the QR card). */
  wa?: { text?: string } | false
  /** Owner decision 2026-11-18 (DEC-247B): the platform attribution shows on `*.<TENANT_ZONE>` only, never on a custom domain. */
  attribution: boolean
  /** ADR-0005: tracking a dropship shipment — no outlet mark, name, place, map or chat anywhere on the page. */
  masked?: boolean
}

const CSS = `:root{color-scheme:light;--ink:#0F172A;--body:#475569;--muted:#64748B;--faint:#94A3B8;--tile:#F4F6FA;--hair:rgba(15,23,42,.07);--ac:#0B4FE3;--ac-h:#083CB3;--tint:#EFF6FF;--danger:#B42318;--field:#7B879C;--float:0 20px 50px -12px rgba(15,23,42,.08),0 2px 6px -1px rgba(15,23,42,.04)}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--body);background:#fff}
h1,h2,h3{color:var(--ink);letter-spacing:-.02em;text-wrap:balance}a{color:var(--ac)}[hidden]{display:none!important}
.wrap{max-width:1040px;margin:0 auto;padding:0 16px}@media(min-width:720px){.wrap{padding:0 24px}}
.hdr{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.92);-webkit-backdrop-filter:saturate(1.4) blur(8px);backdrop-filter:saturate(1.4) blur(8px)}
.bar{display:flex;align-items:center;gap:12px;min-height:72px}.brand{display:flex;gap:12px;align-items:center;min-width:0;flex:1;color:inherit;text-decoration:none}
.brand h1{font-size:18px;line-height:1.2;margin:0;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.brand small{display:block;font-size:14px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.brand>span{min-width:0}
.mark{flex:none;width:44px;height:44px;border-radius:12px;object-fit:contain;background:var(--tile)}.mono{display:grid;place-items:center;background:var(--ac);color:#fff;font-weight:700;font-size:16px}
.acts{display:flex;flex-wrap:wrap;gap:8px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 20px;border-radius:999px;border:0;font-family:inherit;font-size:15px;font-weight:600;text-decoration:none;cursor:pointer}
.btn.pri{background:var(--ac);color:#fff}.btn.pri:hover{background:var(--ac-h)}.btn.soft{background:var(--tint);color:var(--ac)}.btn.plain{background:var(--tile);color:var(--ink)}.btn.white{background:#fff;color:var(--ink)}
nav.tabs{display:none;gap:2px;padding:4px;background:var(--tile);border-radius:999px}nav.tabs a{display:flex;align-items:center;min-height:40px;padding:0 16px;border-radius:999px;color:var(--body);text-decoration:none;white-space:nowrap;font-size:15px;font-weight:500}
nav.tabs a[aria-current=page]{background:#fff;color:var(--ink);font-weight:600;box-shadow:0 1px 3px rgba(15,23,42,.1)}.send{display:none!important}
.mbtn{flex:none;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border-radius:999px;background:var(--tile);color:var(--ink);font-weight:600;font-size:15px;text-decoration:none}
.mbtn i{display:grid;gap:4px;width:16px}.mbtn i::before,.mbtn i::after{content:"";height:2px;border-radius:2px;background:currentColor;transition:transform .2s}.mbtn[aria-expanded=true] i::before{transform:translateY(3px) rotate(45deg)}.mbtn[aria-expanded=true] i::after{transform:translateY(-3px) rotate(-45deg)}
.mnav{display:none;position:fixed;left:16px;right:16px;top:var(--hdr-b,80px);max-width:440px;margin-left:auto;padding:8px;border-radius:20px;background:rgba(255,255,255,.97);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:var(--float),0 0 0 1px var(--hair);z-index:30}
.mnav.open,.mnav:target{display:block}.mnav a{display:block;padding:12px 14px;border-radius:12px;color:var(--ink);font-weight:600;text-decoration:none}.mnav a small{display:block;font-size:14px;font-weight:400;color:var(--muted)}
.mnav a[aria-current=page]{background:var(--tile)}.mnav .mwa{margin-top:6px;border-top:1px solid var(--hair);border-radius:0 0 12px 12px;color:var(--ac)}
.dim{display:none;position:fixed;inset:0;z-index:25;background:rgba(15,23,42,.18)}.dim.open{display:block}
@media(min-width:960px){.bar{display:grid;grid-template-columns:1fr auto 1fr}nav.tabs{display:flex}.send{display:inline-flex!important;justify-self:end}.mbtn,.mnav,.dim{display:none!important}}
.visit{display:grid;gap:16px;padding:24px;border-radius:24px;background:var(--tile)}.visit .btn.soft{background:#fff}.visit h2{margin:0 0 6px}.visit p{margin:0}@media(min-width:720px){.visit{grid-template-columns:1fr auto;align-items:center;padding:32px}}
main{padding:20px 0 8px}.stage{background:var(--tile);border-radius:24px;padding:12px}.card{background:#fff;border-radius:18px;box-shadow:var(--float);padding:18px}
.hero{display:grid;gap:20px}.lead h2{font-size:28px;line-height:1.12;letter-spacing:-.028em;margin:4px 0 10px;max-width:24ch}.lead p{margin:0;max-width:54ch}
@media(min-width:720px){.stage{padding:28px}.card{padding:28px}.lead h2{font-size:38px}}@media(min-width:900px){.hero{grid-template-columns:5fr 7fr;align-items:start;gap:40px}.lead{padding-top:24px;position:sticky;top:96px}}
h2{font-size:20px;line-height:1.25;margin:0 0 4px}h3{font-size:17px;margin:24px 0 0}
label,legend{display:block;color:var(--ink);font-weight:500;font-size:15px;margin:16px 0 6px;padding:0}fieldset{border:0;margin:0;padding:0;min-width:0}
input,select{width:100%;min-height:44px;font:inherit;font-size:16px;padding:8px 12px;border:1px solid var(--field);border-radius:10px;color:var(--ink);background:#fff}
input[aria-invalid=true]{border-color:var(--danger)}:focus-visible{outline:3px solid #93B4FA;outline-offset:2px}
.grid2{display:grid;gap:0 16px}@media(min-width:640px){.grid2{grid-template-columns:1fr 1fr}}.grid2.pair{grid-template-columns:3fr 2fr}
.dims{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:6px;align-items:center}.dims span{color:var(--faint)}
.hint{color:var(--muted);font-size:14px;margin:6px 0 0;overflow-wrap:anywhere}.hint.sub{margin:0}.err{color:var(--danger);font-weight:500;font-size:15px;margin:6px 0 0}
.seg{display:flex;gap:8px;flex-wrap:wrap}.seg label{margin:0;display:flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border-radius:999px;background:var(--tile);cursor:pointer}
.seg label:has(input:checked){background:var(--tint);color:var(--ac)}.seg input{width:18px;height:18px;min-height:0;margin:0;accent-color:var(--ac)}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:20px}.out{margin-top:24px;padding-top:20px;border-top:1px solid var(--hair)}
.rates{list-style:none;margin:8px 0 0;padding:0}.rates li{display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--hair)}.rates li:first-child{border-top:0}
.clogo{flex:none;display:grid;place-items:center;width:60px;height:40px;border-radius:10px;background:var(--tile)}.clogo img{max-width:48px;max-height:22px;width:auto;height:auto}
.rn{flex:1;min-width:0;color:var(--ink);font-weight:600;font-size:15px}.tag{display:block;color:var(--muted);font-weight:400;font-size:14px}.best{color:var(--ac);font-weight:600}
.num{font-variant-numeric:tabular-nums;font-weight:700;color:var(--ink);white-space:nowrap}
.sec{padding-top:56px}.sec h2{font-size:24px;line-height:1.12;letter-spacing:-.028em;max-width:24ch}.sec>p{margin:0 0 20px;max-width:54ch}
.strip{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:10px}.strip li{display:grid;place-items:center;height:64px;border-radius:16px;background:var(--tile)}
.strip img{max-width:70%;max-height:26px;width:auto;height:auto}
.why{display:grid;gap:16px;list-style:none;margin:20px 0 0;padding:0}.why li{border-top:1px solid var(--hair);padding-top:14px}.why b{display:block;color:var(--ink);margin-bottom:2px}@media(min-width:720px){.why{grid-template-columns:repeat(3,1fr);gap:28px}}
.trk{display:flex;gap:14px;align-items:center;margin:12px 0 0}.trk p{margin:0}.st{color:var(--ink);font-weight:700;font-size:18px}
.steps{list-style:none;margin:20px 0 0;padding:0}.steps li{position:relative;padding:0 0 16px 26px}.steps li::before{content:"";position:absolute;left:4px;top:7px;width:10px;height:10px;border-radius:50%;background:#CBD5E1}
.steps li[aria-current]::before{background:var(--ac)}.steps li[aria-current]{color:var(--ink);font-weight:600}
.qr{max-width:260px;margin:16px 0;padding:12px;border-radius:16px;background:var(--tile)}.qr svg{width:100%;height:auto;display:block}
.inv{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:28px;font-weight:700;color:var(--ink);letter-spacing:.06em;margin:4px 0 0}
footer{margin-top:64px;background:var(--tile);border-top:1px solid var(--hair);padding:24px 0 32px;font-size:14px;color:var(--body)}footer .wrap{display:flex;flex-wrap:wrap;gap:8px 24px;justify-content:space-between}
.ac{list-style:none;margin:6px 0 0;padding:6px;background:#fff;border-radius:12px;box-shadow:var(--float)}.ac button{display:block;width:100%;text-align:left;min-height:44px;padding:8px 10px;background:#fff;border:0;border-radius:8px;font:inherit;color:var(--ink);cursor:pointer}.ac button:hover{background:var(--tile)}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}`

const TABS: Array<[Shell["tab"], string, string]> = [
  ["ongkir", "/", "Cek Ongkir"],
  ["kirim", "/kirim", "Kirim dari Rumah"],
  ["lacak", "/lacak", "Lacak Paket"],
]

export const wa = (phone: string, text?: string) => `https://wa.me/62${phone.replace(/\D/g, "").replace(/^0/, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`
export const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`.replace(/\u00a0/g, " ")

/** Courier code (catalog `courier_code`) → logo served same-origin at `/couriers/<key>.svg`; `w` = width at 20 px tall. */
export const COURIER_LOGOS: Record<string, { key: string; name: string; w: number }> = {
  JNE: { key: "jne", name: "JNE", w: 47 },
  JT: { key: "jt", name: "J&T Express", w: 93 },
  SiCepat: { key: "sicepat", name: "SiCepat", w: 71 },
  Sap: { key: "sap", name: "SAP Express", w: 29 },
  lion: { key: "lion", name: "Lion Parcel", w: 106 },
  anteraja: { key: "anteraja", name: "Anteraja", w: 67 },
  iDexpress: { key: "idexpress", name: "iDexpress", w: 24 },
  pos: { key: "pos", name: "Pos Indonesia", w: 29 },
  spx: { key: "spx", name: "SPX Express", w: 49 },
}
export const COURIER_KEYS = new Set(Object.values(COURIER_LOGOS).map((c) => c.key))

/** `<img>` for a courier code; `alt` empty when the name is printed beside it. Unknown codes render nothing. */
export function courierImg(code: string | null, decorative = false, h = 22): string {
  const c = code ? COURIER_LOGOS[code] : undefined
  return c ? `<img src="/couriers/${c.key}.svg" alt="${decorative ? "" : e(c.name)}" width="${Math.round((c.w * h) / 20)}" height="${h}" decoding="async">` : ""
}

/** Up to two initials of the outlet name (`Gerai Berkah Jaya` → `GB`); `#` when it has no letter or digit. */
export function initials(name: string, n = 2): string {
  const words = name.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? []
  // The first code point, not the first UTF-16 unit: `𠮷` is two units, and a lone surrogate breaks encodeURIComponent.
  return words.slice(0, n).map((w) => Array.from(w)[0]!.toUpperCase()).join("") || "#"
}

/** White-label favicon: the outlet initial on the accent tile (never the platform mark). */
export function favicon(name: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0B4FE3"/><text x="16" y="22" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#fff">${e(initials(name, 1))}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** `Buka Peta`: the outlet pin when both coordinates are set, else a street + area search, else nothing. */
export function mapUrl(o: Pick<Outlet, "latitude" | "longitude" | "address" | "area">): string | null {
  const base = "https://www.google.com/maps/search/?api=1&query="
  if (typeof o.latitude === "number" && typeof o.longitude === "number" && Number.isFinite(o.latitude) && Number.isFinite(o.longitude)) return `${base}${o.latitude},${o.longitude}`
  const q = [o.address, o.area].filter(Boolean).join(", ")
  return q ? `${base}${encodeURIComponent(q)}` : null
}

/** `Dago, Coblong, Kota Bandung` → `Coblong, Kota Bandung` (kecamatan + kota; the header line under the name). */
export function district(area: string | null): string | null {
  const parts = (area ?? "").split(",").map((x) => x.trim()).filter(Boolean)
  return (parts.length >= 3 ? parts.slice(1, 3) : parts.slice(-2)).join(", ") || null
}

/** Mini-site host is on the platform tenant zone (`<slug>.geraimitra.com`), not a gerai's own custom domain. */
export const onTenantZone = (host: string, zone: string) => host.split(":")[0]!.toLowerCase().endsWith(`.${zone.toLowerCase()}`)

const HINTS: Record<Shell["tab"], string> = { ongkir: "Bandingkan ongkir ekspedisi", kirim: "Isi data dari rumah, dapat QR", lacak: "Cek status kiriman Anda" }

/**
 * Page shell (DEC-247B, owner 2026-11-18). Header: logo/initials + name + kecamatan · the three pages · [Kirim Paket]
 * (desktop) or [Menu] (phone) — never a WhatsApp button. WhatsApp sits in the `Lokasi & Jam Buka` card next to the
 * map link and as the last, secondary row of the phone menu. The platform attribution shows on the tenant zone only.
 */
export function page(s: Shell, body: string, scripts = "", after = ""): string {
  const o = s.outlet
  const masked = s.masked === true
  const where = masked ? "" : [o.address, o.area].filter(Boolean).join(", ")
  const map = masked ? null : mapUrl(o)
  const chatHref = !masked && s.wa !== false && o.whatsapp ? wa(o.whatsapp, s.wa?.text) : null
  const chat = chatHref ? `<a class="btn soft" href="${e(chatHref)}" rel="noopener">Chat WhatsApp Gerai</a>` : ""
  const visit =
    !masked && (where || o.openingHours || map || chat)
      ? `<section class="sec" id="lokasi" aria-labelledby="visit"><div class="visit"><div><h2 id="visit">Lokasi &amp; Jam Buka</h2>${where ? `<p>${e(where)}</p>` : ""}${o.openingHours ? `<p>Buka ${e(o.openingHours)}</p>` : ""}</div>${map || chat ? `<div class="acts">${map ? `<a class="btn white" href="${e(map)}" target="_blank" rel="noopener">Buka Peta</a>` : ""}${chat}</div>` : ""}</div></section>`
      : ""
  const mark = masked ? '<span class="mark mono" aria-hidden="true">#</span>' : o.logoVersion ? `<img class="mark" src="/logo?v=${e(o.logoVersion)}" alt="Logo ${e(o.name)}" width="44" height="44">` : `<span class="mark mono" aria-hidden="true">${e(initials(o.name))}</span>`
  const kec = masked ? null : district(o.area)
  const shown = masked ? "Lacak Paket" : o.name
  const cur = (id: Shell["tab"]) => (s.tab === id ? ' aria-current="page"' : "")
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(s.title)}</title><link rel="icon" type="image/svg+xml" href="${e(favicon(masked ? "" : o.name))}"><meta name="description" content="${e(s.description)}"><link rel="canonical" href="${e(s.canonical)}">
${s.noindex ? '<meta name="robots" content="noindex">' : ""}<meta name="theme-color" content="#FFFFFF"><meta property="og:title" content="${e(s.title)}"><meta property="og:description" content="${e(s.description)}"><meta property="og:type" content="website">
<style>${CSS}</style></head><body>
<header class="hdr"><div class="wrap bar"><a class="brand" href="/">${mark}<span><h1>${e(shown)}</h1>${kec ? `<small>${e(kec)}</small>` : ""}</span></a>
<nav class="tabs" aria-label="Menu gerai">${TABS.map(([id, href, label]) => `<a href="${href}"${cur(id)}>${label}</a>`).join("")}</nav>
<a class="btn pri send" href="/kirim">Kirim Paket</a><a class="mbtn" id="mnav-btn" href="#mnav" role="button" aria-controls="mnav" aria-expanded="false" aria-label="Buka menu"><i aria-hidden="true"></i>Menu</a></div></header>
<nav class="mnav" id="mnav" aria-label="Menu gerai (ponsel)">${TABS.map(([id, href, label]) => `<a href="${href}"${cur(id)}>${label}<small>${HINTS[id]}</small></a>`).join("")}${chatHref ? `<a class="mwa" href="${e(chatHref)}" rel="noopener">Chat WhatsApp Gerai<small>Tanya gerai langsung</small></a>` : ""}</nav><div class="dim" id="mnav-dim"></div>
<main class="wrap">${body}${after}${visit}</main>
<footer><div class="wrap">${s.attribution ? "<span>Didukung jaringan resmi GeraiExpress</span>" : `<span>${e(shown)}</span>`}<a href="${e(s.brandOrigin)}/privasi" rel="noopener">Kebijakan Privasi</a></div></footer>
${MENU_SCRIPT}${VALIDATION_SCRIPT}${scripts}</body></html>`
}

/** Phone menu: [Menu ⇄ ×] opens the page list (no JS: `#mnav` via `:target`); Escape, outside click, a link, wide screens close it. */
export const MENU_SCRIPT = `<script>(()=>{const d=document,b=d.getElementById('mnav-btn'),m=d.getElementById('mnav'),k=d.getElementById('mnav-dim'),h=d.querySelector('.hdr');if(!b||!m||!k||!h)return;m.setAttribute('inert','');
const isO=()=>b.getAttribute('aria-expanded')==='true',set=(o,back)=>{if(o)d.documentElement.style.setProperty('--hdr-b',Math.round(h.getBoundingClientRect().bottom)+8+'px');b.setAttribute('aria-expanded',o?'true':'false');b.setAttribute('aria-label',o?'Tutup menu':'Buka menu');if(o)m.removeAttribute('inert');else m.setAttribute('inert','');m.classList.toggle('open',o);k.classList.toggle('open',o);if(o){const a=m.querySelector('a');if(a)a.focus({preventScroll:true})}else if(back)b.focus()};
b.addEventListener('click',ev=>{ev.preventDefault();set(!isO())});b.addEventListener('keydown',ev=>{if(ev.key===' '||ev.key==='Spacebar'){ev.preventDefault();set(!isO())}});d.addEventListener('pointerdown',ev=>{if(isO()&&!m.contains(ev.target)&&!b.contains(ev.target))set(false)});
d.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&isO()){ev.preventDefault();set(false,true)}});m.addEventListener('click',ev=>{if(ev.target.closest('a'))set(false)});addEventListener('pageshow',()=>{if(isO())set(false)});
const mq=matchMedia('(min-width:960px)');if(mq.addEventListener)mq.addEventListener('change',ev=>{if(ev.matches&&isO())set(false)})})()</script>`

/**
 * Indonesian constraint validation (DEC-247 §2.4, same net as the brand site's `SHELL_SCRIPT`; the mini-site sends no
 * CSP, so it is inline): on `invalid` a field gets an Indonesian message worded from its label (`data-msg-missing` /
 * `data-msg-invalid` override it), and only messages this net set are cleared — on input, change and the next submit.
 */
export const VALIDATION_SCRIPT = `<script>(()=>{const d=document,ours=new WeakSet,wr=new WeakSet;let me=false;const isF=t=>t&&typeof t.setCustomValidity==='function'&&'validity' in t,
lab=f=>((f.getAttribute('data-validity-label')||(f.labels&&f.labels[0]&&f.labels[0].textContent)||f.getAttribute('aria-label')||'').replace(/\\s+/g,' ').replace(/[*:]+\\s*$/,'').trim()).slice(0,60),
msg=f=>{const v=f.validity,l=lab(f),n=l?' '+l:' ini',t=f.tagName==='SELECT'?'select':f.type;
if(v.valueMissing)return f.getAttribute('data-msg-missing')||(t==='checkbox'?'Centang kotak ini untuk melanjutkan.':t==='radio'?(l?'Pilih salah satu '+l+'.':'Pilih salah satu opsi.'):t==='select'?'Pilih'+n+' terlebih dahulu.':'Kolom'+n+' wajib diisi.');
const inv=f.getAttribute('data-msg-invalid');if(inv)return inv;if(v.badInput)return 'Masukkan angka yang valid.';
if(v.typeMismatch)return t==='email'?'Format email belum benar (contoh: nama@domain.com).':t==='url'?'Masukkan alamat URL lengkap (diawali https://).':'Format isian belum sesuai.';
if(v.patternMismatch)return 'Format'+n+' belum sesuai'+(f.placeholder?' (contoh: '+f.placeholder+')':'')+'.';
if(v.tooLong)return 'Maksimal '+f.maxLength+' karakter.';if(v.tooShort)return 'Minimal '+f.minLength+' karakter.';
if(v.rangeUnderflow)return 'Nilai minimal '+f.min+'.';if(v.rangeOverflow)return 'Nilai maksimal '+f.max+'.';
if(v.stepMismatch)return 'Masukkan kelipatan '+(f.step||'1')+'.';return 'Isian belum valid.'},
put=(f,m)=>{if(!wr.has(f)){const n=f.setCustomValidity;f.setCustomValidity=x=>{if(!me)ours.delete(f);n.call(f,x)};wr.add(f)}me=true;try{f.setCustomValidity(m)}finally{me=false}if(m)ours.add(f);else ours.delete(f)},rel=f=>{if(ours.has(f))put(f,'')};
d.addEventListener('invalid',ev=>{const f=ev.target;if(!isF(f))return;if(f.validity.customError&&!ours.has(f))return;rel(f);if(f.validity.valid){ev.preventDefault();return}put(f,msg(f))},true);
for(const t of['input','change'])d.addEventListener(t,ev=>{if(isF(ev.target))rel(ev.target)},true);
d.addEventListener('click',ev=>{const x=ev.target&&ev.target.closest?ev.target.closest('button,input[type=submit]'):null;if(x&&x.form&&x.type==='submit')for(const f of x.form.elements)if(isF(f))rel(f)},true)})()</script>`

/** `/kirim`: the COD price field follows the Non-COD/COD choice at once. Without JS the field simply stays visible. */
export const COD_SCRIPT = `<script>(()=>{const b=document.getElementById('codBox'),f=b&&b.closest('form');if(!f)return;const s=()=>{b.hidden=f.elements.cod.value!=='1'};f.addEventListener('change',ev=>{if(ev.target.name==='cod')s()});s()})()</script>`

/** Area search enhancement for a `<input data-area>` + hidden id/label inputs (works without JS via `/area?q=`). */
export const AREA_SCRIPT = `<script>
for(const box of document.querySelectorAll('[data-area]')){const id=document.getElementById(box.dataset.area+'Id'),lab=document.getElementById(box.dataset.area+'Label'),list=document.createElement('ul');list.className='ac';list.hidden=true;box.after(list);let t;
box.addEventListener('input',()=>{id.value='';clearTimeout(t);const q=box.value.trim();if(q.length<3){list.hidden=true;return}t=setTimeout(async()=>{const r=await fetch('/area?q='+encodeURIComponent(q));const j=await r.json();list.innerHTML='';for(const a of j.items){const li=document.createElement('li'),b=document.createElement('button');b.type='button';b.textContent=a.label;b.onclick=()=>{id.value=a.id;lab.value=a.label;box.value=a.label;list.hidden=true};li.append(b);list.append(li)}list.hidden=!j.items.length},250)})}
</script>`

export const turnstile = (siteKey: string | null) => (siteKey ? `<div class="cf-turnstile" data-sitekey="${e(siteKey)}" data-language="id" data-appearance="interaction-only" style="margin-top:12px"></div>` : `<input type="hidden" name="cf-turnstile-response" value="dev-token">`)
export const TURNSTILE_SCRIPT = (siteKey: string | null) => (siteKey ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : "")
