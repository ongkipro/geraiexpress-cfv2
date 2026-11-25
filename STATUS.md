# Status — GeraiExpress v2 (`geraiexpress-cfv2`)

Updated: 2026-11-25
Status: Live on dedicated Cloudflare account `GeraiExpress` (`f235ecdb5517054b386c6d413569a103`), commit `e43804d` deployed 2026-11-25 (production Worker `46aeac71-33c4-4258-a4d7-2b21edea8792`, control `0000`–`0020`, all DO objects v25, staging probes 5/5 PASS, production probes 6/6 PASS, Coolify `partner-relay` `RELAY VERIFY PASS 6/6`). Follow-up fixes `TASK-706..TASK-713` + Kasir UX & `pollStatus` auto-reconcile are implemented, independently R4-reviewed (**APPROVE**), and verified in working tree (uncommitted, awaiting owner commit/push/deploy approval).
State: READY_FOR_COMMIT
Review-Risk: R4
Independent-Review: `TASK-706` **APPROVE** by `claude` (`docs/review/task-706/`); `TASK-707` (`53aee8f..e43804d`) and `TASK-708..713` + Kasir UX/reconcile R1–R4 **APPROVE** by `cx/gpt-6.2-sol` (`docs/review/unrecorded-2026-11-25/`, `docs/review/task-708-713/`; all 11 R1 + 2 R2 findings fixed). Prior history (M1–M6, DEC-234..251) archived verbatim in `docs/archive/STATUS-HISTORY-2026-11-25.md`.
Primary-Worker: Antigravity session, 2026-11-25
Independent-Reviewer: `claude` (`TASK-706`), `cx/gpt-6.2-sol` (`TASK-707`, `TASK-708..713`)
Independent-Review-Head: `e43804d` + verified working tree (R4 APPROVE)

## Now

