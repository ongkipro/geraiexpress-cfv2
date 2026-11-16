# System Map — GeraiExpress v2 (`geraiexpress-cfv2`)

One-screen navigation map of what exists **in code today**. Refreshed at every milestone close (TASK-x99) and at the
end of M6 code. Contracts live in `docs/spec/`, decisions in `DECISIONS.md`, state in `STATUS.md`.

Updated: 2026-11-16 — **M4 closed** (TASK-401..405, TASK-499; live steps listed in `STATUS.md`)

## 1. Repository layout (real counts, ts/tsx/mjs/mts/sql/sh)

| Path | What | Files · lines |
|---|---|---|
| `apps/worker/src` | the one Cloudflare Worker: host classifier, SPA serving, `/api/app`, `/api/owner`, `hooks.` ingest, auth + `Akun Saya`, email outbox, onboarding, couriers, pricing (rules + quote engine), labels, bulk queue, finance cron fan-out, analytics, Super Admin console APIs, ops, telemetry, `GeraiVaultDO`, `PartnerQuotaDO` | 79 · 11,329 |
| `apps/worker/test` | Workers Vitest in `workerd`: host, auth, account, Super Admin, email, migrations/drift, slug, telemetry, isolation, onboarding, webhooks/status, key rotation, couriers, pricing/quote, contacts/media, dispatch/payment, masking, labels, shift/payout, bulk/Cek Resi, analytics, settings, listing, finance (sync, recovery, determinism), pickup, returns, exceptions, CI route scan | 49 · 5,030 |
| `apps/web-app/src` | Vite + React 19 SPA for `app.`: shell, Dashboard + `PeriodFilter`, Buat Pengiriman (5 tabs), `/kiriman` hub (list, Pickup & Manifest scan mode, Meja Retur, Kendala & Klaim, Riwayat Massal, Cetak Resi Massal, detail/checkout), Kontak, Keuangan (dual book), Pengaturan (8 pages), Akun Saya, Bantuan, print client | 80 · 9,257 |
| `apps/web-owner/src` | Vite + React 19 SPA for `owner.`: login, TOTP, console shell (5 menus), Ringkasan, Gerai, Tarif & Kurir, Pengawasan, Sistem & Audit | 18 · 1,656 |
| `packages/domain` | pure integer money / weight / INV slug / status combine / cashback / contacts / masking / bulk CSV / WIB period / courier claim windows | 21 · 1,833 |
| `packages/db` | Drizzle schemas + forward-only SQL: `migrations/control` (D1), `migrations/tenant` (every `GeraiVaultDO`) | 34 · 2,213 |
| `packages/mengantar-sdk` | Public API client (redacting transport, Zod passthrough, order/address/time) + Partner client (direct/relay, `maybe_sent`) | 7 · 701 |
| `packages/telemetry` | structured events, redaction, Public API anomaly evaluators | 2 · 294 |
| `packages/thermal-print` | Code128 + QR, exact-size label PDFs (10×15 with stub, 10×10, 10×15), 58 mm ESC/POS roll, A4 Surat Jalan | 12 · 932 |
| `infra/partner-relay` | stateless static-egress relay (Node, 66-line core), Dockerfile, compose (DEC-219) | 4 · 185 |
| `scripts/` | `ci/` (bundle audit, route + non-impersonation scans, red fixtures, integrated gate), `do-migrate`, `probes`, `email` deliverability, `dev/seed-preview` | 17 · 722 |
| `e2e/` | Playwright (390/768/1280), 18 specs: accounts, Super Admin, onboarding, shell, contacts, quote, checkout (< 45 s), masking, print, shift, bulk + Cek Resi, dashboard, settings, Kiriman, Keuangan, recovery, pickup, returns, Kendala | 20 · 862 |
| `.github/workflows` | `ci.yml`, `deploy-staging.yml` (protected env), `deploy-production.yml` (manual) | 3 |

Tests: 158 unit + 284 Workers cases + 18 Playwright specs (each over 3 viewports). Migrations — control: `0000_baseline`
… `0010_daily_stats`; tenant (v18): `0001_baseline` … `0014_settings`, `0015_finance`, `0016_pickup`, `0017_returns`,
`0018_claims`.

