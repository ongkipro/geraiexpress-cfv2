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

No task is in progress. TASK-101 starts when the owner says go.

## Pending

### M1 — Monorepo, multi-host Worker, D1 control plane, auth, `GeraiVaultDO` tenant store

### TASK-101: Scaffold the pnpm workspace and Worker
- **Requirement:** ADR-0001 (Cloudflare serverless stack), DEC-201, DEC-217 (English code/docs, Indonesian UI strings)
- **Risk Level:** R2
- **Job:** implementation
- **Capability:** `wrangler`, `workers-best-practices`, `native-first`
- **Allowed Paths:** `package.json`, `pnpm-workspace.yaml`, `tsconfig*.json`, `apps/worker/**`, `packages/domain/**`,
  `packages/db/**`, `.gitignore`, `.dev.vars.example`
- **Protected Paths:** `docs/**`, root contract files
- **Depends On:** TASK-003, TASK-006
- **Accepted Invariants:** no Next.js/OpenNext; no source maps in production output (AGENTS.md); bindings named as
  `docs/spec/07` §3.1.
- **Done when:** `pnpm install && pnpm check` passes on a clean clone (typecheck, lint, empty unit and worker test
  suites); `wrangler dev` answers `200` on `http://app.geraiexpress.localhost:8787/healthz`.

### TASK-102: Host classifier and host-locked cookies
- **Requirement:** ADR-0002 (dual-domain white-label SaaS)
- **Risk Level:** R4
- **Job:** implementation
- **Allowed Paths:** `apps/worker/src/host/**`, `apps/worker/test/host/**`
- **Protected Paths:** `apps/worker/src/auth/**`
- **Capability:** `cloudflare-for-saas`, `application-security`, `workers-best-practices`
- **Depends On:** TASK-101
- **Accepted Invariants:** the five contexts in `ARCHITECTURE.md` §3; cross-context paths return 404; `relay.` is
  never served by the Worker (`docs/spec/10` §5).
- **Done when:** worker tests prove: each `.localhost` host maps to its context; `/api/owner/*` on `app.` → 404;
  an `app.` cookie is not accepted on `owner.` and vice versa; unknown `*.gerai.cc` slug → 404 page; host
  normalisation (case, port, trailing dot, IP literal, ignored `X-Forwarded-Host`); one mutation that weakens the
  classifier makes a test fail; independent R4 review archived.

### TASK-103: Control-plane D1 schema and `GeraiVaultDO` tenant store (core tables)
- **Requirement:** ADR-0006, `docs/spec/01` §0 and §2
- **Risk Level:** R3
- **Job:** migration
- **Capability:** `durable-objects` (SQLite storage, RPC, migrations), `postgres-drizzle` patterns adapted to SQLite
- **Allowed Paths:** `packages/db/**`, `apps/worker/src/do/gerai-vault/**`, matching tests
- **Depends On:** TASK-101
- **Accepted Invariants:** money integer IDR, rates integer bps, weight integer gram; `NULL` ≠ `0`; composite
  `(tenant_id, slug)` PK on `shipments`; control tables in D1 (users, sessions, email_otps, super_admins, tenants,
  tenant_members, tenant_hostnames, platform_legal_profile, shipment_index, email_outbox, tenant_schema_versions);
  tenant tables in the object (tenant_outlets, tenant_business_profiles, tenant_settings, mengantar_connections,
  sender_contacts, recipient_contacts, shipments, audit). Tenant migrations via an explicit `migrate(version)` RPC.
- **Done when:** `pnpm db:generate` produces forward-only SQL in both tracks; `pnpm db:migrate:local` applies the
  control track; a worker test creates two tenant objects, migrates both, and proves tenant A's object never returns
  tenant B's contact or shipment; a second test upgrades an object from version N−1 to N without data loss.

### TASK-104: Email OTP sign-up, sessions and Kasir invitations
- **Requirement:** PR-01
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `application-security`
- **Allowed Paths:** `apps/worker/src/auth/**`, `apps/worker/test/auth/**`, `packages/db/src/auth/**`
- **Depends On:** TASK-102, TASK-103
- **Accepted Invariants:** spec 05 §2 (PBKDF2-SHA256 100k + 16-byte salt + pepper; SameSite=Lax + Origin check;
  Bearer-only on `/api/v1` and `/mcp`); Indonesian OTP mail through the `EMAIL` send binding (`docs/spec/12`; simulated by `wrangler dev`, outbox asserted in tests).
- **Done when:** worker tests cover sign-up → OTP → password → session; OTP expiry, the 5-wrong/15-minute lock and the
  send rate limits (spec 05 §2); the OTP email lands in `email_outbox` and in the simulated `EMAIL` binding output
  with `text` and `html` parts; invitation link is single-use and expires in 7 days; PBKDF2 100k runs inside `workerd`
  without hitting limits.

