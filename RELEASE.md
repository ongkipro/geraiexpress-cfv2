# Release Manifest — GeraiExpress v2 (`geraiexpress-cfv2`)

Release-ID: REL-2026-11-26-hygiene-and-panduan
Base: e43804d
Head: b923860
Environment: production
Declared-Risk: R4
Staging-Worker: ccbb248e-1f11-4821-8ba0-68fb01db30a2
Production-Worker: c603faca-59c7-4c56-b417-63832e5e998e
Rollback-Ref: 46aeac71-33c4-4258-a4d7-2b21edea8792
Rollback-Command: pnpm exec wrangler rollback 46aeac71-33c4-4258-a4d7-2b21edea8792 --env production
Backup-Proof: NOT_REQUIRED
Status: DEPLOYED (2026-11-26)

## Contract

This file defines the current release boundary and MUST describe only the latest release.
Staging and production have been live since 2026-11-18; the current live production Worker is version
`c603faca-59c7-4c56-b417-63832e5e998e` (deployed 2026-11-26 from `b923860`, hosted `ci.yml` `45802206472` PASS, control
`0000`–`0020`, tenant DO v25, 6/6 production probes PASS, staging `ccbb248e-1f11-4821-8ba0-68fb01db30a2` 5/5 probes PASS;
logged in `docs/runbooks/production-zones.md` §5.1 and `BUILD-LOG.md`). Prior live rollback target:
`46aeac71-33c4-4258-a4d7-2b21edea8792` (`e43804d`).

- `Base` is the last deployed/accepted commit (`e43804d`) and must be an ancestor of `HEAD`.
- `Declared-Risk` is `R0`–`R4` as defined in `docs/WORKFLOW.md` §2. This release is `R4` (combines `TASK-706..713` on
  `4d0bafc` — CI non-impersonation allowlist, staging Cloudflare for SaaS refusal, demo isolation, `GeraiVaultDO`
  dispatch/reconcile, Kasir UX — plus the R2 `/panduan` illustrated user guide).
- **Rollback rule (DEC-254, DEC-255, ADR-0006 §4, `docs/WORKFLOW.md` §8):**
  - **Code-only releases (no `TENANT_SCHEMA_VERSION` bump — including this release):** `Rollback-Command`
    (`pnpm exec wrangler rollback <previous-version-id> --env production`, with owner approval per action) is safe; D1
    control migrations remain expand-only.
  - **Releases that bump `TENANT_SCHEMA_VERSION`:** **roll-forward only.** Under DEC-254, healthy tenant objects
    lazy-upgrade on their first request after deploy and refuse older code with `TENANT_NOT_READY`; rolling the Worker
    back across a tenant migration takes already-upgraded gerai offline until newer code is redeployed. Fix forward and
    redeploy instead (`scripts/deploy/deploy.mjs` warns automatically before deploy when a tenant migration is pending).
- `Backup-Proof` is `NOT_REQUIRED` for this code-only release (no new D1 or tenant DO migration; live DO objects are
  already on v25). It becomes required again on any future release that adds a D1 or tenant migration: a D1 Time Travel
  bookmark plus the per-object R2 export reference (ADR-0006 §7).
- Set `Status: READY` only after the release commits are finalized on `main`, `pnpm check` and hosted `ci.yml` pass,
  and `delivery-ledger snapshot-release --release-id REL-2026-11-26-hygiene-and-panduan` records it; owner approval gates
  every deploy.
