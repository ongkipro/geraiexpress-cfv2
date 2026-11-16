# 08 — Period Filter (Presets + Date Range) & Settings Sub-Navigation

- **Related:** `DEC-221` (period filter), `DEC-223` (settings navigation), `DEC-220` (payment record), `DEC-222`
  (palette), `docs/visual/07` (shell and page inventory), `design/admin-contract.json` (comfort sizes)
- **Component source:** shadcn (base) — `popover`, `calendar` (react-day-picker), `button`, `input`, `field`,
  `card`, `switch`, `separator`, `sidebar` menu primitives. Discover with `shadcn docs <name>`; never hand-roll.
- All visible strings are normative Indonesian. Dates and "today" are always Asia/Jakarta (WIB).

---

## 1. Period filter (`PeriodFilter`)

Used on: Dashboard, Kiriman, Keuangan (Mutasi, Laba per INV, Kas & Shift), Super Admin Ringkasan and Pengawasan.
One component, one behaviour everywhere.

### 1.1 Trigger (closed)

```text
[📅 7 hari terakhir · 8 – 14 Nov 2026  ▾]        ← outline button, h-11 (phone) / h-10 (desktop), 16 px text
[📅 1 – 31 Okt 2026  ▾]                            ← custom range shows only the dates
```

- Label = preset name + resolved dates; a custom range shows dates only.
- `aria-label`: `Periode: 7 hari terakhir, 8 sampai 14 November 2026`.

### 1.2 Open — desktop ≥ 768 px (`Popover`, aligned to the trigger's end)

```text
┌──────────────────────┬─────────────────────────────────────────────────────────────────────┐
│ PERIODE (WIB)        │  ‹  Oktober 2026                         November 2026          ›   │
│                      │  Sen Sel Rab Kam Jum Sab Min      Sen Sel Rab Kam Jum Sab Min       │
│   Hari ini           │                1   2   3   4                          1             │
│   Kemarin            │   5   6   7   8   9  10  11       2   3   4   5   6   7  [8]        │
│ ● 7 hari terakhir    │  12  13  14  15  16  17  18      [9 ][10][11][12][13][14] 15 ░      │
│   30 hari terakhir   │  19  20  21  22  23  24  25      16░ 17░ 18░ 19░ 20░ 21░ 22░        │
│   Bulan ini          │  26  27  28  29  30  31          23░ 24░ 25░ 26░ 27░ 28░ 29░        │
│   Bulan lalu         │                                  30░                                │
│   90 hari terakhir   ├─────────────────────────────────────────────────────────────────────┤
│                      │  Dari [ 08/11/2026 ]   Sampai [ 14/11/2026 ]   7 hari               │
│                      │                                        [Batal]  [Terapkan]          │
└──────────────────────┴─────────────────────────────────────────────────────────────────────┘
  [n] = selected range · ░ = future (disabled) · today (14 Nov) has a ring
```

### 1.3 Open — phone < 768 px (`Drawer`/bottom sheet, full width)

```text
┌──────────────────────────────────────┐
│ Pilih periode                    [✕] │
│ [Hari ini] [Kemarin] [7 hari ●]      │ ← preset chips, wrap, h-11
│ [30 hari] [Bulan ini] [Bulan lalu]   │
│ [90 hari]                            │
│ ──────────────────────────────────── │
│ ‹      November 2026      ›          │ ← one month on phones
│ Sen Sel Rab Kam Jum Sab Min          │
│ …                                    │
│ Dari [08/11/2026] Sampai [14/11/2026]│
│ ──────────────────────────────────── │
│ [ Batal ]          [ Terapkan ]      │ ← sticky footer
└──────────────────────────────────────┘
```

### 1.4 Behaviour contract

| Rule | Value |
|---|---|
| Default | `7 hari terakhir` = today and the 6 previous WIB days |
| Presets | Hari ini · Kemarin · 7 hari terakhir · 30 hari terakhir · Bulan ini · Bulan lalu · 90 hari terakhir |
| Preset click | Applies immediately and closes (no `Terapkan` needed) |
| Calendar | Two months on desktop, one on phones; first click = start, second = end; hover previews the range |
| Typed dates | `Dari` / `Sampai` inputs accept `dd/mm/yyyy`; invalid → field error `Tanggal tidak valid` |
| Limits | No future dates; end ≥ start (swapped automatically); max span 180 days → `Maksimal 180 hari` |
| Apply | `Terapkan` commits a custom range; `Batal` or Esc restores the previous selection |
| URL | `?periode=7d` for presets, `?dari=2026-11-08&sampai=2026-11-14` for custom; back/forward restores it |
| Chart granularity | Hari ini / Kemarin per hour; ≤ 92 days per day; > 92 days per week |
| Comparison | KPI deltas compare with the previous period of equal length, labelled (`vs 1 – 7 Nov`) |
| Keyboard | Trigger focusable; arrow keys move the calendar day; Enter selects; Esc closes; focus returns to trigger |
| Week start | Monday (`Sen`), Indonesian month and day names |

