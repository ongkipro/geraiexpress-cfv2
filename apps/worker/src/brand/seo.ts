// Multi-page SEO metadata, JSON-LD graph, visible breadcrumbs, and SSR shell (`docs/visual/09` §3).
import { escapeHtml as e } from "../http/pages"
import { BRAND_CSS } from "./styles"

export type Legal = {
  legal_name: string | null
  brand_name: string | null
  nib: string | null
  registered_address: string | null
  support_email: string | null
  support_whatsapp: string | null
  privacy_contact_email: string | null
  pse_registration_number: string | null
}

export interface BrandPageMeta {
  /** Short breadcrumb & navigation name. */
  crumb: string
  /** Core page title before ` - {brand}` (calibrated so total rendered `<title>` stays 55–70 chars). */
  titleStem: string
  /** Unique 120–155 char summary ending in a full stop. */
  description: string
  /** Alt text for the Open Graph preview image (10–125 chars). */
  ogAlt: string
}

export const BRAND_PAGES: Record<string, BrandPageMeta> = {
  "/": {
    crumb: "Beranda",
    titleStem: "Aplikasi Kasir Agen Paket, Diskon Ongkir Sampai 25%",
    description: "Aplikasi kasir agen kirim paket multi-ekspedisi dengan diskon ongkir mitra sampai 25%, cetak resi 100 mm, kelola COD, dan rekonsiliasi saldo otomatis.",
    ogAlt: "Aplikasi kasir agen kirim paket multi-ekspedisi GeraiExpress dengan diskon ongkir sampai 25%",
  },
  "/fitur": {
    crumb: "Fitur",
    titleStem: "Fitur Kasir Loket, Cetak Resi & Keuangan Agen",
    description: "Enam modul operasional gerai kirim paket: cek tarif cepat, kasir Non-COD dan COD, kirim massal CSV, Surat Jalan kurir, Meja Retur, dan buku kas dua sisi.",
    ogAlt: "Fitur kasir loket, cetak resi thermal 100 mm, dan rekonsiliasi keuangan GeraiExpress",
  },
  "/ekspedisi": {
    crumb: "Ekspedisi",
    titleStem: "Daftar Ekspedisi Reguler, Kargo & Layanan COD",
    description: "Sembilan ekspedisi mitra Mengantar dalam satu loket gerai: J&T, JNE, SiCepat, SAP, Lion Parcel, iDexpress, Anteraja, Pos Indonesia, dan SPX.",
    ogAlt: "Daftar ekspedisi reguler, kargo, dan layanan COD yang didukung loket GeraiExpress",
  },
  "/cara-kerja": {
    crumb: "Cara Kerja",
    titleStem: "Cara Daftar & Peralatan Buka Loket Kirim Paket",
    description: "Panduan lima langkah membuka loket kirim paket di toko Anda: pengajuan titik jemput, koneksi Mengantar, peralatan kasir standar, dan serah terima kurir.",
    ogAlt: "Langkah pendaftaran mitra dan peralatan standar meja kasir agen paket GeraiExpress",
  },
  "/biaya-dan-paket": {
    crumb: "Biaya & Paket",
    titleStem: "Biaya Rp 0 & Komisi Diskon Ongkir Sampai 25%",
    description: "Buka loket kirim paket tanpa biaya pendaftaran: nikmati diskon ongkir mitra sampai 25%, halaman publik gratis, dan opsi domain toko sendiri (Pro).",
    ogAlt: "Skema biaya Rp 0 kemitraan loket, diskon ongkir mitra sampai 25%, dan paket domain Pro GeraiExpress",
  },
  "/simulasi-kasir": {
    crumb: "Simulasi Kasir",
    titleStem: "Simulasi Meja Kasir & Struk Agen Kirim Paket",
    description: "Simulasi interaktif meja kasir GeraiExpress dengan data contoh: hitung ongkir per gram atau kargo, pilih layanan COD, dan tinjau struk pelanggan loket.",
    ogAlt: "Simulasi meja kasir agen pengiriman paket dan contoh struk pelanggan GeraiExpress",
  },
  "/panduan": {
    crumb: "Panduan",
    titleStem: "Panduan Pakai Aplikasi Kasir Gerai Kirim Paket",
    description: "Panduan bergambar langkah demi langkah untuk pemilik gerai dan kasir: daftar, cek ongkir, buat kiriman, cetak resi, COD, serah ke kurir, hingga retur.",
    ogAlt: "Panduan bergambar memakai aplikasi kasir gerai kirim paket GeraiExpress langkah demi langkah",
  },
  "/tanya-jawab": {
    crumb: "Tanya Jawab",
    titleStem: "Tanya Jawab Syarat & Operasional Agen Paket",
    description: "Jawaban lengkap seputar syarat lokasi gerai, modal saldo kiriman, jadwal pencairan dana COD, penanganan paket retur, kiriman dropship, dan akses kasir.",
    ogAlt: "Tanya jawab syarat pendaftaran dan operasional harian agen pengiriman GeraiExpress",
  },
  "/hubungi-kami": {
    crumb: "Hubungi Kami",
    titleStem: "Hubungi Tim Kemitraan & Bantuan Agen Paket",
    description: "Saluran resmi tim GeraiExpress melalui email dan WhatsApp untuk konsultasi pendaftaran gerai mitra baru, kerja sama jaringan loket, serta bantuan teknis.",
    ogAlt: "Kontak resmi tim kemitraan gerai dan bantuan operasional agen paket GeraiExpress",
  },
  "/ketentuan": {
    crumb: "Ketentuan Layanan",
    titleStem: "Ketentuan Layanan Perangkat Lunak Gerai Mitra",
    description: "Ketentuan penggunaan platform kasir GeraiExpress bagi pemilik gerai mitra, mencakup peran pencatatan transaksi, kewajiban verifikasi paket, dan layanan.",
    ogAlt: "Ketentuan layanan penggunaan perangkat lunak kasir bagi gerai mitra GeraiExpress",
  },
  "/privasi": {
    crumb: "Kebijakan Privasi",
    titleStem: "Kebijakan Privasi & Pelindungan Data Kiriman",
    description: "Kebijakan pengolahan data pengirim dan penerima paket sesuai UU Pelindungan Data Pribadi, penyamaran kontak di halaman lacak publik, dan hak subjek data.",
    ogAlt: "Kebijakan privasi dan pelindungan data pribadi kiriman paket pada GeraiExpress",
  },
}