### TASK-105: Super Admin TOTP (`aal2`)
- **Requirement:** DEC-209, spec 05 §2
- **Risk Level:** R3
- **Job:** implementation
- **Allowed Paths:** `apps/worker/src/auth/totp/**`, `apps/worker/test/auth/totp/**`
- **Capability:** `application-security`
- **Accepted Invariants:** TOTP secret encrypted with `KEK_SECRET`; `aal2` only on `owner.`; re-TOTP after 15 minutes
  for sensitive actions; Super Admin never creates, pays or impersonates (DEC-209).
- **Depends On:** TASK-104
- **Done when:** worker tests prove `owner.` routes reject a session without `aal2`; a sensitive mutation more than
  15 minutes after the last TOTP demands re-TOTP (spec 05 §2); no route lets Super Admin create or pay a shipment.

### TASK-106: `INV` slug allocator in `GeraiVaultDO`
- **Requirement:** PR-04, DEC-211
- **Risk Level:** R3
- **Job:** implementation
- **Allowed Paths:** `packages/domain/src/slug/**`, `apps/worker/src/do/gerai-vault/**`, matching tests
- **Capability:** `durable-objects`, `testing-engineering`
- **Depends On:** TASK-103
- **Accepted Invariants:** 7 chars, CSPRNG, Crockford alphabet without `0/O/1/I/L/U`, unique per tenant,
  case-insensitive match, regenerate on UNIQUE conflict.
- **Done when:** unit tests reject excluded characters and wrong length; a DO test allocating 10,000 slugs for one
  tenant has 0 duplicates; the same slug may exist for two different tenants.

### TASK-107: Pure money, weight and volumetric math
- **Requirement:** PR-05, DEC-215 (integer grams), `docs/spec/02`
- **Risk Level:** R3
- **Job:** implementation
- **Allowed Paths:** `packages/domain/src/money/**`, `packages/domain/src/weight/**`, matching tests
- **Capability:** `testing-engineering` (property tests)
- **Depends On:** TASK-101
- **Accepted Invariants:** integers only; `billed_kg` rules incl. sub-kg and 1 kg-minimum couriers; COD gross-up
  applied once; insurance `NULL` stays `NULL`; unit-mistake guard thresholds (`< 10` gram, `>= 100` kg).
- **Done when:** unit tests cover every worked example in spec 02 and visual 05 with exact Rupiah results,
  plus property tests that no function returns a non-integer `_idr` value; the five `cod_fee_mode` rows of spec 02 §3.4
  (incl. `seller credit − sender payable = P − N`, and the fallback fixture `M = 10800`, `N = 9600` leaving flows unchanged), the
  insured Non-COD `Laba Kas` regression (`I = 1000` → `5400`), the quote-pass fixed point (`COD_FEE_UNSTABLE`), the all-in negative-payout guard, and the `P = 12000`, net `9599` → cost
  `9599` (not `9600`) regression.

### TASK-108: CI pipeline and staging deploy
- **Requirement:** `docs/spec/07` §6, `docs/WORKFLOW.md` §8
- **Risk Level:** R2
- **Job:** implementation
- **Capability:** `github-actions`, `wrangler`
- **Allowed Paths:** `.github/workflows/**`, `wrangler.jsonc` (`env.staging`), `scripts/ci/**`
- **Depends On:** TASK-101
- **Accepted Invariants:** actions pinned by SHA; `permissions: contents: read`; no secrets for fork PRs; production
  deploy only through a manual, approval-protected workflow.
- **Done when:** a pushed branch runs `ci.yml` green on GitHub (hosted run link in `STATUS.md`); a deliberately broken
  unit test makes it red; `deploy-staging.yml` runs only after a reviewer approves the `staging` GitHub environment
  for that run (no unattended deploy), and the first run additionally needs the owner's approval of the staging
  Cloudflare resources.

### TASK-109: Host isolation test suite
- **Requirement:** `docs/spec/11` §3 and §8, ADR-0002
- **Risk Level:** R4
- **Job:** implementation
- **Capability:** `cloudflare-for-saas`, `application-security`, `testing-engineering`
- **Allowed Paths:** `apps/worker/test/isolation/**`, `apps/worker/src/host/**`
- **Accepted Invariants:** tenant only from verified host + session; unknown/pending host → neutral 404 before any
  tenant read; KV never used for host → tenant (ADR-0006, spec 11 §3).
- **Depends On:** TASK-102, TASK-103, TASK-104
- **Done when:** worker tests prove the spec 11 §8 matrix for two seeded tenants and the platform hosts (cookies, API
  key, webhook token, `/lacak`, media keys), DCV paths pass through, unknown/pending host → neutral 404, suspended →
  403 within 30 s; a mutation that drops the tenant check from one route makes the suite fail.

