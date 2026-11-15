# GeraiExpress v2 — Working Agreement (any device, any agent)

The repository's own procedure for changing code and proving it. Device-independent: machine paths, ports, lock names
and model routing live in the device's local profile, never here. It does not replace [AGENTS.md](../AGENTS.md)
(rules), [STATUS.md](../STATUS.md) (state and evidence), [TASKS.md](../TASKS.md) (the only work queue) or
[docs/spec/07](spec/07-DEVELOPMENT-GUIDE-AND-WORKFLOW.md) (toolchain, bindings, commands, test layers).

## 1. Start a session

1. `git status`, `git log --oneline -5`; read the top of `STATUS.md` and the task in `TASKS.md`.
2. Run `ai-memory-route "<task>" --repo .` for the smallest context; open only the specs the task names.
3. Disk and executable checks beat prose. A document that disagrees with the code is fixed in the same change.
4. Never print or commit secrets. `.dev.vars` is device-local; create it from `.dev.vars.example`.

## 2. Task lifecycle (one task, one requirement)

| Step | What | Evidence |
|---|---|---|
| 1. Pick | Next unblocked task in `TASKS.md`; mark it in `STATUS.md` | task id in `STATUS.md` |
| 2. Branch | `git worktree add -b task-<id> ../.worktrees/geraiexpress-cfv2/task-<id> <sha>` from a clean head | worktree path |
| 3. Contract first | Read the task's `Requirement`, `Accepted Invariants`, `Allowed Paths`; if a contract is missing or contradicts another, stop and fix the spec (and `DECISIONS.md` if it is a decision) before code | spec diff in the same branch |
| 4. Test first for R2+ | Write the failing test that encodes `Done when` (unit → worker → e2e, lowest faithful layer) | failing run output |
| 5. Implement | Smallest change inside `Allowed Paths`; reuse before adding; no new dependency without a `native-first` check | — |
| 6. Prove | §4 ladder; for a new assertion, one cheap mutation that makes it fail, then revert | commands + exit codes |
| 7. Boundary | `delivery-ledger check-boundary` (R1–R4 change surface) | ledger record |
| 8. Review | §6 | archived review |
| 9. Record | `STATUS.md` (state), `BUILD-LOG.md` (durable notes), `TASKS.md` (`DONE <date>`) | commit |
| 10. Merge | Fast-forward to `main` only from a green head; remove the worktree | — |

Risk classes (`Risk Level` in each task): **R0** docs/design · **R1** UI-only or local tooling · **R2** new behavior
without money/auth/tenant impact · **R3** money math, auth flows inside one host, tenant data, migrations · **R4**
boundaries where a defect leaks or moves money/data across a trust line: host routing, cookies/sessions, key rotation,
webhook verification, provider dispatch and `pay-unpaid`, storage foundation. A milestone's risk is its highest task.
R3/R4 always get an independent review.

## 3. Change discipline

- **Migrations are forward-only**, two tracks: `packages/db/migrations/control/` (D1) and
  `packages/db/migrations/tenant/` (every `GeraiVaultDO`, ADR-0006). Never edit a migration that any remote database
  or deployed object has seen. A tenant migration must be idempotent per object and expand-then-contract across one
  release.
- **Money:** integer IDR/bps/gram only; `NULL` ≠ `0`; COD and insurance applied once; flows use provider net `N`
  (spec 02 §3). Every money function has a worked example in a unit test.
- **Provider calls:** write-ahead journal in the DO, then call with `AbortSignal.timeout`, then record; an unknown
  outcome is read back, never replayed (ADR-0004). No live Mengantar call without explicit sandbox keys.
- **Tenant scope:** tenant comes only from the verified host + session (spec 11 §3); every RPC to `GeraiVaultDO` is
  addressed by that tenant id, never by an id from the request body.
- **UI:** Bahasa Indonesia labels and errors; comfort size contract (`design/admin-contract.json`); every submit has a
  pending state and duplicate-click guard; money/destructive actions confirm.
- **No public source maps**; no secret literals in `dist/` (bundle audit).

## 4. Verification ladder