export const PRIMARY_NAV: Array<[string, string]> = [
  ["/fitur", "Fitur"],
  ["/ekspedisi", "Ekspedisi"],
  ["/cara-kerja", "Cara Kerja"],
  ["/biaya-dan-paket", "Biaya & Paket"],
  ["/simulasi-kasir", "Simulasi Kasir"],
]

/** Phone menu rows: every page a visitor may look for, with one short line of what is there. */
export const MENU_ROWS: Array<[string, string, string]> = [
  ["/fitur", "Fitur", "Kasir, cetak resi, retur & keuangan"],
  ["/ekspedisi", "Ekspedisi", "Sembilan kurir mitra, Reguler & Kargo"],
  ["/cara-kerja", "Cara Kerja", "Lima langkah daftar & peralatan loket"],
  ["/biaya-dan-paket", "Biaya & Paket", "Rp 0 daftar, diskon ongkir sampai 25%"],
  ["/simulasi-kasir", "Simulasi Kasir", "Hitung ongkir & struk tanpa login"],
  ["/panduan", "Panduan", "Langkah bergambar untuk pemilik & kasir"],
  ["/tanya-jawab", "Tanya Jawab", "Syarat lokasi, saldo, COD & retur"],
  ["/hubungi-kami", "Hubungi Kami", "Email & WhatsApp tim kemitraan"],
]

/**
 * Shared page script (every brand page, inline like the page demos; the apex sends no CSP).
 * (1) Phone menu: [Masuk] [menu ⇄ ×] opens a screen-aligned card; Escape, outside click, a menu link, `pageshow`
 * and widening past 960 px close it; `inert` + `aria-expanded` follow the state; focus moves in and back.
 * (2) Indonesian constraint validation safety net (DEC-247 §2.4): a form without `novalidate` never shows the
 * browser's English bubble; only messages this net set itself are cleared (on input, change and the next submit).
 */
