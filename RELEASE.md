# Release Manifest — GeraiExpress v2 (`geraiexpress-cfv2`)

Release-ID: REL-2026-11-27-centered-app-shell
Base: a1f0647
Head: b447d1b
Environment: production
Declared-Risk: R2
Staging-Worker: a3498b90-0481-4861-80a7-1c8366893abf
Production-Worker: 780b5172-4772-4076-afe5-18c4c882b355
Rollback-Ref: c442e04f-c95f-41b8-9cd6-e522b75ff002
Rollback-Command: pnpm exec wrangler rollback c442e04f-c95f-41b8-9cd6-e522b75ff002 --env production
Backup-Proof: NOT_REQUIRED
Status: DEPLOYED (2026-11-27)

## Contract

This file defines the current release boundary and MUST describe only the latest release.
Staging and production have been live since 2026-11-18; the current live production Worker is version
`780b5172-4772-4076-afe5-18c4c882b355` (deployed 2026-11-27 from `b447d1b`, hosted `ci.yml` `45893235194` PASS, control
`0000`–`0021`, tenant DO v26 4/4 `ok`, 6/6 production probes PASS, live SSR `gx_wide=1` GET+HEAD verified on `app.` and
`owner.`; staging `a3498b90-0481-4861-80a7-1c8366893abf` DO v26 2/2 `ok`, 5/5 probes PASS, live SSR `gx_wide=1`
verified on `app-staging.` and `owner-staging.`; logged in `BUILD-LOG.md`).
Prior live rollback target: `c442e04f-c95f-41b8-9cd6-e522b75ff002` (`a1f0647`, same DO v26 schema).

- `Base` is the last deployed/accepted commit (`a1f0647`) and must be an ancestor of `HEAD`.
- `Declared-Risk` is `R2` (`DEC-257` dashboard/console UI shell refactor: full-bleed 64 px topbar + centered
  `max-w-[1440px]` app shell, in-flow sticky desktop sidebar, uniform `#F6F7F9` inner canvas, and host-only `gx_wide=1`
  SSR wide-mode toggle in `apps/worker/src/assets/spa.ts`, plus `DEC-256` Mengantar partner discount schedule docs).
- **Rollback rule (DEC-254, DEC-255, ADR-0006 §4, `docs/WORKFLOW.md` §8):**
  - **Code-only release (no `TENANT_SCHEMA_VERSION` bump — stays v26):** `Rollback-Command` to `c442e04f` is safe with
    owner approval; releases that bump `TENANT_SCHEMA_VERSION` remain roll-forward only.
- `Backup-Proof` is `NOT_REQUIRED` for this code-only release (no new D1 or tenant DO migration; live DO objects are
  already on v26).
- Set `Status: READY` only after the release commits are finalized on `main`, `pnpm check` and hosted `ci.yml` pass,
  and owner approval gates every deploy.
