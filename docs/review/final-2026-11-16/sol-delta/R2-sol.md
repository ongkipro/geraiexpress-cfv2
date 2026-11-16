Verdict: REQUEST_CHANGES

## Review

- **Correct:** The delta fixes the ordinary-path SDK, webhook polling, onboarding nonce/fence, quote binding, COD fee, receipt wrapping, and masking-preview findings. Remaining issues and new regressions follow.
- **Verification:** Reviewed the supplied `R2.diff`, current source, and regression tests. Tests were not executed. Paths containing the excluded segment were not read; deferred P3 items are not re-raised.

### Findings

1. **P1 — A paid batch’s read-back-only fence can still be cleared.** **B-1/C-1 remain partial.**  
   **Location:** `apps/worker/src/do/gerai-vault/index.ts:927–929`.  
   Payment through INV A succeeds, but sibling B’s read-back fails or still lacks an AWB. The journal correctly remains unknown. Calling through B then gets a readable-but-unpaid order and marks **every unresolved batch journal failed**, despite A already being issued. The next call can submit another batch payment.  
   **Smallest fix:** Before declaring the batch unpaid, check all members and retain read-back-only state whenever any member is already issued/paid or unresolved.

2. **P1 — A concurrent `/issue` request can release the active request’s reservation.** **New.**  
   **Location:** `apps/worker/src/api-v1/index.ts:159–172`; `apps/worker/src/do/gerai-vault/index.ts:717–738`.  
   Request A reserves and awaits pickup/key retrieval while the shipment remains `draft`. Request B reuses the reservation, receives `DISPATCH_IN_PROGRESS`, then sees `draft` and deletes A’s reservation. A subsequently issues without counted spend. Distinct Idempotency-Key values do not prevent this interleaving.  
   **Smallest fix:** Never treat `DISPATCH_IN_PROGRESS` as established non-issue; release only after the DO confirms no invocation owns or may issue that reservation.

3. **P1 — Concurrent bulk commits can roll back reservations used by the winning commit.** **New.**  
   **Location:** `apps/worker/src/api-v1/index.ts:277–294`.  
   A reserves row 1; B reuses row 1, reserves row 2, and materializes the batch. A reuses row 2, loses materialization with `BATCH_NOT_READY`, and releases row 1. B’s queued dispatch still issues both rows, but only row 2 remains counted. Tracking which call initially reserved an item does not establish exclusive ownership of its eventual dispatch.  
   **Smallest fix:** Acquire a batch commit owner before reserving rows, and let only that owner materialize or roll back the batch’s reservations.

4. **P1 — Existing schema-v21 objects never receive the new rescan columns.** **New; C-3 is upgrade-incomplete.**  
   **Location:** `packages/db/migrations/tenant/0021_finance_backfill.sql:6–7`; `apps/worker/src/do/gerai-vault/core/migrate.ts:64`.  
   The delta edits migration 0021 instead of adding a migration. An object already migrated using the previous 0021 remains version 21; migration runs apply nothing. Its pending rescan then fails at `apps/worker/src/do/gerai-vault/index.ts:1175` because `rescan_cursor` and `rescan_range` do not exist.  
   **Smallest fix:** Restore 0021, append/register migration 0022, and test upgrading a database created with the **previous** 0021 SQL.

5. **P1 — Successful reconciliation back to draft retains stale spend and can bypass the cap after re-quoting.** **New.**  
   **Location:** `apps/worker/src/api-v1/index.ts:172`; `apps/worker/src/do/gerai-vault/index.ts:833–845`.  
   A definitive “not found” reconciliation returns `ok: true, state: "draft"`. Release runs only on `!r.ok`, so the reservation remains. Re-freezing that draft with a substantially higher cost and issuing again returns `"already"` from `reserveSpend`, charging neither the new amount nor its delta.  
   **Smallest fix:** Release reservations for successful, established non-issue outcomes too, so the next attempt reserves its current frozen amount.

6. **P2 — Spend-item identity is global although INV slugs are tenant-local.** **New.**  
   **Location:** `apps/worker/src/api-v1/keys.ts:61–67`; `packages/db/migrations/control/0015_api_key_spend_items.sql:6`.  
   Slug uniqueness is enforced only inside each tenant (`apps/worker/src/do/gerai-vault/slug/index.ts:9–13`). If two tenants have the same slug, the second tenant’s usage increment is suppressed and the tenant-unscoped fallback returns `"already"`. Its issue proceeds without charging its key.  
   **Smallest fix:** Key reservations by `(tenant_id, item)` and bind tenant identity in every lookup, conflict target, and release.

7. **P2 — Paying an API bulk hold counts its reservation twice.** **New.**  
   **Location:** `apps/worker/src/api-v1/index.ts:190,280–281`.  
   Bulk commit reserves `bulk:<batch>:<row>`, whereas `/pay-unpaid` reserves the shipment slug. A held bulk row therefore needs another reservation despite already being counted. With an exact-fit cap, its payment is incorrectly rejected with 429.  
   **Smallest fix:** Resolve both entry points to one canonical reservation identity, or atomically transfer the row reservation to its materialized slug.

