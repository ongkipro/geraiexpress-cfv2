## Review

**Scope:** Read-only Round 2 delta review of DEC-246 at `e9ea15e`. Reviewed `R1-sol.md`, `DISPOSITION.md`, the supplied `/data/tmp/dec-246-sol-r2-delta.diff`, and the corresponding implementation, regression tests, and mutation record on disk. The working-tree check reported no changes under `apps/` against reviewer-launch HEAD `e9ea15e`.

No files were modified. Tests were inspected, not executed.

### Correct — Round 1 resolutions verified

#### 1. P1 — Rotation ticket replay: resolved

- Rotation tickets now contain an authenticated generation binding derived from the active authenticator ciphertext, alongside the user, pending secret, and expiry. Both ordinary rotation and recovery-issued rotation supply that binding. See `apps/worker/src/auth/recovery/index.ts:70–96` and `apps/worker/src/api/owner.ts:228, 350`.
- Confirmation checks the generation before verifying the pending authenticator code. The update also remains conditional on the exact ciphertext read, preventing concurrent confirmations from both replacing the same generation. See `apps/worker/src/api/owner.ts:353–369`.
- Ciphertext is a sound generation identifier here: `encryptString` generates a fresh random 12-byte IV on every encryption. Returning to the same plaintext secret therefore does not restore an earlier generation. See `apps/worker/src/crypto/aead.ts:31–35`.
- The new regressions exercise **A→B→A**, an unconfirmed ticket issued before another rotation, and a recovery-issued ticket invalidated by another rotation. They assert `ROTATE_TICKET_INVALID`; the A→B→A test additionally verifies that B still authenticates and that only two rotations were audited. See `apps/worker/test/auth/super-admin-account.test.ts:214–246`.

The fix addresses replay through state binding, rather than merely rejecting the currently active secret.

#### 2. P1 — Email-change password oracle: resolved

- `requestEmailChange` now increments a per-user five-attempt, fifteen-minute throttle **before** calling `verifyPassword`. Its key does not depend on the proposed email, and rejected requests exit before password verification. See `apps/worker/src/auth/account/index.ts:45–59`.
- The shared throttle uses an atomic D1 upsert-and-return counter, so concurrent requests cannot obtain independent read-then-write allowances. See `apps/worker/src/auth/throttle.ts:9–30`.
- The regression submits five wrong passwords with five different proposed addresses, then checks that a sixth request—even with the correct password and another address—receives `429`, includes a retry interval, and creates no email-change OTP. See `apps/worker/test/auth/super-admin-account.test.ts:305–315`.

#### 3. P2 — `kembali` return-path sanitization: resolved

- The new validator rejects control characters, whitespace, backslashes, absolute URLs, and protocol-relative inputs, and checks the parsed URL’s origin against the console origin. See `apps/web-owner/src/lib/return-path.ts:1–17`.
- Validation is applied both when accepting the route search parameter and immediately before navigation. See `apps/web-owner/src/router.tsx:80–86` and `apps/web-owner/src/routes/totp/page.tsx:49–54`.
- Tests cover ordinary console destinations, tab/CR/LF, NUL, DEL, spaces, vertical tab, the decoded encoded-tab attack, `//`, backslashes, and absolute/non-path values. The root Vitest configuration includes the new web unit tests. See `apps/web-owner/src/lib/return-path.test.ts:6–22` and `vitest.config.ts:11`.

The Round 1 control-character redirect is rejected before browser URL normalization can turn it into an external destination.

#### 4. P2 — Session-revocation auditing: resolved

- Successful single-session and all-other-session revocations now write `super_admin.session_revoked`. The shared audit builder supplies the authenticated actor and self-account target; metadata contains only `{ scope, revoked }`. No session handle, raw token, or token hash is passed to the audit statement. See `apps/worker/src/api/owner.ts:75–79, 297–299, 378–388`.
- The regression asserts both audit records with exact metadata while retaining the checks that the other sessions end and the current session remains usable. See `apps/worker/test/auth/super-admin-account.test.ts:317–333`.

The disposition accurately states that the audit is written immediately after revocation rather than atomically batched with it; batching was a Round 1 preference, not an unmet requirement.

#### 5. P2 — Clipboard false success: resolved

- `RecoveryCodesBox` now awaits `navigator.clipboard.writeText`. Only successful completion sets **“Tersalin”**; rejection or an unavailable API displays a localized alert directing the user to download or manually record the codes. See `apps/web-owner/src/components/recovery-codes.tsx:22–39, 59–72`.
- The browser regression covers both a rejected clipboard promise and an unavailable Clipboard API, asserting the fallback message and absence of **“Tersalin”**. See `e2e/super-admin.spec.ts:87–99`.

### Verification and findings

- All five Round 1 findings are resolved on disk, with focused regressions that exercise the reported failures.
- `docs/evidence/DEC-246/mutations.md:19–27` records a failing mutation for each fix. These results and the passing suite counts in `DISPOSITION.md:15–17` were inspected as supplied evidence, not independently reproduced.
- No new P0–P2 regressions were identified in the reviewed delta.

**No issues found.**

For independent execution confirmation, the integrating session should run the focused worker suite, return-path unit tests, owner Playwright flow, and standard pre-merge checks using the repository’s shared-resource procedure.

**Merge verdict: OK**

**Verdict: APPROVE**