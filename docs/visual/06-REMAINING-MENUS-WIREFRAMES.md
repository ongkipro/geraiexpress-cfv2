# 06 — Remaining Menu Wireframes: Shipments Hub, Contacts, Mengantar Finance Sync & Settings

This document completes visual wireframes for every remaining menu in the compact **6-menu Gerai** and **5-menu Super Admin** navigation (`docs/spec/06-DOMAINS-MENUS-AND-ROUTES.md`).

---

## 1. Unified `Kiriman` Hub — `app.geraiexpress.com/kiriman`

All post-checkout parcel workflows live as clean tabs inside one `Kiriman` menu so staff never hunt across separate sidebar pages:

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ KIRIMAN                                                             [+ Multi-Paket]  [⬇ Ekspor CSV]│
│ Tabs: [● Semua (412)] [Draf QR (5)] [Menunggu Saldo (1)] [Pickup & Manifest (18)]                  │
│       [Kendala & Klaim (3)] [↩️ Meja Retur (2)]                                                    │
├────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Cari INV / AWB / Nama / HP: [ 8k4m2p7 atau JX88... ]  Kurir: [Semua ▾]  Cetak: [Semua / Blm Cetak ▾]│
├──────────┬────────────────────┬───────────────────────┬───────────────┬───────────────┬────────────┤
│ INV ID   │ Kurir & AWB        │ Pengirim → Penerima   │ Tagihan / COD │ Status & Sync │ Aksi Cepat │
├──────────┼────────────────────┼───────────────────────┼───────────────┼───────────────┼────────────┤
│ #8K4M2P7 │ J&T EZ             │ Toko Hijab Nisa 🎭    │ Non-COD       │ Siap Pickup   │ [🖨️ Cetak] │
│ 14:22    │ JX8829104412 [✓1x] │ → Rina K. (Bandung)   │ Rp 27.000     │ Sync MGT ✓    │ [💬 WA]    │
│ #5N7R3V4 │ J&T EZ             │ Bpk Hendra            │ Non-COD       │ Menunggu Saldo│ [💳 Bayar] │
│ 13:50    │ (AWB tertunda)     │ → Adi (Semarang)      │ Rp 19.000     │ Unpaid Batch  │ [Detail]   │
│ #9P3N7W2 │ SiCepat REG        │ Kopi Gunung           │ COD Barang    │ Dalam Kirim   │ [Detail]   │
│ 13:05    │ 004918273612 [✓1x] │ → Dimas (Surabaya)    │ Rp 185.000    │               │ [💬 WA]    │
└──────────┴────────────────────┴───────────────────────┴───────────────┴───────────────┴────────────┘
```

### Key Sub-Tabs Inside `Kiriman`:
- **Tab `Pickup & Manifest`:** groups the 18 ready parcels by courier (`J&T: 11`, `SiCepat: 5`, `JNE: 2` + `🚐 Mobil` hint), opens barcode scan-into-sack mode (loud red alert on wrong courier), captures courier finger signature, or records `Diantar Mandiri ke Cabang`.
- **Tab `Kendala & Klaim`:** filters `Tidak Bergerak (48 jam–4 hari | 5–14 hari | 15–30 hari | >30 hari)`, `Gagal Antar`, `Selisih Berat / Cordest` (side-by-side counter scale photo vs Mengantar `penyesuaian` invoice), and `Bisa Klaim` with live filing countdowns.
- **Tab `Meja Retur`:** scans arriving RTS AWBs, reveals `true_sender_json`, logs box condition + R2 photo, sends 1-click WhatsApp **4-digit `Kode Ambil`**, and verifies handover back to the true sender.

---

## 2. Two-Submenu `Kontak` (`Pengirim` & `Penerima` — `DEC-212`)

```text
┌─ KONTAK > PENGIRIM (`/kontak/pengirim`) ──────────────────────────────────── [+ Tambah Pengirim] ──┐
│ Filter: [● Semua (84)]  [🎭 Toko Reseller / Dropship (26)]  [Walk-in Biasa (58)]   Cari: [ 🔍 ... ]│
├──────────────────────────┬───────────────────────────┬──────────────────┬────────────┬─────────────┤
│ Pengirim Asli (WA Retur) │ Nama Tercetak ("Sebagai") │ Preset Default   │ Volume     │ Deposit     │
├──────────────────────────┼───────────────────────────┼──────────────────┼────────────┼─────────────┤
│ Ibu Siti Nisa            │ TOKO HIJAB NISA           │ Dropship Toko    │ 94 kiriman │ Rp 250.000  │
│ WA: 0812-3456-7890 ✓     │ HP Label: 0812-3456-7890  │ (Tanpa Gerai)    │ Bulan ini  │ [Mutasi]    │
│ Bpk Hendra Wijaya        │ Hendra Wijaya             │ Standar Gerai    │ 29 kiriman │ —           │
└──────────────────────────┴───────────────────────────┴──────────────────┴────────────┴─────────────┘

