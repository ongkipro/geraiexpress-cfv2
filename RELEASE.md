# Release Manifest — GeraiExpress v2 (`geraiexpress-cfv2`)

Release-ID: UNSET
Base: UNSET
Environment: production
Declared-Risk: R0
Rollback-Ref: UNSET
Rollback-Command: UNSET
Backup-Proof: NOT_REQUIRED
Status: NOT_RELEASED

## Contract

This file defines the current release boundary and MUST describe only the release currently being prepared.
Nothing has been deployed: M0 (documentation and a throwaway prototype) is locked; application code starts at M1.

- `Base` is the last deployed/accepted commit and must be an ancestor of `HEAD`.
- `Declared-Risk` is `R0`–`R4` as defined in `docs/WORKFLOW.md` §2.
- `Rollback-Ref` is the Worker version to restore (`wrangler deployments list`); normally the previous production
  version. `Rollback-Command` will be `pnpm exec wrangler rollback <version-id> --env production` (owner approval
  per action). Tenant Durable Object migrations are expand-only within a release, so a code rollback needs no schema
  rollback (`docs/WORKFLOW.md` §8).
- `Backup-Proof` becomes required from the first release that migrates tenant objects or D1: a D1 Time Travel
  bookmark plus the per-object R2 export reference (ADR-0006 §7).
- Set `Status: READY` only after the release scope is frozen, `pnpm check` and the integrated run passed, and
  `delivery-ledger snapshot-release` recorded it; `production-gate` then decides.

## First release candidates (planned, not prepared)

| Milestone | Environment | Expected risk | Gate |
|---|---|---|---|
| M1 | staging only | R3 (auth, tenant isolation) | TASK-108 CI, TASK-109 isolation, TASK-110 email gate |
| M6 | production pilot | R4 (relay, custom hostnames, live Mengantar) | spec 10 §6, spec 11 §2, backup + restore drill |
