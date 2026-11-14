# Status — GeraiExpress v2 (`geraiexpress-cfv2`)

Updated: 2026-11-13
Status: M0 specification complete; prototype built and gated; awaiting owner visual pick and sign-off
State: PLANNED
Review-Risk: R0
Independent-Review: PASS (docs only — Fable 5.1 rounds 1–3, Gemini 4 Carbon rounds 1–3; see `docs/review/`)
Primary-Worker: pi session (Claude), 2026-11-12/13
Independent-Reviewer: reviewer-fable (claude-fable-5-1), reviewer (gemini-4-carbon-high)
Independent-Review-Head: 16d0d60

## Now

M0 documentation is complete and committed locally (no remote): PRD PR-01..PR-24, DECISIONS DEC-201..DEC-219,
ADR-0001..0005, specs 01–10, visual 01–07, research 01, `DESIGN.md` (direction pending), `design/` brief, refs and
comfort size contract. No application code exists. The v1 repository `~/Projects/geraiexpress` is untouched.

## Next

1. TASK-001 done: `prototype/` (shadcn base-nova, comfort primitives, 3 directions). Gates: `design/evidence/
   prototype-gates.md` (0 fail / 0 warn on 10 routes; admin-geometry exit 0 at 390/1366/1536). Preview:
   `http://100.127.67.86:55180/` while the preview task runs.
2. TASK-002: owner picks one of 2–3 rendered visual directions; record `Picked-by` in `DESIGN.md`.
3. TASK-003: owner signs off M0; then TASK-101 starts M1.

## Blockers

None for M0. Open items that do not block design but must close before the stated milestone:
- Mengantar Q23 (IP restriction on Public API writes / label generation for Partner-created sellers) — before M6.
- Vultr Reserved IP conversion procedure and price — verify at M6.
- Counsel: Permenkomdigi 8/2025 Art. 77 vs masked labels; UU PDP retention; cashback vs e-money — before M3
  masking is advertised and before any cash-out feature.
- Mengantar sandbox checks listed in specs 02, 04, 09 (weight echo, `POST /time` timezone, `/invoices` ordering,
  `pay-unpaid` idempotency) — during M2/M4.

## Standing rules

- `STATUS.md` is the only workflow-state authority; `TASKS.md` is the only execution queue.
- No `TASK-1xx` before the owner's M0 sign-off is recorded here.
- Docs English, product UI Indonesian (DEC-217). Comfort size contract for every admin screen.
- No deploy, DNS, VPS or Mengantar production action without explicit owner approval at the time.

<!-- Keep Now/Next/Blockers within the first 80 lines and this file under 12 KB; history goes to BUILD-LOG.md. -->
