# 03 — Counter POS, Thermal Printing & Shift Drawer Specification (`geraiexpress-cfv2`)

This contract governs daily counter execution in `app.geraiexpress.com` so operators aged 35–55+ complete walk-in checkouts in **under 45 seconds** (or **under 15 seconds** from a `<slug>.geraimitra.com` QR pre-booking) with zero pricing or printing friction.

---

## 1. Two Entry Paths into `INV` Checkout

### Path A — Scan or Type Pre-Booking `INV` (`< 15s`)
1. Walk-in sender or reseller presents the QR or 7-char code (`INV 8K4M2P7`) created on `<slug>.geraimitra.com`.
2. Cashier scans QR or types `8k4m2p7` → opens `/kiriman/8k4m2p7` with sender, masking preset, recipient, destination `area_id`, and item declaration pre-populated.
3. Cashier performs three physical steps:
   - places parcel on scale, verifies `actual_weight_gram` (`[ gram ● | kg ]`) + optional `P×L×T`,
   - confirms parcel contents are permitted (+ optional 1-tap scale photo),
   - records `QRIS gerai / Tunai / Transfer / Bayar nanti` → presses **`Tandai Lunas & Cetak (Ctrl+Enter)`** (DEC-220).

### Path B — Direct Walk-In POS (`< 45s`)

Runs on one screen, `Buat Pengiriman › Kiriman Satuan` (`/kasir`, DEC-237): steps 1–4 in the left 60 %, step 5 in the
sticky right 40 % (`Ringkasan & Pembayaran`); one primary freezes the quote (allocates the INV), attaches the parties,
records the payment and issues, then shows `Resi terbit` + `Cetak Label` + `Kiriman Baru` without a page change. A
retry after a refusal reuses the same INV and payment key; once a payment or a QR claim is recorded, a changed quote
is finished on `/kiriman/:slug`. Senders and recipients can be added in a Sheet without leaving the screen.

1. **Weight & Destination First:**
   - Weight defaults to **`1000`** with an inline 1-click **`[ gram ● | kg ]`** segmented toggle (`1250` `[gram ●]` ⇄ `1,25` `[kg ●]`), quick chips (`500 g`, `1.000 g`, `2 kg`, `5 kg`, `10 kg`), and helper text `= 1,25 kg · Masuk tarif 1 kg (toleransi s.d. 1.300 g)`.
   - **Unit-Mistake Guard:** entering `< 10` in `gram` mode (e.g., typing `2` intending `2 kg`) or `>= 100` in `kg` mode (e.g., typing `1000` intending `1000 g`) displays a 1-click yellow fix chip and blocks submission until confirmed.
   - Selecting destination subdistrict immediately streams parallel courier cards.
2. **Sender (`Kontak > Pengirim`) & 3-Way Masking Preset:** masked or COD sends need `wa_verified_at`; an unverified sender shows `Verifikasi WA` (opens click-to-chat, cashier confirms) before `Tandai Lunas & Cetak` unlocks. Sender-masked presets are disabled when `masking_daily_quota` is used up.
3. **Recipient (`Kontak > Penerima`), Local COD Phone Risk Badge & Anti-Cordest Validation:** auto-normalizes `+62` → `08`, blocks URLs/markup, requires >= 2 street words, and checks this gerai's `recipient_contacts` delivery/RTS counters (tenant object) (`⚪ Baru` when 0 history; `🟢 / 🟡 / 🔴` once local history exists — RTS share ≤ 20 % 🟢, ≤ 40 % 🟡, above 🔴 (`@gx/domain/contacts` `riskBadge`); optional Mengantar `getReceiverScoreByNumberUser` enrichment only if the seller account is production-whitelisted).
4. **Item Declaration, Insurance Prompt (`>= Rp500.000`), & Shop Packing Add-Ons.** `Isi paket`, `Jumlah barang`
   (`quantity`, default 1), `Instruksi kurir / patokan` (`deliveryInstruction`, ≤ 120 chars), `Nilai barang` on
   Non-COD (`goodsValue`; required Rp1.000–Rp10.000.000 for Anteraja, Pos, SPX) and `Barang berbahaya (DG)` (only
   SiCepat HALU and iDexpress) are sent to Mengantar as-is (DEC-238). The recipient card shows the local COD badge and
   the Mengantar receiver score (`A`..`E-`, `≈` when fewer than 4 COD orders; hidden text when the account is not
   whitelisted or the daily limit is used up).
