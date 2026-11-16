Verdict: REQUEST_CHANGES

## Findings

1. **P1 — `pay-unpaid` is still not safely fenced per batch.**  
   **Location:** `apps/worker/src/do/gerai-vault/index.ts:821-831,868-889,1220-1242`.  
   The batch fence is acquired **after** awaiting `keyForDispatch`, while unresolved journals are checked by **slug**, not batch. Concurrent calls for sibling INVs can both pass the fence and submit payment. Additionally, if payment succeeds but a sibling read-back fails, the primary journal is completed while that sibling remains held; its next recovery can submit another batch payment. Crash recovery also reads only the journal’s slug.  
   **Smallest fix:** acquire the batch fence before any await; check and settle unresolved journals batch-wide; retain a batch read-back-only state until every member is resolved. Add concurrent-sibling and failed-sibling-read-back tests. **M4-2 remains PARTIAL.**

2. **P1 — Releasing held/ambiguous `/issue` reservations allows daily-cap bypass through recovery.**  
   **Location:** `apps/worker/src/api-v1/index.ts:169-170`; `apps/worker/src/do/gerai-vault/index.ts:1244-1267`.  
   The diff releases the reservation whenever the result is not immediately `issued`, including `provider_unpaid_hold` and `reconciliation_needed`. A capped key can accumulate held orders while balance is zero; after a top-up, `recoverUnpaid` pays them without checking or charging that key’s cap. An ambiguous order subsequently confirmed issued likewise has no retained reservation. The `/pay-unpaid` endpoint’s new reservation does not cover these automatic paths.  
   **Smallest fix:** retain reservations for held/unknown outcomes, or persist the issuing key and atomically enforce its reservation during every recovery path. Release only when non-issuance is established. **M5-1 remains PARTIAL.**

3. **P1 — Daily pending rescan still permanently starves older pending invoices.**  
   **Location:** `apps/worker/src/do/gerai-vault/index.ts:1132-1147`.  
   The query still scans `oldest pending date .. now`, newest-first, with five pages and no persisted rescan continuation. With more than 250 newer invoices, every daily run stops before the old pending invoice. The new incremental backfill cursor does not apply to this branch.  
   **Smallest fix:** bound the range’s end to the newest locally non-final invoice and persist continuation, or directly re-query known pending invoices. Test an old pending row behind more than 250 newer cleared rows. **M4-4 remains PARTIAL.**

4. **P2 — Bulk cap reservation uses the published tariff instead of effective gerai cost and retains reservations for failed queued dispatches.**  
   **Location:** `apps/worker/src/api-v1/index.ts:276-287`; `apps/worker/src/do/gerai-vault/index.ts:1739-1746,1855-1873`.  
   `bulkView` returns stored bulk rows, which have `quote_json` but no `effective_gerai_cost_idr`; the cast therefore falls back to `publish_shipping_idr`. A row with counter due Rp12.500 and effective cost Rp10.000 reserves Rp25.000 instead of Rp22.500, incorrectly rejecting a sufficient Rp22.500 cap. Once queued, rows that fail dispatch also never release their reservation.  
   **Smallest fix:** calculate reservations from the frozen quotes inside materialization, persist per-row reservations, and release them on definitive non-issue outcomes.

5. **P2 — Claim evidence, idle expiry, and Kendala badge alignment are only partially fixed.**  
   **Location:** `apps/worker/src/do/gerai-vault/index.ts:1420-1426,2757-2767`; `apps/worker/src/do/gerai-vault/exceptions/index.ts:60-72`.  
   Claim creation still omits `shipments.scale_photo_r2_key` and accepts evidence IDs without filtering `media_objects.purpose`. Expiry now occurs on list reads, but an idle tenant still loses its poll timer without scheduling outstanding claim deadlines. Finally, the badge uses `stuck_attention_at`, whereas the bucket uses the live 48-hour event-age predicate; between sweeps, the displayed bucket and badge can disagree.  
   **Smallest fix:** include the scale photo, restrict evidence purposes, schedule draft-claim deadlines independently, and share the same time-aware stuck predicate between badge and bucket. **M4-7 remains PARTIAL.**

6. **P2 — Return/refund matching still ignores supported sub-item references.**  
   **Location:** `apps/worker/src/do/gerai-vault/finance/index.ts:153-154,193-200`.  
   Return matching uses only top-level references and the description’s token, ignoring `subItems[].cnote_no` and `ORDER_ID`. Refund matching considers sub-item AWBs but not sub-item order IDs; when sub-items exist, it also never links those rows to the matched shipment. An invoice identifiable through those fields remains unmatched, or appears “linked” without its INV in mutation details.  
   **Smallest fix:** resolve top-level and sub-item AWB/order references before description fallback, then populate the corresponding sub-item links. **M4-3 remains PARTIAL.**

