# Tasks — GeraiExpress v2 (`geraiexpress-cfv2`)

Updated: 2026-11-15

Open and in-progress tasks only, newest milestone first. Finished contracts move to `docs/archive/TASKS-<date>.md`
and leave one index line. Hard limit 50 KB (`~/.config/ai/policies/planning-artifacts.md`).

**Gate:** no `TASK-1xx` starts until `STATUS.md` records (a) the owner's M0 sign-off **and** (b) an APPROVE from the
independent review of the current M0 documents (TASK-006). Both are recorded (2026-11-15).

Every task: one primary requirement (`PR-*` from `PRD.md`) or accepted decision (`DEC-*`), risk class, explicit
paths, runnable `Done when`. Tenant-owned data always carries the tenant constraint: tenant resolved server-side
from membership; tenant in every cache/queue/storage/rate-limit key; a negative test (tenant A gets not-found on
tenant B's record).

---

## Done

- M0 tasks TASK-001..006 (prototype, period filter, gates, visual pick, sign-off, independent review): all DONE by
  2026-11-15 → `docs/archive/TASKS-M0-2026-11-15.md`.

## In progress

M1 CLOSED 2026-11-16: TASK-101..108, 110, 111, 199 DONE; TASK-109, 112 code/tooling done (live steps awaiting owner) — see STATUS.md. M2 CLOSED 2026-11-16: TASK-201..208, 299 DONE (live sandbox steps awaiting owner). In progress: M3 — TASK-301..304 DONE; TASK-305 next.

## Pending

### Plan conventions

- **Vertical ownership:** each feature task owns its tables (tenant or control migrations in its own files under
  `packages/db/migrations/{control,tenant}/<task-id>-*.sql`), backend, UI, tests and telemetry for its surface.
- **Shared files** (`wrangler.jsonc`, `apps/*/src/router.*`, `packages/db/src/schema/index.ts`, root `package.json`)
  are edited only by the task that owns the change and are merged by the integrating session (`docs/WORKFLOW.md` §7);
  parallel writers never share a worktree.
- **Every task's Done when** also includes: `pnpm check` green; for UI, `dotuiux check --surface admin` and
  `admin-geometry.mjs` 0 fail at 390/1366, plus Playwright at the milestone matrix 390/768/1280 (ROADMAP);
  for new signals, the `OBSERVABILITY.md` row emitted and redaction-tested (TASK-110 helpers).
- **Milestone close tasks** (`TASK-x99`) run the integrated gate (`docs/WORKFLOW.md` §5) and are the only way the next
  milestone's tasks start.

### M1 — Monorepo, auth, D1 control plane, `GeraiVaultDO` store, CI, observability base (highest boundary R4)

### TASK-101: Scaffold the full workspace
- **Requirement:** ADR-0001, DEC-201, DEC-217
- **Risk Level:** R2
- **Job:** implementation
- **Capability:** `wrangler`, `workers-best-practices`, `shadcn-ui`, `native-first`
- **Allowed Paths:** `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig*.json`, `.gitignore`,
  `.dev.vars.example`, `wrangler.jsonc` (all bindings of spec 07 §3, `env.staging` stub), `vitest.workspace.ts`,
  `playwright.config.ts`, `eslint.config.*`, `apps/worker/**`, `apps/web-app/**` (Vite + React 19 + router + shadcn
  init with the comfort primitives), `apps/web-owner/**` (same), `packages/{domain,db,mengantar-sdk,thermal-print}/**`
  (empty packages)
- **Protected Paths:** `docs/**`, root contract files
- **Depends On:** TASK-003, TASK-006
- **Accepted Invariants:** layout of ARCHITECTURE §5; no Next.js/OpenNext; `sourcemap: false` for production builds;
  Indonesian UI strings, English code.
- **Visual Contract:** shells only (empty layout, comfort primitives, Direction A tokens from `DESIGN.md`); no screens.
- **Done when:** `pnpm install --frozen-lockfile && pnpm check` passes on a clean clone; `wrangler dev` answers `200
  {"ok":true}` on `/healthz` for all five `.localhost` hosts; both SPAs build and serve their shells via `ASSETS`.

### TASK-102: Host classifier
- **Requirement:** ADR-0002, DEC-202, spec 11 §3
- **Risk Level:** R4
- **Job:** implementation
- **Capability:** `cloudflare-for-saas`, `application-security`, `workers-best-practices`
- **Allowed Paths:** `apps/worker/src/host/**`, `apps/worker/test/host/**`, `packages/db/migrations/control/102-*`
- **Depends On:** TASK-101
- **Accepted Invariants:** five contexts (ARCHITECTURE §3); DCV paths pass through; normalised Host; D1
  `tenant_hostnames` lookup (≤ 30 s isolate cache); unknown/pending → neutral 404, suspended → 403, recovery → 503;
  `relay.` never served.
- **Done when:** worker tests for every context, normalisation (case, port, trailing dot, IP literal, ignored
  `X-Forwarded-Host`), state outcomes and cross-context 404s; a mutation that weakens the classifier fails a test;
  independent R4 review archived.

### TASK-103: Storage foundation (D1 control plane + `GeraiVaultDO` store, migrations, outbox)
- **Requirement:** ADR-0006, DEC-228, spec 01 §0
- **Risk Level:** R4
- **Job:** migration
- **Capability:** `durable-objects`, `postgres-drizzle` (patterns for SQLite)
- **Allowed Paths:** `packages/db/**` (framework + `000-*` baseline migrations), `apps/worker/src/do/gerai-vault/core/**`,
  `apps/worker/src/outbox/**`, `scripts/do-migrate/**`, matching tests
- **Depends On:** TASK-101
- **Accepted Invariants:** two migration tracks; explicit `migrate(version)` RPC; baseline tables: `tenants`,
  `tenant_members`, `tenant_schema_versions`, `audit_logs` (both scopes), `tenant_settings`, `tenant_outlets`,
  `tenant_business_profiles`, D1 `shipment_index` (schema only); generic DO→D1 outbox doing **versioned absolute upserts** with alarm retry;
  `pnpm do:migrate --env` walks tenants in batches and stops on the first failure (`recovery`).
- **Done when:** two tenant objects migrate and stay isolated; N−1 → N upgrade without data loss; a failing tenant
  migration leaves the others serving and that tenant in `recovery`; outbox lost-ack retry leaves D1 unchanged;
  `do:migrate` dry run on local.

### TASK-104: Email outbox and mailer (all templates)
- **Requirement:** DEC-227, spec 12
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `cloudflare-email-service`, `application-security`
- **Allowed Paths:** `apps/worker/src/email/**`, `packages/db/migrations/control/104-*`, matching tests
- **Depends On:** TASK-103
- **Accepted Invariants:** one `sendMail`; `email_outbox` with `payload_encrypted` nulled on sent/terminal/expiry;
  retries 30 s / 2 min / 5 min, max 4, never after `expires_at`; suppression terminal; six templates with `text` +
  `html` in Indonesian; no OTP in production logs.
- **Done when:** fake-clock tests for backoff, max attempts, expiry suppression, crash between insert and send,
  bounce/suppressed terminal; snapshot of all six templates; simulated binding output asserted.

### TASK-105: Accounts — sign-up, login, sessions, password reset, invitations (backend + screens)
- **Requirement:** PR-01, DEC-209, spec 05 §2
- **Risk Level:** R4
- **Job:** implementation
- **Capability:** `application-security`, `shadcn-ui`, `ui-validation`
- **Allowed Paths:** `apps/worker/src/auth/**`, `packages/db/migrations/control/105-*`,
  `apps/web-app/src/routes/{masuk,daftar-akun,lupa-sandi,atur-sandi,undangan}/**`, matching tests
- **Depends On:** TASK-102, TASK-104
- **Accepted Invariants:** PBKDF2-SHA256 100k + salt + pepper; `__Host-` cookies per host, 7-day rolling (app);
  Origin/CSRF on unsafe requests; OTP 10 min, 5 wrong → 15 min lock, send limits; invitation single-use 7 days;
  password reset revokes other sessions; `security_alert` mail on new-device login.
- **Visual Contract:** `/masuk`, `/lupa-sandi`, `/atur-sandi/:token`, `/undangan/:token` per visual 07 (centered 440 px
  card, no sidebar); error, locked and expired states.
- **Done when:** worker tests for each lifecycle incl. lock, expiry and replay; cookie set/send/delete test on both
  hosts; Playwright: email OTP account creation, login, reset, invitation acceptance; independent R4 review.

### TASK-106: Super Admin auth — TOTP, recency, admin access
- **Requirement:** DEC-209, spec 05 §1–2
- **Risk Level:** R4
- **Job:** implementation
- **Capability:** `application-security`, `admin-product-ux`
- **Allowed Paths:** `apps/worker/src/auth/totp/**`, `apps/web-owner/src/routes/{masuk,totp}/**`, matching tests
- **Depends On:** TASK-105
- **Accepted Invariants:** TOTP secret encrypted; `aal2` only on `owner.`; 12 h session; re-TOTP after 15 min on
  sensitive **reads and mutations**; admin enrolment/recovery by another Super Admin with audit; no route lets a
  Super Admin create, pay or impersonate.
- **Visual Contract:** owner login + TOTP challenge screens; enrolment QR shown once.
- **Done when:** tests for `aal2` gating, recency on a sensitive read and a mutation, recovery audit, and the
  non-impersonation route scan.

### TASK-107: Pure money, weight and volumetric math
- **Requirement:** PR-05, DEC-215, spec 02
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `testing-engineering`
- **Allowed Paths:** `packages/domain/src/{money,weight}/**`, matching tests
- **Depends On:** TASK-101
- **Accepted Invariants:** integers only; `billed_kg` rules; COD applied once; `NULL` insurance stays `NULL`;
  unit-mistake guard (`< 10` gram, `>= 100` kg).
- **Done when:** every worked example of spec 02 and visual 05 exact; property test (no non-integer `_idr`); five
  `cod_fee_mode` rows incl. `seller credit − sender payable = P − N`; not-yet-applied fixture `assigned 2500 bps` → `M = 9000`, effective `2000`, `N = 9600`; insured
  Non-COD `Laba Kas` (`I = 1000` → `5400`); fixed-point `COD_FEE_UNSTABLE`; all-in guard; `9599` regression.

### TASK-108: `INV` slug allocator
- **Requirement:** PR-04, DEC-211
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `durable-objects`
- **Allowed Paths:** `packages/domain/src/slug/**`, `apps/worker/src/do/gerai-vault/slug/**`, matching tests
- **Depends On:** TASK-103
- **Accepted Invariants:** 7 chars CSPRNG, Crockford without `0/O/1/I/L/U`, unique per tenant, case-insensitive.
- **Done when:** alphabet/length tests; 10,000 slugs in one tenant → 0 duplicates; same slug allowed in two tenants.

### TASK-109: CI, security gates and staging deploy
- **Requirement:** DEC-210, spec 05 §4, spec 07 §6
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `github-actions`, `application-security`, `wrangler`
- **Allowed Paths:** `.github/workflows/**`, `scripts/ci/**`, `wrangler.jsonc` (`env.staging` values)
- **Depends On:** TASK-101, TASK-110
- **Accepted Invariants:** actions pinned by SHA; `contents: read`; no secrets on fork PRs; fail closed on (1) any
  `*.map` in `dist/`, (2) secret/key-shaped literals in bundles, (3) any `/api/app/*` or `/api/owner/*` route without
  auth + projection middleware (route-table scan); staging deploy waits for the protected `staging` environment
  approval every run; production deploy manual only.
- **Done when:** hosted `ci.yml` run green (link in `STATUS.md`); four fixtures turn it red: a broken unit test, an
  emitted `.map`, an injected secret literal, an unprotected route; first staging deploy approved by the owner, immediately followed by `pnpm probes --env
  staging` green and one synthetic failing probe delivering an owner alert (evidence in `BUILD-LOG.md`).

### TASK-110: Observability base (pre-deploy)
- **Requirement:** `OBSERVABILITY.md`, `observability-engineering`
- **Risk Level:** R2
- **Job:** implementation
- **Capability:** `observability-engineering`, `workers-best-practices`
- **Allowed Paths:** `packages/telemetry/**`, `apps/worker/src/telemetry/**`, `scripts/probes/**`, matching tests
- **Depends On:** TASK-101
- **Accepted Invariants:** structured events with bounded labels; Public API anomaly signals of spec 10 §4.4; redaction of keys, cookies, OTPs, tokens, raw
  bodies, phones; probes of `OBSERVABILITY.md` runnable as `pnpm probes --env`; alert delivery to the owner channel
  (Cloudflare notifications or a scheduled checker) configured per environment.
- **Done when:** redaction tests; `pnpm probes --env local` green against `wrangler dev`; the alert channel configured
  for staging and a dry-run alert received (post-deploy verification is part of TASK-109).

### TASK-111: Host and tenant isolation suite (M1 surfaces)
- **Requirement:** spec 11 §8, ADR-0002, ADR-0006
- **Risk Level:** R4
- **Job:** implementation
- **Capability:** `application-security`, `testing-engineering`
- **Allowed Paths:** `apps/worker/test/isolation/**`
- **Depends On:** TASK-102, TASK-103, TASK-105, TASK-106
- **Accepted Invariants:** tenant only from verified host + session; KV never used for host → tenant.
- **Done when:** for two seeded tenants and the platform hosts: sessions/cookies, owner vs app, tenant object RPC,
  D1 tenant rows, mini-site host lookup — refused across tenants; suspended → 403 within 30 s; a mutation dropping one
  tenant check fails the suite. Later surfaces extend this suite in their own tasks (API keys 503, webhooks 204,
  `/lacak` 501, media 302).

### TASK-112: Email deliverability gate
- **Requirement:** DEC-227, spec 12 §6
- **Risk Level:** R2
- **Job:** verification (owner approves the sending-domain DNS change)
- **Capability:** `cloudflare-email-service`
- **Allowed Paths:** `BUILD-LOG.md`, `STATUS.md`
- **Depends On:** TASK-104, TASK-105, TASK-109
- **Accepted Invariants:** one provider; transactional only.
- **Done when:** `BUILD-LOG.md` records SPF/DKIM/DMARC pass, inbox at Gmail/Outlook.com/Yahoo (two sends each of
  `signup_otp` and `password_reset`), delivery < 60 s, tester score ≥ 9/10. Production signup stays closed until then.

### TASK-199: M1 close
- **Requirement:** ROADMAP M1 exit gate
- **Risk Level:** R4 (highest boundary in M1)
- **Job:** release
- **Capability:** `testing-engineering`
- **Allowed Paths:** `STATUS.md`, `BUILD-LOG.md`, `.delivery/**` (via `delivery-ledger` only)
- **Depends On:** TASK-101..112
- **Accepted Invariants:** gates sequential and fail-fast; evidence immutable.
- **Done when:** integrated run PASS (typecheck, unit, worker, migrations, isolation, e2e, security gates) recorded by
  `delivery-ledger`; `delivery-ledger verify` exit 0.

### M2 — Mengantar onboarding, webhooks, courier rules, discounts, Super Admin console

### TASK-201: `mengantar-sdk` Public API client
- **Requirement:** DEC-204, DEC-210, ARCHITECTURE §4.1
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `mengantar-api`, `workers-best-practices`
- **Allowed Paths:** `packages/mengantar-sdk/src/public/**`, matching tests
- **Depends On:** TASK-199
- **Accepted Invariants:** `{API_KEY}` masked everywhere; `AbortSignal.timeout`; Zod parsing; unknown fields kept raw.
- **Done when:** recorded-fixture tests (estimate, create paid/unpaid/error, `GET /order` history, `/invoices`,
  `pay-unpaid`, `DELETE /order`); a 4xx/5xx message never contains the key.

### TASK-202: Partner transport (`direct`/`relay`) and `PartnerQuotaDO`
- **Requirement:** DEC-204, DEC-219, ADR-0003, spec 10 §4.1, §4.3
- **Risk Level:** R4
- **Job:** implementation
- **Capability:** `mengantar-api`, `durable-objects`, `application-security`
- **Allowed Paths:** `packages/mengantar-sdk/src/partner/**`, `apps/worker/src/do/partner-quota/**`, `infra/partner-relay/**`, matching tests
- **Depends On:** TASK-201
- **Accepted Invariants:** exact-byte signing; 60/min and 1000/day; relay HMAC + `X-Relay-Id` + path allowlist;
  `api-key/regenerate` never auto-retried.
- **Done when:** digest parity with the documented example; quota tests at limits; relay program unit tests (HMAC,
  allowlist, 120 s duplicate guard) and a local stub run; `409 relay_duplicate` → `maybe_sent`; R4 review.

### TASK-203: Super Admin console shell, Gerai directory and outlet approval
- **Requirement:** PR-02, PR-03 (activation), DEC-203, DEC-209, spec 06 §Super Admin
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `admin-product-ux`, `admin-dashboard`, `shadcn-ui`
- **Allowed Paths:** `apps/web-owner/src/{shell,routes/gerai}/**`, `apps/web-app/src/routes/daftar/**`,
  `apps/worker/src/{onboarding,admin/gerai}/**`, `packages/db/migrations/{control,tenant}/203-*`, matching tests
- **Depends On:** TASK-202, TASK-106
- **Accepted Invariants:** 5 Super Admin menus; approval needs recent TOTP + reason and activates `<slug>.gerai.cc`;
  `registration_unknown` resolved by read-back; BYOK fallback; seller key encrypted in the tenant object; suspend/
  unsuspend bumps `routing_version`; masking kill-switch and `masking_daily_quota` editable with TOTP + reason; approve **and** reject insert
  an `application_status` email into the outbox in the same transaction as the state change.
- **Visual Contract:** owner shell + `/gerai` tabs, `/gerai/pengajuan/:id`, `/gerai/:slug` per visual 07; `/daftar`
  steps 1/5; states loading/empty/error/success.
- **Done when:** sandbox apply → approve → seller → key stored → `connected`; register timeout → read-back; suspend →
  403 on the mini-site within 30 s; audit rows for every mutation; approve and reject each enqueue exactly one `application_status`
  email (a mailer retry never repeats the transition).

### TASK-204: Webhooks, inbox, status combine and polling floor
- **Requirement:** PR-02b, spec 01 §2.7, §3
- **Risk Level:** R4
- **Job:** implementation
- **Capability:** `mengantar-api`, `durable-objects`, `testing-engineering`
- **Allowed Paths:** `apps/worker/src/webhooks/**`, `apps/worker/src/do/gerai-vault/status/**`,
  `apps/web-app/src/routes/pengaturan/mengantar/**`, `packages/db/migrations/{control,tenant}/204-*`, matching tests
- **Depends On:** TASK-201, TASK-203
- **Accepted Invariants:** token hash → tenant; verify in the object; inbox before ack; provider/custody combine;
  hourly polling while not `active`; alarm re-enqueue; 30-day retention; every effective-status change
  republishes `shipment_index` (versioned).
- **Visual Contract:** `/pengaturan/mengantar` (copy URL, paste secret, status chip) per visual 08 §2.
- **Done when:** spec 01 §2.7 and §3 test lists pass (incl. permutation property test); isolation suite extended
  with cross-tenant webhook tokens; R4 review.

### TASK-205: Seller key rotation
- **Requirement:** ADR-0004 §5, spec 10 §4.3
- **Risk Level:** R4
- **Job:** implementation
- **Capability:** `durable-objects`, `mengantar-api`
- **Allowed Paths:** `apps/worker/src/do/gerai-vault/credentials/**`, matching tests
- **Depends On:** TASK-202, TASK-204
- **Accepted Invariants:** `key_version` fence incremented before `regenerate`; new key + callback secret stored
  atomically; lost response → pause dispatch, read current key, never regenerate again; webhook route rotation 24 h.
- **Done when:** crash/timeout tests at each step; in-flight dispatch with the old version is rejected; R4 review.

### TASK-206: Courier catalog, `Ekspedisi Aktif`, area search
- **Requirement:** DEC-213, DEC-223, spec 06
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `shadcn-ui`, `ui-validation`
- **Allowed Paths:** `apps/worker/src/couriers/**`, `apps/web-app/src/routes/pengaturan/ekspedisi/**`,
  `packages/db/migrations/{control,tenant}/206-*`, matching tests
- **Depends On:** TASK-201
- **Accepted Invariants:** KV only caches area search; pickup mode per courier; instant save + toast.
- **Visual Contract:** settings item page, full-row toggles (`touch-target-toggle`).
- **Done when:** catalog/prefs tests; cache hit/miss test.

### TASK-207: Discount and cashback matrix (`Tarif & Kurir`)
- **Requirement:** PR-11, DEC-205, DEC-226, DEC-230, DEC-233, spec 02 §2.1
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `admin-product-ux`, `shadcn-ui`
- **Allowed Paths:** `apps/worker/src/pricing/rules/**`, `apps/web-owner/src/routes/tarif/**`,
  `packages/db/migrations/{control,tenant}/207-*`, matching tests
- **Depends On:** TASK-107, TASK-201 (estimate client returns `discountPercent`), TASK-203
- **Accepted Invariants:** `min_discount_bps <= assigned_bps <= max_discount_bps` per courier (`courier_discount_policy`,
  platform fallback; defaults 2000 … 3000);
  approval seeds every courier/service at `default_discount_bps` (2000) with `Belum diterapkan`;
  `apply_channel` `mengantar_team` (request list) with `partner_api` adapter slot; verification state `Belum diterapkan /
  Sesuai / Selisih` from `observed_bps` per service class (regular `discountPercent`, cargo `cargoDiscount /
  cargoPrice`; tolerance 1 bp, spec 02 §2.1); customers always pay the publish tariff;
  TOTP + reason + audit; effective timestamps; `Selisih tarif` is info.
- **Visual Contract:** `/tarif` tabs incl. `Kebijakan Diskon` per visual 07; request list for the Mengantar team (export).
- **Done when:** rule below 20 % or above the ceiling rejected; fake-clock test of the checks at +15/+60/+120 min
  (`Belum diterapkan` → `Sesuai`, or → `Selisih` + alert after 2 × `apply_sla_minutes`); a newly approved gerai has 20 % rules for every active
  courier/service in state `Belum diterapkan`; every transition of the spec 02 §2.1 state table incl. `2000` vs
  `1999` → `Sesuai` and a verified rule drifting to `1000` → `Selisih`; a cargo fixture whose regular and cargo discounts
  differ verifies against the cargo value; changing a courier's default/min/max needs no code change (test); two couriers with different bands (test);
  verification state transitions on fixture estimates; no customer-facing DTO contains discount fields (test); audit
  per change; cashback ledger states unit-tested.

### TASK-208: Super Admin `Ringkasan`, `Pengawasan`, `Sistem & Audit`
- **Requirement:** DEC-209, DEC-218 (platform legal editor), spec 06 §Super Admin, spec 01 §2.6
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `admin-dashboard`, `application-security`
- **Allowed Paths:** `apps/web-owner/src/routes/{index,pengawasan,sistem}/**`, `apps/worker/src/admin/{overview,monitor,audit,legal}/**`,
  `packages/db/migrations/control/208-*`, matching tests
- **Depends On:** TASK-203, TASK-204
- **Accepted Invariants:** read-only cross-tenant views except the `Rotasi Kunci Seller` action (TOTP + reason,
  calls the TASK-205 primitive, spec 10 §4.4); risk search by hashed phone with `risk_review` + recent TOTP
  + audit on the **read**; audit log viewer; platform legal profile editor (NULL until filled); relay/sync health.
- **Visual Contract:** per visual 07 Super Admin rows; no create/pay actions anywhere.
- **Done when:** rotation action test (TOTP + audit, uses the fence); audited-read tests; non-impersonation scan; legal profile NULL vs filled rendering.

### TASK-299: M2 close
- **Requirement:** ROADMAP M2 exit gate
- **Risk Level:** R4
- **Job:** release
- **Capability:** `testing-engineering`
- **Allowed Paths:** `STATUS.md`, `BUILD-LOG.md`, `.delivery/**` (via `delivery-ledger`)
- **Depends On:** TASK-201..208
- **Accepted Invariants:** sandbox only; no production Partner call.
- **Done when:** integrated run PASS incl. sandbox onboarding end-to-end; zero raw key URLs in logs (test).

### M3 — Counter POS, printing, contacts, shift, dashboard, settings

### TASK-301: Web app shell, navigation, notifications, role projection
- **Requirement:** DEC-213, DEC-222, DEC-225, DEC-209, visual 07 §1
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `shadcn-ui`, `admin-dashboard`, `ui-validation`
- **Allowed Paths:** `apps/web-app/src/{shell,components/ui,routes/notifikasi}/**`, `apps/worker/src/{dto,notifications}/**`,
  `packages/db/migrations/tenant/301-*`, matching tests
- **Depends On:** TASK-299
- **Accepted Invariants:** 6 menus (Keuangan owner only); bottom bar on phones; comfort sizes; light only; zoom never
  locked; Kasir DTOs never contain cost/margin/balance; notification read state per user.
- **Visual Contract:** Direction A, C1–C6; loading/empty/error states for every screen; `/notifikasi` grouped by day.
- **Done when:** DTO projection test per role; notification read-state test; gates 0 fail.

### TASK-302: Contacts, WA verification, risk badge, media uploads
- **Requirement:** PR-14, PR-15 (verification), DEC-212
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `shadcn-ui`, `ui-validation`
- **Allowed Paths:** `apps/worker/src/do/gerai-vault/contacts/**`, `apps/worker/src/media/**`, `apps/web-app/src/routes/kontak/**`,
  `packages/db/migrations/tenant/302-*`, matching tests
- **Depends On:** TASK-301
- **Accepted Invariants:** phone `08…`; `wa_verified_at` only by an operator; R2 keys `t/<tenant_id>/…` with signed
  short-lived URLs; risk badge from own counts, risk index pushed by outbox.
- **Visual Contract:** list pages C3; deposit column owner only.
- **Done when:** contact tests; media cross-tenant denial added to the isolation suite; risk upsert lost-ack test.

### TASK-303: Quote engine, courier cards and `Cek Ongkir Cepat`
- **Requirement:** PR-06, PR-09 (quick check), DEC-225, spec 02 §3.3
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `mengantar-api`, `testing-engineering`
- **Allowed Paths:** `apps/worker/src/pricing/quote/**`, `apps/web-app/src/routes/kasir/{baru,cek-cepat}/**`,
  `packages/db/migrations/tenant/303-*`, matching tests
- **Depends On:** TASK-107, TASK-201, TASK-207, TASK-301
- **Accepted Invariants:** each quote records `observed_bps` per service class (regular `discountPercent`, cargo
  `cargoDiscount / cargoPrice`) for the TASK-207 verifier; per-tenant quote rate limit (spec 10 §4.4);
  fixed-point `codFee`; frozen quote (`F`, `N`, `C`); cargo ≥ 5,000 g, Non-COD only; Kasir
  sees customer price only; quick check allocates no slug or draft.
- **Visual Contract:** courier cards per visual 05; owner `👁` margin toggle; per-card loading/error.
- **Done when:** five-mode fixture tests incl. unstable fee; quick-check non-allocation test; per-tenant quote
  rate-limit test; `observed_bps` recorded per service class (regular and cargo fixtures).

### TASK-304: POS checkout, payment record, dispatch, cancellation
- **Requirement:** PR-04, PR-05, PR-07, DEC-208, DEC-220, ADR-0004
- **Risk Level:** R4
- **Job:** implementation
- **Capability:** `durable-objects`, `mengantar-api`, `ui-validation`
- **Allowed Paths:** `apps/worker/src/do/gerai-vault/{dispatch,payment,cancel}/**`, `apps/web-app/src/routes/kiriman/[slug]/**`,
  `packages/db/migrations/tenant/304-*`, matching tests
- **Depends On:** TASK-108, TASK-204, TASK-303
- **Accepted Invariants:** per-tenant issue and cancel rate limits (spec 10 §4.4); journal → call → record; unknown → `reconciliation_needed` read-back; unpaid → `provider_unpaid_hold`
  with the shared `payUnpaid(batch_id)` primitive; label printable only with AWB; cancel before pickup = `DELETE /order`
  then read-back, payment void first; counter payment state machine spec 03 §1.1; every shipment create and status change publishes the
  D1 `shipment_index` row through the outbox (versioned absolute upsert).
- **Visual Contract:** POS C4, sticky checkout bar on phones, one primary `Tandai Lunas & Cetak`; pending states.
- **Done when:** double submit → one order; timeout → read-back; unpaid → `payUnpaid` after top-up (fixture);
  cancel unknown outcome → read-back; `shipment_index` lost-ack, restart and stale-version
  tests against the real projection; scripted checkout < 45 s; rate-limit tests for issue and cancel; R4 review.

### TASK-305: Masking presets, quota, reveal audit
- **Requirement:** PR-15, DEC-206, DEC-231, ADR-0005, spec 05
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `application-security`, `ui-validation`
- **Allowed Paths:** `apps/worker/src/do/gerai-vault/masking/**`, `apps/web-app/src/components/masking/**`,
  `apps/web-app/src/routes/pengaturan/label-privasi/**`,
  `packages/db/migrations/tenant/305-*`, matching tests
- **Depends On:** TASK-302, TASK-304
- **Accepted Invariants:** masking offered only when the gerai enabled it in `Label & Privasi` and the Super Admin
  kill-switch is on; only enabled presets selectable, `Standar Gerai` always; pickup always the outlet; `422 MASKING_QUOTA_EXCEEDED`, never silent; reveal with reason +
  audit; not advertised before counsel review.
- **Visual Contract:** preset picker in POS step 3 (4 presets, preview of what prints); quota-exceeded and
  kill-switch-off states; `Lihat Pengirim Asli` reason dialog.
- **Done when:** settings tests (off → only `Standar Gerai`; enabled subset; default preset); quota and reveal tests;
  label snapshots per preset.

### TASK-306: Printing — 100 mm PDFs (PC-first), 58 mm ESC/POS, bulk print
- **Requirement:** PR-08, DEC-224, DEC-229, visual 04
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `native-first`, `ui-validation`
- **Allowed Paths:** `packages/thermal-print/**`, `apps/worker/src/labels/**`, `apps/web-app/src/{print,routes/kiriman/cetak-massal}/**`, matching tests
- **Depends On:** TASK-304
- **Accepted Invariants:** exact-size PDFs with ≥ 3 mm quiet zones; local barcode/QR; 58 mm = 32 columns;
  `print_count` + reprint reason; bulk ≤ 50.
- **Visual Contract:** print drawer, previews, `/kiriman/cetak-massal` per visual 07.
- **Done when:** PDF dimension tests; 32-col snapshots; printed sample scanned (photo in `BUILD-LOG.md`).

### TASK-307: Shift drawer and sender COD payout
- **Requirement:** PR-10, spec 03 §1.2, §4
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `durable-objects`
- **Allowed Paths:** `apps/worker/src/do/gerai-vault/shift/**`, `apps/web-app/src/routes/kasir/shift/**`,
  `packages/db/migrations/tenant/307-*`, matching tests
- **Depends On:** TASK-304
- **Accepted Invariants:** `expected_cash = float + Σ tunai in − Σ tunai out`; every `tunai` payout in an open shift;
  variance reason code.
- **Visual Contract:** `/kasir/shift` per visual 07.
- **Done when:** cross-shift payment, payout, void and variance tests; e2e open/close.

### TASK-308: Paket Massal, Riwayat Massal, Cek Resi
- **Requirement:** PR-09, DEC-229, spec 03 §1.3–1.4
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `native-first`, `testing-engineering`, `ui-validation`
- **Allowed Paths:** `apps/worker/src/bulk/**`, `apps/web-app/src/routes/{kasir/multi,kasir/cek-resi,kiriman/massal}/**`,
  `packages/db/migrations/tenant/308-*`, matching tests
- **Depends On:** TASK-304, TASK-306
- **Accepted Invariants:** ≤ 200 rows; ambiguous area → `Perlu Diperbaiki`; queued serialized dispatch; atomic batch
  payment; `.xlsx` only after an ADR.
- **Visual Contract:** tabs `Siap`/`Perlu Diperbaiki` with inline edit; batch detail; Cek Resi timeline.
- **Done when:** CSV fixture with good and bad rows; batch payment atomicity; foreign AWB message.

### TASK-309: Owner dashboard, Kasir home, period filter
- **Requirement:** PR-18, DEC-221, visual 08 §1
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `admin-dashboard`, `ui-validation`
- **Allowed Paths:** `apps/web-app/src/{routes/index,components/period-filter}/**`, `apps/worker/src/analytics/**`, matching tests
- **Depends On:** TASK-304
- **Accepted Invariants:** WIB presets, default 7 days, max 180, URL state; Estimasi Laba and Laba Kas separate; Kasir
  home without money totals; daily stats pushed by outbox.
- **Visual Contract:** C5 dashboard; phone bottom sheet.
- **Done when:** period resolution tests; gates 0 fail.

### TASK-310: Settings pages, account page, help
- **Requirement:** DEC-223, DEC-218 (tenant forms), DEC-229 (Akun Saya, Bantuan)
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `shadcn-ui`, `application-security`, `ui-validation`
- **Allowed Paths:** `apps/web-app/src/routes/pengaturan/{index,profil,data-usaha,printer,packing,anggota}/**`,
  `apps/web-app/src/routes/{akun,bantuan}/**`, `apps/worker/src/do/gerai-vault/settings/**`,
  `apps/worker/src/auth/account/**`, matching tests (excludes `ekspedisi` 206, `mengantar` 204, `label-privasi` 305, `mini-site` 505, `api-mcp` 503)
- **Depends On:** TASK-301, TASK-105
- **Accepted Invariants:** sub-menu, sticky save bar only when dirty; Kasir sees only `printer`; NPWP encrypted;
  member invite/revoke; email change by OTP; session list with revoke.
- **Visual Contract:** visual 08 §2 (desktop left menu, phone grouped list).
- **Done when:** Kasir 403 tests; email-change OTP and session-revoke tests; NPWP never returned in plain text.

### TASK-311: `Kiriman` list, tabs, search and export
- **Requirement:** DEC-213, DEC-220, spec 06 menu 3, visual 07 `/kiriman`
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `admin-dashboard`, `shadcn-ui`, `ui-validation`
- **Allowed Paths:** `apps/web-app/src/routes/kiriman/index/**`, `apps/worker/src/do/gerai-vault/listing/**`, matching tests
- **Depends On:** TASK-304
- **Accepted Invariants:** tabs `Semua · Belum Dibayar · Draf QR · Menunggu Saldo · Pickup & Manifest · Riwayat
  Massal · Kendala & Klaim · Meja Retur` with counts (each specialist tab's content stays with its task); search by
  INV/AWB/name/phone; period filter; `Tandai Lunas` row action; owner-only CSV export with cost/margin columns.
- **Visual Contract:** visual 06/07 Kiriman table → cards under 768 px; empty and filtered-empty states.
- **Done when:** two-tenant listing test; Kasir projection (no cost columns, export 403); payment-state tab and row
  action tests; CSV snapshot.

### TASK-399: M3 close
- **Requirement:** ROADMAP M3 exit gate
- **Risk Level:** R4
- **Job:** release
- **Capability:** `testing-engineering`, `ui-validation`
- **Allowed Paths:** `STATUS.md`, `BUILD-LOG.md`, `.delivery/**`
- **Depends On:** TASK-301..311; counsel answer before masking is advertised
- **Accepted Invariants:** viewport matrix 390/768/1280 for Playwright.
- **Done when:** integrated run PASS; DTO role-projection suite PASS; sub-45 s checkout evidence.

### M4 — Finance sync, recovery, pickup, returns, claims

### TASK-401: `/invoices` sync, dual book, Laba Kas
- **Requirement:** PR-12, DEC-216, spec 09
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `mengantar-api`, `durable-objects`
- **Allowed Paths:** `apps/worker/src/do/gerai-vault/finance/**`, `apps/worker/src/cron/finance/**`,
  `apps/web-app/src/routes/keuangan/**`, `packages/db/migrations/tenant/401-*`, matching tests
- **Depends On:** TASK-399
- **Accepted Invariants:** triggers: 15-min Cron, +60 s after mutations, manual (1 per 30 s); ≤ 5 pages per run;
  daily pending rescan; unknown types → `Selisih Sync`; Laba Kas predicate spec 02 §3.5; `quote_drift` flagged.
- **Visual Contract:** `/keuangan` tabs (owner only); Estimasi Laba and Laba Kas side by side.
- **Done when:** fake-clock tests for each trigger and the rate limit; reconciliation fixtures over every observed
  type + unknown; running balance equals `balanceAmount`.

### TASK-402: Unpaid recovery and Saldo Aman
- **Requirement:** PR-13, spec 02 §4, spec 09 §3
- **Risk Level:** R4
- **Job:** implementation
- **Capability:** `mengantar-api`, `durable-objects`
- **Allowed Paths:** `apps/worker/src/do/gerai-vault/finance/recovery/**`, matching tests
- **Depends On:** TASK-401
- **Accepted Invariants:** finance-triggered `payUnpaid` (primitive from 304) after top-up sync; crash-safe; Kasir
  never sees the balance.
- **Done when:** crash between call and record; reserve math; R4 review.

### TASK-403: Pickup manifest and Surat Jalan
- **Requirement:** PR-16, spec 04 §1, spec 01 §2.4
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `ui-validation`
- **Allowed Paths:** `apps/worker/src/do/gerai-vault/pickup/**`, `apps/web-app/src/routes/kiriman/pickup/**`,
  `packages/db/migrations/tenant/403-*`, matching tests
- **Depends On:** TASK-399, TASK-306
- **Accepted Invariants:** wrong courier, `cancelled`, `provider_unpaid_hold` block; counter-unpaid warns; driver
  fields required; handover records custody.
- **Visual Contract:** scan mode (red + sound on block, amber on unpaid), driver form, signature.
- **Done when:** scan-guard tests; Surat Jalan PDF snapshot; e2e scan.

### TASK-404: Meja Retur and verified handback
- **Requirement:** PR-17, DEC-206, ADR-0005, spec 04 §2
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `application-security`
- **Allowed Paths:** `apps/worker/src/do/gerai-vault/returns/**`, `apps/web-app/src/routes/kiriman/retur/**`,
  `packages/db/migrations/tenant/404-*`, matching tests
- **Depends On:** TASK-399, TASK-204, TASK-403
- **Accepted Invariants:** intake and handback are custody stages; code hashed; reveal audited.
- **Visual Contract:** intake → photo → WA code → handback.
- **Done when:** custody tests incl. contradictions → `Status Bertentangan`; e2e intake → handback.

### TASK-405: Exceptions and claims
- **Requirement:** PR-20, spec 04 §3
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `testing-engineering`
- **Allowed Paths:** `apps/worker/src/do/gerai-vault/exceptions/**`, `apps/web-app/src/routes/kiriman/kendala/**`,
  `packages/db/migrations/tenant/405-*`, matching tests
- **Depends On:** TASK-204, TASK-401
- **Accepted Invariants:** five sub-filters; per-courier claim deadlines; stuck flag sweep.
- **Visual Contract:** `Kendala & Klaim` with countdown chips.
- **Done when:** classification and deadline tests.

### TASK-499: M4 close
- **Requirement:** ROADMAP M4 exit gate
- **Risk Level:** R4
- **Job:** release
- **Capability:** `testing-engineering`
- **Allowed Paths:** `STATUS.md`, `BUILD-LOG.md`, `.delivery/**`
- **Depends On:** TASK-401..405; M2/M4 sandbox verifications recorded (weight echo, `POST /time`, `/invoices` order, `pay-unpaid`)
- **Accepted Invariants:** sandbox only.
- **Done when:** integrated run PASS; deterministic reconciliation across all types.

### M5 — Mini-site, brand site, OpenAPI, MCP, custom domains (staging)

### TASK-501: Mini-site, QR pre-booking, private tracking
- **Requirement:** PR-03, PR-19, DEC-207, spec 05 §3, visual 03
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `seo-website-builder`, `application-security`, `ui-validation`
- **Allowed Paths:** `apps/worker/src/minisite/**`, matching tests
- **Depends On:** TASK-499
- **Accepted Invariants:** Turnstile on public quotes; 48 h drafts; `/lacak` initials + city until the phone gate;
  footer `Didukung jaringan resmi GeraiExpress` with NULL legal fields hidden.
- **Visual Contract:** visual 03 (mobile-first, 3 tabs); `design-taste` narrow + wide review.
- **Done when:** 0 PII on anonymous tracking; QR → counter opens the same INV; Lighthouse mobile ≥ 90 (performance,
  SEO, accessibility) recorded; `/lacak` added to the isolation suite.

### TASK-502: Brand site and POS sandbox
- **Requirement:** DEC-202, visual 03 §2
- **Risk Level:** R1
- **Job:** implementation
- **Capability:** `design-taste`, `seo-website-builder`, `ui-validation`
- **Allowed Paths:** `apps/worker/src/brand/**`, matching tests
- **Depends On:** TASK-501
- **Accepted Invariants:** no session cookies on the apex; legal footer from `platform_legal_profile`.
- **Visual Contract:** visual 03 §2; narrow + wide review.
- **Done when:** Lighthouse SEO ≥ 95 and valid `sitemap.xml`/`robots.txt`; legal footer renders NULL vs filled cases.

### TASK-503: OpenAPI `/api/v1` and API keys
- **Requirement:** PR-21, DEC-214, spec 08 §1–3
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `openapi-spec`, `application-security`
- **Allowed Paths:** `apps/worker/src/api-v1/**`, `apps/web-app/src/routes/pengaturan/api-mcp/**`,
  `packages/db/migrations/control/503-*`, matching tests
- **Depends On:** TASK-499, TASK-304, TASK-308
- **Accepted Invariants:** spec from Zod; Bearer only; payment mutations not exposed.
- **Visual Contract:** keys table, `Buat Kunci` shown once, revoke confirm.
- **Done when:** generated `openapi.json` validates; scope-denial tests; API keys added to the isolation suite.

### TASK-504: MCP servers
- **Requirement:** PR-21, DEC-214, spec 08 §4–5
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `application-security`
- **Allowed Paths:** `apps/worker/src/mcp/**`, matching tests
- **Depends On:** TASK-503
- **Accepted Invariants:** tool hints; prompt-injection defenses; daily cap on issuing tools.
- **Done when:** MCP inspector lists tools; scope and cap tests.

### TASK-505: Custom domains (staging)
- **Requirement:** DEC-228, spec 11 §5–8
- **Risk Level:** R4
- **Job:** implementation
- **Capability:** `cloudflare-for-saas`
- **Allowed Paths:** `apps/worker/src/hostnames/**`, `apps/worker/src/cron/hostnames/**`,
  `apps/web-app/src/routes/pengaturan/mini-site/**`, matching tests
- **Depends On:** TASK-111, TASK-501
- **Accepted Invariants:** create before CNAME; HMAC probe; status poll every 10 min; daily quota check (alert at
  80 %); issuance through a Queue (15/min); 7-day reaper; reserved labels.
- **Visual Contract:** `Domain Sendiri` page with DNS record, steps, `Periksa Lagi`, remedies.
- **Done when:** fake-clock tests for poll, reaper and quota alert; mocked Cloudflare API lifecycle; one real test
  domain on the team's staging zone (owner approval); R4 review.

### TASK-599: M5 close
- **Requirement:** ROADMAP M5 exit gate
- **Risk Level:** R4
- **Job:** release
- **Capability:** `testing-engineering`
- **Allowed Paths:** `STATUS.md`, `BUILD-LOG.md`, `.delivery/**`
- **Depends On:** TASK-501..505
- **Accepted Invariants:** full isolation matrix (spec 11 §8) now covers every surface.
- **Done when:** integrated run PASS; 0 `*.map`; full isolation suite PASS.

### M6 — Production readiness and pilot (owner approves every production action)

### TASK-601: Partner relay in production
- **Requirement:** DEC-219, DEC-232, spec 10 §3–6
- **Risk Level:** R4
- **Job:** release
- **Capability:** `vps-deploy`, `vultr`
- **Allowed Paths:** `infra/partner-relay/**` (deploy files), `BUILD-LOG.md`, `STATUS.md`
- **Depends On:** TASK-599
- **Accepted Invariants:** 4 Partner routes only; no Mengantar credential on the VPS; relay HMAC secrets
  (`RELAY_SECRET`, `RELAY_SECRET_PREVIOUS` during rotation) provisioned exactly as spec 10 §5.
- **Done when:** Vultr Reserved IPv4 attached (new small instance or existing server, owner approval); every spec 10
  §6 check recorded; Mengantar allowlist confirmed with that IP.

### TASK-602: Production zones, SaaS setup, monitoring
- **Requirement:** DEC-228, spec 11 §2, `OBSERVABILITY.md`
- **Risk Level:** R4
- **Job:** release
- **Capability:** `cloudflare-for-saas`, `wrangler`, `observability-engineering`
- **Allowed Paths:** `wrangler.jsonc` (production), `OBSERVABILITY.md`, `BUILD-LOG.md`
- **Depends On:** TASK-599
- **Accepted Invariants:** zone-scoped token; routes `*/*` + `cname.gerai.cc/*`; staging `*-stg.gerai.cc/*`.
- **Done when:** zone steps 1–6 recorded; all probes green in production; each alert of `OBSERVABILITY.md` fired once
  by a synthetic breach and received by the owner.

### TASK-603: Backups and restore drill
- **Requirement:** ADR-0006 §7
- **Risk Level:** R3
- **Job:** release
- **Capability:** `durable-objects`, `wrangler`
- **Allowed Paths:** `apps/worker/src/cron/backup/**`, `scripts/backup/**`, `BUILD-LOG.md`
- **Depends On:** TASK-602
- **Accepted Invariants:** daily per-object export to R2; D1 Time Travel; restore tested before trusted.
- **Done when:** fake-clock test of the daily export; restore of D1 + two objects into a scratch environment; RPO/RTO
  recorded.

### TASK-604: Live courier pilot and open registration
- **Requirement:** ROADMAP M6
- **Risk Level:** R4
- **Job:** release
- **Capability:** `mengantar-api`
- **Allowed Paths:** `RELEASE.md`, `BUILD-LOG.md`, `STATUS.md`
- **Depends On:** TASK-199, TASK-299, TASK-399, TASK-499, TASK-599, TASK-601, TASK-602, TASK-603, TASK-112
- **Accepted Invariants:** owner approval per production action; rollback ready.
- **Done when:** one real parcel per active courier hub-scanned (incl. masked labels); live invoice/balance match;
  `production-gate` PASS; owner opens registration.

### Post-launch (P1/P2)

- **TASK-701** Layar Pelanggan (PR-22, P1) · **TASK-702** Sender stamp card (PR-23, P2, counsel first) ·
  **TASK-703** Multi-outlet owner (PR-24, P2). Contracts written when prioritised.

### Coverage map

Every accepted requirement and decision has a delivering task (its `Requirement` field names it).

| Milestone | Tasks | PRD requirements | Decisions / ADRs |
|---|---|---|---|
| **M1** | TASK-101..112, close 199 | PR-01, PR-04, PR-05 (math) | DEC-201, 202, 209, 210, 211, 215, 217, 227, 228; ADR-0001, 0002, 0006 |
| **M2** | TASK-201..208, close 299 | PR-02, PR-02b, PR-03 (activation), PR-11 | DEC-203, 204, 205, 209 (console), 218 (platform legal), 219 (client + relay program), 226, 230, 233; ADR-0003, 0004 (§5 rotation) |
| **M3** | TASK-301..311, close 399 | PR-05 (UI), PR-06, PR-07, PR-08, PR-09, PR-10, PR-14, PR-15, PR-18 | DEC-206 (masking), 208, 212, 213, 218 (tenant forms), 220, 221, 222, 223, 224, 225, 229, 231; ADR-0004 (dispatch), 0005 |
| **M4** | TASK-401..405, close 499 | PR-12, PR-13, PR-16, PR-17, PR-20 | DEC-206 (returns), 216; ADR-0005 |
| **M5** | TASK-501..505, close 599 | PR-03 (mini-site), PR-19, PR-21 | DEC-202, 207, 214, 218 (footer), 228 (custom domains) |
| **M6** | TASK-601..604 | production readiness | DEC-219, 228 (production), 232; ADR-0006 §7 |
| **Post-launch** | TASK-701..703 | PR-22 (P1), PR-23 (P2), PR-24 (P2) | — |

Milestone notes carried forward:
- **M3 additions (DEC-229):** Paket Massal Excel/CSV import + Riwayat Massal, Cek Resi, Cetak Resi Massal, Akun Saya;
  loading/empty/error states for every screen (deferred from TASK-001).
- **M2/M4 sandbox verifications:** weight echo, `POST /time` timezone, `/invoices` ordering, `pay-unpaid`
  idempotency, item-value limits per courier (specs 02, 04, 09).
- **Mengantar (DEC-230):** answered — applied from Mengantar's system, ~1 hour (`apply_sla_minutes = 60`); discounts
  differ per courier (`courier_discount_policy`, default 20 % each, editable).
- **Before masking is advertised:** counsel review (Permenkomdigi 8/2025 Art. 77, UU PDP retention); building and
  per-gerai switching are not blocked (DEC-231).
