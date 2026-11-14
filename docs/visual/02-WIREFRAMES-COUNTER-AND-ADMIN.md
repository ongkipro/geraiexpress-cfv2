# 02 — Core Workspace Wireframes: Owner Dashboard, POS Shell & Super Admin

This document defines the primary workspace layouts for `app.geraiexpress.com` and `owner.geraiexpress.com` using the compact **6-menu Gerai** / **5-menu Super Admin** structure (`DEC-213`). All UI text is normative Bahasa Indonesia.

---

## 1. Gerai Admin Home (`Dashboard` — Summary & Analytics) — `app.geraiexpress.com/`

```text
┌──────────────────┬───────────────────────────────────────────────────────────────────────────────────┐
│ [G] BERKAH JAYA  │ DASHBOARD GERAI              [Periode ▾ 7 hari terakhir · 8–14 Nov]               │
│ berkahjaya       │                                                      [📷 Scan QR] [+ Kiriman Baru]│
│ .gerai.cc ↗      ├───────────────────┬───────────────────┬────────────────────┬──────────────────────┤
│ ──────────────── │ TOTAL KIRIMAN     │ OMZET KAS LOKET   │ LABA BERSIH GERAI  │ SALDO MENGANTAR SYNC │
│ ● Dashboard      │ 412 Paket (+18%▲) │ Rp 9.840.000      │ Rp 2.190.500       │ Aman : Rp 840.000*   │
│ ○ Buat Kiriman   │ Non 260 · COD 152 │ Tunai 6,1jt·QR 3,7│ Sync Rp1,98jt+Est  │ COD  : Rp 4.850.000  │
│ ○ Kiriman   (22) ├───────────────────┴───────────────────┴────────────────────┴──────────────────────┤
│ ○ Kontak ▾       │ *Saldo Mengantar Rp915.000 (Sync 3 mnt lalu ✓) − Cadangan 3 Paket Retur Rp75.000  │
│   ├─ Pengirim    │                                                                                   │
│   └─ Penerima    │ PERLU TINDAKAN HARI INI:                                                          │
│ ○ Keuangan       │ [📦 18 Siap Pickup (J&T 16:00)] [⚠️ 2 Stuck >48j] [↩️ 2 di Meja Retur] [Shift: ✓] │
│ ○ Pengaturan     ├───────────────────────────────────────┬───────────────────────────────────────────┤
│ ──────────────── │ TREN HARIAN (Laba Bersih & Paket)     │ PERFORMA & RASIO RETUR EKSPEDISI          │
│ [🟢 BT: POS-58]  │ [● Laba & Omzet Rp] [Jumlah Paket]    │ Kurir      Paket    Laba       Rasio RTS  │
│ Shift Pagi Aktif │ Rp120rb ┤      ╭──╮       ╭───╮       │ J&T EZ      168   Rp 840.000     1,8% 🟢  │
│                  │  Rp80rb ┤ ╭────╯  ╰──╮ ╭──╯   ╰─╮     │ SiCepat     112   Rp 590.000     2,6% 🟢  │
│                  │  Rp40rb ┼─╯          ╰─╯        ╰─    │ JNE REG      84   Rp 480.000     1,2% 🟢  │
│                  │         └─────────────────────────    │ Lion/Cargo   48   Rp 280.500     6,2% 🟡  │
│                  ├───────────────────────────────────────┼───────────────────────────────────────────┤
│                  │ TOP PENGIRIM (`/kontak/pengirim`)     │ SUMBER ORDER & PROGRES TIER               │
│                  │ 1. Toko Hijab Nisa (🎭) .. 94 pkt     │ • QR dari `berkahjaya.gerai.cc` : 38%     │
│                  │ 2. Kopi Gunung Bandung ... 61 pkt     │ • Input langsung meja kasir     : 62%     │
│                  │ 3. Bpk Hendra Wijaya ..... 29 pkt     │ Tier GOLD [████████░░] 88 pkt → PLATINUM  │
└──────────────────┴───────────────────────────────────────┴───────────────────────────────────────────┘
```
*(Dashboard update 2026-11-14, DEC-220..222: the period control is a shadcn dropdown (default `7 hari terakhir`), the trend block is `Grafik pengiriman` (stacked Non-COD/COD bars), a `Riwayat pengiriman` table with `Pembayaran` (Lunas · QRIS/Tunai/Transfer or Belum dibayar) and status follows it, and the money KPI is `Tercatat dibayar` / `Belum dibayar`. The prototype in `prototype/` is the current visual reference.)*

*(Role Rule: When a **Kasir** signs in, `Keuangan` is absent from the left sidebar and `/` renders only **Tugas Loket Hari Ini** — pickup queues, uncollected returns, active shift status, and `+ Kiriman Baru` — with zero profit, cost, or Mengantar balance cards.)*

---

## 2. Counter POS Overview (`Buat Pengiriman` — `/kiriman/8k4m2p7`, `DEC-225`)

*(Full step-by-step courier selection & mobile flow is detailed in `05-SHIPMENT-CREATION-AND-COURIER-SELECTION-FLOW.md`.)*