5. **Record Payment & 1-Click Print (DEC-220):** the outlet collects money itself; the POS only records it.
   - `Catat pembayaran` segmented control: `QRIS gerai` · `Tunai` (cash received → change) · `Transfer` · `Bayar nanti`.
   - QRIS/Transfer: the cashier checks the outlet's own QRIS notification or bank mutation and confirms; no proof upload.
   - Primary button: `Tandai Lunas & Cetak · Rp…` or, for `Bayar nanti`, `Simpan & Cetak (belum dibayar)`.
   - An unpaid INV shows `Belum dibayar` on the receipt preview, in Kiriman (`Belum Dibayar` tab, `Tandai Lunas` row action), on the Dashboard KPI, and as a **warning (not a block)** when the parcel is scanned into a pickup manifest. Only `provider_unpaid_hold` (Mengantar balance too low, no AWB) **blocks** handover.

### 1.1 Counter payment state machine (DEC-220)

| From | Event | To | Who | Receipt row |
|---|---|---|---|---|
| (new INV, `counter_due_idr > 0`) | create | `unpaid` | O K | — |
| (new INV, `counter_due_idr = 0`) | create | `not_required` | O K | — |
| `unpaid` | `mark_paid` | `paid` | O K | `mark_paid` (`direction = in`, method) |
| `paid` | `void_payment` (reason) | `unpaid` | O; K only in the same open shift | `void_payment` (`direction = out`) |
| `unpaid` / `not_required` | INV cancelled | `voided` | O K | — (event in `shipment_events`) |
| `paid` | INV cancelled | `voided` | O (void payment first, reason required) | `void_payment` then cancel |

- `mark_paid` requires method and, for `tunai`, `cash_received_idr >= counter_due_idr`; an `Idempotency-Key` makes a
  double tap a no-op (same receipt returned).
- `void_payment` (owner, or Kasir within the same open shift) appends a negative receipt in the **current** shift;
  re-payment appends a new `mark_paid`.
- Shift attribution: money counts in the shift where `mark_paid` happened (`counter_receipts.shift_id`), not the shift
  that created the INV.
- `not_required`: COD Barang modes with `K + S - V = 0` (nothing collected at the counter).

### 1.2 Sender COD payout (outlet pays the walk-in sender — POS only)

- **Eligible:** COD Barang INV whose `reconciled_provider_cod_credit_idr IS NOT NULL` (the money reached the outlet's
  Mengantar balance). Owner may override with a reason (`Bayar sebelum cair`), audit-logged; Kasir never can.
- **Who:** owner; Kasir only when the owner enabled `Kasir boleh bayar COD`. A `tunai` payout and its reversal count
  in the actor's open shift when there is one (the cash leaves that drawer); with Shift Loket deferred (DEC-241,
  TASK-704) they are recorded with `shift_id = NULL` instead of being refused. `transfer` payouts never touch drawer
  totals.
- **Amount:** `amount <= sender_cod_payable_idr − COALESCE(sender_cod_paid_idr, 0)`; partial payouts allowed; each one
  is a `sender_cod_payout` receipt (`direction = out`, method `tunai`/`transfer`) with an `Idempotency-Key`.
  `sender_cod_paid_idr` is the sum of non-voided payouts and is updated in the same Durable Object transaction.
- **Reversal:** `void_sender_payout` (owner only, reason required) appends an `in` receipt referencing the payout.
- **Drawer:** a `tunai` payout reduces expected drawer cash in the shift where it happened (§4).
- **Never** via API key or MCP (spec 08); the receipt prints `Bukti Pencairan COD` with INV, amount and remaining.

---

### 1.3 `Paket Massal` — manual rows and Excel/CSV import (`/kasir/multi`, DEC-229)

For resellers who bring many parcels at once. One sender, one set of parcels, one counter payment.

1. **Setup:** pick the sender (`Kontak › Pengirim`) and masking preset; optional default courier/service and COD mode
   for all rows (a row may override).