| When | Run |
|---|---|
| Every change | `pnpm typecheck` and the focused unit file (`pnpm vitest run <file>`) |
| Worker, DO, D1, Queue, Cron change | `pnpm test:worker <file>` (Workers Vitest integration; DO RPC + SQLite state; alarms via test helpers) |
| Tenant migration | `pnpm test:worker test/migrations/tenant.test.ts` (fresh object + upgrade from previous version) |
| Host/cookie/auth change (R4) | the isolation suite `test/isolation/**` (spec 11 §8) |
| UI change | focused Playwright spec at 390 and 1366, `dotuiux check --surface admin`, `admin-geometry.mjs` with `design/admin-contract.json`; look at the screenshot |
| Before merge | `pnpm check` (typecheck + lint + unit + worker + bundle audit) |
| Milestone boundary | ONE integrated run (§5) |

Heavy runs (worker pool, Playwright, builds) go through the device's shared-resource wrapper (`heavy-run --lock
<repo>-env -- <cmd>` on devices that have it).

## 5. Integrated run (milestone gate)

1. Clean tracked tree on the release branch; `delivery-ledger start` with the checks declared up front
   (`--require-check typecheck --require-check unit --require-check worker --require-check migrations
   --require-check isolation --require-check e2e`).
2. Gates run **sequentially, fail-fast**; after a failure later gates are reported NOT RUN, never PASS.
3. A gate passes only when the ledger prints `RECORDED <gate>=PASS`, not when the recording command exits 0.
4. Evidence goes to a fresh immutable directory per run; never overwrite or relabel evidence from another head.
5. A failed run closes `FAIL` with its cause; an unproven run closes `BLOCKED`. Fix, then start a new run.
6. Record in `STATUS.md` and `BUILD-LOG.md`, then `delivery-ledger verify` (its exit code).
7. Never hand-edit `.delivery/runs/*.jsonl` or `.delivery/releases/*.json`.

## 6. Review

- R3/R4 changes and every milestone close need an independent read-only review by a model family different from the
  implementer, given a diff artifact for the range. On this project the owner names the reviewer.
- A REQUEST_CHANGES review is answered with fixes and a re-review of the delta. A fix wave lists fixed, skipped (with
  reason) and deferred findings; loosened assertions are called out.
- Reviews are archived in `docs/review/<date>-<reviewer>-round<n>-review.md`.

## 7. Parallel work

- One writer per worktree; disjoint `Allowed Paths`; different test locks per worker.
- The integrating session owns merge, integrated run and the final claim; it verifies workers' claims on disk.
- Throwaway helper scripts live outside the tree.

## 8. Publishing and production

- Push only when asked, fast-forward only, from a green head; check the range for secrets, AI trailers and a
  non-noreply author.
- **Approval per action:** every `wrangler deploy` (staging through the protected GitHub `staging` environment, production
  through the manual production workflow), D1/DO migrations on production, DNS, Cloudflare for SaaS settings,
  custom-hostname create/delete, Email Sending domain onboarding, Mengantar production calls, relay VPS changes.
- Release order per milestone: staging Worker (`env.staging`) → smoke (`/healthz` on every host, one synthetic tenant
  flow) → owner approval → production deploy → `OBSERVABILITY.md` checks → `RELEASE.md` snapshot
  (`delivery-ledger snapshot-release`) → `production-gate`.
- Rollback: `wrangler rollback` to the previous version; tenant migrations are expand-only within a release, so code
  rollback never needs a schema rollback.

## 9. Known traps

- Chrome 157 headless on Linux loads no http(s) page without `--password-store=basic` (fixed in the dotfiles
  `ui-ref.mjs`; other harnesses need the flag too).
- `wrangler dev` simulates `send_email` (files, no delivery); `remote: true` sends real mail — test addresses only.
- KV is eventually consistent (60 s or more): never use it for host → tenant, sessions, rate limits or suspension.
- A Worker cannot bind a D1 database created after deploy; tenant data lives in Durable Objects (ADR-0006).
- `blockConcurrencyWhile` has a 30 s limit and a throw resets the object; tenant migrations use an explicit RPC.
- `shadcn add` overwrites edited primitives (`card.tsx`, `button.tsx`): back up, add, restore.
- Box-drawing wireframes: check display width (emoji with VS16 count as 2 columns) before committing.
