# 03 — Counter POS, Thermal Printing & Shift Drawer Specification (`geraiexpress-cfv2`)

This contract governs daily counter execution in `app.geraiexpress.com` so operators aged 35–55+ complete walk-in checkouts in **under 45 seconds** (or **under 15 seconds** from a `<slug>.gerai.cc` QR pre-booking) with zero pricing or printing friction.

---

## 1. Two Entry Paths into `INV` Checkout

### Path A — Scan or Type Pre-Booking `INV` (`< 15s`)
1. Walk-in sender or reseller presents the QR or 7-char code (`INV 8K4M2P7`) created on `<slug>.gerai.cc`.
2. Cashier scans QR or types `8k4m2p7` → opens `/kiriman/8k4m2p7` with sender, masking preset, recipient, destination `area_id`, and item declaration pre-populated.
3. Cashier performs three physical steps:
   - places parcel on scale, verifies `actual_weight_gram` (`[ gram ● | kg ]`) + optional `P×L×T`,
   - confirms parcel contents are permitted (+ optional 1-tap scale photo),
   - records `QRIS gerai / Tunai / Transfer / Bayar nanti` → presses **`Tandai Lunas & Cetak (Ctrl+Enter)`** (DEC-220).

### Path B — Direct Walk-In POS (`< 45s`)
1. **Weight & Destination First:**
   - Weight defaults to **`1000`** with an inline 1-click **`[ gram ● | kg ]`** segmented toggle (`1250` `[gram ●]` ⇄ `1,25` `[kg ●]`), quick chips (`500 g`, `1.000 g`, `2 kg`, `5 kg`, `10 kg`), and helper text `= 1,25 kg · Masuk tarif 1 kg (toleransi s.d. 1.300 g)`.
   - **Unit-Mistake Guard:** entering `< 10` in `gram` mode (e.g., typing `2` intending `2 kg`) or `>= 100` in `kg` mode (e.g., typing `1000` intending `1000 g`) displays a 1-click yellow fix chip and blocks submission until confirmed.
   - Selecting destination subdistrict immediately streams parallel courier cards.
2. **Sender (`Kontak > Pengirim`) & 3-Way Masking Preset:** masked or COD sends need `wa_verified_at`; an unverified sender shows `Verifikasi WA` (opens click-to-chat, cashier confirms) before `Tandai Lunas & Cetak` unlocks. Sender-masked presets are disabled when `masking_daily_quota` is used up.
3. **Recipient (`Kontak > Penerima`), Local COD Phone Risk Badge & Anti-Cordest Validation:** auto-normalizes `+62` → `08`, blocks URLs/markup, requires >= 2 street words, and checks local D1 `recipient_contacts` delivery/RTS counters (`⚪ Baru` when 0 history; `🟢 / 🟡 / 🔴` once local history exists; optional Mengantar `getReceiverScoreByNumberUser` enrichment only if the seller account is production-whitelisted).
4. **Item Declaration, Insurance Prompt (`>= Rp500.000`), & Shop Packing Add-Ons.**
5. **Record Payment & 1-Click Print (DEC-220):** the outlet collects money itself; the POS only records it.
   - `Catat pembayaran` segmented control: `QRIS gerai` · `Tunai` (cash received → change) · `Transfer` · `Bayar nanti`.
   - QRIS/Transfer: the cashier checks the outlet's own QRIS notification or bank mutation and confirms; no proof upload.
   - Primary button: `Tandai Lunas & Cetak · Rp…` or, for `Bayar nanti`, `Simpan & Cetak (belum dibayar)`.
   - An unpaid INV shows `Belum dibayar` on the receipt preview, in Kiriman (`Belum Dibayar` tab, `Tandai Lunas` row action), on the Dashboard KPI, and as a warning when the parcel is scanned into a pickup manifest.

---

## 2. Document Separation: Parcel Label vs `Struk Jujur`