export const SHELL_SCRIPT = `<script>
(function(){
  var d=document,b=d.getElementById("mnav-btn"),m=d.getElementById("mnav"),k=d.getElementById("mnav-dim"),h=d.querySelector(".hdr");
  if(!b||!m||!k||!h)return;
  function isO(){return b.getAttribute("aria-expanded")==="true"}
  function set(o,back){
    if(o)d.documentElement.style.setProperty("--hdr-b",Math.round(h.getBoundingClientRect().bottom)+"px");
    b.setAttribute("aria-expanded",o?"true":"false");
    b.setAttribute("aria-label",o?"Tutup menu navigasi":"Buka menu navigasi");
    if(o)m.removeAttribute("inert");else m.setAttribute("inert","");
    m.classList.toggle("open",o);k.classList.toggle("open",o);
    if(o)h.setAttribute("data-menu-open","");else h.removeAttribute("data-menu-open");
    d.documentElement.style.overflow=o?"hidden":"";
    if(o){var a=m.querySelector("a");if(a)a.focus({preventScroll:true})}else if(back)b.focus();
  }
  b.addEventListener("click",function(){set(!isO())});
  d.addEventListener("pointerdown",function(e){if(isO()&&!m.contains(e.target)&&!b.contains(e.target))set(false)});
  d.addEventListener("keydown",function(e){if(e.key==="Escape"&&isO()){e.preventDefault();set(false,true)}});
  m.addEventListener("click",function(e){if(e.target.closest("a"))set(false)});
  m.addEventListener("focusout",function(e){var t=e.relatedTarget;if(isO()&&t&&!m.contains(t)&&t!==b)set(false)});
  addEventListener("pageshow",function(){if(isO())set(false)});
  var mq=matchMedia("(min-width:960px)");
  if(mq.addEventListener)mq.addEventListener("change",function(e){if(e.matches&&isO())set(false)});
})();
(function(){
  var d=document,ours=new WeakSet(),wrapped=new WeakSet(),self=false;
  function isF(t){return t&&typeof t.setCustomValidity==="function"&&"validity" in t}
  function name(el){var l=el.labels&&el.labels[0];return((el.getAttribute("data-validity-label")||(l?l.textContent:"")||el.getAttribute("aria-label")||"").replace(/\\s+/g," ").replace(/[*:]+\\s*$/,"").trim()).slice(0,60)}
  function msg(el){
    var v=el.validity,k=el.tagName==="SELECT"?"select":el.tagName==="TEXTAREA"?"textarea":(el.type||"text"),n=name(el),x=n?" "+n:" ini";
    if(v.valueMissing){
      if(el.getAttribute("data-msg-missing"))return el.getAttribute("data-msg-missing");
      if(k==="checkbox")return"Centang kotak ini untuk melanjutkan.";
      if(k==="radio")return n?"Pilih salah satu "+n+".":"Pilih salah satu opsi.";
      if(k==="select")return n?"Pilih "+n+" terlebih dahulu.":"Pilih salah satu opsi terlebih dahulu.";
      return"Kolom"+x+" wajib diisi.";
    }
    var inv=el.getAttribute("data-msg-invalid");if(inv)return inv;
    if(v.badInput)return k==="number"?"Masukkan angka yang valid.":"Isian belum valid.";
    if(v.typeMismatch)return k==="email"?"Format email belum benar (contoh: nama@domain.com).":k==="url"?"Masukkan alamat URL lengkap (diawali https://).":"Format isian belum sesuai.";
    if(v.patternMismatch){var p=el.getAttribute("placeholder");return"Format"+x+" belum sesuai"+(p?" (contoh: "+p+")":"")+"."}
    if(v.tooLong)return"Maksimal "+el.maxLength+" karakter.";
    if(v.tooShort)return"Minimal "+el.minLength+" karakter.";
    if(v.rangeUnderflow)return"Nilai minimal "+el.min+".";
    if(v.rangeOverflow)return"Nilai maksimal "+el.max+".";
    if(v.stepMismatch)return"Masukkan kelipatan "+(el.step||"1")+".";
    return"Isian belum valid.";
  }
  // Ownership follows who called setCustomValidity (never the text): another caller, even with the same words, owns it.
  function put(el,s){if(!wrapped.has(el)){var n=el.setCustomValidity;el.setCustomValidity=function(m){if(!self)ours.delete(el);return n.call(el,m)};wrapped.add(el)}self=true;try{el.setCustomValidity(s)}finally{self=false}if(s)ours.add(el);else ours.delete(el)}
  function release(el){if(ours.has(el))put(el,"")}
  d.addEventListener("invalid",function(e){
    var el=e.target;if(!isF(el))return;
    if(el.validity.customError&&!ours.has(el))return;
    release(el);
    if(el.validity.valid){e.preventDefault();return}
    put(el,msg(el));
  },true);
  function edit(e){if(isF(e.target))release(e.target)}
  d.addEventListener("input",edit,true);d.addEventListener("change",edit,true);
  d.addEventListener("click",function(e){var t=e.target,btn=t&&t.closest?t.closest("button,input[type=submit]"):null;if(btn&&btn.form&&btn.type==="submit")[].forEach.call(btn.form.elements,function(x){if(isF(x))release(x)})},true);
})();
</script>`

