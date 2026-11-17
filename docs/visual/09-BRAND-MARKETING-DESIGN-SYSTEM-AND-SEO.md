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

### 3.1 Peta Situs (`10` Rute Publik Kanonis pada `geraiexpress.com`)

| URL Slug | Peran di Navigasi | Target Intensi Pencarian (SEO) | Judul `<title>` (55–70 karakter) |
| --- | --- | --- | --- |
| `/` | Logo / Beranda | Agen ekspedisi multi kurir, aplikasi kasir loket paket | `Aplikasi Kasir Agen Kirim Paket Multi-Ekspedisi - GeraiExpress` (62) |
| `/fitur` | Menu Utama | Fitur software kasir agen pengiriman, manajemen retur & COD | `Fitur Kasir Loket, Cetak Resi & Keuangan Agen - GeraiExpress` (60) |
| `/ekspedisi` | Menu Utama | Daftar kurir yang didukung, aturan COD, kargo ≥ 5 kg | `Daftar Ekspedisi Reguler, Kargo & Layanan COD - GeraiExpress` (60) |
| `/cara-kerja` | Menu Utama | Cara daftar agen paket modal kecil, syarat alat loket | `Cara Daftar & Peralatan Buka Loket Kirim Paket - GeraiExpress` (61) |
| `/biaya-dan-paket` | Menu Utama | Biaya buka agen ekspedisi, komisi ongkir, website nama toko | `Biaya Pendaftaran & Skema Komisi Mitra Loket - GeraiExpress` (59) |
| `/simulasi-kasir` | Menu Utama (Aksen) | Coba aplikasi kasir pengiriman tanpa login, contoh struk | `Simulasi Meja Kasir & Struk Agen Kirim Paket - GeraiExpress` (59) |
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
│  │ 04 • KIRIM & UNTUNG  Diskon 25%   │     [3D HUB GERAI EXPRESS]   │ ● Diskon Kirim Mitra  25% OFF ││
│  │ Jangkau Seluruh Indonesia         │      + Karakter & Konveyor   └───────────────────────────────┘│
│  └───────────────────────────────────┘                                                               │
│                                      Peta 3D Nusantara Sabang—Merauke                                │
│                      [ ⏸ │  01 Daftar  │  02 KYC  │  03 Gerai  │  04 Untung  ]                       │
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
   - Tabel terstruktur ekspedisi jaringan Mengantar: **J&T Express** (`EZ`, `J&T Cargo`, `J&T Eco`), **JNE** (`REG`, `JTR Kargo`), **SiCepat** (`REG`, `GOKIL Kargo`), **SAP Express** (`REG`, `SAP Lite`), **Lion Parcel** (`REGPACK`, `BIGPACK`), **iDexpress** (`STD`, `iDtruck`), **Anteraja**, **Pos Indonesia**, dan **SPX Express**.
   - Penjelasan jujur aturan lapangan: perhitungan berat aktual vs volumetrik (`P×L×T`), layanan Kargo mulai `5 kg`, batas nilai COD per kurir, serta aturan barang berbahaya (*Dangerous Goods* seperti baterai/cairan hanya pada kurir yang mendukung).
3. **`/cara-kerja` — Alur Pendaftaran & Panduan Peralatan Meja Kasir:**
   - 5 langkah berurutan dari pengajuan titik jemput → verifikasi & pembuatan akun seller Mengantar otomatis → pengaturan webhook & saldo Non-COD → penerimaan paket pelanggan (datang langsung atau pindai QR dari rumah) → serah terima pickup sore & pencairan COD.
   - Tabel spesifikasi alat toko tanpa *vendor lock-in*: perangkat hitung, timbangan meja 30–50 kg, printer USB/LAN 100 mm (disarankan) atau Bluetooth 58 mm, serta pemindai QR kamera/USB opsional.
4. **`/biaya-dan-paket` — Transparansi Biaya & Skema Komisi Mitra:**
   - Perbandingan jujur **Kemitraan Standar Gerai (Rp 0 biaya pendaftaran software)** vs **Opsi Domain Sendiri (Pro)** untuk gerai mapan yang ingin memakai domain `.com`/`.id` milik sendiri dengan SSL otomatis Cloudflare.
   - Simulasi contoh hitungan margin loket yang jujur: pelanggan membayar tarif publik resmi pada struk, sementara gerai memperoleh selisih diskon ongkir per kurir sesuai kebijakan akun Mengantar setelah dikurangi biaya layanan platform yang transparan.
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
- [x] **10/10 Halaman Lulus `check-page.mjs`:** `0 fail, 0 warn` — panjang `<title>` `55–70` karakter, `meta description` `120–155` karakter berakhiran titik, `canonical` absolut `https://`, `og:image` + `og:image:alt`, `Organization` + `BreadcrumbList` valid dengan `<nav aria-label="Breadcrumb">` terlihat.
- [x] **Zero Overflow & Kenyamanan Baca (`dotuiux`):** `horizontalOverflowPx === 0` pada `1440×900` dan `390×844`, target sentuh `>= 44px`, kontras teks lulus WCAG AA, nol ikon dekoratif `Sparkles`.
- [x] **Kompatibilitas Penuh Tes Otomatis:** `apps/worker/test/brand/brand.test.ts` dan `e2e/brand.spec.ts` hijau 100%.