7. **P2 — New return-debit fallback multiplies a top-level invoice amount across null sub-items.**  
   **Location:** `apps/worker/src/do/gerai-vault/finance/index.ts:160-167`.  
   All return sub-items are linked to the same INV, and the sum uses `COALESCE(si.amount_idr, m.amount_idr)` **per sub-item**. A Rp5.000 invoice with two null-amount sub-items records Rp10.000 as `reconciled_extra_adjustment_idr`. Re-reading preserves the inflated result rather than correcting it.  
   **Smallest fix:** aggregate by invoice first and use its top-level amount once when sub-item amounts are unavailable. Add a multiple-null-sub-item fixture and re-read assertion.

8. **P2 — Hostname rollback can purge a concurrent successful request.**  
   **Location:** `apps/worker/src/hostnames/service.ts:94-109`.  
   A zero-change upsert does not roll back a D1 batch. The compensating update identifies ownership using tenant and millisecond timestamp. Two same-tenant requests with the same `now`, both passing prechecks, can interleave so the winner inserts successfully and the loser’s compensation purges the winner’s pending rows. Its queued creation then has no valid pending registration.  
   **Smallest fix:** use a unique request-ownership token for compensation, or make the all-host reservation fail atomically without modifying another request’s rows. **M5-4 remains PARTIAL.**

9. **P3 — Previously identified integration-test gaps remain.**  
   **Location:** `apps/worker/test/backup/backup.test.ts:72-79`; `apps/worker/test/telemetry/operator-checks.test.ts:112-125`.  
   Backup HTTP tests cover authorization, invalid target, and export, but not successful restore or `409 RESTORE_REFUSED`. Health checks still test an empty real object and otherwise fabricated snapshots; nonzero SQL branches and rotating `snapshotLoader` remain untested.  
   **Smallest fix:** exercise restore success/refusal through HTTP, seed nonzero tenant health data, and verify `runChecks` across more than 200 tenants. **M6-6 remains PARTIAL.**

## Prior-finding disposition

IDs refer to the numbered findings in the supplied milestone reviews.

| Finding ID | Status | Evidence / remaining issue |
|---|---|---|
| M4-1 | FIXED | Projection keys and settled boolean: `dto/projection.ts:22-28`, `api/app.ts:352-354` |
| M4-2 | PARTIAL | Finding 1 |
| M4-3 | PARTIAL | Cleared-status guards added; Finding 6 remains |
| M4-4 | PARTIAL | Cursor and discrepancy resolution added; Finding 3 remains |
| M4-5 | FIXED | `finance/view.ts:39,44-45`; `finance/reserve.ts:23-27` |
| M4-6 | FIXED | Cancellation cleanup: vault `index.ts:914-919`; handover guard: `pickup/index.ts:151-161` |
| M4-7 | PARTIAL | Finding 5 |
| M4-8 | FIXED | Shared audio context, UI busy guard, handback CAS transaction, conflict filtering, storage-key removal |
| M4-9 (P3) | NOT FIXED | Explicitly deferred; shared sync-status field and missing event remain |
| M5-1 | PARTIAL | Findings 2 and 4 |
| M5-2 | FIXED | Re-quote guard/update: vault `index.ts:605-619`; used-QR guard: `index.ts:1376-1377` |
| M5-3 | FIXED | `api-v1/index.ts:428-429`; reconciled-money projection keys |
| M5-4 | PARTIAL | Pair purge, fallback removal, and redirect guard added; Finding 8 remains |
| M5-5 | FIXED | Recovery transitions to pending before probe: `hostnames/service.ts:197-203` |
| M5-6 | FIXED | Turnstile widget and verification: `minisite/index.ts:205,249` |
| M5-7 | FIXED | Typed contact matching: vault `index.ts:1380,1387` |
| M5-8 | FIXED | Defined-only updates: `contacts/index.ts:164,224`; conditional brand update in API |
| M5-9 | FIXED | Platform privacy origin and staging CTA hostname |
| M5-10 | FIXED | Per-message MCP charging, pre-validation, expired-draft filtering, held tracking |
| M5-11 (P3) | FIXED | Trimmed initials and suppressed raw provider category |
| M5-12 (P3) | PARTIAL | Canonical/JSON-LD fixed; malformed JSON and bundle regex explicitly deferred |
| M6-1 | FIXED | Request errors contained, busy-before-seen, flag validation and fetch timeouts |
| M6-2 | FIXED | Prefix-safe route labels, always-observed clients, both error-code fields, Partner alert |
| M6-3 | FIXED | Separate checks, bounce rate, never-synced age, rotating tenant slice |
| M6-4 | FIXED | Drill guards, required metadata/checksum, checksum refusal, post-write pruning, chunked BLOB encoding |
| M6-5 | FIXED | Named production-command corrections and public-site URL corrections |
| M6-6 (P3) | PARTIAL | Finding 9 |

Static review of the supplied diff and current source; tests were not executed. No paths containing the `credentials` segment were read.