# Release Manifest — GeraiExpress v2 (`geraiexpress-cfv2`)

Release-ID: REL-2026-11-28-super-admin-discount-ux
Base: b447d1b
Head: cc4f56c
Environment: production
Declared-Risk: R2
Staging-Worker: 55ddbb4e-3f75-4211-996a-7eae3d077007
Production-Worker: 4cf6a4f6-8306-4eb9-ae45-84cd048f1e7c
Rollback-Ref: 780b5172-4772-4076-afe5-18c4c882b355
Rollback-Command: pnpm exec wrangler rollback 780b5172-4772-4076-afe5-18c4c882b355 --env production
Backup-Proof: NOT_REQUIRED
Status: DEPLOYED (2026-11-28)

## Contract

This file defines the current release boundary and MUST describe only the latest release.
Staging and production have been live since 2026-11-18; the current live production Worker is version
`4cf6a4f6-8306-4eb9-ae45-84cd048f1e7c` (deployed 2026-11-28 from `cc4f56c`, hosted `ci.yml` `46059991861` PASS, control
`0000`–`0022` incl. expand-only `0022_partner_discount_schedule.sql`, tenant DO v26 4/4 `ok`, 6/6 production probes PASS;
staging `55ddbb4e-3f75-4211-996a-7eae3d077007` control `0000`–`0022`, DO v26 2/2 `ok`, 5/5 probes PASS; logged in
`BUILD-LOG.md`).
Prior live rollback target: `780b5172-4772-4076-afe5-18c4c882b355` (`b447d1b`, same DO v26 schema; expand-only D1 table
`partner_discount_schedule` is ignored by older Worker code).

- `Base` is the last deployed/accepted commit (`b447d1b`) and must be an ancestor of `HEAD`.
- `Declared-Risk` is `R2` (`DEC-256` Super Admin partner discount matrix & margin split: expand-only D1 migration
  `0022_partner_discount_schedule.sql`, Super Admin `Tarif & Kurir` master/margin/preset routes with `owner_recent` TOTP
  + audit logging, and full Super Admin UI/UX parity across `Ringkasan`, `Gerai`, `Tarif & Kurir`, `Pengawasan`, and
  `Sistem & Audit`).
- **Rollback rule (DEC-254, DEC-255, ADR-0006 §4, `docs/WORKFLOW.md` §8):**
  - **Expand-only D1 control release (no `TENANT_SCHEMA_VERSION` bump — stays v26):** `Rollback-Command` to `780b5172`
    is safe with owner approval; releases that bump `TENANT_SCHEMA_VERSION` remain roll-forward only.
- `Backup-Proof` is `NOT_REQUIRED` for this expand-only release (additive reference table only, no destructive D1 or
  tenant DO schema change; live DO objects remain on v26).
- Set `Status: READY` only after the release commits are finalized on `main`, `pnpm check` and hosted `ci.yml` pass,
  and owner approval gates every deploy.
