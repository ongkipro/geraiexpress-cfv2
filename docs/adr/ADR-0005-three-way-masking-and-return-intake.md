# ADR-0005: Three-Way Identity Masking, Outlet-Only Pickup & Mandatory Return Intake

- **Status:** Accepted (2026-11-12)
- **Related:** DEC-206

## Context
A primary differentiator of GeraiExpress v2 is enabling walk-in resellers, dropshippers, and privacy-conscious senders to customize printed sender/outlet/recipient details on parcel labels while **couriers always pick up consolidated parcels at the outlet's physical address**.

Market and regulatory evidence established three constraints:
1. **Return Routing Reality:** Under Mengantar and Indonesian courier rules, failed deliveries (`RTS`) return to the **provider pickup address** — meaning **100% of returned masked parcels arrive back at the Gerai**, never at the masked sender's home/shop.
2. **Regulatory & Hub Scan Gate (Pending Counsel Confirmation):** Permenkomdigi No. 8/2025 Art. 77 raises potential postal QR metadata requirements for carrier labels (flagged for counsel review prior to public release), and local-vs-provider label acceptance per courier hub requires physical verification before public claims.
3. **Abuse Prevention:** Anonymous sender masking without verified true-sender records invites prohibited-goods and COD fraud.

## Decision
1. **Immutable Three-Layer Identity Snapshot on Every Shipment (`shipments`):**
   - `pickup_snapshot_json` — always the outlet's verified Mengantar pickup address & PIC.
   - `true_sender_json` & `true_recipient_json` — real sender (name + active WhatsApp) and real recipient (sent to Mengantar so delivery couriers can call the buyer; retained for returns, COD settlements, and audits).
   - `mask_snapshot_json` — presentation rules per surface:
     - `STANDARD_GERAI`: prints walk-in sender + Gerai logo/name/WhatsApp.
     - `RESELLER_DROPSHIP`: prints reseller brand name & phone from `Kontak > Pengirim`; **strips all Gerai logo/name/WhatsApp** from label and public tracking.
     - `RECIPIENT_PRIVACY`: masks recipient phone on paper (`0857****8821`) and optionally hides Non-COD shipping fee to prevent COD WhatsApp scams while keeping full recipient phone in the upstream courier payload.
     - `FULL_GERAI_MASK`: prints Gerai identity as sender upon sender request while preserving `true_sender_json` internally.
2. **Mandatory Paired Safeguards:**
   - Every masked **or COD** shipment requires counter prohibited-goods confirmation (`prohibited_ack_at`) and `sender_contacts.wa_verified_at IS NOT NULL` at issue time (PR-15).
   - **Reveal audit:** on an issued masked `INV` (shipment detail, `Meja Retur`, claim), `true_sender_json` stays collapsed behind `Lihat Pengirim Asli`; opening it asks for a reason and writes an `audit_logs` row (`action = 'true_sender_reveal'`, actor, `INV`, reason). The contact book itself (`Kontak > Pengirim`) shows the owner's own contacts and is not a reveal.
   - **Masking quota:** `tenants.masking_daily_quota` caps **sender-masked** sends (`RESELLER_DROPSHIP`, `FULL_GERAI_MASK`) per outlet per WIB day. `STANDARD_GERAI` and `RECIPIENT_PRIVACY` on a standard base are never capped, so anti-scam recipient masking is always available. Over the cap, the POS disables the sender-masked presets for new selections (`Kuota masking hari ini habis`), and `issue` **rejects** an over-quota sender-masked draft with `422 MASKING_QUOTA_EXCEEDED` (QR pre-bookings and API calls included) until the operator explicitly switches the draft to `Standar Gerai` — never a silent fallback that prints the outlet or true sender on a dropshipper's parcel.
   - **Meja Retur (`Return Intake`)** is a P0 launch module: scanning an arriving RTS AWB reveals `true_sender_json`, records parcel condition + R2 photo, generates a **4-digit pickup OTP** via WhatsApp, and logs final handover back to the true sender.
   - Super Admin holds an instant per-outlet `masking_enabled` kill-switch.
   - Local masked thermal labels are gated per courier by a physical hub-scan pilot test in Milestone M6.

## Consequences
- **Positive:** turns every GeraiExpress outlet into a trusted fulfillment drop-point for dozens of local online sellers without return-pile chaos or COD recipient data leaks.
