# 01 — D1 Data Model, State Machine & Dual-Book Schema (`geraiexpress-cfv2`)

All relational data lives in **Cloudflare D1 (SQLite)** managed with Drizzle ORM. Timestamps are UTC epoch milliseconds (`INTEGER`), money is **integer Rupiah (`INTEGER`, `_idr`)**, weights are **integer grams (`INTEGER`, `_gram`, default `1000`)**, and percentage rates are **integer basis points (`INTEGER`, `_bps`, `10000 = 100%`)**.

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
 ├── 1:N ──► tenant_custom_domains (Cloudflare for SaaS hostnames beyond `<slug>.gerai.cc`)
 ├── 1:N ──► tenant_members (Roles: `gerai_admin` | `cashier`)
 ├── 1:N ──► tenant_api_keys (Hashed `gx_live_...` keys & scopes for OpenAPI / MCP)
 ├── 1:N ──► tenant_discount_rules (Super Admin per-courier × service `bps` rules)
 ├── 1:N ──► tenant_courier_prefs (`Pengaturan > Ekspedisi Aktif` + per-courier `pickup_mode`)
 ├── 1:N ──► sender_contacts (`Kontak > Pengirim`: walk-in senders & dropship store brands)
 ├── 1:N ──► recipient_contacts (`Kontak > Penerima`: destination addresses & COD history)
 ├── 1:N ──► cashier_shifts (Cash drawer open/close & physical count variance)
 ├── 1:N ──► quote_snapshots (Immutable tariff & volumetric calculation lock)
 ├── 1:N ──► shipments (Composite PK `(tenant_id, slug)` where `slug` = 7-char `INV ID`, e.g., `8k4m2p7`)
 │             ├── 1:N ──► counter_receipts (Append-only payment & void records under `(tenant_id, slug)`)
 │             ├── N:1 ──► pickup_batches (Per-courier handover manifest & courier signature)
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
- **`tenant_outlets`:** `id`, `tenant_id`, `name`, `pic_name`, `pic_phone`, `mengantar_address_id` (*24-hex pickup record ID*), `mengantar_area_id` (*24-hex subdistrict ID*), `province_name`, `city_name`, `district_name`, `subdistrict_name`, `postal_code`, `street_address`, `latitude`, `longitude`, `is_default`.
- **`mengantar_connections`:** `tenant_id` (PK), `environment` (`sandbox | production`), `onboarding_state` (`not_connected | consent_recorded | registration_pending | registration_unknown | existing_account_required | connected | byok_connected | provider_restricted`), `webhook_state` (`unconfigured | awaiting_seller_setup | active | secret_mismatch | paused`), `seller_id`, `external_user_id`, `encrypted_api_key`, `key_version`, `webhook_path_token`, `encrypted_webhook_secret`, `synced_balance_idr` (*latest `balanceAmount` from Mengantar*), `last_invoice_synced_at`, `last_sync_status`.

### 2.1b Platform Operator Legal Profile (singleton, placeholders until filled)
- **`platform_legal_profile`:** `id` (always `1`), `legal_name` (*`NULL` until filled; never a placeholder string*), `brand_name` (`GeraiExpress`), `entity_type` (`pt`), `nib`, `encrypted_npwp` (*AES-256-GCM under `KEK_SECRET`; Super Admin and tax invoices only, never public*), `akta_number`, `akta_date`, `sk_kemenkumham_number`, `pse_registration_number` (*Kominfo/Komdigi PSE, when issued*), `registered_address`, `correspondence_address`, `support_email`, `support_whatsapp`, `privacy_contact_email` (*UU PDP data-protection contact*), `director_name`, `updated_by`, `updated_at`.
- **Rendering rule:** `geraiexpress.com` footer, `/ketentuan`, `/privasi`, and email footers read only `legal_name`, `pse_registration_number`, `registered_address`, `support_email`, `support_whatsapp`, `privacy_contact_email`; subscription tax invoices may add NPWP. `<slug>.gerai.cc` mini-sites keep the outlet's own identity and show only `Didukung jaringan resmi GeraiExpress` (+ `legal_name` when filled) and an absolute link to `https://geraiexpress.com/privasi`. A `NULL` field renders nothing (the line is omitted) — never a fake company name, number, or address. Super Admin sees an amber `Data perusahaan belum lengkap (n kolom)` badge until required launch fields (`legal_name`, `registered_address`, `support_email`, `privacy_contact_email`) are filled.