| Task | State | Evidence |
|---|---|---|
| **TASK-706** Hosted CI green on `main` (R4, finding F1) | READY TO PUSH — verified locally, independent R4 APPROVE | `scripts/ci/route-scan-lib.mjs` allowlists `syncSellerKeyFromPartner` with exact write classification; `docs/review/task-706/{R1-claude.md,DISPOSITION.md}` APPROVE (nit F1 fixed); hosted `ci.yml` push run pending owner commit/push approval. |
| **TASK-707** Record & review unrecorded commits `6ed284c..e43804d` (R4, finding F2) | READY TO COMMIT — R4 **APPROVE** | Independent `cx/gpt-6.2-sol` R1 found 2 P1 + 3 P2 (global login throttle wipe in `seed-demo`, masked sender `counterparty_area` leak, raw address in Nominatim/KV key, pre-check discount rule insert, swallowed restriction errors) — all 5 fixed and verified R4 **APPROVE** (`docs/review/unrecorded-2026-11-25/`); live state recorded in `docs/runbooks/production-zones.md` §5.1. |
| **TASK-708** Dynamic per-expedition Mengantar discounts vs DEC-233 (R3, finding F4) | READY TO COMMIT — R4 **APPROVE** | `DEC-255` amends `DEC-233`; `observedRegularBps`/`observedCargoBps` ±1 Rp exact-percent snap (with integer `0..price` guard) eliminates rounding drift without masking discrepancies; `rules.test.ts` + `quote.test.ts` PASS; Super Admin hints & spec 02 §2.1 updated. |
| **TASK-709** Staging must not create custom hostnames in prod zone (R4, finding F5) | READY TO COMMIT — R4 **APPROVE** | `DEC-255`: `wrangler.jsonc` sets `env.staging.vars.CF_SAAS_ZONE_ID = "disabled"` and drops `CF_SAAS_API_TOKEN`; `hostnames/service.ts` + `hostnames/cloudflare.ts` refuse staging (`403 CUSTOM_DOMAIN_DISABLED_IN_STAGING`, zero D1 writes, zero CF API calls); `lifecycle.test.ts` PASS; spec 11 §2 updated. |
| **TASK-710** Rollback rule after DEC-254 (R4, finding F3) | READY TO COMMIT — R4 **APPROVE** | `DEC-255`: **roll-forward only** for releases bumping `TENANT_SCHEMA_VERSION`; `do-migrate.test.ts` proves object 1 version ahead refuses `TENANT_NOT_READY`; `ADR-0006 §4`, `docs/WORKFLOW.md §8`, `RELEASE.md` updated; `do-migrate.mjs --json` + `deploy.mjs` warn on pending migrations or `UNKNOWN ROLLBACK SAFETY`. |
| **TASK-711** Demo account hardening (R3, finding F6) | READY TO COMMIT — R4 **APPROVE** | `DEC-255`: public read-only demo in production intended; `"demo"` in `RESERVED_SLUGS`; `seed-demo.ts` refuses `409 DEMO_SLUG_CONFLICT` on non-demo tenant, clears demo-only throttles + demo API keys; canonical `isDemoTenantId` blocks demo on `POST /api-keys`, `/api/v1`, and `/mcp`; `demo.test.ts` PASS; specs 05 & 06 updated. |
| **TASK-712** Release record & status hygiene (R0/R1, finding F7) | READY TO COMMIT — R4 **APPROVE** | `RELEASE.md` populated (`Base: e43804d`, `Rollback-Ref: 46aeac71…`); `TASK-601` marked DONE; `STATUS.md` (< 12 KB) and `TASKS.md` (< 50 KB) trimmed with verbatim history archived in `docs/archive/{STATUS-HISTORY,TASKS-M1-M5}-2026-11-25.md`; `deploy.mjs` enforces clean tree + `main` branch + completed green hosted `ci.yml`. |
| **TASK-713** Smaller refresh gaps a–f (R2/R3, finding F8) | READY TO COMMIT — R4 **APPROVE** | (a) `ensureDraft` sets `entry_channel = 'api_mcp'` via `inv_slugs.purpose = 'api'` (`api-v1.test.ts` PASS); (b) `DEC-255` + spec 02 mark cashback config/display-only at launch; (c) `MENGANTAR_PUBLIC_READ_KEY` in staging/prod `secrets.required` + `areaSearchKeyConfigured` alert check (`alerts.test.ts` PASS); (d) `PartnerQuotaDO.reserve("call")` on `POST /sistem/mengantar/uji` (`mengantar-config.test.ts` PASS); (e–f) stale comments and doc paths fixed. |
| **Kasir UX + `pollStatus` auto-reconcile** (owner directive 2026-11-25) | READY TO COMMIT — R4 **APPROVE** | `pollStatus` auto-reconciles up to 5 `reconciliation_needed` shipments with fairness rotation (`updated_at` bump on unresolved); colored `Pengirim Baru`/`Penerima Baru` CTAs, zero-match inline registration with name/phone prefill, generation guard on both single & bulk Kasir, generous modal bottom scroll padding (`e2e/pos-guards.spec.ts` 9/9, `e2e/checkout.spec.ts` 3/3). |
| **TASK-601** Partner relay in production (R4) | **DONE 2026-11-23** | Coolify `partner-relay` co-hosted on `99ribu-prod` (`149.28.129.53`, DEC-235), `RELAY VERIFY PASS 6/6`, production `relay-health` probe PASS (`BUILD-LOG.md`, `docs/runbooks/production-zones.md` §6). |
| **TASK-602 / 603 / 604** Remaining M6 live owner gates | OPEN (owner-run) | Production & staging live (5/5 stg, 6/6 prod probes). Remaining: real `ALERT_WEBHOOK_URL` + alert drill (`TASK-602`), remote scratch restore drill (`TASK-603`), live courier pilot + open registration (`TASK-604`). |
| **Completed M1–M5, TASK-701/705, DEC-234..251** | DONE (archived) | Verbatim history preserved in `docs/archive/STATUS-HISTORY-2026-11-25.md` and `BUILD-LOG.md`. |

## Next

1. Complete independent `claude` R4 reviews for `TASK-707` and `TASK-708..713`, resolve any findings, archive reviews under `docs/review/`.
2. Run full `pnpm check` under `heavy-run --lock geraiexpress-cfv2-env` and verify `STATUS.md < 12 KB` and `TASKS.md < 50 KB`.
3. Present verified summary to Paduka Ongki and await explicit approval before `git commit`, `git push` (confirming hosted `ci.yml` green on `main`), `delivery-ledger snapshot-release`, and staging/production deploy.

## Blockers

- Counsel review (Permenkomdigi 8/2025 Art. 77 vs masked labels; UU PDP retention; cashback vs e-money) — before masking is advertised (DEC-231) and before post-launch cashback ledger accrual (DEC-255).
- Live Mengantar sandbox checks (weight echo, `POST /time` timezone, `/invoices` ordering, `pay-unpaid` idempotency) — owner-run before open registration (`TASK-604`).

## Standing rules

- `STATUS.md` is the only workflow-state authority; `TASKS.md` is the only execution queue.
- Docs English, product UI Indonesian (DEC-217). Desk-scale size contract (`design/admin-contract.json`, DEC-239) for every admin screen.
- No deploy, DNS, VPS or Mengantar production action without explicit owner approval at the time.

<!-- Keep Now/Next/Blockers within the first 80 lines and this file under 12 KB; history goes to docs/archive/ and BUILD-LOG.md. -->
