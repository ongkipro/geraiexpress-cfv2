Verdict: REQUEST_CHANGES

1. **P2 — New expired-quote regression test races the queue consumer.**  
   **Location:** `apps/worker/test/api-v1/api-v1.test.ts:240–244`.  
   The commit endpoint schedules dispatch immediately (`apps/worker/src/api-v1/index.ts:254`), but the test expires the quote only afterward. If the consumer dispatches first, the shipment becomes issued/held and correctly retains its reservation; the final zero-spend assertion fails. The queue has `max_batch_size: 1` (`wrangler.jsonc:57`), so no ordering prevents this scenario.  
   **Smallest fix:** Materialize through the DO directly with the API-spend context, without enqueueing; then expire the quote and explicitly invoke `bulkDispatch`. Alternatively, gate the consumer until expiration is installed.

| Round-3 finding | Status | Current-HEAD evidence |
|---|---|---|
| R3-1 | FIXED | `apps/worker/src/do/gerai-vault/index.ts:941` retains the fence for readable, AWB-less siblings when the initiating order has an AWB. |
| R3-2 | FIXED | `apps/worker/src/do/gerai-vault/index.ts:623` refuses re-quotes while an API-key reservation exists. |
| R3-3 | FIXED | `apps/worker/src/do/gerai-vault/index.ts:2006–2012` releases reservations transactionally on definitive draft/failed outcomes. Regression-test ordering issue noted above. |
| R3-4 | FIXED | `packages/db/migrations/control/0017_retire_api_key_spend.sql:9–14` guards against outstanding reservations/current-day spend before dropping either ledger. |
| R3-5 | FIXED | `apps/worker/src/do/gerai-vault/finance/index.ts:207–209` restores description fallback for a single sub-item. |

Reviewed the supplied range artifact and current source read-only. Tests were not executed; paths containing `credentials` were skipped.