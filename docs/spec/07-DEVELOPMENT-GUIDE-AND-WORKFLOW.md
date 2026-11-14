# 07 — Development Guide, Local Multi-Domain Workflow & Test Gates

This guide standardizes local setup, bindings, API envelopes, and automated verification for engineers and AI terminal agents starting at Milestone M1.

---

## 1. Toolchain & Runtime Prerequisites
- **Node.js:** `22 LTS` or `24` (managed via `mise`).
- **Package Manager:** `pnpm` workspace monorepo.
- **Edge Simulator:** `wrangler` v4+ (`workerd` local runtime simulating D1, Durable Objects, R2, KV, Queues, and Cron Triggers offline).
- **Database:** `drizzle-orm` + `drizzle-kit` generating forward-only SQL migrations in `packages/db/migrations/`.

---

## 2. Zero-Config Local Multi-Domain Routing (`*.localhost`)

Modern browsers resolve every `*.localhost` subdomain to `127.0.0.1` without `/etc/hosts` edits. `hostClassifierMiddleware` maps `.localhost:8787` 1:1 to production domains:

| Surface | Local Development URL | Production Equivalent |
|---|---|---|
| Brand Marketing Site | `http://geraiexpress.localhost:8787` | `https://geraiexpress.com` |
| Gerai Workspace (Owner & Kasir) | `http://app.geraiexpress.localhost:8787` | `https://app.geraiexpress.com` |
| Super Admin Console | `http://owner.geraiexpress.localhost:8787` | `https://owner.geraiexpress.com` |
| Mengantar Webhook Receiver | `http://hooks.geraiexpress.localhost:8787` | `https://hooks.geraiexpress.com` |
| Sample Outlet White-Label Site | `http://berkahjaya.gerai.localhost:8787` | `https://berkahjaya.gerai.cc` |

*(Cookie note: production over HTTPS uses `__Host-ge_app` / `__Host-ge_owner`; local HTTP `.localhost` uses host-only `dev_ge_app` / `dev_ge_owner` with identical `Path=/` and `HttpOnly` semantics.)*

### Standard Workspace Commands
- `pnpm db:generate` — generate SQL migration from Drizzle schema changes.
- `pnpm db:migrate:local` — apply migrations to local D1.
- `pnpm db:seed:local` — seed 1 local Super Admin + 1 synthetic review outlet `berkahjaya` (uses deterministic offline mock quotes; **never calls live Mengantar without explicit sandbox keys**).
- `pnpm dev` — run `wrangler dev` + Vite HMR for `web-app` and `web-owner`.
- `pnpm check` — run `typecheck` + `lint` + `test:unit` + `test:worker` + `security:bundle-audit`.
- Every Worker host answers `GET /healthz` → `200 {"ok":true}` without touching D1 or Mengantar (liveness only).

---

## 3. Cloudflare Bindings & Secrets (`wrangler.jsonc` & `.dev.vars`)

### 3.1 Declared Bindings & Dual-SPA Static Asset Routing
- `DB` (D1 Database) · `GERAI_VAULT` (`GeraiVaultDO`) · `PARTNER_QUOTA` (`PartnerQuotaDO`) · `BUCKET` (R2 Media) · `CACHE_KV` (KV Area/Hostname Cache) · `WEBHOOK_QUEUE` & `FINANCE_SYNC_QUEUE` (Cloudflare Queues) · `RATE_LIMITER` (Cloudflare Workers Rate Limiting binding, paired with Cloudflare WAF rate-limit rules on `*.gerai.cc/api/public/*` and `/mcp`).
- **Dual-SPA Static Assets (`ASSETS` binding):** `web-app` builds into `dist/assets/app/` and `web-owner` builds into `dist/assets/owner/` (`run_worker_first = true` on HTML navigation routes); `hostClassifierMiddleware` rewrites SPA shell fetches via `env.ASSETS.fetch` strictly by verified host (`app.` vs `owner.`).

### 3.2 Environment Secrets (Never Committed to Git)
- `AUTH_SESSION_PEPPER` — server pepper for session/OTP/API-key hashing.
- `KEK_SECRET` — 32-byte `AES-256-GCM` master key wrapping seller Mengantar credentials.
- `MENGANTAR_PARTNER_ID` (`ongkirich`) & `MENGANTAR_PARTNER_SECRET`.
- `PARTNER_TRANSPORT` — `"direct"` (local/sandbox) or `"relay"` (production).
- `PARTNER_RELAY_URL` & `PARTNER_RELAY_SECRET` — HMAC credentials for `infra/partner-relay` (`docs/spec/10`).
- `MENGANTAR_PUBLIC_ORIGIN` & `MENGANTAR_PARTNER_ORIGIN` — environment-specific provider origins (sandbox vs production); never inferred from each other.
- `TURNSTILE_SECRET_KEY` — Cloudflare Turnstile secret (test dummy key locally).
- `SMTP_URL` / `MAIL_API_KEY` — Bahasa Indonesia OTP mail transport (Mailpit locally; fail-closed in prod until SPF/DKIM verified).

---

## 4. Standard JSON API Envelope & Indonesian User Errors

All JSON endpoints return a predictable envelope; `error.message` is **always user-safe Bahasa Indonesia**:

```json
{ "ok": true, "data": { "slug": "8k4m2p7", "status": "draft" } }
```
```json
{
  "ok": false,
  "error": {
    "code": "INSUFFICIENT_MENGANTAR_BALANCE",
    "message": "Saldo pengiriman gerai belum mencukupi untuk menerbitkan AWB sekarang. Kiriman disimpan sebagai Menunggu Saldo (INV 8K4M2P7) — silakan beri tahu pemilik gerai.",
    "field_errors": {}
  }
}
```
*(Note: error copy is role-projected per `09-MENGANTAR-FINANCIAL-SYNC-AND-RECONCILIATION.md §3.1` so `cashier` responses never reveal balance or net-cost amounts).*

---

## 5. Four-Layer Verification Gate (Required per Feature)
1. **Pure Domain Unit Tests (`Vitest`):** `INV` slug uniqueness/alphabet, gram/volumetric rounding per courier, integer bps discount/COD/reserve math, financial `/invoices` matching, and 32-col ESC/POS layout snapshots.
2. **Worker + D1 + DO Integration Tests (`@cloudflare/vitest-pool-workers`):** tenant isolation, `GeraiVaultDO` double-submit prevention, cashier DTO field stripping, URL-path API key redaction, and idempotent `/invoices` + webhook ingestion.
3. **Three-Viewport Playwright E2E (`390px`, `768px`, `1280px`):** Indonesian UI flows from `<slug>.gerai.localhost` QR pre-booking → POS weigh & print → `Keuangan` invoice sync → `Meja Retur` 4-digit OTP handback.
4. **Bundle Security Audit:** zero `*.map` files and zero secret literals in `dist/`.
