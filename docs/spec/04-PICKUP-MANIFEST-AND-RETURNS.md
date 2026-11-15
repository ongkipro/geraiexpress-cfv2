# 04 — Pickup Manifests, Mandatory Return Intake & Claims (`geraiexpress-cfv2`)

This contract covers physical parcel custody from counter label placement through courier handover, exception monitoring, return intake (`Meja Retur`), and carrier claims.

---

## 1. Per-Courier Pickup Queues & Signed Handover Manifests (`/kiriman?tab=pickup`)

Because every shipment uses the outlet's physical address as its upstream pickup origin:
1. **Per-Courier Consolidation:** all `ready_for_pickup` shipments group automatically by courier (`J&T`, `SiCepat`, `JNE`, etc.) showing parcel count, total weight/volume, recommended vehicle (`Motor` vs `Mobil`), and a live countdown to that courier's daily cut-off.
2. **Mengantar Time Reservation & Pickup Mode Grounding:**
   - Per-courier pickup capability (`scheduled_pickup` vs `drop_off_only`) is stored per outlet in `tenant_courier_prefs.pickup_mode` (defaulting conservatively to verified modes per courier — e.g., SiCepat also honors `unsupportedPickup / unsupportedOriginSicepat` on estimates; Anteraja requires pickup).
   - For `scheduledPickup` couriers, reserves a slot via `POST /time` enforcing a configurable >= 120-minute lead time (reconciling the 90-min API vs 2-hour web UI rule; `POST /time` timezone interpretation is to be verified in M4 sandbox and stored as provider `_id` + raw timestamp echo).
3. **Barcode Scan-into-Sack Guard:**
   - When the courier arrives, the cashier scans each parcel's barcode into that courier's manifest.
   - Scanning a parcel belonging to a **different courier**, a `cancelled` INV, or a `provider_unpaid_hold` INV (no AWB) **blocks** with an audible error tone + red banner (`"SALAH KURIR! Paket ini milik SiCepat, bukan J&T"`). A counter-`unpaid` INV (DEC-220) only shows an amber warning `Belum dibayar pelanggan — tagih dulu` and may still be handed over.
4. **Courier Signature & Custody Proof:**
   - Cashier records `driver_name`, `driver_phone`, `driver_vehicle_no` (all required, spec 01 §2.4); the driver signs on screen (or the cashier photographs the signed printed Surat Jalan, stored in R2), transitioning scanned `INV`s to `handed_to_courier` and generating the Surat Jalan PDF.
5. **Branch Drop-Off Fallback:** if a courier misses pickup, the cashier can mark the batch `Diantar Mandiri ke Cabang` with an automatic reminder to drop within the same subdistrict (`kecamatan`) to avoid carrier rayon holds.

---

## 2. Mandatory Outlet Return Intake (`Meja Retur` — `/kiriman?tab=retur`)

Under `ADR-0005`, 100% of failed deliveries (`RTS`) return to the outlet's address — even when the printed sender was masked as a dropshipper's store.

1. **Step 1 — Scan Arriving Return:** cashier scans the returned AWB (or `INV` slug printed on the label) → records physical box condition (`Baik | Penyok/Rusak | Terbuka`) + 1 R2 evidence photo → status becomes `rts_at_gerai`.
2. **Step 2 — Unmask True Sender & Send 4-Digit Pickup OTP:**
   - System reveals `true_sender_json` (audit-logged as `true_sender_reveal`, ADR-0005) (the real walk-in sender or reseller who dropped the parcel) and generates a **4-digit pickup code (`Kode Ambil`)**.
   - 1-click WhatsApp button sends a pre-filled Indonesian notice with `INV`, AWB, parcel condition, storage deadline, and the 4-digit pickup code.
3. **Step 3 — Verified Counter Handback:**
   - When the sender/reseller visits the outlet, cashier verifies the 4-digit code (or ID + signature override) → status closes cleanly at `rts_returned_to_sender`.
   - If condition was `Penyok/Rusak`, POS immediately offers **`Ajukan Klaim Retur Rusak`** before the courier's filing deadline expires.

---

## 3. Proactive Exception Buckets & Claim Countdown Assistant (`/kiriman?tab=kendala`)

1. **Five Live Operational Sub-Filters:**
   - `Tidak Bergerak` (`48 jam–4 hari`, `5–14 hari`, `15–30 hari`, `>30 hari` without a tracking scan),
   - `Gagal Antar / Butuh Instruksi` (`DELIVERY PROBLEM` / `undelivery_hold`),
   - `Selisih Berat / Cordest` (compares counter `actual_weight_gram` + R2 scale photo against Mengantar adjustment invoices),
   - `Bisa Klaim` (eligible lost/damaged shipments).
   - `Status Bertentangan` (`provider_status_conflict`, spec 01 §3: e.g. Mengantar reports `delivered` after the outlet
     verified a handback; the outlet's custody status stays, the owner checks with the courier and records a note).
2. **Per-Courier Claim Deadlines (Grounded in Mengantar Help `5207011 / 8140017`):**
   - Tracks exact filing windows per courier (e.g., lost claim `3×24h` for IDX/J&T; `14d` for SiCepat/IDX/Anteraja/Pos/SPX; `30d` J&T/Lion; damage within `2×24h–3×24h` of receipt with unboxing video).
   - Displays color-coded countdown badges (`Bisa Klaim — sisa 18 jam` / `Kedaluwarsa`) and bundles the counter's initial R2 scale/packing photo + receipt into a ready-to-submit claim packet for Mengantar Live Chat / ticket escalation.
