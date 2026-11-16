# 01 — Data Model, State Machine & Dual-Book Schema (`geraiexpress-cfv2`)

## 0. Where each table lives (ADR-0006)

| Store | Tables |
|---|---|
| **D1 `DB` — control plane** | `users`, `sessions`, `email_otps`, `super_admins`, `tenants`, `tenant_members`, `tenant_hostnames` (spec 11), `tenant_api_keys`, `tenant_discount_rules` (*`courier_code`, `service_code`, `assigned_bps`, `cashback_bps`, `effective_from`, `apply_channel` (`mengantar_team \| partner_api`), `requested_at`, `applied_at`, `verified_at`, `verification_state` (`belum_diterapkan \| sesuai \| selisih`), `observed_bps`*), `platform_pricing_policy` (*singleton: `default_discount_bps` `2000`, `min_discount_bps` `2000`, `max_discount_bps` `3000`, `apply_sla_minutes` `60`*), `courier_discount_policy` (*per `courier_code`: `default_discount_bps`, `min_discount_bps`, `max_discount_bps`; missing row → platform values*), `courier_service_catalog` (*DEC-238 limits as data: `min_cod_idr`, `max_cod_idr`, `min_goods_value_idr`, `max_goods_value_idr`, `max_weight_gram`, `dg_supported`, `booking_eco` (J&T ECO = `courier: "JT"` + `eco: true`); `SAPLite` catalogued inactive*), `platform_legal_profile`, platform-scope `audit_logs`, `shipment_index` (thin, non-authoritative), `recipient_risk_index` (§2.6), `webhook_routes` (§2.7), `tenant_daily_stats`, `tenant_schema_versions`, `email_outbox` (DEC-227) |
| **`GeraiVaultDO` SQLite — one object per tenant** | every other table below: outlets, contacts, quotes, shipments and children, receipts, shifts, pickup batches, ledgers, invoice mirror, cashback, `tenant_settings`, `tenant_business_profiles`, `mengantar_connections`, `tenant_courier_prefs`, `bulk_import_batches`/`bulk_import_rows` (§2.5), `webhook_inbox` (§2.7), tenant-scope audit |

Both stores are SQLite and share one schema language (Drizzle `sqlite-core`); tenant tables keep `tenant_id` so rows
are self-describing. Tenant data is reached only through typed `GeraiVaultDO` RPC methods.

All relational data uses SQLite types managed with Drizzle ORM. Timestamps are UTC epoch milliseconds (`INTEGER`), money is **integer Rupiah (`INTEGER`, `_idr`)**, weights are **integer grams (`INTEGER`, `_gram`, default `1000`)**, and percentage rates are **integer basis points (`INTEGER`, `_bps`, `10000 = 100%`)**.

---

## 1. Entity Relationship Overview

