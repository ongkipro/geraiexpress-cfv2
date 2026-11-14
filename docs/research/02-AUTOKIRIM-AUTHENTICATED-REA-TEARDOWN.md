# 02 — Authenticated AutoKirim (`app.autokirim.com`) Deep REA Teardown & v2 Perfection Matrix

- **Date:** 2026-11-14
- **Authorization & Provenance:** Owner-authorized read-only inspection of `https://app.autokirim.com/` (one of the multi-courier counter systems previously created by the owner, inspected to ensure `geraiexpress-cfv2` inherits every proven field workflow while fixing every architectural and UX limitation).
- **Evidence Location:** Sanitized inline scripts (`19` modules) and REA static analysis bundle (`30 MB`, `rea analyze-javascript-application`) stored in cold storage at `/data/backups/research/gerai-ekspedisi-multi-kurir-2026-11/autokirim-auth-rea-2026-11-14/`. Zero credentials or personal tokens are stored in this repository.

---

## 1. System Stack & Navigation Map (`app.autokirim.com`) [O]

### 1.1 Runtime Stack
- **Server & Rendering:** Multi-page server-rendered PHP application (`csrf_autokirim` token) with per-page inline **Vue 2** instances (`new Vue({ el: '#app' })` or `#shipping`), **jQuery**, **Bootstrap 4** modals/popovers, `vue-select@3.0.0`, `axios`, `moment.js`, `daterangepicker.js`, and `owl.carousel.min.js`.
- **Maps Integration:** Google Maps JS API (`maps`, `marker`, `places`, `geocoding` libraries) with `PlaceAutocompleteElement`, `AdvancedMarkerElement`, and fallback coordinate `(-7.245538, 112.737863)` (Surabaya).
- **Livechat / Telemetry:** `helpdesk.autokirim.com/livechat-loader.js` (`window.BeChatSettings`) and Google Tag Manager (`GTM-MHJ4P22`).

### 1.2 Complete Authenticated Sidebar & Route Map (23 Routes Across 10 Groups)

