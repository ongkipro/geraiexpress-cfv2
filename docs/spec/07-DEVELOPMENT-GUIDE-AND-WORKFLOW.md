# 07 — Development Guide, Local Multi-Domain Workflow & Test Gates

This guide standardizes local setup, bindings, API envelopes, and automated verification for engineers and AI terminal agents starting at Milestone M1. The process (task lifecycle, review, release, approvals) is in [`docs/WORKFLOW.md`](../WORKFLOW.md); this file is the technical half.

---

## 1. Toolchain & Runtime Prerequisites
- **Node.js:** `22 LTS` or `24` (managed via `mise`).
- **Package Manager:** `pnpm` workspace monorepo.
- **Edge Simulator:** `wrangler` v4+ (`workerd` local runtime simulating D1, Durable Objects, R2, KV, Queues, and Cron Triggers offline).
- **Database:** `drizzle-orm` (`sqlite-core`) with hand-written forward-only SQL in two tracks (ADR-0006; `drizzle-kit` is not installed):
  `packages/db/migrations/control/` → D1 `DB`; `packages/db/migrations/tenant/` → every `GeraiVaultDO` SQLite store,
  applied by the object's `migrate(version)` RPC.
- **Tests:** Vitest + Cloudflare Workers Vitest integration (installed version decides pool vs plugin setup; follow the
  Cloudflare guide for that version), Playwright for E2E.
- **Skills used while building** (dotfiles): `workers-best-practices`, `wrangler`, `durable-objects`,
  `cloudflare-for-saas`, `cloudflare-email-service`, `openapi-spec`, `testing-engineering`, `application-security`,
  `shadcn-ui`, `admin-dashboard`, `ui-validation`, `github-actions`, `mengantar-api`.

---

## 2. Zero-Config Local Multi-Domain Routing (`*.localhost`)

Modern browsers resolve every `*.localhost` subdomain to `127.0.0.1` without `/etc/hosts` edits. `classify()` (`apps/worker/src/host/classify.ts`) maps `.localhost:8787` 1:1 to production domains:

| Surface | Local Development URL | Production Equivalent |
|---|---|---|
| Brand Marketing Site | `http://geraiexpress.localhost:8787` | `https://geraiexpress.com` |
| Gerai Workspace (Owner & Kasir) | `http://app.geraiexpress.localhost:8787` | `https://app.geraiexpress.com` |
| Super Admin Console | `http://owner.geraiexpress.localhost:8787` | `https://owner.geraiexpress.com` |
| Mengantar Webhook Receiver | `http://hooks.geraiexpress.localhost:8787` | `https://hooks.geraiexpress.com` |
| Sample Outlet White-Label Site | `http://berkahjaya.geraimitra.localhost:8787` | `https://berkahjaya.geraimitra.com` |

*(Cookie note: production over HTTPS uses `__Host-ge_app` / `__Host-ge_owner`; local HTTP `.localhost` uses host-only `dev_ge_app` / `dev_ge_owner` with identical `Path=/` and `HttpOnly` semantics.)*

### Standard Workspace Commands
- New migrations are written by hand as the next numbered SQL file in `packages/db/migrations/control/` or `…/tenant/` (a tenant file is also appended to `TENANT_MIGRATIONS` in `packages/db/src/tenant.ts`). No `db:generate` script exists.
- `pnpm db:migrate:local` — apply control migrations to local D1. Tenant migrations: approval and seed flows call `migrate` for a new object; since DEC-254 a provisioned, healthy object that is behind applies the pending migrations itself on its first RPC, while an unprovisioned object, one in `recovery`, or one ahead of the deployed code refuses with `TENANT_NOT_READY`; `pnpm do:migrate --env <local|staging|production>` sweeps the rest and reconciles D1 `tenant_schema_versions`.
- Local synthetic data: `node scripts/dev/seed-preview.mjs [port]` (owner, application and Super Admin for rendering gates; deterministic offline mock quotes, **never calls live Mengantar without explicit sandbox keys**). The read-only demo tenant is provisioned with `POST /internal/ops/seed-demo` (owner host, `OPS_TOKEN`). No `db:seed:local` script exists.
- `pnpm dev` — build both SPAs once, then `wrangler dev --local` (no Vite HMR: re-run `pnpm build` after an SPA change). Email is simulated (spec 12 §5): messages are logged and written to local files.
- `pnpm check` — run `typecheck` + `lint` + `test:unit` + `build` + `test:worker` + `security:bundle-audit`.
- The full command list (`check:fast`, `gate`, `e2e`, `probes`, `test:migrations`, `test:isolation`, `clean:e2e-state`, …) is in `docs/SYSTEM-MAP.md` §9.
- Every Worker host answers `GET /healthz` → `200 {"ok":true}` without touching D1 or Mengantar (liveness only).

