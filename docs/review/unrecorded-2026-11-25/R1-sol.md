# TASK-707 Independent R4 Review — Round 1 (`cx/gpt-6.2-sol`)

- **Task:** TASK-707 — Record and review unrecorded work on `main` (`6ed284c..e43804d`, finding F2)
- **Risk Level:** R4
- **Range:** `53aee8f..e43804d`
- **Reviewer:** `cx/gpt-6.2-sol` (`ai-ask codex`, independent read-only single-pass review of focused R4 diff)
- **Date:** 2026-11-25

## Verdict: REQUEST_CHANGES

Single-pass review of the supplied `53aee8f..e43804d` patch. No commands or tests were run by the reviewer.

## Checked Surfaces

- **Schema v25 and DEC-254:** The lazy upgrade checks the tenant binding first and refuses unprovisioned, recovery, and newer-schema objects. D1 reconciliation checks both version and state after confirming the DO is current and bound to the expected tenant.
- **Demo and geocode:** Reviewed seed scope, the demo POST allowlist, coordinate bounds, and outbound requests. Pasted map links are parsed locally; the geocoder uses a fixed host and encodes the query, so no direct user-controlled fetch destination is visible.
- **History, discounts, and credentials:** The shown history projection omits seller cost, margin, discount, and balance. Discount adoption checks for integer bps in `0..10000`. The shown Partner telemetry and response do not expose the key or a raw upstream URL.

## Findings — new in the supplied range

1. **P1 — Demo refresh clears login throttles for every account.** `apps/worker/src/ops/seed-demo.ts:69` deletes all `login-%` throttle rows during each seed, including those for unrelated users and tenants. Delete only throttle keys that can be attributed to the demo account.
2. **P1 — Masked recipient history exposes the true sender’s area.** `apps/worker/src/do/gerai-vault/contacts/index.ts:399` returns `c.true_area_label` even when the adjacent projections hide the sender ID and use the masked label name. Project the printed area from the mask snapshot or return `NULL` under the same masking condition.
3. **P2 — Geocoding forwards and retains the raw address query.** `apps/worker/src/lib/geocode.ts:47` sends the full query to Nominatim on a cache miss before trying broader variants. At `:95` and `:109`, the shared KV cache stores that query in the key for up to seven days. Minimize address data before sending it upstream, and keep raw customer addresses out of cache keys and values.
4. **P2 — Failed discount sync can still create unaudited pricing rules.** `apps/worker/src/pricing/rules/index.ts:316` commits default rules before checking the outlet area or fetching provider rates. A later `AREA_REQUIRED`, `NOT_CONNECTED`, or provider failure leaves those rows in place without the sync audit written at `:391`. Stage the inserts after validation and commit them with the rule changes and audit.
5. **P2 — Seller-key sync can report `restricted` without persisting the restriction.** `apps/worker/src/do/gerai-vault/credentials/rotation.ts:29` and `:36` suppress failures from both persistence paths; the DO result is also discarded. The caller then returns `restricted` at `:131`. Require confirmation from the authoritative store and make D1 reconciliation retryable if its write fails.