2. **Rows:** add rows manually (destination search, recipient name/phone/address, weight in gram, item, COD amount),
   **or** `Unggah Excel/CSV`:
   - Template download `template-paket-massal.xlsx` (and `.csv`) with Indonesian headers: `Nama Penerima`, `No HP`,
     `Alamat`, `Kecamatan/Kota`, `Kode Pos`, `Isi Paket`, `Berat (gram)`, `Panjang`, `Lebar`, `Tinggi`, `COD (Rp)`,
     `Nilai Barang (Rp)`, `Catatan`.
   - Max **200 rows** and 1 MB per file; parsed in the browser and validated again on the server. `.csv` needs no
     library. The `.xlsx` reader is an M3 choice recorded as an ADR after a `native-first` review (bundle size, license,
     maintenance); until then only `.csv` and the downloadable `.xlsx` template exist.
   - Destination text is matched to a Mengantar `area_id` per row; ambiguous matches become `Perlu Diperbaiki` with a
     picker, never a guess.
3. **Check:** the server quotes rows in batches through a Queue (respecting `PartnerQuotaDO`/provider limits), and the
   screen splits rows into tabs `Siap (n)` and `Perlu Diperbaiki (n)` with the reason per row (`Kecamatan tidak
   ditemukan`, `Berat kosong`, `COD di luar batas`, `Kurir tidak melayani rute`). Rows are editable or removable inline.
   Totals show ongkir, COD collected, fee COD, sender payable, and (owner only) margin.
4. **Create:** `Buat n Kiriman` creates one `INV` per ready row inside `GeraiVaultDO` (each with its own slug and quote
   snapshot) and one `bulk_import_batches` record. Dispatch to Mengantar is **queued and serialized per seller** (spec
   04/ADR-0004: J&T Premium and SiCepat generate AWBs sequentially per account); the screen shows progress and never
   blocks the counter. Rows that fail dispatch stay `Perlu Tindakan` with the provider error; no blind retry.
5. **Pay & print:** one counter payment record for the batch total (`counter_receipts` row per INV, sharing a
   `bulk_batch_id`), then `Cetak Semua` (merged 100 mm PDF, ≤ 50 per file; larger batches split automatically).
6. **History:** `Kiriman › Riwayat Massal` lists batches (date, sender, rows, ready/failed, total, status) with
   `Lihat`, `Cetak Semua` and `Batalkan yang Belum Terbit` (cancels only INVs without AWB; issued ones follow the normal
   cancel rules with read-back).

Data: `bulk_import_batches`, `bulk_import_rows` and the atomic batch payment are defined in spec 01 §2.5.

### 1.4 `Cek Resi` (`/kasir/cek-resi`, DEC-229)

One search box: `INV`, AWB, or recipient phone. INV/AWB of **this gerai** opens the shipment timeline (provider
`history[]` read through `GET /order?tracking_id=`, cached 5 min). An AWB not created through this gerai shows
`Resi ini bukan kiriman gerai Anda` and a link to the courier's public tracking page; the Mengantar API only returns
history for the seller's own orders. Multi-koli shows each koli.

## 2. Document Separation: Parcel Label vs `Struk Jujur`

1. **Parcel Label (`Label Paket`):** affixed to the box for courier sorting and delivery; obeys the selected **Masking Preset** (`ADR-0005`).
2. **Customer Receipt (`Struk Jujur`):** handed to the walk-in sender as proof of handover and payment.
   - Carries the unified **`INV ID`** (`INV 8K4M2P7`), frozen **preset-resolved presentation identity** at payment time (outlet name & WhatsApp by default; the reseller brand & WhatsApp under `Dropship Toko`, where outlet identity never appears — visual 04 §3 Dropship rule), AWB number, agreed actual & volumetric weights, line-by-line charges (`Ongkir`, `Asuransi`, `Packing`, `Potongan`, `Total Dibayar`, payment method, cash received & change — or COD collection & net payout estimate), plus QR link to `<slug>.geraimitra.com/lacak/8k4m2p7`.
   - **Never prints cashier staff names** on customer-facing paper/WA shares; staff attribution stays in internal audit logs.
   - **Immutable:** corrections use `Void Pembayaran` (creating a reversal record with a mandatory reason), never silent edits.

---

## 3. Bulletproof Thermal Printing Architecture

