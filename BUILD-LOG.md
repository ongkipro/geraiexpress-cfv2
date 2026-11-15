# Build Log — GeraiExpress v2 (`geraiexpress-cfv2`)

Durable implementation changes, validation evidence and gotchas for the next maintainer. Current state lives in
`STATUS.md`; decisions in `DECISIONS.md`.

## 2026-11-15 — M0 locked

- Scope: documentation-first specification (PRD PR-01..24, DEC-201..229, ADR-0001..0006, specs 01–12, visual 01–08,
  research 01–03, `docs/WORKFLOW.md`, `docs/DIAGRAMS.md`) and a throwaway Vite + React prototype (`prototype/`).
- Evidence: owner sign-off 2026-11-14 (Direction A, DEC-226); independent review APPROVE by GPT-6.1 Sol round 10 on
  `702262f` after rounds 1–9 (archive `docs/review/`); prototype gates 0 fail on 12 routes at 390/1366/1536
  (`design/evidence/prototype-gates.md`); worked money examples recomputed by script; status ordering rule checked by
  a 30,000-case permutation simulation (0 order-dependent outcomes); 14 Mermaid diagrams render with mermaid 12.3.
- Gotchas found on the way (also in `docs/WORKFLOW.md` §9):
  - Chrome 157 headless on Linux loads no http(s) page without `--password-store=basic`.
  - D1 is 10 GB per database and cannot be increased → tenant data lives in per-gerai SQLite Durable Objects.
  - Mengantar polling dates have minute precision and webhook headers second precision → minute-bucket ordering.
  - GitHub tables split on `|` inside backticks → escape as `\|`.
- Not done: no application code, no deploy, no Cloudflare resources, no Mengantar call.

## 2026-11-15 — Execution plan approved

- `TASKS.md` holds 50 contracts for M1–M6 (incl. milestone-close tasks `x99`) plus post-launch `701..703`, with a
  coverage map: every P0 PR, DEC-201..229 and ADR-0001..0006 is owned by a task.
- Evidence: GPT-6.1 Sol plan review rounds 1–2 REQUEST_CHANGES, round 3 APPROVE
  (`docs/review/2026-11-15-sol-plan-round{1,2,3}-review.md`); scripted checks: all fields present, dependency graph
  acyclic, no forward-milestone dependency, every M2–M6 task gated by the previous milestone close, TASK-604 closure
  covers every task, no tenant-data task below R3, TASKS.md 43.5 KB (< 50 KB).
- `docs/DIAGRAMS.md`: 14 Mermaid diagrams render with mermaid 12.3 (checkout and finance diagrams re-rendered after
  the plan review corrections).

## 2026-11-15 — DEC-230..232 (discount control, per-gerai masking, Vultr egress)

- Sandbox Partner API (4 seller routes) and Public API (24 endpoints) checked: no request field sets a seller
  discount; discount appears only in estimate/order responses; no 30 % limit stated in the docs. Hence DEC-230:
  configurable ceiling (`max_discount_bps` 3000), Mengantar-team application, verification by observed discount per
  service class (cargo uses cargo fields).
- DEC-231 adds `Pengaturan › Label & Privasi`; DEC-232 picks a Vultr Reserved IPv4 and replaces the Q23 blocker with
  Public API hardening + alerts (spec 10 §4.4).
- Evidence: GPT-6.1 Sol delta review round 1 REQUEST_CHANGES (6 findings), round 2 APPROVE; both P2 notes closed.

## 2026-11-15 — DEC-233 and final documentation audit

- DEC-233: every gerai starts at 20 % discount (also the minimum); Super Admin may raise it up to 30 %; changes are
  applied on the Mengantar account by the Mengantar team and verified automatically. Spec 02 fixture updated to a
  valid not-yet-applied case (requested 25 %, Mengantar 20 %).
- Final audit (scripted): 0 broken links, 0 missing section references, 0 broken tables, 0 misaligned wireframes,
  14/14 Mermaid diagrams render, no secrets or real phone numbers, no stale superseded terms; TASKS.md: 50 contracts,
  all fields present, acyclic, no forward-milestone dependency, every M2–M6 task gated, every P0 PR, DEC-201..233 and
  ADR-0001..0006 owned, every UI task has a Visual Contract, no tenant-data task below R3; TASKS.md 45.8 KB, STATUS.md
  4.0 KB.

## 2026-11-16 — TASK-101 workspace scaffold (M1)

- Scope: pnpm workspace (`apps/{worker,web-app,web-owner}`, `packages/{domain,db,mengantar-sdk,thermal-print}`),
  `wrangler.jsonc` with every spec 07 §3 binding (placeholder resource ids; staging stub), Workers Vitest integration
  (`@cloudflare/vitest-plugin` 1.8.2, Vitest 4.1), Vite 8 + React 19 + TanStack Router/Query SPAs built into
  `dist/assets/{app,owner}` and served by the Worker only on their own host, comfort primitives copied from the M0
  prototype, Direction A theme, bundle audit (`scripts/ci/bundle-audit.mjs`).
- Evidence: `pnpm check` exit 0 (also on a clean copy with `pnpm install --frozen-lockfile`); dotuiux 0 fail and
  admin-geometry exit 0 on both shells; reviewer-carbon round 1 REQUEST_CHANGES (9 findings fixed), round 2 APPROVE.
