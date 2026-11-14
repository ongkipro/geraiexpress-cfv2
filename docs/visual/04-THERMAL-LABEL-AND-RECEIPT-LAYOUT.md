# 04 — Thermal Label, `Struk Jujur` & Print Drawer UI/UX Specification

This specification refines **both** the physical paper typography of our thermal labels/receipts (so courier hub scanners and motorbike riders read them in **0.5 seconds** with zero scan failures) **and** the in-app **Print Preview & Printer Control UX** for counter operators.

---

## 1. Five Physical Field-Design Rules (Why Competitor Thermal Labels Fail)

1. **Borderless Barcode Quiet Zones (`>= 3 mm` Left & Right, Bar Height `>= 14 mm`):**
   - Cheap 58mm printers often cause hub scan failures when vertical box borders sit too close to `Code128` bars.
   - **Rule:** the barcode band **never draws left or right vertical borders**. Below the bars, the AWB prints in bold, 4-character-grouped monospace (`JX88 2910 4412`) so riders can type it easily if rain/tape smudges a bar.
2. **0.5-Second Courier Eye Hierarchy (Top-Down Sorting Order):**
   - **Priority #1 — Sorting Code or Destination Subdistrict/Postcode Fallback:** inverted white-on-black pill (`█ BDO-CBL02 █` when `DESTINATION_CODE` is returned on post-issue `GET /order?order_id=`; if `NULL`, cleanly renders `█ COBLONG 40132 █` — never invented) so sorting-hub workers toss parcels into the right sack instantly.
   - **Priority #2 — High-Contrast Payment Banner (`NON-COD` vs `COD`):** on COD parcels, an unmistakable inverted block prints **`COD — TAGIH PENERIMA: Rp 167.560`** paired with **`"DILARANG BUKA PAKET SEBELUM BAYAR KE KURIR"`** to stop recipient open-and-refuse disputes.
   - **Priority #3 — Recipient Block:** bold name, phone (or `08xx-****-8821` when `Privasi Penerima` is active), street + landmark, and full subdistrict/city/postcode.
   - **Priority #4 — Masked Sender + Neutral `INV` Return Key:** prints sender according to the 4 masking presets, while always keeping the short neutral code **`INV: 8K4M2P7`** in the corner so if the parcel returns (`RTS`) to the outlet, `Meja Retur` identifies the true sender in 1 scan!
3. **Dispute-Shield Footer on Every Parcel Label:**
   - Prints exact counter weight & dimensions (`Berat: 1.200 g | Ukuran: 30×20×15 cm | Tagih: 2.000 g`) to deter arbitrary hub re-weighing, plus **`"Wajib video paket utuh saat dibuka untuk klaim kerusakan"`**.
4. **Strict Text Clamping & URL Wrap (Zero Box Overflow):**
   - Names clamped to `2–60` chars, street to `5–120` chars (max 3 wrapped lines), item description to `3–60` chars, whitespace collapsed.
   - On 58mm (`32-col`) receipts, the tracking URL splits across centered lines (`<host>` on line 1 — wrapping at the last `.` or `-` before column 32 if `len(host) > 32` for 24–30-char slugs or long custom domains — and `/lacak/<7-char-slug>` on the final line) so no URL ever clips past column 32.
5. **Atkinson Dithering + Density Boost for Cheap Paper:**
   - Outlet logos (max `312×64 px` monochrome) use Atkinson dithering; operators using thin economy thermal rolls can switch density from `Normal` to `Tebal (Dark)` in 1 tap.

---

## 2. Format A — 58mm Roll One-Click Combo (`32 Columns` · Label + `Struk Jujur`)

Designed for 58mm Bluetooth pocket printers (`48mm / 384 dots` printable width). One print action outputs the **Parcel Label** above and the **Customer Receipt** below a scissor guide.

### 2.1 `NON-COD` + `Dropship Toko` Preset (`32-Col Exact Layout`)