### 2.2 Dedicated Two-Submenu Contacts (`Pengirim` vs `Penerima` — DEC-212)
- **`sender_contacts` (`/kontak/pengirim`):**
  `id`, `tenant_id`, `sender_kind` (`walk_in | reseller_dropship`), `true_name`, `true_phone` (*active WA for return OTPs & COD notices*), `wa_verified_at`, `wa_verified_by` (*user id*), `wa_verify_method` (`operator_confirmed` — the cashier opens a click-to-chat test message and confirms the sender received it at the counter; automated WhatsApp OTP is P2). `wa_verified_*` is set only by an interactive `cashier`/`gerai_admin` counter action (never by `contacts:write` API/MCP keys) and resets to `NULL` whenever `true_phone` changes, `true_street`, `true_area`, `true_postal_code`, `display_brand_name` (*max 30 chars for courier payload, max 60 on local label*), `display_brand_phone`, `hide_gerai_branding` (`1/0`), `deposit_balance_idr` (*optional local reseller prepaid credit*), `shipments_count`, `is_archived`.
- **`recipient_contacts` (`/kontak/penerima`):**
  `id`, `tenant_id`, `linked_sender_id` (*optional*), `name`, `phone` (*normalized `08...`*), `mengantar_area_id`, `province_name`, `city_name`, `district_name`, `subdistrict_name`, `postal_code`, `street_address`, `address_note`, `cod_delivered_count`, `cod_rts_count`, `is_archived`.

### 2.3 Quotes & Unified `INV` Shipments (`PRIMARY KEY (tenant_id, slug)` — DEC-211 & DEC-215)
- **`quote_snapshots`:**
  `id`, `tenant_id`, `shipment_slug`, `outlet_id`, `destination_area_id`, `cod_mode` (`non_cod | cod_goods | cod_shipping`), `cod_fee_bearer` (`sender | recipient_grossup`), `actual_weight_gram` (*default `1000`*), `length_cm`, `width_cm`, `height_cm`, `volumetric_divisor` (`6000 | 4000`), `volumetric_weight_gram`, `billable_weight_gram`, `item_value_idr`, `courier_code`, `service_code`, `service_class` (`regular | cargo`), `route_min_weight_gram`, `publish_shipping_idr`, `provider_special_shipping_idr`, `raw_discount_percent`, `provider_observed_discount_bps`, `assigned_gerai_discount_bps`, `effective_gerai_cost_idr`, `insurance_fee_idr` (*`NULL` when provider exposes no insurance fee*), `cod_fee_idr` (*integer `codFee` from seller estimate*), `cod_collection_idr`, `quoted_at`, `expires_at`.