## 2. Runtime hosts and audiences (one Worker, `wrangler.jsonc`: local, `env.staging`, `env.production`)

| Host (prod · local) | Context | Audience | Served today |
|---|---|---|---|
| `geraiexpress.com` · `geraiexpress.localhost:8787` | `MARKETING_APEX` | public | `/healthz`; brand site at TASK-502 |
| `app.geraiexpress.com` · `app.geraiexpress.localhost` | `GERAI_WORKSPACE` | owner, Kasir | SPA + `/api/app/*` |
| `owner.geraiexpress.com` · `owner.geraiexpress.localhost` | `PLATFORM_OWNER` | Super Admin | SPA + `/api/owner/*` + `/internal/ops/*` |
| `hooks.geraiexpress.com` · `hooks.geraiexpress.localhost` | `WEBHOOK_INGEST` | Mengantar | `POST /webhooks/mengantar/:token` (bodiless 404 otherwise) |
| `<slug>.gerai.cc` / custom · `<slug>.gerai.localhost` | `TENANT_MINISITE` | public | `GET /` placeholder; mini-site at TASK-501 |
| `relay.geraiexpress.com` | — | Worker → VPS relay | never served by the Worker (404, also `/healthz`) |

Request order (`apps/worker/src/index.ts`): `/healthz` on eligible hosts → `host/classify.ts` (normalise, shape, DCV,
platform match, D1 `tenant_hostnames` ≤ 30 s cache, 404/403/503) → context router (foreign API families → 404).

## 3. Control plane (D1 `DB`) vs tenant data (`GeraiVaultDO`)

| D1 control tables | Tenant object tables |
|---|---|
| identity: `users`, `sessions`, `email_otps`, `password_resets`, `invitations`, `auth_throttle`, `known_devices`, `super_admins` (+`risk_review`) · tenancy: `tenants`, `tenant_members`, `tenant_hostnames`, `tenant_schema_versions`, `tenant_applications`, `tenant_onboarding` · routing: `webhook_routes` · pricing: `courier_service_catalog`, `platform_pricing_policy`, `courier_discount_policy`, `tenant_discount_rules` · indexes: `shipment_index`, `recipient_risk_index` · ops: `audit_logs`, `alert_state`, `email_outbox`, `email_suppressions`, `platform_legal_profile` | `tenant_settings`, `tenant_business_profiles`, `tenant_outlets`, `audit_logs`, `outbox`, `inv_slugs`, `mengantar_connections` (encrypted key + webhook secret, rotation fence, previous token 24 h), `shipments` (status + checkout + masking + print + bulk columns), `shipment_events`, `webhook_inbox`, `vault_timers`, `tenant_courier_prefs`, `notifications`, `sender_contacts`, `recipient_contacts`, `media_objects`, `quote_snapshots`, `dispatch_journal`, `counter_receipts`, `vault_rate`, `masking_usage`, `cashier_shifts`, `bulk_import_batches`, `bulk_import_rows`, `packing_items`, `mengantar_invoice_mirror`, `mengantar_invoice_subitems`, `finance_discrepancies`, `finance_sync_state`, `pickup_batches`, `pickup_batch_items`, `return_intakes`, `shipment_claims` (+ `schema_version`, `vault_identity`) |

