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
   - No dithering step exists: the outlet logo is a 1:1 image stored as JPEG and drawn on 100 mm labels only (a monogram tile when there is none). Operators using thin economy thermal rolls can switch density from `Normal` to `Tebal (Dark)` in 1 tap.

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
   berkahjaya.geraimitra.com    
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
- **Receipt (for Sender/Reseller):** the whole charge and payment block between the two dividers after `Berat`
  is replaced (not only the cash lines). Complete COD specimen, spec 02 §3.4 fixture (`P = 12.000`, `F = 5.560`,
  `G = 150.000`, `K = 3.000`), each line exactly 32 columns:
  ```text
--------------------------------
COD · Fee dibayar penerima      
Harga Barang         Rp  150.000
Ongkir + Fee COD     Rp   17.560
Ditagih ke Penerima  Rp  167.560
--------------------------------
Kardus M             Rp    3.000
Dibayar di Loket     Rp    3.000
LUNAS · QRIS GERAI   Rp    3.000
--------------------------------
Hak COD Pengirim     Rp  150.000
Cair setelah paket diterima     
--------------------------------
  ```
  The counter part (`Dibayar di Loket`) follows the DEC-220 payment-line variants above (`LUNAS · …` or inverted
  `BELUM DIBAYAR`); `Hak COD Pengirim` is `sender_cod_payable_idr` (`G`, `G − F` or `G − P − I0 − F` per mode).

*(80 mm rolls are not supported: only the 32-column 58 mm renderer exists, `packages/thermal-print/src/roll58.ts`.)*

---

## 3. Format B — 100 mm Thermal Stickers (`DEC-224`)

> **Layout as built (`packages/thermal-print/src/label.ts`, redesigned 2026-11-24/25).** The three specimens in
> §3.1–§3.3 and the priorities in §1.2 draw the earlier layout and are kept as history; the renderer is the
> reference. A parcel label now has six zones, top to bottom:
>
> 1. **Headline** — left: outlet logo (1:1 upload from `Pengaturan › Profil Gerai`, about 8–9 mm) or a two-letter
>    monogram tile, `WA <no>` (`PENGIRIMAN GERAI` when the outlet has no WhatsApp number) and the outlet name (under a Dropship preset: `PENGIRIMAN TOKO` + the reseller's store
>    name); right: plain bold hero `COD : Rp …` or `NON-COD`, and `Cetak <date>`.
> 2. **Carrier band** — vector courier mark on the left; `Nomor Resi` Code 128 with the grouped AWB on the right.
> 3. **Service line** — inverted service pill, optional `KARGO` and `DG` badges, `<KURIR> · Berat: <billable kg>`,
>    `INV` at the right.
> 4. **Destination** — full-width black bar `DESTINASI : <kecamatan · kota · kode pos> (<sorting code>)`; on COD an
>    outlined notice `Dilarang buka paket sebelum bayar kurir · Konfirmasi pengirim sebelum retur`.
> 5. **Parties** — two columns `Dari:` | `Kepada:` with no boxes or divider.
> 6. **Contents** — `ISI PAKET:` (with dimensions and insurance), `CATATAN:`, then `Order ID` with a Code 128 of the
>    INV. Only `10×15 · Paket saja` adds a `LACAK & BUKTI DIGITAL` strip with a QR; the compact parcel label has no QR.
>
> The cut line of `10×15 · Paket + Bukti` prints `POTONG DI SINI` without a scissor glyph. The 100 mm label prints
> the billable weight in kg only; the actual gram weight appears on the 58 mm roll. The outlet logo is never printed
> on the 58 mm roll.

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
│ Lacak: berkahjaya.geraimitra.com/lacak/8k4m2p7    [QR]       │
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
- As built, sizes differ from the original targets: the smallest text is 5.6 pt (header eyebrow), the recipient name
  is 9.4 pt (11.2 pt on `10×15 · Paket saja`), and the destination bar is 9.2–10.2 pt, shrinking to 6.6 pt for long
  names.
- Text clamps from §1.4 apply; the street wraps to 3 lines (2 on COD, 4 on `10×15 · Paket saja`).
- Output is a vector PDF sized exactly to the paper (no margins added by the app) and an SVG preview of the same
  page; 100 mm printers are driven through the OS print driver. No TSPL or raster path exists. `print_count` and
  `first_printed_at` track duplicates (§5).
