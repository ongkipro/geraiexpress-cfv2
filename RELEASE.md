# Release Manifest — GeraiExpress v2 (`geraiexpress-cfv2`)

Release-ID: REL-2026-11-26-do-migrate-hardening
Base: 16c2f20
Head: a1f0647
Environment: production
Declared-Risk: R3
Staging-Worker: fba56b52-21c5-45c1-b941-64b739cf80b9
Production-Worker: c442e04f-c95f-41b8-9cd6-e522b75ff002
Rollback-Ref: 9c918bef-f47d-4935-ac40-a3036815e0bc
Rollback-Command: pnpm exec wrangler rollback 9c918bef-f47d-4935-ac40-a3036815e0bc --env production
Backup-Proof: NOT_REQUIRED
Status: DEPLOYED (2026-11-26)

## Contract

This file defines the current release boundary and MUST describe only the latest release.
Staging and production have been live since 2026-11-18; the current live production Worker is version
`c442e04f-c95f-41b8-9cd6-e522b75ff002` (deployed 2026-11-26 from `a1f0647`, hosted `ci.yml` `45824328702` PASS, control
`0000`–`0021`, tenant DO v26 4/4 `ok`, 6/6 production probes PASS, live `--dry-run` `[live v26, local v26]` PASS;
staging `fba56b52-21c5-45c1-b941-64b739cf80b9` DO v26 2/2 `ok` 5/5 probes PASS; logged in `BUILD-LOG.md`).
Prior live rollback target: `9c918bef-f47d-4935-ac40-a3036815e0bc` (`16c2f20`, same DO v26 schema).

- `Base` is the last deployed/accepted commit (`16c2f20`) and must be an ancestor of `HEAD`.
- `Declared-Risk` is `R3` (ops deploy-pipeline hardening: `do-migrate.ts` `409 STALE_ISOLATE` + CAS `revertMigratingProgress`,
  `do-migrate.mjs` bounded stale-isolate retries + `expectVersion`, and `deploy.mjs` Guard 3 pre-deploy roll-forward /
  downgrade refusal).
- **Rollback rule (DEC-254, DEC-255, ADR-0006 §4, `docs/WORKFLOW.md` §8):**
  - **Code-only release (no `TENANT_SCHEMA_VERSION` bump — stays v26):** `Rollback-Command` to `9c918bef` is safe with
    owner approval; releases that bump `TENANT_SCHEMA_VERSION` remain roll-forward only.
- `Backup-Proof` is `NOT_REQUIRED` for this code-only release (no new D1 or tenant DO migration; live DO objects are
  already on v26).
- Set `Status: READY` only after the release commits are finalized on `main`, `pnpm check` and hosted `ci.yml` pass,
  and `delivery-ledger snapshot-release --release-id REL-2026-11-26-hygiene-and-panduan` records it; owner approval gates
  every deploy.