### TASK-110: Email deliverability gate (Cloudflare Email Sending)
- **Requirement:** DEC-227, `docs/spec/12` §6
- **Risk Level:** R2
- **Job:** verification (needs owner approval for the sending-domain DNS change)
- **Allowed Paths:** `BUILD-LOG.md`, `STATUS.md`
- **Capability:** `cloudflare-email-service`
- **Accepted Invariants:** one provider only (DEC-227); transactional mail only; no OTP in production logs.
- **Depends On:** TASK-104
- **Done when:** `BUILD-LOG.md` records, for `signup_otp` and `password_reset`, SPF/DKIM/DMARC `pass` and inbox
  placement at Gmail, Outlook.com and Yahoo (two sends each), delivery under 60 s and a tester score ≥ 9/10. Until
  this passes, production signup stays closed.

---

### Later milestones

Contracts below are ready to start once their dependencies are done; refine paths at milestone start if the M1
scaffold changed the layout (record the change in the task, not silently).

### M2 — Mengantar SDK, onboarding, courier rules, discount matrix

### TASK-201: `mengantar-sdk` Public API client with key redaction
- **Requirement:** DEC-204, DEC-210, ARCHITECTURE §4.1
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `mengantar-api`, `workers-best-practices`
- **Allowed Paths:** `packages/mengantar-sdk/**`
- **Depends On:** TASK-101
- **Accepted Invariants:** the `{API_KEY}` path segment is masked in every error, log and trace; timeouts via
  `AbortSignal.timeout`; responses parsed with Zod; unknown fields preserved raw; money from integer fields only.
- **Done when:** unit tests against recorded sandbox fixtures (estimate, order create paid/unpaid/error, `GET /order`
  history, `/invoices`, `pay-unpaid`) pass; a test proves a thrown 4xx/5xx message never contains the key.

### TASK-202: Partner transport `direct` and `relay` with `PartnerQuotaDO`
- **Requirement:** DEC-204, DEC-219, ADR-0003, spec 10 §4.1 and §4.3
- **Risk Level:** R4
- **Job:** implementation
- **Capability:** `mengantar-api`, `durable-objects`, `application-security`
- **Allowed Paths:** `packages/mengantar-sdk/src/partner/**`, `apps/worker/src/do/partner-quota/**`, matching tests
- **Depends On:** TASK-201
- **Accepted Invariants:** exact-byte signing `SHA256(METHOD:PATH:TYPE:BODY:TIMESTAMP:SECRET)`; 60/min and 1000/day
  quota; relay HMAC + `X-Relay-Id`; `api-key/regenerate` never auto-retried; only the 4 Partner routes.
- **Done when:** digest-parity test against the documented example; quota DO test at the limits; relay-mode request
  signature verified by a local stub relay; `409 relay_duplicate` treated as `maybe_sent`; independent R4 review.

### TASK-203: Outlet application and Super Admin approval → seller provisioning
- **Requirement:** PR-02, DEC-203, DEC-209, spec 05 §1
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `admin-product-ux`, `shadcn-ui`, `ui-validation`
- **Allowed Paths:** `apps/worker/src/onboarding/**`, `apps/web-owner/src/routes/gerai/**`, `apps/web-app/src/routes/daftar/**`, matching tests
- **Depends On:** TASK-202, TASK-105
- **Accepted Invariants:** approval needs `aal2` + reason and activates `<slug>.gerai.cc` (a D1 `tenant_hostnames`
  row, PR-03); `registration_unknown` is read back via list, never re-registered blindly; BYOK fallback for existing sellers; the seller key is stored encrypted in the tenant object.
- **Visual Contract:** admin surface, comfort contract; `/daftar` steps 1/5 and `/gerai/pengajuan/:id` per visual 07;
  states loading/empty/error/success.
- **Done when:** sandbox end-to-end: apply → approve → seller created → key stored → `connected`; a timeout during
  register ends in `registration_unknown` and resolves by read-back; UI evidence at 390/1366.

### TASK-204: Webhook setup page, routes and polling floor
- **Requirement:** PR-02b, spec 01 §2.7, spec 01 §3
- **Risk Level:** R4
- **Job:** implementation
- **Capability:** `mengantar-api`, `durable-objects`, `testing-engineering`
- **Allowed Paths:** `apps/worker/src/webhooks/**`, `apps/worker/src/do/gerai-vault/status/**`, `apps/web-app/src/routes/pengaturan/mengantar/**`, matching tests
- **Depends On:** TASK-103, TASK-201
- **Accepted Invariants:** token hash → tenant in D1; HMAC verified in the tenant object; inbox before ack; the
  provider/custody combine rule of spec 01 §3; hourly polling while `webhook_state != active`.