```text
┌────────────────────────────────────────────────────────────┬─────────────────────────────────────────┐
│ Buat Pengiriman: [● Paket Baru] [Multi-Paket] [Cek Cepat]  │ [Shift Pagi: Rp762rb] [🟢 BT: POS-58]   │
├────────────────────────────────────────────────────────────┼─────────────────────────────────────────┤
│ KIRIMAN BARU — INV #8K4M2P7        [📷 Scan QR dari Rumah]  │ RINGKASAN KUNCI (INV #8K4M2P7)           │
│ ────────────────────────────────────────────────────────── │ ─────────────────────────────────────── │
│ 1. TUJUAN & BERAT PAKET                                    │ Mode       : NON-COD (Bayar di Loket)   │
│ Mode : (●) Non-COD   ( ) COD Barang   ( ) COD Ongkir       │ Tujuan     : Coblong, Kota Bandung      │
│ Tujuan: [ Coblong, Kota Bandung 40132                  ✕ ] │ Berat Asli : 1.200 g (1,20 kg)          │
│ Berat : [ 1200   ] [ gram ● │ kg ]   (= 1,20 kg)           │ Volumetrik : 1.500 g (30×20×15 / 6000)  │
│ Cepat : [500 g] [1.000 g] [2 kg] [5 kg] [10 kg Cargo]      │ Berat Tagih: 2.000 g (2 kg)             │
│ Ukuran: [30] × [20] × [15] cm → Berat Tagih: 2.000 g (2kg) │ ─────────────────────────────────────── │
│                                                            │ Kurir      : J&T Express · EZ (2-3 hr)  │
│ 2. PILIH EKSPEDISI   [● Reguler (6)] [Cargo (4)]           │ Ongkir     :               Rp  24.000   │
│ (●) J&T EZ       2-3 hr  [🥇 TERMURAH]          Rp 24.000  │ Asuransi   :                       -    │
│ ( ) SiCepat REG  1-2 hr  [⚡ TERCEPAT]          Rp 26.000  │ Kardus M   :               Rp   3.000   │
│ ( ) SPX Std      2-4 hr  [🟣 Drop-off saja]     Rp 23.500  │ Potongan   :              −Rp       0   │
│                                                            │ ═══════════════════════════════════════ │
│ 3. PENGIRIM (`/kontak/pengirim`) & MASKING                 │ TOTAL BAYAR:               Rp  27.000   │
│ Preset: [Standar] [● Dropship Toko] [Privasi COD] [Gerai]  │                                         │
│ Kontak: [ Toko Hijab Nisa (WA Asli: 0812xxxx)          ▾ ] │ PEMBAYARAN MEJA KASIR                   │
│                                                            │ [● Tunai] [QRIS] [Transfer] [Deposit]   │
│ 4. PENERIMA (`/kontak/penerima`) & ISI PAKET               │ Diterima : [ Rp 50.000 ] → Kembali 23rb │
│ HP  : [ 0857-2233-8821 ] [🟢 Aman COD · 6x Sukses / 0 RTS] │                                         │
│ Nama: [ Rina Kartika   ] Jln: [ Jl. Dago Asri No. 14...  ] │ CETAK: [● 58mm Label+Struk] [10×15 PDF] │
│ Isi : [ Pakaian (2 pcs)] [✓] Kardus M (+3rb) [📷 Foto Timb]│ [Pratinjau Resi] [BAYAR & CETAK (Enter)]│
└────────────────────────────────────────────────────────────┴─────────────────────────────────────────┘
```

---

## 3. Super Admin Console Shell (`owner.geraiexpress.com` — 5 Menus, `aal2` TOTP)

```text
┌──────────────────┬───────────────────────────────────────────────────────────────────────────────────┐
│ [G] SUPER ADMIN  │ RINGKASAN JARINGAN GERAIEXPRESS                        [🔒 TOTP Aktif · Pantau]   │
│ ──────────────── ├───────────────────┬───────────────────┬────────────────────┬──────────────────────┤
│ ● Ringkasan      │ GERAI AKTIF       │ KIRIMAN HARI INI  │ ANTREAN PENGAJUAN  │ STATUS SYNC & RELAY  │
│ ○ Gerai      (3) │ 48 Gerai          │ 1.840 INV         │ 3 Menunggu Review  │ Relay IPv4: Sehat 🟢 │
│ ○ Tarif & Kurir  │ 46 Terhubung MGT  │ Non 1.120·COD 720 │ [Buka Pengajuan →] │ Unpaid Hold: 2 INV   │
│ ○ Pengawasan     ├───────────────────┴───────────────────┴────────────────────┴──────────────────────┤
│ ○ Sistem & Audit │ Catatan Tata Kelola: Super Admin memiliki akses pantau penuh lintas gerai namun   │
│                  │ tidak pernah membuat, membayar, atau membatalkan kiriman atas nama gerai.         │
└──────────────────┴───────────────────────────────────────────────────────────────────────────────────┘
```
