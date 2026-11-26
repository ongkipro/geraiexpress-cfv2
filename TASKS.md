# Tasks — GeraiExpress v2 (`geraiexpress-cfv2`)

Updated: 2026-11-26

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
- **TASK-706..TASK-713 (2026-11-25 docs-refresh findings F1–F8, DEC-255) + Kasir UX & `pollStatus` auto-reconcile:**
  all DONE 2026-11-25 (`c1f3221..4d0bafc`, hosted `ci.yml` run `45660870990` green, `claude` + `cx/gpt-6.2-sol` R4
  APPROVE) → `docs/archive/TASKS-706-713-2026-11-26.md`.

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

## Ready to commit & deploy

### TASK-714: `/panduan` illustrated user guide (`geraiexpress.com/panduan`)
- **Requirement:** Owner request 2026-11-25, `docs/visual/09` §3.1 & §7, `DESIGN.md` C4/C5
- **Risk Level:** R2 (public SSR marketing page + static WebP allow-list + local capture scripts)
- **Status:** READY TO COMMIT (`panduan-final` on `4d0bafc`) — `pnpm check` 67/67 (502/502 Workers), `e2e/brand.spec.ts`
  390/1280 PASS, `check-page.mjs` 11/11 pages 0 fail 0 warn, `dotuiux check` 0 fail, `cx/gpt-6.2-sol` R4 **APPROVE**
  (`docs/review/panduan/`); awaiting owner commit/merge/push and deploy approval.

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
| **Follow-up / Post-launch** | TASK-701, 705, DEC-245..251, TASK-706..713 (archived); TASK-714 (`/panduan`); TASK-702..704 | PR-22..24, 2026-11-25 refresh F1–F8, `/panduan` | DEC-241–255 |