1. **Parcel Label (`Label Paket`):** affixed to the box for courier sorting and delivery; obeys the selected **Masking Preset** (`ADR-0005`).
2. **Customer Receipt (`Struk Jujur`):** handed to the walk-in sender as proof of handover and payment.
   - Carries the unified **`INV ID`** (`INV 8K4M2P7`), frozen outlet name & WhatsApp at payment time, AWB number, agreed actual & volumetric weights, line-by-line charges (`Ongkir`, `Asuransi`, `Packing`, `Potongan`, `Total Dibayar`, payment method, cash received & change — or COD collection & net payout estimate), plus QR link to `<slug>.gerai.cc/lacak/8k4m2p7`.
   - **Never prints cashier staff names** on customer-facing paper/WA shares; staff attribution stays in internal audit logs.
   - **Immutable:** corrections use `Void Pembayaran` (creating a reversal record with a mandatory reason), never silent edits.

---

## 3. Bulletproof Thermal Printing Architecture

### 3.1 Mode 1 — Direct Web-Bluetooth ESC/POS (58mm & 80mm Rolls)
Built for budget Bluetooth printers (`POS-5890`, Zjiang, Eppos, VSC, Bixolon, Epson) paired directly to Android Chrome or desktop Chrome/Edge:
- **Zero-Popup Fast Path:** once a default Bluetooth printer is paired (`[🟢 BT: POS-58 Siap]`), clicking `Tandai Lunas & Cetak` (or `Simpan & Cetak` for an unpaid INV) prints immediately without extra dialogs.
- **BLE Flow Control:** transmits encoded ESC/POS bytes in **20-byte chunks** with controlled pacing to prevent cheap printer buffer overflows, plus `beginBatch() / endBatch()` connection keep-alive during multi-parcel runs.
- **Print Density Selector:** `Normal` vs `Tebal (Dark)` dithering/heating setting in `/pengaturan` so thin budget thermal rolls still produce crisp, high-contrast barcodes.
- **One-Roll Combo (`Potong Disini`):** prints the **Parcel Label** on the top half, a clear `-------- ✂ Potong Disini --------` cut line, and the **Customer Receipt (`Struk Jujur`)** on the bottom half.
- **Instant Browser/PDF Fallback:** if Bluetooth disconnects or iOS Safari is used, POS automatically falls back to 1-tap PDF/system print so counter lines never stall.

### 3.2 Mode 2 — 100 mm Thermal Stickers (DEC-224) & A4 Fallback
- **Three formats:** `10×15 · Paket + Bukti` (default: 100×100 parcel label + cut line + 100×50 sender stub), `10×10 · Paket saja`, `10×15 · Paket saja` (no sender stub). Layouts: `docs/visual/04` §3.
- Outlet default in `Pengaturan › Printer & Struk`; per-print override in the print drawer. With `Paket saja` formats the post-issue screen offers `Kirim bukti ke WA pengirim`.
- A4 `1/2/4 per halaman` is a PDF fallback only.
- Generates crisp vector PDFs with **borderless horizontal barcode bands** (preserving >= 3 mm left/right `Code128` quiet zones so laser scanners never misread vertical box borders).
- Tracks `print_count` and `first_printed_at` per `INV`, warning operators before duplicate reprints so one AWB is never taped onto two boxes.

---

## 4. Per-Shift Cash Drawer Reconciliation (`/kasir/shift`)

1. **Open Shift:** cashier enters opening cash float (`Modal Awal Laci`, e.g., `Rp150.000`).
2. **Live Drawer State:** tracks `Tunai Masuk`, `Void Tunai`, `QRIS Tercatat`, and `Transfer Tercatat` across every `INV` paid in that shift.
3. **Close Shift:** cashier counts physical bills in the drawer (`Uang Tunai Fisik Dihitung`). Any non-zero variance (`counted_cash_idr - expected_cash_idr != 0`) requires a structured reason code + note before closing and triggers an alert card on the Owner's Dashboard.
