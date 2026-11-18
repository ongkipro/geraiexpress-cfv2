## Review

**Scope:** Read-only Round 6 delta re-review of TASK-701 / PR-22 (`Layar Pelanggan`) on `task-701`, reviewer-launch HEAD `2c0b542fccd1`.

Reviewed `/data/tmp/task-701-sol-r6-delta.diff`, the release-gate disposition, affected hook and Playwright test, mutation evidence, and verification ledger. The affected source directory has no working-tree changes against reviewer-launch HEAD. No files were modified and no test commands were executed.

### Correct

- **The REL-1 implementation prevents the reported overwrite.** Each status request captures a generation, and its response is adopted only if that generation remains current (`apps/web-app/src/routes/kasir/display-dialog.tsx:36–44`). A pair or unpair result increments the generation before adoption (`display-dialog.tsx:46–52`).
- **Both pairing actions use the invalidating path.** `onPaired` refers to `authoritative` (`display-dialog.tsx:100`), and both successful pair and unpair handlers invoke it (`display-dialog.tsx:120–136`). An older status response therefore cannot undo either result.
- **An unpaired state response also invalidates older status reads** before marking the counter unpaired (`display-dialog.tsx:69–74`). Existing maximum-sequence tracking remains intact.
- **Mutation evidence supports the reported failure mode.** `docs/evidence/TASK-701/mutations.md:61–65` records that accepting status answers regardless of generation makes the new connected-button assertion fail. However, the test does not guarantee this interleaving on every execution, as detailed below.

### Fixed

**REL-1 production behavior — verified resolved by the implementation author; no reviewer edits.**

The generation check cleanly addresses the older-status-response overwrite described in `docs/review/task-701/DISPOSITION.md`, section **“Release gate finding — status race after pairing.”**

### Finding

**R6-F1 — P2: The regression does not enforce the race it claims to exercise.**

**Location:** `e2e/customer-display.spec.ts:39–54`.

The route handler fetches the real status and delays delivery by 1.5 seconds, but the test does not await that fetch before clicking **Pasangkan Layar**. Nor does it hold delivery until pairing has completed. The final two-second sleep is not an acknowledgement that the delayed response was delivered and processed.

Consequently, the test can pass with the generation guard removed:

1. The status read captures `paired: false`.
2. Pairing takes longer than the route’s 1.5-second delay.
3. The false status is delivered **before** the successful pair response.
4. The pair response sets the counter to connected.
5. The final connected-button assertion passes without exercising REL-1.

There is also no assertion that the captured response actually reports `paired: false`. If the server processes pairing first, the delayed response does not reproduce the defect.

The recorded mutation failure proves that one execution reached the intended ordering; it does not close these false-green paths.

**Smallest fix:** Replace the timing-based ordering with explicit barriers:

- Await capture of the status response and assert its body reports unpaired **before** clicking the pairing button.
- Hold that response until the pair result has been adopted.
- Release it, await its delivery/processing, and then assert the counter remains connected.
- Re-run the regression and mutation with that ordering enforced.

### Verification

Inspected `.delivery/runs/RUN-20261118T134151Z-e4270286.jsonl`. It records executed PASS results for unit, Workers, `pnpm check`, and the seven focused/related Playwright specifications (**30 passed**) on the fix-bearing working tree, with no source changes during those executions.

The ledger also retains the earlier failed check/e2e attempts and closes **BLOCKED**, including an out-of-scope `TASKS.md` boundary failure. The disposition acknowledges these limitations and requires a subsequent release run. This review does not independently certify those executions or clear that release gate.

### Merge verdict: BLOCK

The production fix is sound, and no new production-code regressions were identified. The requested zero-new-P0–P2 gate is not yet satisfied because the added regression can pass without exercising the protected race.

**Verdict: REQUEST_CHANGES**