- **Visual Contract:** `/pengaturan/mengantar` per visual 08 §2 (copy URL, paste secret, status chip); states loading/empty/error/success. Comfort size contract; gates 0 fail at 390/1366.
- **Done when:** the spec 01 §2.7 and §3 test lists pass (restart, duplicate, enqueue failure, reverse order, poll↔webhook
  minute ties, custody cases, permutation property test); independent R4 review.

### TASK-205: Courier catalog, `Ekspedisi Aktif` and area search cache
- **Requirement:** DEC-213, DEC-223, spec 06, visual 08 §2
- **Risk Level:** R2
- **Job:** implementation
- **Capability:** `shadcn-ui`, `ui-validation`
- **Allowed Paths:** `apps/worker/src/couriers/**`, `apps/web-app/src/routes/pengaturan/ekspedisi/**`, matching tests
- **Depends On:** TASK-201
- **Accepted Invariants:** KV only caches area search; pickup mode per courier; switches save instantly with a toast.
- **Visual Contract:** settings item page per visual 08 §2.3; full-row toggle targets (`touch-target-toggle`).
- **Done when:** worker tests for catalog and prefs; area search cache hit/miss test; gates 0 fail at 390/1366.

### TASK-206: Super Admin discount and cashback matrix
- **Requirement:** PR-11, DEC-205, DEC-226, spec 02 §2
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `admin-product-ux`, `shadcn-ui`
- **Allowed Paths:** `apps/worker/src/pricing/rules/**`, `apps/web-owner/src/routes/tarif/**`, matching tests
- **Depends On:** TASK-107, TASK-203
- **Accepted Invariants:** `assigned_bps <= provider_observed_bps` (no subsidy at launch); TOTP + reason + audit per
  change; effective timestamps; `Selisih tarif` shown as information only.
- **Visual Contract:** `/tarif` per visual 07; observed vs assigned bps editor.
- **Done when:** worker tests reject a rule above observed; audit row per change; UI evidence.

### M3 — Counter POS, printing, contacts, shift, dashboard

### TASK-301: Web app shell, navigation and role projection
- **Requirement:** DEC-213, DEC-222, DEC-225, DEC-209, visual 07 §1
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `shadcn-ui`, `admin-dashboard`, `ui-validation`
- **Allowed Paths:** `apps/web-app/src/shell/**`, `apps/web-app/src/components/ui/**`, `apps/worker/src/dto/**`, matching tests
- **Depends On:** TASK-104
- **Accepted Invariants:** 6 menus (Keuangan owner only), bottom bar on phones, comfort sizes, light theme only, zoom
  never locked; Kasir DTOs never contain cost, margin or balance fields.
- **Visual Contract:** Direction A (`DESIGN.md`), C1–C6; loading/empty/error states for every screen.
- **Done when:** DTO projection test per role; `dotuiux check` + `admin-geometry` 0 fail at 390/1366/1536.

### TASK-302: Contacts (`Pengirim`, `Penerima`) with WA verification and risk badge
- **Requirement:** PR-14, PR-15 (verification), DEC-212
- **Risk Level:** R2
- **Job:** implementation
- **Capability:** `shadcn-ui`, `ui-validation`
- **Allowed Paths:** `apps/worker/src/do/gerai-vault/contacts/**`, `apps/web-app/src/routes/kontak/**`, matching tests
- **Depends On:** TASK-301
- **Accepted Invariants:** phone normalised `08…`; `wa_verified_at` set only by an interactive operator; changing the
  phone clears it; recipient risk badge from this gerai's counts.
- **Visual Contract:** list pages per visual 07 C3; deposit column owner only.
- **Done when:** worker + e2e tests; UI evidence.

### TASK-303: Quote engine (two-pass COD) and courier cards
- **Requirement:** PR-06, DEC-225, spec 02 §3.3
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `mengantar-api`, `testing-engineering`
- **Allowed Paths:** `apps/worker/src/pricing/quote/**`, `apps/web-app/src/routes/kasir/**`, matching tests
- **Depends On:** TASK-107, TASK-201, TASK-206
- **Accepted Invariants:** fixed-point `codFee` rule with `COD_FEE_UNSTABLE`; frozen quote stores final `F`, `N`, `C`;
  cargo recommended ≥ 5,000 g and Non-COD only; Kasir sees customer price only.
- **Visual Contract:** courier cards per visual 05 (Kasir: customer price only; owner `👁` margin toggle); loading skeleton per card, provider error per card. Comfort size contract; gates 0 fail at 390/1366.
- **Done when:** fixture tests for all five `cod_fee_mode`s incl. unstable fee; e2e card render at 390/1366.

