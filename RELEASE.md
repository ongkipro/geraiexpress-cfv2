# Release Manifest — GeraiExpress v2 (`geraiexpress-cfv2`)

Release-ID: REL-2026-11-28-cashback-lock-autosync
Base: d28956c
Head: 9cbbcbc
Environment: production
Declared-Risk: R3
Staging-Worker: 2a6b1c9b-96ce-46d8-84be-008e5a108abf
Production-Worker: db539bd1-442c-41f1-8881-b4e63a310ad8
Rollback-Ref: 0e59c7d3-d6b6-4c8e-8f8c-8de1caaca1ab
Rollback-Command: pnpm exec wrangler rollback 0e59c7d3-d6b6-4c8e-8f8c-8de1caaca1ab --env production
Backup-Proof: NOT_REQUIRED
Status: DEPLOYED (2026-11-28)

## Contract

This file defines the current release boundary and MUST describe only the latest release.
Staging and production have been live since 2026-11-18; the current live production Worker is version
`db539bd1-442c-41f1-8881-b4e63a310ad8` (deployed 2026-11-28 from `9cbbcbc`, hosted `ci.yml` `46132140231` PASS, control
`0000`–`0023` applied ✅, tenant DO v26 5/5 `ok`, 6/6 production probes PASS, live D1 locked bands verified `2000/2500/2500`
regulars & `1000/1000/1000` Pos with existing tenant rules preserved; staging `2a6b1c9b-96ce-46d8-84be-008e5a108abf`
control `0000`–`0023` applied ✅, DO v26 2/2 `ok`, 5/5 probes PASS; logged in `BUILD-LOG.md`).
Prior live rollback target: `0e59c7d3-d6b6-4c8e-8f8c-8de1caaca1ab` (`d28956c`, same DO v26 schema; control `0023` is
expand/config-only and compatible with prior Worker code).

- `Base` is the last deployed/accepted commit (`d28956c`) and must be an ancestor of `HEAD`.
- `Declared-Risk` is `R3` (`DEC-258`: D1 control migration `0023_lock_partner_target_bands.sql` locking default & ceiling
  discount bands to Partner Target Gerai `Master − 5%`, immediate best-effort Mengantar discount sync on Partner
  `connected` and rate-limited BYOK `byok_connected`, guarded first-observation Cargo rate adoption with strict
  optimistic-lock `updated_at` advancement, and removal of dormant `0%` cashback column/input from Super Admin UI).
  Independently reviewed in 2 rounds (`9c44d1a9`, R2 **APPROVE**: 0 P0 / 0 P1 / 0 P2).
- **Rollback rule (DEC-254, DEC-255, ADR-0006 §4, `docs/WORKFLOW.md` §8):**
  - **No `TENANT_SCHEMA_VERSION` bump (stays v26) and config-only D1 migration `0023`:** `Rollback-Command` to
    `0e59c7d3` is safe with owner approval; releases that bump `TENANT_SCHEMA_VERSION` remain roll-forward only.
- `Backup-Proof` is `NOT_REQUIRED` (no destructive schema change and no `tenant_discount_rules` writes; live DO objects
  remain on v26).
- Set `Status: READY` only after the release commits are finalized on `main`, `pnpm check` and hosted `ci.yml` pass,
  and owner approval gates every deploy.