```text
Platform & Identity Tables:
  users ──► sessions / email_otps / super_admins (TOTP `aal2`) / courier_service_catalog / audit_logs
  platform_legal_profile (singleton, DEC-218)

tenants (Gerai — identified publicly by `slug`, e.g., `berkahjaya`)
 ├── 1:1 ──► tenant_business_profiles (Optional legal data: entity type, NIB, encrypted NPWP — DEC-218)
 ├── 1:1 ──► mengantar_connections (Seller credentials, key_version, webhook_state, sync cursor & balance)
 ├── 1:N ──► tenant_outlets (Physical pickup master + Mengantar 24-hex `area_id`)
 ├── 1:N ──► tenant_hostnames (D1; `<slug>.geraimitra.com` + Cloudflare for SaaS custom hostnames — spec 11 §4)
 ├── 1:N ──► tenant_members (Roles: `gerai_admin` | `cashier`)
 ├── 1:N ──► tenant_api_keys (Hashed `gx_live_...` keys & scopes for OpenAPI / MCP)
 ├── 1:N ──► tenant_discount_rules (Super Admin per-courier × service `bps` rules)
 ├── 1:N ──► tenant_courier_prefs (`Pengaturan › Ekspedisi Aktif` (`/pengaturan/ekspedisi`) + per-courier `pickup_mode` + Pos COD refusal `cod_blocked_*`)
 ├── 1:N ──► sender_contacts (`Kontak > Pengirim`: walk-in senders & dropship store brands)
 ├── 1:N ──► recipient_contacts (`Kontak > Penerima`: destination addresses & COD history)
 ├── 1:N ──► cashier_shifts (Cash drawer open/close & physical count variance)
 ├── 1:N ──► quote_snapshots (Immutable tariff & volumetric calculation lock)
 ├── 1:N ──► shipments (Composite PK `(tenant_id, slug)` where `slug` = 7-char `INV ID`, e.g., `8k4m2p7`)
 │             ├── 1:N ──► counter_receipts (Append-only payment & void records under `(tenant_id, slug)`)
 │             ├── N:1 ──► pickup_batches (Per-courier Surat Jalan: driver_name, driver_phone, driver_vehicle_no, signature)
 │             ├── 1:N ──► shipment_events (Webhook & polling status transitions)
 │             ├── 1:1 ──► return_intakes (`Meja Retur` scan, R2 photo & 4-digit WA pickup OTP)
 │             └── 1:N ──► shipment_claims (Damage/loss/weight dispute records & countdowns)
 ├── 1:N ──► cashback_ledger (Deferred cashback accrual: `PENDING | RELEASED | CLAWBACK`)
 ├── 1:N ──► counter_ledger_entries (Book 1: Local physical counter cash/QRIS/packing ledger)
 └── 1:N ──► mengantar_invoice_mirror (Book 2: Mirror of Mengantar `GET /invoices` + subItems)
```

---

## 2. Core Table Definitions

### 2.1 Tenant, Outlet Pickup Master & Mengantar Connection
- **`tenants`:** `id`, `slug` (*unique, `3–30` lowercase chars, checked against `RESERVED_SLUGS`*), `name`, `logo_r2_key`, `contact_whatsapp`, `operating_hours_json`, `status` (`draft_application | pending_review | active | suspended`), `masking_enabled` (`1/0`), `masking_daily_quota` (*nullable integer; seeded to `20` on outlet approval; Super Admin may raise it or set `NULL` = no cap with TOTP + audit reason; counts sender-masked sends only, ADR-0005*), `tier_code` (`silver | gold | platinum | titanium` — monthly informational volume badge configured via platform `tier_thresholds_json`, e.g., `0 / 250 / 1000 / 2500` paid parcels/month), `created_at`, `approved_at`.
- **`tenant_business_profiles`** *(optional, owner-only, all fields nullable until the owner fills them)*: `tenant_id` (PK), `entity_type` (`perorangan | ud | cv | pt | koperasi | lainnya`), `legal_name`, `brand_name`, `nib`, `encrypted_npwp` (*AES-256-GCM under `KEK_SECRET`; never in Kasir DTOs or public pages*), `registered_address`, `pic_name`, `pic_role`, `pic_email`, `pic_phone`, `updated_by`, `updated_at`. Empty profile never blocks onboarding or counter work.
- **`tenant_outlets`:** `id`, `tenant_id`, `name`, `pic_name`, `pic_phone`, `mengantar_address_id` (*24-hex pickup record ID*), `mengantar_area_id` (*24-hex subdistrict ID*), `province_name`, `city_name`, `district_name`, `subdistrict_name`, `postal_code`, `street_address`, `latitude`, `longitude` (*decimal degrees, both or neither; sent as Mengantar `pinpointData`, required for a Pos Indonesia scheduled pickup — DEC-238; a changed pinpoint re-registers `mengantar_address_id`*), `is_default`.
- **`pickup_time_slots`** (DEC-238): `address_id`, `slot_date` (`MM-DD-YYYY`), `slot_time` (`HH:00`), `time_id` (Mengantar `POST /time` `_id`), `starts_at`, `created_at`; PK `(address_id, slot_date, slot_time)` — one reserved slot reused while ≥ 90 min ahead.
- **`receiver_score_cache`** (DEC-238): `phone` (PK, `08…`), `state` (`ok | forbidden | limited`), `grade` (`A`..`E-` without `≈`), `approximate`, `average_rate_x10`, `total`, `delivered`, `rts`, `fetched_at` — Mengantar receiver score cached 24 h, refusals included.
- **`mengantar_connections`:** `tenant_id` (PK), `environment` (`sandbox | production`), `onboarding_state` (`not_connected | consent_recorded | registration_pending | registration_unknown | existing_account_required | connected | byok_connected | provider_restricted`), `webhook_state` (`unconfigured | awaiting_seller_setup | active | secret_mismatch | paused`), `seller_id`, `external_user_id`, `encrypted_api_key`, `key_version`, `webhook_path_token`, `encrypted_webhook_secret`, `synced_balance_idr` (*latest `balanceAmount` from Mengantar*), `last_invoice_synced_at`, `last_sync_status`.

