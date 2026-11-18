# 07 — App Shell, Navigation Placement & Page Inventory (`geraiexpress-cfv2`)

- **Related:** `DEC-212`, `DEC-213`, `DEC-218`, `docs/spec/06-DOMAINS-MENUS-AND-ROUTES.md` (routes),
  `design/admin-contract.json` (size contract **desk**, DEC-239), `docs/visual/01` (tokens)
- **Purpose:** one place that says *where* every navigation element sits, *what* every page contains, and *who*
  sees it. Wireframes in `02`, `05`, `06` show page bodies; this file owns the frame around them.
- All visible strings are normative Indonesian. Sizes follow the desk contract (DEC-239, AdsBookCMS / TokoPhi /
  dashboard-01): desktop body, inputs, buttons, sidebar links and table cells 14 px; labels, captions, uppercase table
  heads and badges 12 px (the floor); page titles and KPI figures 24 px; controls 36 px; header 64 px; on phones inputs
  16 px and every touch target ≥ 44 px (`h-11 md:h-9`). `Ukuran Teks` 100/112/125 % in the account menu.

---

## 1. App Shell — `app.geraiexpress.com`

### 1.1 Desktop ≥ 1024 px (counter PC, laptop 1366)

```text
┌────────────────────┬──────────────────────────────────────────────────────────────────────────────┐
│ [B] Berkah Jaya    │ [≡] Dashboard    [Q Cari menu, INV, resi…  Ctrl K]   Mini-Site↗ [B3] (BA)Ani▾│ ← topbar 64 px, 3-column grid (DEC-243)
│ berkahjaya.gerai…  │                                                                              │
│ [+ Kiriman Baru][⌗]│ ← quick-action row (dashboard-01 NavMain)                                    │
├────────────────────┼──────────────────────────────────────────────────────────────────────────────┤
│ UTAMA              │  canvas #F6F7F9 · max width 1480 · padding 24–32                             │
│ ▌Dashboard         │  Dashboard (h1 24 px)                              [Periode ▾]               │
│  Buat Pengiriman ▸ │  [KPI][KPI][KPI][KPI][KPI][KPI]  ← white rounded-xl tiles, 24 px figures     │
│  Cek Ongkir&Resi ▸ │  [Grafik pengiriman ············] [Perlu tindakan ···]                       │
│ OPERASIONAL        │  [Riwayat pengiriman ···········] [Performa ekspedisi]                       │
│  Kiriman    22   ▸ │                                                                              │
│  Kontak          ▸ │                                                                              │
│ ADMINISTRASI       │                                                                              │
│  Keuangan        ▸ │   (hidden for Kasir, also blocked by the API)                                │
│  Pengaturan     ⚠  │                                                                              │
│ ────────────────── │ ← sidebar foot: counter status, not navigation (no shift row, DEC-241)       │
│ STATUS LOKET       │                                                                              │
│ Label ● 10×15      │                                                                              │
│ Mengantar ● Aktif  │                                                                              │
└────────────────────┴──────────────────────────────────────────────────────────────────────────────┘
```

**Placement rules**

| Zone | Contains | Never contains |
|---|---|---|
| Sidebar header | Outlet logo + name (`▾` opens the outlet switcher only when the user is a member of >1 tenant, PR-24), mini-site link | Promo, upgrade banners |
| Sidebar nav | 7 menus in three groups (DEC-241): **Utama** `Dashboard` · `Buat Pengiriman` ▸ `Kiriman Satuan` · `Paket Massal` · `Cek Ongkir & Resi` ▸ `Cek Ongkir` · `Cek Resi`; **Operasional** `Kiriman` ▸ `Daftar Kiriman` · `Pickup & Surat Jalan` · `Cetak Resi Massal` · `Riwayat Massal` · `Meja Retur` · `Kendala & Klaim`, `Kontak` ▸ `Data Pengirim` · `Data Penerima`; **Administrasi** `Keuangan` ▸ `Ringkasan & Saldo` · `Mutasi Mengantar` · `Laba per Kiriman` · `Cadangan Retur` · `Selisih Sync` (owner), `Pengaturan` (one entry; its 10 pages have their own rail). Collapsible tree (shadcn `sidebar-07`) that opens when its section is active; tab-backed children (`/kiriman?tab=retur`) are active only on their tab. Badge counts only on `Kiriman`; `⚠` on `Pengaturan` while the webhook is inactive | Third-level links, settings pages, external links, `Shift Loket` (deferred, TASK-704) |
| Sidebar footer | `Status loket`: label format + Mengantar connection (owner) | Logout (lives in the account menu), shift state (deferred, DEC-241) |
| Header (DEC-243) | ≥ 1024 px a 3-column grid `minmax(0,1fr) · minmax(260px,380px) · minmax(0,1fr)`: **left** sidebar trigger + divider + breadcrumb (navigation only; separators are sibling `<li>`s, the current crumb is `aria-current="page"` text); **centre** the `⌘K`/`Ctrl K` search bar, at the same x on every page whatever the breadcrumb length; **right** notifications, divider, account chip (avatar only below 1280 px), mini-site pill from 1536 px — the right track never runs into the search (GPT-6.1 Sol R1). Below 1024 px: flex row, search becomes an icon button; `Pindai QR` icon only on phones (the sidebar quick-action row has it elsewhere) | Menu duplication, a second QR icon on desktop |
| Page body | Title row → in-page tabs → filters/toolbar → content → sticky action bar when the page has a commit action | A second navigation sidebar |