- Gotchas:
  - An empty `packages/db/migrations/control/` is not committed by Git; `readD1Migrations` then throws ENOENT on a clean
    clone — keep `.gitkeep` files.
  - Dropping shadcn's `@custom-variant dark (&:is(.dark *))` makes Tailwind v4 compile `dark:*` under
    `prefers-color-scheme`, so a light-only app (DEC-222) half-darkens on OS dark mode.
  - Wrangler 4.162: declaring `secrets.required` turns `.dev.vars` into an allowlist (`vars ∪ secrets.required`); list
    every secret there or it silently disappears from `env` and generated types.
  - `.sql` files import as Text modules both in `wrangler deploy --dry-run` bundles and in the Workers Vitest pool.

## 2026-11-16 — TASK-103 storage foundation + TASK-102 host classifier (M1, R4)

- Scope: D1 control baseline (`tenants`, `tenant_members`, `tenant_schema_versions`, `tenant_hostnames`,
  `audit_logs`, `shipment_index`); tenant baseline in every `GeraiVaultDO` (`tenant_settings`,
  `tenant_business_profiles`, `tenant_outlets`, `audit_logs`, `outbox`); Drizzle schemas for both tracks;
  `migrate(version)` RPC, `vault_identity` binding, versioned absolute-upsert outbox; `POST /internal/ops/do-migrate`
  + `pnpm do:migrate`; host classifier with D1 lookup, neutral 404/403/503, DCV and HMAC probe; cross-context guards.
- Evidence: `pnpm check` exit 0 (73 Workers tests); local `do:migrate` dry run → run → re-run; mutations caught
  (suspended → 403, multi-label tenant names, outbox version guard, foreign tenant id, app-host API guard);
  reviewer-carbon round 1 REQUEST_CHANGES (7 findings fixed), round 2 APPROVE.
- Decisions recorded in code/spec: tenant `recovery` lives in D1 `tenant_schema_versions.state` (tenants.status keeps
  the business lifecycle); probe HMAC is over `host ":" nonce` (spec 11 updated).
- Gotchas:
  - A DO state probe that runs `CREATE TABLE IF NOT EXISTS` writes storage (and pins placement) even in a dry run;
    probe `sqlite_master` read-only and create tables only inside `migrate`.
  - Concurrency tests on two DO RPCs flake under `nice`; assert the end state, not the overlap.
  - Numeric/hex/shorthand IPv4 (`0x7f.0.0.1`, `127.1`) pass a label regex; require the last label to start with a letter.

## 2026-11-16 — TASK-107 money/weight math + TASK-108 INV slug (M1, R3)

- Scope: `packages/domain` (`money`, `weight`, `slug`), tenant migration `0002_inv_slugs`, `allocateSlug`
  (synchronous, inside callers' transactions) and refusal-as-data RPCs (`{ ok:false, refused }`).
- Evidence: 52 domain unit tests incl. every spec 02 §3.4 row, 9599, not-yet-applied fixture (M = 9.000, N = 9.600),
  insured Laba Kas 5.400, COD-fee fixed point and `COD_FEE_UNSTABLE`, 2,000-case property test; 10,000 slugs → 0
  duplicates; reviewer-carbon round 1 REQUEST_CHANGES (7 findings fixed), round 2 APPROVE.
- Gotchas: `sender_bears_fee` can go negative when `G < F` on long-haul routes — rejected (`COD_FEE_EXCEEDS_GOODS`);
  `Number("")` is `0`, so a blank `COD_FEE` must be parsed strictly or it silently matches `F = 0`; BigInt division
  truncates toward zero, so `mulDivFloor` only accepts non-negative operands.

## 2026-11-16 — TASK-110 observability base (M1)

- Shipped: `packages/telemetry` (bounded-label events, redaction of URL-path keys, reset/invite/webhook tokens,
  sensitive query params, session cookies, Bearer/Basic/JWT/`gx_` keys, formatted Indonesian phones, OTPs incl.
  TOTP and 4-digit codes; Public API anomaly evaluators for `IP_NOT_ALLOWED`, 401/403 spikes, 3× volume);
  `apps/worker/src/telemetry` (`*/5` operator checks, owner alerts via `ALERT_WEBHOOK_URL`, D1 `alert_state` de-dup
  with claim release on failed delivery); `scripts/probes` (`pnpm probes --env`, staging host mapping, relay only in
  production, `--force-fail` drill, `--alert-dry-run`); `docs/SYSTEM-MAP.md` v1.
- Evidence: `pnpm check` green; `pnpm probes --env local` 5/5 PASS against `wrangler dev`; forced-failure drill
  printed the Indonesian alert and exited 1; mutation (URL-key rule removed) → 3 tests red. Carbon round 1 findings
  fixed; re-review in the final pass (owner directive).
- Awaiting owner: staging `ALERT_WEBHOOK_URL` (chat incoming webhook) → `wrangler secret put --env staging`.

## 2026-11-16 — TASK-104 email outbox and mailer (M1)

- Shipped: control migration `0002_email_outbox` (`email_outbox`, `email_suppressions`, `platform_legal_profile`
  singleton with NULL fields), `apps/worker/src/email` (`enqueueEmailStatement` for same-batch inserts,
  `dispatchDue`/`sendOne` as the only `env.EMAIL.send` caller, six Indonesian templates), `crypto/aead.ts`
  (AES-256-GCM, HKDF-derived per purpose from `KEK_SECRET`), `*/5` cron dispatch.
- Evidence: 14 Workers tests (fake clock backoff 30 s/2 min/5 min, max 4, expiry, crash between claim and send,
  suppression terminal + later mail skipped, permanent errors, template snapshots, link allowlist, HTML escaping);
  mutation (expiry guard) red. Review deferred to the final Carbon pass.
- Note: `send_email` error codes used as terminal vs retryable follow the Workers API page (2026-11-16); the page does
  not label retryability, so only `E_INTERNAL_SERVER_ERROR`, rate/daily limits and unknown codes are retried.
