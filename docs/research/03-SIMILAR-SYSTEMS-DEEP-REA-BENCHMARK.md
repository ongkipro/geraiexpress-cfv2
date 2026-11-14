# 03 — Deep REA Benchmark of Similar Multi-Courier Systems (`bosAgen`, `Komship`, `SIMASRIM`, `Mengantar`, `Biteship`, `KiriminAja`, `Lincah`, `UKURIR`, `Kurir Pedia`)

- **Date:** 2026-11-14
- **Purpose:** Comprehensive clean-room reference of every similar Indonesian multi-courier counter and aggregator system inspected via REA static analysis, public source maps (`bosagen_app.map`, `bosagen_c1.map`, `mengantar_form.map`, `partner.komerce.id/*.map`), and bundle teardowns — paired with `docs/research/02-AUTOKIRIM-AUTHENTICATED-REA-TEARDOWN.md` so `geraiexpress-cfv2` surpasses all of them.
- **Cold Evidence Archive:** `/data/backups/research/gerai-ekspedisi-multi-kurir-2026-11/` (`rea-evidence/`, `sourcemaps/`, `autokirim-auth-rea-2026-11-14/`).

---

## 1. Cross-Platform Sidebar & Information Architecture Comparison [O]

Why renaming Menu #2 from `Kasir` to **`Buat Pengiriman`** (`DEC-225`) is the right industry and ergonomic decision:

| Platform | Menu #1 | Menu #2 (Order Creation) | Menu #3 (Shipments / Manifest) | Menu #4 (Contacts / Check) | Menu #5 (Finance) | Menu #6 (Settings / Other) |
|---|---|---|---|---|---|---|
| **AutoKirim** (`app.autokirim.com`) | `Dashboard` | **`Buat Pesanan`** (`Paket Regular`, `Paket Masal`) | `Surat Jalan` (`Cetak`, `Laporan`) + `Laporan Pengiriman` | `Pelanggan` (`Data Pengirim`, `Data Penerima`) + `Cek` | `Akun Saya › Saldo & Komisi / Withdraw` + `Laporan Mutasi` | `Akun Saya › Pickup Point / Cetak Massal / User Mgmt / Pengaturan` |
| **bosAgen Owner** (`sidemenushipper.js`) | `Dashboard` | **`Buat Kiriman`** (`Entri Manual`, `Entri Batch`) | `Pengiriman` (`Riwayat Kiriman`, `Draft Kiriman`, `Kiriman Batch`) | `Biaya Kiriman` (`Cek Ongkir`, `Kalkulator`) + `Cek Resi` | **`BukuBos`** (`Saldo`, `Ongkir`, `Ongkir Retur`) | `Tiket & Klaim` + `Pengaturan` (`Pengaturan Kurir`, `Rekening`, `Buat PIN`, `Kode Tujuan`) |
| **bosAgen CS / Staff** (`sidemenushippercs.js`) | `Dashboard` (`/dashboard-cs`) | **`Buat Pesanan`** (`Entri Manual`, `Import File`) | `Daftar Pesanan` + `Riwayat Kiriman` | `Biaya Kiriman` + `Cek Resi` | *(Hidden — `BukuBos` removed from CS sidebar)* | `Tiket & Klaim` + `Pengaturan` (`Profil`, `Kode Tujuan` — no courier/bank/PIN) |
| **Komship** (`partner.komerce.id`) | `Dashboard` | **`Order`** (`Tambah Order`, `Order Massal`, `Data Order`) | `Pickup` (`Ajukan Pickup`, `Riwayat Pickup`) | `Kendala` + `Lacak Resi` + `Cek Ongkir` | `Keuangan` (`Saldo`, `Penghasilan`) | `Pengaturan` (`Profil`, `Gudang`, `Ekspedisi`, `Custom Label`, `PIN`) |
| **SIMASRIM** (`app.simasrim.com`) | `Dashboard` | **`Kirim Instan`** (`/kirim-instan`, `/cetak_resi_instan/buat`) | `Riwayat Pengiriman` | `Cek Ongkir & Resi` (`cek.simasrim.com`) | `Saldo & Mutasi` / `Cashback` | `Pengaturan Toko & Sub-Agen` |
| **GeraiExpress v2** (`DEC-213`, `DEC-225`) | **`Dashboard`** | **`Buat Pengiriman`** (`Kiriman Baru`, `Multi-Paket`, `Cek Cepat`, `Shift Loket`) | **`Kiriman`** (`Semua`, `Belum Dibayar`, `Draf QR`, `Menunggu Saldo`, `Pickup & Manifest`, `Kendala & Klaim`, `Meja Retur`) | **`Kontak`** (`Pengirim`, `Penerima`) | **`Keuangan`** *(Owner only — hidden & 403 for Kasir)* | **`Pengaturan`** *(9 sub-menu routes; Kasir sees device printer only)* |