**Primary path (owner, 2026-11-14): the outlet PC.** Outlets print from a Windows PC/laptop browser to a USB (or
network) 100 mm thermal printer installed with its OS driver. The app produces an exact-size PDF (100×150 or 100×100
mm, zero margins) and opens the browser print dialog; setup requires the driver paper size to match and scaling
`100% / Ukuran sebenarnya`. Optional zero-dialog printing: Chrome/Edge started with `--kiosk-printing` on a dedicated
counter profile (documented in the onboarding guide, never required). Android/Bluetooth (Mode 1) is a secondary path
for outlets without a PC and for 58 mm budget printers.

### 3.1 Mode 1 (secondary) — Direct Web-Bluetooth ESC/POS (58mm & 80mm Rolls)
Built for budget Bluetooth printers (`POS-5890`, Zjiang, Eppos, VSC, Bixolon, Epson) paired directly to Android Chrome or desktop Chrome/Edge:
- **Zero-Popup Fast Path:** once a default Bluetooth printer is paired (`[🟢 BT: POS-58 Siap]`), clicking `Tandai Lunas & Cetak` (or `Simpan & Cetak` for an unpaid INV) prints immediately without extra dialogs.
- **BLE Flow Control:** transmits encoded ESC/POS bytes in **20-byte chunks** with controlled pacing to prevent cheap printer buffer overflows, plus `beginBatch() / endBatch()` connection keep-alive during multi-parcel runs.
- **Print Density Selector:** `Normal` vs `Tebal (Dark)` dithering/heating setting in `/pengaturan` so thin budget thermal rolls still produce crisp, high-contrast barcodes.
- **One-Roll Combo (`Potong Disini`):** prints the **Parcel Label** on the top half, a clear `-------- ✂ Potong Disini --------` cut line, and the **Customer Receipt (`Struk Jujur`)** on the bottom half.
- **Instant Browser/PDF Fallback:** if Bluetooth disconnects or iOS Safari is used, POS automatically falls back to 1-tap PDF/system print so counter lines never stall.

### 3.2 Mode 2 (primary) — 100 mm Thermal Stickers via PC Browser (DEC-224) & A4 Fallback
- **Three formats:** `10×15 · Paket + Bukti` (default: 100×100 parcel label + cut line + 100×50 sender stub), `10×10 · Paket saja`, `10×15 · Paket saja` (no sender stub). Layouts: `docs/visual/04` §3.
- Outlet default in `Pengaturan › Printer & Struk`; per-print override in the print drawer. With `Paket saja` formats the post-issue screen offers `Kirim bukti ke WA pengirim`.
- A4 `1/2/4 per halaman` is a PDF fallback only.
- Generates crisp vector PDFs with **borderless horizontal barcode bands** (preserving >= 3 mm left/right `Code128` quiet zones so laser scanners never misread vertical box borders).
- Tracks `print_count` and `first_printed_at` per `INV`, warning operators before duplicate reprints so one AWB is never taped onto two boxes.
- **Bulk Label Print (`Cetak Resi Massal`, `DEC-225`):** in `Kiriman`, operators filter by `Status Cetak` (`Belum Cetak` / `Sudah Cetak`), select up to **50 `INV`s**, and generate one merged 100 mm thermal PDF in 1 click.

---

## 4. Per-Shift Cash Drawer Reconciliation (`/kasir/shift`)

> **Deferred UI (DEC-241, 2026-11-17):** the Shift Loket screen is out of the launch navigation (no menu, command, status
> row, dashboard tile or `Kas & Shift` tab) until TASK-704. The contract below and the `/shift` API stay implemented and
> tested; payments and payouts work without an open shift (receipts carry `shift_id = NULL`).

1. **Open Shift:** cashier enters opening cash float (`Modal Awal Laci`, e.g., `Rp150.000`).
2. **Live Drawer State:** tracks `Tunai Masuk`, `Void Tunai`, `Pencairan COD Tunai`, `QRIS Tercatat`, and `Transfer Tercatat` from `counter_receipts` whose `shift_id` is this shift (so an INV created unpaid in shift A and paid in shift B counts in B). `expected_cash_idr = opening_float + Σ tunai(direction=in) − Σ tunai(direction=out)` (voids of payments are `out`, sender payouts are `out`, voids of payouts are `in`).
3. **Close Shift:** cashier counts physical bills in the drawer (`Uang Tunai Fisik Dihitung`). Any non-zero variance (`counted_cash_idr - expected_cash_idr != 0`) requires a structured reason code + note before closing and triggers an alert card on the Owner's Dashboard.