| # | Sidebar Group | Sub-Menu Label | URL Path | Primary Function & Observed JS Module |
|---:|---|---|---|---|
| **1** | **Dashboard** | `Dashboard` | `/` | Date-range filter (max 31d), `+ Buat Kiriman` button, promo carousel, `Detail Pengiriman` (`Paket Berhasil`, `Retur`, `Paket Dibatalkan`), `Rekap Transaksi` table (`Qty`, `Harga Barang`, `Biaya Ongkir`, `Total`), QRIS pending banner (`#qrisPending`). (`dashboard.js`) |
| **2** | **Buat Pesanan** | `Paket Regular` | `/order/regular` | 4-section single-parcel order creator with modals for Sender, Recipient, Packet Details, Commodity/Paxel, and Order Review. (`order_regular.js`, `97.4 KB`) |
| | | `Paket Masal` | `/order/masal` | Batch order creator via Excel/CSV upload (`handleFileExcel`, `handleCsvData`) or manual row entry, with live `tarif-check` polling and error-row editing. (`order_masal.js`, `97.3 KB`) |
| **3** | **Surat Jalan** | `Cetak` | `/suratjalan/load` | Filters ready AWBs by date range, `courier_code`, and `services`; requires **`driver_name`**, **`driver_phone`**, and **`vehicle_no` (Nopol)** to generate handover PDF (`POST /suratjalan/generate`). (`suratjalan_cetak.js`) |
| | | `Laporan` | `/suratjalan/load_generated` | Lists generated handover manifests (`#`, `Tanggal`, `Ekspedisi`, `Total AWB`, `Nama Driver`, `Hp. Driver`, `Nopol`) with reprint link `/suratjalan/print_generated`. (`suratjalan_laporan.js`) |
| **4** | **Bantuan** | `Bantuan` | `/bantuan` | Helpdesk contact & ticket links. |
| **5** | **Cek** | `Cek Resi` | `/check/receipt` | Tracks single AWB (`POST /check/receipt`) or multi-koli AWB (`POST /check/receipt_koli`). (`cek_resi.js`) |
| | | `Cek Ongkir` | `/check/shipping` | Standalone tariff & commission calculator (`origin_id`, `destination_id`, `weight` in grams default `1000`, `with_volume`, `length`, `width`, `height`). (`cek_ongkir.js`) |
| **6** | **Pelanggan** | `Data Pengirim` | `/customer/sender` | CRUD + bulk checkbox delete for sender contacts (`name`, `phone`, `district_id`, `address`, optional GPS `latitude/longitude`). (`customer_sender.js`) |
| | | `Data Penerima` | `/customer/recipient` | CRUD + bulk checkbox delete for recipient contacts with identical schema. (`customer_recipient.js`) |
| **7** | **Laporan** | `Laporan Komisi` | `/report/commission` | Paginated commission ledger (`No. Resi`, `Tanggal`, `Kurir`, `Service`, `Nominal`, `Keterangan`) + staff filter + export (`#generate`). (`report_commission.js`) |
| | | `Laporan Mutasi Saldo` | `/report/mutation` | Wallet mutation log (`Tanggal`, `Jenis` [`Dana Masuk`/`Dana Keluar`], `Tipe`, `Jumlah`, `Saldo Sebelum`, `Saldo Sesudah`, `Invoice ID`, `Keterangan`). (`report_mutation.js`) |
| | | `Laporan Pengiriman` | `/report/shippingv2` | Master shipment table (`16` columns) with **18 status filter pills**, **4-mode Stuck duration filter** (`#tipe_stuck`), label print (`/report/shippinglabel/:id`), void (`POST /check/cancel`), tracking modal, and invoice/report export. (`report_shippingv2.js`) |
| | | `Laporan Masal` | `/report/masal` | Batch shipment history with bulk cancel (`POST /check/bulk_cancel`). (`report_masal.js`) |
| **8** | **Ajak Teman / Poin** | `Ajak Teman` | `/account/affiliate` | Referral link & downline table (`Member ID`, `Nama Member`, `Nomor HP`, `Tanggal Bergabung`, `Status`, `Jumlah Transaksi`, `Komisi`). |
| | | `Poin` | `/account/program_berhadiah` | Reward catalog (`poinItemCategory`) with point discount support and `redeemPoin(id)`. |
| **9** | **Akun Saya** | `Profil` | `/account/profile` | Profile details, password change, and 6-digit numeric account **PIN** setup (`createPinInputs`). |
| | | `Saldo & Komisi` | `/account/commission` | Top-up via VA/QRIS (`POST /topup/insertva`, min `Rp10.000`) or manual transfer with 3-digit unique sequence (`topup_uniq_sequence`, `POST /topup/insert`, `/topup/confirmation`, `/topup/cancel`). (`commission.js`) |
| | | `Withdraw` | `/account/withdraw` | Balance withdrawal to bank account choosing **`Realtime`** vs **`Antrian`** (`#tariksaldor` / `#tariksaldoa`). (`withdraw.js`) |
| | | `Rekening` | `/account/rekening` | Saved bank accounts for withdrawal. |
| | | `Pickup Point` | `/account/pickup` | Outlet's default pickup address (`name`, `address`, `phone`, `district_id`, `latitude`, `longitude`). (`pickup.js`) |
| | | `Cetak Resi Massal` | `/account/bulk_print_list` | Filters shipments by date, AWB, courier, and **`Status Cetak`** (`Belum Cetak` / `Sudah Cetak`); selects up to **50 resi** → `POST /account/bulk_generate_pdf`. (`bulk_print.js`) |
| | | `User Management Baru` | `/account/user_management` | Staff account CRUD (`user_name`, `user_phone`, `user_email`, `user_password`) with 8-item `accessDataJson` menu ACL checkboxes. (`user_mgmt.js`) |
| | | `Pengaturan Baru` | `/account/setting` | Configures `shippingLabel`, `otherSetting.showCommissionFee`, and `autoWithdraw` (`POST /account/setting/save`). (`setting.js`) |
| **10** | **Syarat/Panduan** | `Syarat & Panduan` | `/account/guide` | Terms link (`autokirim.com/syarat-ketentuan`) and operational guides. |

