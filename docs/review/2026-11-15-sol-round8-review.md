# Round 8 — M0 Specification Review

## Review

**Verdict: REQUEST_CHANGES**

Scope: current HEAD `872698ff839d`, named specification seams. Read-only; no tests executed. No committed diff artifact was supplied, so this reviews the current contracts, not a verified commit range. Evidence excludes `docs/review/` and prototype code.

### Status table

| Item | Status | Evidence |
|---|---|---|
| **N5 — minute polling versus second webhook precision** | **RESOLVED** | `docs/spec/01-DATA-MODEL-AND-LEDGER.md:134–138` normalises timestamps and compares minute buckets; `:158–161` persists the winning bucket/rank; `:171–174` requires the original counterexample in both orders and permutation testing. |
| **N6 — undefined branch ordering, missing `lost`, alert treated as status** | **RESOLVED** | `docs/spec/01-DATA-MODEL-AND-LEDGER.md:139–152` supplies an explicit total order including `lost` and `cancelled`; `:158–166` defines maximum selection and terminal conflicts; `:167–170` makes `stuck_attention` a separate derived flag. Local-custody safety is a new issue below. |

### Correct / consistency checks

- Maximum selection over the specified total order is arrival-order independent. The accepted within-minute trade-off is explicit (`docs/spec/01-DATA-MODEL-AND-LEDGER.md:158–166`).
- Pre-issue states remain outside provider ordering (`docs/spec/01-DATA-MODEL-AND-LEDGER.md:169–170`), consistent with dispatch journaling and reconciliation in `docs/adr/ADR-0004-durable-object-per-gerai-vault.md:15` and low-balance settlement in `docs/spec/09-MENGANTAR-FINANCIAL-SYNC-AND-RECONCILIATION.md:53–65`.
- No additional contradiction found with counter cancellation/void separation or provider cancellation read-back (`docs/spec/03-COUNTER-POS-PRINTING-AND-SHIFT.md:39–40,93–94`; `docs/spec/09-MENGANTAR-FINANCIAL-SYNC-AND-RECONCILIATION.md:45`).
- Manifest/return custody and the corresponding Kiriman flows remain inconsistent with the new ordering rule: N7.

### New finding

**N7 — P1: timestamp-first ordering can undo verified local custody, including completed handback.**

**Location:** `docs/spec/01-DATA-MODEL-AND-LEDGER.md:154–166`.

Rule 4 claims that “a terminal local action is never undone,” but rules 5–6 permit it. For successive minute buckets `B` and `B+1`:

| Observations | Required winner |
|---|---|
| Local `handed_to_courier` `(0,B,20)`; later provider `ready_for_pickup` `(0,B+1,10)` | `ready_for_pickup` |
| Local `rts_at_gerai` `(0,B,60)`; later provider `in_transit` `(0,B+1,30)` | `in_transit` |
| Verified local `rts_returned_to_sender` `(1,B,93)`; later provider `delivered` `(1,B+1,92)` | `delivered` + conflict item |

These outcomes are deterministic, but do not preserve physical custody. The first re-enters the “all `ready_for_pickup` shipments” queue despite handover (`docs/spec/04-PICKUP-MANIFEST-AND-RETURNS.md:10,17–18`). The others contradict the documented intake and completed-handback states (`:27–32`) and their Meja Retur workflow (`docs/visual/06-REMAINING-MENUS-WIREFRAMES.md:31–33`). A conflict item does not preserve the operational state.

**Smallest fix:** retain deterministic provider ordering, but define durable local-custody precedence/floors—or a separate custody projection—so later provider observations cannot reverse handover, intake, or verified handback. Route contradictory observations to history/conflict review. Avoid arrival-order-dependent transition guards. Require these three cases in both arrival orders and after restart.

**Merge verdict: BLOCK** — one P1 remains; the M0 specification lock is not yet approvable.