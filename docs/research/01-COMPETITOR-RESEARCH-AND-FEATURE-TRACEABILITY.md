# 01 — Competitor Research Synthesis & Feature Traceability (`geraiexpress-cfv2`)

- **Purpose:** carry the 2026-11 competitor research into the v2 repository as one English synthesis, and map
  every finding to the requirement or decision that answers it (or to an explicit deferral).
- **Evidence labels:** **[O]** observed in a public page, bundle, source map, store listing or review;
  **[I]** inferred from observations; **[U]** unknown. Clean-room: patterns only, no vendor code copied.
- **Full sources (not copied here):**
  - `~/Documents/work/research/gerai-ekspedisi-multi-kurir-2026-11/gerai-multi-courier-product-research.md`
  - `~/Documents/work/research/gerai-ekspedisi-multi-kurir-2026-11/rea-deep-dive-2026-11-12.md`
  - `~/Documents/work/research/gerai-ekspedisi-multi-kurir-2026-11/clean-room-system-blueprint.md`
  - Mengantar contracts: `~/Projects/geraiexpress/docs/research/geraiexpress-mengantar-{public-api,partner-api,operations-contract}.md`
  - Cold REA evidence (1.3 GB, sha256-verified): `/data/backups/research/gerai-ekspedisi-multi-kurir-2026-11/`

---

## 1. Market shape [O/I]

Two archetypes get confused:
1. **Online-seller aggregators** (KiriminAja, Biteship, Mengantar seller app, Lincah, Komship): built for sellers
   shipping their own stock. Strong rate comparison, COD, risk scores; weak at walk-in counters (no cash
   receipt, no shift drawer, no return desk).
2. **Agent / PPOB counter apps** (AutoKirim, SIMASRIM, bosAgen, Fastpay, Kurir Pedia): sell starter kits and
   partnership packages; have counters and printing, but freeze balances, mismatch quotes and leak data.

GeraiExpress v2 sits between them: an aggregator-grade engine (Mengantar) under a counter-grade workflow.

## 2. What users complain about (396 recent reviews, 177 negative, 11 apps) [O counts / I coding]

| Rank | Complaint | Count | v2 answer |
|---:|---|---:|---|
| 1 | Balance / COD withdrawal held | 37 | `Saldo Aman` per-resi reserve, never whole-balance freeze — PR-13, spec 02 §4 |
| 2 | Slow / bot customer support | 31 | Proactive exception buckets so the outlet answers first — PR-20; WhatsApp share — PR-19 |
| 3 | App errors / login / OTP | 31 | Email OTP + resumable sign-up — PR-01; offline banner, no silent queue — visual 07 |
| 4 | KYC friction | 30 | Super Admin review instead of video calls — PR-02; optional business data — DEC-218 |
| 5 | COD failure / returns / lost parcels | 24 | `Meja Retur` + claim assistant — PR-17, PR-20 |
| 6 | Account suspended with balance inside | 14 | Balance lives in the outlet's own Mengantar account (Scheme 1) — DEC-203 |
| 7 | COD WhatsApp scams (data leak) | 12 | Privacy tracking, phone gate, recipient masking — PR-15, PR-19 |
| 8 | Courier pickup late / no-show | 8 | Pickup queue, cut-off timer, `Diantar Mandiri ke Cabang` — PR-16 |
| 9 | Unexpected fees | 7 | Line-by-line `Struk Jujur` — PR-07 |
| 10 | Weight / price changed after the fact | 5 (+ press reports) | Scale photo + agreed weight on receipt, `Selisih Berat` tab — PR-05, PR-20 |
| 11 | Receipt / Bluetooth printing | 5 | Web-Bluetooth ESC/POS + PDF fallback + test print — PR-08 |
| 12 | "Commission too small" | 0 | Discounts attract sign-ups; reliability keeps outlets — pricing is not the wedge |

**Product lesson [I]:** outlets join for discounts and leave over held money, weight disputes, slow printing
and leaked recipient data. v2 prioritises those four.

## 3. Competitor patterns worth adopting (clean-room) [O]

