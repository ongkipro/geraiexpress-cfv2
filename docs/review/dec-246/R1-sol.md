## Review

**Scope:** Independent, read-only review of DEC-246, range `932b5c2..07500c5`, using `/data/tmp/dec-246-sol-r1.diff` and the corresponding source, tests, specifications, and screenshot evidence. No files were modified. Tests were inspected but not executed.

### Correct

- **Recovery-code generation, storage, and consumption are sound.** Codes use `crypto.getRandomValues`, an unbiased 32-symbol alphabet, and eight distinct codes per set. Storage uses the server-peppered, purpose-separated `tokenHash`; consumption is an atomic `UPDATE … WHERE used_at IS NULL RETURNING id`. See `apps/worker/src/auth/recovery/index.ts:8–64` and `apps/worker/src/auth/tokens.ts:10–12`.
- **Recovery and TOTP share the same brute-force lock.** Both paths call `secondFactorGate` and `secondFactorWrong`, using the same `totp-lock:` and `totp-fail:` keys. Malformed recovery codes also count as failures. The mixed-five-attempt test checks that even valid recovery/TOTP codes are subsequently refused. See `apps/worker/src/api/owner.ts:92–106, 125–134, 204–212` and `apps/worker/test/auth/super-admin-account.test.ts:106–118`.
- **Recovery reset avoids a password-only enrolment window.** `resetTotp` promotes the recovery-authenticated session, revokes other owner sessions, and returns a rotation ticket while keeping the existing authenticator active until confirmation. This matches the explicitly documented DEC-246 decision rather than returning the account to `pending`. See `apps/worker/src/api/owner.ts:214–228`.
- **Rotation preserves the active authenticator when abandoned.** Tickets are AES-GCM protected, purpose-separated, user-bound, and expire after ten minutes. Successful confirmation records `totp_last_step` and revokes other owner sessions. There is, however, a ticket-replay defect described below.
- **Endpoint authorization and isolation are appropriately structured.** The shared guard checks CSRF, owner-context sessions, active Super Admin status, AAL, and recency. New routes use the registry and declared auth levels. Account queries and session handles are scoped to the authenticated user; email confirmation also binds the OTP to that user. See `apps/worker/src/api/owner.ts:48–65, 295–381` and `apps/worker/src/auth/account/index.ts:86–112, 135–169`.
- **Migration and schema match the repository’s established structural-parity contract.** Migration `0019` and the Drizzle table agree on columns, primary key, nullability, and the `(user_id, used_at)` index. SQL additionally enforces the foreign key and hash-length constraint, consistent with the existing convention of SQL-owned constraints. The drift test checks columns/nullability/defaults, not foreign keys or CHECK constraints.
- **Requested console polish is implemented.** The logo is frameless with expanded/collapsed sizing, and the console no longer supplies the marketing-site link. Indonesian UI copy and localized fallback errors are used; account step-up handles `TOTP_RECENT_REQUIRED`. Source and supplied screenshots support these changes: `apps/web-app/src/components/admin/shell.tsx:503–512`, `apps/web-owner/src/shell/console-shell.tsx:131–145`, and `docs/evidence/DEC-246/{brand-logo-1440,menu-akun-1440,akun-390}.png`.

### Findings

#### Finding: P1 — Rotation tickets become replayable after an intervening rotation

**Location:** `apps/worker/src/api/owner.ts:353–368`; `apps/worker/src/auth/recovery/index.ts:70–85`

The replay check only rejects a ticket whose secret equals the **currently active** secret. Tickets contain no consumed nonce or binding to the authenticator generation from which rotation started. Confirmation also calls `verifyTotp(..., null)`.

A deterministic sequence in the retained current session is:

1. Start and confirm rotation **A**.
2. Start and confirm rotation **B** before A’s ticket expires.
3. Submit A’s ticket again with a valid A code.

At step 3, the active secret is B, so the equality check no longer rejects A. Verification ignores previously accepted A steps, and the update restores A. Within the same TOTP time step, even the previously accepted A code can be reused. The existing test only checks immediate A→A replay.