```text
          J&T EXPRESS           
       LAYANAN: EZ (REG)        

   ||||||||||||||||||||||||||   
         JX88 2910 4412         

      ████████████████████      
      █    BDO-CBL02     █      
      ████████████████████      
            NON-COD             
--------------------------------
PENERIMA:
RINA KARTIKA
08xx-xxxx-8821
Jl. Dago Asri No. 14 RT 02/05
(Dekat Masjid Al-Huda)
KEC. COBLONG, KOTA BANDUNG 40132
--------------------------------
PENGIRIM:
TOKO HIJAB NISA (08xx-xxxx-7890)
Kota Bandung        INV: 8K4M2P7
--------------------------------
Berat : 1.200 g (Tagih: 2.000 g)
Ukuran: 30x20x15 cm | Asuransi:-
Isi   : Pakaian (2 pcs)
*Wajib video utuh saat buka pkt*

------- ✂ Potong Disini --------

        TOKO HIJAB NISA         
       WA: 0812-xxxx-7890       
   STRUK BUKTI TERIMA KIRIMAN   
--------------------------------
INV ID   : 8K4M2P7
Tanggal  : 12/11/2026 14:22 WIB
Kurir    : J&T EZ
No. Resi : JX8829104412
Tujuan   : Rina K. (Coblong BDG)
Berat    : 1.200g / Vol 1.500g
           (Masuk tarif 2 kg)
--------------------------------
Ongkos Kirim         Rp   24.000
Asuransi                       -
Kardus M             Rp    3.000
Potongan Promo      -Rp        0
--------------------------------
TOTAL                Rp   27.000
LUNAS · TUNAI        Rp   50.000
Kembali              Rp   23.000
--------------------------------
Lacak & struk digital aman:
      berkahjaya.gerai.cc       
         /lacak/8k4m2p7         
         [ QR 8K4M2P7 ]         
 Simpan struk ini sbg bukti sah 
```

### 2.1b Payment line variants (DEC-220 — payment is recorded, not processed)

The line under `TOTAL` always states the recorded payment status. Each is exactly 32 columns:

```text
LUNAS · QRIS GERAI   Rp   27.000
LUNAS · TRANSFER     Rp   27.000
LUNAS · DEPOSIT      Rp   27.000
LUNAS · TUNAI        Rp   50.000
Kembali              Rp   23.000
████ BELUM DIBAYAR Rp 27.000 ███
```

- `BELUM DIBAYAR` is printed inverted (white on black) so neither the sender nor the cashier mistakes an unpaid
  receipt for a paid one. When the INV is later marked paid, `Cetak Ulang` prints the receipt with the paid line
  and `Dicetak ulang` under the INV number; the old paper is not valid proof of payment.
- The parcel label never shows payment status (it is a customer–outlet matter, not a courier one).

### 2.2 `COD BARANG` Variation Block (What Changes on Paper)
- **Top Label (for Courier & Buyer):** replaces `NON-COD` line with:
  ```text
  ████████████████████████████████
  █  COD - TAGIH: Rp 167.560     █
  ████████████████████████████████
  *Dilarang buka sblm bayar kurir*
  ```
- **Bottom Stub (for Sender/Reseller):** replaces cash lines with:
  ```text
  Harga Barang         Rp  150.000
  Ongkir + Fee COD     Rp   17.560
  Ditagih ke Penerima  Rp  167.560
  --------------------------------
  ESTIMASI CAIR BERSIH Rp  150.000
  ```

*(Note: On **80mm thermal rolls (`48 columns / 576 dots`)**, the exact same hierarchy expands horizontally with side-by-side key-value columns and a wider barcode, cutting paper length by ~28%.)*

---

## 3. Format B — 100 mm Thermal Stickers (`DEC-224`)