---

## 2. System-by-System Deep Technical Findings [O]

### 2.1 `bosAgen` (`app.bosagen.com` — Extracted from `bosagen_app.map` & `bosagen_c1.map`)
1. **Role-Split Views & Sidebars (`router.js`, `sidemenushipper.js`, `sidemenushippercs.js`):**
   - `role_id == 12` (CS / Counter Staff) loads `DashboardShipperCs.vue` and `sidemenushippercs.js`, which strips `BukuBos` (`Saldo`, `Ongkir`, `Ongkir Retur`), `Pengaturan Kurir` (`/kustom-kurir`), `Rekening`, and `Buat PIN`, ; separately, `Riwayat.vue` disables the Excel download for `role_id == 3` (`:disabled="downloading || userInfo.role_id == 3"`) — the role 3 mapping was not established, so this is not attributed to CS (role 12).
   - Owners (`role_id > 10 && role_id != 12`) can switch between `DashboardShipperNew.vue` (`reguler`) and `DashboardShipperLite.vue`.
2. **Web-Bluetooth Thermal Printing (`ReceiptPrinter.js` & `ShippingReceiptPrinter.js`):**
   - Uses `@point-of-sale/webbluetooth-receipt-printer` and `@point-of-sale/receipt-printer-encoder` (`columns: 32`).
   - Sends bytes in **20-byte BLE chunks** (`const chunkSize = 20`) and supports `beginBatch()` / `endBatch()` to keep the Bluetooth connection open across batch prints.
   - **Two-Part Layout (`ShippingReceiptPrinter.js`):**
     - **Top half (Parcel Label):** Atkinson-dithered logo (`312×72`), `code128` barcode, 3-column table `[courierCode, service_code, COD / NON COD]`, `Pengirim`, `Penerima` + full address, `Berat Barang`, `Nilai COD` (if COD), and inverted double-height `sorting_code`.
     - **Cut line:** `['--------', 'Potong Disini', '--------']`.
     - **Bottom half (`-- Bagian ini untuk customer --`):** repeats logo, barcode, sender, recipient, weight, and if COD prints **`Total Pencairan`** (`data.grand_total`) instead of `Nilai COD`.
   - **Critical Flaws Found in `bosAgen`'s Printer Code (Planned Mitigation in `geraiexpress-cfv2`):**
     - *Flaw 1 — External Barcode Leak & Latency:* `getPrintPreview()` renders barcodes and QR codes via `<img src="https://bwipjs-api.metafloor.com/?...">`, leaking every AWB to a third-party server and breaking offline/slow-network previews. `geraiexpress-cfv2` specifies rendering `Code128` and QR codes **locally in the browser/Worker** (no third-party image service).
     - *Flaw 2 — No Non-COD Price or Payment Status on Customer Stub:* on Non-COD shipments, `bosAgen`'s bottom stub prints zero Rupiah figures and no payment status. `geraiexpress-cfv2` prints the full itemized breakdown + `LUNAS · QRIS GERAI / TUNAI / TRANSFER` or inverted `BELUM DIBAYAR` (`DEC-220`) on both the **10×5 cm sender stub** (`10×15 · Paket + Bukti`, `DEC-224`) and the 58 mm roll.
3. **Claims, Retur Batch & Held Funds (`FormClaim.vue`, `FormClosingClaim.vue`, `router_ext.js`):**
   - `FormClaim.vue` supports multi-file image attachment upload (`userfile[]`), category selection (`v-select`), and a `special` flag (*"Ajukan Klaim Khusus"*).
   - Dedicated endpoints for batch return validation (`/order/retur_validate`, `/order/return_accept`), per-resi held funds (`/payment/saldo/retained_fund`), and courier markup customization (`/kustom-kurir`).

### 2.2 `Komship` (`partner.komerce.id` — Extracted from Public Vue Source Maps)
1. **Order vs Pickup Separation (`AddOrder.js`, `PickupOrderDetail.vue`):**
   - Orders are created into a staging pool first; AWB issuance happens when the operator submits **Ajukan Pickup** (`courier, pickup_date, pickup_time, pickup_vehicle`), after which labels can be batch-printed per pickup batch with a `Belum Dicetak / Sudah Dicetak` filter.
