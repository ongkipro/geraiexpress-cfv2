# System Map — GeraiExpress v2 (`geraiexpress-cfv2`)

Navigation map of what exists **in code today**: where each concern lives, which host serves what, what is stored
where, and which command proves it. It states facts read from the tree; it owns no contract, decision or status.

| Need | Owner |
|---|---|
| Rules and invariants | [`AGENTS.md`](../AGENTS.md) |
| Current state, evidence, blockers | [`STATUS.md`](../STATUS.md) |
| Work queue | [`TASKS.md`](../TASKS.md) |
| Decisions | [`DECISIONS.md`](../DECISIONS.md), [`docs/adr/`](adr/) |
| Contracts | [`ARCHITECTURE.md`](../ARCHITECTURE.md), [`docs/spec/`](spec/), [`docs/visual/`](visual/) |
| Diagrams (context, ERD, sequences, state machines) | [`docs/DIAGRAMS.md`](DIAGRAMS.md) |
| Change history per release | [`BUILD-LOG.md`](../BUILD-LOG.md) |
| How to change, verify, review, release | [`docs/WORKFLOW.md`](WORKFLOW.md) |

**Verified against** `e43804d` (2026-11-25). Every count, table, route and command below was read from that commit.
When the map and the code disagree, the code wins: fix the map in the same change. Refresh it at every milestone close
and whenever a host, binding, migration, route family or script is added or removed. §10 lists the commands that
regenerate the numbers.

## 1. Where to look

| Task | Start here |
|---|---|
| Which host serves a request | `apps/worker/src/index.ts` → `host/classify.ts`, `host/lookup.ts` |
| Add or change a workspace API route | `apps/worker/src/api/app.ts` (`r(method, path, auth, projection, handler)`), `api/registry.ts`, `dto/projection.ts` |
| Add or change a Super Admin API route | `apps/worker/src/api/owner.ts`, `admin/{overview,gerai,monitor,audit,mengantar,legal}/`, `pricing/rules/routes.ts` |
| Sign-in, sessions, cookies, CSRF, TOTP, recovery codes | `apps/worker/src/auth/` (`flows.ts`, `session.ts`, `cookies.ts`, `csrf.ts`, `throttle.ts`, `turnstile.ts`, `account/`, `totp/`, `recovery/`) |
| Tenant data and every balance-affecting step | `apps/worker/src/do/gerai-vault/index.ts` (RPC surface) and its feature folders; address it only through `do/gerai-vault/stub.ts` |
| Mengantar calls (Public API, Partner API, relay, mock) | `packages/mengantar-sdk/`, `apps/worker/src/mengantar/{factory,mock}.ts`, `do/partner-quota/` |
| Webhook ingest and status combination | `apps/worker/src/webhooks/{ingest,verify,settings}.ts`, `do/gerai-vault/status/`, `packages/domain/src/status/` |
| Quotes, discount rules, cashback | `apps/worker/src/pricing/quote/{engine,service,messages}.ts`, `pricing/rules/`, `packages/domain/src/{money,cashback,weight}/` |
| Labels, receipts, printing | `packages/thermal-print/`, `apps/worker/src/labels/build.ts`, `apps/web-app/src/print/` |
| Finance sync and reconciliation | `apps/worker/src/cron/finance/`, `do/gerai-vault/finance/` |
| Mini-site and brand site (public SSR) | `apps/worker/src/minisite/{index,html}.ts`, `do/gerai-vault/minisite/`, `apps/worker/src/brand/` |
| Custom domains (Cloudflare for SaaS) | `apps/worker/src/hostnames/{service,cloudflare}.ts` |
| Partner API and MCP | `apps/worker/src/api-v1/{index,keys}.ts`, `mcp/{protocol,outlet,public}.ts` |
| Transactional email | `apps/worker/src/email/{templates,outbox,mailer}.ts` |
| Operator checks, alerts, probes | `apps/worker/src/telemetry/{checks,alerts}.ts`, `packages/telemetry/`, `scripts/probes/` |
| Backups and restore | `apps/worker/src/cron/backup/`, `do/gerai-vault/backup/`, `ops/backup.ts` |
| Outlet map pin and geocoding | `apps/web-app/src/components/location-pin-picker.tsx`, `apps/worker/src/lib/geocode.ts`, `packages/domain/src/geo.ts` |
| Read-only demo account | `apps/worker/src/demo/{constants,seed-vault}.ts`, `ops/seed-demo.ts` |
| Schema change | `packages/db/migrations/{control,tenant}/`, `packages/db/src/tenant.ts` (`TENANT_MIGRATIONS`) |
| Workspace screens, sidebar, shared admin kit | `apps/web-app/src/router.tsx`, `shell/app-shell.tsx`, `components/admin/`, `lib/api.ts` |
| Super Admin screens | `apps/web-owner/src/router.tsx`, `shell/console-shell.tsx` (reuses the admin kit from `apps/web-app`) |

## 2. Repository layout

Tracked `ts`, `tsx`, `mjs`, `mts`, `sql`, `sh` files.

