# Tasks — GeraiExpress v2 (`geraiexpress-cfv2`)

Updated: 2026-11-15

Open and in-progress tasks only, newest milestone first. Finished contracts move to `docs/archive/TASKS-<date>.md`
and leave one index line. Hard limit 50 KB (`~/.config/ai/policies/planning-artifacts.md`).

**Gate:** no `TASK-1xx` starts until `STATUS.md` records (a) the owner's M0 sign-off **and** (b) an APPROVE from the
independent review of the current M0 documents (TASK-006). `TASK-0xx` are pre-code design tasks and may run now.

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
  empty, filtered empty, error (states owner-deferred to M3 acceptance at M0 sign-off 2026-11-14; not built in the
  prototype). Rejected: 12–13 px text, icon tiles, gradients, two primaries per screen.
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

### TASK-005: Re-run dotuiux + admin-geometry after the DEC-222 palette change — DONE 2026-11-14 (`design/evidence/prototype-gates.md`)
- **Requirement:** DEC-222
- **Risk Level:** R0
- **Allowed Paths:** `design/evidence/prototype-gates.md`
- **Depends On:** working headless Chrome on the host
- **Done when:** `bash` gate script rows show 0 fail and admin-geometry exit 0 on all prototype routes.

### TASK-006: Independent review APPROVE of the M0 documents
- **Requirement:** ROADMAP M0 exit gate, `docs/WORKFLOW.md` §6
- **Risk Level:** R0
- **Job:** review
- **Allowed Paths:** `docs/review/**`, `STATUS.md`
- **Depends On:** TASK-003
- **Done when:** a reviewer of a different model family than the editor returns APPROVE on the current head, the
  review is archived under `docs/review/`, and `STATUS.md` records reviewer, model and head. GPT-6.1 Sol rounds 1–2
  were REQUEST_CHANGES (2026-11-14/15).

### TASK-002: Owner picks the visual direction — DONE 2026-11-14 (Direction A, `DESIGN.md`)
- **Requirement:** `DESIGN.md` Direction
- **Risk Level:** R0
- **Job:** review
- **Allowed Paths:** `DESIGN.md`
- **Depends On:** TASK-001
- **Done when:** 2–3 rendered directions (type and accent variants on the same shell) are shown; `DESIGN.md` records
  `Picked-by: owner <date> (direction X of N)`; `dotuiux validate` passes without the Picked-by warning.

### TASK-003: Owner signs off M0 — DONE 2026-11-14 (`STATUS.md`)
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
- **Depends On:** TASK-003, TASK-006
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
  plus property tests that no function returns a non-integer `_idr` value; the five `cod_fee_mode` rows of spec 02 §3.4
  (incl. `seller credit − sender payable = P − M`), the all-in negative-payout guard, and the `P = 12000`, net `9599` → cost
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
  unit test makes it red; `deploy-staging.yml` exists but its first run waits for the owner's approval of the
  staging Cloudflare resources.

### TASK-109: Host isolation test suite
- **Requirement:** `docs/spec/11` §3 and §8, ADR-0002
- **Risk Level:** R4
- **Job:** implementation
- **Capability:** `cloudflare-for-saas`, `application-security`, `testing-engineering`
- **Allowed Paths:** `apps/worker/test/isolation/**`, `apps/worker/src/host/**`
- **Depends On:** TASK-102, TASK-103, TASK-104
- **Done when:** worker tests prove the spec 11 §8 matrix for two seeded tenants and the platform hosts (cookies, API
  key, webhook token, `/lacak`, media keys), DCV paths pass through, unknown/pending host → neutral 404, suspended →
  403 within 30 s; a mutation that drops the tenant check from one route makes the suite fail.

### TASK-110: Email deliverability gate (Cloudflare Email Sending)
- **Requirement:** DEC-227, `docs/spec/12` §6
- **Risk Level:** R2
- **Job:** verification (needs owner approval for the sending-domain DNS change)
- **Allowed Paths:** `BUILD-LOG.md`, `STATUS.md`
- **Depends On:** TASK-104
- **Done when:** `BUILD-LOG.md` records, for `signup_otp` and `password_reset`, SPF/DKIM/DMARC `pass` and inbox
  placement at Gmail, Outlook.com and Yahoo (two sends each), delivery under 60 s and a tester score ≥ 9/10. Until
  this passes, production signup stays closed.

---

## Later milestones (break down when the previous milestone closes)

- **M2:** `mengantar-sdk` with path-key redaction; Partner transport `direct`/`relay` (spec 10); seller
  provisioning and BYOK fallback (PR-02); discount matrix (PR-11).
- **M3:** POS, courier selector, masking with quota and WA verification, printing, contacts, shift (PR-05..PR-10,
  PR-14, PR-15).
- **M4:** finance sync, `pay-unpaid`, pickup manifest, Meja Retur, claims (PR-12, PR-13, PR-16, PR-17, PR-20).
- **M3 additions (DEC-229):** Paket Massal Excel/CSV import + Riwayat Massal, Cek Resi, Cetak Resi Massal, Akun Saya;
  loading/empty/error states for every screen (deferred from TASK-001).
- **M5:** mini-site, brand site, OpenAPI + MCP (PR-03, PR-19, PR-21); custom-hostname flow (spec 11 §5) on staging.
- **M6:** relay on the VPS with Reserved IPv4, Cloudflare for SaaS zone setup (spec 11 §2), per-tenant DO backup and
  restore drill (ADR-0006), live courier pilot (DEC-219, spec 10 §6).