2. **Custom Label (Sender Masking, `customLabel.js`):**
   - Stores up to **15 sender identities** (`name_label`, `phone_label`, max 30 chars) selectable via *"Kirim Sebagai"* on the order form, plus a toggle to show/hide shipping cost on the label.
3. **15-Field Order Money Breakdown & `Saldo Ideal` (`Saldo.js`, `Balance.vue`):**
   - Tracks `shipping_cost`, `cashback`, `service_fee`, `discount`, `additional_cost`, `insurance_fee`, `net_profit`, `grandtotal` per order.
   - Computes `Saldo Ideal = Potensi Pendapatan Order Dikirim − Ongkir Retur Ketika Sampai − Resiko Ongkir Menjadi Retur` so withdrawals only reserve active return exposure rather than freezing the entire wallet.
4. **3-Band Phone RTS Reputation & 4 Stuck Buckets:**
   - Live customer phone check (`<10%` green, `10–50%` amber, `>50%` red) and 5-month destination return rate per courier.
   - Problem parcels bucketed by stuck duration (`5–14`, `15–30`, `31–60`, `>60` days) and claim eligibility (`Belum Bisa Claim`, `Bisa Claim`, `Kadaluarsa`).

### 2.3 `SIMASRIM` (`app.simasrim.com` — Extracted from Bundle & Public POS)
1. **Single-Screen Counter Speed (`/kirim-instan`):**
   - Parallel multi-courier tariff comparison with instant highlight medals (**Termurah**, **Tercepat**, **Rekomendasi**).
   - Automatically highlights **Cargo** services when weight reaches the cargo threshold.
   - Progressive disclosure of courier-specific fields: only asks for commodity code, GPS pinpoint, or mandatory insurance when the selected courier requires it.
2. **Flexible Cashback Recipient:**
   - Lets the counter choose whether deferred cashback is credited to the **Outlet** or passed through to a **Loyal Sender / Reseller**.

### 2.4 `Mengantar` (`app.mengantar.com` & `mengantar_form.map` — 97 Vue Modules)
1. **Courier Constants & Rules (`src/constants/courier.constant.js`):**
   - Canonical courier keys: `JNE`, `JNECargo`, `SiCepat`, `SiCepatCargo`, `Sap`, `SAPLite`, `SapCargo`, `iDexpress`, `iDlite`, `iDexpressCargo`, `JT`, `JTCargo`, `lion`, `lionCargo`, `paxel`, `paxelCargo`, `anteraja`, `pos`, `spx`, `spxCargo`.
   - Vehicle volume flags (`volumeMotor`, `volumeMobil`, `volumeTruck`), `MAX_NON_COD = 5000000`, `DEFAULT_MINIMUM_WEIGHT = 10` kg for cargo (`SapCargo` uses dynamic `minimumWeightCargo`), and `PINPOINT_TYPE = { FORCE, OPTIONAL }`.
2. **Quote Card Warnings & Net Formula (`CardEstimation.vue`):**
   - Three visual states on quote cards: `danger` (`data.unsupported` → red `#D72C0D` icon), `warning` (`data.unsupported_cod`), and `warningPickup` (`unsupportedOriginSicepat || unsupportedOriginSpx || unsupportedOriginNinja` → *"Pickup tidak tercover"*).
   - Net price formula: `total = specialPrice - (iDliteDiscount || 0)` where `specialPrice = isCargo ? cargoEstimatedSpecialPrice : estimatedSpecialPrice`.
3. **Standardized Tracking Status Groups (`src/data/trackingStatus.js`):**
   - Groups raw courier scan codes (`RC1`, `PU1`, `OP1..OP3`, `TP1..TP5`, `IP1..IP3`, `BI1`) into `PICK UP PROCESS`, `OUTBOUND PROCESS`, `GATEWAY PROCESS`, and `INBOUND PROCESS`, tagging delayed inbound/gateway scans with `tag: 'attention'` and `description: 'contactToConfirm'`.