| Path | What | Files · lines |
|---|---|---|
| `apps/worker/src` | the one Cloudflare Worker: host classifier, SPA serving, `/api/app`, `/api/owner`, `/api/v1` Partner API + API keys, MCP (outlet + public), `hooks.` ingest, auth + `Akun Saya`, email outbox, onboarding, couriers + area search, pricing (rules + quote engine), labels, bulk queue, finance cron fan-out, analytics, operational status, mini-site + brand SSR, custom domains, Super Admin console APIs (incl. Mengantar Partner config), demo seeder, ops (migrate, bootstrap, backup export/restore, alert drill), operator checks, geocoding (`lib/geocode.ts`), `GeraiVaultDO`, `PartnerQuotaDO` | 108 · 21,439 |
| `apps/worker/test` | Workers Vitest in `workerd`, one folder per concern (auth, account, admin, host, isolation, migrations, storage, slug, onboarding, partner, webhooks, status, key-rotation, couriers, pricing, contacts, dispatch, masking, labels, shift, bulk, listing, finance, pickup, returns, exceptions, minisite, brand, api-v1, mcp, mengantar-v2, hostnames, backup, telemetry, notifications, email, settings, analytics, customer-display, demo, dto, lib, ci route scan) | 72 · 9,801 |
| `apps/web-app/src` | Vite + React 19 SPA for `app.`: shell, Dashboard + `PeriodFilter`, `/kasir` (Kiriman Satuan, Paket Massal, Cek Ongkir, Cek Resi, Shift Loket, Layar Pelanggan), `/kiriman` hub (list, pickup + Surat Jalan, Meja Retur, Kendala & Klaim, Riwayat Massal, Cetak Resi Massal, detail), Kontak (+ per-contact shipment history), Keuangan (dual book), Pengaturan (10 pages), Status Operasional, Akun Saya, Bantuan, print client, admin kit (`components/admin/`, incl. `PageNav` pagination), stale-chunk recovery (`lib/chunk-recovery.ts`, shared with the owner SPA) | 117 · 22,332 |
| `apps/web-owner/src` | Vite + React 19 SPA for `owner.`: login, TOTP, console shell, Ringkasan, Gerai, Tarif & Kurir, Pengawasan, Sistem & Audit, Akun | 23 · 3,406 |
| `packages/domain` | pure functions: integer money, weight, INV slug, status combine, cashback, contacts, masking, bulk CSV, WIB period, courier claim windows, geo (`geo.ts`: coordinate parsing, Indonesia bounds, pin validation) | 23 · 1,984 |
| `packages/db` | forward-only SQL: `migrations/control` (D1), `migrations/tenant` (every `GeraiVaultDO`); Drizzle schemas in `src/schema/` cover only part of the tables, so the SQL is the reference | 51 · 2,737 |
| `packages/mengantar-sdk` | Public API client v2.0.0 (redacting transport, Zod passthrough, order/address/time slots, receiver score, dropshippers, sandbox simulation, Pos COD refusal parser) + Partner client (direct or relay, `maybe_sent`) | 8 · 1,056 |
| `packages/telemetry` | structured events, redaction, Public API anomaly evaluators | 2 · 294 |
| `packages/thermal-print` | Code128, QR (PDF and SVG), label pages as PDF and SVG preview (`label_10x15_with_stub`, `label_10x10`, `label_10x15`), vector courier marks, 58 mm ESC/POS roll, A4 Surat Jalan | 14 · 1,693 |
| `infra/partner-relay` | stateless static-egress relay (Node: `relay.mjs` + `server.mjs`), digest-pinned `Dockerfile`, `compose.yaml`, `verify.mjs` (spec 10 §6) | 6 · 347 |
| `scripts/` | `ci/` (bundle audit, route scan library, non-impersonation scan, red fixtures, integrated gate, staging `deploy-dispatch-gate`), `do-migrate/`, `probes/`, `email/` deliverability, `dev/` (`seed-preview`, `clean-e2e-state`), `deploy/deploy.mjs`, `backup/d1-local-dump` | 23 · 1,437 |
| `e2e/` | Playwright, 27 specs + `fixtures.ts` + `helpers.ts`, three projects (`phone-390`, `tablet-768`, `desktop-1280`) | 29 · 4,039 |
| `.github/workflows` | `ci.yml` (push to `main` and every PR: `pnpm check` + `pnpm e2e`), `deploy-staging.yml` (owner-dispatched, secret-less `verify` gate, environment `staging-deploy`, DEC-253), `deploy-production.yml` (manual, environment `production`) | 3 |

Tests enumerated without running them: **304** unit cases in 31 files, **491** Workers cases in 67 files, **222**
Playwright tests (74 per viewport) in 27 files.

Migrations — control (D1): `0000_baseline` … `0020_partner_api_and_notifications` (21 files). Tenant: `0001_baseline` …
`0025_contact_history_and_events`; `TENANT_SCHEMA_VERSION` = 25 (the length of `TENANT_MIGRATIONS`).

## 3. Runtime hosts

One Worker (`wrangler.jsonc`: top level = local, `env.staging`, `env.production`), pinned to `aws:ap-southeast-1`
on the remote environments.

