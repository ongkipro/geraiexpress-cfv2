# Status — GeraiExpress v2 (`geraiexpress-cfv2`)

Updated: 2026-11-15
Status: M0 signed off by owner 2026-11-14 (Direction A, DEC-226 accepted); M1 may start after an independent review APPROVE (TASK-006)
State: PLANNED
Review-Risk: R0
Independent-Review: PENDING (TASK-006) — GPT-6.1 Sol rounds 1–4 = REQUEST_CHANGES (round 4: all 15 round-3 findings resolved; N1 webhook inbox and N2 idempotent risk upsert fixed 2026-11-15); rounds 5–9: N1–N7 resolved; N8 (cancelled_local → effective cancelled), N9, N10 fixed; round 10 reviews N8–N10; earlier docs PASS (Fable 1–3, Carbon 1–3)
Primary-Worker: pi session (Claude), 2026-11-12/13
Independent-Reviewer: reviewer-fable (claude-fable-5-1), reviewer (gemini-4-carbon-high), reviewer (gpt-6.1-sol)
Independent-Review-Head: 652476f (Sol round 9)

## Now

M0 documentation is complete and pushed to the private remote `github.com/ongkipro/geraiexpress-cfv2`: PRD PR-01..PR-24, DECISIONS DEC-201..DEC-229,
ADR-0001..0006, specs 01–12, visual 01–08, research 01–03, `docs/WORKFLOW.md`, `DESIGN.md` (Direction A picked), `design/` brief, refs and
comfort size contract. No application code exists. The v1 repository `~/Projects/geraiexpress` is untouched.

## Next

1. TASK-001 done: `prototype/` (shadcn base-nova, comfort primitives, 3 directions). Gates: `design/evidence/
   prototype-gates.md` (TASK-005 re-run 2026-11-14: 0 fail on 12 routes; admin-geometry exit 0 at 390/1366/1536). Preview:
   `http://100.127.67.86:55180/` while the preview task runs.
2. TASK-002 done (Direction A) and TASK-005 done (gates re-run).
3. TASK-003 done: owner signed off M0 on 2026-11-14. Accepted as deferred: Mengantar's answer on per-seller discount
   control (DEC-226) — required before M2 pricing, not before M1.
4. 2026-11-15: owner accepted DEC-227 (Cloudflare Email Sending only), DEC-228 (D1 control plane + per-gerai SQLite
   Durable Object, ADR-0006; SaaS routing spec 11), DEC-229 (Paket Massal Excel/CSV, Riwayat Massal, Cek Resi, Akun
   Saya). Development flow: `docs/WORKFLOW.md` + spec 07 §5–7; M1 tasks TASK-108..110 added.
5. Next: GPT-6.1 Sol round 10 (TASK-006); TASK-101 starts only after APPROVE.

## Blockers

- Before M2: Mengantar must confirm whether a partner can set a per-seller discount, through what channel and when it takes effect (DEC-226).

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
