## Review

**Scope:** Read-only Round 5 final delta re-review of TASK-701 / PR-22 (`Layar Pelanggan`) on `task-701`, supplied commit `94588b5cde7961beea2af60e40562b69ddd8fed5`.

Reviewed the supplied `/data/tmp/task-701-sol-r5-delta.diff`, Round 4 review, fix disposition, affected publisher and tests on disk, hook integration, mutation evidence, and verification ledger. The working-tree check for the affected source directory reported no changes against reviewer-launch HEAD `94588b5cde79`. No files were modified and no test commands were executed.

### Correct

- **R4-F1 is resolved at the required decision point.** The stale/unapplied branch now clears `acked` at `apps/web-app/src/routes/kasir/display-sync.ts:135`, before checking whether the answered input remains current at line 136. A superseded B therefore cannot leave the old acknowledgement of A suppressing the current A.

- **Recovery sends the current input above the returned server mark, not obsolete B.** The response raises `lastSeq` before the stale branch (`display-sync.ts:128`). When B is superseded, its handler returns without rebasing B; the final pump runs after releasing the in-flight guard (`display-sync.ts:155–157`). With `acked` cleared, that pump sends current A using the existing monotonic numbering rule (`display-sync.ts:113–117`).

- **Existing safeguards remain intact.** Applied responses still establish an acknowledgement; current stale inputs still receive only one rebase before parking; superseded stale inputs are not themselves resent (`display-sync.ts:129–138`). The delta changes no retry, stop, hook, server, or tenant-isolation behavior.

### Fixed

**R4-F1 — verified resolved by the implementation author; no reviewer edits.**

The added regression at `apps/web-app/src/routes/kasir/display-sync.test.ts:153–170` reproduces the exact missing interleaving:

1. A is acknowledged.
2. B goes in flight.
3. The current input returns to A.
4. B answers stale with mark 2000.
5. Publications are exactly `A, B, A`, with the final sequence greater than 2000.
6. After the new A acknowledgement, publishing A again is a no-op.

The test controls promise settlement and the publisher clock through the existing harness (`display-sync.test.ts:61–94`), so the race does not depend on network timing. Its exact publication-array assertion also excludes a rebase of obsolete B.

Mutation evidence records that removing the new acknowledgement invalidation makes this regression fail: `docs/evidence/TASK-701/mutations.md:55–59`, **T701-R4-M1**.

### Findings

No issues found.

No new P0–P2 regressions were identified in the supplied delta.

### Verification

Inspected `.delivery/runs/RUN-20261118T131308Z-6159ef9a.jsonl`. It records executed PASS results, exit code 0, and no source changes during execution for:

- Unit suite.
- Worker suite.
- `pnpm check`, including bundle audit.
- Seven focused/related Playwright specifications, including customer display: **30 passed**.

These checks were recorded on the fix-bearing working tree based at `becddd0f8886`, before the supplied commit. They were not independently rerun during this read-only review. The ledger closes **BLOCKED** specifically pending this independent review and identifies a subsequent release run at the reviewed head.

### Merge verdict: OK

R4-F1 is cleanly resolved with deterministic, mutation-backed regression coverage. The requested zero-new-P0–P2 gate is satisfied for this delta.

**Verdict: APPROVE**