---

## 5. Layar Pelanggan — Customer-Facing Counter Display (`/kasir/layar-pelanggan`, PR-22, TASK-701)

**Purpose.** A chromeless second screen the walk-in sender looks at while the counter works: a second window on a
dual-monitor counter PC (`Buka di Jendela Baru`) or a counter tablet/phone paired by QR. It shows only the customer
side of the sale — courier, billable weight, general destination, customer line items, the total and the outlet's
static QRIS — never cost, discount, margin, balance, phone numbers or street addresses (visual 07 row
`/kasir/layar-pelanggan`).

### 5.1 Pairing and lifecycle

1. A signed-in counter member (`gerai_admin` or `cashier`) pairs from `/kasir` (`POST /api/app/customer-display/pair`).
   The Worker draws a 256-bit CSPRNG token (`base64url`, 43 characters); the tenant's `GeraiVaultDO` stores only
   `token_hash = SHA-256(token)` in `customer_display_sessions`. The raw token is returned once, inside
   `pairUrl = https://app.<apex>/kasir/layar-pelanggan?gerai=<tenant slug>&kode=<token>` and its QR SVG.
2. **One live pairing per member.** Pairing again revokes every earlier unrevoked pairing of the same member, so a lost
   or photographed QR dies as soon as a new one is made. `POST /customer-display/unpair` revokes on demand.
3. **Shift coupling (PR-22).** If the member has an open `cashier_shifts` row when pairing, its id is stored as
   `shift_id`; closing that shift (`POST /shift/close`) sets `revoked_at` on every pairing bound to it in the same
   transaction, and `view` also refuses a pairing whose shift is no longer open. While the Shift Loket UI is deferred
   (DEC-241), `shift_id` is `NULL` and the pairing ends after **12 hours** (`expires_at`) or on unpair.
4. A pairing is valid only while `revoked_at IS NULL`, `expires_at > now`, its bound shift (if any) is open and its
   creator is still an active member of the gerai; otherwise `410 DISPLAY_ENDED` (`Layar pelanggan tidak lagi
   terhubung. Pasangkan ulang dari layar kasir.`). An unknown or non-`active` gerai slug, or an unknown token, answers
   `401 DISPLAY_NOT_PAIRED`.

### 5.2 Display state (server-built, zero-leak)

`POST /customer-display/state` (counter member) replaces the state of every live pairing of that member. The server
builds the stored `state_json` field by field from a closed schema — unknown keys are dropped, so cost or margin
can never enter it — and **no display text comes from the request** (Sol R1 F1): the counter names ids, the server
names them, so a phone number, street or true sender typed into any field cannot reach the screen:

| `kind` | Input from `/kasir` | Built and stored |
|---|---|---|
| `idle` | — | `{ kind }` |
| `checkout` | `serviceCode`, ETA, billable gram, `destinationAreaId` (+ the picked area label as a search hint), customer lines (packing may name an item), `totalIdr`, payment method, COD collection / sender payout (COD only) | courier = `display_name` of the active `courier_service_catalog` row for `serviceCode` (unknown/inactive → `422`); destination = the Mengantar area label whose id equals `destinationAreaId` among the results for the hint's first segment (no match or search down → no destination); ETA only when it matches `N[-M] hari|jam` (stored as `N-M hari`), else none; a packing line is `Packing (<name>)` only when the name is an active item of this gerai's `packing_items` (its stored spelling), else `Packing`. Lines from the closed set (own keys only; `__proto__`/`constructor`/non-strings → `422`) `ongkir` (`Ongkos kirim`), `asuransi`, `packing`, `layanan` (`Biaya layanan loket`), `promo` (`Potongan promo`, subtracted); every amount a safe integer IDR `0..100.000.000`; `totalIdr` must equal Σ lines − promo (else `422`). |
| `paid` | `slug` | read from the tenant object, never from the request: courier = catalog name of the shipment's own `service_code`, `INV`, AWB (if issued), `counter_payment_status`, method, `counter_due_idr`, `Tunai diterima` / `Kembalian` of the latest `mark_paid` receipt, and the tracking link `https://<primary host>/lacak?q=<INV>`. An unknown slug is `404`. |