/** Owner SEO convention: rendered `<title>` is 55–70 chars with ` - {Brand}` suffix. */
export function fitTitle(stem: string, brand: string): string {
  const suffix = ` - ${brand}`
  let s = stem.trim()
  if (s.length + suffix.length > 70) {
    const maxStem = Math.max(20, 70 - suffix.length)
    s = s.slice(0, maxStem).replace(/\s+\S*$/, "").trim()
  }
  let full = `${s}${suffix}`
  if (full.length < 55) {
    const pad = " untuk Loket Pengiriman"
    if (`${s}${pad}${suffix}`.length <= 70) full = `${s}${pad}${suffix}`
  }
  return full
}

function buildJsonLd(path: string, meta: BrandPageMeta, host: string, brand: string, legal: Legal | null): string {
  const origin = `https://${host}`
  const canonical = `${origin}${path === "/" ? "/" : path}`
  const org: Record<string, unknown> = {
    "@type": "Organization",
    "@id": `${origin}/#organization`,
    name: brand,
    url: `${origin}/`,
    logo: {
      "@type": "ImageObject",
      url: `${origin}/logo-192.png`,
      width: 192,
      height: 192,
    },
    ...(legal?.legal_name ? { legalName: legal.legal_name } : {}),
    ...(legal?.support_email ? { email: legal.support_email } : {}),
  }

  const graph: Array<Record<string, unknown>> = [org]
  if (path === "/") {
    graph.push(
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        name: brand,
        alternateName: ["Gerai Express", "Aplikasi Kasir GeraiExpress"],
        url: `${origin}/`,
        inLanguage: "id-ID",
        publisher: { "@id": `${origin}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        name: brand,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web, Windows, macOS, Android",
        description: meta.description,
        url: `${origin}/`,
        publisher: { "@id": `${origin}/#organization` },
      },
    )
  } else {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Beranda", item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: meta.crumb, item: canonical },
      ],
    })
  }
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")
}