| Host (production · staging · local) | Context | Audience | Served |
|---|---|---|---|
| `geraiexpress.com` · `staging.geraiexpress.com` · `geraiexpress.localhost:8787` | `MARKETING_APEX` | public | brand SSR, eleven pages: `/`, `/fitur`, `/ekspedisi`, `/cara-kerja`, `/biaya-dan-paket`, `/panduan`, `/simulasi-kasir`, `/tanya-jawab`, `/hubungi-kami`, `/ketentuan`, `/privasi`; `sitemap.xml`, `robots.txt`; static files from `ASSETS /app/*` through the `BRAND_ASSETS` allow-list (incl. `/panduan/*.webp`); no cookies, no `/api`. `www.geraiexpress.com` (production only) → 301 to the apex |
| `app.` · `app-staging.` · `app.geraiexpress.localhost` | `GERAI_WORKSPACE` | gerai owner, Kasir; integrations | SPA + `/api/app/*`; `/api/v1/*` and `POST /mcp` (Bearer `gx_live_` keys only) |
| `owner.` · `owner-staging.` · `owner.geraiexpress.localhost` | `PLATFORM_OWNER` | Super Admin | SPA + `/api/owner/*` + `/internal/ops/*` |
| `hooks.` · `hooks-staging.` · `hooks.geraiexpress.localhost` | `WEBHOOK_INGEST` | Mengantar | `POST /webhooks/mengantar/:token`; everything else is a bodiless 404 |
| `<slug>.geraimitra.com` or an active custom domain · `<slug>-stg.geraimitra.com` · `<slug>.geraimitra.localhost` | tenant (`TENANT_MINISITE`) | public | mini-site SSR: `/` (Cek Ongkir), `/kirim` (form), `/kirim/:slug` (QR card), `/lacak?q=<INV or AWB>`, `/lacak/:slug` (302 → `/lacak?q=`), `POST /lacak/:slug/buka`, `/area` (JSON area search), `/logo`, `/favicon.ico`, `/couriers/<code>.svg`, `robots.txt`, `sitemap.xml`; public `POST /mcp`; a custom `www` twin → 301 to the root once the root is active; canonical = the active custom host |
| `relay.geraiexpress.com` | — | Worker → relay container (DEC-235, `docs/runbooks/partner-relay-production.md`) | never served by the Worker (404, including `/healthz`) |

Request order (`apps/worker/src/index.ts`): `GET|HEAD /healthz` on eligible hosts, no storage → `classify` (normalise,
shape, DCV pass-through, HMAC probe, platform match, D1 `tenant_hostnames` with a ≤ 30 s per-isolate cache; outcomes
404, 403 suspended, 503 recovery) → context router. A path family that belongs to another context (`/api/`,
`/webhooks/`, `/internal/`, `/mcp`) is a neutral 404.

## 4. Bindings and configuration

| Binding | Kind | Used for |
|---|---|---|
| `DB` | D1 | control plane (§5) |
| `GERAI_VAULT` | Durable Object `GeraiVaultDO` (SQLite) | one object per gerai: all tenant data |
| `PARTNER_QUOTA` | Durable Object `PartnerQuotaDO` (SQLite) | global Partner API quota: 60 calls/min, 1,000 registrations per WIB day |
| `BUCKET` | R2 | tenant media and daily backups, all under `t/<tenant>/…`; raw keys never leave the Worker |
| `CACHE_KV` | KV | read-through caches only: Mengantar area search, and geocode results (7 days for a hit, 1 hour for a miss). Never host → tenant, sessions, rate limits or suspension |
| `EMAIL` | `send_email` | transactional mail from `MAIL_FROM` |
| `WEBHOOK_QUEUE`, `BULK_QUEUE`, `FINANCE_SYNC_QUEUE`, `HOSTNAME_QUEUE` | Queues | §7 |
| `RATE_LIMITER` | rate limit (60 per 60 s) | `/api/v1` per key and IP |
| `ASSETS` | static assets, `run_worker_first` | both SPAs (`/app/*`, `/owner/*`), served only on their own verified host; `*.map` refused |

Vars: `GX_ENV` (`local` · `staging` · `production`), `PLATFORM_APEX`, `TENANT_ZONE`, `MENGANTAR_PUBLIC_ORIGIN`,
`MENGANTAR_PARTNER_ORIGIN` (`mock` locally), `PARTNER_TRANSPORT` (`relay` is mandatory in production),
`MENGANTAR_PARTNER_ID`, `MAIL_FROM`, `TURNSTILE_SITE_KEY`, `CF_SAAS_ZONE_ID` (`mock` locally).

Required secrets (names only; values in `.dev.vars` locally, `wrangler secret` remotely): `AUTH_SESSION_PEPPER`,
`KEK_SECRET`, `PROBE_SECRET`, `TURNSTILE_SECRET_KEY`, `MENGANTAR_PARTNER_SECRET`, `MENGANTAR_PUBLIC_READ_KEY`
(required in `env.staging` / `env.production` `secrets.required`, optional only in local mock mode; without it outside
mock mode, area search answers `503 AREA_SEARCH_UNAVAILABLE` and `areaSearchKeyConfigured` alerts),
`PARTNER_RELAY_URL`, `PARTNER_RELAY_SECRET`, `CF_SAAS_API_TOKEN` (production only; staging omits it and sets
`CF_SAAS_ZONE_ID = "disabled"` per DEC-255), `OPS_TOKEN`, `ALERT_WEBHOOK_URL`.