### 2.1b Platform Operator Legal Profile (singleton, placeholders until filled)
- **`platform_legal_profile`:** `id` (always `1`), `legal_name` (*`NULL` until filled; never a placeholder string*), `brand_name` (`GeraiExpress`), `entity_type` (`pt`), `nib`, `encrypted_npwp` (*AES-256-GCM under `KEK_SECRET`; Super Admin and tax invoices only, never public*), `akta_number`, `akta_date`, `sk_kemenkumham_number`, `pse_registration_number` (*Kominfo/Komdigi PSE, when issued*), `registered_address`, `correspondence_address`, `support_email`, `support_whatsapp`, `privacy_contact_email` (*UU PDP data-protection contact*), `director_name`, `updated_by`, `updated_at`.
- **Rendering rule:** `geraiexpress.com` footer, `/ketentuan`, `/privasi`, and email footers read only `legal_name`, `pse_registration_number`, `registered_address`, `support_email`, `support_whatsapp`, `privacy_contact_email`; subscription tax invoices may add NPWP. `<slug>.geraimitra.com` mini-sites keep the outlet's own identity and show only `Didukung jaringan resmi GeraiExpress` (+ `legal_name` when filled) and an absolute link to `https://geraiexpress.com/privasi`. A `NULL` field renders nothing (the line is omitted) — never a fake company name, number, or address. Super Admin sees an amber `Data perusahaan belum lengkap (n kolom)` badge until required launch fields (`legal_name`, `registered_address`, `support_email`, `privacy_contact_email`) are filled.

### 2.2 Dedicated Two-Submenu Contacts (`Pengirim` vs `Penerima` — DEC-212)
- **`sender_contacts` (`/kontak/pengirim`):**
  `id`, `tenant_id`, `sender_kind` (`walk_in | reseller_dropship`), `true_name`, `true_phone` (*active WA for return OTPs & COD notices*), `wa_verified_at`, `wa_verified_by` (*user id*), `wa_verify_method` (`operator_confirmed` — the cashier opens a click-to-chat test message and confirms the sender received it at the counter; automated WhatsApp OTP is P2). `wa_verified_*` is set only by an interactive `cashier`/`gerai_admin` counter action (never by `contacts:write` API/MCP keys) and resets to `NULL` whenever `true_phone` changes, `true_street`, `true_area`, `true_postal_code`, `display_brand_name` (*max 30 chars for courier payload, max 60 on local label*), `display_brand_phone`, `hide_gerai_branding` (`1/0`), `deposit_balance_idr` (*optional local reseller prepaid credit*), `shipments_count`, `is_archived`.
- **`recipient_contacts` (`/kontak/penerima`):**
  `id`, `tenant_id`, `linked_sender_id` (*optional*), `name`, `phone` (*normalized `08...`*), `mengantar_area_id`, `province_name`, `city_name`, `district_name`, `subdistrict_name`, `postal_code`, `street_address`, `address_note`, `cod_delivered_count`, `cod_rts_count`, `is_archived`.

