# DEC-246 — disposition of GPT-6.1 Sol R1 (`R1-sol.md`, REQUEST_CHANGES, range `932b5c2..07500c5`)

All five findings are fixed on branch `dec-246`, each with a regression test and a mutation that turns it red
(`docs/evidence/DEC-246/mutations.md`, R1-M1..M5).

| # | Sev | Finding | Fix | Regression | Mutation |
|---|---|---|---|---|---|
| 1 | P1 | Rotation tickets replayable after an intervening rotation (A→B→A) | Every ticket (`rotate-start` and recovery-issued) carries `gen = sha256("totp-generation:" + active ciphertext)` at issuance. `rotate-confirm` refuses when the active ciphertext's generation differs, and the swap stays conditional on that exact ciphertext (`UPDATE … WHERE totp_secret_encrypted = ?`). The ciphertext has a fresh random IV per enrolment/rotation, so any swap — this ticket confirmed, another rotation, a reset + re-enrolment — ends every earlier ticket, including a return to a previous secret. The old "ticket secret equals active secret" check is gone (subsumed). `apps/worker/src/auth/recovery/index.ts`, `apps/worker/src/api/owner.ts` | `super-admin-account.test.ts`: "A→B→A replay and an outstanding ticket from before another rotation are refused"; "a recovery-issued ticket dies once another rotation completes"; the existing immediate-replay assertion | R1-M1 (3 tests red) |
| 2 | P1 | Owner email request is an unthrottled current-password oracle | `requestEmailChange` counts `email-change-pw:<userId>` (5 per 15 min, right or wrong) **before** `verifyPassword`; the key ignores the proposed address. Shared helper, so `app.` gains the same bound. `apps/worker/src/auth/account/index.ts` | "password guesses through the email change are bounded per user, whatever address is proposed" (5 wrong with 5 addresses → 6th with the right password is 429, no OTP row) | R1-M2 |
| 3 | P2 | `kembali` accepts tab/CR/LF → `//evil.example` after `location.assign` | `safeReturnPath(raw, origin)` (`apps/web-owner/src/lib/return-path.ts`): must start with one `/`, no control (≤ 0x20, 0x7F), whitespace or backslash characters, and `new URL(raw, origin).origin` must equal the console origin. Used by the `/totp` route's `validateSearch` and again in `TotpPage` right before `location.assign`. | `apps/web-owner/src/lib/return-path.test.ts` (tab, CR, LF, NUL, DEL, space, VT, `%2F%09%2Fevil.example`, `//`, `\`, absolute URLs); root `vitest.config.ts` now includes `apps/web-*/src/**/*.test.ts` | R1-M3 |
| 4 | P2 | Session revocation not audited | `POST /account/sessions/revoke` writes `super_admin.session_revoked` with `{ scope: "one" \| "all_others", revoked }` only (no handle, token or hash). Written right after the revoke rather than batched: the shared helper owns the handle lookup; a failed lookup (404) writes nothing. | sessions test asserts both rows and that the handle is absent | R1-M4 |
| 5 | P2 | `Tersalin` shown although the clipboard failed | `RecoveryCodesBox` awaits `navigator.clipboard.writeText`; unavailable API or rejection shows the alert "Gagal menyalin otomatis. Gunakan Unduh .txt atau catat kode secara manual sebelum menutup layar ini." and never `Tersalin`. | `e2e/super-admin.spec.ts` DEC-246 flow: rejected `writeText`, then `navigator.clipboard` undefined | R1-M5 |

Verification on the fixed tree: worker `test/auth`, `test/account`, `test/migrations`, `test/isolation` 85/85; unit
`return-path` 3/3; owner e2e (`super-admin`, `admin-shell`, `onboarding`) 11 passed / 22 desktop-only skips — one
earlier run of the same trio had a single failure in the unrelated DEC-243 topbar test that passed alone and in the
full re-run (cause not captured; no R1 change touches the topbar); `pnpm check` exit 0 (unit 183, Workers 431, bundle-audit PASS). Fixed tree = the commit that adds this file.

## Sol R2 (`R2-sol.md`) — APPROVE on `e9ea15e`

Read-only delta review of the R1 fixes: all five resolved on disk with focused regressions, no new P0–P2, merge
verdict OK. Sol inspected (did not re-run) the suites; the integrating session re-executed them in the release run
`RUN-20261118T105137Z-06b21b87` (`pnpm check`, migrations, owner e2e) before merge. The first run
`RUN-20261118T100235Z-2224a130` closed BLOCKED because HEAD moved (work committed before finish).

