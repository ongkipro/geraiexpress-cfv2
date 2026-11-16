// Mini-site HTML (TASK-501, visual 03 §1, DEC-207): server-rendered, light, mobile-first, < 35 KB per page. Plain
// strings with every dynamic value escaped; the only client script is progressive enhancement (area search,
// Turnstile) on top of working HTML forms.
import { escapeHtml as e } from "../http/pages"

export interface Shell {
  host: string
  /** Platform brand origin for the privacy link (`https://geraiexpress.com`, staging/local equivalents). */
  brandOrigin: string
  outlet: { name: string; whatsapp: string | null; openingHours: string | null; address: string | null; area: string | null }
  tab: "ongkir" | "kirim" | "lacak"
  title: string
  description: string
  canonical: string
  noindex?: boolean
  turnstileSiteKey: string | null
}

const CSS = `:root{color-scheme:light;--ink:#203551;--muted:#55657D;--line:#E3E8F0;--blue:#2E47BA;--tint:#EEF1FB;--safe:#1B7A3E;--danger:#B42318}
*{box-sizing:border-box}html{font-size:16px;-webkit-text-size-adjust:100%}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:#fff;line-height:1.5}
a{color:var(--blue)}.wrap{max-width:960px;margin:0 auto;padding-left:16px;padding-right:16px}
header{padding-top:28px}header h1{font-size:26px;line-height:1.2;margin:0 0 4px;letter-spacing:-.01em;text-wrap:balance}header p{margin:0;color:var(--muted)}
.cta{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:8px;background:var(--blue);color:#fff;text-decoration:none;font-weight:600;border:0;font-size:16px;cursor:pointer}
.cta.ghost{background:#fff;color:var(--blue);border:1px solid var(--blue)}.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}
nav.tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin:16px 0 0;overflow-x:auto}nav.tabs a{display:flex;align-items:center;min-height:48px;padding:0 14px;color:var(--muted);text-decoration:none;white-space:nowrap;border-bottom:3px solid transparent}
nav.tabs a[aria-current=page]{color:var(--ink);font-weight:600;border-bottom-color:var(--blue)}
main{padding-top:24px;padding-bottom:32px}main form{max-width:640px}h2{font-size:20px;margin:0 0 12px}label{display:block;font-weight:500;margin:14px 0 6px}
input,select,textarea{width:100%;min-height:44px;font-size:16px;padding:8px 12px;border:1px solid #7B879C;border-radius:6px;color:var(--ink);background:#fff}
input:focus-visible,select:focus-visible,a:focus-visible,button:focus-visible{outline:3px solid #9DB0F0;outline-offset:2px}
.grid2{display:grid;gap:0 16px}@media(min-width:720px){.grid2{grid-template-columns:1fr 1fr}}
.hint{color:var(--muted);font-size:15px;margin:4px 0 0}.err{color:var(--danger);font-weight:500;margin:6px 0 0}
.seg{display:flex;gap:8px;flex-wrap:wrap}.seg label{margin:0;display:flex;align-items:center;gap:8px;min-height:44px;padding:0 14px;border:1px solid #7B879C;border-radius:6px;font-weight:400}
.seg input{width:auto;min-height:0}
ul.rates{list-style:none;margin:16px 0 0;padding:0;border-top:1px solid var(--line)}ul.rates li{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}
.num{font-variant-numeric:tabular-nums;font-weight:600}.tag{font-size:14px;color:var(--muted)}
.why{background:#F7F9FC;padding:24px 0;margin-top:8px}.why ul{margin:0;padding-left:20px}.why li{margin:6px 0}
.steps{list-style:none;margin:16px 0 0;padding:0}.steps li{position:relative;padding:0 0 16px 24px}.steps li::before{content:"";position:absolute;left:4px;top:8px;width:8px;height:8px;border-radius:50%;background:var(--line)}
.steps li:first-child::before{background:var(--blue)}.qr{max-width:280px;margin:16px 0}.qr svg{width:100%;height:auto;display:block}
.inv{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:.06em}
footer{border-top:1px solid var(--line);padding:20px 0 32px;color:var(--muted);font-size:15px}footer .wrap{display:flex;flex-wrap:wrap;gap:8px 24px;justify-content:space-between}
.ac{list-style:none;margin:4px 0 0;padding:0;border:1px solid var(--line);border-radius:6px}.ac button{display:block;width:100%;text-align:left;min-height:44px;padding:8px 12px;background:#fff;border:0;border-bottom:1px solid var(--line);font-size:16px;color:var(--ink)}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}`

