# 05 — Visual Flow: Creating a Shipment (`INV Slug`) & Selecting a Courier

This document details the end-to-end UX of creating a shipment and choosing a courier in `app.geraiexpress.com` across desktop (`1280px`) and Android mobile (`390px`). All user-visible strings are normative Indonesian.

---

## 1. Six-Stage Single-Screen Flow (Zero Page-Reload Friction)

```text
[Click "+ Kiriman Baru"]  ──or──►  [Scan QR / Enter `INV` from `<slug>.gerai.cc`]
          │                                            │
          ▼                                            ▼
 Allocates short `slug` (`8k4m2p7`)            Loads existing `8k4m2p7` draft
 Opens `/kiriman/8k4m2p7` (`INV #8K4M2P7`)      (sender, recipient & mask pre-filled!)
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
          • Reveals courier-specific required inputs only when needed (commodity / pinpoint / insurance)
                                ▼
 STAGE 3: Sender (`Kontak > Pengirim`) + 1-Click 3-Way Masking Preset
                                ▼
 STAGE 4: Recipient (`Kontak > Penerima`) + Live COD Phone Risk Score + Item & Packing Add-Ons
                                ▼
 STAGE 5: Locked `INV #8K4M2P7` Summary → Payment (`Tunai | QRIS | Transfer`) → `Bayar & Cetak (Enter)`
          • Serialized through `GeraiVaultDO` (handles `provider_unpaid_hold` gracefully if balance is low)
                                ▼
 STAGE 6: Issued AWB State!
          • Auto-prints 58mm `Potong Disini` / 10×15 PDF + 1-tap WhatsApp receipt share
          • Quick buttons: `[ + Kiriman Baru ]` or `[ + Tambah Paket Pengirim Ini ]`
```

---

## 2. Smart Courier Selector States

### 2.1 `NON-COD` Quote Panel

```text
┌─ 2. PILIH EKSPEDISI & LAYANAN ─────────────────────────────────────────────────────────────────────┐
│ Kategori : [ ● Reguler (6 kurir) ]   [ Cargo ≥10 kg (4 kurir) ]   [ Semua (10) ]                   │
│ Urutkan  : [ ● Ongkir Termurah ]     [ Estimasi Tercepat ]        [ Retur Terendah ]               │
│                                                                                                    │
│ ┌─ SOROTAN TERBAIK ──────────────────────────────────────────────────────────────────────────────┐ │
│ │ 🥇 TERMURAH: Lion REGPACK (Rp 11.500)      ⚡ TERCEPAT: SiCepat BEST (1 hari · Rp 18.000)      │ │
│ └────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                    │
│ ┌────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ (●) [J&T]  J&T Express · EZ (Reguler)            Estimasi 2–3 hari            Rp 12.000        │ │
│ │            ✓ Dijemput ke gerai (cut-off 16:00) · Sukses antar kec. tujuan 98%                  │ │
│ │            [🔒 Info Owner (👁): Modal Rp 9.600 (Diskon 20%) · Margin Ongkir +Rp 2.400]         │ │
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
│ Beban Biaya COD: (●) Dibebankan ke Penerima (Terima Utuh)   ( ) Dipotong dari Pencairan Pengirim   │
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
│ ← INV #8K4M2P7         [🟢 BT: POS-58]│          │ ✅ RESI TERBIT — INV #8K4M2P7         │
├──────────────────────────────────────┤          │ J&T EZ · AWB: JX88 2910 4412         │
│ [📷 Scan QR dari Rumah]              │          │ Kode Sortir : BDO-CBL02              │
│                                      │          │ Tunai Lunas : Rp 27.000 (Kembali 23rb│
│ 1. Tujuan & Berat                    │          ├──────────────────────────────────────┤
│ [● Non-COD] [COD Barang] [COD Ongkir]│          │ [ 🖨️ Cetak 58mm (Label + Struk) ]    │
│ Tujuan: [Coblong, Kota Bandung    ✕] │   ───►   │ [ 🏷️ Cetak Stiker 10×15 PDF     ]    │
│ Berat : [ 1200 ] [gram ●│kg] (=1,2kg)│          │ [ 💬 Kirim Struk ke WA Pengirim ]    │
│ Ukuran: [30]×[20]×[15] cm → Tagih 2kg│          │ [ 💬 Info Resi ke WA Penerima   ]    │
│                                      │          ├──────────────────────────────────────┤
│ 2. Pilih Ekspedisi   [● Reg] [Cargo] │          │ [ + Tambah Paket Pengirim Ini ]      │
│ (●) J&T EZ (2-3 hr) 🥇    Rp 24.000  │          │ [ + Kiriman Baru (Pelanggan Lain) ]  │
│ ( ) SiCepat REG ⚡        Rp 26.000  │          └──────────────────────────────────────┘
│                                      │
│ 3. Pengirim: [Toko Hijab Nisa 🎭  ▾] │
│ 4. Penerima: [085722338821] [🟢 Aman]│
│    [Rina Kartika · Jl. Dago Asri...] │
│    Isi: [Pakaian] [✓] Kardus (+3rb)  │
├──────────────────────────────────────┤
│ TOTAL BAYAR: Rp 27.000   [Rincian ▴] │
│ [   Bayar & Cetak Resi (INV 8K4M2P7) ]│
└──────────────────────────────────────┘
```
