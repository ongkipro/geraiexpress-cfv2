# System Map — GeraiExpress v2 (`geraiexpress-cfv2`)

One-screen navigation map of what exists **in code today**. Refreshed at every milestone close (TASK-x99) and at the
end of M6 code. Contracts live in `docs/spec/`, decisions in `DECISIONS.md`, state in `STATUS.md`.

Updated: 2026-11-16 — **M1 closed** (TASK-101..112, TASK-199; live steps listed in `STATUS.md`)

## 1. Repository layout (real counts, ts/tsx/mjs/sql/sh)

| Path | What | Files · lines |
|---|---|---|
| `apps/worker/src` | the one Cloudflare Worker: host classifier, SPA serving, `/api/app`, `/api/owner`, auth, email outbox, ops endpoints, telemetry checks, `GeraiVaultDO` | 36 · 2,537 |
| `apps/worker/test` | Workers Vitest in `workerd`: host, routing, auth, Super Admin, email, migrations, slug, telemetry, isolation, CI route scan | 16 · 1,488 |
| `apps/web-app/src` | Vite + React 19 SPA for `app.` (auth screens; workspace shell from TASK-301) + shared shadcn comfort primitives | 36 · 3,260 |
| `apps/web-owner/src` | Vite + React 19 SPA for `owner.` (login, TOTP; console from TASK-203); primitives via `@shared` | 6 · 250 |
| `packages/domain` | pure integer money / weight / INV slug math | 7 · 864 |
| `packages/db` | Drizzle schemas + forward-only SQL: `migrations/control` (D1), `migrations/tenant` (every `GeraiVaultDO`) | 12 · 734 |
| `packages/telemetry` | structured events, redaction, Public API anomaly evaluators | 2 · 294 |
| `packages/mengantar-sdk`, `packages/thermal-print` | placeholders (TASK-201/202, TASK-306) | — |
| `scripts/` | `ci/` (bundle audit, route scan, red fixtures, integrated gate), `do-migrate`, `probes`, `email` deliverability | 14 · 602 |
| `e2e/` | Playwright (390/768/1280): accounts, Super Admin TOTP | 3 · 151 |
| `.github/workflows` | `ci.yml`, `deploy-staging.yml` (protected env), `deploy-production.yml` (manual) | 3 |

Tests: 197 cases. Migrations — control: `0000_baseline`, `0001_alert_state`, `0002_email_outbox`, `0003_auth`,
`0004_super_admin`; tenant: `0001_baseline`, `0002_inv_slugs`.

## 2. Runtime hosts and audiences (one Worker, `wrangler.jsonc`: local, `env.staging`, `env.production`)

| Host (prod · local) | Context | Audience | Served today |
|---|---|---|---|
| `geraiexpress.com` · `geraiexpress.localhost:8787` | `MARKETING_APEX` | public | `/healthz`; brand site at TASK-502 |
| `app.geraiexpress.com` · `app.geraiexpress.localhost` | `GERAI_WORKSPACE` | owner, Kasir | SPA + `/api/app/*` |
| `owner.geraiexpress.com` · `owner.geraiexpress.localhost` | `PLATFORM_OWNER` | Super Admin | SPA + `/api/owner/*` + `/internal/ops/*` |
| `hooks.geraiexpress.com` · `hooks.geraiexpress.localhost` | `WEBHOOK_INGEST` | Mengantar | `/healthz`; webhooks at TASK-204 |
| `<slug>.gerai.cc` / custom · `<slug>.gerai.localhost` | `TENANT_MINISITE` | public | `GET /` placeholder; mini-site at TASK-501 |
| `relay.geraiexpress.com` | — | Worker → VPS | never served by the Worker (404, also `/healthz`) |

Request order (`apps/worker/src/index.ts`): `/healthz` on eligible hosts → `host/classify.ts` (normalise, shape, DCV,
platform match, D1 `tenant_hostnames` ≤ 30 s cache, 404/403/503) → context router (foreign API families → 404).

