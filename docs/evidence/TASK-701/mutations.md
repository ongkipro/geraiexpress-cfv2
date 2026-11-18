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