Three outputs on 100 mm wide **direct-thermal sticker paper** for a thermal label printer (203 dpi = 800 dots wide,
no ink or ribbon). Paper rolls: `100×150 mm` for `10×15` formats, `100×100 mm` for `10×10`. The printer's paper
size must match the chosen format; the print drawer shows the expected roll (`Pakai kertas thermal 100×150`). The parcel label
block is identical in all three; only what surrounds it changes.

| Format (UI name) | Paper | Content | Who keeps what |
|---|---|---|---|
| **`10×15 · Paket + Bukti`** *(default)* | 100×150 mm | 100×100 mm parcel label + `✂ potong di sini` + 100×50 mm sender stub | Label → box · stub → sender |
| **`10×10 · Paket saja`** | 100×100 mm | Parcel label only | Label → box (receipt via WhatsApp or 58 mm) |
| **`10×15 · Paket saja`** | 100×150 mm | Parcel label only, roomier recipient/item blocks, no stub | Label → box (receipt via WhatsApp or 58 mm) |

### 3.1 `10×15 · Paket + Bukti` (default)

```text
┌──────────────────────────────────────────────────────────────┐
│ J&T EXPRESS · EZ                         Cetak 14/11 14:22   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│        ||||||||||||||||||||||||||||||||||||||||||            │
│                     JX88  2910  4412                         │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  ████████████████   KEC. COBLONG · KOTA BANDUNG 40132        │
│  █  BDO-CBL02   █   ██████████████████████████████████       │
│  ████████████████   █ COD · TAGIH PENERIMA Rp 167.560 █      │
│                     ██████████████████████████████████       │
│                     Dilarang buka paket sebelum bayar        │
├──────────────────────────────────────────────────────────────┤
│ PENERIMA  RINA KARTIKA · 08xx-****-8821                      │
│ Jl. Dago Asri No. 14 RT 02 RW 05 (dekat Masjid Al-Huda)      │
│ Kel. Dago, Kec. Coblong, Kota Bandung 40132                  │
├──────────────────────────────────────────────────────────────┤
│ PENGIRIM  TOKO HIJAB NISA · 08xx-xxxx-7890   [QR] INV 8K4M2P7│
│ Isi: Pakaian (2 pcs) · Berat 1.200 g · Tagih 2 kg            │
│ Rekam video saat membuka paket untuk klaim kerusakan         │
╞════════════════════ ✂ potong di sini ════════════════════════╡
│ BUKTI KIRIM · INV 8K4M2P7                    TOKO HIJAB NISA │
│ J&T EZ · AWB JX88 2910 4412 · ke Kota Bandung                │
│ COD Barang · Tagih penerima Rp 167.560 · Kardus Rp 3.000     │
│ Bayar di loket Rp 3.000 · LUNAS · QRIS · Cair Rp 150.000     │
│ Lacak: berkahjaya.gerai.cc/lacak/8k4m2p7          [QR]       │
│ Simpan bukti ini untuk klaim dan pencairan COD               │
└──────────────────────────────────────────────────────────────┘
```

- **Top 100×100 mm (parcel):** courier + service, borderless barcode band with grouped AWB, sorting pill (or
  subdistrict + postcode fallback), COD banner when COD, recipient block, masked sender per preset, neutral
  `INV` + tracking QR, dispute footer. Never shows the counter payment status (courier does not need it).
- **Cut line:** dashed full-width line with `✂ potong di sini`; 3 mm blank band above and below so the cut never
  touches the barcode or the stub text.
- **Bottom 100×50 mm (`Bukti Kirim`, for the sender):** INV, AWB, courier + destination city, billed weight and
  charges, **payment status line** (`LUNAS · QRIS GERAI` / `LUNAS · TUNAI` / `LUNAS · TRANSFER` /
  inverted `BELUM DIBAYAR Rp …`, `DEC-220`), tracking URL + QR, outlet WhatsApp. Masking presets apply to the stub
  as well (Dropship Toko prints the reseller brand, never the outlet, on both parts).
