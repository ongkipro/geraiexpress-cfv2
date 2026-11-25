# Findings from the 2026-11-25 documentation refresh

Read-only observations made while rewriting `docs/SYSTEM-MAP.md` and correcting the other documents against the code
at `e43804d`. Nothing here is a design proposal: each item is a difference between what the code does and what a
decision, a specification or the release process expects. The work is queued as TASK-706..TASK-713 in `TASKS.md`.

- Observer: documentation session, 2026-11-25 (no code, test or configuration file was changed).
- Not checked: anything live (deployed Worker versions, remote schema versions, GitHub environment protection,
  which secrets are set, relay state).
- Reproduce commands are safe to run locally and touch no remote system.

## For the session that picks this up

1. Read `AGENTS.md`, `docs/WORKFLOW.md` §2–§6, then the task contract in `TASKS.md` (section "Follow-up from the
   2026-11-25 documentation refresh") and the matching finding below.
2. One task per worktree and branch (`docs/WORKFLOW.md` §2); TASK-706, 707, 709 and 710 are R4 and need an
   independent review before they are marked done.
3. TASK-708, 709, 710 and 711 each start with an owner decision. Ask for it; do not pick one.
4. Do not deploy while the hosted `ci.yml` run for the head is red (F1). `pnpm deploy:staging` and
   `pnpm deploy:production` do not check this themselves (F7), and `pnpm check:fast` does not run the unit test that
   is failing — only `pnpm check` or the hosted run shows it.
5. The 34 Markdown files changed by the documentation refresh may still be uncommitted in the main working tree.
   They are deliberate: do not stash, restore or reformat them, and commit them only on the owner's instruction.

## Order of work

| # | Task | Why this position |
|---|---|---|
| 1 | TASK-706 | Hosted CI is red; nothing can be dispatched to staging until it is green (DEC-253) |
| 2 | TASK-707 | Records and reviews what is already on `main`, including F2–F4; needed before the next release |
| 3 | TASK-708 | Money rule: an owner decision first, then a small change |
| 4 | TASK-709 | One guard that keeps staging from writing to the production Cloudflare for SaaS zone |
| 5 | TASK-710 | Rollback safety after DEC-254; a decision plus a runbook line or a guard |
| 6 | TASK-711 | Small hardening of the demo account |
| 7 | TASK-712 | Record-keeping: `RELEASE.md`, TASK-601 row, hot-file size |
| 8 | TASK-713 | Smaller gaps, each independent |

TASK-706 and TASK-707 block a release. The others do not block each other.

---

## F1 — Hosted CI has been red on `main` since `aa40187` (13 pushes)

**Evidence.** `gh run list --workflow ci.yml`: last green `bf06880` (2026-11-24 10:36 UTC); every push from
`aa40187` to `e43804d` failed.

| Runs | Failing file | State at `e43804d` |
|---|---|---|
| `aa40187` … `a5eab51` (8) | `apps/worker/test/bulk/bulk.test.ts`; from `50208ad` also `apps/worker/test/settings/settings.test.ts` | both files pass (11/11, run locally on `2604a33`) |
| `ec08665` … `e43804d` (5) | `scripts/ci/non-impersonation.test.mjs` | still failing |

Current failure:

```text
non-impersonation source scan (DEC-209) > owner-side modules call only allowlisted vault RPCs
+ "do/gerai-vault/credentials/rotation.ts: Super Admin code calls vault.syncSellerKeyFromPartner()"
```

**Cause.** `ec08665` added `GeraiVaultDO.syncSellerKeyFromPartner` and calls it from
`apps/worker/src/do/gerai-vault/credentials/rotation.ts`. That folder is in `OWNER_SIDE` of the scan, and the method
is not in `OWNER_ALLOWED_VAULT_CALLS` (`scripts/ci/route-scan-lib.mjs`). The method stores the seller API key that
the Partner API reports as current; it creates, pays, edits or cancels no shipment, so it is the same kind of call as
the already allowlisted `beginKeyRotation` … `completeKeyRotation`. It is reached from two routes:
`POST /api/owner/gerai/:slug/sinkron-kunci` (`owner_recent`, reason, audit `seller_key.sync`) and
`POST /api/app/settings/mengantar/sync-key` (`app_owner`).

**Consequence.** The DEC-253 staging gate requires a green `ci.yml` push run for the dispatched SHA, so no commit
after `bf06880` can be deployed to staging through the workflow. `pnpm check` cannot have passed locally on any of
the last five commits either, because it runs the same unit test.

**Reproduce.** `pnpm exec vitest run --project unit scripts/ci/non-impersonation.test.mjs`

**Open question for the fix.** Adding the name to the allowlist changes a security gate, so it needs the reviewer to
confirm the classification above (credential maintenance, not impersonation) rather than a silent edit.

## F2 — 22 commits on `main` without task, decision, run or review

**Evidence.** `git log 53aee8f..e43804d` lists 22 commits (2026-11-23 … 25). For that range there is no `TASKS.md`
task, no `delivery-ledger` run (last run `RUN-20261119T122843Z-0735bc7e`), no archived review under `docs/review/`,
and — except DEC-254 in the last commit — no `DECISIONS.md` entry. `docs/WORKFLOW.md` §6 requires an independent
review for R3/R4 changes.

Commits that touch R3/R4 surfaces (migrations, auth, tenant object, provider calls, pricing):

| Commit | Surface |
|---|---|
| `6ed284c` | tenant app hardening across onboarding, settings, mini-site |
| `327338b`, `aa40187` | onboarding service (pin, area picker) |
| `0d2380c` | demo account: auth flows, read-only guard, `POST /internal/ops/seed-demo` |
| `c27f27c` | outlet logo media in the tenant object |
| `634c78c` | tenant migration `0025_contact_history_and_events`; per-INV status sync |
| `ec08665` | seller-key sync from the Partner API; `Tarik & Terapkan dari Mengantar` (F4); webhook settings |
| `e43804d` | DEC-254: tenant objects migrate themselves on first RPC; `scripts/deploy/deploy.mjs` |

**Not recorded anywhere:** whether tenant migration `0025` has been applied on staging or production, and which
Worker version is deployed now (`docs/runbooks/production-zones.md` §5.1 stops at 2026-11-23, control `0019`, objects
v24; `BUILD-LOG.md` mentions control `0020` and versions `daebcae9…` / `9c469926…`).

## F3 — After DEC-254 a code rollback across a tenant migration locks gerai out

**Evidence.** `apps/worker/src/do/gerai-vault/index.ts`, `refusal()`:

```ts
if (s.state !== "ok") return "TENANT_NOT_READY"
if (s.version === TENANT_SCHEMA_VERSION) return null
if (s.version > 0 && s.version < TENANT_SCHEMA_VERSION) { /* apply pending migrations */ }
return "TENANT_NOT_READY"   // also the path for version > TENANT_SCHEMA_VERSION
```

Before DEC-254 objects moved to a new schema version only when `pnpm do:migrate` ran. Now every object that receives
a request after a deploy moves immediately. If the Worker is then rolled back to the previous version
(`wrangler rollback`, the documented procedure), each of those objects is ahead of the code and refuses every RPC —
the gerai cannot quote, issue, print or sync until the newer code is redeployed. `docs/WORKFLOW.md` §8 and
`RELEASE.md` state that "a code rollback never needs a schema rollback"; that sentence was written for the explicit
migration model. The same applies to Cloudflare gradual deployments, which DEC-254 names as a goal: while two
versions serve traffic, an object upgraded by the new version is refused by the old one.

**Decision needed.** Either accept roll-forward only for releases that contain a tenant migration (and say so in the
rollback procedure), or let code that is behind by additive migrations keep serving (expand-only makes that safe in
principle, but it must then be a rule that every tenant migration is additive, and tested).

## F4 — `Tarik & Terapkan dari Mengantar` stores discounts outside the DEC-233 band

**Evidence.** `apps/worker/src/pricing/rules/index.ts`, `syncDiscountsFromMengantar`: accepts any observed value
`0 … 10000` bps and writes `assigned_bps = observed_bps`, `verification_state = 'sesuai'`. It does not call
`isAssignedBpsAllowed`, which the manual editor does (`DISCOUNT_OUT_OF_BAND`). The band is seeded 2000 … 3000 bps
(`packages/db/migrations/control/0008_discount_rules.sql`).

`apps/worker/test/pricing/rules.test.ts` asserts the out-of-band result:

```ts
mockDiscountBps.set("JT", 1500)       // below min_discount_bps 2000
mockDiscountBps.set("SiCepat", 3200)  // above max_discount_bps 3000
expect(await ruleOf(g.tenantId, "JT")).toMatchObject({ assigned_bps: 1500, verification_state: "sesuai" })
```

**Conflict.** DEC-233: "no rule may go below `min_discount_bps = 2000`; Super Admin may raise a gerai up to
`max_discount_bps`". The feature is aimed at BYOK accounts whose negotiated discounts differ, so the band may simply
not apply to them — but that is a decision, and it is not recorded. Money flows use the provider net `N`, so no
subsidy is booked either way; what changes is the displayed gerai cost and margin (`effective_bps`).

**Decision needed.** (a) Amend DEC-233: adopted rules may sit outside the band, and say whether a later manual edit
of such a rule is forced back inside it (today it is). (b) Or keep DEC-233 and have the action skip or refuse
out-of-band observations.

## F5 — Staging is bound to the production Cloudflare for SaaS zone

**Evidence.** `wrangler.jsonc`: `env.staging.vars.CF_SAAS_ZONE_ID` and `env.production.vars.CF_SAAS_ZONE_ID` are the
same value (the `geraimitra.com` zone), and `CF_SAAS_API_TOKEN` is in `env.staging.secrets.required`.
`apps/worker/src/hostnames/cloudflare.ts` fails closed only when the zone id is malformed or the token is missing;
`apps/worker/src/hostnames/service.ts` has no environment condition on creation.

**Conflict.** Spec 11 §2: "Staging does not create custom hostnames; custom-domain flows are tested in staging with a
separate test zone owned by the team." As configured, a custom-domain request made on staging creates a real custom
hostname in the production zone (billable, and counted against the production quota).

**Not checked.** Whether the staging token is actually set and live.

## F6 — The demo account can be taken over by slug, and the seeder runs in production

**Evidence.**

- `apps/worker/src/demo/constants.ts`: the demo tenant is identified by slug `demo`
  (`isDemoTenantSlug`); the read-only guard in `apps/worker/src/api/app.ts` applies to any member of that tenant.
- `apps/worker/src/onboarding/service.ts`, `RESERVED_SLUGS`: `demo` is not in the list, so an applicant can register
  a gerai with slug `demo` wherever the demo tenant has not been seeded yet.
- `apps/worker/src/ops/seed-demo.ts`: `INSERT INTO tenants … ON CONFLICT(slug) DO UPDATE SET … owner_user_id = ?4`
  and it reuses the existing tenant id, then seeds 68 synthetic shipments into that tenant's object. Seeding after a
  real gerai took the slug would overwrite its ownership and mix demo data into its vault.
- The same handler has no `GX_ENV` condition: with `OPS_TOKEN` it creates the demo login in production. Its email and
  default password are constants in the repository, so the credentials are public by design.

**Impact today.** Low while the demo tenant exists in every environment where sign-up is open; the gap is the order of
operations on a fresh environment and the absence of a recorded decision that a public demo login in production is
intended. Whether the demo tenant can be reached through `/api/v1` or `/mcp` was not verified (it should hold no API
key).

## F7 — Release record is empty and two status records disagree

- `RELEASE.md` still carries `Release-ID: UNSET … Status: NOT_RELEASED`, and `.delivery/releases/` is empty, although
  staging and production have been deployed since 2026-11-18 (`docs/runbooks/production-zones.md` §5.1). No
  `delivery-ledger snapshot-release` was ever recorded.
- `STATUS.md` lists TASK-601 (Partner relay in production) as `READY FOR OWNER … AWAITING_OWNER_ACTION`, while
  `BUILD-LOG.md` (2026-11-23) records the relay deployed with `RELAY VERIFY PASS (6 checks)` and the production
  `relay-health` probe passing.
- `STATUS.md` is 74 KB against its own 12 KB limit (last line of the file) and `TASKS.md` is 61 KB against a 50 KB
  hard limit (its header). Read tools truncate at about 50 KB, so an agent reading either file misses its tail.
- `pnpm deploy:staging` / `pnpm deploy:production` (DEC-254) run from a workstation without the checks the GitHub
  workflows make (SHA on `main`, green CI). Nothing in the script would have stopped a deploy of the current red
  head.

## F8 — Smaller gaps

| # | Observation | Evidence |
|---|---|---|
| a | Shipments created through `/api/v1` or MCP are stored as `entry_channel = 'counter_pos'`; spec 01 lists a value `api_mcp` and the Dashboard has a label for it | the only writers set `minisite_qr` and `counter_multi` (`do/gerai-vault/index.ts`); the column default is `counter_pos` (`tenant/0010_dispatch.sql`); `apps/web-app/src/routes/index/page.tsx` maps `api_mcp` |
| b | Cashback accrual is not persisted: `cashback_bps` is stored per rule and the state machine exists in `packages/domain/src/cashback/`, but no table or writer exists | no `cashback` table in either migration track; TASK-207 says "cashback ledger states unit-tested" |
| c | `MENGANTAR_PUBLIC_READ_KEY` is required for area search on staging and production but is outside `secrets.required`, so a deploy succeeds without it and area search then answers `503 AREA_SEARCH_UNAVAILABLE` (registration and POS area pickers) | `apps/worker/src/couriers/areas.ts`; `apps/worker/src/env-secrets.d.ts` |
| d | `POST /api/owner/sistem/mengantar/uji` calls the Partner API without reserving from `PartnerQuotaDO` (every other Partner call reserves first); it is limited to 6 per minute per admin, against a partner-wide budget of 60 per minute | `apps/worker/src/admin/mengantar/index.ts` |
| e | Stale comments: `apps/worker/src/email/templates.ts` line 1 says six templates (eight exist); `wrangler.jsonc` line 4 cites `production-zones.md §5` for the account migration (it is §6) | — |
| f | Five backticked paths in `TASKS.md`, `STATUS.md`, `DECISIONS.md` and two specs name files that are not in the repository (`packages/db/src/schema/index.ts`, `vitest.workspace.ts`, `admin-geometry.mjs`, `check-page.mjs`, `geraiexpress-mengantar-public-api.md`) | the first two were renamed; the others are device-local tools or notes and are not labelled as such |

## Documentation left for a later pass

- `docs/visual/04`: the three 100 mm label specimens (§3.1–§3.3) and the 58 mm receipt specimen (§2.1–§2.2) still
  draw the layout from before the 2026-11-24/25 redesign; as-built notes were added above them. They should be
  redrawn from a rendered sample (`Pengaturan › Printer & Struk` preview), not from prose.
- `docs/spec/01` §2: the column-by-column lists were not rewritten; the inventory note in §0 lists the differences
  from the schema.
- `docs/DIAGRAMS.md`: edited blocks were checked for structure only; no Mermaid renderer is installed on the device
  that made the edits.