| Source | Pattern | Where in v2 |
|---|---|---|
| Komship (public source maps) | Pickup batch as its own entity; AWB/label per batch | spec 04, PR-16 |
| Komship | "Custom Label": up to 15 sender identities (name + phone ≤ 30 chars) | `Kirim Sebagai` brands — PR-14, PR-15 |
| Komship | 15 money fields per order (cashback, service fee, discount, net profit…) | spec 01 money columns |
| Komship | Ideal-balance withdrawal: an explained aggregate buffer (`ideal_balance`) instead of a freeze | `Saldo Aman` — PR-13, made per-resi (bosAgen pattern) |
| Komship | 25 typed ledger transaction codes | Dual-book ledger types — spec 09 |
| Komship | Claim types + stuck buckets 5–14 / 15–30 / 31–60 / >60 days + `Belum Bisa / Bisa Klaim / Kadaluarsa` | PR-20 |
| Komship | Customer reputation by phone: <10 % green, 10–50 % amber, >50 % red | Local COD risk badge — spec 03 |
| bosAgen | Two-part 58 mm print (label + "Potong Disini" + receipt), BLE 20-byte chunks | PR-08, visual 04 |
| bosAgen | `retained_fund` per resi; `return_accept` batch | PR-13, PR-17 (claim appeal `banding_claim`: N/A — Mengantar claims go through its Live Chat) |
| bosAgen | Membership tiers SILVER → TITANIUM with progress | `tier_code` — spec 01 |
| SIMASRIM | Parallel quotes with medals; dynamic courier-required fields; Cargo highlight ≥ 10 kg | PR-06, visual 05 |
| Biteship | 11 independent label visibility toggles + preview | Masking presets matrix — visual 04 |
| Mengantar | Reseller flows; hide-sender-address warning modal about returns | Returns always come back to the outlet — ADR-0005, PR-17 |
| KiriminAja | RTS rate by phone / district; staff shifts + activity log | spec 03 risk badge; PR-10 |
| Lincah | Proactive monitoring tabs (no update, over SLA, weight change) | `Kendala & Klaim` tabs — PR-20 |
| UKURIR | White-label brand, branded resi and WhatsApp, outlet markup | `<slug>.gerai.cc`; markup only as schema-reserved `counter_service_fee_idr` (`0` at launch, publish tariff per DEC-205) |
| Kurir Pedia | Points converted to balance; AI assistant over account data | MCP server — PR-21; points deferred (§5) |

## 4. Five differentiators no competitor combines [I]

1. Reseller pre-books at home, outlet weighs, prints the reseller's own brand, courier picks up at the outlet.
2. One 58 mm print: courier label on top, honest customer receipt below.
3. Per-resi reserve instead of whole-balance freeze.
4. Managed return desk for masked shipments (returns always come back to the outlet).
5. Public tracking that never exposes phone, address, COD amount or POD without a phone check.

## 5. Gaps found during this review and how v2 handles them

| Research module | Gap in v2 docs before this pass | Resolution |
|---|---|---|
| Counter: **customer-facing screen** (customer sees price, not cost) | Not specified | **PR-22 (P1)**: `Layar Pelanggan` view — second browser window/tab or phone showing locked quote, total and QRIS only |
| Counter: **auto-insurance prompt** for high-value goods | Not specified | **PR-07 extended**: goods value ≥ Rp500.000 shows an insurance prompt; fee stays `NULL` until a verified Mengantar field exists (spec 02) |
| Counter: **pickup vehicle hint** from dimensions | Partially (spec 04 `Mobil`) | Shown in `Pickup & Manifest` (PR-16, spec 04, visual 06); not in the courier selector |
| Masking: **anti-abuse controls** | Kill-switch only | **PR-15 extended**: counter-confirmed sender WhatsApp (`wa_verified_at`), `masking_daily_quota`, audit log on each `true_sender` reveal (ADR-0005) |
| Loyalty: **points / stamps for senders** | Not specified | **Deferred to P2 (PR-23)**: stamp card per sender (e.g. 10 sends → 1 discount), stored as outlet-funded promo, no e-money |
| Revenue: **multi-outlet owner** | No UX | **PR-24 (P2)**: one owner who is `gerai_admin` of several tenants; outlet switcher in the sidebar header (visual 07) and per-outlet KPIs |
| Revenue: **marketplace drop-off receipts** | Not specified | Explicit non-goal for the first release (no marketplace drop-point contract) |
| Ops: **QRIS soundbox** | Not specified | Non-goal for launch; QRIS is recorded as a payment method only |
| Security: **no public source maps** | AGENTS.md + DEC | Kept; Komship is the counter-example |

## 6. Regulatory and provider unknowns (carry to counsel / Mengantar) [U]

1. Permenkomdigi 8/2025 Art. 77 (QR identity on postal receipts) vs local masked labels — counsel + physical
   hub scan per courier before masking is advertised (ADR-0005).
2. UU PDP implementing rules for recipient data retention — counsel (spec 05).
3. Cashback/points vs Bank Indonesia e-money rules — keep cashback as shipping credit; counsel before cash-out.
4. Mengantar Q23: IP restriction on Public API writes / label generation for Partner-created sellers (spec 10).
5. Real discounts received by new accounts at competitors — not published; do not use in marketing.

---

