# Round 9 — M0 Specification Review

**Verdict: REQUEST_CHANGES**  
**Reviewed HEAD:** `652476f7f497`  
Read-only review of the named specification seams. No evidence taken from `docs/review/` or prototype code. Committed diff unavailable; conclusions concern current HEAD against the supplied delta description. The reported simulation was not independently executed.

## Status table

| Target | Status | Evidence |
|---|---|---|
| **N7 — provider events undo verified local custody** | **RESOLVED** | Provider and custody projections are separate; provider observations cannot change custody (`docs/spec/01-DATA-MODEL-AND-LEDGER.md:134–155`). Combine preserves intake and handback, and preserves handover against provider `ready_for_pickup` (`:156–167`). Persisted inputs and required reverse-order/restart tests are specified (`:168–179`). |
| Spec 04 — manifest, intake, handback | **PARTIAL** | Verified custody actions match spec 04 (`docs/spec/04-PICKUP-MANIFEST-AND-RETURNS.md:17–18,28–35`). Conflict review is specified (`:49–50`). Cancellation guard has the new mismatch below. |
| Spec 03 — cancellation/payment rules | **CONSISTENT**, subject to cancellation naming fix | Counter-payment reversal and cancellation remain separate from provider status (`docs/spec/03-COUNTER-POS-PRINTING-AND-SHIFT.md:39–40`); issued bulk cancellations retain read-back (`:92–94`). |
| Visual 06/07 — Kiriman | **PARTIAL** | Existing pickup/return workflows and tabs remain compatible (`docs/visual/06-REMAINING-MENUS-WIREFRAMES.md:30–33`; `docs/visual/07-APP-SHELL-NAVIGATION-AND-PAGE-INVENTORY.md:127–131`). Visual 06 omits the new conflict filter. |
| Spec 09 / ADR-0004 | **CONSISTENT** | Cancellation read-back remains independent of counter void (`docs/spec/09-MENGANTAR-FINANCIAL-SYNC-AND-RECONCILIATION.md:46`); unpaid settlement and dispatch journaling remain separate (`:63–64`; `docs/adr/ADR-0004-durable-object-per-gerai-vault.md:15`). |
| Spec 01 §3 diagram | **PARTIAL** | `stuck_attention` is correctly drawn as an alert, not a bracketed state (`docs/spec/01-DATA-MODEL-AND-LEDGER.md:120,171–174`). Newly effective `provider_returned` and `lost` are absent from the diagram. |

## New findings

### N8 — P1: Local cancellation produces a status not covered by the manifest cancellation guard

- **Location:** `docs/spec/01-DATA-MODEL-AND-LEDGER.md:154–160`; `docs/spec/04-PICKUP-MANIFEST-AND-RETURNS.md:16`.
- **Evidence:** Verified pre-pickup cancellation records custody `cancelled_local`; combine returns **that custody stage as effective status**. Manifest scanning explicitly blocks `cancelled`, not `cancelled_local`. The lifecycle diagram also names the cancellation destination `cancelled` (`spec 01:116`). Thus the new effective cancellation value is outside the existing explicit guard contract.
- **Smallest fix:** Keep `custody_stage = cancelled_local`, but map it to effective **`status = cancelled`**. Preserve its conflict predicate. Require a test that a read-back-confirmed local cancellation remains blocked from manifest handover after restart.

### N9 — P2: Visual exception-filter inventory omits conflict review

- **Location:** `docs/visual/06-REMAINING-MENUS-WIREFRAMES.md:32`, versus `docs/spec/04-PICKUP-MANIFEST-AND-RETURNS.md:49–50`.
- **Evidence:** The visual inventory still lists only the previous four filters.
- **Smallest fix:** Add owner-facing `Status Bertentangan` to the existing `Kendala & Klaim` inventory; no new tab is needed.

### N10 — P2: Lifecycle diagram omits newly reachable effective states

- **Location:** `docs/spec/01-DATA-MODEL-AND-LEDGER.md:107–130,147–149,162–164`.
- **Evidence:** Combine can expose `provider_returned` and `lost`, but neither appears in the lifecycle diagram. `provider_returned` is explicitly distinct from verified `rts_at_gerai`.
- **Smallest fix:** Add those branches, showing `provider_returned` as provider-reported return awaiting verified intake, not as custody proof.

## Merge verdict

**BLOCK — N7 is resolved, but N8 must be corrected before the M0 specification lock.**