8. **P2 — Reservation release is not atomic with decrementing usage.** **New.**  
   **Location:** `apps/worker/src/api-v1/keys.ts:72–74`.  
   The item is deleted before a separately awaited usage update. If that update fails or execution terminates between statements, usage remains inflated permanently: retry finds no item and cannot finish the decrement.  
   **Smallest fix:** Perform the item-dependent decrement and deletion in one D1 batch transaction.

9. **P2 — Claim expiry writes a timer but does not arm the alarm.** **C-5 remains partial.**  
   **Location:** `apps/worker/src/do/gerai-vault/index.ts:1488–1506`.  
   `exceptionsOp` returns directly from its transaction after inserting `claim_expiry`; it never calls `armAlarm()`. An idle object without another alarm still does not wake at the claim deadline. The new test manually inserts the timer and invokes `runTimers`, bypassing alarm installation.  
   **Smallest fix:** Await `armAlarm()` after the claim transaction; test that claim creation installs a real alarm when none exists.

10. **P2 — Route scanning still does not prove the guard is mounted.** **A-6 remains partial.**  
    **Location:** `apps/worker/test/ci/route-scan.test.ts:19–26`; `apps/worker/src/api/registry.ts:39–42`.  
    Removing only a route’s mounted guard leaves its handler in `REGISTERED` and its method/path in `ROUTES`; `sideDoors()` still passes. Likewise, the middleware exemption validates a count/path, not the documented middleware’s identity.  
    **Smallest fix:** Record and assert the expected mounted guard/handler pair per route, plus the exact allowed middleware identity. Add a missing-guard fixture.

11. **P2 — Refund sub-items are all assigned to the first matched shipment.** **New; C-6 remains partial.**  
    **Location:** `apps/worker/src/do/gerai-vault/finance/index.ts:205–213`.  
    For refund sub-items referencing different orders, `.find(Boolean)` selects one shipment and `subs.forEach(...link(i, ref))` assigns every item to it. The mirror reports “linked,” shows incorrect INV associations, and updates only that shipment’s claim.  
    **Smallest fix:** Resolve and link each referenced sub-item independently; preserve unmatched items as unmatched rather than borrowing another item’s reference.

12. **P2 — The return aggregation treats partially unknown amounts as a complete total.** **New.**  
    **Location:** `apps/worker/src/do/gerai-vault/finance/index.ts:172`.  
    For a Rp5.000 return invoice with same-INV sub-item amounts `-1000` and `NULL`, `COUNT(amount_idr) > 0` selects the sum and records Rp1.000. The unknown remainder is silently discarded.  
    **Smallest fix:** Sum sub-items only when all relevant amounts are known; otherwise use the invoice amount once where attribution is unambiguous, or preserve an unknown/discrepancy.

### Round-1 disposition verification

| Finding ID | Status | Verification |
|---|---|---|
| A-1 | FIXED | Invalid 2xx envelopes now return `maybe_sent`. |
| A-2 | FIXED | Replacement secret advances polling and arms the alarm. |
| A-3 | FIXED | Eligibility and rotation checks occur after encryption, immediately before writing. |
| A-4 | FIXED | Rotation read-back reserves global Partner quota. |
| A-5 | FIXED | Decision side effects use a unique per-call nonce. |
| A-6 | PARTIAL | Side-door detection improved; mounted-guard verification still missing (#10). |
| A-7 | FIXED | Email-change requests check the confirmation lock. |
| A-8 | FIXED | HTTP(S) validation and URL construction share the redacting boundary. |
| B-1 | PARTIAL | Early batch fence fixed; paid-batch read-back state can still be cleared (#1). |
| B-2 | FIXED | Existing shipments read their bound quote snapshot. |
| B-3 | FIXED | Dispatch ownership precedes awaits; journal rechecks state and quote ID. |
| B-4 | FIXED | COD Barang hides and submits no service fee. |
| B-5 | FIXED | Receipt charge items wrap within the content width. |
| B-6 | FIXED | Preview consumes COD mode and recipient-masking default. |
| C-1 | PARTIAL | Batch-wide recovery improved; #1 remains. |
| C-2 | PARTIAL | Ordinary held/unknown reservations persist, but #2 and #5 defeat accounting. |
| C-3 | PARTIAL | Bounded, continued rescan works on fresh schemas; upgrade fails (#4). |
| C-4 | PARTIAL | Frozen-cost calculation and ordinary failure release fixed; #3 and #7 remain. |
| C-5 | PARTIAL | Purpose filtering and live badge predicate fixed; alarm installation missing (#9). |
| C-6 | PARTIAL | Sub-item references now match, but corresponding multi-item links are incorrect (#11). |
| C-7 | FIXED | Original all-null multiplication is fixed; mixed-null regression is new (#12). |
| C-8 | FIXED | Hostname compensation is scoped to a unique request ID. |

**Merge verdict: BLOCK.** After adding the missing regressions, rerun the focused worker suites for API v1, dispatch, finance, exceptions, route scanning, and tenant migration upgrades.