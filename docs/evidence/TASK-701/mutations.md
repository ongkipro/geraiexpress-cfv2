# TASK-701 mutation proofs (2026-11-18)

Each mutation applied to the working tree, `pnpm --filter @gx/worker exec vitest run test/customer-display` run, file
restored from a byte copy (a clean re-run follows in `pnpm check`). Every mutation turned exactly one test red
(1 failed | 7 passed).

| # | Mutation | Red test |
| --- | --- | --- |
| M49 | `shift/close` no longer calls `revokeForShift` (`do/gerai-vault/index.ts`) | "closing the bound shift unpairs the display at once (PR-22)" |
| M50 | `readDisplay` ignores `expires_at` (`customer-display/index.ts`) | "re-pair revokes the earlier pairing; unpair ends it; expiry ends it" |
| M51 | `parseCheckout` spreads the request into the stored state (cost/phone keys leak) | "pair → cookie-less view … zero leak" (`toEqual` on the built state + `777123`/`0857` absent) |
| M52 | `view` resolves the slug without `status = 'active'` (`api/app.ts`) | "a token works only with its own gerai; a suspended gerai's display stops" |
| M53 | media upload owner check back to `purpose === "logo"` only (Kasir may upload a QRIS) | "owner uploads and sets the QRIS; … Kasir cannot change it" |
| M54 | failed-lookup throttle effectively off (`count >= 3000`, no window) | "failed lookups are throttled per client IP" |

## Sol R1 fixes (2026-11-18, after the rebase onto `d7ebf4e`)

Script-driven: each mutation applied, the named suite run, the file restored from memory. Worker =
`test/customer-display`; unit = `apps/web-app/src/routes/kasir/display-sync.test.ts`; e2e =
`e2e/customer-display.spec.ts --project=desktop-1280`. Every row exited 1.

| Id | Finding | Mutation | Suite | Red |
|---|---|---|---|---|
| T701-R1-M1 | F1 | destination from the request text before the resolved area | worker | F1 PII test |
| T701-R1-M2 | F1 | ETA copied as free text | worker | F1 PII test; main pair → paid test |
| T701-R1-M3 | F1 | packing name from the request | worker | F1 PII test |
| T701-R1-M4 | F1 | unknown `serviceCode` falls back to the request courier | worker | F1 PII test |
| T701-R1-M5 | F4 | `in` instead of the own-key check | worker | F4 test |
| T701-R1-M6 | F2 | `view` without `pairId` | worker | F2 test; main test |
| T701-R1-M7 | F2 | hint ignores the pairing | unit | `isHintFor` |
| T701-R1-M8 | F5 | older response accepted | unit | `isNewer`; serialised sync |
| T701-R1-M9 | F5 | overlapping fetches allowed | unit | serialised sync |
| T701-R1-M10 | F6 | no retry after a failure | unit | both `runWithRetry` tests |
| T701-R1-M11 | F3 | publication keyed by input only | e2e | new device stays idle after `Buat Kode Baru` |
| T701-R1-M12 | F7 | browser `err.message` shown | e2e | Indonesian upload message not visible |

## Sol R2-F1 (2026-11-18)

| Id | Mutation | Suite | Result |
|---|---|---|---|
| T701-R2-M1 | `setDisplayState` condition `state_seq < ? + 1000000` (order effectively ignored) | worker `test/customer-display` | exit 1: "an older publication held in its area lookup cannot overwrite a newer one…" |
| T701-R2-M2 | publisher without the in-flight guard (publications overlap) | unit `display-sync.test.ts` | exit 1: "never has two publications in flight…"; "an older failed publication is not retried…" |
| T701-R2-M3 | a failed input is retried even when a newer one exists | unit `display-sync.test.ts` | exit 1: "an older failed publication is not retried once a newer input exists" |

