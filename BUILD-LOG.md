# Build Log — GeraiExpress v2 (`geraiexpress-cfv2`)

Durable implementation changes, validation evidence and gotchas for the next maintainer. Current state lives in
`STATUS.md`; decisions in `DECISIONS.md`.

## 2026-11-15 — M0 locked

- Scope: documentation-first specification (PRD PR-01..24, DEC-201..229, ADR-0001..0006, specs 01–12, visual 01–08,
  research 01–03, `docs/WORKFLOW.md`, `docs/DIAGRAMS.md`) and a throwaway Vite + React prototype (`prototype/`).
- Evidence: owner sign-off 2026-11-14 (Direction A, DEC-226); independent review APPROVE by GPT-6.1 Sol round 10 on
  `702262f` after rounds 1–9 (archive `docs/review/`); prototype gates 0 fail on 12 routes at 390/1366/1536
  (`design/evidence/prototype-gates.md`); worked money examples recomputed by script; status ordering rule checked by
  a 30,000-case permutation simulation (0 order-dependent outcomes); 14 Mermaid diagrams render with mermaid 12.3.
- Gotchas found on the way (also in `docs/WORKFLOW.md` §9):
  - Chrome 157 headless on Linux loads no http(s) page without `--password-store=basic`.
  - D1 is 10 GB per database and cannot be increased → tenant data lives in per-gerai SQLite Durable Objects.
  - Mengantar polling dates have minute precision and webhook headers second precision → minute-bucket ordering.
  - GitHub tables split on `|` inside backticks → escape as `\|`.
- Not done: no application code, no deploy, no Cloudflare resources, no Mengantar call.

## 2026-11-15 — Execution plan approved

- `TASKS.md` holds 50 contracts for M1–M6 (incl. milestone-close tasks `x99`) plus post-launch `701..703`, with a
  coverage map: every P0 PR, DEC-201..229 and ADR-0001..0006 is owned by a task.
- Evidence: GPT-6.1 Sol plan review rounds 1–2 REQUEST_CHANGES, round 3 APPROVE
  (`docs/review/2026-11-15-sol-plan-round{1,2,3}-review.md`); scripted checks: all fields present, dependency graph
  acyclic, no forward-milestone dependency, every M2–M6 task gated by the previous milestone close, TASK-604 closure
  covers every task, no tenant-data task below R3, TASKS.md 43.5 KB (< 50 KB).
- `docs/DIAGRAMS.md`: 14 Mermaid diagrams render with mermaid 12.3 (checkout and finance diagrams re-rendered after
  the plan review corrections).
