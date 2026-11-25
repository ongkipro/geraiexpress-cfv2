# Tasks — GeraiExpress v2 (`geraiexpress-cfv2`)

Updated: 2026-11-25

Open and in-progress tasks only, newest milestone first. Finished contracts move to `docs/archive/TASKS-*.md` and
leave one index line. Hard limit 50 KB (`~/.config/ai/policies/planning-artifacts.md`).

**Gate:** no `TASK-1xx` starts until `STATUS.md` records (a) the owner's M0 sign-off **and** (b) an APPROVE from the
independent review of the current M0 documents (TASK-006). Both are recorded (2026-11-15).

Every task: one primary requirement (`PR-*` from `PRD.md`) or accepted decision (`DEC-*`), risk class, explicit
paths, runnable `Done when`. Tenant-owned data always carries the tenant constraint: tenant resolved server-side
from membership; tenant in every cache/queue/storage/rate-limit key; a negative test (tenant A gets not-found on
tenant B's record).

---

## Done (archived verbatim — nothing deleted)

- **M0 (TASK-001..006):** all DONE 2026-11-15 → `docs/archive/TASKS-M0-2026-11-15.md`.
- **M1–M5 (TASK-101..599) + TASK-701, TASK-705, DEC-245..251:** all code-complete / CLOSED 2026-11-16..19 (final
  reviewer-carbon + GPT-6.1/6.2 Sol APPROVE; live on staging & production since 2026-11-18) →
  `docs/archive/TASKS-M1-M5-2026-11-25.md`.
- **TASK-601 (Partner relay in production):** DONE 2026-11-23 — Coolify `partner-relay` co-hosted on `99ribu-prod`
  (`149.28.129.53`, DEC-235), `RELAY VERIFY PASS 6/6`, production `relay-health` probe PASS (`BUILD-LOG.md`,
  `docs/runbooks/production-zones.md` §6).

## Plan conventions

- **Vertical ownership:** each feature task owns its tables (tenant or control migrations in its own files under
  `packages/db/migrations/{control,tenant}/<task-id>-*.sql`), backend, UI, tests and telemetry for its surface.
- **Shared files** (`wrangler.jsonc`, `apps/*/src/router.*`, `packages/db/src/schema/{control,tenant}.ts`, root
  `package.json`) are edited only by the task that owns the change and are merged by the integrating session
  (`docs/WORKFLOW.md` §7); parallel writers never share a worktree.
- **Every task's Done when** also includes: `pnpm check` green (using `vitest.config.ts`); for UI,
  `dotuiux check --surface admin` and device-local `admin-geometry.mjs` 0 fail at 390/1366, plus Playwright at
  390/768/1280 (`ROADMAP.md`); for new signals, the `OBSERVABILITY.md` row emitted and redaction-tested.

---

## Pending — Follow-up from the 2026-11-25 documentation refresh

Evidence, reproduce commands and owner decisions (all resolved in `DEC-255`, 2026-11-25):
[`docs/review/2026-11-25-docs-refresh-findings.md`](docs/review/2026-11-25-docs-refresh-findings.md) (F1–F8).
Order: TASK-706 → TASK-707 → the rest in any order. TASK-706 and TASK-707 block the next release.

### TASK-706: Hosted CI green on `main`
- **Requirement:** DEC-209 (non-impersonation), DEC-253 (staging gate needs a green `ci.yml` push run) — finding F1
- **Risk Level:** R4 (it changes a security gate)
- **Job:** fix
- **Capability:** `testing-engineering`, `application-security`
- **Allowed Paths:** `scripts/ci/route-scan-lib.mjs`, `scripts/ci/non-impersonation.test.mjs`,
  `apps/worker/src/do/gerai-vault/credentials/**`, `apps/worker/test/key-rotation/**`, `STATUS.md`, `BUILD-LOG.md`
- **Depends On:** —
- **Accepted Invariants:** no Super Admin code path creates, pays, edits or cancels a shipment; the allowlist grows
  only by a method whose body was read and classified, with a comment stating what it does; the scan's own
  mutation case (`createShipment`, aliased `cancelShipment`) still fails.
- **Done when:** `pnpm exec vitest run --project unit scripts/ci/non-impersonation.test.mjs` passes; `pnpm check`
  passes locally on the head; the hosted `ci.yml` push run for that head is green; an independent reviewer confirms
  in `docs/review/task-706/` that `syncSellerKeyFromPartner` is credential maintenance and not impersonation.

### TASK-707: Record and review the unrecorded work on `main` (`6ed284c`..`e43804d`)
- **Requirement:** `docs/WORKFLOW.md` §2, §5, §6 — finding F2
- **Risk Level:** R4 (the range contains a tenant migration, auth flows, provider calls and a deploy path)
- **Job:** review + record
- **Capability:** `cross-cli` (independent reviewer), `testing-engineering`
- **Allowed Paths:** `docs/review/unrecorded-2026-11-25/**`, `docs/evidence/**`, `DECISIONS.md`, `TASKS.md`,
  `STATUS.md`, `BUILD-LOG.md`, `docs/runbooks/production-zones.md`; code fixes only for review findings, each inside
  the files of the commit it concerns
- **Depends On:** TASK-706
- **Accepted Invariants:** nothing is relabelled as reviewed without a real separate-agent review of a diff artifact
  for the range; live state (deployed versions, remote schema version) is written down only after it was read from
  the environment with the owner's approval.
- **Done when:** a decision or task line exists for each feature in the range (demo account, map pin and geocode,
  contact history, `PageNav`, label redesign, per-INV status sync, seller-key sync, Mengantar discount adoption,
  DEC-254); `pnpm check` passes on the reviewed head; the review and its disposition are archived;
  `docs/runbooks/production-zones.md` §5.1/§6 state which Worker version and which control and tenant migrations are
  live on staging and production.

### TASK-708: Discount band versus `Tarik & Terapkan dari Mengantar`
- **Requirement:** DEC-233, DEC-255, spec 02 §2.1 — finding F4
- **Risk Level:** R3 (pricing rule)
- **Job:** decision, then fix
- **Capability:** `adr-record`, `testing-engineering`
- **Allowed Paths:** `DECISIONS.md`, `docs/spec/02-PRICING-DISCOUNT-AND-CASHBACK.md`,
  `apps/worker/src/pricing/{rules,quote}/**`, `apps/worker/test/pricing/**`, `apps/web-owner/src/routes/tarif/**`,
  `apps/web-owner/src/routes/gerai/detail.tsx`, `STATUS.md`, `BUILD-LOG.md`
- **Depends On:** owner decision recorded in DEC-255 (amend DEC-233 for adopted dynamic Mengantar discounts)
- **Accepted Invariants:** money flows keep using the provider net `N`; the audit row keeps the before and after
  value per service; walk-in customers keep paying the publish tariff.
- **Done when:** DEC-255 is recorded; `observedRegularBps`/`observedCargoBps` preserve exact per-expedition discounts
  without ±1 bp rounding drift; `apps/worker/test/pricing/rules.test.ts` asserts out-of-band adoption + bounded manual
  edits; spec 02 §2.1 states it without the "departs from DEC-233" note; the Super Admin confirmation text tells the
  admin that values outside the 20%–30% band are adopted and unquoted services are skipped.

### TASK-709: Staging must not create custom hostnames in the production zone
- **Requirement:** spec 11 §2, DEC-255 — finding F5
- **Risk Level:** R4 (host routing and a billable production resource)
- **Job:** fix
- **Capability:** `cloudflare-for-saas`, `wrangler`
- **Allowed Paths:** `wrangler.jsonc` (staging `CF_SAAS_ZONE_ID` only), `apps/worker/src/hostnames/**`,
  `apps/worker/test/hostnames/**`, `docs/spec/11-CLOUDFLARE-SAAS-HOSTNAMES-AND-TENANT-ROUTING.md`,
  `docs/runbooks/production-zones.md`, `STATUS.md`, `BUILD-LOG.md`
- **Depends On:** owner decision recorded in DEC-255 (custom domains switched off on staging)
- **Accepted Invariants:** production behaviour unchanged; staging mini-sites on `*-stg.geraimitra.com` keep working;
  no Cloudflare API call is made by a test.
- **Done when:** a Workers test proves that a custom-domain request with `GX_ENV = staging` and the production zone
  id creates nothing and answers an Indonesian refusal (`403 CUSTOM_DOMAIN_DISABLED_IN_STAGING`) with zero Cloudflare
  calls; spec 11 §2 loses its "config differs today" note.

### TASK-710: Rollback rule after DEC-254
- **Requirement:** DEC-254, DEC-255, ADR-0006 §4, `docs/WORKFLOW.md` §8 — finding F3
- **Risk Level:** R4 (tenant availability during a release)
- **Job:** decision, then fix or document
- **Capability:** `durable-objects`, `adr-record`
- **Allowed Paths:** `docs/adr/ADR-0006-storage-split-d1-control-plane-do-tenant-data.md`, `DECISIONS.md`,
  `docs/WORKFLOW.md`, `RELEASE.md`, `docs/runbooks/**`, `apps/worker/src/do/gerai-vault/index.ts` (`refusal` only),
  `apps/worker/test/storage/**`, `apps/worker/test/migrations/**`, `scripts/deploy/deploy.mjs`, `STATUS.md`,
  `BUILD-LOG.md`
- **Depends On:** owner decision recorded in DEC-255 (roll-forward only for a release with a tenant migration)
- **Accepted Invariants:** an object in `recovery` or unprovisioned still refuses; a failed migration step rolls back
  for that tenant alone; no object ever runs against a schema older than its code expects.
- **Done when:** a Workers test covers an object one version ahead of the code and asserts `TENANT_NOT_READY`; the
  rollback paragraph in `ADR-0006 §4`, `docs/WORKFLOW.md §8` and `RELEASE.md` states roll-forward only without the
  "check before relying on this" note; `scripts/deploy/deploy.mjs` warns before deploying a pending tenant migration.

### TASK-711: Demo account hardening
- **Requirement:** AGENTS §3.2 (tenant isolation), spec 05 §2, DEC-255 — finding F6
- **Risk Level:** R3
- **Job:** fix
- **Capability:** `application-security`
- **Allowed Paths:** `apps/worker/src/onboarding/service.ts` (`RESERVED_SLUGS`), `apps/worker/src/ops/seed-demo.ts`,
  `apps/worker/src/demo/**`, `apps/worker/src/api/app.ts`, `apps/worker/src/api-v1/keys.ts`,
  `apps/worker/test/demo/**`, `apps/worker/test/onboarding/**`, `docs/spec/05-IAM-SECURITY-AND-PRIVACY.md`,
  `docs/spec/06-DOMAINS-MENUS-AND-ROUTES.md`, `DECISIONS.md`, `STATUS.md`, `BUILD-LOG.md`
- **Depends On:** owner decision recorded in DEC-255 (public read-only demo login in production is intended)
- **Accepted Invariants:** the demo tenant never holds a live seller key or an API key; the read-only guard stays
  server-side; no real tenant row is ever rewritten by the seeder.
- **Done when:** tests prove that (1) registering slug `demo` is refused, (2) the seeder refuses (`409
  DEMO_SLUG_CONFLICT`) when slug `demo` belongs to a non-demo tenant, (3) the seeder works in `GX_ENV = production`,
  and (4) a `gx_live_` key cannot be created for, or used against, the demo tenant on `/api/v1` and `/mcp`.

### TASK-712: Release record and status hygiene
- **Requirement:** `docs/WORKFLOW.md` §8, `~/.config/ai/policies/planning-artifacts.md` (hot files) — finding F7
- **Risk Level:** R0 (records) + R1 (deploy script guard)
- **Job:** record
- **Capability:** `full-stack-development`
- **Allowed Paths:** `RELEASE.md`, `STATUS.md`, `TASKS.md`, `docs/archive/**`, `BUILD-LOG.md`,
  `scripts/deploy/deploy.mjs`, `docs/WORKFLOW.md`
- **Depends On:** TASK-707
- **Accepted Invariants:** `.delivery/**` is written only by `delivery-ledger`; finished contracts move to
  `docs/archive/` with one index line left behind, nothing is deleted.
- **Done when:** `RELEASE.md` describes the release being prepared with a real `Base`, risk and rollback reference;
  `TASK-601` in `STATUS.md` agrees with `BUILD-LOG.md`; `STATUS.md` is under 12 KB and `TASKS.md` under 50 KB with
  history moved to `docs/archive/`; `pnpm deploy:staging` and `pnpm deploy:production` refuse to run from a dirty
  tree or non-`main` branch and print the hosted `ci.yml` state before deploying.

### TASK-713: Smaller gaps from the refresh
- **Requirement:** spec 01 §2 (`entry_channel`), PR-11 (cashback), spec 07 §3.2, spec 10 §4.2, DEC-255 — finding F8
- **Risk Level:** R2 (items a, c, d, e, f) · R3 (item b, money)
- **Job:** fix
- **Capability:** `testing-engineering`
- **Allowed Paths:** per item — (a) `apps/worker/src/do/gerai-vault/dispatch/index.ts`, `apps/worker/test/api-v1/**`;
  (b) `docs/spec/02-PRICING-DISCOUNT-AND-CASHBACK.md`, `DECISIONS.md`; (c) `wrangler.jsonc` (`secrets.required`),
  `apps/worker/src/telemetry/checks.ts`, `apps/worker/test/telemetry/**`; (d) `apps/worker/src/admin/mengantar/index.ts`,
  `apps/worker/test/admin/**`; (e) `apps/worker/src/email/templates.ts`, `wrangler.jsonc`; (f) stale paths in docs
- **Depends On:** owner decision recorded in DEC-255 (cashback is config/display-only at launch)
- **Accepted Invariants:** integer Rupiah only; no change to how an existing shipment is stored; the Partner quota
  stays a single global writer.
- **Done when:** (a) `/api/v1` and `/mcp` drafts store `entry_channel = 'api_mcp'`; (b) DEC-255 + spec 02 state
  cashback is config/display-only at launch; (c) `MENGANTAR_PUBLIC_READ_KEY` is in staging/prod `secrets.required` and
  `areaSearchKeyConfigured` alerts when missing/placeholder; (d) `POST /sistem/mengantar/uji` reserves one call from
  `PartnerQuotaDO` and answers `429 RATE_LIMITED` when full; (e), (f) stale comments and paths are corrected.

---

## Pending — M6 remaining live owner items & Post-launch (P2)

### TASK-602: Production zones, SaaS setup, monitoring
- **Requirement:** DEC-228, spec 11 §2, `OBSERVABILITY.md` · **Risk Level:** R4 · **Depends On:** TASK-599
- **Status:** Live since 2026-11-18/23 (probes staging 5/5, production 6/6 PASS); remaining owner steps: set real
  `ALERT_WEBHOOK_URL` and confirm receipt of `alert-drill` messages.

### TASK-603: Backups and restore drill
- **Requirement:** ADR-0006 §7 · **Risk Level:** R3 · **Depends On:** TASK-602
- **Status:** Code + local drill DONE 2026-11-16; remaining owner step: remote scratch-environment restore drill
  (D1 Time Travel + two objects from R2).

### TASK-604: Live courier pilot and open registration
- **Requirement:** ROADMAP M6 · **Risk Level:** R4 · **Depends On:** TASK-601..603, TASK-112, TASK-706..713
- **Done when:** one real parcel per active courier hub-scanned (incl. masked labels); live invoice/balance match;
  `production-gate` PASS; owner opens registration.

### Post-launch (P2)
- **TASK-702** Sender stamp card (PR-23, P2, counsel first) · **TASK-703** Multi-outlet owner (PR-24, P2).
- **TASK-704** Shift & Laci Kasir UI (P2, DEC-241 — API, route, drawer math and tests kept; UI hidden until owner asks).

---

## Coverage map

| Milestone | Tasks | PRD requirements | Decisions / ADRs |
|---|---|---|---|
| **M1** | TASK-101..112, close 199 (archived) | PR-01, PR-04, PR-05 (math) | DEC-201, 202, 209–211, 215, 217, 227, 228; ADR-0001, 0002, 0006 |
| **M2** | TASK-201..208, close 299 (archived) | PR-02, PR-02b, PR-03, PR-11 | DEC-203–205, 209, 218, 219, 226, 230, 233; ADR-0003, 0004 |
| **M3** | TASK-301..311, close 399 (archived) | PR-05..10, PR-14, PR-15, PR-18 | DEC-206, 208, 212, 213, 218, 220–225, 229, 231; ADR-0004, 0005 |
| **M4** | TASK-401..405, close 499 (archived) | PR-12, PR-13, PR-16, PR-17, PR-20 | DEC-206, 216; ADR-0005 |
| **M5** | TASK-501..505, close 599 (archived) | PR-03, PR-19, PR-21 | DEC-202, 207, 214, 218, 228 |
| **M6** | TASK-601 (DONE), TASK-602..604 | production readiness | DEC-219, 228, 232, 235; ADR-0006 §7 |
| **Follow-up / Post-launch** | TASK-701, 705, DEC-245..251 (archived); TASK-706..713; TASK-702..704 | PR-22..24, 2026-11-25 refresh F1–F8 | DEC-241–255 |