### TASK-304: POS checkout, payment record and dispatch
- **Requirement:** PR-04, PR-05, PR-07, DEC-208, DEC-220, ADR-0004
- **Risk Level:** R4
- **Job:** implementation
- **Capability:** `durable-objects`, `mengantar-api`, `ui-validation`
- **Allowed Paths:** `apps/worker/src/do/gerai-vault/dispatch/**`, `apps/worker/src/do/gerai-vault/payment/**`, `apps/web-app/src/routes/kiriman/**`, matching tests
- **Depends On:** TASK-106, TASK-303
- **Accepted Invariants:** write-ahead journal then call then record; unknown outcome → `reconciliation_needed`, read
  back, never replay; payment state machine spec 03 §1.1 with idempotency keys; shift attribution by receipt.
- **Visual Contract:** POS 60/40 split (C4), sticky checkout bar on phones, one primary `Tandai Lunas & Cetak`.
- **Done when:** DO tests: double submit → one order; timeout → reconciliation path; unpaid hold → pay-unpaid path;
  e2e checkout under 45 s scripted; independent R4 review.

### TASK-305: Masking presets, quota and reveal audit
- **Requirement:** PR-15, DEC-206, ADR-0005, spec 05
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `application-security`
- **Allowed Paths:** `apps/worker/src/do/gerai-vault/masking/**`, matching UI and tests
- **Depends On:** TASK-302, TASK-304
- **Accepted Invariants:** pickup always the outlet; `masking_daily_quota` with `422 MASKING_QUOTA_EXCEEDED`, never a
  silent fallback; reveal requires reason + audit. Not advertised before the counsel review (STATUS).
- **Done when:** quota and reveal tests; label snapshots per preset.

### TASK-306: Printing — 100 mm PDFs (PC-first), 58 mm ESC/POS, bulk print
- **Requirement:** PR-08, DEC-224, DEC-229, visual 04
- **Risk Level:** R2
- **Job:** implementation
- **Capability:** `native-first`, `ui-validation`
- **Allowed Paths:** `packages/thermal-print/**`, `apps/worker/src/labels/**`, `apps/web-app/src/print/**`, matching tests
- **Depends On:** TASK-304
- **Accepted Invariants:** exact-size PDFs (100×150, 100×100) with ≥ 3 mm barcode quiet zones; local barcode/QR
  rendering (no third-party image service); 58 mm lines exactly 32 columns; `print_count` and reprint reason; bulk ≤ 50.
- **Visual Contract:** print drawer and label/receipt previews per visual 04; 32-col preview; reprint reason dialog. Comfort size contract; gates 0 fail at 390/1366.
- **Done when:** PDF dimension tests; 32-column snapshot tests; barcode scan check on a printed sample (evidence photo).

### TASK-307: Shift drawer and sender COD payout
- **Requirement:** PR-10, spec 03 §1.2 and §4
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `durable-objects`
- **Allowed Paths:** `apps/worker/src/do/gerai-vault/shift/**`, `apps/web-app/src/routes/kasir/shift/**`, matching tests
- **Depends On:** TASK-304
- **Accepted Invariants:** `expected_cash = float + Σ tunai in − Σ tunai out`; every `tunai` payout needs an open
  shift; variance needs a reason code.
- **Visual Contract:** `/kasir/shift` per visual 07 (open → live totals → closing count → variance reason). Comfort size contract; gates 0 fail at 390/1366.
- **Done when:** DO tests for cross-shift payment, payout, void and variance; e2e open/close shift.

### TASK-308: Paket Massal (manual + CSV), Riwayat Massal, Cek Resi, Akun Saya, Bantuan
- **Requirement:** PR-09, DEC-229, spec 03 §1.3–1.4
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `native-first`, `testing-engineering`, `ui-validation`
- **Allowed Paths:** `apps/worker/src/bulk/**`, `apps/web-app/src/routes/kasir/multi/**`, `apps/web-app/src/routes/kasir/cek-resi/**`, `apps/web-app/src/routes/akun/**`, `apps/web-app/src/routes/bantuan/**`, matching tests
- **Depends On:** TASK-304, TASK-306
- **Accepted Invariants:** ≤ 200 rows; ambiguous area → `Perlu Diperbaiki`; queued serialized dispatch; atomic batch
  payment with derived idempotency keys; `.xlsx` reader only after an ADR (spec 03 §1.3).
- **Visual Contract:** `/kasir/multi` tabs `Siap`/`Perlu Diperbaiki` with inline edit, `/kasir/cek-resi`, `/akun`, `/bantuan` per visual 07; empty/error per row. Comfort size contract; gates 0 fail at 390/1366.
- **Done when:** CSV fixture with good and bad rows; batch payment atomicity test; e2e at 390/1366.