`GeraiVaultDO` (`apps/worker/src/do/gerai-vault/`): only via `vaultFor(env, tenantId)` (`locationHint: apac`); binds its
tenant on first `migrate`; refusals as data. RPC groups: core (`migrate`, `schemaState`, `flushOutbox`, `runTimers`,
`alarm`), slugs, Mengantar connection (`connectionView`, `recordOnboarding`), webhooks/status (`ensureWebhookToken`,
`saveWebhookSecret`, `webhookStatus`, `ingestWebhook`, `applyWebhook`, `sweepInbox`, `pollStatus`), key rotation fence
(`beginKeyRotation` … `completeKeyRotation`, `resolveKeyRotation`, `probeDispatchFence`), couriers (`courierPrefs`,
`setCourierPref`), discount observation (`observeRates`), notifications, contacts + media, quotes (`estimateRates`,
`freezeQuote`, `defaultOutlet`), checkout (`shipmentDetail`, `setShipmentParties`, `recordPayment`, `dispatchShipment`,
`reconcileDispatch`, `payUnpaid`, `cancelShipment`), masking, printing (`preparePrint`, `printableList`), shift + COD
payout (`shiftOp`, `payoutOp`), Paket Massal (`bulkCreate` … `bulkDispatch` serialized, `bulkPay` atomic,
`bulkCancelUnissued`), Cek Resi (`trackLookup`), dashboard, settings (`settingsView`/`settingsWrite`, NPWP encrypted),
Kiriman list + CSV, finance sync (`financeSync` bounded/serialized, `recoverUnpaid`, `financeView`, Saldo Aman reserve), pickup manifests (`pickupOp`, `manifestData`), Meja Retur (`returnsOp`), Kendala & Klaim (`exceptionsOp`, `claimPacket`). One DO alarm serves the outbox and the named timers (`status_poll`, `inbox_sweep`,
`key_rotation_check`, `daily_stats`, `finance_sync` +60 s after mutations). DO → D1 via the versioned absolute-upsert `outbox` (`shipment_index`,
`recipient_risk_index`, `tenant_daily_stats`). `PartnerQuotaDO` (global): 60 calls/min, 1,000 registrations per WIB day.

Status = provider maximum (terminal, minute bucket, rank) + monotone custody + `combine` (`@gx/domain/status`).

## 4. Routes in code

| Host | Routes | Auth (registry) |
|---|---|---|
| any eligible | `GET /healthz` | none, no storage |
| tenant candidates | DCV `/.well-known/{acme-challenge,pki-validation}/*`; `GET /.well-known/geraiexpress-probe/:nonce` | none (HMAC probe) |
| `hooks.` | `POST /webhooks/mengantar/:token` → token hash → tenant object verifies (token, HMAC, ±5 min, environment) and stores before 200 → Queue `gx-mengantar-webhooks` → `applyWebhook` | path token + signature |
| `app.` | `POST /api/app/auth/{signup/request,signup/verify,signup/complete,login,password/forgot,password/reset}`, `GET /auth/invitations/:token`, `POST /auth/invitations/:token/accept` | public allowlist |
| `app.` | `POST /auth/logout`, `GET /auth/me` · `GET /onboarding/areas`, `POST /onboarding/application`, `GET /onboarding/status` · `GET /areas` | `app_session` / `app_member` |
| `app.` | `GET /workspace`, `/notifications*`, `/contacts/*`, `/media*`, `POST /quotes`, `/quotes/freeze`, `/shipments` (list), `/shipments/:slug{,/parties,/payment,/dispatch,/reconcile,/pay-unpaid,/cancel,/reveal-sender,/cod-payout}`, `/shift{,s,/open,/close}`, `/print{,/settings,/list}`, `/masking`, `/bulk{,/services,/template.csv,/:batch{,/recheck,/rows/:row,/create,/pay,/cancel-unissued}}`, `/track`, `/dashboard`, `/pickup*` (queue, open, scan, unscan, handover, `surat-jalan.pdf`), `/returns*` (desk, intake, code, handback), `/exceptions`, `/shipments/:slug/claim`, `/claims/:id/{status,packet}` · `/account*`, `/support` | `app_member` / `app_session` (role projection strips cost, margin, balance for Kasir) |
| `app.` | `POST /members/invitations`, `GET /members`, `POST /members/:userId/revoke`, `POST /onboarding/byok`, `GET /settings`, `POST /settings/{profile,business,receipt,packing,cashier-payout}`, `/settings/masking`, `GET /settings/mengantar`, `POST /settings/mengantar/webhook-secret`, `GET /settings/couriers`, `POST /settings/couriers/:code`, `GET /shipments-export.csv`, `GET /finance`, `POST /finance/sync`, `POST /shipments/:slug/conflict-note` · local-only `POST /dev/seed-tenant`, `/dev/notify`, `/dev/mock-invoices`, `/dev/provider-status` | `app_owner` |
| `owner.` | `POST /api/owner/auth/login` · `/auth/totp/{enrol,verify}`, `/auth/logout` · `GET /auth/me` | public · `owner_aal1` |
| `owner.` | reads: `/overview`, `/gerai/{summary,applications,applications/:id,directory,:slug}`, `/tarif/{gerai,gerai/:id,permintaan,permintaan.csv,kebijakan}`, `/pengawasan/{kiriman,antrean}`, `/sistem/{kesehatan,admin,profil-perusahaan}` | `owner_aal2` |
| `owner.` | changes + sensitive reads: approve/reject/status/masking/retry, `/tarif/*` edits, `/pengawasan/risiko` (+`risk_review`), `/sistem/{audit,admin/:id/risk-review,rotasi-kunci/:slug,profil-perusahaan}`, `/audit`, `/admins*` | `owner_recent` (TOTP ≤ 15 min) + reason + audit |
| `owner.` | `POST /internal/ops/do-migrate`, `POST /internal/ops/bootstrap-admin`; local-only `GET /internal/dev/last-mail`, `GET /internal/dev/preview` (also on `app.`) | Bearer / query `OPS_TOKEN` |
| `app.` / `owner.` | `GET /*` (not `/api`, `/webhooks`, `/internal`, `/mcp`) | SPA shell + hashed assets |

