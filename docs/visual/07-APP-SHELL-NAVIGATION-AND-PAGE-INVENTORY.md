# 07 — App Shell, Navigation Placement & Page Inventory (`geraiexpress-cfv2`)

- **Related:** `DEC-212`, `DEC-213`, `DEC-218`, `docs/spec/06-DOMAINS-MENUS-AND-ROUTES.md` (routes),
  `design/admin-contract.json` (size contract **comfort**), `docs/visual/01` (tokens)
- **Purpose:** one place that says *where* every navigation element sits, *what* every page contains, and *who*
  sees it. Wireframes in `02`, `05`, `06` show page bodies; this file owns the frame around them.
- All visible strings are normative Indonesian. Sizes follow the comfort contract: body 16 px, nothing visible
  under 14 px, inputs 44 px (toolbar 40 px desktop), sidebar links 40 px / 16 px, header 64 px; every touch
  target on phones ≥ 44 px (`h-11 md:h-10`).

---

## 1. App Shell — `app.geraiexpress.com`

### 1.1 Desktop ≥ 1024 px (counter PC, laptop 1366)

```text
┌────────────────────┬──────────────────────────────────────────────────────────────────────────────┐
│ [G] Berkah Jaya  ▾ │ Dashboard                        [🔍 Cari INV / AWB / HP  Ctrl+K]  [🔔 3] [Ani ▾]│ ← header 64 px
│ berkahjaya.gerai.cc│                                          [📷 Scan QR]  [+ Kiriman Baru]       │
├────────────────────┼──────────────────────────────────────────────────────────────────────────────┤
│ ● Dashboard        │                                                                              │
│ ○ Kasir            │   PAGE BODY (max width 1440, padding 24 × 16)                                │
│ ○ Kiriman      22  │   page title 28 px · in-page tabs under the title · then content             │
│ ○ Kontak         ▾ │                                                                              │
│    Pengirim        │                                                                              │
│    Penerima        │                                                                              │
│ ○ Keuangan         │   (hidden for Kasir, also blocked by the API)                                │
│ ○ Pengaturan       │                                                                              │
│                    │                                                                              │
│ ────────────────── │                                                                              │
│ 🟢 Printer POS-58  │ ← sidebar footer: device status, not navigation                              │
│ Shift Pagi · Ani   │                                                                              │
│ [« Ciutkan]        │                                                                              │
└────────────────────┴──────────────────────────────────────────────────────────────────────────────┘
  sidebar 256 px (rail 56 px when collapsed; label tooltips on hover AND focus)
```

**Placement rules**