const TABS: Array<[Shell["tab"], string, string]> = [
  ["ongkir", "/", "Cek Ongkir"],
  ["kirim", "/kirim", "Kirim dari Rumah"],
  ["lacak", "/lacak", "Lacak Paket"],
]

export const wa = (phone: string, text?: string) => `https://wa.me/62${phone.replace(/\D/g, "").replace(/^0/, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`
export const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`.replace(/\u00a0/g, " ")

export function page(s: Shell, body: string, scripts = "", after = ""): string {
  const o = s.outlet
  const where = [o.address, o.area].filter(Boolean).join(", ")
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(s.title)}</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%232E47BA'/%3E%3Cpath d='M9 12l7-4 7 4v9l-7 4-7-4z' fill='none' stroke='%23fff' stroke-width='2'/%3E%3C/svg%3E"><meta name="description" content="${e(s.description)}"><link rel="canonical" href="${e(s.canonical)}">
${s.noindex ? '<meta name="robots" content="noindex">' : ""}<meta property="og:title" content="${e(s.title)}"><meta property="og:description" content="${e(s.description)}"><meta property="og:type" content="website">
<style>${CSS}</style></head><body>
<header class="wrap"><h1>${e(o.name)}</h1><p>Agen kirim paket multi-ekspedisi${where ? ` · ${e(where)}` : ""}${o.openingHours ? ` · Buka ${e(o.openingHours)}` : ""}</p>
${o.whatsapp ? `<div class="row"><a class="cta ghost" href="${e(wa(o.whatsapp))}" rel="noopener">Chat WhatsApp Gerai</a></div>` : ""}
<nav class="tabs" aria-label="Menu gerai">${TABS.map(([id, href, label]) => `<a href="${href}"${s.tab === id ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav></header>
<main class="wrap">${body}</main>${after}
<footer><div class="wrap"><span>Didukung jaringan resmi GeraiExpress</span><a href="${e(s.brandOrigin)}/privasi" rel="noopener">Kebijakan Privasi</a></div></footer>
${scripts}</body></html>`
}

/** Area search enhancement for a `<input data-area>` + hidden id/label inputs (works without JS via `/area?q=`). */
export const AREA_SCRIPT = `<script>
for(const box of document.querySelectorAll('[data-area]')){const id=document.getElementById(box.dataset.area+'Id'),lab=document.getElementById(box.dataset.area+'Label'),list=document.createElement('ul');list.className='ac';list.hidden=true;box.after(list);let t;
box.addEventListener('input',()=>{id.value='';clearTimeout(t);const q=box.value.trim();if(q.length<3){list.hidden=true;return}t=setTimeout(async()=>{const r=await fetch('/area?q='+encodeURIComponent(q));const j=await r.json();list.innerHTML='';for(const a of j.items){const li=document.createElement('li'),b=document.createElement('button');b.type='button';b.textContent=a.label;b.onclick=()=>{id.value=a.id;lab.value=a.label;box.value=a.label;list.hidden=true};li.append(b);list.append(li)}list.hidden=!j.items.length},250)})}
</script>`

export const turnstile = (siteKey: string | null) => (siteKey ? `<div class="cf-turnstile" data-sitekey="${e(siteKey)}" data-language="id" data-appearance="interaction-only" style="margin-top:12px"></div>` : `<input type="hidden" name="cf-turnstile-response" value="dev-token">`)
export const TURNSTILE_SCRIPT = (siteKey: string | null) => (siteKey ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : "")
