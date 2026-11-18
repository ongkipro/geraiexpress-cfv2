# DEC-246 — mutations

Each mutation was applied to the source, `pnpm --filter @gx/worker exec vitest run test/auth/super-admin-account.test.ts`
was run, and the file was restored from its in-memory copy (script-driven, 2026-11-18). Baseline: 14/14 pass.

| Id | File | Mutation | Result | Test that turned red |
|---|---|---|---|---|
| D246-M1 | `apps/worker/src/auth/recovery/index.ts` | `consumeRecoveryCode` drops `used_at IS NULL` (a used code still matches) | exit 1, 1 failed / 13 passed | a recovery code replaces the TOTP code once … and is audited |
| D246-M2 | `apps/worker/src/api/owner.ts` | wrong recovery codes no longer call `secondFactorWrong` (no shared lock) | exit 1, 1 failed / 13 passed | wrong recovery codes share the TOTP lock: 5 wrong (mixed) → 429 for both |
| D246-M3 | `apps/worker/src/api/owner.ts` | `rotate-confirm` no longer signs out the other owner sessions | exit 1, 1 failed / 13 passed | rotate-start leaves the active TOTP untouched; only a valid code from the new secret swaps it |
| D246-M4 | `apps/worker/src/api/owner.ts` | codes issued on every TOTP verify, not only the first confirmed enrolment | exit 1, 1 failed / 13 passed | the first TOTP confirmation issues 8 distinct XXXX-XXXX codes once |
| D246-M5 | `apps/worker/src/auth/recovery/index.ts` | `openRotation` ignores the ticket's user (foreign ticket accepted) | exit 1, 1 failed / 13 passed | rotate-start leaves the active TOTP untouched; only a valid code from the new secret swaps it |
| D246-M6 | `apps/worker/src/api/owner.ts` | another admin's TOTP reset keeps the target's recovery codes | exit 1, 1 failed / 13 passed | another admin's TOTP reset deletes the target's recovery codes |

After the run every file matched its pre-mutation content (worker suite green again, see `pnpm check`).