### TASK-309: Owner dashboard, Kasir home and period filter
- **Requirement:** PR-18, DEC-221, visual 08 §1
- **Risk Level:** R2
- **Job:** implementation
- **Capability:** `admin-dashboard`, `ui-validation`
- **Allowed Paths:** `apps/web-app/src/routes/index/**`, `apps/web-app/src/components/period-filter/**`, `apps/worker/src/analytics/**`, matching tests
- **Depends On:** TASK-304
- **Accepted Invariants:** WIB presets, default `7 hari terakhir`, max 180 days, URL state; Estimasi Laba and Laba Kas
  separate; Kasir home has no money totals.
- **Visual Contract:** dashboard per visual 07 C5 + period filter visual 08 §1 (phone bottom sheet); chart COD vs Non-COD with legend. Comfort size contract; gates 0 fail at 390/1366.
- **Done when:** period resolution unit tests (DST-free WIB, month edges); gates 0 fail.

### TASK-310: Settings sub-navigation and remaining settings pages
- **Requirement:** DEC-223, DEC-218 (forms), visual 08 §2
- **Risk Level:** R2
- **Job:** implementation
- **Capability:** `shadcn-ui`, `ui-validation`
- **Allowed Paths:** `apps/web-app/src/routes/pengaturan/**`, matching tests
- **Depends On:** TASK-301
- **Accepted Invariants:** nine item routes; sticky save bar only when dirty; Kasir sees only `printer`; NPWP encrypted.
- **Visual Contract:** settings sub-menu per visual 08 §2 (desktop left menu, phone grouped list), sticky save bar only when dirty. Comfort size contract; gates 0 fail at 390/1366.
- **Done when:** 403 tests for Kasir; gates 0 fail.

### M4 — Finance sync, pickup manifest, returns, claims

### TASK-401: `/invoices` sync, dual book and Laba Kas
- **Requirement:** PR-12, DEC-216, spec 09
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `mengantar-api`, `durable-objects`
- **Allowed Paths:** `apps/worker/src/do/gerai-vault/finance/**`, `apps/web-app/src/routes/keuangan/**`, matching tests
- **Depends On:** TASK-304
- **Accepted Invariants:** idempotent mirror; unknown types kept verbatim → `Selisih Sync`; Laba Kas predicate of
  spec 02 §3.5; `quote_drift` flagged, never auto-fixed.
- **Visual Contract:** `/keuangan` tabs per spec 06 (owner only), `Estimasi Laba` and `Laba Kas` side by side. Comfort size contract; gates 0 fail at 390/1366.
- **Done when:** deterministic reconciliation tests over all observed types + unknown; running balance equals
  `balanceAmount` on fixtures.

### TASK-402: `pay-unpaid` recovery and Saldo Aman reserve
- **Requirement:** PR-13, spec 02 §4, spec 09 §3
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `mengantar-api`, `durable-objects`
- **Allowed Paths:** `apps/worker/src/do/gerai-vault/finance/unpaid/**`, matching tests
- **Depends On:** TASK-401
- **Accepted Invariants:** crash-safe `pay-unpaid` by `batch_id`; low-balance messages never reveal the balance to Kasir.
- **Done when:** crash-between-call-and-record test; reserve math tests.

### TASK-403: Pickup manifest and Surat Jalan
- **Requirement:** PR-16, spec 04 §1, spec 01 §2.4
- **Risk Level:** R2
- **Job:** implementation
- **Capability:** `ui-validation`
- **Allowed Paths:** `apps/worker/src/do/gerai-vault/pickup/**`, `apps/web-app/src/routes/kiriman/pickup/**`, matching tests
- **Depends On:** TASK-306
- **Accepted Invariants:** wrong courier, `cancelled` and `provider_unpaid_hold` block; counter-unpaid only warns;
  driver fields required; handover records custody.
- **Visual Contract:** `/kiriman/pickup/:batch` scan mode (red alert + sound on block, amber on unpaid), driver fields, signature. Comfort size contract; gates 0 fail at 390/1366.
- **Done when:** scan-guard tests; Surat Jalan PDF snapshot; e2e scan flow.

### TASK-404: Meja Retur and verified handback
- **Requirement:** PR-17, DEC-206, ADR-0005, spec 04 §2
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `application-security`
- **Allowed Paths:** `apps/worker/src/do/gerai-vault/returns/**`, `apps/web-app/src/routes/kiriman/retur/**`, matching tests
- **Depends On:** TASK-204, TASK-403
- **Accepted Invariants:** intake and handback are custody stages (spec 01 §3); 4-digit code hashed; reveal audited.
- **Visual Contract:** `/kiriman/retur/:awb` intake → photo → WA code → handback per visual 06/07. Comfort size contract; gates 0 fail at 390/1366.
- **Done when:** custody tests incl. provider contradictions → `Status Bertentangan`; e2e intake → handback.

