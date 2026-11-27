# Release Manifest — GeraiExpress v2 (`geraiexpress-cfv2`)

Release-ID: REL-2026-11-28-brand-promo-25
Base: cc4f56c
Head: d28956c
Environment: production
Declared-Risk: R2
Staging-Worker: 24e06174-5800-4557-8269-fe899776b6f0
Production-Worker: 0e59c7d3-d6b6-4c8e-8f8c-8de1caaca1ab
Rollback-Ref: 4cf6a4f6-8306-4eb9-ae45-84cd048f1e7c
Rollback-Command: pnpm exec wrangler rollback 4cf6a4f6-8306-4eb9-ae45-84cd048f1e7c --env production
Backup-Proof: NOT_REQUIRED
Status: DEPLOYED (2026-11-28)

## Contract

This file defines the current release boundary and MUST describe only the latest release.
Staging and production have been live since 2026-11-18; the current live production Worker is version
`0e59c7d3-d6b6-4c8e-8f8c-8de1caaca1ab` (deployed 2026-11-28 from `d28956c`, hosted `ci.yml` `46072234794` PASS, control
`0000`–`0022`, tenant DO v26 4/4 `ok`, 6/6 production probes PASS, live `https://geraiexpress.com/` & `/biaya-dan-paket`
verified; staging `24e06174-5800-4557-8269-fe899776b6f0` DO v26 2/2 `ok`, 5/5 probes PASS; logged in `BUILD-LOG.md`).
Prior live rollback target: `4cf6a4f6-8306-4eb9-ae45-84cd048f1e7c` (`cc4f56c`, same D1 `0022` and DO v26 schema).

- `Base` is the last deployed/accepted commit (`cc4f56c`) and must be an ancestor of `HEAD`.
- `Declared-Risk` is `R2` (`DEC-256` public landing-page promo on `geraiexpress.com`: up to 25% partner shipping
  discount messaging across `/`, `/biaya-dan-paket`, `/cara-kerja`, `/tanya-jawab`, and SEO metadata + interactive
  profit estimator on `/biaya-dan-paket`, strictly courier-agnostic on all discount claims).
- **Rollback rule (DEC-254, DEC-255, ADR-0006 §4, `docs/WORKFLOW.md` §8):**
  - **Code-only release (no D1 or `TENANT_SCHEMA_VERSION` bump — stays v26):** `Rollback-Command` to `4cf6a4f6` is safe
    with owner approval; releases that bump `TENANT_SCHEMA_VERSION` remain roll-forward only.
- `Backup-Proof` is `NOT_REQUIRED` for this code-only release (no D1 or tenant DO schema change; live DO objects remain
  on v26).
- Set `Status: READY` only after the release commits are finalized on `main`, `pnpm check` and hosted `ci.yml` pass,
  and owner approval gates every deploy.
