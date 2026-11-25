# TASK-708..713 + Kasir UX / Auto-Reconcile Review Disposition

- **Round 1 Review:** `docs/review/task-708-713/R1-sol.md` (`REQUEST_CHANGES` — 1 P1, 5 P2)
- **Date:** 2026-11-25

| ID | Severity | File | Disposition | Fix |
|---|---|---|---|---|
| F1 | P1 | `scripts/deploy/deploy.mjs` | **Fixed** | Fail closed unless `gh run list --workflow ci.yml --commit <sha>` returns a run with `status === "completed" && conclusion === "success"`; missing, queued/running, failed, or unreachable `gh` queries now abort deploy with exit 2. |
| F2 | P2 | `apps/worker/src/pricing/quote/engine.ts` | **Fixed** | Added `if (!Number.isSafeInteger(totalDiscount) || totalDiscount < 0 || totalDiscount > price) return null` before applying the ±1 Rp snap; added negative and >100% regression cases in `apps/worker/test/pricing/rules.test.ts`. |
| F3 | P2 | `apps/worker/src/demo/constants.ts`, `apps/worker/src/api/app.ts`, `apps/worker/src/api-v1/keys.ts` | **Fixed** | Exported canonical `DEMO_TENANT_ID = "demo-tenant-001"` + `isDemoTenantId`; switched `POST /api-keys` and `api-v1/keys.ts` `authenticate()` to check `isDemoTenantId(tenantId)` so any hypothetical legacy non-demo tenant named `demo` is unaffected. |
| F4 | P2 | `apps/worker/src/do/gerai-vault/index.ts` | **Fixed** | In `pollStatus`, rows that remain `reconciliation_needed` (or fail reconcile) advance `updated_at = now` so they rotate to the back of `ORDER BY updated_at ASC LIMIT 5` and never starve later shipments. |
| F5 | P2 | `apps/web-app/src/routes/kasir/multi/page.tsx` | **Fixed** | Added `senderModalGenRef` + `savedSenderIf(senderSheetKey, item)` matching single Kasir's generation guard so stale save callbacks cannot close a reopened dialog or overwrite the current sender. |
| F6 | P2 | `scripts/do-migrate/do-migrate.mjs`, `scripts/deploy/deploy.mjs` | **Fixed** | Added `--json` output (`{ pending, migrated, alreadyCurrent, report }`) to `do-migrate.mjs` (replacing the broken ASCII `->` check against Unicode `→`); `deploy.mjs` parses `pending > 0` and prints an explicit `UNKNOWN ROLLBACK SAFETY` warning if the probe fails. |