- **`shipments`:**
  - **Per-Tenant Identity:** **`PRIMARY KEY (tenant_id, slug)`** where `slug` is a **7-char lowercase CSPRNG Crockford Base32 string** (`crypto.getRandomValues`, no `0/O/1/I/L/U`, e.g., `8k4m2p7` — rendered as **`INV 8K4M2P7`** and sent to Mengantar as `destinationMark: "8K4M2P7"`, matched case-insensitively). Super Admin cross-tenant lookups return `(tenant.slug, shipment.slug)`. Includes `outlet_id`, `entry_channel` (`counter_pos | counter_multi | minisite_qr | api_mcp`), `draft_expires_at` (*`+48h` TTL for `minisite_qr` drafts, purged daily by Cron*), `quote_snapshot_id`, `sender_contact_id`, `recipient_contact_id`, `pickup_batch_id`, `cashier_shift_id`, `created_by_user_id`.
  - **Provider & Sync Identifiers:** `status` (see §3), `payment_sync_state` (`unissued | provider_unpaid | provider_paid_estimated | provider_invoice_reconciled`), `mengantar_order_item_id` (`_id`), `mengantar_order_code` (`ORDER_ID`), `mengantar_batch_code` (`batch` human code), `mengantar_batch_object_id` (`batch_id` 24-hex for `pay-unpaid`), `awb_number` (`cnote_no`), `sorting_code` (*populated from `GET /order?order_id=` `DESTINATION_CODE` post-issue; `NULL` falls back to destination subdistrict/postcode on labels*), `provider_echoed_weight_kg_text`, `provider_cod_fee_raw_text` (*verbatim order `COD_FEE` string for audit*), `courier_code`, `service_code`, `is_cargo` (`1/0`), `cod_mode`.
  - **Counter Payment Record (DEC-220):** `counter_payment_status` (`paid | unpaid`, default `unpaid`), `counter_payment_method` (`qris | tunai | transfer | deposit`, `NULL` while unpaid), `counter_paid_at`, `counter_paid_by` (user id), `counter_payment_note` (optional, e.g. transfer sender name). Marking paid or reverting writes an append-only `counter_receipts` row; the shipment columns are the current projection. No gateway reference: the money never passes through GeraiExpress.
  - **Immutable Three-Way Identity Snapshots:** `pickup_snapshot_json`, `true_sender_json`, `true_recipient_json`, `mask_snapshot_json`.
  - **15 Integer Money Columns (`_idr`):**
    `item_value_idr`, `publish_shipping_idr`, `customer_shipping_idr`, `gerai_shipping_cost_idr` (*expected outlet cost*), `provider_reconciled_cost_idr` (*actual debit from Mengantar `/invoices`, `NULL` until synced*), `packing_addon_idr`, `counter_service_fee_idr`, `promo_discount_idr`, `insurance_fee_idr`, `cod_service_fee_idr` (*sourced strictly from integer seller-estimate `codFee`, never rounded from float order `COD_FEE`*), `cod_collection_total_idr`, `counter_total_paid_idr`, `estimated_cod_net_payout_idr`, `reconciled_cod_net_payout_idr` (*from `typeReconciliation` integer `subItem.amount`, `NULL` until synced*), `reconciled_extra_adjustment_idr` (*synced return shipping + weight/Cordest adjustments*).
  - **Weights & Evidence:** `actual_weight_gram`, `length_cm`, `width_cm`, `height_cm`, `billable_weight_gram`, `content_declaration_text`, `prohibited_ack_at`, `scale_photo_r2_key`, `first_printed_at`, `print_count`.

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
                                                       ├──(Cancelled pre-pickup)──► [cancelled]
                                                       ▼ (Scanned into Courier Manifest)
                                              [handed_to_courier]
                                                       │
                                                       ▼
                                                 [in_transit] ──(>48h no scan / exception)──► [stuck_attention]
                                                       │                                             │
                                ┌──────────────────────┼───────────────────────┐◄────────────────────┘
                                ▼                      ▼                       ▼
                           [delivered]         [undelivery_hold]        [rts_in_transit]
                                                       │                       │
                                                       └──(Failed delivery)───►▼ (Arrives at Outlet & scanned)
                                                                        [rts_at_gerai]
                                                                               │ (4-digit WA OTP verified)
                                                                               ▼
                                                                   [rts_returned_to_sender]
```

- Terminal states (`delivered`, `rts_returned_to_sender`, `lost`, `cancelled`) **never regress** on out-of-order webhooks; transitions compare provider `x-timestamp`.
- `provider_unpaid_hold` models Mengantar's verified behavior where `POST /order` succeeds with `isPaid: false, cnote_no: null` when seller balance is low, awaiting top-up + `POST /order/pay-unpaid` using the 24-hex `mengantar_batch_object_id`.
