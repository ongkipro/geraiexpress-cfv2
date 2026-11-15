# Round 7 — M0 Specification Delta Review

**Verdict: REQUEST_CHANGES**

Read-only review of current HEAD `6b3eec811468`. Evidence excludes `docs/review/` and `prototype/`. No committed-diff artifact was available; conclusions concern the current specification text.

## Status

| Item | Status | Evidence |
|---|---|---|
| **N4 — seconds/milliseconds mismatch** | **RESOLVED** | `docs/spec/01-DATA-MODEL-AND-LEDGER.md:73` defines the watermark as UTC epoch ms; `:99` preserves signed seconds separately and explicitly multiplies by 1000; `:100` routes application through the shared rule. |
| Shared ordering and test requirements | **PARTIAL** | `docs/spec/01-DATA-MODEL-AND-LEDGER.md:133–143` specifies normalization, stale-history handling, terminal protection and cross-source tests, but minute-versus-second precision still produces incorrect ordering (N5). These are required tests, not executed-test evidence. |
| Equal-time branch handling | **PARTIAL** | “Further along” at `docs/spec/01-DATA-MODEL-AND-LEDGER.md:139–140` lacks an explicit comparison relation for the branching diagram at `:120–129` (N6). |
| Polling-floor consistency | **CONSISTENT; reference correction** | The hourly status floor is in `ARCHITECTURE.md:38,63` and `PRD.md:44`, **not spec 09**. `docs/spec/09-MENGANTAR-FINANCIAL-SYNC-AND-RECONCILIATION.md:64–71` governs financial sync. The shared function includes polling, but N5 undermines its recovery behavior. |

## New findings

### N5 — P1: Common units do not resolve differing timestamp precision

**Location:** `docs/spec/01-DATA-MODEL-AND-LEDGER.md:99,133–141`.

Polling dates have minute precision, while webhook timestamps retain seconds. Parsing both into milliseconds does not make their chronological comparisons reliable within a minute.

**Repro:** An `in_transit` webhook is timestamped `10:15:40`. A later `rts_in_transit` event at `10:15:50` is recovered through polling, which exposes only `10:15`. Its parsed `10:15:00` is classified as stale by rule 2. Conversely, applying that poll first permits the earlier webhook to overwrite it under rule 4. Neither observation is terminal, and the equal-time rule never runs.

**Smallest fix:** Define precision-aware comparison—for example, retain exact timestamps for audit but compare common minute buckets for status ordering, applying an explicit tie relation within a bucket. Require this exact poll↔webhook case in both processing orders, with the same expected status.

### N6 — P2: Equal-time progress needs an explicit partial-order policy

**Location:** `docs/spec/01-DATA-MODEL-AND-LEDGER.md:120–140`.

The diagram is not a strict sequence: `undelivery_hold` and `rts_in_transit` are sibling branches converging at `rts_at_gerai`. It does not establish which sibling is “further along.” `in_transit → stuck_attention` is drawn, but the rule does not explicitly define direct-edge versus transitive progress. Additionally, `lost` appears in the terminal list at `:137` but not in the diagram used for tie comparison.

A graph-reachability interpretation would retain whichever incomparable branch arrived first; a numeric-rank interpretation could choose a different result.

**Smallest fix:** Define the tie relation explicitly, including incomparable branches, `lost`, and alert-state handling. State whether incomparable ties intentionally retain the current status, and specify expected outcomes for both arrival orders. Do not imply a total ordering where the lifecycle has none.

## Merge verdict

**BLOCK the M0 specification lock pending N5.** N4’s unit mismatch is resolved, but cross-source ordering still has a concrete P1 precision defect.