`counter_due_idr` composition (spec 02 §3): non-COD `P + I + K + S − V`, COD `K + S − V`; the counter sends `ongkir`
only for non-COD sales. A `paid` state turns back into `idle` 20 seconds after it was set, or as soon as the counter
pushes the next state.

### 5.3 Public read

`GET /api/app/customer-display/view?gerai=<slug>&kode=<token>` (auth `public`, projection `none`):

- Reads **no** session cookie and sets **no** cookie; `cache-control: no-store`.
- Resolves the tenant by slug in D1 (`status = 'active'`), then looks the token hash up in that tenant's object only —
  a token of gerai A presented with gerai B's slug is `401`.
- Failed lookups are throttled per client IP hash (`auth_throttle`, 30 failures per 10 minutes → `429`, checked
  before the lookup); successful reads never count, so a paired display polling every 2 s is not throttled.
- Answers `{ state, updatedAt, outlet: { name, logoUrl, qrisUrl } }`. `logoUrl` / `qrisUrl` point at
  `GET /customer-display/media/{logo|qris}?gerai&kode` (public), which re-checks the same pairing on every read and
  streams the R2 object (`private, max-age=60`, `nosniff`) — revocation closes the images too, with no detached signed
  link left behind. The response never contains an `OWNER_ONLY_KEYS` key, a phone number or a street address.
- `paid` adds `trackingUrl` and `trackingQrSvg` (the same `uqr` encoder as labels).

### 5.4 Outlet static QRIS image

The owner uploads, replaces or removes the outlet's static QRIS in `Pengaturan › Printer & Struk` (`QRIS Loket`):
`POST /media?purpose=qris` (owner only; magic bytes `image/png | image/jpeg | image/webp`, ≤ 2 MB), then
`POST /settings/qris { mediaId | null }` (`app_owner`) stores `tenant_outlets.qris_media_id`. `GET /settings/qris`
(member) returns `{ hasQris, url }` (signed media link) so the Kasir sees the same card read-only. Media gains the
purpose `qris`; tenant migration `0024` rebuilds `media_objects` (same rows and ids) to widen its `purpose` check. On the display, the
QRIS card appears in `checkout` when the method is `qris`; with no image uploaded it says `Tunjukkan kode QRIS gerai
di meja kasir.`

### 5.5 Counter and display behaviour

- `/kasir` header: `Layar Pelanggan` (status dot green while paired) opens a dialog with the pairing QR, a copyable
  link, `Buka di Jendela Baru`, `Putuskan Layar` and, without a QRIS image, a hint to `Pengaturan › Printer & Struk`.
- While paired, `/kasir` pushes `idle` (empty or reset), `checkout` (a courier row is selected; re-sent on method or
  amount change, debounced) and `paid` (after issue). A push is keyed by pairing **and** input, so `Buat Kode Baru` on
  an unchanged checkout publishes it to the new pairing at once (Sol R1 F3); a network/5xx failure is retried after
  1.5 s, 3 s and 6 s and the retry is cancelled when the input or pairing changes (F6). Pair, status and view carry a
  non-secret `pairId` (the session row id). After a push the counter posts `{ tenantSlug, pairId }` on a same-origin
  `BroadcastChannel`; it is only a "refresh now" hint — the display then reads its own `view` with its own `kode` and
  never shows message contents (F2). Closing the dialog drops the one-time QR view; reopening shows the status and
  `Buat Kode Baru`.
- `/kasir/layar-pelanggan` is mounted outside the workspace shell (no sign-in, no navigation). It polls `view` every
  2 s, pauses while `document.hidden` and refreshes on `visibilitychange`; reads never overlap (one in flight, one
  queued) and a view older than the one shown (`updatedAt`, same `pairId`) is dropped (F5). States: `Menunggu paket` (idle),
  `Rincian pembayaran` (checkout, total `40px` bold `tabular-nums`), `Terima kasih` (paid, INV, AWB, tracking QR),
  `Layar belum terhubung` (no/ended pairing).