**Smallest fix:** Bind each ticket to the active authenticator generation at issuance and enforce that binding in the conditional update, or atomically consume a server-side ticket nonce. Apply the same protection to recovery-issued tickets.

**Regression:** Assert that A→B→A replay and confirmation of an outstanding ticket issued before another successful rotation are rejected.

#### Finding: P1 — New owner email endpoint exposes an unthrottled current-password oracle

**Location:** `apps/worker/src/api/owner.ts:322–324`; `apps/worker/src/auth/account/index.ts:45–57`

The new owner endpoint calls `requestEmailChange`, which verifies the current password and returns `WRONG_PASSWORD` **before** reaching any throttle. The `email-change-send:` limit only counts requests with a correct password; the confirmation lock likewise does not bound password guesses.

Consequently, possession of a recent owner AAL2 session permits unlimited current-password guesses through this endpoint during the recency window, bypassing the five-attempt reauthentication protection used by the new recovery-code and rotation actions. Although the helper predates this change, its exposure to owner-session credentials is new here.

**Smallest fix:** Apply a per-user reauthentication limit before password verification in `requestEmailChange`, or gate the owner route with the existing bounded password-confirmation mechanism.

**Regression:** Repeated wrong passwords must reach `429`; changing the proposed email must not reset that limit.

#### Finding: P2 — Step-up return-path validation permits an external redirect through control characters

**Location:** `apps/web-owner/src/router.tsx:80–85`; `apps/web-owner/src/routes/totp/page.tsx:48–51`

The validation rejects literal `//` and backslashes but accepts ASCII tab/newline characters. For example:

```text
/totp?mode=required&kembali=%2F%09%2Fevil.example
```

The decoded value `/[TAB]/evil.example` passes the checks. Browser URL parsing removes the tab when `window.location.assign` processes the value, producing `//evil.example` and an external redirect after successful verification.

This does not forward the owner cookie, but it defeats the explicit same-site-return contract and enables post-authentication phishing.

**Smallest fix:** Reject control characters and validate the normalized URL against the current origin, preferably restricting returns to known console paths.

**Regression:** Cover encoded tab, CR, and LF variants alongside ordinary `//` and backslash cases.

#### Finding: P2 — Session revocation is not audited

**Location:** `apps/worker/src/api/owner.ts:377–381`; `apps/worker/src/auth/account/index.ts:151–169`

Both individual and all-other-session revocation mutate authentication state without writing an audit event. Neither the route nor its helper inserts an audit record.

This contradicts DEC-246’s accepted invariant that every mutation is audited and the account page’s statement that changes are recorded. The new session tests verify revocation but do not assert auditing.

**Smallest fix:** Record a Super Admin session-revocation event containing the authenticated actor and safe revocation metadata, without logging session tokens or hashes. Prefer batching the audit with the update.

**Regression:** Assert an audit event for both single-session and all-other-session revocation.

#### Finding: P2 — One-time recovery-code view reports clipboard success even when copying fails

**Location:** `apps/web-owner/src/components/recovery-codes.tsx:46–49`

The clipboard rejection is swallowed, and `setCopied(true)` runs unconditionally—including when the Clipboard API is unavailable. The UI therefore displays **“Tersalin”** even though no codes were copied.

Because these codes are only displayed once, a user can trust that success message, leave the screen, and lose the intended backup.

**Smallest fix:** Await successful clipboard completion before displaying “Tersalin”; otherwise show a localized failure message directing the user to download or manually save the codes.

**Regression:** Test both a rejected `writeText` promise and an unavailable Clipboard API.

### Verification and disposition

- **Fixed:** None; review-only.
- Existing tests meaningfully cover initial issuance, ordinary single use, mixed TOTP/recovery lockout, recovery-assisted rotation, abandoned rotation, immediate ticket replay, and core account operations.
- Before release, add the regressions above and rerun the focused worker suite, schema drift, host-isolation suite, and owner Playwright flows. Recorded passing runs were not independently reproduced in this review.

**Merge verdict: BLOCK** — resolve the P1 rotation-replay and password-throttling defects before release.

**Verdict: REQUEST_CHANGES**