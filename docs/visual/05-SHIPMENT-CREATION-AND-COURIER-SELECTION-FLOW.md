# 05 — Visual Flow: Creating a Shipment (`INV Slug`) & Selecting a Courier

This document details the end-to-end UX of creating a shipment and choosing a courier in `app.geraiexpress.com` across desktop (`1280px`) and Android mobile (`390px`). All user-visible strings are normative Indonesian.

---

## 1. Six-Stage Single-Screen Flow (Zero Page-Reload Friction)

DEC-237: every stage runs on **one** screen, `Buat Pengiriman › Kiriman Satuan` (`/kasir`). At ≥ 1024 px the left
60 % holds stages 1–4 as three `SectionCard`s and the right 40 % is the sticky `Ringkasan & Pembayaran` card (stage 5);
below 1024 px it is one column with a sticky bottom checkout bar. The INV is allocated only when the primary is
pressed (freeze → parties → payment → issue, one tap); `/kiriman/:slug` remains the page for existing drafts, QR
pre-bookings and issued shipments.

```text
┌ Breadcrumb: Buat Pengiriman › Kiriman Satuan ───────────────────────────────────────────────────────┐
│ [ Pindai QR pelanggan atau ketik INV ________________________ ] [Buka]                              │
├──────────────────────────── 60 % ─────────────────────────┬──────────── 40 % (sticky) ──────────────┤
│ 1. Tujuan & berat                                         │ Ringkasan & Pembayaran                  │
│  [Non-COD|COD Barang|COD Ongkir]  Kecamatan tujuan        │  Ekspedisi            J&T Express       │
│  Berat 1000 [gram|kg]  P×L×T   Nilai barang  [ ] DG       │  Berat ditagih        1 kg              │
│  Packing ▾   [x] Biaya layanan loket   [Cek Ongkir]       │  Ongkir publish       Rp 12.500         │
│ 2. Pilih ekspedisi  [Reguler (7)|Cargo ≥ 5 kg]  [👁]       │  Biaya layanan loket  Rp 2.000          │
│  J&T Express  Rp 12.500  [Terpilih]                       │  Bayar di loket       Rp 14.500         │
│  J&T ECO · Termurah  Rp 10.500  Ekonomis · tidak DG [Pilih│  (owner) Modal · Estimasi laba          │
│ 3. Pengirim, label & penerima                             │  [QRIS|Tunai|Transfer|Bayar nanti]      │
│  Pengirim: Ibu Siti · WA terverifikasi [Ganti] [+ baru]   │  Uang diterima ____  Kembalian Rp 5.500 │
│  Label pengirim: (●) Standar Gerai ( ) Dropship Toko      │  [ 🖨 Tandai Lunas & Cetak · Rp 14.500 ] │
│  Penerima: Rina K. · Tebet Barat  ● Riwayat baru · Skor B │                                         │
│  Isi paket ____  Jumlah barang 1  Instruksi kurir ____    │                                         │
│  [x] Isi paket bukan barang terlarang atau berbahaya      │                                         │
└───────────────────────────────────────────────────────────┴─────────────────────────────────────────┘
```