Mengantar Partner settings resolve in `mengantar/factory.ts`: the singleton D1 row `platform_partner_config` (Super
Admin `Sistem & Audit › Integrasi Mengantar`; secrets encrypted with `KEK_SECRET`, only a tail is ever returned)
overrides the environment per field, with a 30 s per-isolate cache that is cleared on save.

## 5. Storage: control plane (D1) and tenant data (`GeraiVaultDO`)

**D1 `DB` — 32 tables**

| Area | Tables |
|---|---|
| Identity | `users`, `sessions`, `email_otps`, `password_resets`, `invitations`, `auth_throttle`, `known_devices`, `super_admins`, `super_admin_recovery_codes` |
| Tenancy | `tenants`, `tenant_members`, `tenant_hostnames`, `custom_hostname_quota`, `tenant_schema_versions`, `tenant_applications`, `tenant_onboarding` |
| Routing and keys | `webhook_routes`, `tenant_api_keys` |
| Pricing | `courier_service_catalog`, `platform_pricing_policy`, `courier_discount_policy`, `tenant_discount_rules` |
| Cross-tenant indexes (written only by the vault outbox) | `shipment_index`, `recipient_risk_index`, `tenant_daily_stats` |
| Platform config | `platform_partner_config`, `platform_legal_profile` |
| Operations | `audit_logs`, `alert_state`, `public_api_events`, `email_outbox`, `email_suppressions` |

**`GeraiVaultDO` — 39 migrated tables per object**, plus `schema_version`, `vault_identity` and `vault_rate`, which
the object creates itself.

| Area | Tables |
|---|---|
| Profile and settings | `tenant_settings`, `tenant_business_profiles`, `tenant_outlets`, `tenant_courier_prefs`, `packing_items`, `media_objects` |
| Mengantar connection | `mengantar_connections` (encrypted seller key + webhook secret, rotation fence, previous token for 24 h), `pickup_time_slots`, `receiver_score_cache` |
| Shipments | `inv_slugs`, `shipments`, `shipment_events` (incl. `status_text`), `quote_snapshots`, `dispatch_journal`, `counter_receipts`, `masking_usage` |
| Status intake | `webhook_inbox`, `vault_timers` |
| Contacts | `sender_contacts`, `recipient_contacts` |
| Counter | `cashier_shifts`, `customer_display_sessions` (token hash only) |
| Bulk | `bulk_import_batches`, `bulk_import_rows` |
| Finance (Mengantar mirror book) | `mengantar_invoice_mirror`, `mengantar_invoice_subitems`, `finance_discrepancies`, `finance_sync_state` |
| Pickup, returns, claims | `pickup_batches`, `pickup_batch_items`, `return_intakes`, `shipment_claims` |
| Mini-site | `minisite_drafts`, `tracking_unlocks` |
| Platform plumbing | `outbox`, `audit_logs`, `notifications`, `notification_reads`, `api_key_spend` |

`GeraiVaultDO` (`apps/worker/src/do/gerai-vault/`): reached only through `vaultFor(env, tenantId)`
(`getByName`, `locationHint: apac`); it binds its tenant on the first `migrate`. Since DEC-254 a provisioned, healthy
object that is behind `TENANT_SCHEMA_VERSION` applies the pending migrations itself on its first RPC; an unprovisioned
object, one in `recovery`, or one **ahead** of the deployed code refuses with `TENANT_NOT_READY`. It answers refusals as data
(`{ ok: false, refused }`), never by throwing. About 100 RPC methods, grouped:

