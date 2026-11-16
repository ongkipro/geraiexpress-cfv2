Verdict: REQUEST_CHANGES

1. **P1 — `payUnpaid` still permits overlapping calls and cross-INV blind retries.**  
   **Location:** `apps/worker/src/do/gerai-vault/index.ts:821-836,884-887`.  
   The batch fence is checked before `await keyForDispatch`, but acquired afterward without rechecking. Two requests can pass the check; the second can read back while the first payment is pending, mark its journals failed, then remove the first request’s shared fence in `finally`. Another request can consequently pay again. Independently, the unresolved-journal query and cleanup are scoped to `slug`, not batch: an unknown payment initiated through INV A does not stop INV B in that batch from issuing another payment.  
   **Smallest fix:** acquire the batch fence before the first await and release it only from that invocation; check and resolve outstanding journals for **every member of the batch**. Add deferred-provider concurrency and sibling-INV retry tests. **M3 #3 remains PARTIAL.**

2. **P1 — Out-of-order re-quotes still desynchronize the shipment from the dispatched quote.**  
   **Location:** `apps/worker/src/do/gerai-vault/index.ts:602-612`; `apps/worker/src/do/gerai-vault/dispatch/index.ts:48-49,132-136`.  
   Suppose quote B has a later `quoted_at` but finishes first; an older, slower quote A freezes afterward. `freezeQuote` unconditionally copies A into `shipments`, including its price, courier and weight. `latestQuote` nevertheless selects B by `quoted_at`, and dispatch uses B. The counter can collect A’s amount while Mengantar receives B’s order.  
   **Smallest fix:** make `shipments.quote_snapshot_id` authoritative when reading an existing shipment’s quote, or reject stale snapshots before updating the shipment. Test reverse-completion order and equal timestamps. **M5 #2 remains PARTIAL.**

3. **P1 — Re-freezing can change money fields after dispatch has captured its payload inputs.**  
   **Location:** `apps/worker/src/do/gerai-vault/index.ts:600-612,694-705,720-725`.  
   Dispatch reads `ready.q` while the shipment remains `draft`, then awaits key retrieval and potentially network-backed pickup registration. During that interval, another request can successfully re-freeze and update the shipment. Dispatch then journals and sends the **old** quote without checking the current quote ID or state. For example, re-quoting from 1 kg to 3 kg during pickup registration leaves the shipment/receipt priced for 3 kg but dispatches 1 kg.  
   **Smallest fix:** reserve the dispatch state before yielding, or compare the captured quote ID and eligible state inside the journal transaction and refuse/restart if either changed. Add a delayed-pickup/re-freeze regression. **M5 #2 remains PARTIAL.**

4. **P2 — Enabled service-fee defaults make COD Barang quotes unavailable by default.**  
   **Location:** `apps/web-app/src/routes/kasir/quote-panel.tsx:81-82,99-100,171-175`; `packages/domain/src/money/index.ts:247-249`.  
   The fee checkbox starts enabled, and `serviceFeeIdr` is submitted for every mode. When an outlet enables its service fee and an operator selects COD Barang, the money rules reject every card with `SERVICE_FEE_NOT_ALLOWED`. Service fees are allowed only for Non-COD and COD Ongkir.  
   **Smallest fix:** submit zero service fee for COD Barang and hide/disable its checkbox in those modes. Test switching from Non-COD to COD Barang with a configured fee. **M3 #7 remains PARTIAL.**

5. **P2 — The new fee line can push PDF receipt totals off the paper.**  
   **Location:** `packages/thermal-print/src/label.ts:132-137`; `packages/thermal-print/src/pdf.ts:18-20,29-38`.  
   Receipt charges are concatenated into one unwrapped 7.5 pt text operation on a 100 mm page. A valid Non-COD example—shipping Rp12.000, packing Rp5.000, service fee Rp200.000, promo Rp2.000—produces a line wider than the page, clipping the trailing total. `PdfPage.text` does not wrap or constrain width.  
   **Smallest fix:** render charge lines separately or wrap within the 94 mm content width and advance subsequent content accordingly. Add a geometry assertion using the maximum supported fee and a promo. **M3 #7 remains PARTIAL.**

6. **P2 — Checkout’s “Tercetak di label” preview ignores the COD privacy default.**  
   **Location:** `apps/web-app/src/components/masking/preset-picker.tsx:14,18,29,54`; `apps/worker/src/do/gerai-vault/index.ts:718`.  
   Dispatch now masks the recipient phone on COD shipments under any preset when `maskRecipientOnCod` is enabled, but the preview still masks only `privasi_penerima_cod`. Under Standar Gerai, for example, checkout explicitly previews a full phone number while the label prints a masked one. The `/masking` response already supplies the setting, but the component ignores it and receives no COD mode.  
   **Smallest fix:** consume `maskRecipientOnCod`, pass the shipment mode, and apply the same printed-identity rules in the preview. **M3 #11 remains PARTIAL.**

### Prior-finding disposition

| Finding ID | Verified status |
|---|---|
| M3 #1 — Ambiguous parse/5xx responses | FIXED |
| M3 #2 — Reconcile guards and masking quota release | FIXED |
| M3 #3 — Pay-unpaid concurrency/unknown-outcome fence | PARTIAL |
| M3 #4 — Recovery from `cancel_unknown` | FIXED |
| M3 #5 — Reconciled COD/adjustment projection | FIXED |
| M3 #6 — Masked sender in shipment detail/list | FIXED |
| M3 #7 — Frozen fees, receipts and POS configuration | PARTIAL |
| M3 #8 — Payout eligibility and partial-payout keys | FIXED |
| M3 #9 — Kasir void visibility and error handling | FIXED |
| M3 #10 — Bluetooth availability and PDF fallback | FIXED |
| M3 #11 — COD recipient privacy and quota alignment | PARTIAL |
| M3 #12 — Profile/PIC/pickup address/D1 name | FIXED |
| M3 #13 — Bulk payment status, totals, verification and channel | FIXED |
| M3 #14 — Shift payout-reversal double counting | FIXED |
| M3 #15 — Shared Indonesian status labels | FIXED |
| M4 #1 — Reconciled-amount projection | FIXED |
| M5 #2 — Re-quote locking and draft synchronization | PARTIAL |

Reviewed the supplied range artifact against current source. Tests were inspected, not executed; credential-segment paths were skipped.