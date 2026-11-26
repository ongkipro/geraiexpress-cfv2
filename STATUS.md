# Status — GeraiExpress v2 (`geraiexpress-cfv2`)

Updated: 2026-11-26
Status: Live on dedicated Cloudflare account `GeraiExpress` (`f235ecdb5517054b386c6d413569a103`), commit `e43804d` deployed 2026-11-25 (production Worker `46aeac71-33c4-4258-a4d7-2b21edea8792`, control `0000`–`0020`, all DO objects v25, staging probes 5/5 PASS, production probes 6/6 PASS, Coolify `partner-relay` `RELAY VERIFY PASS 6/6`). `TASK-706..TASK-713` + Kasir UX & `pollStatus` auto-reconcile are **DONE** on `main` (`4d0bafc`, hosted `ci.yml` run `45660870990` **green**). Follow-up **`/panduan` illustrated user guide** is synced onto `4d0bafc`, independently R4-reviewed (**APPROVE**), and verified in worktree `panduan-final` (uncommitted, awaiting owner commit/merge/push and staging → production deploy approval).
State: READY_FOR_COMMIT
Review-Risk: R4 (combined release `e43804d..HEAD`; `/panduan` delta is R2)
Independent-Review: `TASK-706` **APPROVE** (`claude`, `docs/review/task-706/`); `TASK-707` & `TASK-708..713` R1–R4 **APPROVE** (`cx/gpt-6.2-sol`, `docs/review/{unrecorded-2026-11-25,task-708-713}/`); `/panduan` user guide R1–R4 **APPROVE** (`cx/gpt-6.2-sol`, `docs/review/panduan/{R1-R4-sol.md,DISPOSITION.md}`). Prior history archived verbatim in `docs/archive/STATUS-HISTORY-2026-11-25.md`.
Primary-Worker: Antigravity session, 2026-11-26
Independent-Reviewer: `cx/gpt-6.2-sol` (`TASK-707..713`, `/panduan`), `claude` (`TASK-706`)
Independent-Review-Head: `4d0bafc` (`main`) + verified worktree `panduan-final` (R4 APPROVE)

## Now

| Task | State | Evidence |
|---|---|---|
| **`/panduan` illustrated user guide** (owner request 2026-11-25, R2) | READY TO COMMIT & MERGE — R4 **APPROVE** | Worktree `panduan-final` on `4d0bafc`: 13 guides in 4 TOC groups, 32 desktop + 31 phone WebP screenshots (`scripts/panduan/`), synced with `Pengirim Baru`/`Penerima Baru` CTAs + orange markers on `siap-1..3`, 0 px CLS on TOC jumps, balanced 6+6 footer (`/` 6,279 px ≤ 6,300 px), `check-page.mjs` **11/11 pages 0 fail 0 warn**, `dotuiux check` 0 fail, `pnpm check` 67/67 (502/502 Workers tests) + `e2e/brand.spec.ts` 390/1280 PASS, `cx/gpt-6.2-sol` R4 **APPROVE** (`docs/review/panduan/`). |
| **TASK-706..TASK-713** + Kasir UX & `pollStatus` auto-reconcile (R4, DEC-255) | **DONE 2026-11-25** (awaiting deploy) | Landed on `main` (`c1f3221..4d0bafc`), hosted `ci.yml` push run `45660870990` **green** (17m1s); independent R4 **APPROVE** archived in `docs/review/{task-706,unrecorded-2026-11-25,task-708-713}/`; contracts archived in `docs/archive/TASKS-706-713-2026-11-26.md`. |
| **TASK-601** Partner relay in production (R4) | **DONE 2026-11-23** | Coolify `partner-relay` co-hosted on `99ribu-prod` (`149.28.129.53`, DEC-235), `RELAY VERIFY PASS 6/6`, production `relay-health` probe PASS (`BUILD-LOG.md`, `docs/runbooks/production-zones.md` §6). |
| **TASK-602 / 603 / 604** Remaining M6 live owner gates | OPEN (owner-run) | Production & staging live (5/5 stg, 6/6 prod probes). Remaining: real `ALERT_WEBHOOK_URL` + alert drill (`TASK-602`), remote scratch restore drill (`TASK-603`), live courier pilot + open registration (`TASK-604`). |
| **Completed M1–M5, TASK-701/705, DEC-234..251** | DONE (archived) | Verbatim history preserved in `docs/archive/STATUS-HISTORY-2026-11-25.md` and `BUILD-LOG.md`. |

## Next

1. Owner approves committing `panduan-final`, fast-forward merging into `main`, pushing to `origin/main`, and confirming hosted `ci.yml` green on the new `main` SHA.
2. Owner approves pruning obsolete worktrees (`panduan`, `task-706`, `dec-246`, `dec-251`, `dev`, `ops-cf-deploy`, `staging-dispatch`, and `panduan-final` after merge).
3. Flip `RELEASE.md` to `Status: READY`, run `delivery-ledger snapshot-release --release-id REL-2026-11-26-hygiene-and-panduan`, then deploy staging → smoke → production (`REL-2026-11-26-hygiene-and-panduan`, code-only release, no D1/DO migration) upon explicit owner approval.

## Blockers

- Counsel review (Permenkomdigi 8/2025 Art. 77 vs masked labels; UU PDP retention; cashback vs e-money) — before masking is advertised (DEC-231) and before post-launch cashback ledger accrual (DEC-255).
- Live Mengantar sandbox checks (weight echo, `POST /time` timezone, `/invoices` ordering, `pay-unpaid` idempotency) — owner-run before open registration (`TASK-604`).

## Standing rules

- `STATUS.md` is the only workflow-state authority; `TASKS.md` is the only execution queue.
- Docs English, product UI Indonesian (DEC-217). Desk-scale size contract (`design/admin-contract.json`, DEC-239) for every admin screen.
- No deploy, DNS, VPS or Mengantar production action without explicit owner approval at the time.

<!-- Keep Now/Next/Blockers within the first 80 lines and this file under 12 KB; history goes to docs/archive/ and BUILD-LOG.md. -->
