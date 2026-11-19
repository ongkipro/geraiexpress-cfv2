# DEC-253 review disposition

## GPT-6.2 Sol R1 (`R1-sol.md`): REQUEST_CHANGES (1 P0 + 2 P2)

| Finding | Disposition | Where | Proof |
|---|---|---|---|
| P0 legacy pre-DEC-253 runs can obtain `staging` credentials on re-run | **Fixed locally + owner cutover prerequisite.** `deploy` targets a new GitHub environment `staging-deploy` that only the gated workflow references; Wrangler stays `--env staging`. Before publishing, the owner must make `staging-deploy` `main`-only with the deploy secrets, leave the legacy `staging` environment without deploy credentials, and keep no repository- or organization-level secret of those names. No GitHub setting or secret was changed and no old run was re-run. | `.github/workflows/deploy-staging.yml`, DEC-253, `docs/WORKFLOW.md` §8, spec 07 §6, `STATUS.md` | Test "is only a dispatch trigger…": the single `environment:` is `staging-deploy` and the four `run:` lines keep `--env staging`. Mutations S1 (legacy `staging`), S5 (Wrangler target renamed) and S6 (environment on `verify`) are killed. Credential isolation itself needs settings evidence (names only) at cutover. |
| P2 retry semantics described by the rerun control instead of by which jobs re-run | **Fixed.** The docs describe the current-attempt rule. "Re-run failed jobs" after a deploy-only failure is skipped; re-running `verify` (with its dependent `deploy`) or "Re-run all jobs" deploys. | workflow comment, DEC-253, `docs/WORKFLOW.md` §8 | Seven `retry:` cases against the workflow's real `deploy` `if:`. Mutations S7 and S8 (attempt binding dropped or weakened) are killed. The evaluator does not prove GitHub scheduling; hosted evidence comes with the first authorized dispatch. |
| P2 workflow-level concurrency reached before authorization | **Fixed.** `concurrency: deploy-staging` (`cancel-in-progress: false`) now sits on the gated `deploy` job, and the workflow level has none. | `.github/workflows/deploy-staging.yml` | Test "holds the deployment concurrency slot only in the authorized deploy job". Mutations S2, S3 and S4 are killed. |

Residual (Sol R1, unchanged, owner/release evidence):

- record credential-isolation evidence at cutover, using setting and secret names only;
- confirm that changes to `main` and its workflows are restricted to trusted writers;
- capture hosted evidence for the first authorized dispatch;
- the synthetic owner-alert delivery of TASK-109 remains unproven, because `ALERT_WEBHOOK_URL` is not configured.

## GPT-6.2 Sol R2 (`R2-sol.md`): local patch APPROVE, OK with notes (1 P1 documentation correction)

| Finding | Disposition | Where |
|---|---|---|
| P1 cutover instructions still point operators at the legacy GitHub `staging` environment | **Fixed.** The STATUS TASK-109 row and owner list now carry the DEC-253 cutover: `staging-deploy` `main`-only with the deploy secrets, deploy credentials removed from legacy `staging`, no repository/organization fallback, settings and names recorded only. The DEC-253 gate summary names `staging-deploy` and separates GitHub environments from Wrangler `--env staging`. The earlier BUILD-LOG prerequisite to protect `staging` is marked superseded. | `STATUS.md` (TASK-109 row, owner list), `DECISIONS.md` DEC-253, `BUILD-LOG.md` |
| Environment separation, concurrency placement, current-attempt authorization | Confirmed correct; no change. | — |

Release stays blocked on owner steps, none performed here:

1. **Cutover.** Create `staging-deploy` (`main` only) with the scoped deploy secrets, remove the deploy credentials
   from legacy `staging` (still listing three), confirm no fallback secrets, and confirm trusted writers on `main`.
2. **First authorized dispatch.** After a green hosted CI, the owner dispatches the full SHA from `main`; record the
   hosted gate attempt, deployed SHA and green staging probes.
3. **Alert proof.** Set `ALERT_WEBHOOK_URL` in `staging-deploy` and record receipt of a synthetic failing-probe
   alert before TASK-109 closes.

## Cutover evidence (owner step 1, 2026-11-19)

Verified by the Supervisor; setting and secret names only.

- **`staging-deploy`:** deployment branches exactly `main`; secrets `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`,
  `GX_OPS_TOKEN`.
- **Legacy `staging`:** no secrets.
- **Repository Actions secrets:** none.
- **Collaborators:** `ongkipro` (admin) only.

This closes the Sol R1 P0 and Sol R2 cutover prerequisites. Steps 2 (first owner dispatch) and 3 (alert proof) remain
open.