- The specimen above is one consistent INV: `Dropship Toko` preset + COD Barang `buyer_bears_fee` (spec 02 §3.4): the stub
  shows the reseller brand (never the outlet), what the courier collects, what was paid at the counter, and the sender
  payable. A Non-COD stub instead shows `Ongkir · Kardus · Biaya Layanan Loket · TOTAL · LUNAS · QRIS GERAI` (or
  inverted `BELUM DIBAYAR`).
- Unknown insurance (`insurance_fee_idr = NULL`) always prints `—`, never `tidak`.
- **Dropship rule (ADR-0005):** with `Dropship Toko`, both the parcel label and the sender part (stub or 58 mm
  receipt) carry the reseller brand and the reseller's own WhatsApp; outlet name, logo and WhatsApp never appear.

### 3.2 `10×10 · Paket saja`

```text
┌──────────────────────────────────────────────────────────────┐
│ J&T EXPRESS · EZ                         Cetak 14/11 14:22   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│        ||||||||||||||||||||||||||||||||||||||||||            │
│                     JX88  2910  4412                         │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  ████████████████   KEC. COBLONG · KOTA BANDUNG 40132        │
│  █  BDO-CBL02   █   ██████████████████████████████████       │
│  ████████████████   █ COD · TAGIH PENERIMA Rp 167.560 █      │
│                     ██████████████████████████████████       │
│                     Dilarang buka paket sebelum bayar        │
├──────────────────────────────────────────────────────────────┤
│ PENERIMA  RINA KARTIKA · 08xx-****-8821                      │
│ Jl. Dago Asri No. 14 RT 02 RW 05 (dekat Masjid Al-Huda)      │
│ Kel. Dago, Kec. Coblong, Kota Bandung 40132                  │
├──────────────────────────────────────────────────────────────┤
│ PENGIRIM  TOKO HIJAB NISA · 08xx-xxxx-7890   [QR] INV 8K4M2P7│
│ Isi: Pakaian (2 pcs) · Berat 1.200 g · Tagih 2 kg            │
│ Rekam video saat membuka paket untuk klaim kerusakan         │
└──────────────────────────────────────────────────────────────┘
```

Same parcel block as §3.1, nothing below it. The POS offers `Kirim bukti ke WA pengirim` right after printing,
so the sender still gets proof.

### 3.3 `10×15 · Paket saja`

```text
┌──────────────────────────────────────────────────────────────┐
│ J&T EXPRESS · EZ                         Cetak 14/11 14:22   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│        ||||||||||||||||||||||||||||||||||||||||||            │
│                     JX88  2910  4412                         │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  ████████████████   KEC. COBLONG · KOTA BANDUNG 40132        │
│  █  BDO-CBL02   █   ██████████████████████████████████       │
│  ████████████████   █ COD · TAGIH PENERIMA Rp 167.560 █      │
│                     ██████████████████████████████████       │
│                     Dilarang buka paket sebelum bayar        │
├──────────────────────────────────────────────────────────────┤
│ PENERIMA  RINA KARTIKA · 08xx-****-8821                      │
│ Jl. Dago Asri No. 14 RT 02 RW 05 (dekat Masjid Al-Huda)      │
│ Kel. Dago, Kec. Coblong, Kota Bandung 40132                  │
├──────────────────────────────────────────────────────────────┤
│ PENGIRIM  TOKO HIJAB NISA · 08xx-xxxx-7890                   │
│ Kota Bandung                                                 │
├──────────────────────────────────────────────────────────────┤
│ Isi    : Pakaian / Kerudung (2 pcs) · Asuransi: —            │
│ Berat  : 1.200 g · Ukuran 30×20×15 cm · Tagih 2.000 g (2 kg) │
│ Catatan: Rekam video saat membuka paket untuk klaim rusak    │
│                                                              │
│                                   [QR LACAK]   INV 8K4M2P7   │
└──────────────────────────────────────────────────────────────┘
```

Uses the extra 50 mm for a two-line item/weight block and a separate sender line; still no sender stub.

