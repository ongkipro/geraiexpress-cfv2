# TASK-708..713 + Kasir UX / Auto-Reconcile Independent R4 Review — Round 1 (`cx/gpt-6.2-sol`)

- **Scope:** Working-tree diff for `TASK-708`, `TASK-709`, `TASK-710`, `TASK-711`, `TASK-712`, `TASK-713`, plus Kasir UX & `pollStatus` auto-reconcile
- **Risk Level:** R4
- **Reviewer:** `cx/gpt-6.2-sol` (`ai-ask codex`, independent read-only single-pass review)
- **Date:** 2026-11-25

## Verdict: REQUEST_CHANGES

| Scope | Verification |
|---|---|
| TASK-708 | Reguler and Cargo share the same ±Rp1 snap and check that the returned declared rate is an integer from 0 to 10,000 bps. Invalid amounts can still enter the snap. |
| TASK-709 | Staging drops the required SaaS token, disables the zone, refuses domain requests, skips Cloudflare creation, and gets the unconfigured SaaS client even if credentials are present. Production retains the zone and required token. |
| TASK-710 / TASK-712 | The live path checks for local `main` and a clean tree before building or deploying. It queries hosted `ci.yml` for the exact SHA and rejects a reported non-success conclusion, but proceeds without a confirmed success. The migration probe warning depends on matching `->` in stdout. |
| TASK-711 | `demo` is reserved, the seeder returns 409 on a tenant ID collision, and successful seeding deletes keys for the canonical demo tenant. Key issuance and shared authentication reject the demo slug, including for existing keys. |
| TASK-713 | `ensureDraft` sets `api_mcp` for `inv_slugs.purpose = 'api'` while preserving `minisite_qr`. Staging and production require the public read key; the registered check flags missing or placeholder keys when a real origin is configured. The test route reserves quota before the Partner API list call. |
| Polling / Kasir | Polling selects at most five unresolved shipments per invocation and keeps the timer armed while unresolved work exists. Kasir adds contact creation from empty search results, name/phone prefill, and scrollable dialogs. Single Kasir guards against stale save callbacks; Bulk Kasir does not. |

## Findings

1. **P1 — `scripts/deploy/deploy.mjs:78`: Deployment can proceed without a green hosted CI run.** Require `status === "completed"` and `conclusion === "success"` for the exact SHA before applying remote migrations.
2. **P2 — `apps/worker/src/pricing/quote/engine.ts:87`: The snap can turn an invalid amount into a valid rate.** Validate that the amount is an integer between zero and the published price before applying the tolerance.
3. **P2 — `apps/worker/src/api-v1/keys.ts:44`: Slug-based denial also blocks a legacy non-demo tenant named `demo`.** Use the canonical demo tenant identity consistently for the demo-only key restrictions.
4. **P2 — `apps/worker/src/do/gerai-vault/index.ts:3543`: The five-row limit provides no fairness on its own.** If an attempt leaves a shipment unresolved without advancing `updated_at`, the same five oldest rows can consume every tick and starve later shipments.
5. **P2 — `apps/web-app/src/routes/kasir/multi/page.tsx:223`: A stale sender save can overwrite the current selection.** Apply the same generation guard used by single Kasir.
6. **P2 — `scripts/deploy/deploy.mjs:100`: The migration probe cannot reliably distinguish "no migration" from "unknown."** Use an explicit machine-readable pending result and report a failed probe as unknown rollback safety before proceeding.