| Group | Methods |
|---|---|
| Core | `migrate`, `schemaState`, `flushOutbox`, `runTimers`, `alarm`, `healthSnapshot`, `statusCounts` |
| Slugs | `allocateSlug`, `slugExists` |
| Mengantar connection and key rotation | `connectionView`, `recordOnboarding`, `syncSellerKeyFromPartner`, `beginKeyRotation`, `abortKeyRotation`, `markKeyRotationUnknown`, `pendingKeyRotation`, `completeKeyRotation`, `resolveKeyRotation`, `probeDispatchFence` |
| Webhooks and status | `ensureWebhookToken`, `saveWebhookSecret`, `webhookStatus`, `ingestWebhook`, `applyWebhook`, `sweepInbox`, `pollStatus`, `syncShipmentStatus` |
| Couriers and rates | `courierPrefs`, `setCourierPref`, `observeRates`, `estimateRates`, `freezeQuote`, `defaultOutlet`, `upsertDefaultOutlet` |
| Checkout | `shipmentDetail`, `setShipmentParties`, `recordPayment`, `dispatchShipment`, `reconcileDispatch`, `payUnpaid`, `cancelShipment` |
| Contacts and media | `contacts`, `receiverScore`, `recordRecipientCodOutcome`, `registerMedia`, `mediaIdsForKeys`, `mediaKey`, `outletQris`, `outletLogo` |
| Masking and printing | `maskingState`, `maskingSettings`, `saveMaskingSettings`, `revealTrueSender`, `printSettings`, `preparePrint`, `printableList` |
| Shift and COD payout | `shiftOp`, `payoutOp`, `setReconciledCodCredit` |
| Customer display | `customerDisplayOp`, `customerDisplayView` |
| Paket Massal and Cek Resi | `bulkCreate`, `bulkView`, `bulkList`, `bulkPending`, `bulkApplyCheck`, `bulkEditRow`, `bulkRemoveRow`, `bulkMaterialize`, `bulkDispatch` (serialized), `bulkPay` (atomic), `bulkCancelUnissued`, `trackLookup` |
| Lists and settings | `shipmentList`, `shipmentCsv`, `dashboard`, `settingsView`, `settingsWrite`, `addNotification`, `listNotifications`, `markNotificationsRead` |
| Finance | `financeSync` (bounded, serialized), `recoverUnpaid`, `financeView`, `resolveDiscrepancy` |
| Pickup, returns, exceptions | `pickupOp`, `manifestData`, `returnsOp`, `exceptionsOp`, `claimPacket` |
| Mini-site | `minisiteProfile`, `minisiteShell`, `minisiteLogo`, `createMinisiteDraft`, `minisiteTrack`, `minisiteUnlock`, `claimMinisiteDraft` |
| Backups | `exportBackup`, `restoreBackup` (into an empty `drill-*` object only) |
| Demo and simulation | `seedDemo`, `simulateProviderStatus`, `devMockSellerKey`, `devProviderStatus` |

Tenant → D1 goes only through the versioned absolute-upsert `outbox` (`shipment_index`, `recipient_risk_index`,
`tenant_daily_stats`). Status = provider maximum (terminal, minute bucket, rank) + monotone custody + `combine`
(`@gx/domain/status`).

## 6. Routes

Every `/api/app/*` and `/api/owner/*` route is registered through `register()` with an auth level and a DTO
projection; the CI route scan fails on any handler mounted another way.

### 6.1 Outside the two session APIs

| Host | Routes | Auth |
|---|---|---|
| any eligible host | `GET /healthz` | none, no storage |
| tenant candidates | `/.well-known/{acme-challenge,pki-validation}/*` (passed to Cloudflare), `GET /.well-known/geraiexpress-probe/:nonce` | none (HMAC probe) |
| `hooks.` | `POST /webhooks/mengantar/:token` → token hash → the tenant object verifies (token, HMAC, ±5 min, environment) and stores before 200 → `WEBHOOK_QUEUE` → `applyWebhook` | path token + signature |
| `app.` | `/api/v1/*`: 24 operations from one route table — `areas`, `quotes`, `shipments` (draft, list, detail, `issue`, `pay-unpaid`, `labels`), `labels/bulk`, `bulk-imports` (create, view, `commit`), `contacts/{senders,recipients}` (list, create, update), `contacts/recipient-risk`, `exceptions`, `returns`, `finance/{summary,analytics,sync}`; plus `openapi.json` (OpenAPI 3.1) and `docs` | Bearer key + scope (`rates:read`, `shipments:draft`, `shipments:issue`, `tracking:read`, `contacts:read`, `contacts:write`, `finance:read`, `finance:sync`); `issue` needs `Idempotency-Key` and stays under the key's daily Rupiah cap |
| `app.` | `POST /mcp`: 11 outlet tools, adapters over the `/api/v1` table | same Bearer key and scopes |
| tenant hosts | `POST /mcp`: 5 public tools (outlet info, areas, publish-price quote, pre-booking, privacy-safe tracking) | none; per-IP and per-gerai daily caps |
| `owner.` | `POST /internal/ops/{do-migrate,bootstrap-admin,seed-demo,backup-export,backup-restore,alert-drill}` | Bearer `OPS_TOKEN` |
| `owner.` (+ `app.` for `preview`) | `GET /internal/dev/last-mail`, `GET /internal/dev/preview` | `OPS_TOKEN`, `GX_ENV = local` only |
| `app.`, `owner.` | any other `GET` | SPA shell + hashed assets |

### 6.2 `/api/app/*` — 141 routes

