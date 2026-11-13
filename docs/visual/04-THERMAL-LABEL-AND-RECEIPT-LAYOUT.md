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
   - **Priority #3 — Recipient Block:** bold name, phone (or `0857-****-8821` when `Privasi Penerima` is active), street + landmark, and full subdistrict/city/postcode.
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
  NON-COD (ONGKIR SUDAH LUNAS)  
--------------------------------
PENERIMA:
RINA KARTIKA
0857-2233-8821
Jl. Dago Asri No. 14 RT 02/05
(Dekat Masjid Al-Huda)
KEC. COBLONG, KOTA BANDUNG 40132
--------------------------------
PENGIRIM:
TOKO HIJAB NISA (0812-3456-7890)
Kota Bandung        INV: 8K4M2P7
--------------------------------
Berat : 1.200 g (Tagih: 2.000 g)
Ukuran: 30x20x15 cm | Asuransi:-
Isi   : Pakaian (2 pcs)
*Wajib video utuh saat buka pkt*

------- ✂ Potong Disini --------

       GERAI BERKAH JAYA        
      WA: 0811-2233-4455        
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
Asuransi             Rp        0
Kardus M             Rp    3.000
Potongan Promo      -Rp        0
--------------------------------
TOTAL DIBAYAR        Rp   27.000
TUNAI: Rp 50.000 | Kembali 23rb
--------------------------------
Lacak & struk digital aman:
      berkahjaya.gerai.cc       
         /lacak/8k4m2p7         
         [ QR 8K4M2P7 ]         
 Simpan struk ini sbg bukti sah 
```

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

## 3. Format B — `100 × 150 mm` (A6 Standard Courier Sticker) & `100 × 100 mm`

```text
┌────────────────────────────────────────────────────────────┐
│ [LOGO GERAI / KOSONG]                J&T EXPRESS · EZ      │
│ WA Bantuan: 0811-2233-4455           Dicetak: 12/11 14:22  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│         ||||||||||||||||||||||||||||||||||||||||||         │
│                     JX88  2910  4412                       │
│                                                            │
├──────────────────────────────┬─────────────────────────────┤
│ KODE SORTIR / RAYON          │ ███████████████████████████ │
│   ████████████████████████   │ █  COD — BAYAR KE KURIR   █ │
│   █      BDO-CBL02       █   │ █      Rp 167.560         █ │
│   ████████████████████████   │ ███████████████████████████ │
│ KEC. COBLONG · 40132         │ Dilarang buka sebelum bayar │
├──────────────────────────────┴─────────────────────────────┤
│ PENERIMA:                                                  │
│ RINA KARTIKA                           📞 0857-****-8821   │
│ Jl. Dago Asri No. 14 RT 02 RW 05 (Dekat Masjid Al-Huda)    │
│ Kel. Dago, KEC. COBLONG, KOTA BANDUNG, JAWA BARAT 40132    │
├───────────────────────────────────────────────┬────────────┤
│ PENGIRIM:                                     │ [QR LACAK] │
│ TOKO HIJAB NISA · 0812-3456-7890              │            │
│ Kota Bandung                                  │ INV:8K4M2P7│
├───────────────────────────────────────────────┴────────────┤
│ Berat: 1.200 g · Ukuran: 30×20×15 · Tagih: 2.000 g (2 Kg)  │
│ Isi  : Pakaian / Kerudung (2 pcs) · Asuransi: Tidak        │
│ Wajib rekam video paket utuh saat dibuka untuk klaim rusak │
└────────────────────────────────────────────────────────────┘
```
*(In `100 × 100 mm` compact mode, header height and address padding tighten by 22% while keeping the borderless barcode zone and sorting/COD banner untouched. In `A4` mode, operators select `1 / 2 / 4 Label per Halaman` with dashed cut guides.)*

---

## 4. Four Masking Presets — Exact Paper Matrix

| Printed Zone | `1. Standar Gerai` | `2. Dropship Toko` | `3. Privasi Penerima COD` | `4. Full Nama Gerai` |
|---|---|---|---|---|
| **Top Outlet Logo & WA** | Shown | **Hidden** (blank clean header) | Follows base (`1` or `2`) | Shown |
| **Sender Name & Phone** | Walk-in sender | **Reseller Store Name & Phone** | Follows base (`1` or `2`) | **Outlet Name & Business WA** |
| **Sender Location Line** | Sender city/area (or street if opted in) | Reseller city only (never outlet street) | Follows base (`1` or `2`) | Outlet district & city |
| **Recipient Phone on Paper** | Full | Full | **Masked (`0857-****-8821`)** *(courier app still gets full number)* | Full |
| **Non-COD Shipping Price** | Optional toggle | **Hidden by default** | Hidden on Non-COD; **COD collect total always shown** | Optional toggle |
| **Neutral `INV: 8K4M2P7` Tag** | Shown | **Shown** (neutral alphanumeric code for return scan) | Shown | Shown |

*(Transparency note shown to operators when selecting `Dropship Toko`: printed paper labels and `<slug>.gerai.cc/lacak` show only the Reseller's store brand, but automated SMS/WhatsApp messages sent directly by a third-party courier's own system may still reference the outlet's registered Mengantar pickup account name unless provider-side dropshipper mapping is enabled).*

---

## 5. In-App Print Preview & Printer Control Drawer UX

1. **Fast Default (No Modal Friction):** When `[🟢 BT: POS-58 Siap]` is connected in the top bar, pressing `Bayar & Cetak (Ctrl+Enter)` prints immediately using the outlet's saved format (`58mm Label+Struk`, `58mm Label Saja`, or `10×15 PDF`).
2. **Interactive Live Thermal Drawer (`[ 👁 Pratinjau & Atur Cetak ]`):**
   - Renders a **true-scale paper preview** (white thermal roll with serrated tear edges and animated `✂ Potong Disini` line) that updates live as the operator toggles:
     - Ukuran Kertas: `[● 58mm Roll]` `[80mm Roll]` `[10×15 A6]` `[10×10]` `[A4 4-Label]`
     - Isi Cetakan 58mm: `[● Label + Struk Pelanggan]` `[Hanya Label Paket]` `[Hanya Struk Ulang]`
     - Tampilkan Ongkir di Label Non-COD: `[ Mati ● | Nyala ]`
     - Ketebalan Tinta Thermal: `[ Normal | ● Tebal ]`
   - **Duplicate-Print Guard:** if `print_count >= 1`, button reads **`Cetak Ulang Label (Sudah dicetak 1x · 14:22)`** in amber so staff never accidentally stick duplicate labels onto two different parcels.
   - **Instant Rescue Fallback:** if Web-Bluetooth drops mid-print, a 1-tap **`[ Buka PDF / Cetak Sistem ]`** button appears immediately in the same drawer without losing the issued AWB.