---

## 2. Deep Dive into Core Operational Modules [O]

### 2.1 Regular Shipment Creation (`/order/regular` — `order_regular.js`)
1. **Pickup Point vs Sender Address (`isSenderPP`):**
   - Displays the outlet's default `pickupPoint.address` at the top.
   - Inside **1. Pengirim**, a checkbox `isSenderPP` (*"Jadikan Sebagai Pickup Point"*) controls whether the courier picks up at the sender's own address (`is_sender_pp: true`) or at the outlet's `pickupPoint` (`is_sender_pp: false`, default).
2. **Packet Details & Validation Bounds (`addPacket()`):**
   - `name` (item description, required, max `100` chars), `quantity` (min `1`), `weight` (integer grams, **min `100` g**), `length`, `width`, `height` (integer cm, default `1×1×1`, must be `> 0`).
   - `shipping_type`: `'non_cod'`, `'cod'` (COD Barang), or `'dfod'` (COD Ongkir).
   - **Item Value (`price`) Bounds (`packetSetting`):**
     - `cod`: min **`Rp10.000`**, max **`Rp5.000.000`**
     - `non_cod`: min **`Rp10.000`**, max **`Rp20.000.000`**
     - `dfod`: min **`Rp10.000`**, max **`Rp20.000.000`**
   - **Two Mutually Exclusive COD Fee Modes (`specialPacket()`):**
     - **Mode A — `autoMarkupPrice` (*"Admin COD Dibayar Pembeli"*):** calls `POST /order/markup_price` (`{ courier_code, packet_price, ongkir, fee_cod, Insurance }`) so the item price is grossed up (`markup_price`) and the sender receives the full original item price on disbursement.
     - **Mode B — `isCodAllIn` (*"Admin COD dan Ongkir Dibayar Pengirim"*):** recipient pays only `packet_price` (`cod_total = packet_price`, min `Rp10.000`); shipping + insurance + COD fee are deducted from the sender's COD disbursement (`disbursement = cod_total - potong_saldo - fee_cod`).
     - **Default Mode (neither checked on COD):** `cod_total = packet_price + ongkir + insurance`, and `disbursement = cod_total - potong_saldo - fee_cod` *(Note: for `courier_code == 'pos'`, `cod_total` adds `fee_cod / 1.11`)*.
3. **Tariff Quote & Auto-Cargo Selection (`checkPrice()`):**
   - Calls `POST /order/shipping` with `{ origin_id, destination_id, weight, shipping_type, length, width, height, price, is_cod_all_in, is_sender_pp, sender_id, recipient_id }`.
   - **Auto-Cargo Rule:** if `weight >= 5000` g **or** volumetric `length * width * height / 6 >= 5000` (i.e. `>= 5 kg` at `/6000`), automatically selects the **`Cargo`** service tab if available.
   - Supports per-service **`koli`** count (`koli_qty`), **Lion Parcel commodity** surcharge (`POST /order/calc_commodity`), and **Paxel** package category & box size (`confItemCategory`, e.g., `paxel_amplop`, `paxel_big`).
   - Checks courier-specific rules via `POST /order/information` returning `insurance_option` (`'available' | 'required' | 'hidden'`) and `order_info[]` notices; J&T Same Day / One Day (`jnt_jnd`, `jnt_jsd`) require item price `> 0`.