### 2.3 Quotes & Unified `INV` Shipments (`PRIMARY KEY (tenant_id, slug)` — DEC-211 & DEC-215)
- **`quote_snapshots`:**
  `id`, `tenant_id`, `shipment_slug`, `outlet_id`, `destination_area_id`, `cod_mode` (`non_cod | cod_goods | cod_shipping`), `cod_fee_mode` (`none | buyer_bears_fee | sender_bears_fee | cod_all_in | dfod`, spec 02 §3.2), `actual_weight_gram` (*default `1000`*), `length_cm`, `width_cm`, `height_cm`, `volumetric_divisor` (`6000 | 4000`), `volumetric_weight_gram`, `billable_weight_gram`, `declared_item_value_idr` (*stored as `declared_value_idr`: the non-COD `goodsValue` sent to Mengantar, `0` = not declared; DEC-238*), `is_dangerous_goods` (*`0/1`, sent as `isDangerousGoods: true`, SiCepat HALU / iDexpress only*), `cod_goods_amount_idr`, `courier_code`, `service_code`, `service_class` (`regular | cargo`), `route_min_weight_gram`, `publish_shipping_idr`, `provider_special_shipping_idr`, `provider_net_shipping_idr` (*exact integer `estimatedSpecialPrice - codFee`*), `raw_discount_percent`, `provider_observed_discount_bps`, `assigned_gerai_discount_bps`, `effective_gerai_cost_idr`, `insurance_fee_idr` (*`NULL` when provider exposes no insurance fee*), `cod_fee_idr` (*integer `codFee` from seller estimate*), `cod_collection_total_idr`, `counter_due_idr`, `quoted_at`, `expires_at`.