### 1.5 shadcn mapping

`Popover` (desktop) / `Drawer` (phone) → left `RadioGroup`-style preset list (desktop) or `ToggleGroup` chips
(phone) → `Calendar mode="range" numberOfMonths={2|1}` with `disabled={{ after: todayWib }}` and Indonesian
locale → two `Input` in `Field` → footer `Button` outline `Batal` + `Button` `Terapkan`. Sizes from the comfort
contract (day cells ≥ 40 px desktop, ≥ 44 px phone; 16 px text).

---

## 2. Settings sub-navigation (`/pengaturan`)

Replaces the six horizontal tabs (`DEC-223`). Each item is its own route and its own short form.

### 2.1 Desktop ≥ 1024 px

```text
┌─ app shell sidebar ─┬───────────────────────────────────────────────────────────────────────────┐
│                     │ Pengaturan                                                                │
│                     ├───────────────────────┬───────────────────────────────────────────────────┤
│                     │ GERAI                 │ Printer & Struk                                   │
│                     │   Profil Gerai        │ Atur printer kasir dan isi struk pelanggan.       │
│                     │   Mini-Site           │                                                   │
│                     │   Data Usaha          │ ┌ Printer di perangkat ini ─────────────────────┐ │
│                     │ OPERASIONAL           │ │ POS-58 · Bluetooth · terhubung 🟢             │ │
│                     │   Ekspedisi Aktif     │ │ [Tes Cetak]  [Ganti Printer]                  │ │
│                     │ ● Printer & Struk     │ └───────────────────────────────────────────────┘ │
│                     │   Label & Privasi     │ ┌ Format cetak ─────────────────────────────────┐ │
│                     │   Packing & Biaya     │ │ Format label (●) 10×15 + Bukti ( ) 10×10      │ │
│                     │ AKUN & AKSES          │ │              ( ) 10×15 Paket saja             │ │
│                     │   Anggota             │ │ Ketebalan      (●) Normal ( ) Tebal           │ │
│                     │   Mengantar      ⚠    │ └───────────────────────────────────────────────┘ │
│                     │   API & MCP           │ ┌ Isi struk ────────────────────────────────────┐ │
│                     │                       │ │ Tampilkan WA gerai           [● on ]          │ │
│                     │                       │ │ Catatan kaki  [Terima kasih sudah ...     ]   │ │
│                     │                       │ └───────────────────────────────────────────────┘ │
│                     │                       ├───────────────────────────────────────────────────┤
│                     │                       │ Ada perubahan belum disimpan   [Batal] [Simpan]   │ ← only when dirty
└─────────────────────┴───────────────────────┴───────────────────────────────────────────────────┘
   settings menu 240 px, group labels 14 px semibold (sentence case, not tracked caps in the build),
   items h-10 / 16 px, current item marked (accent background + aria-current="page"), status hint icons
   only where action is needed (⚠ Mengantar webhook not active)
```

### 2.2 Phone < 768 px

```text
/pengaturan                               /pengaturan/printer
┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
│ ☰  Pengaturan            [🔍] [📷]   │  │ ‹ Pengaturan                         │
├──────────────────────────────────────┤  │ Printer & Struk                      │
│ Gerai                                │  ├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │  │ ┌ Printer di perangkat ini ────────┐ │
│ │ Profil Gerai          Berkah J. ›│ │  │ │ POS-58 · terhubung 🟢            │ │
│ │ Mini-Site   berkahjaya.geraimi… ›│ │  │ │ [Tes Cetak]  [Ganti Printer]     │ │
│ │ Data Usaha        Belum diisi   ›│ │  │ └──────────────────────────────────┘ │
│ └──────────────────────────────────┘ │  │ …                                    │
│ Operasional                          │  ├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │  │ [ Batal ]           [ Simpan ]       │ ← sticky, only when dirty
│ │ Ekspedisi Aktif       8 aktif   ›│ │  └──────────────────────────────────────┘
│ │ Printer & Struk     POS-58 🟢   ›│ │
│ │ Label & Privasi  Masking aktif  ›│ │
│ │ Packing & Biaya      4 item     ›│ │
│ └──────────────────────────────────┘ │
│ Akun & Akses                         │
│ ┌──────────────────────────────────┐ │
│ │ Anggota              3 orang    ›│ │
│ │ Mengantar  ⚠ Webhook belum aktif›│ │
│ │ API & MCP            1 kunci    ›│ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
  rows ≥ 56 px, whole row is the link, status text 14 px muted (warn colour + icon when action needed)
```

