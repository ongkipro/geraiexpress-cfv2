## Review

**Scope:** Read-only Round 2 delta review of TASK-701 / PR-22 on `task-701`, supplied commit `9f97030`. Inspected the supplied delta artifact, Round 1 review, disposition, affected source and regression tests, specification changes, mutation record, and verification ledger. The working-tree check reported no changes against reviewer-launch HEAD `9f97030`.

No files were modified and no test commands were executed.

### Correct — Round 1 disposition

| Finding | Assessment and evidence |
|---|---|
| **F1 — Server-canonical DTO** | **Resolved for the reported text-injection paths.** Checkout courier and destination are resolved server-side from the active service catalogue and exact area ID (`apps/worker/src/api/app.ts:1100–1123`). ETA is restricted to a numeric duration pattern; packing names must match an active tenant catalogue item; paid courier comes from the shipment’s service code (`apps/worker/src/do/gerai-vault/customer-display/index.ts:23–28,62–96,104–121`). The worker regression injects PII into allowed fields and checks both persisted JSON and public output (`apps/worker/test/customer-display/customer-display.test.ts:282–319`). |
| **F2 — Pair-bound BroadcastChannel hints** | **Resolved.** The publisher sends only `{ tenantSlug, pairId }`, and the receiver refreshes its own capability-authorized URL rather than rendering message contents (`apps/web-app/src/routes/kasir/display-dialog.tsx:45–48`; `layar-pelanggan.tsx:38–45,65–70`). `isHintFor` rejects other known pairings; its unit test includes another member’s pairing (`display-sync.ts:10–15`; `display-sync.test.ts:12–20`). Worker coverage verifies consistent pair IDs and a new ID after re-pairing (`apps/worker/test/customer-display/customer-display.test.ts:335–344`). |
| **F3 — Re-pair unchanged checkout** | **Resolved for the reported reproduction.** The publishing effect depends on `pairId`, and its deduplication key includes pairing and input (`apps/web-app/src/routes/kasir/display-dialog.tsx:33–38,62`). The E2E test re-pairs without editing checkout, verifies the old display ends, and checks that the new device receives checkout and its total (`e2e/customer-display.spec.ts:84–97`). |
| **F4 — Own-key line kinds** | **Resolved.** Parsing requires a string and `Object.hasOwn(LINE_LABELS, l.kind)` before looking up a label (`apps/worker/src/do/gerai-vault/customer-display/index.ts:80–85`). Regression coverage includes inherited names and non-string values, expects `422 DISPLAY_INVALID`, and verifies unchanged state (`apps/worker/test/customer-display/customer-display.test.ts:322–332`). |
| **F5 — Poll serialization and ordering** | **Resolved at the read layer.** Polls, visibility refreshes, and channel hints use one synchronization instance. It allows only one outstanding read, coalesces subsequent refresh requests, and rejects older revisions for the same pair (`apps/web-app/src/routes/kasir/display-sync.ts:23–63`; `layar-pelanggan.tsx:40–70`). Deferred-response unit coverage exercises serialization and older-response rejection (`display-sync.test.ts:23–60`). This does not prevent the new write-ordering regression below. |
| **F6 — Transient publication retry** | **Resolved for unchanged-input transient failures.** Network/5xx failures receive bounded retries; cleanup cancels scheduled retries (`apps/web-app/src/routes/kasir/display-dialog.tsx:17–18,40–61`; `display-sync.ts:66–93`). Unit tests cover bounds, recovery, and cancellation. The E2E test aborts the first state write and verifies recovery without further form input (`display-sync.test.ts:64–123`; `e2e/customer-display.spec.ts:64–71`). |
| **F7 — Localized upload failure** | **Resolved.** Browser/runtime failures use the Indonesian fallback, while API refusals retain their API message (`apps/web-app/src/routes/pengaturan/printer/page.tsx:104,121–133`). E2E coverage aborts the upload and checks both the Indonesian message and absence of browser exception text (`e2e/customer-display.spec.ts:26–31`). |

### Fixed

None applied by this reviewer; this review was read-only.

### Finding — R2-F1, P2: Asynchronous canonicalization can persist obsolete checkout state after a newer publication

**Locations:**
- `apps/worker/src/api/app.ts:1112–1123`
- `apps/web-app/src/routes/kasir/display-dialog.tsx:40–61`
- `apps/web-app/src/routes/kasir/display-sync.ts:82–92`
- `apps/worker/src/do/gerai-vault/customer-display/index.ts:169–171`

**Evidence:** The delta adds an awaited area search before committing each checkout state. On a cache miss this includes an upstream request (`apps/worker/src/couriers/areas.ts:19–26`). Meanwhile, changing input cancels retry scheduling but does **not** stop or serialize an already-running publication. A newer effect can therefore publish while the older request remains inside `displayText()`.

The following source-backed interleaving is permitted:

1. Checkout **A** starts publication and waits in `searchAreas()`.
2. The cashier changes the checkout amount or destination. Cleanup cancels future retries, but A remains in flight.
3. Checkout **B** publishes successfully—for example, its destination search is cached.
4. A’s search completes. A then reaches the tenant object and unconditionally replaces B.

`setDisplayState()` writes the state with the time of that later DO invocation. Consequently, obsolete A receives a **newer** `updatedAt`, so the new poll-ordering guard accepts it. The display can remain at the wrong amount or destination until another cashier interaction. The same path can replace a later paid view if it overtakes a delayed checkout publication.

This is a write-ordering regression exposed by the new asynchronous canonicalization, not a failure of the now-correct serialized poll reader.

**Coverage gap:** The new tests cover delayed **reads**, retry scheduling, and a failed publication with unchanged input. None holds an older state publication across an input change and releases it after a newer publication commits.

**Smallest fix:** Serialize and coalesce publications across effect generations so a newer publication cannot be overtaken by an earlier in-flight one, or enforce a pairing-bound monotonic publication revision in the tenant object. Ignoring an obsolete response or merely cancelling its retry timer is insufficient because the stale server write has already happened.

Add a deterministic regression that delays A’s area resolution, publishes B, releases A, and verifies that stored and public state remain B.

### Verification

The inspected ledger, `.delivery/runs/RUN-20261118T114134Z-c6efb09b.jsonl`, records executed PASS results for worker, migrations, isolation, E2E, and `pnpm check`. Its final result is **BLOCKED** pending independent review. These executions were not independently repeated.

After correcting R2-F1, rerun the focused synchronization unit tests, customer-display worker and E2E suites, and `pnpm check` through the project’s resource wrapper.

**Merge verdict: BLOCK** — the seven original reproductions are addressed, but the delta introduces an uncovered stale-publication regression and therefore does not meet the requested zero-new-P0–P2 gate.

**Verdict: REQUEST_CHANGES**