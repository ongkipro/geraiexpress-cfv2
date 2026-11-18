## Review

**Scope:** Read-only Round 3 delta review of TASK-701 / PR-22 on `task-701`, supplied commit `60ad009`. Reviewed `/data/tmp/task-701-sol-r3-delta.diff`, the Round 2 review, disposition, affected implementation and tests, specification, mutation evidence, and verification ledger. The working-tree check reported no changes against reviewer-launch HEAD `60ad00903efd`.

No files were modified and no test commands were executed.

### Correct

- **The original R2-F1 interleaving is covered and prevented for correctly ordered publications.** The route captures `seq` before asynchronous canonicalization (`apps/worker/src/api/app.ts:1122–1129`). The tenant object atomically applies a numbered write only when `state_seq < seq`, and reports a dropped publication as `stale: true` (`apps/worker/src/do/gerai-vault/customer-display/index.ts:170–184`; `apps/worker/src/do/gerai-vault/index.ts:567–570`).

- **The server regression controls the relevant execution order.** It holds A inside the area search, commits B, releases A, and checks the stale response, stored JSON and sequence, and public view. It also checks equal-sequence rejection, higher-sequence acceptance, and sequence reset on a new pairing (`apps/worker/test/customer-display/customer-display.test.ts:346–383`). This directly addresses the coverage gap identified in Round 2.

- **The publisher helper correctly serializes inputs actually submitted to it.** Its in-flight guard, single newest queued input, and rejection handling prevent overlapping sends and avoid retrying an older failed input when a newer input is queued (`apps/web-app/src/routes/kasir/display-sync.ts:91–128`). Controlled promises, timers, and a clock exercise serialization, coalescing, bounded retries, cancellation, and monotonic numbering within one publisher instance (`display-sync.test.ts:61–160`). The recorded mutations exercise the server guard and the two principal publisher-ordering guards (`docs/evidence/TASK-701/mutations.md`, T701-R2-M1–M3).

### Fixed

None applied by this reviewer; this review was read-only.

### Finding — R3-F1, P2: Returning to the last successful input leaves an obsolete retry active

**Locations:**
- `apps/web-app/src/routes/kasir/display-dialog.tsx:67–70`
- `apps/web-app/src/routes/kasir/display-sync.ts:108–115,123–128`

The hook no longer cancels publisher retries when its input effect is cleaned up. Cancellation now happens only when another input reaches `publish()` or the publisher is stopped. However, the hook skips `publish()` when the new input equals `last.current`.

This permits the following source-backed regression:

1. Input **A** publishes successfully, setting `last.current` to A.
2. The cashier changes to **B**. Its publication fails with a transient network/5xx error, scheduling a retry.
3. Before that retry, the cashier restores **A**.
4. B’s effect cleanup clears only its already-fired debounce timer. The new effect returns immediately because A equals `last.current`.
5. B’s uncancelled retry runs, obtains a higher sequence, and successfully replaces A. No further publication is scheduled for the actual current input A.

The display can consequently remain at B’s obsolete amount or payment method. This is introduced by replacing effect-scoped retry cancellation with a persistent publisher while retaining the last-success deduplication shortcut. Previously, effect cleanup cancelled B’s pending retry even if the restored A was deduplicated.

**Smallest fix:** Ensure every current-input transition supersedes obsolete queued/retrying work, including a transition back to the last acknowledged input. Do not skip notifying the publisher solely because the input equals `last.current`; remove that shortcut or make it aware of outstanding work.

**Required regression:** Exercise the hook or browser integration: A succeeds, B fails transiently, input returns to A before B’s retry, then advance/release the retry. Verify that B is not subsequently persisted or displayed. The existing helper tests always explicitly call `publish()` for the newer input, so they do not cover this integration failure.

### Finding — R3-F2, P2: Publication numbering resets on remount without synchronizing to the pairing’s stored sequence

**Locations:**
- `apps/web-app/src/routes/kasir/display-sync.ts:90–98`
- `apps/web-app/src/routes/kasir/display-dialog.tsx:42–47`
- `apps/worker/src/do/gerai-vault/customer-display/index.ts:157–165,175–184`

`lastSeq` starts at zero for each mounted publisher, whereas the server retains the high-water sequence for the entire pairing. The counter neither obtains that high-water value from status nor handles a stale response as an unapplied current input. Every HTTP-successful response—including `{ stale: true }`—sets `last.current`.

A deterministic failure case is:

1. A mounted counter publishes A with clock/sequence **2000**.
2. The clock moves backwards and the counter remounts or reloads while retaining the same pairing.
3. The new publisher sends current input B with clock/sequence **1000**.
4. The tenant object correctly rejects B as stale.
5. The hook nevertheless records B as successfully published. With unchanged input, it never sends B again, even after the clock catches up.

A second counter device with an earlier clock produces the same mismatch. The new unit test’s backwards-clock protection applies only within one publisher instance; it does not cover the lifecycle boundary where `lastSeq` resets.

**Impact:** Legitimate current checkout or paid state can silently remain unpublished. This rejection path is introduced by the new server sequence gate.

**Smallest fix:** Synchronize a new publisher with the active pairing’s server high-water sequence before generating publications, and distinguish a stale response from an applied acknowledgement. Any rebase/republication must preserve rejection of genuinely obsolete in-flight inputs rather than blindly retrying them with a higher number.

**Required regression:** Retain a pairing and its stored sequence, replace the publisher with a fresh instance using an earlier controlled clock, and verify that its current input can be applied without re-pairing and is not falsely marked acknowledged.

### Verification

The inspected ledger, `.delivery/runs/RUN-20261118T122124Z-437e69ce.jsonl`, records executed PASS results for worker, migrations, isolation, `pnpm check`, and the later E2E run. It also preserves the earlier E2E failure; the disposition documents the missing failure detail and subsequent passing runs. The ledger closes **BLOCKED** pending independent review.

These executions were not independently repeated. Neither reported finding is covered by the inspected regression tests.

After correction, rerun through the project’s resource wrapper:

- Focused synchronization unit tests, including publisher replacement.
- Customer-display worker tests.
- Customer-display E2E tests, including the A-success/B-failure/return-to-A reproduction.
- `pnpm check`.

### Merge verdict: BLOCK

The original delayed-A/newer-B reproduction is fixed, but the hook introduces an obsolete-retry regression and the pairing-level sequence gate is not safely integrated with publisher remounts. The requested zero-new-P0–P2 gate is therefore not met.

**Verdict: REQUEST_CHANGES**