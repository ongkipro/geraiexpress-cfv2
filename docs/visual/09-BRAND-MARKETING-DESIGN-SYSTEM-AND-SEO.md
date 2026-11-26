# 09 — Brand Marketing Website Design System & Multi-Page SEO Architecture (`geraiexpress.com`)

**Surface:** Public B2B Partner Acquisition & Product Marketing Site (`https://geraiexpress.com`, `301` from `www.geraiexpress.com`)  
**Audience:** Pemilik usaha loket fisik di Indonesia (usia 30–55+ tahun) — konter pulsa & aksesoris HP, fotokopi & ATK, toko kelontong, agen PPOB, koperasi, dan ruko jasa yang ingin membuka layanan kirim paket multi-ekspedisi tanpa sewa mesin khusus.  
**Runtime:** Cloudflare Workers SSR (`apps/worker/src/brand/`), zero client UI framework, zero cookies (`Set-Cookie` tidak pernah dikirim di apex domain sesuai `ADR-0002`), `< 35 KB` HTML + CSS per halaman, dengan panggung **Three.js 3D Studio Motion Diorama** (`/three.min.js` + `/hero-studio-3d.min.js`, *same-origin*, *deferred*, otomatis jeda saat di luar layar) pada Hero Beranda serta kalkulator sintetis pada `/` dan `/simulasi-kasir`.

---

## 1. Prinsip Desain & Psikologi Konversi Loket

1. **Kejelasan Operasional di Atas Slogan:** Pemilik toko fisik tidak mencari kata-kata abstrak (*"solusi logistik masa depan"*). Dalam 5 detik pertama mereka ingin menjawab tiga pertanyaan:
   - *Apa gunanya untuk toko saya?* (Satu meja kasir untuk banyak ekspedisi Reguler, Kargo, dan COD.)
   - *Apakah alat saya yang sekarang bisa dipakai?* (HP Android/laptop yang sudah ada + timbangan digital + printer thermal biasa 100 mm atau 58 mm.)
   - *Bagaimana uang dan komisi saya dihitung?* (Struk pelanggan jujur sesuai tarif publik, saldo Mengantar terekonsiliasi otomatis sampai rupiah terakhir, dan halaman publik `<namatoko>.geraimitra.com` gratis.)
2. **Bukti Produk Nyata Tanpa Klaim Karangan (Zero AI-Slop):**
   - **Dilarang keras:** angka klaim tanpa basis data (*"5.000+ agen aktif"*), testimoni fiktif, bilah persentase karangan, ikon dekoratif kilau (`Sparkles`), gradasi pastel murahan, atau tombol WhatsApp hijau mengambang di setiap sudut layar.
   - **Bukti yang ditampilkan:** antarmuka interaktif nyata (**Kalkulator Tarif & Struk Loket Langsung** di Beranda dan `/simulasi-kasir`), anatomi **Label Thermal 100 mm & Struk 58 mm**, skema **Penyamaran Dropshipper 3-Pihak**, serta tabel **9 Ekspedisi Mitra Mengantar & Aturan Kargo/COD** yang faktual sesuai integrasi Mengantar v2.0.0.
3. **Transisi Ruang Bersih:** Antar-seksi dipisahkan oleh ruang kosong (*whitespace*) dan pergantian warna latar (`#FFFFFF` ↔ `#F5F8FC` ↔ `#071A4A`), bukan garis `<hr>` berulang di atas dan bawah seksi.
4. **Disiplin Saluran Kontak:** Paling banyak **satu** tombol kontak WhatsApp sekunder bermonokrom pada halaman `/hubungi-kami` setelah informasi kontak selesai dibaca; header, hero, dan bilah mengambang bebas dari spam tombol chat.

---

## 2. Sistem Token Visual (Brand Design System)

> **DEC-247 (2026-11-18):** pita penutup gelap `#061B52`, garis tepi kartu `--gx-line`, kartu bertepi dan navigasi
> `<details>` di ponsel **digantikan** oleh sistem *Borderless White-Gallery* di §6. Token di bawah tetap berlaku
> untuk warna merek (`--gx-navy`, `--gx-action`), tipografi dan aset; aturan permukaan dan komposisi mengikuti §6.

Palet diturunkan langsung dari vektor logo resmi **GeraiExpress (`GE`)** dan dijaga selaras dengan ruang kerja aplikasi (`#2E47BA` / `#203551`), serta telah teruji kontras **WCAG 2.1 AA/AAA**.

### 2.1 Warna & Kontras Permukaan

| Token CSS | Nilai Hex | Kontras di `#FFFFFF` | Peran Semantik |
| --- | --- | --- | --- |
| `--gx-navy` | `#012676` | **14.5 : 1** (AAA) | Huruf `G` pada logo, judul utama (`h1`, `h2`), angka metrik utama, latar pita penutup gelap (`#061B52`). |
| `--gx-action` | `#0B4FE3` | **6.4 : 1** (AA) | Tombol aksi utama (`Daftar Gerai`), tautan teks aktif, garis aksen tab/langkah. |
| `--gx-action-hover` | `#083CB3` | **9.1 : 1** (AAA) | Status `:hover` dan `:active` tombol utama. |
| `--gx-electric` | `#0060FE` | **5.0 : 1** (AA) | Garis tiga bilah `E` pada logo, lencana sorotan non-teks kecil, tepi kartu aktif. |
| `--gx-swoosh` | `#00A6FE` | *Grafis saja* | Busur kecepatan pada logo & aksen garis dekoratif di atas latar gelap `#061B52` (**tidak pernah** dipakai untuk teks di atas putih). |
| `--gx-ink` | `#162844` | **14.6 : 1** (AAA) | Teks paragraf utama dan isi tabel. |
| `--gx-muted` | `#4A5B75` | **6.8 : 1** (AAA/AA) | Teks penjelas sekunder, keterangan tabel, breadcrumb non-aktif. |
| `--gx-canvas` | `#FFFFFF` | — | Latar utama halaman dan kartu di atas pita abu-abu. |
| `--gx-band` | `#F5F8FC` | — | Latar seksi bergantian (*alternating section shift*) dan panel formulir simulasi. |
| `--gx-tint` | `#EBF2FF` | — | Latar penanda halus (*step number*, sorotan baris kurir terpilih). |
| `--gx-line` | `#DCE4F0` | — | Garis tepi kartu (`1px solid`), tabel, dan kotak struk. |
| `--gx-safe` | `#0F6E43` | **6.2 : 1** (AA) | Penanda fitur tersedia / label *Termurah* (`#ECFDF5` latar). |