- No A4 label layout exists (A4 is used only for the Surat Jalan manifest).

## 4. Four Masking Presets — Exact Paper Matrix

| Printed Zone | `1. Standar Gerai` | `2. Dropship Toko` | `3. Privasi Penerima COD` | `4. Full Nama Gerai` |
|---|---|---|---|---|
| **Top Outlet Logo & WA** | Shown | **Hidden** (blank clean header) | Follows base (`1` or `2`) | Shown |
| **Sender Name & Phone** | Walk-in sender | **Reseller Store Name & Phone** | Follows base (`1` or `2`) | **Outlet Name & Business WA** |
| **Sender Location Line** | Sender city/area (or street if opted in) | Reseller city only (never outlet street) | Follows base (`1` or `2`) | Outlet district & city |
| **Recipient Phone on Paper** | Full | Full | **Masked (`08xx-****-8821`)** *(courier app still gets full number)* | Full |
| **Non-COD Shipping Price** | Optional toggle | **Hidden by default** | Hidden on Non-COD; **COD collect total always shown** | Optional toggle |
| **Neutral `INV: 8K4M2P7` Tag** | Shown | **Shown** (neutral alphanumeric code for return scan) | Shown | Shown |

*(Transparency note shown to operators when selecting `Dropship Toko`: printed paper labels and `<slug>.geraimitra.com/lacak` show only the Reseller's store brand, but automated SMS/WhatsApp messages sent directly by a third-party courier's own system may still reference the outlet's registered Mengantar pickup account name unless provider-side dropshipper mapping is enabled).*

---

## 5. In-App Print Preview & Printer Control Drawer UX

> **Drawer as built (`apps/web-app/src/print/drawer.tsx`).** After issue the POS shows `Resi terbit` and a
> `Cetak Label` button that opens the drawer with the outlet's saved format. Controls: four format cards with the
> paper hint, a density toggle shown only for the 58 mm roll, a reprint reason of at least 3 characters when
> `print_count >= 1`, and `Cetak` / `Buka PDF / Cetak Sistem` / `Unduh PDF`. Not built: a paired-printer indicator in
> the top bar, the `Ctrl+Enter` shortcut, dialog-free printing, the `Isi 58 mm roll` and `Tampilkan Ongkir di Label
> Non-COD` toggles (`showShippingFee` exists in the model but no renderer reads it), the A4 option, and the animated
> serrated preview. The items below describe the original intent.

1. **Fast Default (No Modal Friction):** When `[🟢 BT: POS-58 Siap]` is connected in the top bar, pressing `Tandai Lunas & Cetak (Ctrl+Enter)` prints immediately using the outlet's saved format (`10×15 · Paket + Bukti`, `10×10 · Paket saja`, `10×15 · Paket saja`, or the 58 mm `Label + Struk` roll).
2. **Interactive Live Thermal Drawer (`[ 👁 Pratinjau & Atur Cetak ]`):**
   - Renders a **true-scale paper preview** (white thermal roll with serrated tear edges and animated `✂ Potong Disini` line) that updates live as the operator toggles:
     - Format: `[● 10×15 · Paket + Bukti]` `[10×10 · Paket saja]` `[10×15 · Paket saja]` `[58 mm roll]` (A4 via `Lainnya ▾`)
     - Isi 58 mm roll: `[● Label + Struk Pelanggan]` `[Hanya Label Paket]` `[Hanya Struk Ulang]`
     - Tampilkan Ongkir di Label Non-COD: `[ Mati ● | Nyala ]`
     - Ketebalan Tinta Thermal: `[ Normal | ● Tebal ]`
   - **Duplicate-Print Guard:** if `print_count >= 1`, button reads **`Cetak Ulang Label (Sudah dicetak 1x · 14:22)`** in amber so staff never accidentally stick duplicate labels onto two different parcels.
   - **Instant Rescue Fallback:** if Web-Bluetooth drops mid-print, a 1-tap **`[ Buka PDF / Cetak Sistem ]`** button appears immediately in the same drawer without losing the issued AWB.