Account menu (`Ani ▾`, DEC-244): header (name, email, `Pemilik · <gerai>` / `Kasir · <gerai>`) · `Halaman Publik Gerai` (the
gerai's mini-site host, new tab; Super Admin: none since DEC-246) · `Profil Saya` · `Ukuran Teks: Normal (100%) / Besar (112%) / Sangat Besar (125%)`
(same three steps as `docs/visual/01`) · `Bantuan & Panduan` · `Keluar`. Text size scales the root rem (never
`zoom`, never locks browser zoom).

### 1.2 Tablet 768–1023 px

Sidebar becomes the 56 px icon rail: icons only, label shown as a tooltip on hover and keyboard focus (as in §1.1). Header keeps search as an icon button
that opens a full-width search sheet. `+ Kiriman Baru` stays visible.

### 1.3 Phone < 768 px (Android 360–412)

```text
┌──────────────────────────────────────┐
│ ☰  Kiriman              [🔍] [📷]    │ ← header 64 px (contract): menu drawer, title, search, scan
├──────────────────────────────────────┤
│                                      │
│  PAGE BODY (single column, 16 px)    │
│  tabs scroll horizontally            │
│                                      │
├──────────────────────────────────────┤
│ Beranda  Buat  [ + ]  Kiriman Lainnya│ ← bottom bar 64 px: 5 icon+label items, labels 14 px
└──────────────────────────────────────┘
```

- Bottom bar: `Beranda` (Dashboard) · `Buat Pengiriman` (short label `Buat` on 390 px) · center **`＋`** (= `+ Kiriman Baru`, 56 px) · `Kiriman` · `Lainnya`.
  The center `＋` follows the header rule: filled only on `Dashboard`, `/kasir`, `/kiriman`; outline elsewhere.
  Commit flows (`/kasir`, `/kasir/multi`, `/kasir/shift` (deferred, direct URL only), `/kiriman/:slug`, `/kiriman/pickup/:batch`,
  `/kiriman/retur/:awb`) replace the bottom bar with their sticky commit bar. Page bodies never repeat a
  `+ Kiriman Baru` button.
- `Lainnya` (and the header `☰`) opens the sidebar as a Sheet with the same tree as desktop: `Buat Pengiriman`
  ▸ `Kiriman Satuan` / `Paket Massal`, `Cek Ongkir & Resi` ▸ `Cek Ongkir` / `Cek Resi`, `Kiriman` and its 6
  workstations, `Kontak` ▸ `Data Pengirim` / `Data Penerima`, `Keuangan` and its 5 views (owner only), `Pengaturan`,
  and the account menu (`Keluar`).
- On `/kiriman/:slug` the bottom bar is replaced by the sticky **checkout bar** (`Total Rp 27.000` + `Tandai Lunas & Cetak`).

---

## 2. Super Admin Shell — `owner.geraiexpress.com`

Same frame, different content:

- Sidebar header: `GeraiExpress · Super Admin` + environment chip (`Produksi` red outline / `Sandbox` grey).
- Sidebar nav (DEC-241, each sub-tree mirrors the page tabs on `?tab=`): **Platform** `Ringkasan` · `Gerai`
  (badge = pending applications) ▸ `Pengajuan Baru` · `Direktori Gerai` · `Domain Mitra`; **Tata Kelola**
  `Tarif & Kurir` ▸ `Diskon & Cashback` · `Permintaan Mengantar` · `Kebijakan Diskon`, `Pengawasan` ▸
  `Pantauan Kiriman` · `Radar Risiko COD`; **Sistem** `Sistem & Audit` ▸ `Kesehatan Integrasi` · `Log Audit` ·
  `Akses Admin` · `Profil Perusahaan`.
- Header right: global search (INV / AWB / outlet slug across tenants, read-only), `🔒 TOTP aktif · 12 mnt`,
  account menu. **No `+ Kiriman Baru`** — Super Admin never creates shipments (`DEC-209`).
- Persistent top banner when a sensitive action needs re-TOTP: `Konfirmasi ulang TOTP untuk melanjutkan`.
- Phone: read-only monitoring layout; approvals and discount edits require ≥ 768 px (shown as a notice, not hidden).

---

## 3. Page Inventory

Legend — **Role:** O = Gerai Admin (owner), K = Kasir, S = Super Admin, P = public.
**Primary** = the one primary action on that page. States: every list page defines *first-run empty*,
*filtered empty* (shows active filters + `Hapus filter`), *loading skeleton*, *error with retry*.

### 3.1 Auth & onboarding (`app.`)

| Route | Role | Title | Primary | Content blocks (order) | Notes |
|---|---|---|---|---|---|
| `/masuk` | P | Masuk | `Masuk` | email, password, Turnstile, `Lupa kata sandi?`, `Daftar gerai` link | No sidebar; centered 440 px card |
| `/daftar` | P | Daftar Gerai | `Kirim Kode` | email → 6-digit OTP → password → data gerai → titik jemput (map + `area_id`) → ringkasan | Resumable; step indicator `1/5` |
| `/daftar/status` | O | Status Pengajuan | — | timeline `Diajukan → Ditinjau → Akun Mengantar → Aktif`, contact line | Shown until approved |
| `/undangan/:token` | P | Gabung sebagai Kasir | `Buat Akun` | outlet name, inviter, password form | 7-day single-use |
| `/lupa-sandi`, `/atur-sandi/:token` | P | Atur Ulang Kata Sandi | `Kirim Tautan` / `Simpan` | — | — |

### 3.2 Gerai workspace

| Route | Role | Title / breadcrumb | Primary | Content blocks (order) | Owner vs Kasir |
|---|---|---|---|---|---|
| `/` | O | Dashboard | `+ Kiriman Baru` | period filter (WIB presets + calendar range, default `7 hari terakhir`, DEC-221, visual 08 §1) → 4 KPI (kiriman, tercatat dibayar, belum dibayar, saldo Mengantar aman) → `Grafik pengiriman` (stacked Non-COD/COD bars) → `Riwayat pengiriman` (INV, ekspedisi, penerima, tagihan, pembayaran, status) → courier performance + `Perlu tindakan` | — |
| `/` | K | Tugas Loket Hari Ini | `+ Kiriman Baru` | 3 tiles (kiriman hari ini, belum dibayar, siap dijemput; no shift tile, DEC-241) → `Siap Pickup` per courier → `Meja Retur` waiting → recent INV list | No money totals, no Mengantar balance |
| `/kasir` | O K | Buat Pengiriman › Kiriman Satuan | `Tandai Lunas & Cetak · Rp X` (or `Simpan & Cetak`) | 60/40 counter POS (DEC-237): scan QR / buka INV → left: `1. Tujuan & berat` (mode, area, weight, dims, COD goods + fee mode, `Nilai barang`, `Barang berbahaya (DG)`, packing, counter fee) → `2. Pilih ekspedisi` (cards, medals, courier-rule hints) → `3. Pengirim, label & penerima` (pickers + `+ … baru` Sheets, provenance cards, WA state, area check, COD badge + Mengantar score, preset, `Isi paket`, `Jumlah barang`, `Instruksi kurir / patokan`, prohibited-goods check); right (sticky): `Ringkasan & Pembayaran`; after issue `Resi terbit` + `Cetak Label` + `Kiriman Baru` | Margin, `Modal Mengantar`, `Estimasi laba` owner only (server-projected) |
| `/kiriman/:slug` | O K | Kiriman › INV 8K4M2P7 | `Tandai Lunas & Cetak` (or `Simpan & Cetak` when `Bayar nanti`) | left 60 %: tujuan & berat → ekspedisi → pengirim & masking → penerima & isi; right 40 %: locked summary → pembayaran → cetak | Kasir sees customer price only |
| `/kiriman/:slug` (issued) | O K | Kiriman › INV 8K4M2P7 | `Cetak Ulang` | status stepper → AWB + label preview → payment record → event timeline → actions (`Batalkan`, `Kirim WA`); masked INV: `Lihat Pengirim Asli` (reason + audit) | Cost/margin rows owner only |
| `/kasir/multi` | O K | Buat Pengiriman › Paket Massal | `Buat n Kiriman` then `Tandai Lunas & Cetak Semua` | sender picker → `Tambah Baris` or `Unggah Excel/CSV` (+ `Unduh Template`) → tabs `Siap (n) · Perlu Diperbaiki (n)` with inline edit → batch totals → dispatch progress → print queue (spec 03 §1.3) | Kasir sees customer price only; max 200 rows |
| `/kasir/cek-resi` | O K | Cek Ongkir & Resi › Cek Resi | — | one search (INV / AWB / HP) → timeline per koli; foreign AWB → courier link (spec 03 §1.4) | read-only |
| `/kasir/cek-cepat` | O K | Cek Ongkir & Resi › Cek Ongkir | `Buat Kiriman dari Tarif Ini` (opens `/kasir` prefilled, same service selected) | destination + weight → courier price list → COD risk badge | Creates no draft until the primary is pressed |
| `/kasir/shift` | O K | Shift Loket (**deferred, DEC-241**: no menu/command/status; direct URL only until TASK-704) | `Buka Shift` / `Tutup Shift` | opening cash → live totals (Tunai/QRIS/Transfer) → closing count → variance | Kasir: own shift; owner: all shifts |
| `/kiriman` | O K | Kiriman › Daftar Kiriman | `+ Kiriman Baru` | tabs `Semua · Belum Dibayar · Draf QR · Menunggu Saldo` (DEC-241; `?tab=pickup|retur|kendala` render the workstations `Pickup & Surat Jalan`, `Meja Retur`, `Kendala & Klaim` with their own `h1`, reached from the sidebar) → search + period filter (visual 08 §1) → table with `Pembayaran` column and `Tandai Lunas` row action | Cost/margin columns + CSV owner only |
| `/kiriman/massal/:batch` | O K | Kiriman › Riwayat Massal › 15 Nov 10:12 | `Cetak Semua` | batch header (sender, rows, ready/failed, total) → rows with INV, status, error → `Batalkan yang Belum Terbit` | — |
| `/kiriman/cetak-massal` | O K | Kiriman › Cetak Resi Massal | `Cetak (n)` | filters: period, courier, `Status Cetak` (`Belum Cetak`/`Sudah Cetak`) → checkbox table with live counter, max 50 → format picker → merged PDF (spec 03 §3.2) | reprints require reason |
| `/kiriman/pickup/:batch` | O K | Kiriman › Manifest J&T 16:00 | `Selesai & Tanda Tangan` | scan box (wrong courier = red alert + sound) → scanned list → missing list → signature | — |
| `/kiriman/retur/:awb` | O K | Kiriman › Meja Retur › JT77… | `Kirim Kode Ambil` | true sender → condition + photo → WA OTP → handover verify | — |
| `/kontak/pengirim` | O K | Kontak › Pengirim | `+ Tambah Pengirim` | search → table (nama, HP, mask brand, jumlah kiriman, deposit) | Deposit column owner only |
| `/kontak/pengirim/:id` | O K | Kontak › Pengirim › Toko Hijab Nisa | `+ Kiriman dari Pengirim Ini` | profile → `Kirim Sebagai` brands → shipments → deposit ledger (owner) | — |
| `/kontak/penerima` | O K | Kontak › Penerima | `+ Tambah Penerima` | search → table (nama, HP, kota, riwayat COD 🟢🟡🔴) | — |
| `/kontak/penerima/:id` | O K | Kontak › Penerima › Rina K. | `+ Kiriman ke Penerima Ini` | addresses → COD history → shipments | — |
| `/keuangan` | O | Keuangan | `Sinkronkan Sekarang` | 4 balance cards → `Menunggu Saldo` alert → tabs `Ringkasan & Saldo · Mutasi Mengantar · Laba per Kiriman · Cadangan Retur · Selisih Sync` (= sidebar sub-tree; `Kas Loket & Shift` deferred, DEC-241) | Route and API return 403 for Kasir |
| `/pengaturan` | O (K: printer only) | Pengaturan | — | ≥ 1024 px opens the first section (`/pengaturan/profil`, Kasir `/pengaturan/printer`, replace); phones get a grouped directory of icon + title + subtitle rows (DEC-240); per `docs/visual/08` §2; item routes `/pengaturan/<item>` listed in visual 08 §2.3 | Kasir sees only `Printer & Struk` (device part, saved locally) |
| `/kasir/layar-pelanggan` | O K (paired device) | Layar Pelanggan | — | outlet logo → locked line items → total (40 px) → outlet QRIS → `Terima kasih` | P1 (PR-22); no navigation, no cost fields |
| `/pengaturan/<item>` | O (K: `printer`) | Pengaturan › <item> | `Simpan` in sticky save bar, only when dirty | TokoPhi rail (DEC-240): framed `Card` rail (group labels, icon tile + title + one-line subtitle, amber dot on `Mengantar` while the webhook is inactive) + gerai summary card (owner) beside a flush-left `max-w-4xl` column of `SectionCard`s with 2-col form grids; phones: `← Semua Pengaturan` back link | 403 for Kasir except `printer` |
| `/akun` | O K | Akun Saya | `Simpan` | profile (name, phone) → `Ganti Kata Sandi` → `Ganti Email` (OTP to new email, spec 12) → active sessions with `Keluar dari perangkat ini/lainnya` → text-size preference | opened from the account menu, not the sidebar |
| `/status` | O | Status Operasional (DEC-244) | `Periksa Ulang` (live: finance sync + domain refresh, 6/min) | verdict banner (emerald/amber/rose: healthy / setup / problem) → `Perlu Ditangani` (degraded signals with direct actions) → `Kesiapan Loket` checklist (`n/5 siap`) → `Semua Sinyal Sistem` 2-col cards (penerbitan resi, webhook, sinkron saldo, halaman publik & domain). Topbar icon beside the bell (owner only; cached 5 min, no polling) and `Lihat status` in the sidebar status | Kasir: no icon, route 403, API 403 |
| `/bantuan` | O K | Bantuan & Panduan | `Hubungi Bantuan` (WhatsApp) | searchable guides: first setup, printer on PC (100 mm driver, paper size, 100 % scale), custom domain DNS, COD flow, returns | opened from the account menu |
| `/notifikasi` | O K | Notifikasi | `Tandai Semua Dibaca` | grouped by day; each item deep-links | — |
| `*` 403 / 404 / offline | O K | — | `Kembali ke Dashboard` | plain explanation + who can grant access (403) | Offline: POS queues nothing silently; shows `Koneksi terputus` banner |

### 3.3 Super Admin (`owner.`)

| Route | Title | Primary | Content blocks (order) |
|---|---|---|---|
| `/` | Ringkasan | — | 4 KPI (gerai aktif, kiriman hari ini, pengajuan, sync/relay health) → alerts list → volume trend |
| `/gerai` | Gerai | `Muat Ulang` | 4-tile summary (pengajuan baru, gerai aktif, onboarding tertunda, dibekukan) → tabs `Pengajuan Baru · Direktori Gerai · Domain Mitra` (DEC-244: domains table with per-row `Periksa Ulang` + `Periksa Semua Domain`) |
| `/gerai/pengajuan/:id` | Gerai › Pengajuan › Berkah Jaya | `Setujui & Buka Akun Seller Mengantar` | applicant data → pickup map → relay status → slug readiness → reject with reason |
| `/gerai/:slug` | Gerai › Berkah Jaya | — (read-only data) | health, RTS %, Mengantar connection/webhook state; controls (TOTP + reason): masking toggle, `Kuota masking harian`, freeze |
| `/tarif` | Tarif & Kurir | `Simpan Perubahan` (TOTP + reason) | tabs `Diskon & Cashback Gerai · Katalog & Aturan Kurir · Kebijakan Diskon`; assigned vs observed bps editor with status `Belum diterapkan / Sesuai / Selisih` and `Tandai sudah diminta ke Mengantar`; policy tab holds default / minimum / maximum per courier (all 20 % default now) |
| `/pengawasan` | Pengawasan | — | tabs `Pantauan Kiriman & Sync · Radar Risiko COD`; DEC-244: `Antrean Sinkronisasi` 4-tile grid (`/pengawasan/antrean`) with `Muat Ulang` and `Sync Keuangan Semua Gerai`, search hits in a table linking to the gerai; cross-tenant search is read-only |
| `/akun` | Profil & Keamanan Akun (DEC-246; account menu `Profil Saya`, ⌘K) | per card | `max-w-4xl` cards: `Profil Saya` (Nama, Nomor HP) → `Ubah Kata Sandi` (current + new + confirm; other devices signed out) → `Verifikasi 2 Langkah & Cadangan Darurat` (authenticator `Aktif` + `Ganti Perangkat Autentikator` dialog: password → QR → code; recovery codes `N dari 8 kode tersisa` or amber `Belum dibuat`, `Buat 8 Kode Pemulihan Baru` dialog: password → 8 codes in a 2-column mono box + `Salin Semua` + `Unduh .txt`) → `Ubah Alamat Email` (password → 6-digit code) → `Sesi Perangkat Aktif` (`Keluarkan`, `Keluarkan Semua Perangkat Lain`). `TOTP_RECENT_REQUIRED` → `/totp?mode=required&kembali=/akun` |
| `/totp` | Kode TOTP / Aktifkan TOTP | `Verifikasi` | DEC-246: `mode=required` adds `Tidak bisa akses autentikator? Gunakan kode pemulihan cadangan` → `XXXX-XXXX` field + `Sekaligus daftarkan perangkat autentikator (TOTP) baru` (then the new QR + code in place); `mode=enrol` shows `Simpan 8 Kode Pemulihan Cadangan Anda` (`Salin Semua`, `Unduh .txt`, `Saya Sudah Menyimpan, Lanjut ke Konsol`) after the first confirmation |
| `/sistem` | Sistem & Audit | `Periksa Ulang Semua Sinyal` (DEC-244); `Simpan` on `Profil Perusahaan` (TOTP + reason) | tabs `Kesehatan Integrasi & Relay · Log Audit · Akses Admin · Profil Perusahaan`; health = verdict banner + 5 signal cards (Partner API & relay, diskon & antrean, onboarding & pemulihan, email 7 hari, kuota domain) feeding the topbar status icon; audit and admins as tables with `Muat Ulang` |

### 3.4 Public (`geraiexpress.com`, `<slug>.geraimitra.com`)

Public pages follow `docs/visual/03` and the public size floor (body ≥ 17 px, nothing under 14 px).
Routes: `geraiexpress.com/ · /fitur · /cara-kerja · /simulasi-kasir · /hubungi-kami · /ketentuan · /privasi`;
mini-site `/ · /kirim/:slug · /lacak · /lacak/:kode · /inv/:slug`. `geraiexpress.com` footer renders only the filled
public fields of `platform_legal_profile` (never NPWP); mini-site footers show the outlet identity plus
`Didukung jaringan resmi GeraiExpress` and a link to `https://geraiexpress.com/privasi` (`DEC-218`, spec 01 §2.1b).

---

## 4. shadcn Component Map (desk contract DEC-239, primitives edited once)

| Frame element | shadcn component | Desk edits (in the owned file, never per call) |
|---|---|---|
| Sidebar | `Sidebar`, `SidebarGroupLabel`, `SidebarMenu`, `SidebarMenuButton`, `SidebarMenuSub` | button `h-11 md:h-9 text-base md:text-sm`, active accent bar; group label 12 px uppercase; sub-items `md:h-8` with dots; rail `size-10!`; `SIDEBAR_WIDTH_ICON 3.5rem` |
| Header search | `⌘K` pill → command list in `Dialog` (`Ctrl/⌘+K`) | pill `h-9 bg-slate-100/80`; input `h-12 text-sm`; rows `min-h-11` |
| Account menu (top right) | `DropdownMenu` | chip `h-9` avatar + name/role; items `text-base md:text-sm` |
| In-page tabs | `Tabs` | list `bg-slate-100/90 p-1`, trigger `h-11 md:h-8 text-sm`, active white + 1 px shadow |
| Tables | `Table` (+ TanStack for sorting/pagination) | head `h-10 text-xs uppercase tracking-wider bg-slate-50/90`, cell `h-12 px-3 text-sm`, `tabular-nums` for money/weights |
| Forms | `Field`, `Input`, `Select`, `Textarea`, `ToggleGroup` (gram/kg) | `h-11 md:h-9 text-base md:text-sm`, white fill, labels 14 px, help 12 px |
| Status | `Badge` | `text-xs` pill, dot + text (never colour alone) |
| Mobile drawer / sheets | `Sheet`, `Drawer` | title `text-base` |
| Toasts | `Sonner` | `text-sm` |

Acceptance: `dotuiux check <url> --surface admin` and
`admin-geometry.mjs <url> --contract design/admin-contract.json --viewports 390,1366,1536` exit 0 on every route
above that renders, in a seeded state.
