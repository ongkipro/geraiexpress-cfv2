# Round 3 Delta Review — APPROVE

## Scope and verification

Read-only review of the Round 3 changes against **R2-A/B/C** in `docs/review/dec-236-238/R2-sol.md` and residual **R1 #1/#2** in `R1-sol.md`.

Inspected the supplied `full-r3.diff` and relevant portions of `full-r2.diff`, the Round 2 disposition table, current source at the changed seams, and `e2e/pos-guards.spec.ts`.

**No files were modified. No tests, browser flows, or Git commands were run.** The integrated gate and mutation-test results are not independently verified by this review.

## Review

### Fixed — prior findings

| Finding | Status | Evidence and assessment |
|---|---|---|
| **R2-A — Superseded quote answer restores selection** | **FIXED** | `apps/web-app/src/routes/kasir/quote-panel.tsx:164–173` increments a generation on pricing-request edits and each submission. Both success and failure paths reject superseded answers (`:182,189`), before publishing data, the quoted request, or `onQuoted` (`:183–185`). Thus the delayed A response in the reported A → B sequence cannot restore A’s parent selection. Submission still clears selection immediately (`:177`). |
| **R2-B — Re-selection bypasses frozen-price confirmation** | **FIXED** | The authoritative card is retained alongside the INV (`apps/web-app/src/routes/kasir/index.tsx:211,270–274`). Both service selection and quote completion restore that card only when the **request and service** match the frozen signature (`:333–337`). The matching-INV continuation also compares displayed amounts with the retained card and restores/stops on a mismatch (`:281–283`), before shipment read-back, parties, payment, or dispatch (`:286–304`). |
| **R2-C — Sender COD payout changes without confirmation** | **FIXED** | `amountsOf` includes `senderCodPayableIdr` as well as counter due and recipient collection (`apps/web-app/src/routes/kasir/index.tsx:38`). Both initial-freeze and matching-INV comparisons use it (`:277,281`). A payout-only change therefore updates the summary and stops before money recording or dispatch. |

**Residual R1 #1: FIXED** at the reviewed seam. Existing edit invalidation and stale-card selection guards (`quote-panel.tsx:155–160,347–354`) now work together with response-time generation rejection.

**Residual R1 #2: FIXED** at the reviewed seam. The frozen card is retained, all three confirmed totals are compared, and re-selection/re-quotation cannot silently replace its amounts for the same INV.

### Correct — regression checks

- **Mount and StrictMode ordering:** The generation effect is declared before the auto-quote effect (`quote-panel.tsx:167–169,203–208`). POS configuration begins as `null` and is fetched asynchronously (`:122–132`); auto-quote waits for it. The initial mount effects therefore do not start an auto-quote that their StrictMode replay would immediately supersede. When configuration arrives, any request-key invalidation precedes submission. No first-answer discard was identified in this path.

- **Quick-quote prefill remains connected:** Packing and fee configuration are resolved before automatic submission (`quote-panel.tsx:124–136,203–208`). The parent still enables auto-quote and selects the requested service after a successful answer (`index.tsx:332,335–337`).

- **Superseded answers do not leave loading stuck after settlement:** Publication uses `generation`, but loading cleanup uses `lastSubmit` (`quote-panel.tsx:172–173,197`). Consequently, the latest submission clears loading even if a form edit superseded its result. An older submission cannot clear a newer submission’s loading state.

- **A different request does not inherit the frozen card:** Both restoration callbacks compare the serialized request **and** service code (`index.tsx:333,337`). Submission allocates/freezes anew for a different signature unless the existing paid/claimed INV prohibits that change (`:247–248,268–270`).

- **The reported money mismatch is guarded before payment:** Changed frozen totals stop at `index.tsx:277`; a continuation with mismatched displayed totals stops at `:281–283`. Payment remains downstream at `:295–301`. No new path introduced by this delta was verified to record a different amount from the confirmed summary.

### Test evidence and limits

The added tests encode the three reported regressions:

- Delayed re-quote followed by a weight edit: `e2e/pos-guards.spec.ts:38–53`.
- Freeze-price change followed by re-selection of the old service card: `:56–76`.
- Sender-payout-only change stopping before dispatch: `:79–93`.

The evidence is narrower than the frozen-card test’s title: that test verifies the retained displayed amount and an unpaid shipment, **not** a subsequent successful payment. Its interception changes the returned freeze card, not the stored shipment price (`:61–65`). Same-request re-quote restoration and the defensive submit mismatch branch are supported by source inspection, not directly exercised by that test. These are verification limits, not additional verified implementation defects.

### New findings

No issues found.

## Merge verdict: OK

**Verdict: APPROVE**

R2-A, R2-B, and R2-C are fixed, resolving the reviewed residual R1 #1/#2 paths. No new P0–P3 finding was verified in this delta. This approval does not replace the running integrated gate or claim that its checks have passed.