```text
[Open `Kiriman Satuan`]  ──or──►  [Scan QR / Enter `INV` from `<slug>.geraimitra.com`]
          │                                            │
          ▼                                            ▼
 Empty form (no INV yet)                       Claims the `8k4m2p7` pre-booking
 or prefilled from `Cek Ongkir Cepat`          (sender, recipient, contents pre-filled)
          │                                            │
          └─────────────────────┬──────────────────────┘
                                ▼
 STAGE 1: Mode (`Non-COD | COD Barang | COD Ongkir`), Destination Subdistrict, Weight & P×L×T
          • Weight defaults to `1000` with 1-click `[ gram ● | kg ]` + quick chips + unit-mistake guard
          • Computes integer `billable_weight_gram` & streams active courier quotes in parallel
                                ▼
 STAGE 2: Smart Courier Selector (`Reguler` vs `Cargo` — Cargo offered on `Non-COD` only at launch)
          • Medal highlights (`🥇 Termurah`, `⚡ Tercepat`, `💰 Cair COD Terbesar`)
          • Local outlet/network RTS % badge (`⚪ Riwayat Baru` when 0 prior parcels) + purple `Drop-off saja` warning (`tenant_courier_prefs.pickup_mode` + SiCepat `unsupportedPickup`)
          • Courier-rule hints from Mengantar v2.0.0 (DEC-238): COD caps (Rp2.000.000 Sap/Anteraja/Pos,
            Rp5.000.000 others), Lion COD min Rp10.000, 50 kg Anteraja/Pos/SPX/J&T, Pos COD ≥ 82 % delivered rate,
            J&T ECO (economy, not with cargo or DG); a card outside a limit is unavailable with the reason
          • `Nilai barang` is sent as `goodsValue` (required Rp1.000–Rp10.000.000 for Anteraja, Pos, SPX; insurance
            prompt from Rp500.000); `Barang berbahaya (DG)` leaves only SiCepat (HALU) and iDexpress
                                ▼
 STAGE 3: Sender (`Kontak > Pengirim`) + 1-Click 3-Way Masking Preset
                                ▼
 STAGE 4: Recipient (`Kontak > Penerima`) + Live COD Phone Risk Score + Item & Packing Add-Ons
                                ▼
 STAGE 5: Locked `INV #8K4M2P7` Summary → Record payment (`QRIS gerai | Tunai | Transfer | Deposit Reseller | Bayar nanti`, DEC-220) → `Tandai Lunas & Cetak (Ctrl+Enter)` or `Simpan & Cetak (belum dibayar)`
          • Serialized through `GeraiVaultDO` (handles `provider_unpaid_hold` gracefully if balance is low)
                                ▼
 STAGE 6: Issued AWB State!
          • Auto-prints the outlet's default format (`10×15 · Paket + Bukti`, `10×10 · Paket saja`,
            `10×15 · Paket saja`, or 58 mm roll — DEC-224) + 1-tap WhatsApp receipt share
          • Quick buttons: `[ + Kiriman Baru ]` or `[ + Tambah Paket Pengirim Ini ]`
```

---

## 2. Smart Courier Selector States

### 2.1 `NON-COD` Quote Panel

```text
┌─ 2. PILIH EKSPEDISI & LAYANAN ─────────────────────────────────────────────────────────────────────┐
│ Kategori : [ ● Reguler (6 kurir) ]   [ Cargo ≥5 kg  (4 kurir) ]   [ Semua (10) ]                   │
│ Urutkan  : [ ● Ongkir Termurah ]     [ Estimasi Tercepat ]        [ Retur Terendah ]               │
│                                                                                                    │
│ ┌─ SOROTAN TERBAIK ──────────────────────────────────────────────────────────────────────────────┐ │
│ │ 🥇 TERMURAH: Lion REGPACK (Rp 11.500)      ⚡ TERCEPAT: SiCepat BEST (1 hari · Rp 18.000)      │ │
│ └────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                    │
│ ┌────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ (●) [J&T]  J&T Express · EZ (Reguler)            Estimasi 2–3 hari            Rp 12.000        │ │
│ │            ✓ Dijemput ke gerai (cut-off 16:00) · Sukses antar kec. tujuan 98%                  │ │
│ │            [🔒 Info Owner (👁): Modal Rp 9.600 (Diskon 20%) · Margin Ongkir +Rp 2.400]          │ │
│ ├────────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ ( ) [LION] Lion Parcel · REGPACK  [🥇 TERMURAH]  Estimasi 2–3 hari            Rp 11.500        │ │
│ │            ✓ Dijemput ke gerai · Catatan: Wajib pilih jenis komoditas & kode pos               │ │
│ ├────────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ ( ) [SCP]  SiCepat · REG                         Estimasi 1–2 hari            Rp 13.000        │ │
│ │            ✓ Dijemput ke gerai (cut-off 15:00) · Sukses antar kec. tujuan 97%                  │ │
│ ├────────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ ( ) [SPX]  SPX Express · Standard                Estimasi 2–4 hari            Rp 11.800        │ │
│ │            [🟣 Drop-off mandiri ke cabang — pickup belum tercover di kecamatan gerai Anda]     │ │
│ └────────────────────────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```
*(Security invariant: the `[🔒 Info Owner (👁): ...]` row is opt-in hidden by default when facing a customer, and is **physically absent from API JSON** when a `Kasir` account is logged in.)*

### 2.2 `COD BARANG` Quote Panel (Two-Pass Gross-Up Aware)

```text
┌─ 2. PILIH EKSPEDISI COD  (Harga Barang: Rp 150.000) ───────────────────────────────────────────────┐
│ Biaya COD: (●) Dibayar Penerima   ( ) Dipotong dari Pengirim   ( ) COD All-In (barang saja)        │
│ Urutkan        : [ ● Pencairan Bersih Terbesar ]   [ Tagihan Penerima Termurah ]   [ Aman COD ]    │
│                                                                                                    │
│ ┌────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ (●) [J&T]  J&T Express · EZ             2–3 hr    Tagih Penerima : Rp 167.560                  │ │
│ │            [🟢 Aman COD · Retur kec. ini 2,1%]    Cair ke Pengirim: Rp 150.000 (Utuh)          │ │
│ │                                                   (Ongkir Rp12.000 + Fee COD Rp5.560)          │ │
│ ├────────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ ( ) [SAP]  SAP Express · REG            2–4 hr    Tagih Penerima : Rp 168.600                  │ │
│ │            [🟢 Kuat Luar Jawa · Retur 3,4%]       Cair ke Pengirim: Rp 150.000 (Utuh)          │ │
│ ├────────────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ ( ) [POS]  PosAja · Reguler             3–5 hr    [🟠 Rute/akun belum memenuhi syarat COD]     │ │
│ └────────────────────────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Android Mobile POS View (`390px`) & Post-Issue Screen