## 3. Control plane (D1 `DB`) vs tenant data (`GeraiVaultDO`)

| D1 control tables | Tenant object tables |
|---|---|
| `tenants`, `tenant_members`, `tenant_hostnames`, `tenant_schema_versions`, `audit_logs`, `shipment_index`, `alert_state`, `email_outbox`, `email_suppressions`, `platform_legal_profile`, `users`, `sessions`, `email_otps`, `password_resets`, `invitations`, `auth_throttle`, `known_devices`, `super_admins` | `tenant_settings`, `tenant_business_profiles`, `tenant_outlets`, `audit_logs`, `outbox`, `inv_slugs` (+ `schema_version`, `vault_identity`) |

`GeraiVaultDO` (`apps/worker/src/do/gerai-vault/`): only via `vaultFor(env, tenantId)` (`locationHint: apac`); RPCs
`migrate`, `schemaState`, `allocateSlug`, `slugExists`, `flushOutbox`, `alarm`; refusals as data. DO → D1 via the
versioned absolute-upsert `outbox`. `PartnerQuotaDO`: placeholder (TASK-202).

## 4. Routes in code

| Host | Routes | Auth (registry) |
|---|---|---|
| any eligible | `GET /healthz` | none, no storage |
| tenant candidates | DCV `/.well-known/{acme-challenge,pki-validation}/*`; `GET /.well-known/geraiexpress-probe/:nonce` | none (HMAC probe) |
| `app.` | `POST /api/app/auth/{signup/request,signup/verify,signup/complete,login,password/forgot,password/reset}`, `GET /auth/invitations/:token`, `POST /auth/invitations/:token/accept` | public allowlist |
| `app.` | `POST /auth/logout`, `GET /auth/me` · `POST /members/invitations` · local-only `POST /dev/seed-tenant` | `app_session` · `app_owner` |
| `owner.` | `POST /api/owner/auth/login` · `/auth/totp/{enrol,verify}`, `/auth/logout` · `GET /auth/me` · `GET /audit`, `POST /admins`, `POST /admins/:id/totp-reset` | public · `owner_aal1` · `owner_aal2` · `owner_recent` |
| `owner.` | `POST /internal/ops/do-migrate`, `POST /internal/ops/bootstrap-admin`, local-only `GET /internal/dev/last-mail` | Bearer `OPS_TOKEN` |
| `app.` / `owner.` | `GET /*` (not `/api`, `/webhooks`, `/internal`, `/mcp`) | SPA shell + hashed assets |

SPA routes — app: `/`, `/masuk`, `/daftar-akun`, `/lupa-sandi`, `/atur-sandi/:token`, `/undangan/:token`;
owner: `/`, `/masuk`, `/totp`. Cron `*/5`: email dispatch + operator checks/alerts. Queues: declared, consumers ack.

## 5. Scripts

| Command | Does |
|---|---|
| `pnpm check` | typecheck → eslint → unit → build both SPAs → Workers tests → bundle audit |
| `pnpm gate <TASK-x99>` | milestone integrated run, fail-fast, every gate recorded in `delivery-ledger` |
| `pnpm e2e` | Playwright 390/768/1280 on a fresh local state |
| `pnpm dev` / `pnpm db:migrate:local` | local Worker + SPAs / apply D1 control migrations (`.wrangler/state-dev`) |
| `pnpm do:migrate --env <env> [--dry-run]` | migrate every tenant object, stop at first failure |
| `pnpm probes --env <env> [--force-fail <probe>] [--alert-dry-run]` | `OBSERVABILITY.md` probes + owner alert |
| `pnpm ci:red-fixtures` | prove broken test / `.map` / secret literal / unprotected route each fail their gate |
| `pnpm email:deliverability` | read-only SPF/DKIM/DMARC + received-header checks (TASK-112) |
| `pnpm security:bundle-audit` | `*.map`, source-map comments, secret-shaped literals, client secret names |
