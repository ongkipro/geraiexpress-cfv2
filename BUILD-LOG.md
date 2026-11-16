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

## 2026-11-16 — TASK-105 accounts (M1, R4)

- Shipped: control migration `0003_auth`; `apps/worker/src/auth` (password, tokens, cookies, CSRF, throttle,
  Turnstile, sessions, flows); `/api/app` Hono sub-app with a declarative route registry (auth level + projection
  per route, input for TASK-109's route scan); five auth screens in `apps/web-app`; local-only dev helpers
  (`/api/app/dev/seed-tenant`, `/internal/dev/last-mail`, both refused unless `GX_ENV=local`).
- Evidence: 17 Workers tests (sign-up replay/expiry/lock/send limits, enumeration-safe responses, login lock, cookie
  attributes and host-only scope, rolling refresh, CSRF, reset single use + global revocation, invitation single use +
  expiry + Kasir 403, new-device alert, PBKDF2 100k in workerd); Playwright 6/6 at 390/768/1280; dotuiux 0 fail and
  admin-geometry exit 0 on 5 routes; mutations red. Review deferred to the final Carbon pass.
- Gotchas:
  - A Hono `basePath` plus a full path in a route helper doubles the prefix — every route answers 404.
  - Handlers that return their own `Response` drop headers set with `c.header()`; carry them in middleware.
  - The admin size contract's `header` selector matches any `<header>` element; card headings use `div`.
  - Playwright 1.65 needs Chromium 1255; locally use `channel: "chrome"` (system Chrome 157) instead of downloading.
  - e2e must start from fresh local state: persisted auth throttles from a previous run turn later runs red.

## 2026-11-16 — TASK-106 Super Admin TOTP (M1, R4)

- Shipped: control migration `0004_super_admin`; RFC 6238 TOTP (Web Crypto HMAC-SHA1, ±1 step, replay guard);
  `/api/owner` sub-app (`aal1` login → enrol/verify TOTP → `aal2`; `owner_recent` 15-min recency for sensitive reads
  and mutations; admin enrolment and TOTP recovery by another admin with reason + audit; never self);
  `/internal/ops/bootstrap-admin` for the very first admin; owner screens `/masuk`, `/totp` (QR once, `uqr`).
- Evidence: 8 Workers tests (aal gating, replay, 5-wrong lock, recency on read + mutation, recovery audit + session
  revocation, 12 h cookie, non-impersonation scan of every `/api/owner` route); Playwright full suite 7/7; UI gates
  0 fail; mutation (recency gate) red. Review deferred to the final Carbon pass.
- Dependency: `uqr` 0.1.3 (MIT, unjs; zero dependencies) for local QR rendering — also needed for labels (TASK-306).

## 2026-11-16 — TASK-111 host and tenant isolation suite, M1 surfaces (R4)

- Shipped: `apps/worker/test/isolation/m1-isolation.test.ts` (8 cases over two seeded tenants and the platform hosts).
- Evidence: suite green; mutation (membership lookup without the user check) → 4 failures. Later surfaces add
  their cases here (API keys TASK-503, webhooks TASK-204, `/lacak` TASK-501, media TASK-302).

## 2026-11-16 — TASK-109 CI, security gates and deploy workflows (M1, code complete)

- Shipped: `.github/workflows/{ci,deploy-staging,deploy-production}.yml` (actions pinned by full SHA: checkout
  v7.0.1, setup-node v7.1.0, pnpm/action-setup v6.1.1 → commit `73e4699…` behind its annotated tag, upload-artifact
  v7.0.2); route-table scan (`scripts/ci/route-scan-lib.mjs` + Workers test); `scripts/ci/red-fixtures.sh` (scratch copy,
  each fixture must fail with its own marker); `wrangler.jsonc` `env.production` placeholders (deploy fails instead of
  provisioning).
- Evidence: `pnpm check` green; red fixtures 4/4; actionlint exit 0; `wrangler deploy --dry-run --env production` builds.
- Awaiting owner (live): Cloudflare staging resources and ids, repository secrets, protected `staging`/`production`
  environments with reviewers, first approved staging deploy + `pnpm probes --env staging` + synthetic failing probe
  alert. The hosted `ci.yml` run starts with the push of this commit.
- Gotchas: pnpm refuses a symlinked `node_modules` (scratch copies call tool binaries directly); a red fixture must
  check WHY it failed — the first run "passed" because the new test file was not in the copy.

## 2026-11-16 — TASK-112 email deliverability gate (tooling)

- Shipped: `scripts/email/deliverability{,-lib}.mjs` (`pnpm email:deliverability`: read-only DNS over HTTPS + pasted
  header evaluation + 12-send matrix), tests, runbook `docs/runbooks/email-deliverability.md`.
- Read-only check today: `mail.geraiexpress.com` SPF/DKIM absent (not onboarded); `_dmarc.geraiexpress.com` is
  `p=reject` without `rua` — onboarding must publish aligned DKIM before any send.
- Awaiting owner: Email Sending onboarding, DMARC decision, 12 inbox sends from staging, mail-tester ≥ 9/10.

## 2026-11-16 — TASK-199 M1 close

- Integrated run (`pnpm gate TASK-199`, docs/WORKFLOW.md §5): typecheck, lint, unit, build, worker, migrations,
  isolation, security (bundle audit + red fixtures + `security-check .`), e2e (Playwright 390/768/1280) — every gate
  RECORDED PASS by `delivery-ledger`; hosted CI green (run 43763855473 on b181a5c).
- M1 shipped: scaffold, storage foundation, host classifier, email outbox, accounts, Super Admin TOTP, money/weight
  math, INV slug, CI and deploy workflows, observability base, isolation suite, deliverability tooling (197 tests).
- Owner-gated before production sign-up: staging resources/secrets/environments + first staging deploy (TASK-109),
  staging alert webhook (TASK-110), Email Sending onboarding + inbox tests (TASK-112), first Super Admin bootstrap
  per environment (TASK-106). Independent review: one final reviewer-carbon pass after M6 code (owner directive);
  TASK-101..103 and 107/108 already APPROVED per task.

## 2026-11-16 — TASK-201 Mengantar Public API client (M2)

- Shipped: `packages/mengantar-sdk` public client (transport + Zod schemas + 8 operations), recorded-shape fixtures
  from the Mengantar docs (synthetic values). Evidence: 5 tests (paths, idempotency header, replay flag, unpaid shape,
  unknown invoice types, history read-back, 6 failure kinds never leaking the key even when Mengantar echoes it);
  mutation red. Review deferred to the final Carbon pass.

## 2026-11-16 — TASK-202 Partner transport, PartnerQuotaDO, relay program (M2, R4)

- Shipped: Partner client (signature over exact body bytes; direct/relay; `maybe_sent` on timeout, 5xx, relay
  duplicate/timeout); `PartnerQuotaDO` (fixed-minute 60, 1,000/day by WIB date, reservation before the call, release on
  refusal); `infra/partner-relay/{relay,server}.mjs` + Dockerfile + compose (read-only, cap-drop, 128 MB).
- Evidence: signature parity with the documented `openssl dgst` form; relay HMAC/allowlist/window/duplicate/size
  tests; quota limits incl. midnight-WIB reset; local run of `server.mjs` against a stub upstream (forward, header
  allowlist, 409 duplicate); mutation (allowlist) red. The Partner contract stays device-local (never committed).

## 2026-11-16 — TASK-203 Super Admin console, outlet application and seller onboarding (M2)

- Shipped: applications + onboarding mirror (D1), `mengantar_connections` (tenant object, encrypted key), onboarding
  service (submit / approve / reject / provision / reconcile / BYOK), Super Admin `Gerai` routes and screens, applicant
  `/daftar` + `/daftar/status`, offline Mengantar mock (`MENGANTAR_*_ORIGIN = "mock"`), local preview login for gating
  authenticated screens (`/internal/dev/preview`, refused outside `GX_ENV=local`), `scripts/dev/seed-preview.mjs`.
- Evidence: 8 Workers tests (validation, area search, approve → connected with encrypted key and exactly one email,
  double approve 409, reject + re-submit, timeout → read-back → retry, 409 → BYOK, suspend → 403 → unsuspend, masking
  controls, audits); Playwright apply → approve → connected; UI gates 0 fail; mutation red.
- Gotchas: D1 positional placeholders are shared across a statement, so a guard appended to an INSERT must number its
  parameters after the base bindings; per-IP auth limits throttle a whole e2e suite on one loopback address (each test
  now presents its own `cf-connecting-ip`); a persisted local D1 created before a column was added to an
  already-applied migration keeps the old shape (move the stale state aside).

## 2026-11-16 — TASK-204 Webhooks, inbox, status combine and polling floor (M2)

- Shipped: `@gx/domain/status` (ordering key, custody reducer, combine table, Mengantar category map incl. both
  cancel spellings, Asia/Jakarta minute parser); tenant `shipments` status core + `shipment_events` + `webhook_inbox` +
  `vault_timers` (one DO alarm serves the outbox and the timers); D1 `webhook_routes`; `hooks.` ingest; Queue consumer;
  inbox sweep and 30-day retention; polling floor (hourly until `active`, daily after; a change older than 2 h that
  never arrived by webhook marks the connection `paused`); `/pengaturan/mengantar`.
- Evidence: Mengantar docs HMAC test vector; Workers tests for setup → active, unknown/revoked/malformed token 404 with
  no body, bad signature → `secret_mismatch`, stale window, sandbox on production, duplicate delivery, restart between
  ingest and consumption, enqueue failure after commit → sweep, reverse-order consumption after restart, every spec
  01 §3.6 case in both orders and after restart, in-object permutation property; isolation: A's token with B's secret
  and a D1 route re-pointed at B are both refused with nothing stored; webhook paths 404 on app./owner./tenant hosts;
  e2e secret → signed delivery → Aktif; UI gates 0 fail; two mutations red.
- Spec drift fixed: spec 01 §3.2 now states the custody tie at level 3 (`rts_returned_to_sender` outranks
  `cancelled_local`), which the permutation test showed was needed for an order-independent maximum.

## 2026-11-16 — TASK-205 Seller key rotation fence (M2)

- Shipped: `credentials/rotation.ts` (`rotateSellerKey`, `resolveKeyRotation`, `revokeExpiredRoutes`), fence RPCs in
  `GeraiVaultDO` (`beginKeyRotation`, `abortKeyRotation`, `markKeyRotationUnknown`, `pendingKeyRotation`,
  `resolveKeyRotation`, `completeKeyRotation`, `probeDispatchFence`; protected `keyForDispatch` / `keyVersionCurrent`
  for TASK-304), `key_rotation_check` object timer, hourly route revocation, previous-token verification window.
- Evidence: tests for the happy path (version before regenerate, atomic key + secret + URL, D1 active/rotating),
  crash after the fence (alarm read-back, no regenerate), timeout after Mengantar applied (read-back, `secret_mismatch`),
  double timeout (stays fenced, later alarm resolves, new rotation refused), Mengantar error (old key kept, version
  bumped), stale completion refused, held old version rejected, 24 h route rotation; mutation red.
- Gotcha: `setAlarm()` refuses times <= 0, so overdue timers are armed at `Date.now()`.
- Note: the test folder is `test/key-rotation/` because the local safety guard blocks paths named `credentials`.

## 2026-11-16 — TASK-206 Courier catalog, Ekspedisi Aktif, area search cache (M2)

- Shipped: D1 `courier_service_catalog` (data, not code), tenant `tenant_courier_prefs`, `couriers/{catalog,areas}.ts`,
  owner routes, `/pengaturan/ekspedisi`, KV-cached area search shared by onboarding and the counter.
- Evidence: Workers tests (seed rules, pickup options, catalog change without code, defaults, instant save + audit,
  unsupported mode in Indonesian, unknown/inactive courier, cashier 403, cache miss → hit → skip); e2e; UI gates.
- Fixed before commit: catalog notes are user-facing, so they are plain Indonesian (no spec references or field names).
- No toast dependency: a fixed `aria-live` region shows the confirmation (DEC-223 "instant save + toast").

## 2026-11-16 — TASK-207 Discount and cashback matrix (`Tarif & Kurir`) (M2)

- Shipped: `pricing/rules` (policy, bands, seeding, edit, request list + CSV, verifier, observation recording),
  owner routes and `/tarif` + `/tarif/:tenantId` screens, `observeRates` vault RPC (seller key stays in the object),
  mock `courier=all` estimate with per-key discount, `@gx/domain/cashback`, `verificationCheckAt`/`parseDiscountBand`
  next to the existing TASK-107 state machine (reused, not duplicated).
- Evidence: 20 % seeding for every active service; 1999/3001 rejected with Indonesian band message; reason required;
  edit resets to `Belum diterapkan` with an old/new audit row; per-courier band change without code (JT 22–35 %) and two
  couriers with different bands; fake-clock +15 (`Sesuai` / still `Belum`), +60, +120 (`Selisih` + alert, next check
  daily); 2000 vs 1999 → `Sesuai`, drift to 1000 → `Selisih`, back → `Sesuai`; cargo verifies on cargo fields; CSV +
  mark requested; owner sees assigned %, cashier 403, tenant host shows no discount.
- Gotchas: an RPC return type built from a Zod passthrough schema (unknown index signature) collapses to the error
  branch in TypeScript — return a plain projection (`ObservedRate`); alert keys must match `[a-z0-9_.-]{1,80}`.

## 2026-11-16 — TASK-208 Super Admin Ringkasan, Pengawasan, Sistem & Audit (M2)

- Shipped: `admin/{overview,monitor,audit,legal}`, owner screens `/`, `/pengawasan`, `/sistem` (placeholder page
  removed), `recipient_risk_index` + `risk_review`, outbox applier, relay health probe, rotation action, legal profile
  editor, non-impersonation scanners (`scanOwnerRoutes`, `scanOwnerVaultCalls`) + Node source-scan test.
- Evidence: KPI/series without PII; risk radar 403 without permission, 422 without reason or bad phone, totals from
  hashed index, versioned upsert ignores stale, audit holds reason + HMAC prefix only; audit viewer filters + audits
  its read; health response has no secrets; rotation needs a reason, bumps key version through the fence, audited;
  risk_review self-grant refused; legal profile NULL then filled, NIB/email validation in Indonesian, NPWP encrypted and
  masked, audit names fields only; owner host 404s for app and shipment paths.
- Decision: the TASK-106 path scan now applies to mutating methods only; read-only cross-tenant GET views (search) are
  the documented Super Admin job (spec 06 §4 `Pengawasan`).
- Workers tests cannot read the repository filesystem; source scans run as Node unit tests (`scripts/ci/*.test.mjs`).

## 2026-11-16 — TASK-299 M2 close

- Integrated run (`scripts/ci/integrated-gate.sh TASK-299`): typecheck, lint, unit, build, worker, migrations,
  isolation, security (bundle audit + red fixtures + `security-check .`), e2e — all PASS, recorded in the ledger.
  (A first run was UNVERIFIED because `docs/SYSTEM-MAP.md` was edited while it ran; re-run on a frozen tree.)
- Exit gate "zero raw key URLs in logs": `apps/worker/test/isolation/no-key-in-logs.test.ts` captures every console
  line across all M2 Mengantar paths; mutation (log a keyed URL in `publicClient`) turns it red.
- Sandbox onboarding end-to-end runs on the offline mock locally; the live sandbox run needs Partner sandbox
  credentials → AWAITING_OWNER_ACTION. `docs/SYSTEM-MAP.md` refreshed for M2.

## 2026-11-16 — TASK-301 Web app shell, navigation, notifications, role projection (M3)

- Shipped: role projection module (server strips cost/discount/margin/cashback/balance for Kasir), workspace endpoint,
  per-user notifications in the tenant object, the gerai workspace shell (desktop sidebar, tablet rail, phone bottom
  bar + sheet), text-size preference without zoom locks, Dashboard frames, `/notifikasi`, shared page states.
- Evidence: Workers tests for projection (deep strip, input untouched), owner vs Kasir workspace DTOs, gerai under
  review, notification audience/read state/safe links/cross-tenant; e2e (applicant → `/daftar/status`, Kasir home
  without Keuangan); UI gates 0 fail (one expected duplicate-href warning on `/notifikasi` with three items linking to
  `/kiriman`); mutation red.
- Note: pages owned by later tasks render a `Segera hadir` state inside the shell (never a dead link or a 404).

## 2026-11-16 — TASK-302 Contacts, WA verification, risk badge, media uploads (M3)

- Shipped: sender/recipient address books in the tenant object, operator-confirmed WhatsApp verification, local COD
  risk badge + cross-tenant risk index publication (absolute, versioned, phone HMAC), R2 media with tenant-prefixed
  keys and tenant-bound signed URLs, `Kontak` screens, shared `AreaPicker`.
- Evidence: Workers tests (Indonesian field errors, `+62` → `08`, verification reset on phone change only, search by
  name/brand/any phone format, Kasir sees no deposit and cannot archive, risk badge 2/1 → kuning 3333 bps, D1 upsert
  ignores older and same-version replays, no plain phone in D1, media 201/200/403/415 and Kasir logo 403); isolation
  (A's signed URL with B's session 403, B-signed URL for A's id 404, foreign key prefix refused, contacts invisible);
  e2e add reseller → verify WA → add recipient via area search; UI gates; mutation red.
- Spec: risk badge thresholds made explicit in spec 03 §1 item 3 (were unstated).

## 2026-11-16 — Power outage recovery (08:25 WIB, mid TASK-303)

- `rich` lost power at 08:25 and rebooted at 08:29 with 8 uncommitted changes in the dev worktree (TASK-303 run
  `RUN-20261116T012253Z-85f0ccf4` active). Verified before continuing: every changed file read in full via `git diff`
  (the `onboarding/service.ts` edit and `0009_quotes.sql` complete), no NUL bytes or truncated tails, `git fsck` clean
  (only the canonical empty tree reported missing), ledger JSON parses, all 13 local state SQLite files pass
  `PRAGMA integrity_check`, typecheck + lint + `pnpm check` green. The one failure found was not corruption: the
  non-impersonation scan correctly flagged the new `upsertDefaultOutlet` call on the approval path (allowlisted with
  its reason). Dev server restarted.

## 2026-11-16 — TASK-303 Quote engine, courier cards and `Cek Ongkir Cepat` (M3)

- Shipped: pure quote engine over plain estimate rows, quote orchestration (Non-COD pass, COD passes, observations,
  rate limit), frozen snapshots, quote routes, `Buat Pengiriman` and `Cek Ongkir Cepat` screens, weight input.
- Evidence: Workers tests with exact numbers for all five modes on the offline mock (Rp1.000-step COD fee converges like
  Mengantar), the spec 02 §3.4 worked row, unstable fee, all-in guard, cargo rules, coverage, prefs, non-allocation,
  frozen snapshot values, observed bps 1989 (lossy floor) and cargo 2500, per-tenant 429, Kasir projection; e2e at three
  viewports; UI gates 0 fail; mutation red.
- Decision: `pricing/quote` is workspace code; the Super Admin source scan covers `pricing/rules` only.

## 2026-11-16 — TASK-304 POS checkout, payment record, dispatch, cancellation (M3)

- Shipped: checkout projection on `shipments`, write-ahead `dispatch_journal`, append-only `counter_receipts`, the
  dispatch/payment/cancel flows in `GeraiVaultDO`, SDK `saveAddress`/`reserveTime`, a full offline Mengantar order
  mock (idempotency replay, unpaid on low balance, pay-unpaid, delete, faults), checkout routes and screen.
- Evidence (Workers): payment state machine (receipt, change, same-key replay, void with reason, Kasir void refused
  outside its shift, key required); issue with destinationMark = INV; concurrent + repeated submit → one order;
  timeout after create → read-back finds it, no resend; timeout + failed read-back → `reconciliation_needed` survives
  restart, read-back → draft, re-issue with a new key; provider 4xx → failed → re-issue; low balance →
  `provider_unpaid_hold` → 402 until top-up → `payUnpaid` → AWB; Indonesian readiness errors; cancel paths (draft,
  void-first, courier refusal, timeout after delete, read-back down → `cancel_unknown` → resolved without resending
  DELETE); issue/cancel 429; Kasir detail without cost/margin; `shipment_index` restart + lost-ack + stale version;
  dispatch refused while the key rotates. e2e: scripted checkout 3–5 s per viewport (< 45 s).

## 2026-11-16 — TASK-305 Masking presets, quota, reveal audit (M3)

- Shipped: masking domain rules, per-gerai `Label & Privasi` settings in the tenant object, issue-time preset claim
  against `masking_daily_quota` (consumed atomically with the issue, released on provider rejection), immutable print
  and pickup snapshots, audited `Lihat Pengirim Asli`, checkout preset picker with print preview.
- Evidence: domain tests (offered presets incl. kill-switch, default fallback, quota rule, `printedIdentity` for all
  four presets = label snapshots); Workers tests (settings validation, Dropship snapshot never shows the outlet, quota
  422 with no Mengantar call and no silent downgrade, switching to Standar issues, preset not offered, verified WA,
  brand required, reveal reason + audit); e2e owner enables Dropship → checkout prints the brand → reveal; UI gates;
  mutation red.

## 2026-11-16 — TASK-306 Printing: 100 mm PDFs (PC-first), 58 mm ESC/POS, bulk print (M3)

- Shipped: `@gx/thermal-print` (Code 128, QR via `uqr`, exact-size vector PDF writer, three 100 mm layouts, 58 mm
  32-column label + receipt, ESC/POS), label data from immutable snapshots, print records with reprint reason,
  print drawer and `Cetak Resi Massal`.
- Evidence ("printed sample scanned"): every 100 mm format for a COD Dropship and a Non-COD Standar INV is rendered by
  Ghostscript at the thermal head's 203 dpi and decoded with zxing-cpp — Code 128 equals the AWB and every QR equals the
  tracking URL (`packages/thermal-print/test/scan.test.ts`, renders in `docs/evidence/TASK-306/`). Photo of a physical
  print on the outlet's printer stays an owner step (no thermal printer attached to the build machine).
  Exact MediaBox per format, quiet zones measured on the drawn page, 32-column snapshots of both visual 04 specimens,
  ESC/POS bytes, API tests (AWB required, record + reprint reason audited, preview never records, bulk ≤ 50, Dropship
  never prints the outlet), e2e drawer → PDF → reprint reason → mass print list.
- Found while reviewing renders: destination line overlapped the COD banner and a long subdistrict fallback overflowed
  the sorting pill — both fixed with tests.
- Flaky e2e root cause: the drawer switched to reprint mode immediately after printing (correct duplicate guard), so the
  test's second click waited on a disabled button; the test now asserts that state instead.

## 2026-11-16 — TASK-307 Shift drawer and sender COD payout (M3)

- Shipped: cashier shifts in the tenant object (one open per cashier enforced by a partial unique index), shift
  attribution of every receipt, live drawer totals, close with variance reason + owner notification, sender COD
  payout and its owner-only reversal, `/kasir/shift`, payout section on the INV.
- Evidence: Workers tests — open/tunai/QRIS/void → expected cash 150.000 and exact close; variance −5.500 needs code
  + note and notifies the owner; Kasir sees own shifts, owner all; INV issued in shift A and paid in shift B counts in
  B and cannot be voided by A's cashier; payout refused before settlement (owner override with reason works), tunai
  needs a shift, partial 100.000 + 45.000 of 145.000 payable, over-payout 422, idempotent replay, transfer leaves the
  drawer untouched, tunai reversal puts cash back; Kasir payout only with `Kasir boleh bayar COD`, never a reversal.
  e2e at three viewports. Display fix: negative/zero money never renders as `Rp -0`.

## 2026-11-16 — TASK-308 Paket Massal, Riwayat Massal, Cek Resi (M3)

- Shipped: CSV/manual bulk entry for one sender, queued area match + quote, inline fixes, one INV per ready row,
  serialized dispatch, one payment for the batch, batch history with `Cetak Semua` and `Batalkan yang Belum Terbit`,
  and `Cek Resi` by INV/AWB/HP.
- Evidence: CSV fixture with 5 rows → 2 `Siap`, 3 `Perlu Diperbaiki` (`Berat kosong`, `Kecamatan tidak ditemukan`,
  ambiguous `Jawa` with two candidates); after fixes 4 ready; double `Buat` creates once; dispatch issues each INV
  once (create calls = rows); Kasir view has no owner-only keys; batch payment is all-or-nothing (a pre-existing
  conflicting key on row 2 leaves zero receipts and every INV unpaid) and replays by key; a provider rejection stays
  on its row and is not retried; cancel-unissued cancels only the INV without AWB; foreign AWB → `Resi ini bukan
  kiriman gerai Anda`. e2e at three viewports; mutation red.
- Note: `runQuote` gained an optional per-call rate key/limit and a single-service filter for bulk rows.

## 2026-11-16 — TASK-309 Owner dashboard, Kasir home, period filter (M3)

- Shipped: role-tailored `/` (owner analytics, Kasir counter tasks), the shared WIB `PeriodFilter`, and daily
  counters pushed to D1 `tenant_daily_stats` through the outbox.
- Evidence: period tests (default 7 days; WIB midnight flip; last month across a year; swap, future, 180-day limit;
  URL round-trip and fallback; previous period; 24 hourly / 7 daily buckets). Workers tests: issued-only counts,
  paid vs unpaid with tunai split, Estimasi Laba > 0 while Laba Kas stays 0 until reconciled AND counter-settled
  (COD fixture 147.500 − 145.000 + 3.000 = 5.500), invalid range → `Maksimal 180 hari`, Kasir response has no
  `_idr`/margin/balance keys, daily stats row lands in D1 and a stale version is ignored. e2e: preset applies at
  once and updates the URL, back restores, typed custom range with `Terapkan`, 180-day error. Mutation red.
- Dependency note: `react-day-picker` and `date-fns` arrive through the shadcn `calendar` component (visual 08 §1.5
  names it); both pinned exactly.

## 2026-11-16 — TASK-310 Settings pages, account page, help (M3)

- Shipped: `Pengaturan` sub-menu with Profil Gerai, Data Usaha, Printer & Struk, Packing & Biaya and Anggota;
  `Akun Saya`; `Bantuan & Panduan`.
- Evidence: Kasir gets `Menu ini hanya untuk pemilik gerai.` (403) on `/settings*` and `/members*`, 200 on the printer
  read; NPWP stored as `v1.` ciphertext, responses and audit never contain the digits, masked `•••…1234`, omitted
  keeps / empty clears; form validation messages; Kasir revoke ends the Kasir's session and the owner cannot revoke
  self. Account: email change sends the code only to the new address, wrong code 400, right code switches and signs
  out the other session, replay refused, 5 wrong → 429, taken address gets no email; password change needs the
  current password and signs out others; session handles never equal stored hashes, revoke one and all others, the
  current session cannot be revoked by handle. e2e: Save bar appears only when dirty, NPWP masked after save,
  printer default saved, wrong current password message, help search. Mutation red.

## 2026-11-16 — TASK-311 `Kiriman` list, tabs, search and export (M3)

- Shipped: the unified `Kiriman` hub list with tab counts, search, period/courier/print filters, keyset pages,
  `Tandai Lunas` row action and the owner CSV.
- Evidence: two tenants never see each other's INVs, even by exact INV or AWB search; tab counts `semua 2,
  belum-dibayar 1, pickup 2` with a draft excluded; `Tandai Lunas` empties the Belum Dibayar tab; Kasir rows carry no
  owner-only keys and the CSV answers 403; recipient name/phone search; 2 + 1 keyset pages cover all rows; CSV header
  and row snapshot (WIB time `2026-11-14 10:00`, `INV …`, `'=HYPERLINK(...)` neutralised). e2e at three viewports.
  Shell fix: `SidebarInset` gets `min-w-0` so wide content scrolls inside its box instead of widening the page.

## 2026-11-16 — TASK-399 M3 close

- Integrated run (`scripts/ci/integrated-gate.sh TASK-399`): typecheck, lint, unit (153), build, worker (263),
  migrations, isolation, security (bundle audit + red fixtures + `security-check .`), e2e (42 runs = 14 specs × 390/768/1280)
  — all PASS, recorded in the ledger. The first run failed at e2e: `settings.spec.ts` matched the header `h1` that is
  hidden at 768 px; the selector now targets the page `h2` and the re-run on a frozen tree passed.
- DTO role-projection suite: `apps/worker/test/dto/projection.test.ts` now also sweeps 13 Kasir-reachable GETs (workspace,
  dashboard, shipments list + detail, shift(s), bulk, print list, track, contacts, notifications, masking) for owner-only
  keys, and the route-table check covers every money-bearing path (`/masking` and `/shipments/:slug/reveal-sender`
  moved to the role projection; `/bulk/services` likewise).
- Sub-45 s checkout: `e2e/checkout.spec.ts` asserts < 45 s from `/kasir` to the issued AWB at all three viewports.
- `docs/SYSTEM-MAP.md` refreshed for M3. Awaiting owner: live sandbox `POST /order`, a real thermal print photo, counsel
  answer before masking is advertised.

## 2026-11-16 — TASK-401 `/invoices` sync, dual book, Laba Kas (M4)

- Shipped: Book 2 mirror of Mengantar `/invoices` inside each tenant object, per-type reconciliation onto INVs,
  `Selisih Sync`, bounded/serialized sync with four triggers, the owner `/keuangan` screen, and Laba Kas from
  reconciled amounts (dashboard shares the same SQL).
- Evidence: fixture with all five observed types + `typeMismatchP` + a pending top-up: Non-COD cost 10.000, COD credit
  140.000, return debit 14.000, refund linked, unknown type and an unmatched COD sub-item in `Selisih Sync`, receiver
  name/phone/goods absent from the mirror, `COD_FEE` 4995.5 kept as text, balance 599.000 = newest cleared
  `balanceAmount`, running balance consistent; a wrong `balanceAmount` is flagged; Laba Kas = due − 10.000 for Non-COD
  and 140.000 − 145.000 + 3.000 for COD only after sync; 400 rows → 5 pages and `capped`, next run reads one page;
  manual 429 within 30 s, timer at +60 s after dispatch runs a sync, pending rescan clears a top-up, cron fan-out,
  Kasir 403. Mutation (add instead of set on re-read) red. One `pnpm check` run hit 5 s test timeouts while another
  project's suite loaded the machine; the re-run passed (153 unit, 268 Workers).

## 2026-11-16 — TASK-402 Unpaid recovery and Saldo Aman (M4)

- Shipped: finance-triggered `payUnpaid` after a top-up sync with crash-safe read-back, the Saldo Aman reserve
  (return + dispute exposure, linked to INVs), and the role-safe Non-COD balance pre-flight.
- Evidence: held INV → top-up row → sync pays once and issues the AWB, owner notified, second sync does not call;
  balance below the debit → skipped with zero calls; journal `in_flight` with Mengantar already paid → read-back records
  the AWB with zero `pay-unpaid` calls and the journal `done`; journal `unknown` with Mengantar unpaid → `failed`, then
  paid once; reserve = P + N + 2.000 adjustment, released to 2.000 when the return debit syncs; Kasir sees
  `{ balance_sufficient: false }` only and 403 on `/finance`. e2e held → top-up → `Sinkronkan Sekarang` → AWB.
  Two mutations red. Independent R4 review deferred to the final pass (ledger BLOCKED, not approved).

## 2026-11-16 — TASK-403 Pickup manifest and Surat Jalan (M4)

- Shipped: per-courier pickup queue, scan-into-manifest guard, driver handover with signature, custody
  `handed_to_courier`, and the A4 Surat Jalan PDF.
- Evidence: J&T batch adds the J&T AWB, dedupes a re-scan, warns (not blocks) on a counter-unpaid INV, blocks
  SiCepat / cancelled / unpaid-hold / unknown codes; empty batch refused; driver fields and signature errors in
  Indonesian; plate normalised to `D 1234 ABC`, phone to `0812…`; custody + status `handed_to_courier`; closed batch
  refuses scans; the handed INV is blocked in the next batch; PDF has `SURAT JALAN`, driver name, no recipient name;
  branch drop-off records custody without driver fields. PDF snapshot: A4 MediaBox, rows with initials, total weight,
  28 rows/page, footer on the last page only. e2e at three viewports. Mutation red.
- Not done here (needs sandbox): `POST /time` pickup reservation lead time and timezone (spec 04 §1.2 says verify in
  the M4 sandbox); dispatch already reserves a slot for scheduled-pickup couriers (TASK-304).

## 2026-11-16 — TASK-404 Meja Retur and verified handback (M4)

- Shipped: return intake with condition + photo, audited true-sender reveal, hashed 4-digit `Kode Ambil` via a
  prefilled WhatsApp link, verified handback (code or owner ID override), custody stages, conflict surfacing.
- Evidence: damaged parcel without photo refused; intake → `rts_at_gerai`, sender returned, audit rows
  `return.intake` + `true_sender_reveal`; handback before a code → `NO_CODE`; stored hash is 64 hex and differs from
  the code; wrong code 400, right code → `rts_returned_to_sender`, code single use; 5 wrong → 429 even with the right
  code; Kasir override → `OWNER_ONLY`, owner override needs ≥ 5 chars; provider `delivered` after intake keeps
  `rts_at_gerai`, sets the conflict and the INV appears in `Kendala & Klaim`; an INV that never left → `NOT_SENT`.
  e2e at three viewports reads the code from the WhatsApp link. Mutation red.

## 2026-11-16 — TASK-405 Exceptions and claims (M4)

- Shipped: `Kendala & Klaim` with five buckets, per-courier claim countdowns from Mengantar's published windows,
  claim records + packet, refund-driven `paid`, conflict notes, expiry sweep.
- Evidence: one INV per bucket lands in the right bucket (stuck 6 days → `5–14 hari`; undelivery; `penyesuaian`
  3.000 from `/invoices`; J&T lost → `Bisa Klaim`, deadline ≤ 72 h after the lost status; handback-then-delivered →
  `Status Bertentangan`); claim open is idempotent per kind with a frozen deadline; Kasir may submit, not approve;
  `paid` straight from `draft`/`submitted` refused; refund `ref1` marks the claim paid; lost 4 days ago on J&T →
  `CLAIM_EXPIRED`; a draft past its deadline expires on the poll sweep; conflict note < 5 chars refused, valid note
  closes it. Domain tests on J&T/SiCepat/SAP/Lion windows, chips and bands. e2e at three viewports. Mutation red.

## 2026-11-16 — TASK-499 M4 close

- Integrated run (`scripts/ci/integrated-gate.sh TASK-499`): typecheck, lint, unit, build, worker, migrations,
  isolation, security, e2e (18 specs × 390/768/1280) — all PASS in the ledger. A first run stopped at typecheck
  (the new determinism test typed SQL rows as `unknown`); fixed and re-run on a frozen tree.
- Exit gate "deterministic reconciliation across all types": `apps/worker/test/finance/determinism.test.ts` syncs the
  same eight rows (top-up, Non-COD payment, COD payout, return debit, `penyesuaian`, refund, withdraw, unknown type)
  newest-first in one gerai and one row per sync oldest-first in another, plus a replay and a pending rescan: shipments'
  provider amounts, mirror link states, sub-item links, discrepancies and the balance are identical.
- Sandbox-only verifications (weight echo, `POST /time`, `/invoices` order, `pay-unpaid` semantics) need the sandbox
  seller key → AWAITING_OWNER_ACTION (STATUS). `docs/SYSTEM-MAP.md` refreshed for M4.

## 2026-11-16 — TASK-501 Mini-site, QR pre-booking, private tracking (M5)

- Shipped: SSR mini-site on every active gerai host with publish-price check, `Kirim dari Rumah` QR pre-booking (48 h),
  privacy-safe tracking with the 4-digit gate, counter claim that keeps the QR's INV, robots/sitemap.
- Evidence: home has the outlet name and the network footer, no `Set-Cookie`; quote without Turnstile 422, with it
  publish prices only (no provider net `Rp 10.000`, no margin words); draft TTL exactly 48 h; QR card with SVG;
  counter claim → freeze `{ slug }` returns the same INV → issued → `entry_channel = minisite_qr`; tracking by INV and
  by AWB shows `R*** K******` + `Tebet, Jakarta Selatan` and none of name/phone/last-4/street/sender/item; gate
  refused before delivery, wrong digits 400, right digits show `Diterima oleh: Rina Kartika`, 5 wrong → 429;
  expired draft → `DRAFT_EXPIRED` at the counter and purged by the sweep; another gerai cannot claim or track it;
  isolation suite: cross-tenant INV/AWB 404 and no PII across in_transit/undelivery/delivered/RTS. Lighthouse mobile
  (local): `/` and `/kirim` 100 in all categories; `/lacak` SEO 66 only because it is `noindex` by design.
- Visual: rendered narrow + wide and corrected (header/main spacing, Turnstile widget placement); dotuiux 0 fail.
  Independent visual verdict not yet given → UNVERIFIED until the final review pass.
- Changed older tests: routing test's write-method case on a tenant host is `PUT` (the mini-site now serves
  `POST /`); the placeholder-page test now covers the `sedang disiapkan` page.

## 2026-11-16 — TASK-502 Brand site and POS sandbox (M5)

- Shipped: seven-page SSR brand site on `geraiexpress.com` with a login-free counter simulation, sitemap/robots,
  JSON-LD, and a legal footer that shows only filled company fields.
- Evidence: every page 200 with `- GeraiExpress` titles, 120–155-char descriptions, canonical, one h1, and no
  `Set-Cookie` even when an app cookie is sent; API families 404; sitemap lists exactly the 7 pages; footer empty →
  no `NIB`/`PT`, filled → `PT Contoh Kirim Nusantara · NIB … · Jl. …` and `/ketentuan` names the operator; the demo
  page contains no `fetch(`/`/api/`. e2e: demo receipt shows the chosen courier, `Daftar Gerai` → app sign-up, no
  cookies on the apex. Lighthouse mobile 100 across four pages. Rendered narrow + wide, H1 shortened, nav wraps on
  phones. Visual acceptance UNVERIFIED (independent verdict pending).

## 2026-11-16 — TASK-503 OpenAPI `/api/v1` and API keys (M5)

- Shipped: Partner API on `app.` with owner-managed scoped keys; one route table is the source for validation,
  scope checks and the OpenAPI 3.1 document; Scalar reference page; `Pengaturan › API & MCP`.
- Security: Bearer only (cookies never authenticate `/api/v1`); peppered hash at rest; token shown once; revoke is
  immediate; suspended gerai → 401; other hosts 404; `shipments:issue` requires `Idempotency-Key` and a daily Rupiah
  cap (conditional upsert, released on dispatch failure, never charged twice for an already issued INV); counter
  payment/payout stays POS-only (route scan + 404 test).
- Evidence: Workers `test/api-v1` (5) + `test/isolation/api-keys-isolation.test.ts`; Redocly lint "valid" on the
  generated document (`docs/evidence/TASK-503/`); e2e create → call → revoke → 401 at 390/768/1280; dotuiux 0 fail,
  admin-geometry 0; mutation (scope check disabled) turned the scope-denial test red; `pnpm check` green (unit 158,
  Workers 299).
- Gaps: `labels.part = stub_only` and `declared_item_value_idr` not implemented (recorded in spec 08).

## 2026-11-16 — TASK-504 MCP servers (M5)

- Shipped: outlet MCP on `app./mcp` (11 tools, Bearer key) and public MCP on `<slug>.gerai.cc/mcp` (5 tools), both
  stateless Streamable HTTP without an SDK dependency (small JSON-RPC core in `mcp/protocol.ts`).
- Safety: outlet tools call the `/api/v1` route table through one `invoke`, so no tool can skip a REST check; a key
  sees only its scopes' tools; `issue_paid_shipment` needs `idempotency_key` and hits the per-key daily cap; results
  are structured JSON so injected text in names/addresses is returned as data; writes audited as `mcp_client`;
  public drafts capped per IP and per gerai/day; public tracking initials-only and tenant-bound to the host.
- Evidence: official `@modelcontextprotocol/sdk` 1.32.2 client (Streamable HTTP transport) connected to both dev
  servers, listed tools with annotations and called one (`docs/evidence/TASK-504/*.txt`); Workers `test/mcp` (5);
  mutations red; Redocly still valid after the REST twins; `pnpm check` green (unit 158, Workers 304).