```text
┌──────────────────────────────────────┐          ┌──────────────────────────────────────┐
│ ← INV #8K4M2P7     [🟢 Printer 100mm]│          │ ✅ RESI TERBIT — INV #8K4M2P7        │
├──────────────────────────────────────┤          │ J&T EZ · AWB: JX88 2910 4412         │
│ [📷 Scan QR dari Rumah]              │          │ Kode Sortir : BDO-CBL02              │
│                                      │          │ LUNAS · QRIS gerai · Rp 27.000       │
│ 1. Tujuan & Berat                    │          ├──────────────────────────────────────┤
│ [● Non-COD] [COD Barang] [COD Ongkir]│          │ [ 🖨️ Cetak 10×15 Paket + Bukti  ]    │
│ Tujuan: [Coblong, Kota Bandung    ✕] │   ───►   │ [ Format lain ▾  · 1x dicetak   ]    │
│ Berat : [ 1200 ] [gram ●│kg] (=1,2kg)│          │ [ 💬 Kirim Struk ke WA Pengirim ]    │
│ Ukuran: [30]×[20]×[15] cm → Tagih 2kg│          │ [ 💬 Info Resi ke WA Penerima   ]    │
│                                      │          ├──────────────────────────────────────┤
│ 2. Pilih Ekspedisi   [● Reg] [Cargo] │          │ [ + Tambah Paket Pengirim Ini ]      │
│ (●) J&T EZ (2-3 hr) 🥇    Rp 24.000  │          │ [ + Kiriman Baru (Pelanggan Lain) ]  │
│ ( ) SiCepat REG ⚡        Rp 26.000  │          └──────────────────────────────────────┘
│                                      │
│ 3. Pengirim: [Toko Hijab Nisa 🎭  ▾] │
│ 4. Penerima: [08xxxxxx8821] [🟢 Aman]│
│    [Rina Kartika · Jl. Dago Asri...] │
│    Isi: [Pakaian] [✓] Kardus (+3rb)  │
├──────────────────────────────────────┤
│ TOTAL BAYAR: Rp 27.000   [Rincian ▴] │
│ [Tandai Lunas & Cetak · INV 8K4M2P7] │
└──────────────────────────────────────┘
```


---

## 4. Print step in the flow (DEC-220, DEC-224)

```text
 Tandai Lunas & Cetak / Simpan & Cetak
          │
          ├─ outlet default format = 10×15 · Paket + Bukti ─► prints label + sender stub (one sheet)
          │                                                   cashier tears at ✂, label on box, stub to sender
          ├─ default = 10×10 · Paket saja or 10×15 · Paket saja ─► prints label only
          │                                                   screen offers [Kirim bukti ke WA pengirim]
          └─ default = 58 mm roll ─► label + Struk Jujur on one roll (§2 of visual 04)

 After printing: print_count = 1. Any later print of the same INV shows the amber
 `Cetak Ulang Label (sudah dicetak 1x · 14:22)` and asks for a reason.
 Bluetooth failure → [Buka PDF / Cetak Sistem] in the same drawer; the AWB is never lost.
 Unpaid INV (`Bayar nanti`) prints with the stub/receipt line `BELUM DIBAYAR`; marking it paid later offers
 `Cetak ulang bukti` (stub or 58 mm receipt only, never a second parcel label).
```
