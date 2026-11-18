## Review

**Scope:** Read-only Round 4 delta review of TASK-701 / PR-22 on `task-701`, supplied commit `becddd0f888613a6ebd98d1f8c8624996c8ee000`. Reviewed the supplied `/data/tmp/task-701-sol-r4-delta.diff`, Round 3 review, disposition, affected implementation and regressions on disk, specification, mutation evidence, and verification ledger.

The working-tree check reported no changes against reviewer-launch HEAD `becddd0f8886`. No files were modified and no test commands were executed.

### Correct

- **R3-F1’s original transient-failure reproduction is resolved.** The hook no longer suppresses an input equal to the last acknowledgement; every debounced input change reaches the publisher (`apps/web-app/src/routes/kasir/display-dialog.tsx:76–80`). The publisher cancels pending retries on each declaration and clears its acknowledgement after a transient failure (`apps/web-app/src/routes/kasir/display-sync.ts:138–150,159–170`). Consequently, A-success → B-failure → return-to-A resends A instead of retaining B’s retry.

- **The original R3-F1 regression has coverage at both relevant layers.** The controlled unit test checks the cancelled timer, explicitly invokes its late callback, and verifies the publication sequence remains `A, B, A` (`apps/web-app/src/routes/kasir/display-sync.test.ts:115–135`). The browser regression aborts the first Tunai publication, restores QRIS, waits beyond the retry slots, and checks both the absence of further Tunai publications and the displayed QRIS state (`e2e/customer-display.spec.ts:104–125`). Mutation evidence records failures when preserving the old acknowledgement or restoring the hook shortcut (`docs/evidence/TASK-701/mutations.md`, T701-R3-M1/M2).

- **R3-F2’s server-mark plumbing and basic recovery are implemented correctly.** Status reads the pairing’s stored `state_seq`, and state responses read that mark after the attempted write within the same synchronous transaction (`apps/worker/src/do/gerai-vault/customer-display/index.ts:155–168`; `apps/worker/src/do/gerai-vault/index.ts:540–575`). The hook adopts the highest observed mark and supplies it as the publisher’s floor; stale responses are distinguished from applied acknowledgements (`apps/web-app/src/routes/kasir/display-dialog.tsx:29–36,48–56`).

- **The basic earlier-clock and bounded-rebase paths have deterministic regressions.** Units verify numbering above a stored floor, one resend for a current stale input, dropping a superseded stale input, and stopping after a second stale response (`apps/web-app/src/routes/kasir/display-sync.test.ts:153–194`). The worker regression retains one pairing across writes at 2000, 1000, and 2001, asserting the reported high-water mark and final public state (`apps/worker/test/customer-display/customer-display.test.ts:384–402`).

### Fixed

None applied by this reviewer; this review was read-only.

### Finding — R4-F1, P2: A stale response preserves an acknowledgement that can incorrectly suppress the current input

**Location:** `apps/web-app/src/routes/kasir/display-sync.ts:114,128–136`

The newly publisher-owned deduplication assumes `acked` still identifies the server’s content. A transient failure invalidates that assumption, but a **stale response does not**, even though it proves another publication has advanced the pairing.

A deterministic source-backed reproduction using the existing controlled harness is:

1. Publish **A** at sequence 1000 and settle it as applied. The publisher records `acked = A`.
2. Another counter tab for the same member applies **C** to the same pairing at sequence 2000.
3. This publisher sends **B** at sequence 1001.
4. While B is in flight, declare **A** as the current input.
5. Settle B with `{ applied: false, seq: 2000 }`.

At step 5, the publisher raises `lastSeq` but returns from the stale branch because B is no longer current (`display-sync.ts:128–134`). It leaves `acked = A`. The final `pump()` then skips the actual current input A because `target.key === acked` (`display-sync.ts:114`).

**Result:** Only A and B are sent; C remains stored and displayed indefinitely despite A being the current input. This is not a request to resend obsolete B: the correct next publication is current A, numbered above 2000.

The interleaving is supported by the server’s member-scoped publication API and sequence gate (`apps/worker/src/api/app.ts:1081–1085`; `apps/worker/src/do/gerai-vault/customer-display/index.ts:173–185`). The added tests miss the combination: the return-to-A test settles B as applied, while the superseded-stale test starts without a prior acknowledgement (`display-sync.test.ts:137–151,173–194`).

**Smallest fix:** Invalidate `acked` when handling an unapplied/stale result, before deciding whether its input is still current. Preserve the existing rule against rebasing superseded B; let the final pump send current A above the returned mark.

**Required regression:** Combine the existing controlled cases: A applied → B in flight → return to A → B answers stale at 2000. Assert sends `A, B, A`, the final sequence exceeds 2000, B is not rebased, and A is deduplicated only after its new applied acknowledgement.

### Verification

Inspected `.delivery/runs/RUN-20261118T125336Z-519c2283.jsonl`. It records executed PASS results for migrations, isolation, the 30-test E2E run, `pnpm check`, and the later worker rerun. It also preserves the initial worker FAIL with only an `ELIFECYCLE` summary. The run closes **BLOCKED** pending independent review.

These executions were not independently repeated. The regression above follows directly from the current state transitions and is not covered by the inspected tests.

After correction, rerun the focused synchronization units, customer-display worker and E2E suites, and `pnpm check` through the project’s resource wrapper.

### Merge verdict: BLOCK

The two original reproductions are addressed, but the new deduplication and stale-response handling are not sound in combination. One P2 issue remains; no P0 or P1 issues were identified in the reviewed delta. The requested zero-new-P0–P2 gate is not met.

**Verdict: REQUEST_CHANGES**