export function renderShell(o: {
  path: string
  meta: BrandPageMeta
  host: string
  appOrigin: string
  legal: Legal | null
  body: string
  script?: string
  noindex?: boolean
}): string {
  const l = o.legal
  const brand = l?.brand_name || "GeraiExpress"
  const publisher = l?.legal_name || brand
  const title = fitTitle(o.meta.titleStem, brand)
  const canonical = `https://${o.host}${o.path === "/" ? "/" : o.path}`
  const ogImage = `https://${o.host}/og-geraiexpress.png`
  const legalLines = [
    l?.legal_name,
    l?.nib ? `NIB ${l.nib}` : null,
    l?.pse_registration_number ? `Terdaftar PSE ${l.pse_registration_number}` : null,
    l?.registered_address,
  ].filter(Boolean) as string[]

  const breadcrumbHtml =
    o.path === "/"
      ? ""
      : `<nav class="wrap crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Beranda</a></li><li aria-hidden="true">/</li><li aria-current="page">${e(o.meta.crumb)}</li></ol></nav>`

  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<script>document.documentElement.className="js"</script>
<title>${e(title)}</title>
<meta name="description" content="${e(o.meta.description)}">
<meta name="author" content="${e(brand)}">
<meta name="publisher" content="${e(publisher)}">
<link rel="canonical" href="${e(canonical)}">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
${o.noindex ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="max-image-preview:large">'}
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(o.meta.description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${e(canonical)}">
<meta property="og:site_name" content="${e(brand)}">
<meta property="og:locale" content="id_ID">
<meta property="og:image" content="${e(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${e(o.meta.ogAlt)}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${buildJsonLd(o.path, o.meta, o.host, brand, l)}</script>
<style>${BRAND_CSS}</style></head><body${o.path === "/" ? ' data-home="1"' : ""}>
<a class="skip" href="#konten-utama">Langsung ke isi utama</a>
<header class="hdr"><div class="wrap top">
<a class="brand" href="/" aria-label="${e(brand)}, by Mengantar, ke beranda"><img src="/logo.svg" alt="" width="44" height="26"><span class="brand-txt"><span class="brand-name">${e(brand)}</span><span class="brand-by">by Mengantar</span></span></a>
<nav class="dnav" aria-label="Menu utama">${PRIMARY_NAV.map(([h, t]) => `<a href="${h}"${o.path === h ? ' aria-current="page"' : ""}>${e(t)}</a>`).join("")}</nav>
<div class="hact">
<a class="login-lk" href="${e(o.appOrigin)}/masuk">Masuk</a>
<a class="cta sm" href="${e(o.appOrigin)}/daftar-akun">Daftar Gerai</a>
<a class="hround acct" href="${e(o.appOrigin)}/masuk" aria-label="Masuk ke ruang kerja" title="Masuk"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="6.6" r="3.1" stroke="currentColor" stroke-width="1.65"/><path d="M4.4 16.4C5.1 13.7 7.25 12.1 10 12.1C12.75 12.1 14.9 13.7 15.6 16.4" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/></svg></a>
<button type="button" id="mnav-btn" class="hround burger" aria-label="Buka menu navigasi" aria-expanded="false" aria-controls="mnav"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path class="bar bar-t" d="M4 7H16" stroke="currentColor" stroke-width="1.7" stroke-linecap="square"/><path class="bar bar-b" d="M4 13H16" stroke="currentColor" stroke-width="1.7" stroke-linecap="square"/></svg></button>
<a class="hround nojs-menu" href="#peta-situs" aria-label="Lihat semua halaman"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 7H16M4 13H16" stroke="currentColor" stroke-width="1.7" stroke-linecap="square"/></svg></a>
</div>
</div></header>
<div id="mnav-dim" class="mnav-dim" aria-hidden="true"></div>
<nav id="mnav" class="mnav" aria-label="Menu navigasi" inert>
<ul>${MENU_ROWS.map(([h, t, hint]) => `<li><a href="${h}"${o.path === h ? ' aria-current="page"' : ""}><span class="r-t"><span class="r-l">${e(t)}</span><span class="r-h">${e(hint)}</span></span><span class="r-m" aria-hidden="true"></span></a></li>`).join("")}</ul>
<div class="mnav-foot"><a class="cta" href="${e(o.appOrigin)}/daftar-akun">Daftar Gerai <span aria-hidden="true">→</span></a><a class="mnav-sec" href="${e(o.appOrigin)}/masuk">Sudah terdaftar? <b>Masuk ke ruang kerja</b></a></div>
</nav>
${breadcrumbHtml}
<main id="konten-utama">${o.body}</main>
<footer class="ftr"><div class="wrap">
<div class="fgrid">
<div class="fbrand"><a class="brand" href="/" aria-label="${e(brand)}, by Mengantar, ke beranda"><img src="/logo.svg" alt="" width="38" height="22"><span class="brand-txt"><span class="brand-name">${e(brand)}</span><span class="brand-by">by Mengantar</span></span></a>
<p class="fbrand-p">Perangkat lunak meja kasir, cetak resi thermal, dan rekonsiliasi saldo multi-ekspedisi untuk loket dan toko di seluruh Indonesia.</p></div>
<nav class="fcol" id="peta-situs" aria-labelledby="ft-produk"><h3 id="ft-produk">Produk &amp; Panduan</h3><ul>
<li><a href="/fitur">Fitur Meja Kasir</a></li>
<li><a href="/ekspedisi">Daftar Ekspedisi &amp; Kargo</a></li>
<li><a href="/cara-kerja">Cara Kerja &amp; Peralatan</a></li>
<li><a href="/biaya-dan-paket">Biaya &amp; Skema Mitra</a></li>
<li><a href="/simulasi-kasir">Simulasi Kasir Tanpa Login</a></li>
<li><a href="/panduan">Panduan Pakai Aplikasi</a></li>
</ul></nav>
<nav class="fcol" aria-labelledby="ft-bantuan"><h3 id="ft-bantuan">Bantuan &amp; Legal</h3><ul>
<li><a href="/tanya-jawab">Tanya Jawab Calon Mitra</a></li>
<li><a href="/hubungi-kami">Hubungi Kami</a></li>
<li><a href="/ketentuan">Ketentuan Layanan</a></li>
<li><a href="/privasi">Kebijakan Privasi (UU PDP)</a></li>
<li><a href="${e(o.appOrigin)}/daftar-akun">Daftar Gerai Baru</a></li>
<li><a href="${e(o.appOrigin)}/masuk">Masuk Mitra Terdaftar</a></li>
</ul></nav>
</div>
<div class="flegal">
${legalLines.length ? `<p style="margin:0">${legalLines.map(e).join(" · ")}</p>` : ""}
<p style="margin:0">© ${new Date().getUTCFullYear()} ${e(brand)}. Jaringan agen kirim paket multi-ekspedisi.</p>
</div>
</div></footer>${SHELL_SCRIPT}${o.script ?? ""}</body></html>`
}