| Auth | Routes |
|---|---|
| `public` (11) | `GET /auth/config` · `POST /auth/{signup/request,signup/verify,signup/complete,login,password/forgot,password/reset}` · `GET /auth/invitations/:token`, `POST /auth/invitations/:token/accept` · `GET /customer-display/{view,media/:kind}` (paired display: token hash in that gerai's object, no session, no cookie) |
| `app_session` (14) | `GET /auth/me`, `POST /auth/logout` · `GET /account`, `POST /account/{profile,password,email/request,email/confirm,sessions/revoke}` · `GET /onboarding/{areas,status}`, `POST /onboarding/application` · `GET /geocode` · `GET /support` · `POST /dev/seed-tenant` |
| `app_member` (78) | `GET /workspace`, `/pos-config`, `/areas`, `/dashboard`, `/track`, `/masking`, `/exceptions` · `/notifications`, `/notifications/read` · `/contacts/{senders,recipients}` (list, create, `:id`, `:id/shipments`), `/contacts/senders/:id/verify-wa`, `/contacts/{receiver-score,risk-badge}` · `/media`, `/media/:id` · `POST /quotes`, `/quotes/freeze` · `GET /shipments`, `/shipments/:slug`, `POST /shipments/:slug/{parties,payment,dispatch,reconcile,pay-unpaid,cancel,reveal-sender,cod-payout,sync,claim}` · `/claims/:id/{packet,status}` · `/shift`, `/shifts`, `/shift/{open,close}` · `/print`, `/print/{settings,list}` · `/customer-display/{status,pair,state,unpair}` · `GET /settings/{qris,logo}` · `/bulk`, `/bulk/{services,template.csv}`, `/bulk/:batch{,/recheck,/rows/:row,/create,/pay,/cancel-unissued}` · `/pickup`, `/pickup/{history,open}`, `/pickup/:batch{,/scan,/unscan,/handover,/surat-jalan.pdf}` · `/returns`, `/returns/intake`, `/returns/:slug/{code,handback}` · `POST /minisite-drafts/:slug/claim` · `POST /dev/{notify,provider-status}` |
| `app_owner` (38) | `GET /members`, `POST /members/invitations`, `/members/:userId/revoke` · `POST /onboarding/byok` · `GET /settings`, `POST /settings/{profile,business,receipt,packing,cashier-payout}` · `GET` + `POST /settings/masking` · `GET /settings/mengantar`, `POST /settings/mengantar/{webhook-secret,sync-key,poll}` · `GET /settings/couriers`, `POST /settings/couriers/:code` · `POST /settings/{qris,logo}` · `GET /shipments-export.csv`, `POST /shipments/:slug/conflict-note` · `GET /finance`, `POST /finance/sync`, `/finance/discrepancies/:id/resolve` · `POST /contacts/{senders,recipients}/:id/archive` · `GET` + `POST /api-keys`, `POST /api-keys/:id/revoke` · `GET` + `POST /custom-domain`, `POST /custom-domain/{check,remove}` · `GET /status`, `POST /status/recheck` · `POST /dev/{mock-invoices,simulate-status}` |

Role projection strips seller cost, discount, margin and Mengantar balance from `Kasir` responses on the server.

`/dev/*` guards: `seed-tenant` and `notify` answer only when `GX_ENV = local`; `mock-invoices` and `provider-status`
additionally need the mock Mengantar origin; `simulate-status` answers everywhere except production, so it is live on
staging.

Demo account: a session of the demo user, or any member of the `demo` tenant, gets `403 DEMO_READ_ONLY` on every
non-`GET` except login, logout, `POST /quotes` and `POST /print`. The demo mini-site's `Kirim dari Rumah` form and a
password-reset request for the demo email are refused with the same message.

### 6.3 `/api/owner/*` — 62 routes

| Auth | Routes |
|---|---|
| `public` (2) | `GET /auth/config`, `POST /auth/login` |
| `owner_aal1` (4) | `POST /auth/totp/{enrol,verify,recovery}`, `POST /auth/logout` |
| `owner_aal2` (27) | `GET /auth/me`, `GET /account`, `POST /account/{profile,sessions/revoke}` · `GET /overview` · `GET /gerai`, `/gerai/summary`, `/gerai/applications`, `/gerai/applications/:id`, `/gerai/:slug`, `POST /gerai/:slug/sinkron` · `GET /domains`, `POST /domains/periksa` · `GET /tarif/{gerai,gerai/:tenantId,permintaan,permintaan.csv,kebijakan}`, `POST /tarif/verifikasi-ulang` · `GET /pengawasan/{kiriman,antrean}`, `POST /pengawasan/sinkron-keuangan` · `GET /sistem/{kesehatan,admin,mengantar,profil-perusahaan}`, `POST /sistem/kesehatan/periksa` |
| `owner_recent` (29; TOTP ≤ 15 min, reason + audit on changes) | `POST /account/{password,email/request,email/confirm,recovery-codes,totp/rotate-start,totp/rotate-confirm}` · `POST /gerai/applications/:id/{approve,reject}`, `POST /gerai/:slug/{status,masking,custom-domain,onboarding/retry,sinkron-kunci}` · `POST /domains/:hostname/delete` · `POST /tarif/gerai/:tenantId/:serviceCode`, `/tarif/gerai/:tenantId/tarik-mengantar`, `/tarif/kebijakan/{platform,kurir/:courierCode}`, `/tarif/permintaan/tandai` · `POST /pengawasan/risiko` · `GET /sistem/audit`, `GET /audit` · `POST /sistem/{mengantar,mengantar/uji,profil-perusahaan,admin/:userId/risk-review,rotasi-kunci/:slug}` · `POST /admins`, `/admins/:userId/totp-reset` |

Super Admin modules are scanned for shipment and money vault RPCs by `scripts/ci/non-impersonation.test.mjs`
(DEC-209); a vault method they call must be on the allowlist in `scripts/ci/route-scan-lib.mjs`.

### 6.4 SPA routes

**`app.`** — outside the shell: `/masuk`, `/daftar-akun`, `/daftar`, `/daftar/status`, `/lupa-sandi`,
`/atur-sandi/:token`, `/undangan/:token`, `/kasir/layar-pelanggan` (paired display, no sign-in). Inside the shell:
`/`, `/notifikasi`, `/kasir`, `/kasir/{multi,cek-cepat,cek-resi,shift}`, `/kiriman`,
`/kiriman/{:slug,massal,massal/:batch,cetak-massal,pickup/:batch}`, `/kontak` (→ `/kontak/pengirim`),
`/kontak/{pengirim,penerima}`, `/kontak/{pengirim,penerima}/:id`, `/keuangan`, `/pengaturan` (desktop → first page),
`/pengaturan/{profil,mini-site,data-usaha,ekspedisi,printer,label-privasi,packing,anggota,mengantar,api-mcp}`,
`/status`, `/akun`, `/bantuan`. Owner-only screens: `/keuangan`, `/status`, every `/pengaturan/*` page except
`printer`.

Sidebar (DEC-241), seven entries over the six server menu keys — `Cek Ongkir & Resi` shares the `Buat Pengiriman`
key: **Utama** `Dashboard` · `Buat Pengiriman` (Kiriman Satuan, Paket Massal) · `Cek Ongkir & Resi`; **Operasional**
`Kiriman` (Daftar Kiriman, Pickup & Surat Jalan, Cetak Resi Massal, Riwayat Massal, Meja Retur, Kendala & Klaim) ·
`Kontak`; **Administrasi** `Keuangan` · `Pengaturan`. `/kasir/shift` is routed but not linked (TASK-704).

**`owner.`** — `/masuk`, `/totp`, then `/` (Ringkasan), `/gerai`, `/gerai/pengajuan/:id`, `/gerai/:slug`, `/tarif`,
`/tarif/:tenantId`, `/pengawasan`, `/sistem`, `/akun`. Five menus; sub-trees are `?tab=` views of the same page.

## 7. Background work

| Trigger | Work |
|---|---|
| Cron `*/5 * * * *` | email outbox dispatch (retries, expiry), operator checks + alerts, discount verifier; on minutes divisible by 15: finance sync fan-out (one message per connected gerai); on minutes divisible by 10: custom-hostname status poll |
| Cron `0 * * * *` | revoke rotated webhook routes past their grace window |
| Cron `0 19 * * *` (02:00 WIB) | finance pending-row rescan, hostname reaper + Cloudflare quota check, per-object R2 backup export, prune `public_api_events` older than 2 days |
| Queue `gx-mengantar-webhooks` (batch 10, 5 retries) | apply stored webhook events (`applyWebhook`) |
| Queue `gx-bulk` (batch 1, 3 retries) | Paket Massal row checks and serialized dispatch |
| Queue `gx-mengantar-finance-sync` (batch 5, 3 retries) | per-tenant finance sync |
| Queue `gx-hostnames` (batch 15, 5 retries) | custom-hostname creation (≤ 15 per minute) and DCV re-read |
| `GeraiVaultDO` alarm | one alarm per object serves the outbox flush and the named timers `status_poll`, `inbox_sweep`, `key_rotation_check`, `daily_stats`, `finance_sync` (60 s after a mutation), `claim_expiry` |

Queue names carry the suffix `-staging` or `-production` on the remote environments.

## 8. External systems

| System | Reached from | Notes |
|---|---|---|
| Mengantar Public API | `GeraiVaultDO`, plus area search in `couriers/areas.ts`, through `publicClient` | per-seller key in the URL path: never log or return upstream URLs |
| Mengantar Partner API | `resolvePartnerClient`: onboarding and seller-key rotation / read-back reserve from `PartnerQuotaDO` before each call; the Super Admin connection test (`POST /sistem/mengantar/uji`) calls without a reservation, limited to 6 per minute per admin | production only through the relay |
| Partner relay (`relay.geraiexpress.com`) | Worker `fetch` | static egress IP; spec 10 |
| Cloudflare for SaaS API | `hostnames/cloudflare.ts` | custom hostnames on the `geraimitra.com` zone; in-process fake when `CF_SAAS_ZONE_ID = mock` |
| Cloudflare Turnstile | auth pages, mini-site forms | `challenges.cloudflare.com` is the only third-party script origin in the SPA CSP |
| Cloudflare Email Sending | `email/mailer.ts` | eight templates: `signup_otp`, `password_reset`, `kasir_invite`, `email_change_otp`, `application_status`, `security_alert`, `application_submitted`, `admin_new_application` |
| OpenStreetMap | `GET /api/app/geocode` → `lib/geocode.ts` → Nominatim (server side, KV-cached); raster tiles from `tile.openstreetmap.org` in the `app.` SPA only | outlet pin picker; local runs answer with fixed coordinates and make no network call |
| Owner alert webhook | `telemetry/alerts.ts`, `pnpm probes` | `ALERT_WEBHOOK_URL` |
| API reference viewer | `/api/v1/docs` | loads its viewer script from `cdn.jsdelivr.net` |

## 9. Commands

| Command | Does |
|---|---|
| `pnpm dev` | build both SPAs, then run the Worker locally (`.wrangler/state-dev`) |
| `pnpm db:migrate:local` | apply D1 control migrations to the local state |
| `pnpm typecheck` · `pnpm lint` | regenerate Worker types, then type-check every package · ESLint with zero warnings |
| `pnpm test:unit` · `pnpm test:worker` | unit project (Node) · Workers Vitest (`workerd`) |
| `pnpm test:migrations` · `pnpm test:isolation` | migration and drift tests · `test/isolation` + `test/host` |
| `pnpm check` | typecheck → lint → unit → build → Workers tests → bundle audit |
| `pnpm check:fast` | typecheck → lint → build → bundle audit, no test suites (DEC-249): pair it with targeted `unit` / `worker` runs, never with `pnpm check` on the same tree |
| `pnpm e2e` | Playwright on 390, 768 and 1280 against a fresh local state (per-test client IP) |
| `GX_SKIP_BUILD=1 pnpm exec playwright test <spec> --project desktop-1280` | focused e2e reusing the last `pnpm build`; `GX_REUSE_SERVER=1` attaches to a `wrangler dev` already on `GX_E2E_PORT` |
| `GX_VITEST_WORKERS=<n>` | cap on parallel `workerd` pools for Workers tests (default 3 locally, 4 in CI) |
| `pnpm clean:e2e-state` | remove `.wrangler/state-e2e-*` folders older than 2 h (also runs when Playwright starts) |
| `pnpm gate <TASK-x99>` | integrated run, sequential and fail-fast, each gate recorded in `delivery-ledger`: typecheck, lint, unit, build, worker, migrations, isolation, security, e2e |
| `pnpm security:bundle-audit` | `*.map`, source-map comments, secret-shaped literals, client secret names |
| `pnpm ci:red-fixtures` | prove a broken test, a `.map`, a secret literal and an unprotected route each fail their gate |
| `node scripts/ci/deploy-dispatch-gate.mjs` | the secret-less staging deploy gate that `deploy-staging.yml` runs before the `staging-deploy` environment (DEC-253) |
| `pnpm do:migrate --env <local\|staging\|production> [--dry-run] [--batch <n>]` | migrate every tenant object and reconcile D1 `tenant_schema_versions`, stop at the first failure |
| `secrets-env run -- pnpm deploy:staging` · `pnpm deploy:production` (`[--skip-build] [--dry-run]`) | DEC-254 manual pipeline (`scripts/deploy/deploy.mjs`): build + bundle audit → remote D1 control migrations → `wrangler deploy` → `do:migrate` → probes. Every step is a production action that needs the owner's approval; unlike the GitHub workflows it checks neither the branch nor a green CI run |
| `pnpm probes --env <local\|staging\|production> [--port <n>] [--force-fail <probe>] [--alert-dry-run]` | `OBSERVABILITY.md` probes + owner alert |
| `pnpm email:deliverability` | read-only SPF, DKIM, DMARC and received-header checks |
| `node scripts/dev/seed-preview.mjs [port]` | local synthetic owner, application and Super Admin for rendering gates |
| `node infra/partner-relay/verify.mjs <relay URL> [--partner-sandbox\|--partner-production]` | spec 10 §6 relay checks (auth, allowlist, size; optionally one real Partner call) |
| `node scripts/backup/d1-local-dump.mjs <db.sqlite> <out.sql>` | local D1 restore drill |

Deploys, remote migrations and every other production step need the owner's approval per action
(`docs/WORKFLOW.md` §8).

## 10. Regenerating the numbers

```bash
# files · lines for one area (§2)
git ls-files <path> | grep -E '\.(ts|tsx|mjs|mts|sql|sh)$' | wc -l
git ls-files <path> | grep -E '\.(ts|tsx|mjs|mts|sql|sh)$' | xargs cat | wc -l

# test cases, enumerated without running them (§2)
pnpm exec vitest list --project unit | wc -l
pnpm --filter @gx/worker exec vitest list | wc -l
pnpm exec playwright test --list | tail -1

# tables created by the migrations (§5); subtract the ones a later migration drops or renames
grep -hoE '^CREATE TABLE (IF NOT EXISTS )?[a-z_0-9]+' packages/db/migrations/control/*.sql | sort -u
grep -hoE '^CREATE TABLE (IF NOT EXISTS )?[a-z_0-9]+' packages/db/migrations/tenant/*.sql | sort -u

# registered API routes (§6.2, §6.3); one templated line in api/app.ts expands to five /settings/* routes
grep -cE '^\s*r\(\s*"(GET|POST)"' apps/worker/src/api/app.ts
```

## 11. Runbooks (owner-run production steps)

`docs/runbooks/`: `production-zones.md` (zones, Cloudflare for SaaS, account and resources), `partner-relay-production.md`
(relay host and Mengantar allowlist), `email-deliverability.md`, `backups-and-restore.md`. Worker routes per
environment live in `wrangler.jsonc`: production uses Custom Domains for the platform hosts plus `*/*` and
`cname.geraimitra.com/*` on `geraimitra.com`; staging uses the `*-staging` hosts plus `*-stg.geraimitra.com/*`.