### TASK-405: Exceptions and claim assistant
- **Requirement:** PR-20, spec 04 §3
- **Risk Level:** R2
- **Job:** implementation
- **Capability:** `testing-engineering`
- **Allowed Paths:** `apps/worker/src/do/gerai-vault/exceptions/**`, `apps/web-app/src/routes/kiriman/kendala/**`, matching tests
- **Depends On:** TASK-204, TASK-401
- **Accepted Invariants:** five sub-filters incl. `Status Bertentangan`; per-courier claim deadlines from the cited help pages.
- **Visual Contract:** `Kendala & Klaim` five sub-filters incl. `Status Bertentangan` with countdown chips. Comfort size contract; gates 0 fail at 390/1366.
- **Done when:** bucket classification tests; deadline countdown tests.

### M5 — Mini-site, brand site, OpenAPI, MCP, custom domains (staging)

### TASK-501: Gerai mini-site SSR, QR pre-booking and private tracking
- **Requirement:** PR-03, PR-19, DEC-207, spec 05 §3, visual 03
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `seo-website-builder`, `application-security`, `ui-validation`
- **Allowed Paths:** `apps/worker/src/minisite/**`, matching tests
- **Depends On:** TASK-109, TASK-303
- **Accepted Invariants:** Turnstile on public quotes; 48 h drafts; `/lacak` shows initials + city until the 4-digit
  phone gate; footer `Didukung jaringan resmi GeraiExpress` (DEC-218).
- **Visual Contract:** public mini-site per visual 03 (mobile-first, 3 tabs); `design-taste` narrow + wide review. Comfort size contract; gates 0 fail at 390/1366.
- **Done when:** 0 PII on anonymous tracking (test); QR → counter opens the same INV (e2e); Lighthouse mobile ≥ 90.

### TASK-502: Brand site and POS sandbox
- **Requirement:** DEC-202, visual 03 §2
- **Risk Level:** R1
- **Job:** implementation
- **Capability:** `design-taste`, `seo-website-builder`, `ui-validation`
- **Allowed Paths:** `apps/worker/src/brand/**`, matching tests
- **Depends On:** TASK-501
- **Accepted Invariants:** no session cookies on the apex; legal footer from `platform_legal_profile`.
- **Visual Contract:** brand site per visual 03 §2; `design-taste` narrow + wide review. Comfort size contract; gates 0 fail at 390/1366.
- **Done when:** narrow and wide renders reviewed; SEO checks pass.

### TASK-503: OpenAPI 3.1 `/api/v1` with scoped API keys
- **Requirement:** PR-21, DEC-214, spec 08 §1–3
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `openapi-spec`, `application-security`
- **Allowed Paths:** `apps/worker/src/api-v1/**`, `apps/web-app/src/routes/pengaturan/api-mcp/**`, matching tests
- **Depends On:** TASK-304, TASK-308
- **Accepted Invariants:** spec generated from Zod (single source); Bearer only; payment mutations not exposed.
- **Visual Contract:** `/pengaturan/api-mcp` keys table, `Buat Kunci` dialog shown once, revoke confirm. Comfort size contract; gates 0 fail at 390/1366.
- **Done when:** generated `openapi.json` validates; scope-denial tests per endpoint.

### TASK-504: MCP servers (authenticated and public)
- **Requirement:** PR-21, DEC-214, spec 08 §4–5
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `application-security`
- **Allowed Paths:** `apps/worker/src/mcp/**`, matching tests
- **Depends On:** TASK-503
- **Accepted Invariants:** tool hints as specified; prompt-injection defenses; daily cap on issuing tools.
- **Done when:** MCP inspector run lists tools; scope and cap tests.

### TASK-505: Custom-domain flow on staging
- **Requirement:** DEC-228, spec 11 §5–8
- **Risk Level:** R4
- **Job:** implementation
- **Capability:** `cloudflare-for-saas`
- **Allowed Paths:** `apps/worker/src/hostnames/**`, `apps/web-app/src/routes/pengaturan/mini-site/**`, matching tests
- **Depends On:** TASK-109, TASK-501
- **Accepted Invariants:** create before CNAME; HMAC probe before activation; 7-day reaper; `cname`/`fallback`/`probe` reserved.
- **Visual Contract:** `Pengaturan › Mini-Site › Domain Sendiri`: DNS record to copy, status steps, `Periksa Lagi`, remedies per spec 11 §5. Comfort size contract; gates 0 fail at 390/1366.
- **Done when:** lifecycle tests with a mocked Cloudflare API; one real test domain onboarded on the team's staging
  zone (owner approval); independent R4 review.

### M6 — Production readiness and pilot (every step needs owner approval)

