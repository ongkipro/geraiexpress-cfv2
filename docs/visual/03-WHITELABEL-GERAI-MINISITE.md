# 03 — White-Label Outlet Mini-Site (`<slug>.geraimitra.com`) & Brand Site (`geraiexpress.com`)

Both public web properties render on Cloudflare Workers as escaped HTML template strings (no JSX, no edge cache; < 35 KB HTML+CSS) and ship 100% in friendly Indonesian.

---

## 1. Outlet White-Label Mini-Site (`https://<slug>.geraimitra.com`)

Designed for neighborhood WhatsApp groups, shopfront QR banners, and local online sellers/dropshippers.

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [Logo Gerai]  GERAI BERKAH JAYA — Agen Kirim Paket Multi-Ekspedisi        [💬 Chat WA Gerai]     │
│               Jl. Merdeka No. 45, Coblong, Bandung · Buka Hari Ini 08.00–21.00 · [📍 Buka Peta]  │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│   [ ● Cek Ongkir ]           [ Kirim dari Rumah ]                [ Lacak Paket ]                 │
│  ═════════════════════                                                                           │
│  Kecamatan Tujuan : [ Ketik kecamatan / kota tujuan...          ]                                │
│  Berat Paket      : [ 1000  ] [ gram ● │ kg ]   Ukuran (opsional): [  ]×[  ]×[  ] cm  [ Hitung ] │
│                                                                                                  │
│  Perbandingan Tarif Pengiriman dari Gerai Berkah Jaya (1.000 gram = 1 kg):                       │
│  • Lion Parcel · REGPACK (2–3 hari)  [🥇 Termurah] ............................. Rp 11.500       │
│  • J&T Express · EZ (2–3 hari) ................................................. Rp 12.000       │
│  • SiCepat · REG (1–2 hari)          [⚡ Tercepat] ............................. Rp 13.000       │
│                                              [ Lanjut Isi Alamat dari Rumah → Dapat QR INV → ]   │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│  KENAPA KIRIM PAKET DI GERAI BERKAH JAYA?                                                        │
│  ✓ Banyak pilihan ekspedisi Reguler, Cargo & COD dari satu meja kasir.                           │
│  ✓ Cocok untuk Olshop & Dropshipper: kirim atas nama toko Anda sendiri, dijemput kurir tiap sore.│
│  ✓ Isi data dari rumah lewat menu di atas — sampai toko tinggal timbang & tempel resi 15 detik!  │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Didukung jaringan resmi GeraiExpress                                     Kebijakan Privasi ↗    │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Page 2 Flow — `Kirim dari Rumah` (form at `<slug>.geraimitra.com/kirim`, QR card at `/kirim/8k4m2p7`)
1. Visitor selects `Non-COD / COD`, fills sender details (and optional dropship store name), recipient name/phone/subdistrict/street, item description, and estimated weight in `gram` (`default: 1000`) or `kg`.
2. Passing Turnstile immediately issues the unified short **`INV` slug (`INV 8K4M2P7`)** with a large scannable QR card + **`[ Kirim ke WA Saya ]`** and **`[ Lacak Paket ]`**; saving the image is a hint (`Simpan gambar: tekan lama pada QR lalu pilih Simpan, atau ambil tangkapan layar.`), not a button.
3. Clear Indonesian instruction: *"Tunjukkan QR `INV 8K4M2P7` ini ke kasir Gerai Berkah Jaya dalam 48 jam. Tidak perlu antre ketik alamat — kode yang sama dipakai untuk struk & lacak paket Anda."*

### Page 3 Flow — Privacy-Safe Tracking (`<slug>.geraimitra.com/lacak?q=8K4M2P7`; `/lacak/8k4m2p7` redirects 302 to it)
- Accepts either **`8K4M2P7`** (`INV` slug) or the courier **AWB** (`JX8829104412`).
- Displays status stepper, courier + service, origin city → destination district/city, and masked initials (`T*** H****` → `R*** K******`).
- **4-Digit Recipient Phone Gate:** when status is `Terkirim`, renders: *"Masukkan 4 angka terakhir No. HP Penerima `[ _ _ _ _ ]` untuk membuka rincian penerima paket (& bukti foto jika tersedia dari kurir)."*

---

## 2. Core Brand Marketing Site (`https://geraiexpress.com`)

Fixes all five conversion and SEO bottlenecks identified in our v1 landing audit:
1. **Interactive Live Hero Simulator:** visitors switch destination cities and toggle `1.000 gram` vs `Cargo 12 kg` directly in the hero.
2. **Direct 1-Click Counter Sandbox (`/simulasi-kasir`):** clicking `Coba Simulasi Kasir` opens an interactive Indonesian POS demo immediately — **never behind a login screen**.
3. **Full v2 Wedge Shown Clearly:** `Struk Jujur` + Tunai/QRIS shift close, 58mm Bluetooth `Potong Disini` printing, 3-way dropship masking + `Meja Retur`, precision Mengantar financial sync, and **free `<namatoko>.geraimitra.com` promo website for every partner**.
4. **Shop-Owner-Native Indonesian Copy:** speaks directly to *konter pulsa/HP, fotokopi & ATK, toko kelontong, dan ruko jasa* (no get-rich-quick hype, no hardware lock-in, clear Equipment section stating existing phone/laptop + cheap scale/printer work out of the box).
5. **Clean Technical SEO:** `<title>` pattern `Judul Halaman - GeraiExpress` (single brand suffix, `-` separator), meta descriptions strictly `120–155` chars, and footer links to `/ketentuan`, `/privasi`, and `/hubungi-kami`.
