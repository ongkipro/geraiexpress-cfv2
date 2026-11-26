# Release Manifest — GeraiExpress v2 (`geraiexpress-cfv2`)

Release-ID: REL-2026-11-26-mengantar-prod-parity
Base: b923860
Head: 16c2f20
Environment: production
Declared-Risk: R4
Staging-Worker: 57f770dc-511f-4eee-bf66-4d8c7c52d290
Production-Worker: 9c918bef-f47d-4935-ac40-a3036815e0bc
Rollback-Ref: ROLL_FORWARD_ONLY (prior Worker: c603faca-59c7-4c56-b417-63832e5e998e)
Rollback-Command: ROLL_FORWARD_ONLY — bumps TENANT_SCHEMA_VERSION v25 -> v26 (0026_normalize_invoice_mirror.sql) and D1 control 0021_courier_rounding_live.sql; fix forward and redeploy per ADR-0006 §4 / TASK-710.
Backup-Proof: D1 Time Travel 2026-11-26T11:09:48Z (prod 0000041a-00000008-0000512f-f1c2944f8e0283959b960f61e0292c81, stg 0000038d-00000004-0000512f-8ed2ad1f9b049856fbabe0e27a711ff6) + R2 daily tenant exports 2026-11-26 WIB verified 4/4 prod & 2/2 stg (docs/evidence/TASK-603/drill-remote-2026-11-26.md)
Status: DEPLOYED (2026-11-26)

## Contract

This file defines the current release boundary and MUST describe only the latest release.
Staging and production have been live since 2026-11-18; the current live production Worker is version
`9c918bef-f47d-4935-ac40-a3036815e0bc` (deployed 2026-11-26 from `16c2f20`, hosted `ci.yml` `45816090614` PASS, control
`0000`–`0021`, tenant DO v26 4/4 `ok`, 6/6 production probes PASS, staging `57f770dc-511f-4eee-bf66-4d8c7c52d290` DO v26
2/2 `ok` 5/5 probes PASS; logged in `BUILD-LOG.md` and `docs/evidence/TASK-604/mengantar-prod-checks-2026-11-26.md`).
Prior live Worker before v26 bump: `c603faca-59c7-4c56-b417-63832e5e998e` (`b923860`).

- `Base` is the last deployed/accepted commit (`b923860`) and must be an ancestor of `HEAD`.
- `Declared-Risk` is `R4` (remediates 6 live Mengantar production contract drifts in `GeraiVaultDO` finance sync,
  `pending_rescan`, `pay-unpaid`, `/keuangan` UI, D1 `0021_courier_rounding_live.sql`, and tenant DO migration
  `0026_normalize_invoice_mirror.sql`).
- **Rollback rule (DEC-254, DEC-255, ADR-0006 §4, `docs/WORKFLOW.md` §8):**
  - **This release bumps `TENANT_SCHEMA_VERSION` (`25 → 26`) → ROLL-FORWARD ONLY.** Healthy tenant objects upgraded to
    v26 refuse older v25 code with `503 TENANT_NOT_READY`; fix forward and redeploy instead of running `wrangler rollback`.
- `Backup-Proof` is recorded above per ADR-0006 §7 (D1 Time Travel bookmarks + 2026-11-26 R2 per-object exports verified
  by remote restore drill in `docs/evidence/TASK-603/drill-remote-2026-11-26.md`).
- Set `Status: READY` only after the release commits are finalized on `main`, `pnpm check` and hosted `ci.yml` pass,
  and `delivery-ledger snapshot-release --release-id REL-2026-11-26-hygiene-and-panduan` records it; owner approval gates
  every deploy.