| Zone | Contains | Never contains |
|---|---|---|
| Sidebar header | Outlet logo + name (`▾` opens the outlet switcher only when the user is a member of >1 tenant, PR-24), mini-site link | Promo, upgrade banners |
| Sidebar nav | The 6 menus, in this order; `Kontak` expands to 2 sub-items; badge counts only on `Kiriman` (items needing action) | Third-level links, settings sub-tabs, external links |
| Sidebar footer | Printer status (🟢/🟠/🔴 + text), active shift + cashier name, collapse toggle | Logout (lives in the account menu) |
| Header left | Page title of the current menu (breadcrumb only on detail pages: `Kiriman › INV 8K4M2P7`) | Menu duplication |
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
│ [🏠 Beranda] [🧾 Kasir] [ ＋ ] [📦 Kiriman] [☰ Lainnya] │ ← bottom bar 64 px, labels 14 px
└──────────────────────────────────────┘
```

- Bottom bar: `Beranda` (Dashboard) · `Kasir` · center **`＋`** (= `+ Kiriman Baru`, 56 px) · `Kiriman` · `Lainnya`.
  The center `＋` follows the header rule: filled only on `Dashboard`, `/kasir`, `/kiriman`; outline elsewhere.
  Commit flows (`/kasir/multi`, `/kasir/shift`, `/kiriman/pickup/:batch`, `/kiriman/retur/:awb`) replace the
  bottom bar with their sticky commit bar. Page bodies never repeat a `+ Kiriman Baru` button.
- `Lainnya` opens a sheet with `Kontak › Pengirim`, `Kontak › Penerima`, `Keuangan` (owner only), `Pengaturan`,
  printer status, `Keluar`.
- On `/kiriman/:slug` the bottom bar is replaced by the sticky **checkout bar** (`Total Rp 27.000` + `Bayar & Cetak`).

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
| `/` | O | Dashboard | `+ Kiriman Baru` | period switch → 4 KPI → `Perlu Tindakan` chips → trend chart + courier RTS table → top senders + source/tier | — |
| `/` | K | Tugas Loket Hari Ini | `+ Kiriman Baru` | shift card → `Siap Pickup` per courier → `Meja Retur` waiting → recent INV list | No money totals, no Mengantar balance |
| `/kasir` | O K | Kasir | `+ Kiriman Baru` | tabs `Kiriman Baru · Multi-Paket · Cek Cepat · Shift Kas`; default tab = recent drafts + scan QR box | Margin toggle owner only |
| `/kiriman/:slug` | O K | Kiriman › INV 8K4M2P7 | `Bayar & Cetak` | left 60 %: tujuan & berat → ekspedisi → pengirim & masking → penerima & isi; right 40 %: locked summary → pembayaran → cetak | Kasir sees customer price only |
| `/kiriman/:slug` (issued) | O K | Kiriman › INV 8K4M2P7 | `Cetak Ulang` | status stepper → AWB + label preview → payment record → event timeline → actions (`Batalkan`, `Kirim WA`); masked INV: `Lihat Pengirim Asli` (reason + audit) | Cost/margin rows owner only |
| `/kasir/multi` | O K | Kasir › Multi-Paket | `Bayar & Cetak Semua` | sender picker → parcel rows (destination, weight, courier per row) → batch total → print queue | Kasir sees customer price only |
| `/kasir/cek-cepat` | O K | Kasir › Cek Cepat | `Buat Kiriman dari Hasil Ini` | destination + weight → courier price list → COD risk badge | Creates no draft until the primary is pressed |
| `/kasir/shift` | O K | Kasir › Shift Kas | `Buka Shift` / `Tutup Shift` | opening cash → live totals (Tunai/QRIS/Transfer) → closing count → variance | Kasir: own shift; owner: all shifts |
| `/kiriman` | O K | Kiriman | `+ Kiriman Baru` | tabs `Semua · Draf QR · Menunggu Saldo · Pickup & Manifest · Kendala & Klaim · Meja Retur` → filter bar → table | Cost/margin columns + CSV owner only |
| `/kiriman/pickup/:batch` | O K | Kiriman › Manifest J&T 16:00 | `Selesai & Tanda Tangan` | scan box (wrong courier = red alert + sound) → scanned list → missing list → signature | — |
| `/kiriman/retur/:awb` | O K | Kiriman › Meja Retur › JT77… | `Kirim Kode Ambil` | true sender → condition + photo → WA OTP → handover verify | — |
| `/kontak/pengirim` | O K | Kontak › Pengirim | `+ Tambah Pengirim` | search → table (nama, HP, mask brand, jumlah kiriman, deposit) | Deposit column owner only |
| `/kontak/pengirim/:id` | O K | Kontak › Pengirim › Toko Hijab Nisa | `+ Kiriman dari Pengirim Ini` | profile → `Kirim Sebagai` brands → shipments → deposit ledger (owner) | — |
| `/kontak/penerima` | O K | Kontak › Penerima | `+ Tambah Penerima` | search → table (nama, HP, kota, riwayat COD 🟢🟡🔴) | — |
| `/kontak/penerima/:id` | O K | Kontak › Penerima › Rina K. | `+ Kiriman ke Penerima Ini` | addresses → COD history → shipments | — |
| `/keuangan` | O | Keuangan | `Sinkronkan Sekarang` | 4 balance cards → `Menunggu Saldo` alert → tabs `Ringkasan & Saldo Mengantar · Mutasi Sync Mengantar · Laba per INV · Kas Loket & Shift · Cadangan Retur · Selisih Sync` | Route and API return 403 for Kasir |
| `/pengaturan` | O (K: printer only) | Pengaturan | Owner: `Simpan` (sticky bar, appears on change) | tabs `Mini-Site · Ekspedisi Aktif · Printer & Packing · Outlet & Mengantar (+ Data Usaha opsional) · Anggota · API & MCP` | Kasir sees only `Printer & Packing › Printer`: pair/test Bluetooth and density on this device (stored locally, no `Simpan`) |
| `/kasir/layar-pelanggan` | O K (paired device) | Layar Pelanggan | — | outlet logo → locked line items → total (40 px) → outlet QRIS → `Terima kasih` | P1 (PR-22); no navigation, no cost fields |
| `/notifikasi` | O K | Notifikasi | `Tandai Semua Dibaca` | grouped by day; each item deep-links | — |
| `*` 403 / 404 / offline | O K | — | `Kembali ke Dashboard` | plain explanation + who can grant access (403) | Offline: POS queues nothing silently; shows `Koneksi terputus` banner |

### 3.3 Super Admin (`owner.`)

| Route | Title | Primary | Content blocks (order) |
|---|---|---|---|
| `/` | Ringkasan | — | 4 KPI (gerai aktif, kiriman hari ini, pengajuan, sync/relay health) → alerts list → volume trend |
| `/gerai` | Gerai | — | tabs `Pengajuan Baru · Direktori Gerai · Domain Mitra` |
| `/gerai/pengajuan/:id` | Gerai › Pengajuan › Berkah Jaya | `Setujui & Buka Akun Seller Mengantar` | applicant data → pickup map → relay status → slug readiness → reject with reason |
| `/gerai/:slug` | Gerai › Berkah Jaya | — (read-only data) | health, RTS %, Mengantar connection/webhook state; controls (TOTP + reason): masking toggle, `Kuota masking harian`, freeze |
| `/tarif` | Tarif & Kurir | `Simpan Perubahan` (TOTP + reason) | tabs `Diskon & Cashback Gerai · Katalog & Aturan Kurir`; observed vs assigned bps editor |
| `/pengawasan` | Pengawasan | — | tabs `Pantauan Kiriman & Sync · Radar Risiko COD`; cross-tenant search is read-only |
| `/sistem` | Sistem & Audit | `Simpan` on `Profil Perusahaan` only (TOTP + reason) | tabs `Kesehatan Integrasi & Relay · Log Audit · Akses Admin · Profil Perusahaan` |

### 3.4 Public (`geraiexpress.com`, `<slug>.gerai.cc`)

Public pages follow `docs/visual/03` and the public size floor (body ≥ 17 px, nothing under 14 px).
Routes: `geraiexpress.com/ · /fitur · /cara-kerja · /simulasi-kasir · /hubungi-kami · /ketentuan · /privasi`;
mini-site `/ · /kirim/:slug · /lacak · /lacak/:kode · /inv/:slug`. `geraiexpress.com` footer renders only the filled
public fields of `platform_legal_profile` (never NPWP); mini-site footers show the outlet identity plus
`Didukung jaringan resmi GeraiExpress` and a link to `https://geraiexpress.com/privasi` (`DEC-218`, spec 01 §2.1b).

