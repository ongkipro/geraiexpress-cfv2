# System Map — GeraiExpress v2 (`geraiexpress-cfv2`)

One-screen navigation map of what exists **in code today**. Refreshed at every milestone close (TASK-x99) and at the
end of M6 code. Contracts live in `docs/spec/`, decisions in `DECISIONS.md`, state in `STATUS.md`.

Updated: 2026-11-16 (M1 in progress: TASK-101, 102, 103, 107, 108, 110)

## 1. Repository layout (real counts)

| Path | What | Files · lines (ts/tsx/mjs/sql) |
|---|---|---|
| `apps/worker/src` | the one Cloudflare Worker: host classifier, SPA serving, ops endpoint, `GeraiVaultDO`, telemetry checks | 17 · 950 |
| `apps/worker/test` | Workers Vitest (runs inside `workerd`): host, routing, storage, migrations, slug, telemetry | 11 · 788 |
| `apps/web-app/src` | Vite + React 19 SPA for `app.` (Gerai workspace); shared shadcn comfort primitives | 27 · 2,768 |
| `apps/web-owner/src` | Vite + React 19 SPA for `owner.` (Super Admin); imports primitives via `@shared` | 3 · 67 |
| `packages/domain` | pure integer money / weight / INV slug math | 7 · 864 |
| `packages/db` | Drizzle schemas + forward-only SQL: `migrations/control` (D1), `migrations/tenant` (every `GeraiVaultDO`) | 9 · 416 |
| `packages/telemetry` | structured events, redaction, Public API anomaly evaluators | 2 · 294 |
| `packages/mengantar-sdk`, `packages/thermal-print` | placeholders (TASK-201/202, TASK-306) | 1 · 1 each |
| `scripts/` | `ci/bundle-audit`, `do-migrate`, `probes` | 8 · 393 |

Tests: 129 test cases (unit + Workers). Migrations: control `0000_baseline`, `0001_alert_state`; tenant
`0001_baseline`, `0002_inv_slugs`.

## 2. Runtime hosts and audiences (one Worker, `wrangler.jsonc`)

| Host (prod · local) | Context | Audience | Served today |
|---|---|---|---|
| `geraiexpress.com` · `geraiexpress.localhost:8787` | `MARKETING_APEX` | public | `/healthz`; brand site at TASK-502 |
| `app.geraiexpress.com` · `app.geraiexpress.localhost` | `GERAI_WORKSPACE` | owner, Kasir | SPA shell (`dist/assets/app`) |
| `owner.geraiexpress.com` · `owner.geraiexpress.localhost` | `PLATFORM_OWNER` | Super Admin | SPA shell (`dist/assets/owner`), `POST /internal/ops/do-migrate` |
| `hooks.geraiexpress.com` · `hooks.geraiexpress.localhost` | `WEBHOOK_INGEST` | Mengantar | `/healthz`; webhooks at TASK-204 |
| `<slug>.gerai.cc` / custom domain · `<slug>.gerai.localhost` | `TENANT_MINISITE` | public | `GET /` placeholder; mini-site at TASK-501 |
| `relay.geraiexpress.com` | — | Worker → VPS | never served by the Worker (404) |

Request order (`apps/worker/src/index.ts` → `host/classify.ts`): `/healthz` (eligible hosts only) → normalise Host →
structural shape → DCV pass-through → platform match → D1 `tenant_hostnames` lookup (≤ 30 s isolate cache) →
404/403/503 → context router (cross-context API families → 404).

## 3. Control plane (D1 `DB`) vs tenant data (`GeraiVaultDO`)

| D1 control tables (today) | Tenant object tables (today) |
|---|---|
| `tenants`, `tenant_members`, `tenant_hostnames`, `tenant_schema_versions`, `audit_logs`, `shipment_index`, `alert_state` | `tenant_settings`, `tenant_business_profiles`, `tenant_outlets`, `audit_logs`, `outbox`, `inv_slugs` (+ `schema_version`, `vault_identity`) |

`GeraiVaultDO` (`apps/worker/src/do/gerai-vault/`): addressed only by `vaultFor(env, tenantId)` (`locationHint: apac`);
RPCs `migrate(tenantId, version)`, `schemaState()`, `allocateSlug()`, `slugExists()`, `flushOutbox()`, `alarm()`;
refusals returned as data (`TENANT_MISMATCH`, `TENANT_NOT_PROVISIONED`, `TENANT_NOT_READY`). DO → D1 pushes go through
the versioned absolute-upsert `outbox` (alarm retry). `PartnerQuotaDO`: placeholder (TASK-202).

## 4. Routes in code

| Host | Route | Handler |
|---|---|---|
| any eligible | `GET /healthz` | liveness, no storage |
| tenant candidates | `GET /.well-known/acme-challenge/*`, `/pki-validation/*` | DCV pass-through |
| tenant | `GET /.well-known/geraiexpress-probe/:nonce` | `HMAC(PROBE_SECRET, host:nonce)` |
| `owner.` | `POST /internal/ops/do-migrate` | batched tenant migrations (Bearer `OPS_TOKEN`) |
| `app.` / `owner.` | `GET /*` (not `/api`, `/webhooks`, `/internal`, `/mcp`) | SPA shell + hashed assets |

Cron: `*/5` operator checks + owner alerts (`telemetry/checks.ts`); `0 *` and `0 19` reserved for later tasks.
Queues: four producers/consumers declared (webhooks, finance sync, bulk, hostnames); consumer acks until wired.

## 5. Scripts

| Command | Does |
|---|---|
| `pnpm check` | typecheck → eslint → unit → build both SPAs → Workers tests → bundle audit |
| `pnpm dev` | build + `wrangler dev --local --persist-to .wrangler/state-dev` |
| `pnpm db:migrate:local` | apply D1 control migrations locally |
| `pnpm do:migrate --env <env> [--dry-run]` | migrate every tenant object (stops at first failure) |
| `pnpm probes --env <env> [--force-fail <probe>] [--alert-dry-run]` | `OBSERVABILITY.md` probes + owner alert |
| `pnpm security:bundle-audit` | fail on `*.map`, source-map comments, secret-shaped literals, client secret names |
| `pnpm cf-typegen` | regenerate `worker-configuration.d.ts` |
