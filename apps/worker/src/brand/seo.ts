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
    titleStem: "Aplikasi Kasir Agen Kirim Paket Multi-Ekspedisi",
    description: "Perangkat lunak kasir untuk konter, fotokopi, dan agen ekspedisi: cek ongkir multi-kurir, cetak resi 100 mm, kelola COD, dan rekonsiliasi saldo otomatis.",
    ogAlt: "Aplikasi kasir agen kirim paket multi-ekspedisi GeraiExpress untuk loket dan toko",
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
    titleStem: "Biaya Pendaftaran & Skema Komisi Mitra Loket",
    description: "Skema kemitraan agen kirim paket yang transparan: tanpa sewa mesin khusus, komisi diskon ongkir per kurir, halaman publik gratis, dan opsi domain toko Pro.",
    ogAlt: "Skema biaya kemitraan loket, komisi diskon ongkir, dan paket domain toko GeraiExpress",
  },
  "/simulasi-kasir": {
    crumb: "Simulasi Kasir",
    titleStem: "Simulasi Meja Kasir & Struk Agen Kirim Paket",
    description: "Simulasi interaktif meja kasir GeraiExpress dengan data contoh: hitung ongkir per gram atau kargo, pilih layanan COD, dan tinjau struk pelanggan loket.",
    ogAlt: "Simulasi meja kasir agen pengiriman paket dan pratinjau struk pelanggan GeraiExpress",
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
<nav class="dnav" aria-label="Menu utama">${PRIMARY_NAV.map(([h, t]) => `<a href="${h}"${o.path === h ? ' aria-current="page"' : ""}>${t}</a>`).join("")}</nav>
<div class="hact">
<a class="login-lk" href="${e(o.appOrigin)}/masuk">Masuk</a>
<a class="cta sm" href="${e(o.appOrigin)}/daftar-akun">Daftar Gerai</a>
<details class="mnav"><summary aria-label="Buka menu navigasi">Menu</summary><nav class="mnav-panel" aria-label="Menu seluler">${PRIMARY_NAV.map(([h, t]) => `<a href="${h}"${o.path === h ? ' aria-current="page"' : ""}>${t}</a>`).join("")}<a href="/tanya-jawab"${o.path === "/tanya-jawab" ? ' aria-current="page"' : ""}>Tanya Jawab</a><a href="/hubungi-kami"${o.path === "/hubungi-kami" ? ' aria-current="page"' : ""}>Hubungi Kami</a><a href="${e(o.appOrigin)}/masuk">Masuk ke Ruang Kerja</a></nav></details>
</div>
</div></header>
${breadcrumbHtml}
<main id="konten-utama">${o.body}</main>
<footer class="ftr"><div class="wrap">
<div class="fgrid">
<div><a class="brand" href="/" style="margin-bottom:8px" aria-label="${e(brand)}, by Mengantar, ke beranda"><img src="/logo.svg" alt="" width="38" height="22"><span class="brand-txt"><span class="brand-name">${e(brand)}</span><span class="brand-by">by Mengantar</span></span></a>
<p style="margin:0;max-width:44ch">Perangkat lunak meja kasir, cetak resi thermal, dan rekonsiliasi saldo multi-ekspedisi untuk loket dan toko di seluruh Indonesia.</p></div>
<div class="fcol"><h3>Produk &amp; Panduan</h3><ul>
<li><a href="/fitur">Fitur Meja Kasir</a></li>
<li><a href="/ekspedisi">Daftar Ekspedisi &amp; Kargo</a></li>
<li><a href="/cara-kerja">Cara Kerja &amp; Peralatan</a></li>
<li><a href="/biaya-dan-paket">Biaya &amp; Skema Mitra</a></li>
<li><a href="/simulasi-kasir">Simulasi Kasir Tanpa Login</a></li>
</ul></div>
<div class="fcol"><h3>Bantuan &amp; Legal</h3><ul>
<li><a href="/tanya-jawab">Tanya Jawab Calon Mitra</a></li>
<li><a href="/hubungi-kami">Hubungi Kami</a></li>
<li><a href="/ketentuan">Ketentuan Layanan</a></li>
<li><a href="/privasi">Kebijakan Privasi (UU PDP)</a></li>
<li><a href="${e(o.appOrigin)}/masuk">Masuk Mitra Terdaftar</a></li>
</ul></div>
</div>
<div class="flegal">
${legalLines.length ? `<p style="margin:0">${legalLines.map(e).join(" · ")}</p>` : ""}
<p style="margin:0">© ${new Date().getUTCFullYear()} ${e(brand)}. Jaringan agen kirim paket multi-ekspedisi.</p>
</div>
</div></footer>${o.script ?? ""}</body></html>`
}