### 3.4 Shared rules for all three

- Barcode band ≥ 14 mm tall, ≥ 3 mm quiet zone left/right, no vertical borders through it; AWB under it in
  4-character groups.
- Smallest printed text 8 pt (≈ 2.8 mm cap height); recipient name 14 pt bold; sorting pill 18 pt bold inverted.
- Text clamps from §1.4 apply; long addresses wrap to max 3 lines, never shrink below 8 pt.
- Output is a vector PDF sized exactly to the paper (no margins added by the app) plus a direct ESC/POS/TSPL raster
  for supported Bluetooth 100 mm printers; `print_count` and `first_printed_at` track duplicates (§5).
- A4 `1/2/4 per halaman` remains a PDF fallback for outlets with only an office printer.

## 4. Four Masking Presets — Exact Paper Matrix

| Printed Zone | `1. Standar Gerai` | `2. Dropship Toko` | `3. Privasi Penerima COD` | `4. Full Nama Gerai` |
|---|---|---|---|---|
| **Top Outlet Logo & WA** | Shown | **Hidden** (blank clean header) | Follows base (`1` or `2`) | Shown |
| **Sender Name & Phone** | Walk-in sender | **Reseller Store Name & Phone** | Follows base (`1` or `2`) | **Outlet Name & Business WA** |
| **Sender Location Line** | Sender city/area (or street if opted in) | Reseller city only (never outlet street) | Follows base (`1` or `2`) | Outlet district & city |
| **Recipient Phone on Paper** | Full | Full | **Masked (`08xx-****-8821`)** *(courier app still gets full number)* | Full |
| **Non-COD Shipping Price** | Optional toggle | **Hidden by default** | Hidden on Non-COD; **COD collect total always shown** | Optional toggle |
| **Neutral `INV: 8K4M2P7` Tag** | Shown | **Shown** (neutral alphanumeric code for return scan) | Shown | Shown |

*(Transparency note shown to operators when selecting `Dropship Toko`: printed paper labels and `<slug>.gerai.cc/lacak` show only the Reseller's store brand, but automated SMS/WhatsApp messages sent directly by a third-party courier's own system may still reference the outlet's registered Mengantar pickup account name unless provider-side dropshipper mapping is enabled).*

---

## 5. In-App Print Preview & Printer Control Drawer UX

1. **Fast Default (No Modal Friction):** When `[🟢 BT: POS-58 Siap]` is connected in the top bar, pressing `Tandai Lunas & Cetak (Ctrl+Enter)` prints immediately using the outlet's saved format (`10×15 · Paket + Bukti`, `10×10 · Paket saja`, `10×15 · Paket saja`, or the 58 mm `Label + Struk` roll).
2. **Interactive Live Thermal Drawer (`[ 👁 Pratinjau & Atur Cetak ]`):**
   - Renders a **true-scale paper preview** (white thermal roll with serrated tear edges and animated `✂ Potong Disini` line) that updates live as the operator toggles:
     - Format: `[● 10×15 · Paket + Bukti]` `[10×10 · Paket saja]` `[10×15 · Paket saja]` `[58 mm roll]` (A4 via `Lainnya ▾`)
     - Isi 58 mm roll: `[● Label + Struk Pelanggan]` `[Hanya Label Paket]` `[Hanya Struk Ulang]`
     - Tampilkan Ongkir di Label Non-COD: `[ Mati ● | Nyala ]`
     - Ketebalan Tinta Thermal: `[ Normal | ● Tebal ]`
   - **Duplicate-Print Guard:** if `print_count >= 1`, button reads **`Cetak Ulang Label (Sudah dicetak 1x · 14:22)`** in amber so staff never accidentally stick duplicate labels onto two different parcels.
   - **Instant Rescue Fallback:** if Web-Bluetooth drops mid-print, a 1-tap **`[ Buka PDF / Cetak Sistem ]`** button appears immediately in the same drawer without losing the issued AWB.
