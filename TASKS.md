# Tasks — GeraiExpress v2 (`geraiexpress-cfv2`)

Updated: 2026-11-13

Open and in-progress tasks only, newest milestone first. Finished contracts move to `docs/archive/TASKS-<date>.md`
and leave one index line. Hard limit 50 KB (`~/.config/ai/policies/planning-artifacts.md`).

**Gate:** no `TASK-1xx` starts until `STATUS.md` records the owner's M0 sign-off. `TASK-0xx` are pre-code design
tasks and may run now.

Every task: one primary requirement (`PR-*` from `PRD.md`) or accepted decision (`DEC-*`), risk class, explicit
paths, runnable `Done when`. Tenant-owned data always carries the tenant constraint: tenant resolved server-side
from membership; tenant in every cache/queue/storage/rate-limit key; a negative test (tenant A gets not-found on
tenant B's record).

---

## M0 — Design lock (pre-code)

### TASK-001: Prototype the app shell and key screens with mock data — DONE 2026-11-14 (`design/evidence/prototype-gates.md`)
- **Requirement:** DEC-213 (compact 6/5-menu navigation), `docs/visual/07`
- **Risk Level:** R1
- **Job:** implementation (throwaway prototype, not production code)
- **Capability:** `dotuiux` → `admin-product-ux` → `admin-dashboard` → `shadcn-ui`
- **Allowed Paths:** `prototype/**`
- **Protected Paths:** everything outside `prototype/`
- **Depends On:** None
- **Visual Contract:** admin surface, comfort size contract (`design/admin-contract.json`), tokens from `DESIGN.md`;
  shell per `docs/visual/07` §1 at 390/768/1366; screens: Dashboard (owner + Kasir variant), `/kiriman/:slug` POS,
  `/kiriman` list, `Kontak › Pengirim`, `Keuangan`, Super Admin `Ringkasan`; states: loading skeleton, first-run
  empty, filtered empty, error. Rejected: 12–13 px text, icon tiles, gradients, two primaries per screen.
- **Non-Scope:** real API calls, auth, D1.
- **Done when:** `dotuiux check <url> --surface admin` has 0 FAIL and `admin-geometry.mjs <url> --contract
  design/admin-contract.json --viewports 390,1366,1536` exits 0 on every listed screen.

### TASK-004: Prototype the period filter and settings sub-navigation — DONE 2026-11-14 (`design/evidence/prototype-gates.md`)
- **Requirement:** DEC-221, DEC-223 (`docs/visual/08`)
- **Risk Level:** R1
- **Job:** implementation (throwaway prototype)
- **Allowed Paths:** `prototype/**`
- **Depends On:** TASK-001
- **Done when:** the prototype shows the period filter (presets + two-month range calendar, phone sheet) and
  `/pengaturan` with the grouped sub-menu and three item pages; `dotuiux check --surface admin` 0 fail and
  `admin-geometry.mjs` exit 0 at 390/1366/1536 on those routes.

### TASK-002: Owner picks the visual direction
- **Requirement:** `DESIGN.md` Direction
- **Risk Level:** R0
- **Job:** review
- **Allowed Paths:** `DESIGN.md`
- **Depends On:** TASK-001
- **Done when:** 2–3 rendered directions (type and accent variants on the same shell) are shown; `DESIGN.md` records
  `Picked-by: owner <date> (direction X of N)`; `dotuiux validate` passes without the Picked-by warning.

### TASK-003: Owner signs off M0
- **Requirement:** ROADMAP M0 exit gate
- **Risk Level:** R0
- **Job:** review
- **Allowed Paths:** `STATUS.md`
- **Depends On:** TASK-002
- **Done when:** `STATUS.md` records the sign-off date and any open M0 item the owner accepts as deferred.

---

## M1 — Monorepo, multi-host Worker, D1, auth, `GeraiVaultDO`

### TASK-101: Scaffold the pnpm workspace and Worker
- **Requirement:** ADR-0001 (Cloudflare serverless stack)
- **Risk Level:** R2
- **Job:** implementation
- **Capability:** `wrangler`, `workers-best-practices`, `native-first`
- **Allowed Paths:** `package.json`, `pnpm-workspace.yaml`, `tsconfig*.json`, `apps/worker/**`, `packages/domain/**`,
  `packages/db/**`, `.gitignore`, `.dev.vars.example`
- **Protected Paths:** `docs/**`, root contract files
- **Depends On:** TASK-003
- **Accepted Invariants:** no Next.js/OpenNext; no source maps in production output (AGENTS.md); bindings named as
  `docs/spec/07` §3.1.
- **Done when:** `pnpm install && pnpm check` passes on a clean clone (typecheck, lint, empty unit and worker test
  suites); `wrangler dev` answers `200` on `http://app.geraiexpress.localhost:8787/healthz`.

### TASK-102: Host classifier and host-locked cookies
- **Requirement:** ADR-0002 (dual-domain white-label SaaS)
- **Risk Level:** R3
- **Job:** implementation
- **Allowed Paths:** `apps/worker/src/host/**`, `apps/worker/test/host/**`
- **Protected Paths:** `apps/worker/src/auth/**`
- **Depends On:** TASK-101
- **Accepted Invariants:** the five contexts in `ARCHITECTURE.md` §3; cross-context paths return 404; `relay.` is
  never served by the Worker (`docs/spec/10` §5).
- **Done when:** worker tests prove: each `.localhost` host maps to its context; `/api/owner/*` on `app.` → 404;
  an `app.` cookie is not accepted on `owner.` and vice versa; unknown `*.gerai.cc` slug → 404 page.

### TASK-103: D1 schema and tenant-scoped repositories (core tables)
- **Requirement:** `docs/spec/01` §2 (data model)
- **Risk Level:** R3
- **Job:** migration
- **Capability:** `postgres-drizzle` patterns adapted to D1
- **Allowed Paths:** `packages/db/**`
- **Depends On:** TASK-101
- **Accepted Invariants:** money integer IDR, rates integer bps, weight integer gram; `NULL` ≠ `0`; composite
  `(tenant_id, slug)` PK on `shipments`; tables for users, sessions, email_otps, super_admins, tenants,
  tenant_members, tenant_outlets, tenant_business_profiles, platform_legal_profile, mengantar_connections,
  sender_contacts, recipient_contacts, audit_logs.
- **Done when:** `pnpm db:generate` produces a forward-only migration; `pnpm db:migrate:local` applies it; a
  repository test shows tenant A gets not-found on tenant B's contact and shipment.

### TASK-104: Email OTP sign-up, sessions and Kasir invitations
- **Requirement:** PR-01
- **Risk Level:** R3
- **Job:** implementation
- **Capability:** `application-security`
- **Allowed Paths:** `apps/worker/src/auth/**`, `apps/worker/test/auth/**`, `packages/db/src/auth/**`
- **Depends On:** TASK-102, TASK-103
- **Accepted Invariants:** spec 05 §2 (PBKDF2-SHA256 100k + 16-byte salt + pepper; SameSite=Lax + Origin check;
  Bearer-only on `/api/v1` and `/mcp`); Indonesian OTP mail via Mailpit locally.
- **Done when:** worker tests cover sign-up → OTP → password → session; OTP expiry and the 5-wrong/15-minute lock (spec 05 §2);
  invitation link is single-use and expires in 7 days; PBKDF2 100k runs inside `workerd` without hitting limits.

### TASK-105: Super Admin TOTP (`aal2`)
- **Requirement:** DEC-209, spec 05 §2
- **Risk Level:** R3
- **Job:** implementation
- **Allowed Paths:** `apps/worker/src/auth/totp/**`, `apps/worker/test/auth/totp/**`
- **Depends On:** TASK-104
- **Done when:** worker tests prove `owner.` routes reject a session without `aal2`; a sensitive mutation more than
  15 minutes after the last TOTP demands re-TOTP (spec 05 §2); no route lets Super Admin create or pay a shipment.

### TASK-106: `INV` slug allocator in `GeraiVaultDO`
- **Requirement:** PR-04, DEC-211
- **Risk Level:** R3
- **Job:** implementation
- **Allowed Paths:** `packages/domain/src/slug/**`, `apps/worker/src/do/gerai-vault/**`, matching tests
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
- **Depends On:** TASK-101
- **Accepted Invariants:** integers only; `billed_kg` rules incl. sub-kg and 1 kg-minimum couriers; COD gross-up
  applied once; insurance `NULL` stays `NULL`; unit-mistake guard thresholds (`< 10` gram, `>= 100` kg).
- **Done when:** unit tests cover every worked example in spec 02 and visual 05 with exact Rupiah results,
  plus property tests that no function returns a non-integer `_idr` value.

---

## Later milestones (break down when the previous milestone closes)

- **M2:** `mengantar-sdk` with path-key redaction; Partner transport `direct`/`relay` (spec 10); seller
  provisioning and BYOK fallback (PR-02); discount matrix (PR-11).
- **M3:** POS, courier selector, masking with quota and WA verification, printing, contacts, shift (PR-05..PR-10,
  PR-14, PR-15).
- **M4:** finance sync, `pay-unpaid`, pickup manifest, Meja Retur, claims (PR-12, PR-13, PR-16, PR-17, PR-20).
- **M5:** mini-site, brand site, OpenAPI + MCP (PR-03, PR-19, PR-21).
- **M6:** relay on the VPS with Reserved IPv4, custom hostnames, live courier pilot (DEC-219, spec 10 §6).