---

## 3. Cloudflare Bindings & Secrets (`wrangler.jsonc` & `.dev.vars`)

### 3.1 Declared Bindings & Dual-SPA Static Asset Routing
- `DB` (D1 control plane, ADR-0006) · `GERAI_VAULT` (`GeraiVaultDO`, **SQLite-backed** class migration `new_sqlite_classes`) · `PARTNER_QUOTA` (`PartnerQuotaDO`) · `BUCKET` (R2 Media, keys `t/<tenant_id>/…`) · `CACHE_KV` (KV cache for area search and geocode results only — never host → tenant) · `EMAIL` (`send_email`, `allowed_sender_addresses: ["noreply@geraiexpress.com"]`, spec 12) · `BULK_QUEUE` (Paket Massal checks and dispatch, spec 03 §1.3) · `WEBHOOK_QUEUE` & `FINANCE_SYNC_QUEUE` (Cloudflare Queues) · `HOSTNAME_QUEUE` (custom-hostname creation and DCV re-read, spec 11) · `RATE_LIMITER` (Cloudflare Workers Rate Limiting binding, paired with Cloudflare WAF rate-limit rules on `*.geraimitra.com/api/public/*` and `/mcp`).
- **Dual-SPA Static Assets (`ASSETS` binding):** `web-app` builds into `dist/assets/app/` and `web-owner` builds into `dist/assets/owner/` (`run_worker_first: true` for every request); `classify()` (`apps/worker/src/host/classify.ts`) rewrites SPA shell fetches via `env.ASSETS.fetch` strictly by verified host (`app.` vs `owner.`).

### 3.2 Environment Secrets (Never Committed to Git) and Vars

Secrets (`secrets.required` in `wrangler.jsonc`, the same ten names in every environment):
- `AUTH_SESSION_PEPPER` — server pepper for session/OTP/API-key hashing.
- `KEK_SECRET` — 32-byte `AES-256-GCM` master key wrapping seller Mengantar credentials and the Super Admin Partner settings.
- `PROBE_SECRET` — HMAC key of the custom-hostname activation probe (spec 11 §5).
- `TURNSTILE_SECRET_KEY` — Cloudflare Turnstile secret (test dummy key locally).
- `MENGANTAR_PARTNER_SECRET` — Partner API secret (a D1 override may replace it, spec 10 §5).
- `PARTNER_RELAY_URL` & `PARTNER_RELAY_SECRET` — HMAC credentials for `infra/partner-relay` (`docs/spec/10`).
- `CF_SAAS_API_TOKEN` — zone-scoped token for custom hostnames on `geraimitra.com` (spec 11 §2).
- `OPS_TOKEN` — Bearer token of the `/internal/ops/*` endpoints.
- `ALERT_WEBHOOK_URL` — owner alert channel (`OBSERVABILITY.md`).
- Optional, not in `secrets.required`: `MENGANTAR_PUBLIC_READ_KEY` — seller key used for area search; staging and production need it, otherwise area search answers `503 AREA_SEARCH_UNAVAILABLE`.

