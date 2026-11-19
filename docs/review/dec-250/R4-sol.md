## Review

Read-only Round 4 re-review of DEC-250 on `dec-250` (`cbcd1d5..59ac470`).

- **Finding: P2 — The console filter still does not require `401` in Chromium’s status-code position.** The unanchored `/\bstatus of 401\b/` at `e2e/auth-stage.spec.ts:56` rejects the original Round 3 example, but still matches `Failed to load resource: the server responded with a status of 500 (Upstream responded with a status of 401)`. On `/api/app/auth/me`, that HTTP 500 would be dropped before the assertion at `e2e/auth-stage.spec.ts:269`. Anchor the match to the start of Chromium’s resource-error message, e.g. `/^Failed to load resource: the server responded with a status of 401(?: \(|$)/`.
- **Correct:** The supplied delta changes only the test filter and review bookkeeping. The endpoint check, uncaught page-error collection, and final assertion are unchanged. No new findings beyond the unresolved Round 3 P2.

**Verification:** The fix-wave ledger records ESLint passing and all three focused desktop Playwright tests passing (`.delivery/runs/RUN-20261119T051010Z-2be21a7b.jsonl:2`, `.delivery/runs/RUN-20261119T051010Z-2be21a7b.jsonl:3`). The counterexample follows from inspecting the regex; I did not rerun the tests or modify files.

**Merge verdict: BLOCK** — the 401-only exception is not yet limited to the status-code position.

Verdict: REQUEST_CHANGES