---

## 4. shadcn Component Map (comfort contract, primitives edited once)

| Frame element | shadcn component | Comfort edits (in the owned file, never per call) |
|---|---|---|
| Sidebar | `Sidebar`, `SidebarMenu`, `SidebarMenuButton`, `SidebarMenuSub` | `SidebarMenuButton` `h-11 md:h-10 text-base`; rail `size-10!`; `SIDEBAR_WIDTH_ICON 3.5rem` |
| Header search | `Command` in `Dialog` (`Ctrl+K`) | input `h-11 text-base` |
| Account / outlet menu | `DropdownMenu` | items `h-11 md:h-10 text-base` |
| In-page tabs | `Tabs` | trigger `h-11 md:h-10 text-base` |
| Tables | `Table` (+ TanStack for sorting/pagination) | head `h-11 text-sm font-medium`, cell `px-3 py-2 text-base`, `tabular-nums` for money/weights |
| Forms | `Field`, `Input`, `Select`, `Textarea`, `ToggleGroup` (gram/kg) | `h-11 text-base` everywhere |
| Status | `Badge` | `text-sm`, icon + text + color |
| Mobile drawer / sheets | `Sheet`, `Drawer` | title `text-lg` |
| Toasts | `Sonner` | `text-base` |

Acceptance: `dotuiux check <url> --surface admin` and
`admin-geometry.mjs <url> --contract design/admin-contract.json --viewports 390,1366,1536` exit 0 on every route
above that renders, in a seeded state.