Plain vars (`vars` in `wrangler.jsonc`, not secret): `GX_ENV`, `PLATFORM_APEX`, `TENANT_ZONE`, `MENGANTAR_PUBLIC_ORIGIN` & `MENGANTAR_PARTNER_ORIGIN` (environment-specific provider origins, sandbox vs production; never inferred from each other), `PARTNER_TRANSPORT` (`"direct"` locally and on staging, `"relay"` in production), `MENGANTAR_PARTNER_ID`, `MAIL_FROM`, `TURNSTILE_SITE_KEY`, `CF_SAAS_ZONE_ID`.
- *(No email secret: the `EMAIL` binding needs no API key, spec 12.)*

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

## 5. Verification Layers (required per feature)

| Layer | Tool | Proves | Examples |
|---|---|---|---|
| 1. Pure domain unit | Vitest | integer money/weight math, slug alphabet, quote-pass fixed point, ESC/POS 32-col layout | spec 02 §3.4 rows, `9599` regression, `COD_FEE_UNSTABLE` |
| 2. Worker + DO + D1 integration | Workers Vitest integration | RPC behaviour, SQLite state, alarms, outbox, tenant migrations, DTO projection | double `mark_paid` → one receipt; DO restart keeps journal; `shipment_index` outbox retries |
| 3. Isolation (R4, merge-blocking) | Workers Vitest integration | host routing, cookies, API keys, webhooks across tenants | spec 11 §8 matrix |
| 4. E2E | Playwright at 390 / 768 / 1280 | Indonesian flows end to end on `.localhost` hosts | QR pre-booking → POS → print PDF → `Keuangan` sync (mock) → `Meja Retur` |
| 5. UI geometry | `dotuiux check --surface admin`, device-local `admin-geometry.mjs` | desk-scale size contract (`design/admin-contract.json`, DEC-239), text floor, zoom never locked | every new or changed screen |
| 6. Bundle audit | script | zero `*.map`, zero secret literals in `dist/` | — |

Provider contracts are tested against recorded sandbox fixtures (spec 09, `mengantar-api` skill); live sandbox runs
are manual, labelled, and never part of CI.

## 6. CI and Deploy Pipeline (GitHub Actions, M1)

- `ci.yml` on push to `main` and every PR: `pnpm install --frozen-lockfile` → `pnpm check` → Playwright (Chromium, 390/768/1280) →
  upload evidence; actions pinned by SHA, `permissions: contents: read`, no secrets on PR from forks.
- `deploy-staging.yml` (DEC-253): owner-dispatched only (`workflow_dispatch` with a full `sha`; the dispatch is the
  owner's approval, not GitHub Required reviewers). A secret-less `verify` job checks ref `refs/heads/main`, owner as
  actor and re-run actor, the SHA on main and a green `ci.yml` push run on main for it; then the `deploy` job (GitHub
  environment `staging-deploy`, `main` only, current-attempt gate) deploys that exact SHA with
  `wrangler deploy --env staging` with a scoped `CLOUDFLARE_API_TOKEN` (environment secret) and a `/healthz` smoke on
  every host. Production deploy is a separate manual workflow requiring the owner's
  approval in the GitHub environment (AGENTS approval gate), never automatic.
- Tenant DO migrations on deploy: `pnpm do:migrate --env <env>` walks tenants in batches, records progress in D1
  `tenant_schema_versions`, and stops on the first failure (that tenant enters `recovery`).

## 7. Environments

| Env | Hosts | Data | Mengantar | Email |
|---|---|---|---|---|
| local | `*.localhost:8787` | local D1 + local DO storage | mock / recorded fixtures | simulated |
| staging | `staging.geraiexpress.com`, `app-staging.`, `owner-staging.`, `hooks-staging.geraiexpress.com`; mini-sites `<slug>-stg.geraimitra.com` (first-level labels so Universal SSL covers them; routed to the staging Worker by `*-stg.geraimitra.com/*`, spec 11 §2) | separate D1 + DO namespace | sandbox keys | real, test inboxes only |
| production | spec 06 | production | production (Partner via relay) | real |