- **`shipments`:**
  - **Per-Tenant Identity:** **`PRIMARY KEY (tenant_id, slug)`** where `slug` is a **7-char lowercase CSPRNG Crockford Base32 string** (`crypto.getRandomValues`, no `0/O/1/I/L/U`, e.g., `8k4m2p7` — rendered as **`INV 8K4M2P7`** and sent to Mengantar as `destinationMark: "8K4M2P7"`, matched case-insensitively). Super Admin cross-tenant lookups return `(tenant.slug, shipment.slug)`. Includes `outlet_id`, `entry_channel` (`counter_pos | counter_multi | minisite_qr | api_mcp`), `draft_expires_at` (*`+48h` TTL for `minisite_qr` drafts, purged daily by Cron*), `quote_snapshot_id`, `sender_contact_id`, `recipient_contact_id`, `pickup_batch_id`, `cashier_shift_id`, `created_by_user_id`, `item_quantity` (*`1–999`, Mengantar `quantity`*), `delivery_instruction` (*≤ 120 chars, Mengantar `deliveryInstruction`*) — DEC-238.
  - **Provider & Sync Identifiers:** `status` (see §3), `payment_sync_state` (`unissued | provider_unpaid | provider_paid_estimated | provider_invoice_reconciled`), `mengantar_order_item_id` (`_id`), `mengantar_order_code` (`ORDER_ID`), `mengantar_batch_code` (`batch` human code), `mengantar_batch_object_id` (`batch_id` 24-hex for `pay-unpaid`), `awb_number` (`cnote_no`), `cod_fee_mode` (*copied from the quote*), `provider_status`, `last_provider_event_at` (*UTC epoch ms, start of the minute bucket of the winning provider observation*), `last_provider_rank`, `custody_stage` (`none | handed_to_courier | rts_at_gerai | rts_returned_to_sender | cancelled_local`), `custody_at`, `stuck_attention_at` (*derived alert flag*) — `status` is computed from these by §3, `sorting_code` (*populated from `GET /order?order_id=` `DESTINATION_CODE` post-issue; `NULL` falls back to destination subdistrict/postcode on labels*), `provider_echoed_weight_kg_text`, `provider_cod_fee_raw_text` (*verbatim order `COD_FEE` string for audit*), `courier_code`, `service_code`, `is_cargo` (`1/0`), `cod_mode`.
  - **Counter Payment Record (DEC-220, state machine in spec 03 §1.1):** `counter_payment_status` (`not_required | unpaid | paid | voided`, default `unpaid`; `not_required` when `counter_due_idr = 0`), `counter_payment_method` (`qris | tunai | transfer | deposit`, `NULL` while unpaid), `counter_paid_at`, `counter_paid_by` (user id), `counter_paid_shift_id` (*shift in which the money was received; may differ from `cashier_shift_id`, the shift that created the INV*), `counter_payment_note` (optional, e.g. transfer sender name). Every **monetary** mutation (`mark_paid`, `void_payment`, `sender_cod_payout`, `void_sender_payout`) appends a `counter_receipts` row in the same Durable Object transaction (`transactionSync`) as the projection update; creation and cancellation without money movement go to `shipment_events`/`audit_logs` only. The shipment columns are the current projection. No gateway reference: the money never passes through GeraiExpress.
  - **Immutable Three-Way Identity Snapshots:** `pickup_snapshot_json`, `true_sender_json`, `true_recipient_json`, `mask_snapshot_json`.
  - **Integer Money Columns (`_idr`, spec 02 §3):**
    `declared_item_value_idr`, `cod_goods_amount_idr`, `publish_shipping_idr`, `customer_shipping_idr`, `gerai_shipping_cost_idr` (*expected outlet cost*), `provider_reconciled_cost_idr` (*total actual Mengantar debit for this INV — shipping plus insurance — from `/invoices`, `NULL` until synced*), `packing_addon_idr`, `counter_service_fee_idr`, `promo_discount_idr`, `insurance_fee_idr`, `cod_service_fee_idr` (*sourced strictly from integer seller-estimate `codFee`, never rounded from float order `COD_FEE`*), `cod_collection_total_idr`, `counter_due_idr`, `counter_total_paid_idr`, `expected_provider_cod_credit_idr` (*Mengantar seller credit*), `reconciled_provider_cod_credit_idr` (*from `typeReconciliation` integer `subItem.amount`, `NULL` until synced*), `sender_cod_payable_idr` (*what the outlet owes the walk-in sender — never equal to the seller credit when the outlet earns a shipping spread*), `sender_cod_paid_idr` (*`NULL` until the outlet pays the sender*), `reconciled_extra_adjustment_idr` (*synced return shipping + weight/Cordest adjustments*).
  - **Weights & Evidence:** `actual_weight_gram`, `length_cm`, `width_cm`, `height_cm`, `billable_weight_gram`, `content_declaration_text`, `prohibited_ack_at`, `scale_photo_r2_key`, `first_printed_at`, `print_count`.

### 2.4 Counter Receipts, Manifests & Tenant Settings