4. **Review Modal, Counter Service Fee & Payment (`order()`):**
   - **Drop-off Warning:** if `packet_details.is_pickup == false`, prompts `confirm("Layanan Drop Off!\nSetelah klik konfirmasi, jangan lupa untuk antar paket ke gerai ekspedisi Anda.")`.
   - **Counter Service Fee (`service_fee`):** on `non_cod` and `dfod` orders, the outlet can add an optional `Biaya Layanan` between **`Rp1.000` and `Rp200.000`** (`0` on `cod`).
   - **Payment Method (`paymentMethod: 'balance' | 'qris'`):**
     - `'balance'` → posts to `POST /order/regular_order` and immediately returns `awb` + `shipping_label_url`.
     - `'qris'` (available only on `non_cod`) → posts to `POST /order/qris` and redirects the browser to `/order/qris/{order_by_qris_id}` to top up the exact `totalShippingCost` first.

### 2.2 Batch Shipment Creation (`/order/masal` — `order_masal.js`)
- Selects Sender + `isSenderPP` + single `courierCode` + `serviceType` (`Reguler`, `Cargo`, etc.), then uploads an `.xlsx` / `.csv` file (`handleFileExcel`, `handleCsvData`) or adds rows manually.
- Runs an asynchronous `tarifCheck()` loop (`POST /order/masal/tarif-check` every `1500 ms`) that splits uploaded rows into **`Ready`** vs **`Not Ready`** tabs, calculating `totalHargaBarangReview`, `totalOngkirReview`, `totalKomisiReview`, `totalFeeCod`, `totalPencairanCod`, and `totalFeeCommodity`.
- Operators can edit or delete invalid rows inline (`masal/editpacket`, `masal/removepacket`), export a tariff quotation (`exportCekTarif`), and submit all ready rows in one click (`masal/orderpacket`).

