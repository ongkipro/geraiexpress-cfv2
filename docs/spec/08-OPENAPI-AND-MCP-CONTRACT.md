# 08 — OpenAPI 3.1 & Model Context Protocol (MCP) Contract (`geraiexpress-cfv2`)

`geraiexpress-cfv2` exposes both **OpenAPI 3.1 REST endpoints** and **stateless Streamable HTTP MCP servers** directly from Cloudflare Workers so outlet owners, reseller e-commerce stores, WhatsApp bots, and AI assistants integrate safely.

---

## 1. Single-Source Schema Pipeline (`Zod → OpenAPI 3.1 + TypeScript + MCP`)

1. All request/response contracts are authored once with **`@hono/zod-openapi`**.
2. That single schema generates:
   - runtime validation and role-based DTO filtering inside the Worker,
   - `/api/v1/openapi.json` (OpenAPI 3.1.0) and interactive **Scalar API Reference (`/api/v1/docs`)**,
   - typed RPC clients for `web-app` and `web-owner`,
   - JSON Schema `inputSchema` and safety annotations (`readOnlyHint`, `idempotentHint`, `destructiveHint`) for **MCP Tools**.
3. **Canonical Units Across All Schemas:**
   - Money: integer Rupiah (`_idr`, e.g., `24000`).
   - Weight: **integer grams (`weight_gram`, default `1000`, min `10`)**; dimensions in integer cm (`_cm`).
   - Shipment identifier: short `INV` slug (`"8k4m2p7"`).
   - Error messages: Indonesian (`error.message`) paired with stable English machine codes (`error.code`).

---

## 2. Three Scoped Surfaces

| Surface | Endpoint | Consumer | Authentication |
|---|---|---|---|
| **1. Outlet Partner OpenAPI & MCP** | `https://app.geraiexpress.com/api/v1/*` · Docs: `/api/v1/docs` · MCP: `https://app.geraiexpress.com/mcp` | Outlet Owner's AI assistant, reseller WooCommerce/Shopify stores, shop WhatsApp bots | `Authorization: Bearer gx_live_<token>` (SHA-256 hashed in D1, managed in `Pengaturan > API & MCP`) |
| **2. Mini-Site Public API & WebMCP** | `https://<gerai-slug>.gerai.cc/api/public/*` · MCP: `https://<gerai-slug>.gerai.cc/mcp` | Public buyers/resellers & public AI shopping assistants | Strict per-IP rate limiting (+ Turnstile on browser forms; capped draft quota on MCP) |
| **3. Super Admin Internal Schema** | `https://owner.geraiexpress.com/api/owner/*` *(internal build artifact only; no public docs)* | `web-owner` console | `__Host-ge_owner` cookie + `aal2` TOTP |

