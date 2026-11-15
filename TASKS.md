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
- **Requirement:** ADR-0001 (Cloudflare serverless stack)
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
- **Requirement:** PR-05, `docs/spec/02`
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

### Later milestones (break down into TASK contracts when the previous milestone closes)

Coverage map: every accepted requirement and decision has exactly one delivering milestone. M1 items are the task
contracts above; later rows become `TASK-2xx..6xx` contracts at the start of their milestone.

| Milestone | PRD requirements | Decisions / ADRs implemented | Specs |
|---|---|---|---|
| **M1** | PR-01, PR-04, PR-05 (math) | DEC-201, 202, 209, 210, 211, 215, 217, 227, 228; ADR-0001, 0002, 0004, 0006 | 01 §0–2, 05, 07, 11 §3, 12 |
| **M2** | PR-02, PR-02b, PR-11 | DEC-203, 204, 205, 219 (sandbox `direct` transport), 226; ADR-0003 | 02 §2, 06, 09 (connections), 10 (client side) |
| **M3** | PR-05 (UI), PR-06, PR-07, PR-08, PR-09, PR-10, PR-14, PR-15, PR-18 | DEC-206 (masking), 208, 212, 213, 218 (settings forms), 220, 221, 222, 223, 224, 225, 229; ADR-0005 (masking) | 02 §3, 03, visual 01–08 |
| **M4** | PR-12, PR-13, PR-16, PR-17, PR-20 | DEC-206 (return intake), 216; ADR-0005 (Meja Retur) | 01 §2.7 + §3, 04, 09 |
| **M5** | PR-03, PR-19, PR-21 | DEC-207, 214, 218 (public footer), 228 (custom-domain flow on staging) | 08, 11 §5–8, visual 03 |
| **M6** | — (production readiness) | DEC-219 (relay in production), 228 (SaaS zone in production); ADR-0003, 0006 §7 (backups) | 10 §6, 11 §2, OBSERVABILITY |
| **Post-launch** | PR-22 (P1), PR-23 (P2), PR-24 (P2) | — | 03, visual 07 |

Milestone notes carried forward:
- **M3 additions (DEC-229):** Paket Massal Excel/CSV import + Riwayat Massal, Cek Resi, Cetak Resi Massal, Akun Saya;
  loading/empty/error states for every screen (deferred from TASK-001).
- **M2/M4 sandbox verifications:** weight echo, `POST /time` timezone, `/invoices` ordering, `pay-unpaid`
  idempotency, item-value limits per courier (specs 02, 04, 09).
- **Before M2:** Mengantar answer on per-seller discount control (DEC-226).
- **Before M3 masking is advertised:** counsel review (Permenkomdigi 8/2025 Art. 77, UU PDP retention).