### TASK-601: Partner relay in production
- **Requirement:** DEC-219, spec 10 §5–6
- **Risk Level:** R4
- **Job:** release
- **Capability:** `vps-deploy`, `vultr`
- **Allowed Paths:** `infra/partner-relay/**`, `BUILD-LOG.md`, `STATUS.md`
- **Depends On:** TASK-202
- **Accepted Invariants:** only the 4 Partner routes; one HMAC secret (+ previous during rotation); no secrets in Coolify variables.
- **Done when:** every spec 10 §6 check recorded with evidence; Mengantar allowlist confirmed.

### TASK-602: Cloudflare for SaaS zone and production hosts
- **Requirement:** DEC-228, spec 11 §2
- **Risk Level:** R4
- **Job:** release
- **Capability:** `cloudflare-for-saas`, `wrangler`
- **Allowed Paths:** `wrangler.jsonc`, `OBSERVABILITY.md`, `BUILD-LOG.md`
- **Depends On:** TASK-505
- **Accepted Invariants:** zone-scoped API token only; Worker route `*/*` + explicit `cname.gerai.cc/*`; staging route `*-stg.gerai.cc/*`.
- **Done when:** zone steps 1–6 recorded; all `OBSERVABILITY.md` probes green.

### TASK-603: Backups and restore drill
- **Requirement:** ADR-0006 §7
- **Risk Level:** R3
- **Job:** release
- **Capability:** `durable-objects`, `wrangler`
- **Allowed Paths:** `scripts/backup/**`, `BUILD-LOG.md`
- **Depends On:** TASK-602
- **Accepted Invariants:** backups never leave the owner's accounts; restore is tested before it is trusted.
- **Done when:** D1 Time Travel bookmark and per-object R2 export restored into a scratch environment; RPO/RTO recorded.

### TASK-604: Live courier pilot and open registration
- **Requirement:** ROADMAP M6
- **Risk Level:** R4
- **Job:** release
- **Capability:** `mengantar-api`
- **Allowed Paths:** `RELEASE.md`, `BUILD-LOG.md`, `STATUS.md`
- **Depends On:** TASK-601, TASK-602, TASK-603, TASK-110
- **Accepted Invariants:** every production action approved by the owner at the time; rollback ready (`RELEASE.md`).
- **Done when:** one real parcel per active courier scanned at a hub (incl. masked labels); invoice/balance sync matches
  on live orders; `production-gate` PASS; owner approval to open registration.

### Post-launch (P1/P2)

- **TASK-701** Layar Pelanggan (PR-22, P1) · **TASK-702** Sender stamp card (PR-23, P2, counsel first) ·
  **TASK-703** Multi-outlet owner (PR-24, P2). Contracts written when prioritised.

### Coverage map

Every accepted requirement and decision has a delivering task (its `Requirement` field names it).

| Milestone | Tasks | PRD requirements | Decisions / ADRs |
|---|---|---|---|
| **M1** | TASK-101..110 | PR-01, PR-04, PR-05 (math) | DEC-201, 202, 209, 210, 211, 215, 217, 227, 228; ADR-0001, 0002, 0004, 0006 |
| **M2** | TASK-201..206 | PR-02, PR-02b, PR-03 (activation), PR-11 | DEC-203, 204, 205, 219 (client side), 226; ADR-0003 |
| **M3** | TASK-301..310 | PR-05 (UI), PR-06, PR-07, PR-08, PR-09, PR-10, PR-14, PR-15, PR-18 | DEC-206 (masking), 208, 212, 213, 218 (forms), 220, 221, 222, 223, 224, 225, 229; ADR-0005 |
| **M4** | TASK-401..405 | PR-12, PR-13, PR-16, PR-17, PR-20 | DEC-206 (returns), 216; ADR-0005 |
| **M5** | TASK-501..505 | PR-03 (mini-site), PR-19, PR-21 | DEC-202, 207, 214, 218 (footer), 228 (custom domains) |
| **M6** | TASK-601..604 | production readiness | DEC-219, 228 (production); ADR-0006 §7 |
| **Post-launch** | TASK-701..703 | PR-22 (P1), PR-23 (P2), PR-24 (P2) | — |

Milestone notes carried forward:
- **M3 additions (DEC-229):** Paket Massal Excel/CSV import + Riwayat Massal, Cek Resi, Cetak Resi Massal, Akun Saya;
  loading/empty/error states for every screen (deferred from TASK-001).
- **M2/M4 sandbox verifications:** weight echo, `POST /time` timezone, `/invoices` ordering, `pay-unpaid`
  idempotency, item-value limits per courier (specs 02, 04, 09).
- **Before M2:** Mengantar answer on per-seller discount control (DEC-226).
- **Before M3 masking is advertised:** counsel review (Permenkomdigi 8/2025 Art. 77, UU PDP retention).