### 2.3 Settings pages and what each contains

| Route | Group | Who | Sections (`Card` each) | Save model |
|---|---|---|---|---|
| `/pengaturan/profil` | Gerai | O | Nama gerai, logo, WhatsApp, jam buka, alamat & titik peta | Save bar |
| `/pengaturan/mini-site` | Gerai | O | Preview `<slug>.geraimitra.com`, teks sambutan, layanan yang tampil, QR poster A4/A5, domain sendiri (Pro) | Save bar |
| `/pengaturan/data-usaha` | Gerai | O | Bentuk usaha, nama resmi, NIB, NPWP (encrypted), penanggung jawab — all optional (`DEC-218`) | Save bar |
| `/pengaturan/ekspedisi` | Operasional | O | List of couriers with `Switch` per row (instant save + toast `J&T dinonaktifkan`), pickup mode, assigned discount with its status `Belum diterapkan / Sesuai / Selisih` (read-only, set by Super Admin) | Instant |
| `/pengaturan/printer` | Operasional | O K | This device's printer (local, Kasir allowed) and density; outlet default label format: `10×15 · Paket + Bukti` / `10×10 · Paket saja` / `10×15 · Paket saja` / 58 mm roll (DEC-224, owner); receipt/stub content incl. `Catatan video unboxing` (0–50 chars, empty hides it) and `Tampilkan komisi di Cek Ongkir Cepat` (owner-only switch, default off) — fields in spec 01 §2.4 (owner) | Device part instant; receipt part Save bar |
| `/pengaturan/label-privasi` | Operasional | O | `Aktifkan masking label` switch; presets the counter may offer (`Standar Gerai` always; `Dropship Toko`, `Privasi Penerima COD`, `Full Nama Gerai` optional); default preset; mask recipient phone on COD by default (DEC-231). Disabled with an explanation when the Super Admin kill-switch is off | Save bar |
| `/pengaturan/packing` | Operasional | O | Packing add-on catalogue (Plastik, Bubble, Kardus S/M/L) with price; optional `Biaya Layanan Loket` (`Aktifkan` switch + default amount `Rp1.000–Rp200.000`, Non-COD and COD Ongkir only, printed as its own line — DEC-225) | Save bar |
| `/pengaturan/anggota` | Akun & Akses | O | Members table, invite Kasir (email), revoke, last activity; switch `Kasir boleh bayar COD` (spec 03 §1.2) | Row actions with confirm |
| `/pengaturan/mengantar` | Akun & Akses | O | Connection status, webhook status + copy URL + paste secret (PR-02b), pickup `area_id`, last sync | Save bar (secret only) |
| `/pengaturan/api-mcp` | Akun & Akses | O | Keys table (name, scopes, last used), `Buat Kunci` dialog (shown once), revoke, links to `/api/v1/docs` and `/mcp` | Dialog per action |

Kasir sees only `Printer & Struk` (device part); every other route returns the 403 page with
`Menu ini khusus pemilik gerai`.

### 2.4 Rules

1. One form per page; never more than ~6 fields per `Card`; labels above inputs; helper text only where it
   prevents a mistake.
2. Never mix instant toggles and Save in one `Card` (Pajamas/Shopify rule in `admin-product-ux`).
3. Save bar appears only when the form is dirty; leaving a dirty page asks `Buang perubahan?`.
4. Danger actions (revoke key, remove member, disconnect Mengantar) sit in a separate `Zona berbahaya` card at the
   bottom with a confirm dialog that names the object.
5. Status hints in the menu (⚠) only for something that blocks operation (webhook inactive, printer missing,
   Data Usaha required for an invoice the owner requested) — not for optional fields.
6. Settings menu items are links (`<a>` with `aria-current="page"`), so browser back and deep links work.

### 2.5 shadcn mapping

Settings menu: `SidebarMenu` / `SidebarMenuButton` primitives rendered inside the page (not a second app
sidebar) with `SidebarGroupLabel` per group; phone list: `Item`-style rows or `Card` + `Separator` rows with a
trailing chevron; forms: `Card` + `FieldGroup` + `Field` + `Input` / `Select` / `RadioGroup` / `Switch`;
save bar: sticky footer `div` with `Button` outline `Batal` + `Button` `Simpan`; confirmations: `AlertDialog`.