### 2.3 Label Settings, Bulk Print & Handover Manifest (`setting.js`, `bulk_print.js`, `suratjalan_cetak.js`)
1. **Shipping Label & Account Settings (`userConfigJson` in `/account/setting`):**
   - `shippingLabel.showShipperPage`: `"0" | "1"` *(whether to print the second half / sender stub page)*
   - `shippingLabel.maskShipperPhone`: `"0" | "1"` *(masks sender phone on the printed label)*
   - `shippingLabel.showUnboxingRemark`: `"0" | "1"`
   - `shippingLabel.unboxingRemarkValue`: string (`0–50` chars, default `"Harap Buat Rekaman Video Saat Membuka Paket"`)
   - `shippingLabel.showAutokirimLogo`: `"0" | "1"`
   - `shippingLabel.shipperAddressType`: `"Hanya Kota dan Kecamatan"` | `"Hanya Kota"`
   - `shippingLabel.templateResi`: **`"full"`** (10×15 full label) | **`"struct"`** (compact thermal receipt style)
   - `otherSetting.showCommissionFee`: `"0" | "1"` *(shows/hides commission on `Cek Ongkir` so customers looking at the screen do not see the outlet's margin)*
   - `autoWithdraw`: `{ active: "0"|"1", method: "Antrian"|"Realtime", amount: 50000..5000000, periodicType: "Setiap Hari"|"Setiap Minggu"|"Setiap Bulan", periodicDate: "1".."31", periodicDay: "Senin".."Minggu", periodicHour: "00:00".."23:00" }`
2. **Bulk Label Print (`/account/bulk_print_list`):**
   - Filters by date range (max 31d), AWB search, courier, and **`Status Cetak`** (`Belum Cetak` / `Sudah Cetak`).
   - Checkbox selection with live counter (`.sj-counter`), hard-capped at **50 resi per batch** (`POST /account/bulk_generate_pdf { transactions_id_list }`), opening a single merged PDF URL.
3. **Surat Jalan / Driver Handover (`/suratjalan/load` & `/suratjalan/load_generated`):**
   - Lists unmanifested AWBs by courier & service; requires **`driverName`**, **`driverPhone`**, and **`driverNopol`** (`vehicle_no`) → `POST /suratjalan/generate` → opens printable Surat Jalan PDF and moves the batch to `Surat Jalan Tercetak`.

### 2.4 Master Shipment Report & Staff ACL (`report_shippingv2.js`, `user_mgmt.js`)
1. **18 Shipment Status Filter Pills (`/report/shippingv2`):**
   `Semua`, `Belum Pickup`, `Pickup`, `Perjalanan`, `Terkirim`, `Bermasalah`, `Dibatalkan`, `Perjalanan Retur`, `Retur`, `Klaim`, `Klaim Ditolak`, `Bea Cukai`, `Sukses`, `Gagal`, `Dikirim ke Penerima`, `Gagal Pickup`, `Investigasi`, `Partial`.
2. **Stuck Duration Filter (`#tipe_stuck`):**
   Filters parcels by stuck days (`stuck1` to `stuck2` days) and exports either a shipment report or a customer invoice batch (`POST /report/generate_shippingv2`).
3. **Staff Access Control (`accessDataJson` in `/account/user_management`):**
   8 toggleable permissions across 3 groups:
   - `Order Creation`: `Paket Reguler` (`order/regular`), `Paket Masal` (`order/masal`)
   - `Laporan Staff`: `Laporan Pengiriman Staff` (`reportstaff/shipping`)
   - `Finance`: `Saldo & Komisi` (`account/commission`), `Withdraw` (`account/withdraw`), `Rekening` (`account/rekening`), `Laporan Komisi Staff` (`reportstaff/commission`), `Laporan Mutasi Saldo Staff` (`reportstaff/mutation`).

---

## 3. Code-Level Bugs & UX Pain Points Found in `app.autokirim.com` (And How `geraiexpress-cfv2` Fixes Them)

1. **Bug in `report_commission.js` (Line 53):** sends `end_date` twice in the JSON payload (`start_date: $("#startdate").val(), end_date: $("#enddate").val(), end_date: $("#resi").val()`), overwriting `end_date` with the AWB search box value!
2. **Bug in `report_mutation.js` (Line 73):** when `/report/mutation-list` returns an empty state, it appends the error row to `#commission-list tbody` (which does not exist on the mutation page) with `colspan="16"` instead of `#mutation-list tbody` (`colspan="9"`).
3. **Modal-Heavy Order Creation:** creating 1 walk-in shipment in `/order/regular` requires opening and closing **4 to 5 separate Bootstrap modals** (`#senderModal`, `#recipientModal`, `#packetModal`, `#commodityModal`, `#reviewModal`), whereas counter cashiers need a single-screen flow.
4. **31-Day Hard Cap on All Date Pickers:** every `daterangepicker` in AutoKirim hard-caps `maxSpan: { days: 31 }` and `minDate` to 90 days ago, preventing quarterly/6-month analysis. `geraiexpress-cfv2` supports up to **180 days** with fast presets (`Hari ini`, `Kemarin`, `7 hari terakhir`, `30 hari terakhir`, `Bulan ini`, `Bulan lalu`, `90 hari terakhir` + 2-month range calendar, `DEC-221`).
5. **QRIS Redirect Friction:** choosing QRIS in AutoKirim redirects away from POS to `/order/qris/:id` to top up the platform wallet first. In `geraiexpress-cfv2` (`DEC-220`), outlets receive money directly on their own counter QRIS/cash/transfer and simply record `Lunas · QRIS gerai` or `Bayar nanti` in 1 click.
6. **Return Blind Spot When `isSenderPP == false`:** when an outlet ships using its own pickup point (`isSenderPP: false`) and masks the sender address/phone, RTS parcels return to the outlet without a dedicated return-intake workflow. `geraiexpress-cfv2` closes this with **`Meja Retur`** (`PR-17`, 4-digit WhatsApp `Kode Ambil`).
