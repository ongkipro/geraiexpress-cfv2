// Brand site `geraiexpress.com` (TASK-502, DEC-202, visual 03 §2, spec 06 §5): SSR, no cookies (session cookies are
// host-only on app./owner.), legal footer from `platform_legal_profile` rendering filled fields only (DEC-218),
// `/simulasi-kasir` interactive counter demo on static synthetic data (no login, no API, no Mengantar).
import { escapeHtml as e, notFoundHtml } from "../http/pages"

type Legal = { legal_name: string | null; brand_name: string | null; nib: string | null; registered_address: string | null; support_email: string | null; support_whatsapp: string | null; privacy_contact_email: string | null; pse_registration_number: string | null }

const CSS = `:root{color-scheme:light;--ink:#203551;--muted:#55657D;--line:#E3E8F0;--blue:#2E47BA;--band:#F5F7FB}
*{box-sizing:border-box}html{font-size:16px;-webkit-text-size-adjust:100%}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:#fff;line-height:1.55}
a{color:var(--blue)}.wrap{max-width:1080px;margin:0 auto;padding-left:20px;padding-right:20px}
.top{display:flex;align-items:center;justify-content:space-between;gap:8px 16px;min-height:68px;flex-wrap:wrap;padding-top:8px;padding-bottom:8px}.brand{font-weight:700;font-size:20px;color:var(--ink);text-decoration:none;letter-spacing:-.01em}
.top nav{display:flex;flex-wrap:wrap;gap:0 18px;max-width:100%}@media(max-width:640px){.top nav{width:100%;order:2}}.top nav a{color:var(--ink);text-decoration:none;min-height:44px;display:inline-flex;align-items:center;white-space:nowrap}.top nav a[aria-current=page]{color:var(--blue);font-weight:600}
.cta{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;border-radius:8px;background:var(--blue);color:#fff;text-decoration:none;font-weight:600;border:0;font-size:16px;cursor:pointer}
.cta.ghost{background:#fff;color:var(--blue);border:1px solid var(--blue)}.row{display:flex;flex-wrap:wrap;gap:12px;margin-top:20px}
.hero{padding-top:48px;padding-bottom:40px}.hero h1{font-size:clamp(30px,5vw,46px);line-height:1.12;letter-spacing:-.02em;margin:0 0 16px;max-width:22ch;text-wrap:balance}.hero p{font-size:19px;color:var(--muted);margin:0;max-width:58ch}
section{padding-top:40px;padding-bottom:40px}section.band{background:var(--band)}h2{font-size:clamp(24px,3vw,30px);letter-spacing:-.01em;margin:0 0 12px;text-wrap:balance}h3{font-size:19px;margin:0 0 6px}
.cols{display:grid;gap:28px}@media(min-width:800px){.cols{grid-template-columns:repeat(3,1fr)}.cols2{grid-template-columns:1fr 1fr}}
.cols p{margin:0;color:var(--muted)}ol.flow{margin:0;padding-left:22px}ol.flow li{margin:10px 0}
.sim{display:grid;gap:24px}@media(min-width:900px){.sim{grid-template-columns:1fr 1fr}}
label{display:block;font-weight:500;margin:14px 0 6px}input,select{width:100%;min-height:44px;font-size:16px;padding:8px 12px;border:1px solid #7B879C;border-radius:6px;background:#fff;color:var(--ink)}
ul.rates{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}ul.rates li{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line)}
ul.rates button{min-height:44px;padding:0 14px;border:1px solid var(--blue);border-radius:6px;background:#fff;color:var(--blue);font-size:16px;cursor:pointer}
.num{font-variant-numeric:tabular-nums;font-weight:600}.receipt{border:1px dashed #7B879C;border-radius:8px;padding:16px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:15px;white-space:pre-wrap}
.note{color:var(--muted);font-size:16px}input:focus-visible,select:focus-visible,a:focus-visible,button:focus-visible{outline:3px solid #9DB0F0;outline-offset:2px}
footer{border-top:1px solid var(--line);padding:28px 0 40px;color:var(--muted);font-size:15px}footer .wrap{display:grid;gap:12px}footer nav{display:flex;flex-wrap:wrap;gap:8px 20px}
.prose{max-width:70ch}.prose h2{font-size:22px;margin-top:28px}`

const NAV: Array<[string, string]> = [
  ["/fitur", "Fitur"],
  ["/cara-kerja", "Cara Kerja"],
  ["/simulasi-kasir", "Simulasi Kasir"],
  ["/hubungi-kami", "Hubungi Kami"],
]

