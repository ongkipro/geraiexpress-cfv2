# Status — GeraiExpress v2 (`geraiexpress-cfv2`)

Updated: 2026-11-16
Status: M1 in progress — TASK-101, 103, 102, 107, 108 done (Carbon APPROVE); next TASK-110 → TASK-104..106 → TASK-111/109/112 → TASK-199
State: IN_PROGRESS
Review-Risk: R4
Independent-Review: TASK-107/108 PASS — reviewer-carbon round 1 REQUEST_CHANGES (1 P1, 5 P2, 1 P3, fixed), round 2 APPROVE (`docs/review/TASK-107-108/`); TASK-102/103 PASS — reviewer-carbon round 1 REQUEST_CHANGES (2 P1, 4 P2, 1 P3, all fixed), round 2 APPROVE (`docs/review/TASK-102-103/`); TASK-101 PASS (round 2 APPROVE, `docs/review/TASK-101/`)
Primary-Worker: pi session (Claude Opus 5.5 via 9router-fantastico), 2026-11-16
Independent-Reviewer: reviewer-carbon (9router-fantastico/ag/gemini-4-carbon-high)
Independent-Review-Head: TASK-107/108 working tree (diff `docs/review/TASK-107-108/TASK-107-108.diff.gz`)

## Now

M1 build on branch `dev` (worktree `~/Projects/.worktrees/geraiexpress-cfv2/dev`), merged fast-forward to `main` per task.

| Task | State | Evidence |
|---|---|---|
| TASK-107 Money/weight math | DONE 2026-11-16 | `packages/domain` money + weight: every spec 02 §3.4 row, 9599, not-yet-applied fixture, insured Laba Kas, COD fee fixed point, guards, 2,000-case property test (S, V sampled); mutation (9599) red |
| TASK-108 INV slug | DONE 2026-11-16 | rejection-sampled CSPRNG slug; tenant migration `0002_inv_slugs`; 10,000 slugs → 0 duplicates; same slug in two tenants; case-insensitive `INV: …`; mutations (upsert, biased bytes) red |
| TASK-103 Storage foundation | DONE 2026-11-16 | two migration tracks; `migrate(version)` RPC with per-step rollback and `recovery`; versioned absolute-upsert outbox with safety alarm; `pnpm do:migrate --env local` dry run + run + re-run; bidirectional Drizzle↔SQL drift test (D1 + object); Workers tests incl. failure-path (tenant in recovery → 503, others 200) |
| TASK-102 Host classifier | DONE 2026-11-16 | five contexts; D1 `tenant_hostnames` (≤ 30 s cache); 404/403/503; DCV/probe rules; cross-context 404 matrix; four mutations each turned a test red |
| TASK-101 Scaffold | DONE 2026-11-16 | `pnpm check` exit 0 incl. clean-clone copy (`pnpm install --frozen-lockfile`); `wrangler dev` `/healthz` 200 on 5 hosts; both shells served host-isolated (Workers tests `spa.test.ts`); dotuiux 0 fail + admin-geometry exit 0 at 390/1366/1536 on both shells; bundle audit mutation-proved (`.map`, client secret name) |

Live owner actions so far: none required by TASK-101.

## Next

1. TASK-110 (observability base), then TASK-104..106, TASK-111, TASK-109, TASK-112, TASK-199.
2. Every R3/R4 task: reviewer-carbon until APPROVE, archive under `docs/review/TASK-<id>/`.

## Blockers

- Mengantar discount channel answered (owner, 2026-11-15): applied from Mengantar's system to the seller account, ~1 hour
  (`apply_sla_minutes = 60`). Discounts differ per courier: default 20 % each, changed later per courier
  (`courier_discount_policy`).

None for M1. Open items, each owned by the milestone row in `TASKS.md` (coverage map), that must close before the stated milestone:
- Vultr Reserved IPv4 (new small instance or existing server, DEC-232) — buy/attach at M6 with owner approval.
- Counsel: Permenkomdigi 8/2025 Art. 77 vs masked labels; UU PDP retention; cashback vs e-money — before masking is
  advertised (it is built and switchable per gerai, DEC-231) and before any cash-out feature.
- Mengantar sandbox checks listed in specs 02, 04, 09 (weight echo, `POST /time` timezone, `/invoices` ordering,
  `pay-unpaid` idempotency) — during M2/M4.

## Standing rules

- `STATUS.md` is the only workflow-state authority; `TASKS.md` is the only execution queue.
- No `TASK-1xx` before the owner's M0 sign-off is recorded here.
- Docs English, product UI Indonesian (DEC-217). Comfort size contract for every admin screen.
- No deploy, DNS, VPS or Mengantar production action without explicit owner approval at the time.

<!-- Keep Now/Next/Blockers within the first 80 lines and this file under 12 KB; history goes to BUILD-LOG.md. -->