┌─ KONTAK > PENERIMA (`/kontak/penerima`) ──────────────────────────────────── [+ Tambah Penerima] ──┐
│ Cari Nama / No. HP / Kecamatan: [ 🔍 Rina atau 0857...                                           ] │
├──────────────────────────┬────────────────────────────────────────┬──────────────────┬─────────────┤
│ Nama & No. HP Penerima   │ Kecamatan Mengantar & Alamat Jalan     │ Riwayat COD      │ Aksi        │
├──────────────────────────┼────────────────────────────────────────┼──────────────────┼─────────────┤
│ Rina Kartika             │ Coblong, Kota Bandung 40132            │ 🟢 6 Sukses /    │ [Kirim →]   │
│ 0857-2233-8821           │ Jl. Dago Asri No. 14 RT 02 RW 05       │    0 Retur (0%)  │ [Edit]      │
│ Doni Saputra             │ Ilir Barat I, Kota Palembang 30137     │ 🔴 1 Sukses /    │ [Kirim →]   │
│ 0819-0011-2233           │ Jl. Angkatan 45 Lorong Bakti No. 8     │    2 Retur (67%) │ [Edit]      │
└──────────────────────────┴────────────────────────────────────────┴──────────────────┴─────────────┘
```

---

## 3. Dual-Book `Keuangan` + Precision Mengantar Sync (Exclusive to Gerai Admin — `/keuangan`)

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ KEUANGAN & REKONSILIASI MENGANTAR        Sync Terakhir: 2 mnt lalu ✓  [🔄 Sinkronkan Sekarang]     │
├────────────────────────┬────────────────────────┬─────────────────────────┬────────────────────────┤
│ SALDO MENGANTAR (SYNC) │ SALDO AMAN TERSEDIA    │ COD MENUNGGU CAIR (MGT) │ KAS FISIK LOKET HARI   │
│ Rp 915.000             │ Rp 840.000             │ Rp 4.850.000 (31 INV)   │ Tunai Laci : Rp 762.000│
│ [Cara Top-Up Saldo ↗]  │ (Cadangan Retur 75rb*) │ Est. Bersih Rp 4,41 jt  │ QRIS Toko  : Rp 340.000│
├────────────────────────┴────────────────────────┴─────────────────────────┴────────────────────────┤
│ ⚠️ 1 Kiriman (`INV #5N7R3V4` · Rp15.200) menunggu pembayaran saldo Mengantar → [💳 Bayar Batch Skrg]│
├────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Tabs: [Ringkasan] [● Mutasi Sync] [Laba per INV] [Kas & Shift] [Cadangan Retur*] [Selisih Sync]    │
├──────────────────┬────────────────────────┬──────────────────────┬────────────────┬────────────────┤
│ Waktu & No. Inv  │ Tipe Invoice Mengantar │ Terkait INV / AWB    │ Mutasi (Rp)    │ Saldo Berjalan │
├──────────────────┼────────────────────────┼──────────────────────┼────────────────┼────────────────┤
│ 12/11 14:23      │ Pembayaran Batch       │ INV #8K4M2P7         │   − Rp  19.200 │    Rp  915.000 │
│ INV-MGT-99281    │ (`typePayment` · J&T)  │ JX8829104412 [Cocok] │ (Kasir +27.000)│ (Laba +Rp7.800)│
│ 12/11 11:10      │ Rekonsiliasi COD Cair  │ 4 Resi COD Selesai   │   + Rp 434.200 │    Rp  934.200 │
│ INV-MGT-99104    │ (`typeReconciliation`) │ [Lihat 4 INV Cocok]  │                │                │
│ 11/11 19:40      │ Ongkir Paket Retur     │ INV #2K9P4M8 (RTS)   │   − Rp  14.000 │    Rp  500.000 │
│ INV-MGT-98812    │ (`typePayment` Retur)  │ JT7712390012 [Cocok] │ (Cadangan Lepas│                │
│ 11/11 09:05      │ Top-Up Saldo Mengantar │ Midtrans / VA Cleared│   + Rp 500.000 │    Rp  514.000 │
│ INV-MGT-98401    │ (`typeAddBalance` ✓)   │ —                    │ (Saldo awal 14k│                │
└──────────────────┴────────────────────────┴──────────────────────┴────────────────┴────────────────┘
```

---

## 4. `Pengaturan` Tabs (`/pengaturan`) & Super Admin Key Screens (`owner.geraiexpress.com`)

1. **Gerai `Pengaturan` (6 Clean Tabs):**
   - `Mini-Site (*.gerai.cc)` — live preview of `berkahjaya.gerai.cc`, logo upload, hours, Google Maps pin, printable **A4/A5 Counter QR Tent Card**, Pro custom domain CNAME.
   - `Ekspedisi Aktif` — per-courier on/off toggles for the outlet & mini-site + courier rules & assigned discount visibility.
   - `Printer & Packing` — Web-Bluetooth pair/test, default paper size (`58mm` / `80mm` / `10×15`), print density (`Normal` / `Tebal`), shop packing add-on catalog (`Plastik`, `Bubble`, `Kardus`).
   - `Outlet & Mengantar` — pickup `area_id` & map pinpoint, seller connection health, webhook status, plus an optional collapsed **`Data Usaha (opsional)`** section: `Bentuk Usaha` [Perorangan | UD | CV | PT | Koperasi | Lainnya], `Nama Resmi`, `NIB`, `NPWP`, `Alamat Terdaftar`, `Nama Brand`, `Penanggung Jawab` (nama, jabatan, email, HP) — helper: *"Boleh dikosongkan. Diisi jika perlu faktur atau kerja sama resmi."*
   - `Anggota` — invite/revoke `Kasir` accounts, view staff audit trail.
   - `API & MCP` — issue/revoke scoped `gx_live_...` keys, link to `/api/v1/docs` Scalar UI, copy `/mcp` endpoint URL for AI assistants.
2. **Super Admin `Sistem & Audit > Profil Perusahaan`:** form for `platform_legal_profile` grouped as `Identitas Badan Usaha` (Nama PT, NIB, NPWP, No. Akta & Tanggal, SK Kemenkumham, No. PSE), `Alamat` (Terdaftar, Korespondensi), `Kontak Resmi` (Email Dukungan, WhatsApp Dukungan, Email Pelindungan Data), `Direksi` (Nama Direktur). Empty fields show `Belum diisi`; header badge `Data perusahaan belum lengkap (n kolom)` until launch-required fields are filled. Save requires TOTP + audit reason.
3. **Super Admin `Gerai > Pengajuan Baru` & `Tarif & Kurir > Diskon Gerai`:**
   - One-click **`Setujui & Buka Akun Seller Mengantar`** with Partner relay status & `<slug>.gerai.cc` readiness check.
   - Per-outlet × courier/service basis-point editor showing `Observed Mengantar Rate` vs `Assigned Outlet Rate` with automatic ceiling enforcement and mandatory TOTP + audit reason.