function shell(o: { path: string; title: string; description: string; host: string; appOrigin: string; legal: Legal | null; body: string; script?: string; noindex?: boolean }): string {
  const l = o.legal
  const brand = l?.brand_name || "GeraiExpress"
  const legalLines = [l?.legal_name, l?.nib ? `NIB ${l.nib}` : null, l?.pse_registration_number ? `Terdaftar PSE ${l.pse_registration_number}` : null, l?.registered_address].filter(Boolean) as string[]
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(o.title)} - ${e(brand)}</title><meta name="description" content="${e(o.description)}"><link rel="canonical" href="https://${e(o.host)}${o.path === "/" ? "/" : o.path}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%232E47BA'/%3E%3Cpath d='M9 12l7-4 7 4v9l-7 4-7-4z' fill='none' stroke='%23fff' stroke-width='2'/%3E%3C/svg%3E">
${o.noindex ? '<meta name="robots" content="noindex">' : ""}<meta property="og:title" content="${e(o.title)} - ${e(brand)}"><meta property="og:description" content="${e(o.description)}"><meta property="og:type" content="website"><meta property="og:url" content="https://${e(o.host)}${o.path}">
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Organization", name: brand, url: `https://${o.host}/`, ...(l?.legal_name ? { legalName: l.legal_name } : {}), ...(l?.support_email ? { email: l.support_email } : {}) }).replace(/</g, "\\u003c")}</script>
<style>${CSS}</style></head><body>
<header class="wrap top"><a class="brand" href="/">${e(brand)}</a><nav aria-label="Menu utama">${NAV.map(([h, t]) => `<a href="${h}"${o.path === h ? ' aria-current="page"' : ""}>${t}</a>`).join("")}<a href="${e(o.appOrigin)}/masuk">Masuk</a></nav></header>
<main>${o.body}</main>
<footer><div class="wrap"><nav aria-label="Tautan bawah"><a href="/ketentuan">Ketentuan Layanan</a><a href="/privasi">Kebijakan Privasi</a><a href="/hubungi-kami">Hubungi Kami</a></nav>
${legalLines.length ? `<p style="margin:0">${legalLines.map(e).join(" · ")}</p>` : ""}<p style="margin:0">© ${new Date().getUTCFullYear()} ${e(brand)}. Jaringan agen kirim paket multi-ekspedisi.</p></div></footer>${o.script ?? ""}</body></html>`
}

const home = (app: string) => `<div class="wrap hero"><h1>Kasir gerai kirim paket, dari timbang sampai COD cair</h1>
<p>Untuk konter pulsa, fotokopi, toko kelontong, dan agen ekspedisi: bandingkan tarif banyak ekspedisi, cetak resi 100 mm, catat kas per shift, dan cocokkan saldo Mengantar otomatis.</p>
<div class="row"><a class="cta" href="${e(app)}/daftar-akun">Daftar Gerai</a><a class="cta ghost" href="/simulasi-kasir">Coba Simulasi Kasir</a></div></div>
<section class="band"><div class="wrap"><h2>Yang beres di meja kasir</h2><div class="cols">
<div><h3>Struk jujur</h3><p>Harga yang dilihat pelanggan adalah harga yang dibayar. Tunai, QRIS gerai, atau transfer tercatat per shift.</p></div>
<div><h3>Resi langsung cetak</h3><p>Label 100 mm dari PC lewat printer thermal biasa, atau roll 58 mm Bluetooth dari HP.</p></div>
<div><h3>Kirim atas nama toko</h3><p>Reseller dan dropshipper bisa mencetak nama tokonya sendiri; paket retur tetap kembali ke gerai.</p></div>
</div></div></section>
<section><div class="wrap cols cols2" style="display:grid;gap:28px"><div><h2>Uang yang bisa dipercaya</h2><p class="note">Saldo Mengantar disinkronkan dari tagihan resmi, COD cair dicocokkan per resi, dan laba kas hanya dihitung setelah uangnya benar-benar masuk.</p></div>
<div><h2>Halaman gerai gratis</h2><p class="note">Setiap gerai mendapat alamat <strong>namagerai.gerai.cc</strong> untuk cek ongkir, isi alamat dari rumah lewat QR, dan lacak paket tanpa membuka data pribadi penerima.</p></div></div></section>
<section class="band"><div class="wrap"><h2>Cukup perangkat yang sudah ada</h2><p class="note" style="max-width:62ch">HP Android atau laptop, timbangan digital, dan printer thermal murah sudah cukup. Tidak ada mesin khusus yang wajib dibeli.</p>
<div class="row"><a class="cta" href="${e(app)}/daftar-akun">Daftar Gerai</a></div></div></section>`

const fitur = `<div class="wrap hero"><h1>Fitur untuk gerai kirim paket</h1><p>Semua yang dibutuhkan kasir dan pemilik gerai dalam enam menu.</p></div>
<section style="padding-top:0"><div class="wrap"><h2>Dari meja kasir sampai laporan</h2></div><div class="wrap cols">
<div><h3>Cek ongkir multi-ekspedisi</h3><p>J&amp;T, JNE, SiCepat, SAP, Lion Parcel, Anteraja, Pos Indonesia, SPX dan lainnya — dengan label Termurah dan Tercepat.</p></div>
<div><h3>COD dengan hitungan tepat</h3><p>Biaya COD dari Mengantar, hak pengirim, dan pencairan dicatat sampai rupiah terakhir.</p></div>
<div><h3>Paket massal</h3><p>Unggah CSV sampai 200 baris, perbaiki yang salah, buat semua resi sekaligus.</p></div>
<div><h3>Pickup &amp; Surat Jalan</h3><p>Pindai paket per kurir; salah kurir langsung diblokir. Serah terima dengan tanda tangan.</p></div>
<div><h3>Meja Retur</h3><p>Paket retur diterima di gerai, pengirim asli dapat Kode Ambil lewat WhatsApp.</p></div>
<div><h3>Keuangan dua buku</h3><p>Kas loket per shift terpisah dari mutasi saldo Mengantar; selisih langsung terlihat.</p></div>
</div></section>`

const caraKerja = (app: string) => `<div class="wrap hero"><h1>Cara kerja</h1><p>Dari daftar sampai paket pertama terkirim.</p></div>
<section><div class="wrap prose"><ol class="flow">
<li><strong>Daftar gerai</strong> — isi data usaha dan titik jemput. Tim GeraiExpress memeriksa pengajuan.</li>
<li><strong>Akun Mengantar dibuat</strong> — setelah disetujui, akun seller Mengantar gerai terhubung otomatis.</li>
<li><strong>Isi saldo</strong> — top-up saldo di aplikasi Mengantar untuk kiriman Non-COD.</li>
<li><strong>Layani pelanggan</strong> — timbang, pilih ekspedisi, catat pembayaran, cetak resi.</li>
<li><strong>Serahkan ke kurir</strong> — pindai paket per kurir dan minta tanda tangan di Surat Jalan.</li>
</ol><div class="row"><a class="cta" href="${e(app)}/daftar-akun">Daftar Gerai</a></div></div></section>`

/** Static, synthetic demo — nothing here talks to the API, Mengantar, or any real customer data. */
const SIM_RATES = [
  { id: "jt", name: "J&T Express · EZ", eta: "2–3 hari", base: 12500 },
  { id: "sicepat", name: "SiCepat · REG", eta: "1–2 hari", base: 13000 },
  { id: "jne", name: "JNE · REG", eta: "2–3 hari", base: 12000 },
  { id: "lion", name: "Lion Parcel · REGPACK", eta: "2–3 hari", base: 11200 },
]
const SIM_CITIES: Array<[string, number]> = [
  ["Tebet, Jakarta Selatan", 1],
  ["Coblong, Kota Bandung", 0.9],
  ["Gubeng, Kota Surabaya", 1.25],
  ["Medan Kota, Kota Medan", 1.6],
]
const simulasi = `<div class="wrap hero" style="padding-bottom:16px"><h1>Simulasi kasir</h1><p>Coba alur meja kasir GeraiExpress dengan data contoh. Tidak perlu daftar, tidak ada kiriman sungguhan.</p></div>
<section style="padding-top:8px"><div class="wrap sim">
<form id="sim" onsubmit="return false"><label for="kota">Kota tujuan</label><select id="kota">${SIM_CITIES.map(([c], i) => `<option value="${i}">${e(c)}</option>`).join("")}</select>
<label for="berat">Berat (gram)</label><input id="berat" inputmode="numeric" value="1000">
<label for="bayar">Cara bayar</label><select id="bayar"><option>Tunai</option><option>QRIS gerai</option><option>Transfer</option></select>
<h2 style="font-size:20px;margin-top:20px">Pilih ekspedisi</h2><ul class="rates" id="rates"></ul></form>
<div><h2 style="font-size:20px">Struk pelanggan</h2><div class="receipt" id="struk" aria-live="polite">Pilih ekspedisi untuk melihat struk.</div><p class="note">Contoh struk. Di gerai, struk dan label 100 mm tercetak bersamaan.</p></div>
</div></section>`
const SIM_SCRIPT = `<script>
const R=${JSON.stringify(SIM_RATES)},C=${JSON.stringify(SIM_CITIES)};const rp=n=>'Rp '+n.toLocaleString('id-ID');
const price=r=>{const kg=Math.max(1,Math.ceil((parseInt(document.getElementById('berat').value.replace(/\\D/g,''))||0)/1000));return Math.round(r.base*C[document.getElementById('kota').value][1]*kg/500)*500};
function draw(){const ul=document.getElementById('rates');ul.innerHTML='';const list=R.map(r=>({...r,p:price(r)})).sort((a,b)=>a.p-b.p);for(const r of list){const li=document.createElement('li');li.innerHTML='<span>'+r.name+'<br><span class="note">'+r.eta+'</span></span>';const b=document.createElement('button');b.type='button';b.textContent=rp(r.p);b.setAttribute('aria-label','Pilih '+r.name+' '+rp(r.p));b.onclick=()=>receipt(r);li.append(b);ul.append(li)}}
function receipt(r){const inv='INV '+'DEMO'+String(Math.floor(Date.now()/1000)%1000).padStart(3,'0');document.getElementById('struk').textContent=['GERAI CONTOH','Jl. Contoh No. 1','','No: '+inv,'Ekspedisi: '+r.name,'Tujuan: '+C[document.getElementById('kota').value][0],'Berat: '+document.getElementById('berat').value+' g','','Ongkir        '+rp(r.p),'Total Dibayar '+rp(r.p),'Bayar: '+document.getElementById('bayar').value,'','Lacak: namagerai.gerai.cc/lacak','(simulasi — bukan resi sungguhan)'].join('\\n')}
for(const id of ['kota','berat'])document.getElementById(id).addEventListener('input',draw);draw();
</script>`

const hubungi = (l: Legal | null) => `<div class="wrap hero"><h1>Hubungi kami</h1><p>Pertanyaan tentang pendaftaran gerai, tarif, atau kerja sama.</p></div>
<section><div class="wrap prose">
${l?.support_whatsapp ? `<p><a class="cta" href="https://wa.me/62${e(l.support_whatsapp.replace(/\D/g, "").replace(/^(62|0)/, ""))}" rel="noopener">Chat WhatsApp</a></p>` : ""}
<p>Email: <a href="mailto:${e(l?.support_email || "bantuan@geraiexpress.com")}">${e(l?.support_email || "bantuan@geraiexpress.com")}</a></p>
${l?.registered_address ? `<p>Alamat: ${e(l.registered_address)}</p>` : ""}</div></section>`

const ketentuan = (l: Legal | null) => `<div class="wrap hero"><h1>Ketentuan layanan</h1></div><section style="padding-top:0"><div class="wrap prose">
<p>Ketentuan ini mengatur penggunaan layanan ${e(l?.brand_name || "GeraiExpress")}${l?.legal_name ? `, dioperasikan oleh ${e(l.legal_name)}` : ""}, oleh gerai mitra.</p>
<h2>Peran layanan</h2><p>GeraiExpress adalah perangkat lunak kasir dan pencatatan untuk gerai. Pengiriman dilakukan oleh ekspedisi melalui akun seller Mengantar milik masing-masing gerai. Pembayaran pelanggan diterima langsung oleh gerai; GeraiExpress hanya mencatatnya.</p>
<h2>Kewajiban gerai</h2><p>Gerai memastikan isi paket bukan barang terlarang, data pengirim dan penerima benar, dan uang pelanggan dicatat sesuai yang diterima.</p>
<h2>Perubahan</h2><p>Ketentuan dapat diperbarui. Versi terbaru selalu ada di halaman ini.</p>
<p class="note">Naskah lengkap sedang ditinjau konsultan hukum.</p></div></section>`

const privasi = (l: Legal | null) => `<div class="wrap hero"><h1>Kebijakan privasi</h1></div><section style="padding-top:0"><div class="wrap prose">
<p>Kami mengolah data pribadi sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.</p>
<h2>Data yang diolah</h2><p>Nama dan nomor kontak pengirim dan penerima, alamat tujuan, isi paket, serta catatan pembayaran — hanya untuk mengirim paket, menagih COD, menangani retur, dan memenuhi kewajiban hukum.</p>
<h2>Pelacakan publik</h2><p>Halaman lacak paket hanya menampilkan inisial dan kota. Nomor HP, alamat lengkap, dan nilai COD tidak pernah ditampilkan kepada umum.</p>
<h2>Hak Anda</h2><p>Untuk akses, perbaikan, atau penghapusan data, hubungi ${l?.privacy_contact_email ? `<a href="mailto:${e(l.privacy_contact_email)}">${e(l.privacy_contact_email)}</a>` : `<a href="mailto:bantuan@geraiexpress.com">bantuan@geraiexpress.com</a>`}.</p>
<p class="note">Naskah lengkap sedang ditinjau konsultan hukum.</p></div></section>`

const PAGES: Record<string, { title: string; description: string }> = {
  "/": { title: "Sistem Kasir Gerai Kirim Paket", description: "Sistem kasir untuk gerai kirim paket: cek ongkir banyak ekspedisi, cetak resi, catat kas per shift, dan sinkron saldo Mengantar." },
  "/fitur": { title: "Fitur", description: "Cek ongkir multi-ekspedisi, COD tepat, paket massal, pickup dengan Surat Jalan, Meja Retur, dan keuangan dua buku untuk gerai." },
  "/cara-kerja": { title: "Cara Kerja", description: "Langkah menjadi gerai GeraiExpress: daftar, akun Mengantar terhubung, isi saldo, layani pelanggan, dan serahkan paket ke kurir." },
  "/simulasi-kasir": { title: "Simulasi Kasir", description: "Coba alur meja kasir GeraiExpress tanpa daftar: pilih tujuan dan berat, bandingkan ekspedisi, lihat contoh struk pelanggan." },
  "/hubungi-kami": { title: "Hubungi Kami", description: "Hubungi tim GeraiExpress untuk pendaftaran gerai, pertanyaan tarif, atau kerja sama. Tersedia lewat email dan WhatsApp resmi." },
  "/ketentuan": { title: "Ketentuan Layanan", description: "Ketentuan penggunaan layanan GeraiExpress untuk gerai mitra: peran layanan, kewajiban gerai, pencatatan pembayaran, dan pembaruan." },
  "/privasi": { title: "Kebijakan Privasi", description: "Bagaimana GeraiExpress mengolah data pribadi pengirim dan penerima sesuai UU PDP, termasuk pelacakan publik yang aman dan hak Anda." },
}

export async function handleBrand(request: Request, env: Env, host: string): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, "") || "/"
  if (request.method !== "GET" && request.method !== "HEAD") return notFoundHtml()
  const apex = env.PLATFORM_APEX
  // One canonical brand host: `www.` redirects permanently to the apex.
  if (host === `www.${apex}`) return new Response(null, { status: 301, headers: { location: `https://${apex}${url.pathname}${url.search}`, "cache-control": "public, max-age=86400" } })
  const appOrigin = env.GX_ENV === "local" ? `${url.protocol}//app.${apex}${url.port ? `:${url.port}` : ""}` : `https://app${env.GX_ENV === "staging" ? "-staging" : ""}.${apex}`
  if (path === "/robots.txt") return new Response(`User-agent: *\nAllow: /\nSitemap: https://${host}/sitemap.xml\n`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } })
  if (path === "/sitemap.xml") {
    const urls = Object.keys(PAGES).map((p) => `<url><loc>https://${host}${p === "/" ? "/" : p}</loc></url>`).join("")
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } })
  }
  const meta = PAGES[path]
  if (!meta) return notFoundHtml()
  const legal = await env.DB.prepare("SELECT legal_name, brand_name, nib, registered_address, support_email, support_whatsapp, privacy_contact_email, pse_registration_number FROM platform_legal_profile WHERE id = 1").first<Legal>()
  const body = path === "/" ? home(appOrigin) : path === "/fitur" ? fitur : path === "/cara-kerja" ? caraKerja(appOrigin) : path === "/simulasi-kasir" ? simulasi : path === "/hubungi-kami" ? hubungi(legal) : path === "/ketentuan" ? ketentuan(legal) : privasi(legal)
  const html = shell({ path, title: meta.title, description: meta.description, host, appOrigin, legal, body, script: path === "/simulasi-kasir" ? SIM_SCRIPT : undefined, noindex: env.GX_ENV === "staging" })
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" } })
}