### 2.5 `Biteship`, `KiriminAja`, `Lincah`, `UKURIR`, `Kurir Pedia` [O]
- **Biteship:** 11 independent label visibility toggles (`origin_phone_shown`, `origin_address_shown`, `receiver_phone_shown`, `censor_receiver_name`, `shipping_fee_shown`, `insurance_fee_shown`, `item_description_shown`, `paper_size`) with live preview endpoint.
- **KiriminAja:** RTS rate by phone and by district, staff shift management + activity logs, and COD Advance.
- **Lincah:** 60+ granular staff permissions (`canMonitorChangeWeight`, `canMonitorOverSla`) and dedicated monitoring tabs for weight discrepancies (`/monitoring/shipping-change`), no-update parcels (`/monitoring/no-update`), and over-SLA parcels (`/monitoring/over-sla`).
- **UKURIR:** White-label partner domain, custom-branded thermal labels & WhatsApp notifications, and configurable counter markup / first-mile fee.
- **Kurir Pedia:** AI assistant (`AIRI`) over account shipment/commission data (superseded in `geraiexpress-cfv2` by our scoped **OpenAPI 3.1 + Remote MCP Server**, `spec/08`).

---

## 3. Master Synthesis: How `geraiexpress-cfv2` Combines the Best of All 10 Systems

| Capability | Proven Source(s) | `geraiexpress-cfv2` Contract |
|---|---|---|
| **Sidebar Menu #2 = `Buat Pengiriman`** | AutoKirim (`Buat Pesanan`), bosAgen (`Buat Kiriman`) | `DEC-225`, `spec/06`, `visual/02,07`: 6 menus (`Dashboard` · **`Buat Pengiriman`** · `Kiriman` · `Kontak` · `Keuangan` · `Pengaturan`) |
| **100 mm Thermal Sticker Trio (`10×15 Paket+Bukti`, `10×10 Paket`, `10×15 Paket`) + 58 mm Roll** | Owner direction + AutoKirim (`full`/`struct`, `showShipperPage`) + bosAgen (`Potong Disini`) + Mengantar (`thermal-10x10`/`10x15`) | `DEC-224`, `visual/04` §3: 10×15 split into **10×10 parcel label + 10×5 sender receipt stub**, 10×10 parcel-only, 10×15 parcel-only, plus 58 mm roll |
| **Local Counter Payment Recording (`Lunas` vs `Belum Dibayar`)** | Owner direction (fixing AutoKirim QRIS redirect & bosAgen blank Non-COD stub) | `DEC-220`, `spec/01,03`, `visual/04`: records `QRIS gerai`, `Tunai`, `Transfer`, `Deposit`, or `Bayar nanti` (`BELUM DIBAYAR` inverted on stub/receipt) |
| **COD Fee Bearer (`Tagih ke Penerima / Markup` vs `COD All-In / Potong Pencairan`)** | AutoKirim (`autoMarkupPrice` vs `isCodAllIn`) | `DEC-225`, `spec/02` §3, `visual/05`: 1-click choice on COD Barang with exact disbursement preview |
| **Optional Counter Service Fee (`Biaya Layanan Loket`)** | AutoKirim (`service_fee` Rp1k–200k), bosAgen (`/kustom-kurir`), UKURIR | `DEC-225`, `spec/01,02`: `counter_service_fee_idr` (`0` default; configurable `Rp1.000–Rp200.000` on Non-COD / COD Ongkir) |
| **Driver Handover (`Nama Driver`, `HP Driver`, `Nopol`) + Barcode Sack Scan** | AutoKirim (`/suratjalan/load`) + our barcode manifest scan | `DEC-225`, `spec/04` §1, `PR-16`: records driver name, phone, vehicle plate, and signature + printable Surat Jalan PDF |
| **Bulk Label Print (`<= 50` AWBs) with `Belum Tercetak / Tercetak` Filter** | AutoKirim (`/account/bulk_print_list`), Komship | `DEC-225`, `spec/03`, `visual/06`: checkbox batch print up to 50 INVs directly in `Kiriman` |
| **Period Filter (WIB Presets + 2-Month Date Range Calendar, up to 180d)** | AdsBookCMS + fixing AutoKirim's 31-day cap | `DEC-221`, `visual/08` §1: default `7 hari terakhir` + 2-month range picker |
| **Clean White + Mengantar Blue Palette (`#FFFFFF` + `#2E47BA`)** | Mengantar (`mengantar_form.map` / `mengantar_track`) + Owner direction | `DEC-222`, `DESIGN.md`, `visual/01`: light-only clean white canvas with `#2E47BA` accent |
| **Settings Sub-Menu (Grouped Left Nav / Mobile List, 9 Routes)** | shadcn settings pattern + fixing tab overflow | `DEC-223`, `visual/08` §2: 3 groups (`Gerai`, `Operasional`, `Akun & Akses`), sticky save bar |
