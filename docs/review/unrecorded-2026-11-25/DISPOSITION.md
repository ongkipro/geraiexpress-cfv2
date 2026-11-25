# TASK-707 Review Disposition

- **Round 1 Review:** `docs/review/unrecorded-2026-11-25/R1-sol.md` (`REQUEST_CHANGES` — 2 P1, 3 P2)
- **Date:** 2026-11-25

| ID | Severity | File | Disposition | Fix |
|---|---|---|---|---|
| F1 | P1 | `apps/worker/src/ops/seed-demo.ts` | **Fixed** | Replaced global `WHERE key LIKE 'login-%'` delete with scoped `WHERE key IN ('login-fail:<eh>', 'login-lock:<eh>')` for `DEMO_EMAIL` only; added regression assertion in `apps/worker/test/demo/demo.test.ts` verifying unrelated users' login throttles survive seeding. |
| F2 | P1 | `apps/worker/src/do/gerai-vault/contacts/index.ts` | **Fixed** | Applied the exact `mask_preset != 'standar_gerai'` CASE projection to `counterparty_area`, returning `NULL` when the sender is masked. |
| F3 | P2 | `apps/worker/src/lib/geocode.ts` | **Fixed** | Added `minimizeGeocodeQuery` (strips phone numbers, RT/RW, house/block/floor/unit tokens before upstream Nominatim query), hashed KV cache keys (`geocode:v3:<sha256>`), and dropped raw query fallback in cached `label`; updated `apps/worker/test/lib/geocode.test.ts`. |
| F4 | P2 | `apps/worker/src/pricing/rules/index.ts` | **Fixed** | Moved default `tenant_discount_rules` seed `INSERT ... ON CONFLICT DO NOTHING` out of the pre-check phase into the final atomic `env.DB.batch([...])` after area validation and `vault.observeRates()` succeed, alongside the updates and audit row. |
| F5 | P2 | `apps/worker/src/do/gerai-vault/credentials/rotation.ts` | **Fixed** | `markRestricted` now checks `vault.recordOnboarding` result and fails with `503 TENANT_NOT_READY` if the authoritative DO write fails, and no longer suppresses D1 `tenant_onboarding` write errors before returning `restricted`. |
