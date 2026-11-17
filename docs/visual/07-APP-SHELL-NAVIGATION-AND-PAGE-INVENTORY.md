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
│ [B] Berkah Jaya    │ [≡] Dashboard   [🔍 Cari menu, INV, AWB…  ⌘K]  Mini-Site↗ [QR] [🔔3] (BA)Ani▾│ ← topbar 64 px, white
│ berkahjaya.gerai…  │                                                                              │
│ [+ Kiriman Baru][⌗]│ ← quick-action row (dashboard-01 NavMain)                                    │
├────────────────────┼──────────────────────────────────────────────────────────────────────────────┤
│ UTAMA              │  canvas #F6F7F9 · max width 1480 · padding 24–32                             │
│ ▌Dashboard         │  Dashboard (h1 24 px)                              [Periode ▾]               │
│  Buat Pengiriman ▸ │  [KPI][KPI][KPI][KPI][KPI][KPI]  ← white rounded-xl tiles, 24 px figures     │
│ OPERASIONAL        │  [Grafik pengiriman ············] [Perlu tindakan ···]                       │
│  Kiriman       22  │  [Riwayat pengiriman ···········] [Performa ekspedisi]                       │
│  Kontak          ▸ │                                                                              │
│ ADMINISTRASI       │                                                                              │
│  Keuangan          │   (hidden for Kasir, also blocked by the API)                                │
│  Pengaturan     ⚠  │                                                                              │
│ ────────────────── │                                                                              │
│ STATUS LOKET       │ ← sidebar foot: device/counter status, not navigation                        │
│ Shift ● Buka       │                                                                              │
│ Label ● 10×15      │                                                                              │
└────────────────────┴──────────────────────────────────────────────────────────────────────────────┘
```

**Placement rules**

| Zone | Contains | Never contains |
|---|---|---|
| Sidebar header | Outlet logo + name (`▾` opens the outlet switcher only when the user is a member of >1 tenant, PR-24), mini-site link | Promo, upgrade banners |
| Sidebar nav | The 6 menus, in this order; `Buat Pengiriman` expands to its 5 tools (`Kiriman Satuan` · `Paket Massal (CSV)` · `Cek Ongkir Cepat` · `Cek Resi` · `Shift Loket`, DEC-237) and `Kontak` to 2 sub-items — a Collapsible tree (shadcn `sidebar-07`) that opens when its section is active; badge counts only on `Kiriman` (items needing action) | Third-level links, settings sub-tabs, external links |
| Sidebar footer | Printer status (🟢/🟠/🔴 + text), active shift + cashier name, collapse toggle | Logout (lives in the account menu) |
| Header left | Sidebar trigger + breadcrumb whose last crumb is the page `h1` (`Buat Pengiriman › Kiriman Satuan`, `Kiriman › INV 8K4M2P7`; DEC-236); pages never repeat a breadcrumb in the body | Menu duplication |
| Header right | Global search (INV, AWB, phone; `Ctrl+K`), notifications, account menu, **`📷 Scan QR`** and **`+ Kiriman Baru`** — primary style only on `Dashboard`, `/kasir` and `/kiriman`; on every page that has its own primary action (§3) it renders as an outline button, and it is hidden on `/kiriman/:slug` | More than one primary button per screen |
| Page body | Title row → in-page tabs → filters/toolbar → content → sticky action bar when the page has a commit action | A second navigation sidebar |

Account menu (`Ani ▾`): `Profil Saya` · `Ukuran Teks: Normal (100%) / Besar (112%) / Sangat Besar (125%)`
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
  Commit flows (`/kasir`, `/kasir/multi`, `/kasir/shift`, `/kiriman/:slug`, `/kiriman/pickup/:batch`,
  `/kiriman/retur/:awb`) replace the bottom bar with their sticky commit bar. Page bodies never repeat a
  `+ Kiriman Baru` button.
- `Lainnya` (and the header `☰`) opens the sidebar as a Sheet with the same tree as desktop: `Buat Pengiriman`
  and its 5 tools, `Kiriman`, `Kontak › Pengirim / Penerima`, `Keuangan` (owner only), `Pengaturan`, and the account
  menu (`Keluar`).
- On `/kiriman/:slug` the bottom bar is replaced by the sticky **checkout bar** (`Total Rp 27.000` + `Tandai Lunas & Cetak`).

---

## 2. Super Admin Shell — `owner.geraiexpress.com`

Same frame, different content:

- Sidebar header: `GeraiExpress · Super Admin` + environment chip (`Produksi` red outline / `Sandbox` grey).
- Sidebar nav: `Ringkasan` · `Gerai` (badge = pending applications) · `Tarif & Kurir` · `Pengawasan` ·
  `Sistem & Audit` (badge = `Data perusahaan belum lengkap` count until filled, `DEC-218`).
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
| `/` | K | Tugas Loket Hari Ini | `+ Kiriman Baru` | shift card → `Siap Pickup` per courier → `Meja Retur` waiting → recent INV list | No money totals, no Mengantar balance |
| `/kasir` | O K | Buat Pengiriman › Kiriman Satuan | `Tandai Lunas & Cetak · Rp X` (or `Simpan & Cetak`) | 60/40 counter POS (DEC-237): scan QR / buka INV → left: `1. Tujuan & berat` (mode, area, weight, dims, COD goods + fee mode, `Nilai barang`, `Barang berbahaya (DG)`, packing, counter fee) → `2. Pilih ekspedisi` (cards, medals, courier-rule hints) → `3. Pengirim, label & penerima` (pickers + `+ … baru` Sheets, provenance cards, WA state, area check, COD badge + Mengantar score, preset, `Isi paket`, `Jumlah barang`, `Instruksi kurir / patokan`, prohibited-goods check); right (sticky): `Ringkasan & Pembayaran`; after issue `Resi terbit` + `Cetak Label` + `Kiriman Baru` | Margin, `Modal Mengantar`, `Estimasi laba` owner only (server-projected) |
| `/kiriman/:slug` | O K | Kiriman › INV 8K4M2P7 | `Tandai Lunas & Cetak` (or `Simpan & Cetak` when `Bayar nanti`) | left 60 %: tujuan & berat → ekspedisi → pengirim & masking → penerima & isi; right 40 %: locked summary → pembayaran → cetak | Kasir sees customer price only |
| `/kiriman/:slug` (issued) | O K | Kiriman › INV 8K4M2P7 | `Cetak Ulang` | status stepper → AWB + label preview → payment record → event timeline → actions (`Batalkan`, `Kirim WA`); masked INV: `Lihat Pengirim Asli` (reason + audit) | Cost/margin rows owner only |
| `/kasir/multi` | O K | Buat Pengiriman › Paket Massal (CSV) | `Buat n Kiriman` then `Tandai Lunas & Cetak Semua` | sender picker → `Tambah Baris` or `Unggah Excel/CSV` (+ `Unduh Template`) → tabs `Siap (n) · Perlu Diperbaiki (n)` with inline edit → batch totals → dispatch progress → print queue (spec 03 §1.3) | Kasir sees customer price only; max 200 rows |
| `/kasir/cek-resi` | O K | Buat Pengiriman › Cek Resi | — | one search (INV / AWB / HP) → timeline per koli; foreign AWB → courier link (spec 03 §1.4) | read-only |
| `/kasir/cek-cepat` | O K | Buat Pengiriman › Cek Ongkir Cepat | `Buat Kiriman dari Tarif Ini` (opens `/kasir` prefilled, same service selected) | destination + weight → courier price list → COD risk badge | Creates no draft until the primary is pressed |
| `/kasir/shift` | O K | Buat Pengiriman › Shift Loket | `Buka Shift` / `Tutup Shift` | opening cash → live totals (Tunai/QRIS/Transfer) → closing count → variance | Kasir: own shift; owner: all shifts |
| `/kiriman` | O K | Kiriman | `+ Kiriman Baru` | tabs `Semua · Belum Dibayar · Draf QR · Menunggu Saldo · Pickup & Manifest · Riwayat Massal · Kendala & Klaim · Meja Retur` → search + period filter (visual 08 §1) → table with `Pembayaran` column and `Tandai Lunas` row action | Cost/margin columns + CSV owner only |
| `/kiriman/massal/:batch` | O K | Kiriman › Riwayat Massal › 15 Nov 10:12 | `Cetak Semua` | batch header (sender, rows, ready/failed, total) → rows with INV, status, error → `Batalkan yang Belum Terbit` | — |
| `/kiriman/cetak-massal` | O K | Kiriman › Cetak Resi Massal | `Cetak (n)` | filters: period, courier, `Status Cetak` (`Belum Cetak`/`Sudah Cetak`) → checkbox table with live counter, max 50 → format picker → merged PDF (spec 03 §3.2) | reprints require reason |
| `/kiriman/pickup/:batch` | O K | Kiriman › Manifest J&T 16:00 | `Selesai & Tanda Tangan` | scan box (wrong courier = red alert + sound) → scanned list → missing list → signature | — |
| `/kiriman/retur/:awb` | O K | Kiriman › Meja Retur › JT77… | `Kirim Kode Ambil` | true sender → condition + photo → WA OTP → handover verify | — |
| `/kontak/pengirim` | O K | Kontak › Pengirim | `+ Tambah Pengirim` | search → table (nama, HP, mask brand, jumlah kiriman, deposit) | Deposit column owner only |
| `/kontak/pengirim/:id` | O K | Kontak › Pengirim › Toko Hijab Nisa | `+ Kiriman dari Pengirim Ini` | profile → `Kirim Sebagai` brands → shipments → deposit ledger (owner) | — |
| `/kontak/penerima` | O K | Kontak › Penerima | `+ Tambah Penerima` | search → table (nama, HP, kota, riwayat COD 🟢🟡🔴) | — |
| `/kontak/penerima/:id` | O K | Kontak › Penerima › Rina K. | `+ Kiriman ke Penerima Ini` | addresses → COD history → shipments | — |
| `/keuangan` | O | Keuangan | `Sinkronkan Sekarang` | 4 balance cards → `Menunggu Saldo` alert → tabs `Ringkasan & Saldo Mengantar · Mutasi Sync Mengantar · Laba per INV · Kas Loket & Shift · Cadangan Retur · Selisih Sync` | Route and API return 403 for Kasir |
| `/pengaturan` | O (K: printer only) | Pengaturan | — | settings sub-menu (desktop: left menu + content; phone: grouped list of rows) per `docs/visual/08` §2; item routes `/pengaturan/<item>` listed in visual 08 §2.3 | Kasir sees only `Printer & Struk` (device part, saved locally) |
| `/kasir/layar-pelanggan` | O K (paired device) | Layar Pelanggan | — | outlet logo → locked line items → total (40 px) → outlet QRIS → `Terima kasih` | P1 (PR-22); no navigation, no cost fields |
| `/pengaturan/<item>` | O (K: `printer`) | Pengaturan › <item> | `Simpan` in sticky save bar, only when dirty | one short form of `Card` sections (visual 08 §2.3) | 403 for Kasir except `printer` |
| `/akun` | O K | Akun Saya | `Simpan` | profile (name, phone) → `Ganti Kata Sandi` → `Ganti Email` (OTP to new email, spec 12) → active sessions with `Keluar dari perangkat ini/lainnya` → text-size preference | opened from the account menu, not the sidebar |
| `/bantuan` | O K | Bantuan & Panduan | `Hubungi Bantuan` (WhatsApp) | searchable guides: first setup, printer on PC (100 mm driver, paper size, 100 % scale), custom domain DNS, COD flow, returns | opened from the account menu |
| `/notifikasi` | O K | Notifikasi | `Tandai Semua Dibaca` | grouped by day; each item deep-links | — |
| `*` 403 / 404 / offline | O K | — | `Kembali ke Dashboard` | plain explanation + who can grant access (403) | Offline: POS queues nothing silently; shows `Koneksi terputus` banner |

### 3.3 Super Admin (`owner.`)

| Route | Title | Primary | Content blocks (order) |
|---|---|---|---|
| `/` | Ringkasan | — | 4 KPI (gerai aktif, kiriman hari ini, pengajuan, sync/relay health) → alerts list → volume trend |
| `/gerai` | Gerai | — | tabs `Pengajuan Baru · Direktori Gerai · Domain Mitra` |
| `/gerai/pengajuan/:id` | Gerai › Pengajuan › Berkah Jaya | `Setujui & Buka Akun Seller Mengantar` | applicant data → pickup map → relay status → slug readiness → reject with reason |
| `/gerai/:slug` | Gerai › Berkah Jaya | — (read-only data) | health, RTS %, Mengantar connection/webhook state; controls (TOTP + reason): masking toggle, `Kuota masking harian`, freeze |
| `/tarif` | Tarif & Kurir | `Simpan Perubahan` (TOTP + reason) | tabs `Diskon & Cashback Gerai · Katalog & Aturan Kurir · Kebijakan Diskon`; assigned vs observed bps editor with status `Belum diterapkan / Sesuai / Selisih` and `Tandai sudah diminta ke Mengantar`; policy tab holds default / minimum / maximum per courier (all 20 % default now) |
| `/pengawasan` | Pengawasan | — | tabs `Pantauan Kiriman & Sync · Radar Risiko COD`; cross-tenant search is read-only |
| `/sistem` | Sistem & Audit | `Simpan` on `Profil Perusahaan` only (TOTP + reason) | tabs `Kesehatan Integrasi & Relay · Log Audit · Akses Admin · Profil Perusahaan` |

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