## 7. Authenticated AutoKirim (`app.autokirim.com`) REA Deep-Dive & How v2 Perfects It [O]

With owner authorization (as one of the counter systems previously built by the owner), we performed a read-only authenticated REA inspection of `https://app.autokirim.com/` (`19` extracted inline Vue/JS modules analyzed via `rea analyze-javascript-application`; sanitized cold evidence stored at `/data/backups/research/gerai-ekspedisi-multi-kurir-2026-11/autokirim-auth-rea-2026-11-14/`).

### 7.1 Observed Architecture & Menu Map of `app.autokirim.com` [O]
- **Stack:** Server-rendered PHP + inline Vue 2 (`new Vue({ el: '#app' })`), jQuery, Bootstrap 4, `vue-select`, `daterangepicker` (31-day max span, `minDate` 90 days back), Google Maps JS (`PlaceAutocompleteElement`, `AdvancedMarkerElement`, `Geocoder`).
- **Sidebar Menu Structure (10 top-level groups):**
  1. `Dashboard` (`/`) — date range picker (max 31d), `+ Buat Kiriman` CTA, `Detail Pengiriman` (`Paket Berhasil`, `Retur`, `Paket Dibatalkan`), `Rekap Transaksi` table (`Qty`, `Harga Barang`, `Biaya Ongkir`, `Total`).
  2. `Buat Pesanan` ▾ → `Paket Regular` (`/order/regular`) · `Paket Masal` (`/order/masal`, Excel/CSV upload).
  3. `Surat Jalan` ▾ → `Cetak` (`/suratjalan/load`) · `Laporan` (`/suratjalan/load_generated`).
  4. `Bantuan` (`/bantuan`).
  5. `Cek` ▾ → `Cek Resi` (`/check/receipt`) · `Cek Ongkir` (`/check/shipping`).
  6. `Pelanggan` ▾ → `Data Pengirim` (`/customer/sender`) · `Data Penerima` (`/customer/recipient`).
  7. `Laporan` ▾ → `Laporan Komisi` (`/report/commission`) · `Laporan Mutasi Saldo` (`/report/mutation`) · `Laporan Pengiriman` (`/report/shippingv2`, 18 status pills + stuck filter) · `Laporan Masal` (`/report/masal`).
  8. `Ajak Teman` (`/account/affiliate` — Rp100k bonus + up to 1% lifetime commission) & `Poin` (`/account/program_berhadiah`).
  9. `Akun Saya` ▾ → `Profil` (`/account/profile` + 6-digit PIN) · `Saldo & Komisi` (`/account/commission`) · `Withdraw` (`/account/withdraw`) · `Rekening` (`/account/rekening`) · `Pickup Point` (`/account/pickup`) · `Cetak Resi Massal` (`/account/bulk_print_list`) · `User Management Baru` (`/account/user_management`) · `Pengaturan Baru` (`/account/setting`).
  10. `Syarat/Panduan` ▾ → `Syarat dan Ketentuan` · `Panduan` (`/account/guide`).

### 7.2 Key Mechanics Discovered in AutoKirim's Code & How GeraiExpress v2 Upgrades Each [O → v2]

