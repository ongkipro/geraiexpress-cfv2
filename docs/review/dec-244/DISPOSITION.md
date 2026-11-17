# DEC-244 — review disposition

Reviewer: GPT-6.1 Sol (`9router-fantastico/cx/gpt-6.1-sol`), independent of the implementer (Claude Opus 5.5).

## Before review — integrated gate r1 FAIL

`scripts/ci/non-impersonation.test.mjs` caught `admin/gerai/routes.ts` calling `vault.financeSync()` from Super Admin
code (a finance sync may end by paying held batches as the system actor). Fixed by queuing the tenant's regular cron
sync (`FINANCE_SYNC_QUEUE`) and answering `financeSync: "queued"`; the scan passes. The console e2e toast assertions now
wait for the recheck responses first.

## Round 1 — REQUEST_CHANGES (`R1-sol.md`)

| # | Sev | Finding | Fix | Proof |
|---|---|---|---|---|
| 1 | P1 | Targeted discount recheck could verify another, more overdue gerai | `runDiscountVerifier(env, now, limit, onlyTenantId)`; both targeted actions pass the tenant | worker two-tenant test (A overdue, B requested → only B processed); mutation M45 red |
| 2 | P2 | Desktop + phone discount editors share ids; phone labels point at hidden inputs | `useId()` prefix per editor instance | e2e phone editor: label click focuses the visible textarea, no duplicate ids; M46 red |
| 3 | P2 | Select trigger border `slate-200` (~1.2:1) below the ≥ 3:1 input rule | back to `border-input` (`#7B879C`) | e2e idle trigger border equals the input token; M47 red |

The reviewer's non-impersonation observation (finance sync is not read-only) is reflected in DEC-244 and the route
comment: Super Admin only queues the system's own cron sync.

## Round 2 — APPROVE (`R2-sol.md`)

R1 #1–#3 FIXED; no new P0–P3.

## Gate r2 — FAIL, fixed

The DEC-243 header sweep caught the new owner status icon pushing the right zone 0.5 px into the search at 1024 px
with `Sangat Besar`. Fixed: with enlarged text below xl the search track narrows to 220–320 px; the console
environment badge waits for xl at every text size and the console account chip shows its name from 2xl;
the status icon no longer shrinks. Mutation M48 red (the badge deferral is margin, not a proven overlap).

## Round 3 — APPROVE (`R3-sol.md`)

Header delta after gate r2: grid cascade verified from the compiled CSS (`R3-css-cascade.txt`); the console badge
simplified to `hidden xl:inline-flex` (the extra in-data-text variants were dead). No P0–P3.
