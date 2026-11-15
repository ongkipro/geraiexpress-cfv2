# ARCHITECTURE.md — System Architecture (`geraiexpress-cfv2`)

This document defines the production topology for **GeraiExpress v2** on **Cloudflare Serverless** (the only non-Cloudflare runtime is the stateless Partner-API egress relay on a VPS, DEC-219), its dual-domain isolation (`geraiexpress.com` + `*.gerai.cc`), per-outlet serialization with **Durable Objects**, precision financial synchronization with **Mengantar**, and **OpenAPI 3.1 + MCP** exposure.

---

## 1. High-Level Topology

```text
                        ┌──────────────────────────────────────────────────────────┐
                        │                  CLOUDFLARE GLOBAL EDGE                  │
                        │     DNS · SSL for SaaS · WAF · Rate Limit · Cache API    │
                        └──────┬───────────────┬────────────────┬───────────┬──────┘
                               │               │                │           │
        ┌──────────────────────┘               │                │           └────────────────────┐
        ▼                                      ▼                ▼                                ▼
[geraiexpress.com]                  [app.geraiexpress.com]   [hooks.geraiexpress.com]    [<slug>.gerai.cc]
Platform Marketing Site             (& owner.geraiexpress)   Mengantar Webhook (HMAC)    (+ Pro Custom Domains)
Hono JSX SSR (Edge Cached)          React 19 Vite PWA        Cookie-less · Queue Ingest  Outlet Mini-Site + QR
        │                           + /api/v1 + /mcp            │                        + Public WebMCP (/mcp)
        └──────────────────────┬───────────────┴────────────────┴────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                           PRIMARY CLOUDFLARE WORKER (`apps/worker` — Hono TS)                        │
│  • Host Classifier Middleware (strict routing & cookie isolation per domain context)                 │
│  • Auth & Session Engine (Email OTP, WebCrypto password hash, `__Host-` cookies, Super Admin TOTP)   │
│  • Zod-OpenAPI 3.1 Router (`/api/v1/*`, `/api/v1/docs`) + Stateless Streamable HTTP MCP (`/mcp`)     │
│  • Role DTO Projector (strips cost/discount/margin/balance fields at server boundary for Cashiers)   │
│  • Mengantar Public API Adapter (direct HTTPS to `api-public.mengantar.com` — URL key redacted)      │
└───────┬──────────────────────┬──────────────────────┬─────────────────────────┬──────────────────────┘
        │                      │                      │                         │
        ▼                      ▼                      ▼                         ▼
┌───────────────┐    ┌──────────────────┐   ┌──────────────────┐      ┌────────────────────────────────┐
│ Cloudflare D1 │    │ Durable Objects  │   │  Cloudflare R2   │      │ Cloudflare Queues + Cron       │
│ Control plane │    │ `GeraiVaultDO`   │   │  Media Storage   │      │ • `mengantar-webhooks` Queue   │
│ • Users/Auth  │    │ (1 DO / Gerai)   │   │ • Outlet Logos   │      │ • `mengantar-finance-sync` Q   │
│ • Tenants     │    │ • SQLite: ALL    │   │ • Scale Photos   │      │ • 15-min Invoice & Unpaid Sync │
│ • Hostnames   │    │   tenant tables  │   │ • Return Photos  │      │ • Hourly Order Status Sweep    │
│ • Ship. index │    │ • Atomic Dispatch│   │ • Signed Manifest│      └────────────────────────────────┘
└───────────────┘    └─────────┬────────┘   └──────────────────┘
                               │ (ONLY for the 4 Mengantar Partner API routes in Production)
                               ▼
                     ┌─────────────────────────────────────────────────────────┐
                     │ `infra/partner-relay` (≤ 80 LOC Stateless Node/Go Relay)│
                     │ • Inbound: HMAC-signed (`X-Relay-Signature`) + TLS      │
                     │ • Outbound: 1 Static Public IPv4 allowlisted at Partner │
                     └───────────────────────────┬─────────────────────────────┘
                                                 ▼
                                [Mengantar Partner & Public APIs]
```

---

## 2. Cloudflare Primitives & Exact Responsibilities

| Primitive | Responsibility in `geraiexpress-cfv2` | Architectural Payoff |
|---|---|---|
| **Cloudflare Workers + `@hono/zod-openapi`** | Unified HTTP entry handling SSR pages, JSON APIs, OpenAPI 3.1 docs, and Streamable HTTP MCP tools. | Sub-millisecond cold starts in Indonesian/SG PoPs; single Zod schema powers validation, OpenAPI, and MCP. |
| **Workers Static Assets + Vite React 19** | Serves `app.geraiexpress.com` (POS + Owner Workspace) and `owner.geraiexpress.com` (Super Admin) as fast PWAs. | Zero server CPU burned on tab switches; native browser access to Web-Bluetooth 58mm printers and camera barcode scanners. |
| **Cloudflare D1 (SQLite)** | **Control plane only** (ADR-0006): users, sessions, OTPs, Super Admins, tenants, members, hostnames, API keys, discount rules, courier catalog, platform audit, the thin cross-tenant `shipment_index`, pushed daily stats and the email outbox. | Strict SQL migrations, composite `(tenant_id, ...)` indexing, and low fixed cost ($5 Workers plan baseline). |
| **Durable Objects (`GeraiVaultDO` & `PartnerQuotaDO`)** | `GeraiVaultDO` (1 per `tenant_id`, **SQLite storage holding all of that tenant's data**, ADR-0006) serializes: (1) Mengantar order creation & `pay-unpaid` calls, (2) collision-free `INV` slug confirmation & receipt voiding, (3) shift open/close, (4) Mengantar `/invoices` cursor sync & balance reconciliation, and (5) seller key rotation. `PartnerQuotaDO` enforces global Partner API rate limits (60/min, 1000 reg/day). | Provides strict per-outlet single-writer atomicity that replaces PostgreSQL `SELECT ... FOR UPDATE` without cross-tenant contention; hibernates at Rp0 when idle. |
| **Cloudflare R2** | Stores outlet logos, scale/dimension evidence photos, return-intake photos, claim attachments, and courier manifest signatures. | Zero egress bandwidth fees when rendering logos on `*.gerai.cc` or viewing evidence photos. |
| **Cloudflare Queues + Cron Triggers** | Decouples webhook ingestion (< 5s Mengantar timeout rule) and runs scheduled 15-min `/invoices` financial reconciliation, hourly `GET /order` status polling floor (authoritative whenever `webhook_state != 'active'`), stuck-dispatch sweeps, and daily expired QR draft purges. | Guarantees Mengantar never pauses a seller's webhook due to downstream latency (20-failure pause rule). |
| **Cloudflare for SaaS + KV** | Wildcard `*.gerai.cc` routing + custom hostnames for Pro domains (lifecycle in spec 11). KV caches Mengantar subdistrict searches only; **host → tenant is resolved from D1 `tenant_hostnames`**, never KV (eventually consistent). | Instant white-label mini-sites and automated custom-domain TLS (verify current Cloudflare plan quota at M6 provisioning). |

---

## 3. Multi-Host Isolation Contract

Every request enters `hostClassifierMiddleware` first:

1. **`geraiexpress.com` / `www.geraiexpress.com` (`MARKETING_APEX`)** — serves public brand marketing pages and interactive tariff/POS sandbox only. No auth cookies accepted.
2. **`app.geraiexpress.com` (`GERAI_WORKSPACE`)** — serves Outlet Owner & Cashier PWA, `/api/app/*`, `/api/v1/*` (Bearer API key), and `/mcp`. Uses host-only `__Host-ge_app` cookie.
3. **`owner.geraiexpress.com` (`PLATFORM_OWNER`)** — serves Super Admin SPA and `/api/owner/*`. Uses isolated `__Host-ge_owner` cookie (12h max) + mandatory `aal2` TOTP verification.
4. **`hooks.geraiexpress.com` (`WEBHOOK_INGEST`)** — accepts `POST /webhooks/mengantar/:webhookToken` only. Verifies `x-signature = HMAC_SHA256("{x-timestamp}.{rawBody}")` within ±5 minutes and enqueues to `mengantar-webhooks`.
5. **`<slug>.gerai.cc` or verified Custom Hostname (`TENANT_MINISITE`)** — resolves `tenant_id` from D1 `tenant_hostnames` (authoritative; unknown/pending → neutral 404, suspended → 403, spec 11), serves Indonesian SSR mini-site, Turnstile-guarded publish quotes, QR pre-booking (`INV` draft creation), privacy-minimal tracking, and a restricted public `/mcp` (read tools plus `create_public_prebooking_inv` draft creation). Physically isolated from `geraiexpress.com` cookies.

---

## 4. Mengantar Integration & Security Rules

1. **URL-Path Key Redaction (Critical):** Mengantar Public API embeds the seller `apiKey` in the URL path (`/api/public/{API_KEY}/...`). The `mengantar-sdk` transport wrapper **must strip/mask `{API_KEY}`** before any error message, structured log, Sentry/telemetry breadcrumb, or exception stack is created.
2. **Batch Concurrency & `batch_id` Accuracy:**
   - Mengantar generates J&T Premium and SiCepat AWBs sequentially per seller account (concurrent calls return HTTP 409). Routing creation through `GeraiVaultDO` naturally serializes per-seller dispatch.
   - Both human `batch` code (for `GET /order?batch=`) and 24-hex `batch_id` (`_id`, required by `POST /order/pay-unpaid`) are stored explicitly on every shipment dispatch attempt.
3. **Stateless `infra/partner-relay`:** used **only** in Production for the 4 `/api/partner/v1/sellers/*` endpoints so traffic exits via our single allowlisted public IPv4. All daily counter quotes, orders, batch payments, tracking, and `/invoices` financial syncs run **directly from Cloudflare Workers**.

---

## 5. Planned Monorepo Layout (Milestone M1+)

```text
geraiexpress-cfv2/
├── apps/
│   ├── worker/                 # Hono Worker: host router, Zod-OpenAPI, MCP, SSR JSX, DO, Queues
│   ├── web-app/                # Vite + React 19 PWA (`app.geraiexpress.com` — Indonesian UI)
│   └── web-owner/              # Vite + React 19 SPA (`owner.geraiexpress.com` — Indonesian UI)
├── packages/
│   ├── db/                     # Drizzle sqlite schemas: control-plane (D1) + tenant (DO) migrations
│   ├── domain/                 # `INV` Crockford slug, integer IDR/bps/gram math, masking, ledger rules
│   ├── mengantar-sdk/          # Redacting Public API + Partner API (`direct`/`relay`) typed client
│   └── thermal-print/          # 58mm/80mm ESC/POS encoder (`Potong Disini`) + 32-col HTML previewer
├── infra/
│   └── partner-relay/          # ≤ 80 LOC stateless HMAC-verified static-IPv4 forwarder + Compose
└── docs/                       # ADRs, research (01..03), technical specs (01..12), visual/flow specs (01..08)
```
