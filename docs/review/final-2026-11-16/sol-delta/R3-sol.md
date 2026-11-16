Verdict: REQUEST_CHANGES

## Review

1. **P1 — A readable-but-unpaid sibling now loses the paid-batch fence.**  
   **Location:** `apps/worker/src/do/gerai-vault/index.ts:940`, `:950–952`.  
   A payment through A succeeds and A reads back with an AWB, while B reads back successfully **without** an AWB. The new `else if (!it)` leaves `siblingsUnknown` false, so A’s journal finishes and earlier unresolved journals become `done`. B remains held; calling through B now finds no unresolved attempt and submits another batch payment. The added regression covers an unreadable B, not this lagging-but-readable case.  
   **Smallest fix:** When the batch is known paid, keep the fence until every held sibling has an AWB—not merely a readable response.

2. **P1 — Re-quoting a materialized bulk draft can bypass its reserved cap.**  
   **Location:** `apps/worker/src/do/gerai-vault/api-spend/index.ts:14–15`; `apps/worker/src/do/gerai-vault/index.ts:1962–1964`.  
   Commit a bulk row at an exact-fit cap, then freeze a more expensive quote before queued dispatch. `freezeQuote` permits unpaid drafts (`index.ts:620–622`), but the reservation retains the original amount. API issue returns `"already"` solely because the slug exists; queued bulk dispatch supplies no `apiSpend` at all (`index.ts:2007`). Either path can issue the more expensive shipment without charging the increase.  
   **Smallest fix:** Bind reservations to the quote and atomically validate/reprice them before dispatch, including queued dispatch; alternatively reject re-quotes while a bulk reservation owns the draft.

3. **P2 — Bulk pre-journal failures permanently retain reservations.**  
   **Location:** `apps/worker/src/bulk/service.ts:124–127`; `apps/worker/src/do/gerai-vault/index.ts:717–718`, `:2007–2010`.  
   A materialized row whose quote expires before consumption fails `readyToDispatch`, gets marked attempted, and is never issued. The removed consumer cleanup previously released that reservation; the replacement releases only rejection, reconciliation-to-draft, or cancellation. Consequently, the failed draft continues consuming the daily cap. Key/pickup and masking preflight refusals have the same gap.  
   **Smallest fix:** Atomically release bulk reservations when recording a definitive pre-journal non-issue failure; preserve them for active or ambiguous dispatches.

4. **P1 — Ledger migration discards existing daily spend.**  
   **Location:** `packages/db/migrations/control/0017_retire_api_key_spend.sql:4–5`; `packages/db/migrations/tenant/0022_rescan_and_api_spend.sql:10–17`.  
   Upgrading a database containing reservations from the previous implementation drops both populated control-plane tables and creates empty tenant ledgers without transferring usage. A key that already exhausted today’s cap can immediately spend another full cap. Held/ambiguous reservations are also lost.  
   **Smallest fix:** Retain the old ledger until existing daily usage and outstanding reservations have been transferred or explicitly drained through a staged compatibility migration; drop it only afterward.

5. **P2 — Refunds with a description-only reference stop matching when a sub-item exists.**  
   **Location:** `apps/worker/src/do/gerai-vault/finance/index.ts:207–209`.  
   A cleared refund with description `Claim approved for returned order <AWB>`, no top-level identifiers, and one amount-only sub-item previously matched through the description token. The new sub-item branch considers only sub-item and top-level identifiers, so it flags the refund unmatched and never marks the claim paid. This also contradicts spec 09 §2.2’s description-based refund matching.  
   **Smallest fix:** Preserve the description fallback when attribution is unambiguous, at least for a single sub-item, without borrowing another sub-item’s reference.

### Round-2 disposition verification

| Finding | Status | Evidence |
|---|---|---|
| R2-1 | **PARTIAL** | Issued-member check fixes the reported follow-up scenario; finding 1 still permits another payment. |
| R2-2 | **FIXED** | Reservation and dispatch journal now share one tenant transaction. |
| R2-3 | **FIXED** | Materialization and reservations commit together; thrown `CapReached` rolls back the transaction. |
| R2-4 | **FIXED** | Original 0021 restored; registered 0022 adds columns; original-v21 upgrade test added. |
| R2-5 | **FIXED** | Reconciliation-to-draft releases spend in the same transaction (`index.ts:854`). |
| R2-6 | **FIXED** | Reservation identity is now tenant-object-local. |
| R2-7 | **FIXED** | Bulk and pay-unpaid use the same INV reservation identity. |
| R2-8 | **FIXED** | Usage derives from ledger rows; transactional deletion needs no separate decrement. |
| R2-9 | **FIXED** | `exceptionsOp` awaits `armAlarm`; test checks actual alarm installation. |
| R2-10 | **FIXED** | Scan checks exact preceding guard and allowed middleware identities. |
| R2-11 | **FIXED** | Refund sub-items resolve independently; separate regression noted in finding 5. |
| R2-12 | **FIXED** | Sub-item totals require every amount to be known before summing. |

Reviewed the supplied diff and current source/tests read-only. Tests were not executed; excluded paths were not read. No deferred P3 items re-raised. **Merge verdict: BLOCK.**