| AutoKirim Mechanism (Observed in JS/DOM) | Friction / Limitation in AutoKirim | How GeraiExpress v2 Perfects It (`DEC-225`) |
|---|---|---|
| **1. Sidebar naming (`Buat Pesanan` vs `Pelanggan` vs `Akun Saya`)** | 10 top-level menus with `Cetak Resi Massal`, `Pickup Point`, and `Saldo` buried inside `Akun Saya`. | Compact **6-menu** sidebar: `Dashboard` · **`Buat Pengiriman`** (renamed from `Kasir` so action != role) · `Kiriman` · `Kontak` (`Pengirim` / `Penerima`) · `Keuangan` · `Pengaturan`. |
| **2. 4-Step Modal Order Flow (`/order/regular`, 98 KB JS)** | Uses 4 separate pop-up modals (`modelSender`, `modelRecipientModal`, `modelPacketModal`, `#reviewModal`) before showing quotes; weight is gram-only (`min 100 g`), auto-switches default tab to `Cargo` when weight `>= 5000 g` or volumetric `L*W*H/6 >= 5000`. | Single-screen 60/40 split POS (`/kiriman/:slug`): destination + weight (`[ gram ● \| kg ]`, default `1000 g`) immediately streams courier quotes without modal hopping; auto-highlights `Cargo` when billable weight `>= 5000 g` (or `>= 10000 g`). |
| **3. Pickup Point vs Sender (`isSenderPP` toggle)** | Has a single boolean `isSenderPP` (*"Jadikan Sebagai Pickup Point"* vs `pickupPointJson`). If unchecked, pickup uses outlet address while sender shows `modelSender`, plus `shippingLabel` settings (`maskShipperPhone`, `showAutokirimLogo`, `shipperAddressType: "Hanya Kota" \| "Hanya Kota dan Kecamatan"`). | Full **3-Way Masking** (`Standar Gerai`, `Dropship Toko`, `Privasi Penerima COD`, `Full Nama Gerai`) where pickup is *always* the outlet, plus mandatory **`Meja Retur`** so RTS parcels returning to the outlet are matched back to `true_sender` via 4-digit WA OTP. |
| **4. COD Fee Bearer (`autoMarkupPrice` vs `isCodAllIn`)** | In `Detail Paket`, operator chooses between **Admin COD Dibayar Pembeli** (`autoMarkupPrice`: calls `POST markup_price` so disbursement equals full item price) vs **Admin COD dan Ongkir Dibayar Pengirim** (`isCodAllIn`: buyer pays item price only; shipping + COD fee deducted from disbursement). Value bounds: COD `Rp10k–Rp5M`, Non-COD/DFOD `Rp10k–Rp20M`. | Adopted cleanly in `spec/02` §3: two-pass COD gross-up (`Buyer Bears Fee` = `Markup Otomatis` vs `Sender Bears Fee` = `COD All-In / Potong Pencairan`) with exact integer Rupiah preview on both POS and receipt stub. |
| **5. Counter Service Fee (`serviceFee`) & Multi-Koli (`koli_qty`)** | Allows optional `Biaya Layanan` (`Rp1.000–Rp200.000`) on `non_cod` and `dfod` orders, plus per-service `koli` count (`koliChange`) and Lion Parcel `commodity` / Paxel `item_size` modals. | Supported in `spec/01` & `spec/02` via `counter_service_fee_idr` (`0` by default, optional `Rp1.000–Rp200.000` on Non-COD/DFOD when enabled by the outlet in `Pengaturan › Packing & Biaya Tambahan`) + dynamic courier-required inputs (commodity/size/koli). |
| **6. Payment Method (`paymentMethod: 'balance' \| 'qris'`)** | Selecting QRIS calls `POST /order/qris` which tops up AutoKirim balance first (`window.location.href = '/order/qris/' + id`) before issuing the AWB — adding redirect friction when the shop already has its own static/dynamic QRIS on the counter. | Under Scheme 1 (`DEC-203` & `DEC-220`), Mengantar debit uses the outlet's Mengantar balance (with `pay-unpaid` fallback if low), while counter customer payment is **recorded locally** (`QRIS gerai`, `Tunai`, `Transfer`, `Deposit`, or `Bayar nanti`) with zero redirect. |
| **7. Label Templates (`templateResi: "full" \| "struct"`) & Bulk Print (`/account/bulk_print_list`)** | Supports `"full"` vs `"struct"`, `showShipperPage`, `unboxingRemarkValue` (`0–50` chars: *"Harap Buat Rekaman Video Saat Membuka Paket"*), and bulk PDF generation up to **50 resi** with `Status Cetak` filter. | Upgraded to **3 explicit 100 mm thermal sticker formats (`DEC-224`)**: `10×15 · Paket + Bukti` (10×10 box label + `✂` + 10×5 sender stub), `10×10 · Paket saja`, `10×15 · Paket saja` + 58 mm Bluetooth roll, custom unboxing remark (`0–50` chars), and **Bulk Print (`<= 50` selected INVs)** directly inside `Kiriman` (`Belum Tercetak / Sudah Tercetak` filter). |
| **8. `Surat Jalan` (`/suratjalan/load` & `load_generated`)** | Filters ready AWBs by courier & service, requires **`Nama Driver`, `No. HP Driver`, `Nopol Kendaraan`**, and generates a printable handover PDF (`surat_jalan_url`). | Integrated into `Kiriman › Pickup & Manifest` (`spec/04`, `PR-16`): combines barcode scan-into-sack verification with **`Nama Driver`, `No. HP Driver`, `Nopol Kendaraan`** + digital signature & printable Surat Jalan PDF. |
| **9. Staff Access Control (`/account/user_management`) & Commission Privacy (`showCommissionFee`)** | Owner ticks granular menu access per staff (`Order Creation`, `Laporan Staff`, `Finance`) and can hide commission on `Cek Ongkir` (`showCommissionFee: "0" \| "1"`). | Enforced at the API/DTO boundary (`spec/05`): `Kasir` role **never** receives net cost, commission, or balance fields in JSON responses, and Owner also gets a 1-click `Tampilkan Margin/Komisi` toggle (`👁`) for customer-facing counter screens. |