### 2.2 Tipografi & Skala Ukuran Nyaman Baca (Usia 30–55+)

- **Font Utama (0 KB unduhan font eksternal, LCP instan):**  
  `-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
- **Font Monospace (khusus kode `INV`, nomor resi, angka struk thermal):**  
  `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` (`font-variant-numeric: tabular-nums`)
- **Skala Responsif (`rem` + `vw`, tidak pernah mengunci zoom browser):**
  - `Hero H1`: `clamp(2rem, 1.35rem + 2.5vw, 2.95rem)` (`32px` ponsel → `47px` desktop), `font-weight: 750`, `line-height: 1.12`, `letter-spacing: -0.02em`, `text-wrap: balance`.
  - `Subpage H1`: `clamp(1.8rem, 1.3rem + 2vw, 2.5rem)` (`29px` → `40px`), `line-height: 1.15`, `letter-spacing: -0.02em`.
  - `Section H2`: `clamp(1.45rem, 1.15rem + 1.2vw, 1.95rem)` (`23px` → `31px`), `font-weight: 700`, `line-height: 1.22`, `letter-spacing: -0.015em`.
  - `Card / Feature H3`: `1.125rem` (`18px`), `font-weight: 650`, `line-height: 1.35`.
  - `Body Prose`: `1.0625rem` (`17px`), `line-height: 1.62`, panjang baris baca `62–70ch`.
  - `Table / Nav / Secondary`: `0.9375rem` (`15px`), `line-height: 1.5`.
  - `Caption / Label Kecil`: `0.8125rem` (`13px`, batas bawah mutlak `>= 12px`).

### 2.3 Bentuk, Kontainer, Ikon & Gerak

- **Radius Sudut:** `8px` (`--r-sm`) untuk tombol dan input; `12px` (`--r-md`) untuk panel fitur, kartu simulasi, dan pratinjau struk/label. Satu tingkat kontainer saja (tanpa kartu di dalam kartu).
- **Target Sentuh:** Seluruh tombol, tautan navigasi, pemilih kota/berat, dan akordion FAQ memiliki tinggi minimal **`44px`** (`48px` untuk tombol CTA utama dan input formulir).
- **Ikon:** Inline SVG murni dari set Lucide (`width="20" height="20" stroke-width="1.75" fill="none" stroke="currentColor" aria-hidden="true"`), hanya untuk penanda fungsi domain nyata (*timbangan, truk kurir, printer thermal, perisai verifikasi, buku kas, kode QR*).
- **Aset Merek & Favicon:**
  - `/logo.svg` (`1044×618`, vektor 3 warna transparan) di header & halaman autentikasi.
  - `/favicon.ico` (`48×48` multi-size ICO untuk Google Search) + `/favicon.svg` (tile putih vektor tajam untuk tab browser) + `/apple-touch-icon.png` (`180×180`) + `/logo-192.png` (`192×192` raster PNG untuk JSON-LD `Organization.logo` ≥ 112 px) + `/og-geraiexpress.png` (`1200×630` kartu pratinjau Open Graph).

---

## 3. Arsitektur Informasi Multi-Halaman & Strategi SEO

Setiap topik pencarian calon pemilik gerai dipetakan ke **satu URL kanonis tersendiri** (bukan satu halaman panjang yang mencampur semua topik), sehingga Google mengindeks masing-masing halaman untuk kata kunci berintensi spesifik.

### 3.1 Peta Situs (`11` Rute Publik Kanonis pada `geraiexpress.com`)

| URL Slug | Peran di Navigasi | Target Intensi Pencarian (SEO) | Judul `<title>` (55–70 karakter) |
| --- | --- | --- | --- |
| `/` | Logo / Beranda | Agen ekspedisi multi kurir, aplikasi kasir loket paket | `Aplikasi Kasir Agen Kirim Paket Multi-Ekspedisi - GeraiExpress` (62) |
| `/fitur` | Menu Utama | Fitur software kasir agen pengiriman, manajemen retur & COD | `Fitur Kasir Loket, Cetak Resi & Keuangan Agen - GeraiExpress` (60) |
| `/ekspedisi` | Menu Utama | Daftar kurir yang didukung, aturan COD, kargo ≥ 5 kg | `Daftar Ekspedisi Reguler, Kargo & Layanan COD - GeraiExpress` (60) |
| `/cara-kerja` | Menu Utama | Cara daftar agen paket modal kecil, syarat alat loket | `Cara Daftar & Peralatan Buka Loket Kirim Paket - GeraiExpress` (61) |
| `/biaya-dan-paket` | Menu Utama | Biaya buka agen ekspedisi, komisi ongkir, website nama toko | `Biaya Pendaftaran & Skema Komisi Mitra Loket - GeraiExpress` (59) |
| `/simulasi-kasir` | Menu Utama (Aksen) | Coba aplikasi kasir pengiriman tanpa login, contoh struk | `Simulasi Meja Kasir & Struk Agen Kirim Paket - GeraiExpress` (59) |
| `/panduan` | Menu Ponsel & Footer | Cara pakai aplikasi kasir agen paket, cara cetak resi, cara kirim COD (§7) | `Panduan Pakai Aplikasi Kasir Gerai Kirim Paket - GeraiExpress` (61) |
| `/tanya-jawab` | Tautan Konteks & Footer | FAQ syarat ruko/rumah, pencairan COD, dropship, klaim | `Tanya Jawab Syarat & Operasional Agen Paket - GeraiExpress` (58) |
| `/hubungi-kami` | Menu Bawah & CTA Konteks | Kontak resmi pendaftaran mitra & bantuan teknis | `Hubungi Tim Kemitraan & Bantuan Agen Paket - GeraiExpress` (57) |
| `/ketentuan` | Tautan Bawah (Legal) | Ketentuan layanan perangkat lunak gerai mitra | `Ketentuan Layanan Perangkat Lunak Gerai Mitra - GeraiExpress` (60) |
| `/privasi` | Tautan Bawah (Legal) | Kebijakan privasi & kepatuhan UU PDP No. 27 Tahun 2022 | `Kebijakan Privasi & Pelindungan Data Kiriman - GeraiExpress` (59) |

### 3.2 Kontrak Teknis SEO per Halaman (`seo-website-builder` Compliant)

1. **`<title>` & `<h1>` Selaras:** `<title>` wajib `55–70` karakter dengan pemisah ` - ` (tidak pernah `|` atau `—`). Kata kunci pembuka pada `<h1>` selaras dengan awal `<title>` agar Google mempertahankan judul halaman di SERP.
2. **`<meta name="description">`:** Wajib unik per halaman, `120–155` karakter termasuk spasi, diakhiri tanda titik (`.`), merangkum isi faktual halaman tanpa kalimat desakan iklan berlebihan.
3. **Canonical & Host:** `www.geraiexpress.com/*` dialihkan permanen (`301`) ke `https://geraiexpress.com/*`. Setiap halaman memasang `<link rel="canonical" href="https://geraiexpress.com/...">` mandiri tanpa parameter atau fragmen `#`. Pada lingkungan `staging`, dipasang `<meta name="robots" content="noindex">`.
4. **Open Graph, Author & Publisher:**
   - `<meta name="author" content="GeraiExpress">` & `<meta name="publisher" content="...">` (menggunakan `legal_name` jika sudah diisi di Super Admin, atau `GeraiExpress`).
   - `og:title`, `og:description`, `og:type="website"`, `og:url` (= canonical), `og:site_name="GeraiExpress"`, `og:locale="id_ID"`, `og:image="https://geraiexpress.com/og-geraiexpress.png"`, `og:image:width="1200"`, `og:image:height="630"`, `og:image:alt` deskriptif, dan `twitter:card="summary_large_image"`.
5. **Structured Data (`application/ld+json` dengan `<` di-escape `\u003c`):**
   - **Beranda (`/`):** `@graph` berisi `Organization` (dengan `name`, `url`, `logo` raster `https://geraiexpress.com/logo-192.png`, `legalName` & `email` bila terisi di `platform_legal_profile`), `WebSite` (khusus beranda), dan `SoftwareApplication` (`applicationCategory: "BusinessApplication"`, `operatingSystem: "Web, Windows, macOS, Android"`).
   - **Seluruh Sub-halaman (`/fitur`, `/ekspedisi`, dst.):** `Organization` + **`BreadcrumbList`** yang sama persis dengan elemen navigasi **`<nav aria-label="Breadcrumb">`** yang tampak di atas `<h1>` (`Beranda › Nama Halaman`). *(Catatan: Schema `FAQPage` tidak dipasang karena Google menghentikan tampilan rich result FAQ untuk situs komersial umum sejak Mei 2026; fokus pada struktur `<details>`/`<h3>` yang bersih untuk pembaca dan cuplikan organik.)*
6. **Silo Tautan Internal (*Internal Linking*):**
   - Beranda menaut secara kontekstual ke `/simulasi-kasir`, `/fitur`, `/ekspedisi`, `/cara-kerja`, `/biaya-dan-paket`, dan `/tanya-jawab`.
   - Setiap sub-halaman memiliki pita langkah lanjut (*"Langkah berikutnya"*) ke halaman pendamping logis (mis. `/fitur` → `/ekspedisi` & `/simulasi-kasir`; `/cara-kerja` → `/biaya-dan-paket` & `Daftar Gerai`).

---

## 4. Tata Letak Komponen & Wireframe Halaman Utama

### 4.1 Header Global, Breadcrumb Sub-Halaman, dan Footer Legal

- **Header (`68px` desktop / `64px` ponsel, `position: fixed` *frosted glass* `rgba(255,255,255,0.72)` + `backdrop-filter: blur(20px) saturate(180%)` tanpa garis tepi keras):**
  - Mengambang mulus di atas panggung 3D `100svh` dan tetap transparan kabur saat halaman di-scroll.
  - Seluruh transisi antar-seksi (Hero → Ringkasan & Kalkulator → Keunggulan → Ekspedisi & Alat → Pita Navy → Footer) murni memakai pergantian warna latar dan ruang napas (*zero horizontal border/rule lines*).
  - Kiri: Logo SVG `GE` (`/logo.svg`) + teks merek **GeraiExpress**.
  - Tengah (Desktop ≥ 920px): `Fitur` · `Ekspedisi` · `Cara Kerja` · `Biaya & Paket` · `Simulasi Kasir`.
  - Kanan: tautan teks `Masuk` (`app.geraiexpress.com/masuk`) + satu tombol utama `Daftar Gerai` (`app.geraiexpress.com/daftar-akun`).
  - Ponsel (`< 920px`): Logo + tombol `Daftar Gerai` ringkas + tombol `<details>`/`button` `Menu` tanpa bergantung pada framework berat.

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [GE] GeraiExpress    Fitur   Ekspedisi   Cara Kerja   Biaya & Paket   Simulasi Kasir   Masuk [Daftar]│
│  #stageWrapper — PANGGUNG 3D STUDIO MOTION MURNI 100SVH (Tanpa Blok Copywriting di Dalam Panggung)   │
│                                                                                                      │
│  ┌─ #spatialCallout ─────────────────┐                              ┌─ .stage-pill (Desktop) ───────┐│
│  │ 04 • KIRIM & UNTUNG  Diskon Mitra │     [3D HUB GERAI EXPRESS]   │ ● Diskon kirim mitra (akun)   ││
│  │ Jangkau Seluruh Indonesia         │      + Karakter & Konveyor   └───────────────────────────────┘│
│  └───────────────────────────────────┘                                                               │
│                                      Peta 3D Nusantara Sabang—Merauke                                │
│                      [ ⏸ │  01 Daftar  │ 02 Tinjau │  03 Gerai  │  04 Untung  ]                      │
│  SEKSI 1 (AFTER-HERO, Latar #FFFFFF, Tanpa Garis Pembatas)                                           │
│  Aplikasi kasir agen kirim paket multi-ekspedisi    ┌─ PRATINJAU CEK TARIF LOKET (Data Contoh) ────┐ │
│  [ Daftar Gerai ]   [ Coba Simulasi Kasir ]         │ Coblong, Bandung · Reguler 1 kg vs Kargo 12kg│ │
│  ✓ Tanpa sewa mesin   ✓ Gratis geraimitra.com       └──────────────────────────────────────────────┘ │
│  SEKSI 2 — ENAM KEUNGGULAN MEJA LOKET (Latar #F5F8FC)                                                │
│  ┌──────────────────────────────┐ ┌──────────────────────────────┐ ┌──────────────────────────────┐  │
│  │ Struk Pelanggan Jujur        │ │ Cetak Thermal 100 mm & 58 mm │ │ Kirim Atas Nama Olshop       │  │
│  │ Tarif publik tercetak rapi;  │ │ Label barcode resi dari PC   │ │ Penyamaran pengirim 3-pihak; │  │
│  │ kasir tidak melihat modal.   │ │ atau struk Bluetooth ponsel. │ │ paket retur tetap ke gerai.  │  │
│  └──────────────────────────────┘ └──────────────────────────────┘ └──────────────────────────────┘  │
│  ┌──────────────────────────────┐ ┌──────────────────────────────┐ ┌──────────────────────────────┐  │
│  │ Rekonsiliasi Dua Buku Kas    │ │ Pickup & Meja Retur Tertib   │ │ Halaman Publik Gerai Gratis  │  │
│  │ Kas loket vs mutasi tagihan  │ │ Cegah salah serah kurir &    │ │ namatoko.geraimitra.com siap │  │
│  │ Mengantar cocok per resi.    │ │ pengirim ambil pakai PIN WA. │ │ sebar ke grup WhatsApp warga.│  │
│  └──────────────────────────────┘ └──────────────────────────────┘ └──────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  SEKSI 3 — PRATINJAU CEK TARIF LOKET & PERALATAN YANG SUDAH ADA (Latar #FFFFFF, 2 Kolom)             │
│  • Kalkulator cepat Reguler 1.000 g vs Kargo 12.000 g (Bandung, Jakarta, Surabaya) -> /simulasi-kasir│
│  • Daftar alat standar toko (HP/Laptop + Timbangan Digital + Printer Thermal) -> ke /cara-kerja      │
├──────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  SEKSI 4 — PITA PENUTUP (Latar #061B52 Navy)                                                         │
│  Siap membuka layanan kirim paket di toko Anda?        [ Daftar Gerai ]  [ Lihat Biaya & Paket ]     │
├──────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  FOOTER LEGAL DINAMIS (`platform_legal_profile` DEC-218)                                             │
│  Produk: Fitur · Ekspedisi · Cara Kerja · Biaya & Paket · Simulasi Kasir                             │
│  Bantuan & Legal: Tanya Jawab · Hubungi Kami · Ketentuan Layanan · Kebijakan Privasi                 │
│  Baris identitas badan hukum (hanya merender kolom yang sudah terisi di Super Admin, NULL disembunyi)│
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Rincian Isi Tiap Sub-Halaman

1. **`/fitur` — Modul Operasional Lengkap:**
   - Membedah 6 alur kerja nyata aplikasi v2: (1) Kasir Satu Layar 60/40 & Cek Ongkir Cepat, (2) Kiriman COD & Perlindungan Batas Nilai Barang, (3) Unggah Paket Massal CSV 200 Baris, (4) Pickup per Kurir & Surat Jalan Digital, (5) Meja Retur dengan Kode Ambil Pengirim, (6) Keuangan Dua Buku, Saldo Aman & Pemisahan Peran Kasir vs Pemilik.
   - Dilengkapi pratinjau anatomi **Label 100×150 mm dengan Potongan Struk** dan **Halaman Publik `<slug>.geraimitra.com`**.
2. **`/ekspedisi` — Direktori Kurir & Aturan Layanan:**
   - Tabel terstruktur ekspedisi jaringan Mengantar: **J&T Express** (`EZ`, `J&T Eco` di sebagian rute), **JNE** (`REG`, `JNE Cargo`), **SiCepat** (`REG`, `SiCepat Cargo`), **SAP Express** (`REG`, `SAP Cargo`), **Lion Parcel** (`REGPACK`), **iDexpress** (`STD`, `iDexpress Cargo`), **Anteraja**, **Pos Indonesia**, dan **SPX Express** — hanya layanan aktif di katalog kurir (`courier_service_catalog`); Kargo selalu Non-COD (DEC-245).
   - Penjelasan jujur aturan lapangan: perhitungan berat aktual vs volumetrik (`P×L×T`; pembagi `4.000` untuk JNE Reguler dan iDexpress Cargo, `6.000` untuk layanan lain), layanan Kargo mulai `5 kg` (Non-COD), batas nilai COD per kurir, serta aturan barang berbahaya (*Dangerous Goods* seperti baterai/cairan hanya pada kurir yang mendukung).
3. **`/cara-kerja` — Alur Pendaftaran & Panduan Peralatan Meja Kasir:**
   - 5 langkah berurutan dari pengajuan titik jemput → verifikasi & pembuatan akun seller Mengantar otomatis → pengaturan webhook & saldo Non-COD → penerimaan paket pelanggan (datang langsung atau pindai QR dari rumah) → serah terima pickup sore & pencairan COD.
   - Tabel spesifikasi alat toko tanpa *vendor lock-in*: perangkat hitung, timbangan meja 30–50 kg, printer USB/LAN 100 mm (disarankan) atau Bluetooth 58 mm, serta pemindai QR kamera/USB opsional.
4. **`/biaya-dan-paket` — Transparansi Biaya & Skema Komisi Mitra:**
   - Perbandingan jujur **Kemitraan Standar Gerai (Rp 0 biaya pendaftaran software)** vs **Opsi Domain Sendiri (Pro)** untuk gerai mapan yang ingin memakai domain `.com`/`.id` milik sendiri dengan SSL otomatis Cloudflare. Kunci API & konektor MCP termasuk paket Standar (tidak dibatasi Pro).
   - Simulasi contoh hitungan margin loket yang jujur: pelanggan membayar tarif publik resmi pada struk, sementara gerai memperoleh selisih diskon mitra yang ditetapkan GeraiExpress per gerai dan diterapkan tim Mengantar pada akun gerai (DEC-230/233). Halaman publik tidak menampilkan persentase diskon tetap.
5. **`/simulasi-kasir` — Sandbox Meja Kasir Interaktif Tanpa Login:**
   - Formulir kiri: Kota Tujuan, Berat (gram, tombol cepat `1 kg`, `3 kg`, `12 kg Kargo`), Jenis Kiriman (`Non-COD` vs `COD`), Cara Bayar Loket (`Tunai`, `QRIS Gerai`, `Transfer`), dan Opsi Packing Tambahan.
   - Panel kanan ganda: daftar pilihan ekspedisi terurut otomatis dengan penanda *Termurah* + pratinjau berdampingan **`#struk` (Struk Pelanggan 58 mm)** dan **Label Resi Thermal 100 mm (`INV DEMO...`)** yang langsung berubah saat ekspedisi diklik. Mempertahankan penuh kompatibilitas E2E (`#struk`, label `Berat (gram)`, tombol `Pilih J&T Express ...`).
6. **`/tanya-jawab` — Pusat Jawaban Calon Mitra:**
   - Dikelompokkan menjadi 3 bagian (*Pendaftaran & Lokasi*, *Saldo, Komisi & COD*, *Operasional Harian, Retur & Kasir*) menggunakan elemen `<details>` aksesibel yang ringan dan ramah pembaca layar.
7. **`/hubungi-kami`, `/ketentuan`, `/privasi`:**
   - Membaca data resmi `platform_legal_profile` dari D1 secara dinamis (nama PT, NIB, PSE, alamat terdaftar, email bantuan, email privasi, dan nomor WhatsApp resmi bila sudah diisi oleh Super Admin).

---

## 5. Daftar Periksa Kepatuhan Kualitas (`Gate Checklist`)

- [x] **Zero Cookies di Apex:** `geraiexpress.com` tidak pernah membaca atau menulis `Set-Cookie` walaupun browser mengirim cookie sesi `app.`.
- [x] **11/11 Halaman Lulus `check-page.mjs`:** `0 fail, 0 warn` — panjang `<title>` `55–70` karakter, `meta description` `120–155` karakter berakhiran titik, `canonical` absolut `https://`, `og:image` + `og:image:alt`, `Organization` + `BreadcrumbList` valid dengan `<nav aria-label="Breadcrumb">` terlihat.
- [x] **Zero Overflow & Kenyamanan Baca (`dotuiux`):** `horizontalOverflowPx === 0` pada `1440×900` dan `390×844`, target sentuh `>= 44px`, kontras teks lulus WCAG AA, nol ikon dekoratif `Sparkles`.
- [x] **Kompatibilitas Penuh Tes Otomatis:** `apps/worker/test/brand/brand.test.ts` dan `e2e/brand.spec.ts` hijau 100%.

---

## 6. DEC-247 — *Borderless White-Gallery* (berlaku untuk 11 halaman `geraiexpress.com` dan mini-site)

Diadaptasi dari sistem `adsbook.id` (referensi baca-saja) ke identitas loket GeraiExpress.

### 6.1 Token permukaan

| Token | Nilai | Peran |
| --- | --- | --- |
| `--bg-page` | `#FFFFFF` | Kanvas dari atas sampai sebelum footer, satu galeri terang (tanpa pita gelap). |
| `--bg-tile` | `#F4F6FA` | Satu-satunya permukaan lembut: tile bento, alas (*pedestal*) screenshot, panel harga, kolom GeraiExpress di perbandingan, panggung penutup, footer. **Tanpa garis tepi.** Radius `24px` (tile kurir `16px`). |
| `--bg-float` | `#FFFFFF` + `--shadow-float: 0 20px 50px -12px rgba(15,23,42,.08), 0 2px 6px -1px rgba(15,23,42,.04)` | Artefak UI sintetis yang "melayang" di atas tile (satu per tile). |
| `--hairline` | `1px solid rgba(15,23,42,.07)` | Hanya baris terbuka (perbandingan, FAQ) dan garis atas footer — tidak pernah kotak empat sisi. |
| Tinta | `#0F172A` / `#012676` judul, `#475569` isi, `#94A3B8` redup | 90 % netral. |
| Sinyal merek | `#0B4FE3` (hover `#083CB3`, tint `#EFF6FF`) | Hanya CTA utama, status aktif/terpilih, kolom pemenang. Tanpa pil warna-warni. |

### 6.2 Komposisi

- **Header tunggal** di semua halaman (beku-kaca di atas hero 3D `100svh` yang tetap dipertahankan). Desktop `≥ 960px`: grid `1fr auto 1fr` (logo tanpa bingkai + `by Mengantar` · nav tengah bergaris bawah tanpa lompatan tebal · `Masuk` + pil `Daftar Gerai`). Ponsel `< 960px`: urutan jempol `[ikon Masuk 44×44]` lalu `[menu dua bilah ⇄ ×, 44×44]` membuka kartu dropdown beku-kaca selebar layar (`left/right 1rem`, maks `440px`, bilah aksen `2px`, latar diredupkan, tutup dengan `Escape`/klik di luar, `inert`), tiap item dengan petunjuk satu baris, pil `Daftar Gerai →` dan tautan `Sudah terdaftar? Masuk ke ruang kerja`.
- **Bebas *AI slop*:** tanpa pil *eyebrow* di atas seksi di bawah hero; seksi dibuka `h2` rapat (`letter-spacing -0.028em`, `line-height 1.12`, maks `24ch`) + satu kalimat (`#475569`, maks `54ch`), jarak `72–96px`; tanpa tautan `Pelajari … →` di ujung tile; tanpa kartu-di-dalam-kartu; tanpa ikon di kotak berwarna.
- **Beranda (DEC-249, owner 2026-11-19; ramping ≤ 6.300 px di 1440 — batas dinaikkan dari 6.200 saat daftar fitur paket dikembalikan):** hero studio 3D `100svh` **tidak diubah sama sekali** (markup sama byte demi byte, dikunci hash di `brand.test.ts`) → `#ringkasan` (`h1` + CTA, panggung `Tinjau Tarif Loket` 5 kecamatan Reguler/Kargo) → **marquee kurir tanpa henti** (9 logo, jalur kedua `aria-hidden`, tepi memudar `mask-image`, berhenti saat `:hover`/`:focus-within`, bungkus statis di `prefers-reduced-motion`) → **seksi Raka** `5fr / 7fr` (render 3D `/loket-mitra-3d.webp` dari rig Three.js hero sendiri — karakter mitra, kios `GE GERAI EXPRESS MITRA`, printer label thermal `AWB 100×150 mm`, timbangan `1.000 g`, paket kraft, bayangan studio — dengan dua pil putih mengambang `Timbangan · 1.000 g` dan `Label 100×150 mm · Siap Tempel` serta keterangan *Ilustrasi 3D meja loket mitra GeraiExpress.*; gerak `gx-float` hanya saat terlihat via `IntersectionObserver`, diam di reduced motion; kanan `h2` *Ubah tokomu jadi titik kirim paket warga & penjual online sekitar*, lead, 8 pil jenis toko) → bento `01`–`06` → screenshot kasir (WebP) → **pilihan kemitraan ringkas** (radio + panel dengan daftar fitur rapat) + tautan `Lihat tabel perbandingan & skema komisi →` → 5 FAQ garis rambut (tertutup) → penutup. Showcase berlapis dan band bukti 01/02 pindah ke awal `/fitur` (di bawah PageHead, sebelum enam pilar); Reguler/Kargo/COD tetap di `/ekspedisi`, peralatan di `/cara-kerja`, tabel perbandingan di `/biaya-dan-paket`.
- **Logo (DEC-249):** `logo.svg` digambar ulang geometris (Bézier `M/L/H/C/Q/Z`, 792 B, tanpa undakan hasil tracing; warna `#00A6FE`, `#012676`, `#0060FE`), favicon app (tile putih) dan owner (tile navy) memakai path yang sama; bukti `docs/evidence/DEC-249/logo-before-after-zoom.png`.
- **Panggung penutup (semua halaman):** tenang — judul, satu kalimat, dua tombol (`Daftar Gerai` + tautan kedua). DEC-248 (owner 2026-11-19) menghapus tiga pil langkah bernomor dari DEC-247A.
- **`/biaya-dan-paket`:** kolom kiri `5fr` radio asli (`Mitra Gerai Standar — Rp 0`, `Mitra Gerai + Domain Sendiri (Pro)`) dengan `:has()` + cadangan JS `data-active` + `@media (forced-colors: active)`; kanan `7fr` panel `#F4F6FA` berisi rincian pilihan, CTA dan daftar fitur sesuai keputusan (tanpa angka diskon karangan). Matriks perbandingan terbuka bergaris rambut: *Manual ekspedisi satu-satu* · *Sistem keagenan kunci perangkat* · **GeraiExpress** (kolom ber-*wash* `#F4F6FA`, tanpa nama merek pesaing).
- **Kepala halaman dalam (DEC-247B, paritas `PageHead` `adsbook.id`, owner 2026-11-18):** sepuluh halaman dalam dibuka satu kepala berpusat: grid titik arsitektural `radial-gradient(rgb(15 23 42 / .09) 1px, transparent 1.4px)` `22px` ber-*mask* elips, pil *eyebrow* mono huruf kapital dengan kotak biru (`Fitur loket`, `Jaringan kurir`, `Alur kemitraan`, `Skema kemitraan`, `Simulasi meja kasir`, `Panduan pengguna`, `Pusat jawaban`, `Hubungi kami`, `Ketentuan layanan`, `Kebijakan privasi`), `h1` maks `22ch`, *lead* maks `58ch`. Pil *eyebrow* hanya di kepala halaman, tidak di atas seksi. Breadcrumb kecil tetap tampil (berpusat) karena `BreadcrumbList` JSON-LD §3 harus sama dengan breadcrumb yang terlihat.
- **`/fitur`:** enam baris bolak-balik `5fr / 7fr` (indeks mono `01`–`06` + label, `h2`, tiga poin berbutir kotak `7px`), seberangnya layar Kasir nyata (pilar 01), kartu UI sintetis di panggung `#F4F6FA` (QR `INV`, Surat Jalan, Meja Retur) atau alas spesifikasi 2×2 berangka besar (`200 baris`, `100×150 mm`, `58 mm`, `9 kurir`; `1:1`, `2 buku`, `0`, `2 peran`), lalu daftar terbuka 3 kolom bergaris rambut *Dan yang Anda perlukan setiap hari* (enam kemampuan, tanpa kartu).
- **`/cara-kerja`:** strip lompat porselen 5 pil (`#langkah-1..5`), lima baris langkah bolak-balik dengan dua baris peran (pelaku · *Sistem GeraiExpress & Mengantar*) dan kartu contoh di seberang, lalu pipeline 5 titik *Alur satu paket dari meja loket sampai saldo cair* dengan denyut kotak biru yang hanya berjalan saat terlihat (`IntersectionObserver`) dan diam dalam keadaan selesai di `prefers-reduced-motion: reduce`; tabel peralatan bergaris rambut tetap.
- **`/tanya-jawab`:** indeks pil di kepala halaman ke empat grup (`#pendaftaran-lokasi`, `#perangkat-cetak`, `#saldo-cod-keuangan`, `#operasional-retur`); tiap grup `4fr / 8fr` (judul lengket di kiri pada desktop, akordion `<details>` garis rambut di kanan, bukan kartu).
- **`/hubungi-kami`:** dua panel porselen `24px` tanpa tepi: *Calon Mitra & Pemilik Gerai* (saluran resmi dari profil legal platform, pendaftaran, masuk ruang kerja) dan *Pengirim / Penerima Paket di Salah Satu Gerai* (hubungi gerai tempat mengirim, lacak di situs gerai, verifikasi 4 angka HP, permintaan UU PDP diteruskan ke gerai).
- **`/simulasi-kasir`:** nol `<select>` bawaan; empat pilihan (`Kota tujuan`, `Jenis layanan`, `Packing tambahan`, `Cara bayar di loket`) memakai listbox kustom yang sama dengan `Kecamatan tujuan` di beranda (`role="listbox"`, chevron, centang pada item aktif, `ArrowUp/Down`, `Home/End`, `Enter/Spasi`, `Escape` mengembalikan fokus, klik luar menutup, satu terbuka sekaligus, tinggi pemicu ≥ 44px); formulir di panggung `#F4F6FA` tanpa gaya *inline*.
- **Penutup + footer:** panggung `#F4F6FA` berpusat (tanpa tepi) mengalir ke footer `#F4F6FA` dengan garis rambut atas.
  Ritme tautan footer mengikuti `adsbook.id` (owner 2026-11-19): tautan teks `min-height: 28px`, `line-height 1.45`, jarak `6px`; di bawah `820px` dua kolom tautan berdampingan dengan blok merek selebar penuh di atasnya. Ini pengecualian tercatat dari aturan target `≥ 44px` di ponsel (AGENTS.md §3.6) khusus tautan teks footer; target minimum WCAG 2.5.8 (24px) tetap terpenuhi dan semua tombol/kontrol lain tetap `≥ 44px`.
  Tautan "langkah berikutnya" antar-subhalaman (pita *internal linking* §4) kini menjadi tombol kedua di panggung penutup.
- **Screenshot produk:** diambil sebagai Kasir (tampilan pemilik memuat modal dan estimasi laba, yang tidak boleh tampil di halaman publik).
- **Validasi formulir:** tidak ada gelembung validasi bawaan peramban berbahasa Inggris; pesan `setCustomValidity` berbahasa Indonesia.
- **Ponsel 390px (DEC-250):** `table.tbl.stack` di `/ekspedisi` dan `/cara-kerja` menjadi kartu garis-rambut bertumpuk di bawah `760px` (sel pertama di atas, lalu pasangan berlabel `data-col`; `.tbl-wrap` tanpa geser horizontal). Dua pil Raka turun ke satu baris di bawah gambar pada `< 520px`. Delapan jenis toko tetap grid 2 kolom sampai `340px`. Ritme seksi `48px` dan tile bento `1.25rem`; di bawah `760px` bento beranda menjadi track geser horizontal *scroll-snap* (kolom `86%`, kartu berikutnya mengintip, bisa difokus keyboard) sehingga `/` sekitar `7.800px`. Screenshot kasir di pedestal dimuat langsung (tanpa `loading="lazy"`). `/simulasi-kasir` hanya punya satu panggung penutup tanpa baris CTA ganda. Breadcrumb tetap terlihat (wajib bagi `check-page` di samping `BreadcrumbList`), lebih tenang di ponsel.

### 6.3 Mini-site `<slug>.geraimitra.com` (white-label) — rilis DEC-247B

DEC-250: `Satuan` pada Cek Ongkir adalah toggle pil `gram` | `kg` (radio `name="unit"`), sehingga tidak ada `<select>` mentah di mini-site.

Token §6.1 dengan identitas gerai sendiri (tanpa logo/nama GeraiExpress di kepala halaman): logo gerai dari `/logo`
(hanya media `purpose='logo'` milik tenant host itu) atau monogram inisial; favicon SVG inisial; `Buka Peta`
(koordinat, atau alamat); satu CTA WhatsApp; strip kurir aktif gerai (`/couriers/*.svg` dari host yang sama);
`Cek Ongkir` Reguler + Kargo (≥ 5 kg, Non-COD) + opsi P×L×T; kolom `Harga barang COD` muncul tanpa muat ulang di
`/kirim`; logo kurir di `/lacak`. SSR < 35 KB per halaman.

Keputusan pemilik (2026-11-18): (1) footer *Didukung jaringan resmi GeraiExpress* tampil hanya bila host berakhiran
`.${TENANT_ZONE}` (subdomain platform); domain kustom Pro tidak menampilkannya sama sekali (white-label penuh);
(2) kepala halaman bersih tanpa tombol WhatsApp (kiri logo/inisial + nama gerai + kecamatan, tengah `Cek Ongkir ·
Kirim dari Rumah · Lacak Paket`, kanan `Kirim Paket` di desktop / menu di ponsel); WhatsApp ada di kartu *Lokasi &
Jam Buka* di samping tautan peta dan sebagai baris sekunder di bawah menu ponsel; (3) pesan validasi formulir publik
(cek ongkir, kirim dari rumah, lacak) berbahasa Indonesia.

### 6.4 Gate tambahan (DEC-247)

`check-page.mjs` 0 fail 0 warn di 11 halaman; `dotuiux` 0 fail; screenshot `1440×900` dan `390×844` (beranda atas
sampai footer, menu ponsel terbuka, `/biaya-dan-paket`, mini-site `/` dan `/kirim`) tanpa *overflow* dan tanpa
galat konsol/CSP; mutasi merah tercatat di `docs/evidence/DEC-247/` (rilis A) dan `docs/evidence/DEC-247B/` (rilis B:
halaman dalam, simulasi, mini-site, logo kurir dan validasi di aplikasi).

## 7. `/panduan` — panduan pengguna bergambar

Halaman ke-11 di `geraiexpress.com`, dibuat atas permintaan pemilik (2026-11-25). Pembaca: pemilik gerai dan kasir
awam usia 35–55+ yang sedang memegang aplikasi dan ingin tahu "tombol mana yang ditekan". Halaman baca, bukan halaman
jual: token §6.1, tanpa bento, tanpa artefak melayang.

### 7.1 Isi dan urutan

Tiga belas panduan dalam empat kelompok, mengikuti urutan yang dialami gerai baru:

| Kelompok | Panduan (`id`) |
| --- | --- |
| Mulai | `daftar` · `persiapan` · `mengenal` |
| Melayani pelanggan | `cek-ongkir` · `kirim` · `cetak` · `cod` · `pengirim-baru` · `massal` |
| Setelah paket dibuat | `pickup` · `lacak` · `retur` |
| Untuk pelanggan Anda | `situs-gerai` |

Setiap panduan: baris pelaku (`Dikerjakan pemilik gerai` / `kasir`), `h2`, satu kalimat kapan dipakai, kotak
`Siapkan dulu` (bila perlu), lalu bagian-bagian berisi **langkah bernomor diikuti satu gambar**, ditutup kotak
`Kalau ada kendala` berisi kesalahan yang benar-benar sering terjadi. Tidak ada istilah teknis (webhook, API, sinkron
skema); nama tombol ditulis persis seperti di layar dan dicetak tebal.

### 7.2 Gambar

- Diambil dari aplikasi asli dengan data sintetis oleh `scripts/panduan/` (`seed.mjs` → `capture.mjs` →
  `optimize.mjs`); tidak ada gambar tiruan. Menjalankan ulang tiga skrip itu memperbarui semua gambar setelah UI
  berubah.
- **Nomor di gambar = nomor langkah.** Penanda bulat jingga `#C2410C` (kontras 5,17:1 terhadap putih) digambar ke
  halaman sebelum dipotret; nomor langkah berjalan terus dalam satu panduan supaya keduanya selalu sama.
- Dipotret sebagai **Kasir** bila memungkinkan; layar khusus pemilik (`Pengaturan`) dipotret tanpa angka modal, laba,
  atau saldo (§6.2).
- Nomor HP disamarkan menjadi `08xx-xxxx-NNNN` dan host lokal ditulis sebagai `namagerai.geraimitra.com` sesaat
  sebelum dipotret (AGENTS "Example data policy").
- **Ponsel:** layar ≤ 700 px menerima langkah yang sama dipotret di jendela 390 px (`<nama>-hp.webp`, 2×) lewat
  `<picture>`; layar desktop yang dikecilkan ke ponsel tidak terbaca. Layar ponsel yang lebih panjang dari 1.300 px
  CSS dibingkai pada pita yang memuat semua penanda langkahnya (bukan dipotong buta dari atas), dan `capture.mjs`
  gagal bila ada penanda yang jatuh di luar gambar.
- Penanda tidak pernah menutupi label atau tombol yang ditunjuknya: bawaannya di atas ujung kanan kolom isian; satu
  penanda boleh melingkari beberapa kontrol sekaligus (mis. empat pilihan cara bayar).
- WebP, `width`/`height` asli dari `apps/worker/src/brand/panduan-shots.json`, `loading="lazy"`, `alt` 10–125
  karakter, keterangan terlihat, dan tautan ke gambar utuh untuk diperbesar. Disajikan hanya lewat daftar izin
  `BRAND_ASSETS`.

### 7.3 Tata letak dan navigasi

- ≥ 1000 px: daftar isi lengket 232 px di kiri (kelompok + tautan, target 44 px, topik yang sedang dibaca ditandai)
  dan satu kolom baca; langkah maksimal 66 karakter per baris, gambar di bawah langkahnya. Gambar sempit (satu
  kartu, satu dialog) duduk di samping langkah mulai 760 px.
- < 1000 px: daftar isi di atas dalam dua kolom; setiap panduan ditutup tautan `Kembali ke daftar isi`.
- Masuk dari menu ponsel (`Panduan`) dan footer (`Panduan Pakai Aplikasi`); **tidak** masuk menu desktop yang tetap
  lima butir.
- Tanpa JavaScript halaman tetap utuh (tautan perbesar gambar jatuh balik ke berkas `.webp` resolusi penuh); saat
  JavaScript aktif, skrip menandai topik aktif di daftar isi (`aria-current="location"`) dan menyelaraskan tautan
  perbesar pada layar `≤ 700 px` ke varian `-hp.webp`.

### 7.4 Gate

`apps/worker/test/brand/brand.test.ts` blok `brand /panduan user guide`: 13 panduan dan daftar isinya, penomoran
langkah bersambung, 32 gambar dengan atribut lengkap dan sumber ponsel, aturan bahasa awam, serta tautan masuk.
`dotuiux check` 0 fail; render 1440 dan 390 tanpa geser horizontal, tanpa galat konsol, tanpa gambar rusak.
