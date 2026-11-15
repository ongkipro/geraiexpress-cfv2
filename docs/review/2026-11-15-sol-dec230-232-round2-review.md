## Review

**APPROVE — with P2 notes.** No P0/P1 remain.

Read-only review of `/data/tmp/review/dec230-232-fix.diff` against current files. Excluded `docs/review/` from the review target; read the Round 1 report only as the findings baseline. Excluded `prototype/`. No tests executed.

### Finding status

| # | Status | Evidence |
|---|---|---|
| 1 | **RESOLVED** | Requested discount and effective cost are separated in `DECISIONS.md:11`, `PRD.md:61`, and `docs/spec/02-PRICING-DISCOUNT-AND-CASHBACK.md:29,63–65`. The old DEC-226 save guard is explicitly superseded (`DECISIONS.md:32`). |
| 2 | **RESOLVED** | Tolerance-aware pending, verified, mismatch and drift transitions are explicit; observations remain unchanged (`docs/spec/02-PRICING-DISCOUNT-AND-CASHBACK.md:47–65`). TASK-207 requires the `2000/1999` and verified-to-`1000` fixtures (`TASKS.md:315–317`). |
| 3 | **PARTIAL — P2 wording remains** | Per-class normalization and cargo-only fields are now explicit (`docs/spec/02-PRICING-DISCOUNT-AND-CASHBACK.md:44–46`); cargo fixture and quote recording are assigned (`TASKS.md:316–317,381–382`). However, TASK-207 still describes verification universally as using `discountPercent` (`TASKS.md:309–312`), as does `DECISIONS.md:36`. The explicit cargo contract/test resolves the behavioral defect, but these summaries remain stale. |
| 4 | **RESOLVED** | Former pricing prerequisite superseded (`STATUS.md:24–25`); direct Public API/hardening policy aligned (`docs/adr/ADR-0003-mengantar-partner-and-egress-relay.md:8`); A/C are current choices and B is historical/rejected (`docs/spec/10-PARTNER-RELAY-VPS-STATIC-EGRESS.md:4,69–70`). |
| 5 | **PARTIAL — P2 test assignment remains** | Quote/issue/cancel limits now have implementation owners (`TASKS.md:381–382,396`); issue/cancel tests and rotation-action tests are explicit (`TASKS.md:329–333,403`). TASK-303’s completion criteria still omit a quote-rate-limit test (`TASKS.md:387`). |
| 6 | **RESOLVED** | `Kebijakan Diskon` added (`docs/spec/06-DOMAINS-MENUS-AND-ROUTES.md:62`); hard-coded settings count removed in favor of the owning inventory (`docs/visual/07-APP-SHELL-NAVIGATION-AND-PAGE-INVENTORY.md:137`). |

### Remaining findings / smallest fixes

- **P2 — Stale verifier summaries:** `TASKS.md:309–312`, `DECISIONS.md:36`. Replace universal `discountPercent` wording with “service-class-specific observed bps per spec 02 §2.1.”
- **P2 — Quote-limit test not explicitly assigned:** `TASKS.md:387`. Add a per-tenant quote-rate-limit acceptance test, including tenant isolation, alongside the existing completion criteria.

### New contradictions

None introduced by the fix delta.

**Merge verdict: OK with notes.** The remaining items are documentation/test-planning follow-through, not unresolved P1 behavior.