- **`counter_receipts`** (append-only): `id`, `tenant_id`, `shipment_slug`, `event` (`mark_paid | void_payment | sender_cod_payout | void_sender_payout`), `direction` (`in | out`), `amount_idr` (*always positive; sign comes from `direction`*), `method` (`qris | tunai | transfer | deposit`), `cash_received_idr`, `change_idr`, `shift_id`, `actor_user_id`, `reason` (*required for `void_payment` and `void_sender_payout`*), `voids_receipt_id` (*for void events*), `bulk_batch_id` (*nullable; set when one batch payment covers many INVs, spec 03 §1.3*), `idempotency_key` (*unique per tenant*), `created_at`.
- **`pickup_batches`** (`Surat Jalan`): `id`, `tenant_id`, `outlet_id`, `courier_code`, `status` (`open | handed_over | dropped_at_branch | cancelled`), `driver_name` (*required at handover, 2–60 chars*), `driver_phone` (*required, Indonesian mobile*), `driver_vehicle_no` (*required, uppercase plate, 3–12 chars; maps to AutoKirim's `vehicle_no`*), `signature_r2_key` *or* `signed_manifest_photo_r2_key`, `scanned_count`, `handed_over_at`, `handed_over_by`, `surat_jalan_pdf_r2_key`, `created_at`.
- **`tenant_settings`** (`tenant_id` PRIMARY KEY — the object's own tenant; the link to D1 `tenants.id` is application-enforced because the two are separate SQLite databases (ADR-0006), one row per tenant; owner-only writes, audit-logged; `updated_at`, `updated_by`): `default_label_format` (`label_10x15_with_stub | label_10x10 | label_10x15 | roll_58mm`, default `label_10x15_with_stub`), `unboxing_remark_text` (*0–50 chars, default `Rekam video saat buka paket untuk klaim` (39 chars); empty hides the line*), `show_commission_on_quick_check` (`0/1`, default `0`; owner-only even when `1` — never sent to `cashier` DTOs), `counter_service_fee_enabled` (`0/1`, default `0`), `counter_service_fee_default_idr` (*`NULL` or `1000–200000`*), `cargo_recommend_threshold_gram` (*default `5000`*), `cashier_may_pay_sender_cod` (`0/1`, default `0`; UI `Kasir boleh bayar COD`), `masking_offered` (`0/1`, default `0`, DEC-231), `masking_presets_enabled` (*subset of `dropship_toko`, `privasi_penerima_cod`, `full_nama_gerai`; `standar_gerai` always on*), `masking_default_preset`, `mask_recipient_phone_on_cod_default` (`0/1`). Device-local (not stored in D1): paired printer id and print density.

### 2.5 Bulk Imports (`Paket Massal`, DEC-229 — tenant DO)

- **`bulk_import_batches`:** `id`, `tenant_id`, `sender_contact_id`, `source` (`manual | csv | xlsx`), `file_name`, `row_count`, `ready_count`, `failed_count`, `state` (`draft | checking | ready | dispatching | done | partially_failed | cancelled`), `counter_payment_status` (as shipments), `created_by`, `created_at`, `updated_at`.
- **`bulk_import_rows`:** `batch_id`, `row_no` (PK together), `raw_json` (*uploaded cells as text*), normalised recipient/weight/COD fields, `area_id`, `errors_json`, `shipment_slug` (*set when the INV is created*).
- **Batch payment:** one `mark_paid` request for the batch writes one `counter_receipts` row per INV in a single DO transaction, each with `bulk_batch_id` and idempotency key `<batch idempotency key>:<slug>`; either all rows commit or none.

### 2.6 Recipient Risk Index (cross-tenant, D1 — Super Admin only)

- **`recipient_risk_index`** (D1): `phone_hmac` (*HMAC-SHA256 of the normalised phone with server pepper — no plain phone in D1*), `tenant_id`, `delivered_count`, `rts_count`, `last_event_at`. Each tenant object pushes, through its outbox, an **absolute** upsert `(phone_hmac, tenant_id, delivered_count, rts_count, version)` computed from its own `recipient_contacts` after a terminal COD status; D1 applies it only when `version` is greater than the stored one, so a retried or reordered message never double-counts (test: lost acknowledgement + retry leaves counts unchanged). Super Admin `Radar Risiko COD` searches by phone (hashed server-side, `risk_review` permission, audited) and sees per-tenant counts; reading a tenant's shipment detail goes through that tenant's object RPC with the same audit. Outlets see only their own badge.

### 2.7 Webhook Routing (D1 control plane)

- **`webhook_routes`** (D1): `token_hash` (PK, SHA-256 of the opaque 32-byte `webhook_path_token`), `tenant_id`, `key_version`, `state` (`active | rotating | revoked`), `created_at`, `revoked_at`. The plain token exists only in the URL given to Mengantar and in the tenant object.
- **Ingest:** `hooks.` hashes the path token → D1 lookup → unknown/revoked → `404` with no body. Known → the request (raw body, headers) is passed to that tenant's `GeraiVaultDO.verifyWebhook` RPC, which checks `x-signature = HMAC_SHA256("{x-timestamp}.{rawBody}")` with the encrypted secret and the ±5-minute window and then, **in the same object transaction, inserts the verified raw body into the tenant-local `webhook_inbox`** (`event_key` PK = SHA-256 of `x-timestamp` + raw body, `provider_timestamp_s` (*the verified `x-timestamp` header as received, integer seconds — kept for signature audit*), `provider_event_at` (*the same instant normalised to UTC epoch **milliseconds** = `provider_timestamp_s × 1000`*), `received_at`, `raw_body`, `state` (`received | applied | rejected`), `applied_at`, `error`). A duplicate `event_key` is a no-op. Only after that commit is the Queue message `{ tenant_id, event_key }` (tenant id from D1, never from the body) enqueued and `200` returned.
- **Apply:** the Queue consumer calls `GeraiVaultDO.applyWebhook(event_key)`, which reads the stored body and `provider_event_at`, applies the status transition idempotently with the shared ordering rule of §3 and marks the row `applied` in one transaction; re-delivery of an applied key is a no-op. A daily alarm re-enqueues rows still `received` after 10 minutes (lost Queue message or failed enqueue) and deletes `applied` rows older than 30 days. Tests: restart between ingest and consumption, duplicate delivery, enqueue failure after commit, and two events consumed in reverse order after a restart (stale non-terminal ignored for status, terminal never regresses).
- **Rotation:** a new token row is `active` while the old one is `rotating` for 24 h (both verify against their own secret version), then `revoked`.

---

## 3. Shipment Lifecycle State Machine

```text
[draft] ──(Confirm at POS via GeraiVaultDO)──► [issuing_in_flight]
                                                       │
       ┌──────────────(Network timeout)────────────────┼────────────────────(Insufficient Mengantar balance)──┐
       ▼                                               │ (Paid & AWB issued)                                  ▼
[reconciliation_needed]                                ▼                                         [provider_unpaid_hold]
       │                                      [ready_for_pickup] ◄──(Top-up synced + `pay-unpaid`)────────────┘
       └──────(Verified via GET /order)────────────────┤
                                                       ├──(Cancelled pre-pickup, read back)──► [cancelled]
                                                       ▼ (Scanned into Courier Manifest = custody)
                                              [handed_to_courier]
                                                       │
                                                       ▼
                                                 [in_transit] ··(>48h no scan: alert flag)··► (stuck_attention)
                                                       │
                     ┌─────────────────┬───────────────┼───────────────────────┐
                     ▼                 ▼               ▼                       ▼
                  [lost]          [delivered]  [undelivery_hold]        [rts_in_transit]
                                                       │                       │
                                                       └──(Failed delivery)───►▼
                                                                     [provider_returned]   (provider says: back at
                                                                               │            outlet — NOT custody proof)
                                                                               ▼ (Meja Retur scan = custody)
                                                                        [rts_at_gerai]
                                                                               │ (4-digit WA OTP verified = custody)
                                                                               ▼
                                                                   [rts_returned_to_sender]
```
States are the effective `status` values; `(stuck_attention)` is a flag, not a state. `[rts_at_gerai]` can also be
reached directly from `[rts_in_transit]` or `[undelivery_hold]` when the parcel is scanned at Meja Retur before the
provider reports it (custody wins, combine table below).

- **Status = two order-independent projections + one combine function (webhook, polling and local actions):**
  1. **Provider projection** (`provider_status`). Every provider observation is normalised to `event_at` (UTC epoch
     ms): webhook `provider_event_at` (§2.7); polling `GET /order` `history[]` `date` (`DD-MM-YYYY HH:mm`,
     Asia/Jakarta) parsed as Asia/Jakarta → UTC ms; the exact value stays in history. Key =
     `(is_terminal, minute_bucket = floor(event_at / 60000), rank)`; `provider_status` = the observation with the
     largest key (a maximum over a total order, so arrival order does not matter; polling's minute precision is why
     the bucket is used).

     | Rank | Provider status |
     |---:|---|
     | 10 | `ready_for_pickup` (provider has the order, not yet collected) |
     | 30 | `in_transit` |
     | 40 | `undelivery_hold` |
     | 50 | `rts_in_transit` (a return follows a failed delivery) |
     | 60 | `provider_returned` (provider reports the return delivered to the seller address = the outlet) |
     | 90 | `cancelled` (terminal) |
     | 91 | `lost` (terminal) |
     | 92 | `delivered` (terminal) |

  2. **Custody projection** (`custody_stage`), from verified local actions only, monotone (never decreases):
     `none` 0 → `handed_to_courier` 1 (manifest handover, spec 04) → `rts_at_gerai` 2 (Meja Retur intake) →
     `rts_returned_to_sender` 3 (OTP-verified handback) or `cancelled_local` 3 (cancel before pickup, provider cancel
     read back). `custody_stage` = the maximum stage recorded (tie at level 3: `rts_returned_to_sender` outranks
     `cancelled_local`, so the maximum is order-independent); provider observations never change it.
  3. **Effective `status`** (stored on `shipments`, shown everywhere) = `combine(provider_status, custody_stage)`:

     | `custody_stage` | Effective status | `provider_status_conflict` raised when |
     |---|---|---|
     | `rts_returned_to_sender` / `cancelled_local` | `rts_returned_to_sender` / **`cancelled`** (the custody value `cancelled_local` is never shown as a status; every `cancelled` guard applies, e.g. the spec 04 manifest block) | provider is `delivered` or `lost`; for `cancelled_local` also any provider rank ≥ 30 |
     | `rts_at_gerai` | `rts_at_gerai` | provider is `delivered` or `lost` |
     | `handed_to_courier` | `provider_status` when its rank ≥ 30, else `handed_to_courier` | — |
     | `none` | `provider_status` | — |

     Both inputs are maxima and `combine` is a pure function, so the effective status is the same in every arrival
     order and after a restart. Verified local custody is never undone by a provider event; a contradiction is kept
     in history and surfaces as a `provider_status_conflict` item in `Kiriman › Kendala & Klaim` for the owner.
  4. Stored: `provider_status`, `last_provider_event_at` (bucket start of the winning provider key),
     `last_provider_rank`, `custody_stage`, `custody_at`, effective `status`. Within one minute a lower-rank provider
     event after a higher one does not move `provider_status` back; the next minute corrects it (accepted trade-off).
  5. `stuck_attention` is **not** a status: a derived alert flag (`stuck_attention_at`) set by the sweep (> 48 h
     without a provider observation while `in_transit`) and cleared by any newer observation. Pre-issue states
     (`draft`, `issuing_in_flight`, `reconciliation_needed`, `provider_unpaid_hold`) belong to ADR-0004 dispatch, not
     to this rule.
  6. Required tests (both arrival orders and after restart): webhook `in_transit` 10:15:40 vs poll `rts_in_transit`
     10:15 → `rts_in_transit`; local handover then later provider `ready_for_pickup` → `handed_to_courier`; local
     Meja Retur intake then later provider `in_transit` → `rts_at_gerai`; verified handback then later provider
     `delivered` → `rts_returned_to_sender` + conflict; read-back-confirmed local cancel → effective `cancelled`, still blocked
     from manifest handover after restart; random permutation property test over mixed observations.
- `provider_unpaid_hold` models Mengantar's verified behavior where `POST /order` succeeds with `isPaid: false, cnote_no: null` when seller balance is low, awaiting top-up + `POST /order/pay-unpaid` using the 24-hex `mengantar_batch_object_id`.
