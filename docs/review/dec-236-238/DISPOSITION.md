# DEC-236/237/238 — review disposition

Reviewer: GPT-6.1 Sol (`9router-fantastico/cx/gpt-6.1-sol`), independent of the implementer (Claude Opus 5.5).

## Round 1 — REQUEST_CHANGES (`R1-sol.md`)

| # | Sev | Finding | Fix | Proof |
|---|---|---|---|---|
| 1 | P1 | Failed/edited re-quote kept the old POS selection payable | `QuotePanel` derives the current request; any difference from the last quoted one (edit, re-quote start, failure) calls `onStale` → POS drops the selection; stale cards hide `Pilih` and show a warning | e2e `quote.spec.ts` (edit after prefill → selection cleared) |
| 2 | P1 | Checkout ignored the frozen card | POS consumes the `/quotes/freeze` card; a changed counter due or COD total stops before payment with the new amount on screen (`PRICE_CHANGED`); the frozen card drives all later payment maths | code path; same freeze contract as `/kiriman/:slug` |
| 3 | P1 | J&T ECO COD passes asked `courier=JT` (no ECO row) | ECO COD passes use `courier=all` and read the `JTEco` row | Worker test `J&T ECO is quoted for COD…`; mutation M7 red |
| 4 | P1 | New/unverified sender could not be verified on the POS | provenance card offers `Kirim pesan uji` + `Pengirim sudah menerima`; COD/masked submit refuses before payment when unverified | e2e `Checkout COD: pengirim baru diverifikasi…` (3 viewports); mutation M10 red |
| 5 | P2 | Retry after a lost dispatch response stopped at `/parties` | retry reads the shipment first; issued/held/in-flight → idempotent dispatch read-back shown in place; paid state adopted | code path (dispatch is idempotent per INV) |
| 6 | P2 | Quick-quote handoff dropped packing and the fee choice | `packing` + `biaya` travel in the handoff and restore the form | e2e `quote.spec.ts` (Plastik + fee off → Rp 13.500) |
| 7 | P2 | Cargo extra discount not in observed bps | `cargoDiscountExtra` carried through `ObservedRate`; `observedCargoBps` used by quote and verifier | Worker test `cargo extra discount…`; mutation M8 red |
| 8 | P2 | 90-minute slot reuse never matched | earliest cached slot ≥ 90 min ahead (and inside the SPX window) is reused before a new 120-min slot is reserved | Worker test `a reserved slot is reused…`; mutation M9 red |

## Round 2 — REQUEST_CHANGES (`R2-sol.md`)

R1 #3–#8 verified FIXED; #1 and #2 PARTIAL with three P1s:

| # | Sev | Finding | Fix | Proof |
|---|---|---|---|---|
| R2-A | P1 | An answer to a superseded quote could restore the selection | `QuotePanel` keeps a generation counter bumped by every submit and every form edit; only the latest, still-matching answer publishes (data, req, `onQuoted`) | e2e `pos-guards` superseded-answer test; mutation M11 red |
| R2-B | P1 | Re-selecting the pre-freeze card bypassed the frozen amount | the frozen card is kept with the INV; selection/re-quote of the same request+service shows the frozen card; submit refuses when the on-screen amounts differ from it | e2e `pos-guards` frozen-card test; mutation M12 red |
| R2-C | P1 | Sender COD payout change not confirmed | comparison covers counter due, recipient collection and sender payout (`amountsOf`) | e2e `pos-guards` payout test; mutation M13 red |

## Round 3 — APPROVE (`R3-sol.md`)

R2-A, R2-B, R2-C and residual R1 #1/#2 verified FIXED; no new P0–P3. Approved tree = the one the integrated gate
`DEC-236-238` ran on (recorded in `.delivery/runs/RUN-20261116T211516Z-3ebfb618.jsonl`).

## Post-approval change (found on the :55190 preview)

A cached `time_id` that Mengantar no longer honours (`400 invalid pickup time`) blocked every issue for that slot.
Fix: that refusal deletes the cached slot, and the issue fails with "Tekan sekali lagi untuk memesan jadwal baru"; the
next press reserves a fresh `POST /time`. Worker test `invalid pickup time drops the cached slot…`; mutation M14 red.
Preview: first press shows the message, second press issues (`docs/evidence/DEC-237/final-issued-*.png`).
GPT-6.1 Sol delta round 4: APPROVE (`R4-sol.md`), no new P0–P3.