SPA routes — app: `/`, `/masuk`, `/daftar-akun`, `/daftar`, `/daftar/status`, `/lupa-sandi`, `/atur-sandi/:token`,
`/undangan/:token`, `/notifikasi`, `/kasir{,/multi,/cek-cepat,/cek-resi,/shift}`, `/kiriman{,/:slug,/massal,/massal/:batch,/cetak-massal}`,
`/kontak/{pengirim,penerima}`, `/pengaturan{,/profil,/data-usaha,/ekspedisi,/printer,/label-privasi,/packing,/anggota,/mengantar}`,
`/kiriman/pickup/:batch`, `/keuangan`, `/akun`, `/bantuan`; owner: `/`, `/masuk`, `/totp`, `/gerai`,
`/gerai/pengajuan/:id`, `/gerai/:slug`, `/tarif`, `/tarif/:tenantId`, `/pengawasan`, `/sistem`.
Cron `*/5`: email dispatch, operator checks/alerts, discount verifier, finance fan-out every 15 min; `0 19 * * *` (02:00 WIB): finance pending rescan; `0 * * * *`: revoke rotated webhook routes.
Queues: `gx-mengantar-webhooks`, `gx-bulk` (row check + serialized dispatch) and `gx-mengantar-finance-sync` (per-tenant sync) consumed; others declared, consumers ack (their tasks).

## 5. Scripts

| Command | Does |
|---|---|
| `pnpm check` | typecheck → eslint → unit → build both SPAs → Workers tests → bundle audit |
| `pnpm gate <TASK-x99>` | milestone integrated run, fail-fast, every gate recorded in `delivery-ledger` |
| `pnpm e2e` | Playwright 390/768/1280 on a fresh local state (per-test client IP) |
| `pnpm dev` / `pnpm db:migrate:local` | local Worker + SPAs / apply D1 control migrations (`.wrangler/state-dev`) |
| `node scripts/dev/seed-preview.mjs <port>` | local synthetic owner + application + Super Admin for rendering gates |
| `pnpm do:migrate --env <env> [--dry-run]` | migrate every tenant object, stop at first failure |
| `pnpm probes --env <env> [--force-fail <probe>] [--alert-dry-run]` | `OBSERVABILITY.md` probes + owner alert |
| `pnpm ci:red-fixtures` | prove broken test / `.map` / secret literal / unprotected route each fail their gate |
| `pnpm email:deliverability` | read-only SPF/DKIM/DMARC + received-header checks (TASK-112) |
| `pnpm security:bundle-audit` | `*.map`, source-map comments, secret-shaped literals, client secret names |
