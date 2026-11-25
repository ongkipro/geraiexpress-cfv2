# ARCHITECTURE.md — System Architecture (`geraiexpress-cfv2`)

This document defines the production topology for **GeraiExpress v2** on **Cloudflare Serverless** (the only non-Cloudflare runtime is the stateless Partner-API egress relay, co-hosted as an isolated container on the `99ribu-prod` Vultr host, DEC-219 → DEC-235), its dual-domain isolation (`geraiexpress.com` + `*.geraimitra.com`), per-outlet serialization with **Durable Objects**, precision financial synchronization with **Mengantar**, and **OpenAPI 3.1 + MCP** exposure.

Rendered Mermaid views (context, containers, host routing, both ERDs, key sequences, state machines): [`docs/DIAGRAMS.md`](docs/DIAGRAMS.md).

---

## 1. High-Level Topology

```text
                        ┌──────────────────────────────────────────────────────────┐
                        │                  CLOUDFLARE GLOBAL EDGE                  │
                        │     DNS · SSL for SaaS · WAF · Rate Limit · Turnstile    │
                        └──────┬───────────────┬────────────────┬───────────┬──────┘
                               │               │                │           │
        ┌──────────────────────┘               │                │           └────────────────────┐
        ▼                                      ▼                ▼                                ▼
[geraiexpress.com]                  [app.geraiexpress.com]   [hooks.geraiexpress.com]    [<slug>.geraimitra.com]
Platform Marketing Site             (& owner.geraiexpress)   Mengantar Webhook (HMAC)    (+ Pro Custom Domains)
Server-rendered HTML                React 19 Vite SPA        Cookie-less · Queue Ingest  Outlet Mini-Site + QR
        │                           + /api/v1 + /mcp            │                        + Public WebMCP (/mcp)
        └──────────────────────┬───────────────┴────────────────┴────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                           PRIMARY CLOUDFLARE WORKER (`apps/worker` — Hono TS)                        │
│  • Host Classifier Middleware (strict routing & cookie isolation per domain context)                 │
│  • Auth & Session Engine (Email OTP, WebCrypto password hash, `__Host-` cookies, Super Admin TOTP)   │
│  • Zod OpenAPI 3.1 routes (`/api/v1/*`, `/api/v1/docs`) + Stateless Streamable HTTP MCP (`/mcp`)     │
│  • Role DTO Projector (strips cost/discount/margin/balance fields at server boundary for Cashiers)   │
│  • Mengantar Public API Adapter (direct HTTPS to `api-public.mengantar.com` — URL key redacted)      │
└───────┬──────────────────────┬──────────────────────┬─────────────────────────┬──────────────────────┘
        │                      │                      │                         │
        ▼                      ▼                      ▼                         ▼
┌───────────────┐    ┌──────────────────┐   ┌──────────────────┐      ┌────────────────────────────────┐
│ Cloudflare D1 │    │ Durable Objects  │   │  Cloudflare R2   │      │ Cloudflare Queues + Cron       │
│ Control plane │    │ `GeraiVaultDO`   │   │  Media Storage   │      │ • Queues: webhooks, bulk,      │
│ • Users/Auth  │    │ (1 DO / Gerai)   │   │ • Outlet Logos   │      │   finance sync, hostnames      │
│ • Tenants     │    │ • SQLite: ALL    │   │ • Scale Photos   │      │ • 15-min Invoice & Unpaid Sync │
│ • Hostnames   │    │   tenant tables  │   │ • Return Photos  │      │ • Status polling: DO alarms    │
│ • Ship. index │    │ • Atomic Dispatch│   │ • Signed Manifest│      └────────────────────────────────┘
└───────────────┘    └─────────┬────────┘   └──────────────────┘
                               │ (ONLY for the 4 Mengantar Partner API routes in Production)
                               ▼
                     ┌─────────────────────────────────────────────────────────┐
                     │ `infra/partner-relay` (~100 LOC Stateless Node Relay)   │
                     │ • Inbound: HMAC-signed (`X-Relay-Signature`) + TLS      │
                     │ • Outbound: Reserved IPv4 149.28.129.53 (99ribu-prod)   │
                     └───────────────────────────┬─────────────────────────────┘
                                                 ▼
                                [Mengantar Partner & Public APIs]
```

---

## 2. Cloudflare Primitives & Exact Responsibilities

| Primitive | Responsibility in `geraiexpress-cfv2` | Architectural Payoff |
|---|---|---|
| **Cloudflare Workers + Hono + Zod** | Unified HTTP entry handling server-rendered pages, JSON APIs, OpenAPI 3.1 docs, and Streamable HTTP MCP tools. Hono serves `/api/app` and `/api/owner`; `/api/v1` is one hand-written Zod route table that drives validation, scopes and `/api/v1/openapi.json` (OpenAPI 3.1 through `z.toJSONSchema`) — `@hono/zod-openapi` is not a dependency. | Sub-millisecond cold starts in Indonesian/SG PoPs; one Zod route table powers validation, OpenAPI, and the outlet MCP tools. |
| **Workers Static Assets + Vite React 19** | Serves `app.geraiexpress.com` (POS + Owner Workspace) and `owner.geraiexpress.com` (Super Admin) as fast single-page apps (no web manifest or service worker). | Zero server CPU burned on tab switches; native browser access to Web-Bluetooth 58mm printers and camera barcode scanners. |
| **Cloudflare D1 (SQLite)** | **Control plane only** (ADR-0006): users, sessions, OTPs, Super Admins, tenants, members, hostnames, API keys, discount rules, courier catalog, platform audit, the thin cross-tenant `shipment_index`, pushed daily stats, the email outbox and the Super Admin-editable Mengantar Partner settings (`platform_partner_config`). Full table list: `docs/SYSTEM-MAP.md` §5. | Strict SQL migrations, composite `(tenant_id, ...)` indexing, and low fixed cost ($5 Workers plan baseline). |
| **Durable Objects (`GeraiVaultDO` & `PartnerQuotaDO`)** | `GeraiVaultDO` (1 per `tenant_id`, **SQLite storage holding all of that tenant's data**, ADR-0006) serializes: (1) Mengantar order creation & `pay-unpaid` calls, (2) collision-free `INV` slug confirmation & receipt voiding, (3) shift open/close, (4) Mengantar `/invoices` cursor sync & balance reconciliation, and (5) seller key rotation. `PartnerQuotaDO` enforces global Partner API rate limits (60/min, 1000 reg/day). | Provides strict per-outlet single-writer atomicity that replaces PostgreSQL `SELECT ... FOR UPDATE` without cross-tenant contention; hibernates at Rp0 when idle. |
| **Cloudflare R2** | Stores outlet logos and static QRIS images, evidence photos, return-intake photos, claim attachments, courier manifest signatures, and the daily per-gerai backups (`t/<tenant_id>/backup/`, kept 35 days). | Zero egress bandwidth fees when rendering logos on `*.geraimitra.com` or viewing evidence photos. |
| **Cloudflare Queues + Cron Triggers** | Four queues (`gx-mengantar-webhooks`, `gx-bulk`, `gx-mengantar-finance-sync`, `gx-hostnames`; suffixed `-staging` / `-production` remotely) decouple webhook ingestion (< 5s Mengantar timeout rule), Paket Massal, finance sync and custom-hostname creation. Cron `*/5`: email outbox, operator checks, discount verifier, the 15-min `/invoices` finance fan-out and the 10-min hostname poll; hourly: revoke rotated webhook routes; daily at 02:00 WIB: backups, hostname reaper, pending-invoice rescan. The `GET /order` status polling floor (hourly while `webhook_state != 'active'`, daily otherwise), stuck-dispatch flags, claim expiry and expired QR draft purges run on each `GeraiVaultDO`'s own alarm, not on Cron. | Guarantees Mengantar never pauses a seller's webhook due to downstream latency (20-failure pause rule). |
| **Cloudflare for SaaS + KV** | Wildcard `*.geraimitra.com` routing + custom hostnames for Pro domains (lifecycle in spec 11). KV caches public, non-tenant lookups only (Mengantar subdistrict searches and Nominatim geocoding results); **host → tenant is resolved from D1 `tenant_hostnames`**, never KV (eventually consistent). | Instant white-label mini-sites and automated custom-domain TLS (verify current Cloudflare plan quota at M6 provisioning). |

---

## 3. Multi-Host Isolation Contract

Every request except `GET /healthz` enters `classify()` (`apps/worker/src/host/classify.ts`) first:

1. **`geraiexpress.com` / `www.geraiexpress.com` (`MARKETING_APEX`)** — serves public brand marketing pages and interactive tariff/POS sandbox only. No auth cookies accepted.
2. **`app.geraiexpress.com` (`GERAI_WORKSPACE`)** — serves the Outlet Owner & Cashier SPA, `/api/app/*`, `/api/v1/*` (Bearer API key), and `/mcp`. Uses host-only `__Host-ge_app` cookie.
3. **`owner.geraiexpress.com` (`PLATFORM_OWNER`)** — serves Super Admin SPA, `/api/owner/*` and the `OPS_TOKEN`-guarded `/internal/ops/*` endpoints (tenant migration, admin bootstrap, demo seed, backups, alert drill). Uses isolated `__Host-ge_owner` cookie (12h max) + mandatory `aal2` TOTP verification.
4. **`hooks.geraiexpress.com` (`WEBHOOK_INGEST`)** — accepts `POST /webhooks/mengantar/:webhookToken` only; resolves the tenant from D1 `webhook_routes` by token hash (spec 01 §2.7), then the tenant's `GeraiVaultDO` verifies and durably stores the event in its `webhook_inbox` before acknowledging (spec 01 §2.7); `x-signature = HMAC_SHA256("{x-timestamp}.{rawBody}")` within ±5 minutes and enqueues to `gx-mengantar-webhooks`.
5. **`<slug>.geraimitra.com` or verified Custom Hostname (`TENANT_MINISITE`)** — resolves `tenant_id` from D1 `tenant_hostnames` (authoritative; unknown, `pending`, `failed`, `moved`, `purged` or a tenant that is not active → neutral 404, suspended → 403, schema recovery → 503, spec 11), serves Indonesian SSR mini-site, Turnstile-guarded publish quotes, QR pre-booking (`INV` draft creation), privacy-minimal tracking, and a restricted public `/mcp` (read tools plus `create_public_prebooking_inv` draft creation). Physically isolated from `geraiexpress.com` cookies.

---

## 4. Mengantar Integration & Security Rules

1. **URL-Path Key Redaction (Critical):** Mengantar Public API embeds the seller `apiKey` in the URL path (`/api/public/{API_KEY}/...`). The `mengantar-sdk` transport wrapper **must strip/mask `{API_KEY}`** before any error message, structured log, Sentry/telemetry breadcrumb, or exception stack is created.
2. **Batch Concurrency & `batch_id` Accuracy:**
   - Mengantar generates J&T Premium and SiCepat AWBs sequentially per seller account (concurrent calls return HTTP 409). Routing creation through `GeraiVaultDO` naturally serializes per-seller dispatch.
   - Both human `batch` code (for `GET /order?batch=`) and 24-hex `batch_id` (`_id`, required by `POST /order/pay-unpaid`) are stored explicitly on every shipment dispatch attempt.
3. **Stateless `infra/partner-relay`:** used **only** in Production for the 4 `/api/partner/v1/sellers/*` endpoints so traffic exits via our single allowlisted Reserved IPv4 (`149.28.129.53` on `99ribu-prod`, DEC-235). All daily counter quotes, orders, batch payments, tracking, and `/invoices` financial syncs run **directly from Cloudflare Workers**.

---

## 5. Monorepo Layout

```text
geraiexpress-cfv2/
├── apps/
│   ├── worker/                 # Hono Worker: host router, Zod route table + OpenAPI, MCP, server-rendered HTML, DO, Queues
│   ├── web-app/                # Vite + React 19 SPA (`app.geraiexpress.com` — Indonesian UI) + the shared admin kit
│   └── web-owner/              # Vite + React 19 SPA (`owner.geraiexpress.com` — Indonesian UI)
├── packages/
│   ├── db/                     # Drizzle sqlite schemas: control-plane (D1) + tenant (DO) migrations
│   ├── domain/                 # `INV` Crockford slug, integer IDR/bps/gram math, status combine, masking, bulk CSV, WIB period, claims, geo
│   ├── mengantar-sdk/          # Redacting Public API + Partner API (`direct`/`relay`) typed client
│   ├── telemetry/              # Structured events, redaction, Public API anomaly evaluators
│   └── thermal-print/          # Code128 + QR, 10×15 / 10×10 label PDF and SVG preview, 58mm ESC/POS roll (`Potong Disini`), A4 Surat Jalan
├── infra/
│   └── partner-relay/          # ~100 LOC stateless HMAC-verified static-IPv4 forwarder (Node) + Compose
├── scripts/                    # CI gates, tenant migration runner, probes, email deliverability, backup drill
├── e2e/                        # Playwright specs (390 / 768 / 1280)
├── design/                     # UI brief, reference teardowns, `admin-contract.json`
└── docs/                       # ADRs, research (01..03), specs (01..12), visual/flow specs (01..09), runbooks, SYSTEM-MAP
```