### Granular Token Scopes (`Pengaturan > API & MCP` — Owner Only)
- `rates:read` — search subdistricts & compare customer shipping rates (never exposes outlet net cost unless `finance:read` is also granted).
- `finance:read` — read outlet net costs, margins, synced Mengantar `/invoices` ledger, and dashboard analytics *(for Owner's private AI assistant only)*.
- `finance:sync` — trigger on-demand Mengantar `/invoices` synchronization (`POST /api/v1/finance/sync` & `sync_mengantar_finance`, rate-limited per outlet).
- `contacts:read` / `contacts:write` — read/manage `Kontak > Pengirim` and `Kontak > Penerima`.
- `shipments:draft` — create `INV` pre-booking drafts ready to weigh & pay at the counter *(recommended default scope for reseller store integrations & WA bots — zero balance spend risk)*.
- `shipments:issue` — issue paid shipments or trigger `pay-unpaid` via `GeraiVaultDO` *(requires `Idempotency-Key` header + per-key daily Rupiah cap)*.
- `tracking:read` — read shipment statuses, exception buckets, and `Meja Retur` queues.

---

## 3. Core OpenAPI v1 Endpoints (`/api/v1`)

| Method & Path | Required Scope | Summary |
|---|---|---|
| `GET /api/v1/areas?q=coblong` | `rates:read` | Search Mengantar subdistricts & postcodes (KV-cached). |
| `POST /api/v1/quotes` | `rates:read` | Input `destination_area_id`, `weight_gram` *(default `1000`)*, optional `length_cm/width_cm/height_cm`, `cod_mode`, `item_value_idr` → returns active couriers, `billable_weight_gram`, customer tariffs, dynamic courier requirements, and (if `finance:read`) net cost & margin. |
| `POST /api/v1/shipments` | `shipments:draft` | Allocates a new `INV` slug (e.g., `"8k4m2p7"`), stores draft/pre-booking, and returns QR URL. |
| `GET /api/v1/shipments` & `GET /api/v1/shipments/:slug` | `tracking:read` | List or fetch shipment details by `INV` slug or `?awb=`. |
| `POST /api/v1/shipments/:slug/issue` | `shipments:issue` | Atomically dispatches order to Mengantar via `GeraiVaultDO` (`Idempotency-Key` required). |
| `POST /api/v1/shipments/:slug/pay-unpaid` | `shipments:issue` | Completes payment via Mengantar `POST /order/pay-unpaid` after balance top-up. |
| `GET / POST /api/v1/contacts/senders` | `contacts:*` | Manage `Kontak > Pengirim` (walk-in & reseller masking profiles). |
| `GET / POST /api/v1/contacts/recipients` | `contacts:*` | Manage `Kontak > Penerima` + COD delivery/return stats. |
| `GET /api/v1/finance/summary` | `finance:read` | Read Dual-Book financial summary and synced Mengantar balance. |
| `POST /api/v1/finance/sync` | `finance:sync` | Trigger rate-limited on-demand Mengantar `/invoices` sync. |

---

## 4. MCP Tool Catalog (Stateless Streamable HTTP)

### 4.1 Authenticated Outlet MCP (`https://app.geraiexpress.com/mcp`)
- `search_subdistrict_areas` (`readOnlyHint: true`, `rates:read`)
- `compare_courier_rates` (`readOnlyHint: true`, `rates:read` — `weight_gram` defaults to `1000`)
- `check_cod_recipient_risk` (`readOnlyHint: true`, `tracking:read`)
- `create_shipment_inv_draft` (`idempotentHint: true`, `shipments:draft` — creates `INV` draft + QR for counter handover)
- `issue_paid_shipment` (`idempotentHint: true`, `destructiveHint: true`, `openWorldHint: true`, `shipments:issue` — gated by `GeraiVaultDO` + daily cap)
- `get_shipment_by_inv_or_awb` (`readOnlyHint: true`, `tracking:read`)
- `list_attention_shipments` (`readOnlyHint: true`, `tracking:read` — stuck >48h, undelivery, weight diff, claim expiring)
- `list_pending_returns_at_gerai` (`readOnlyHint: true`, `tracking:read`)
- `get_gerai_financial_analytics` (`readOnlyHint: true`, `finance:read` — synced Mengantar balance, COD pipeline, profit, courier RTS %)
- `sync_mengantar_finance` (`idempotentHint: true`, `openWorldHint: true`, `finance:sync` — triggers immediate `/invoices` sync)
- `upsert_sender_or_recipient_contact` (`contacts:write`)

### 4.2 Public Outlet Mini-Site MCP (`https://<gerai-slug>.gerai.cc/mcp`)
Exposes 4 strictly public, tenant-scoped tools: `get_gerai_outlet_info`, `quote_public_shipping_rates` (`weight_gram` default `1000`), `create_public_prebooking_inv`, and `track_public_shipment_privacy_safe` (initials-only PII truncation enforced).

---

## 5. Prompt-Injection & Audit Defenses
- Untrusted parcel/address strings returned to MCP clients are structured JSON fields; tokens lacking `finance:read` or `shipments:issue` are rejected at the Hono middleware layer regardless of LLM prompt instructions.
- Every API/MCP write logs `actor_type` (`api_key` | `mcp_client`) and `api_key_id` in the outlet's audit trail.
