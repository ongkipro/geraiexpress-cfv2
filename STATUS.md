# Status — GeraiExpress v2 (`geraiexpress-cfv2`)

Updated: 2026-11-27
Status: **LIVE** on dedicated Cloudflare account `GeraiExpress` (`f235ecdb5517054b386c6d413569a103`), commit `b447d1b` (`REL-2026-11-27-centered-app-shell`, `DEC-257`) deployed 2026-11-27 (staging Worker `a3498b90-0481-4861-80a7-1c8366893abf`, 5/5 probes PASS, live SSR `gx_wide=1` PASS; production Worker `780b5172-4772-4076-afe5-18c4c882b355`, 6/6 probes PASS, live SSR `gx_wide=1` GET+HEAD PASS; control `0000`–`0021` current; all DO objects v26 `ok` — staging 2/2, prod 4/4; hosted `ci.yml` run `45893235194` **green**; Coolify `partner-relay` `RELAY VERIFY PASS 6/6`; live DNS `SPF`/`DMARC`/`DKIM cf2024-1` 3/3 PASS; `red-fixtures` 4/4 PASS).
State: LIVE
Review-Risk: R2 (released; `DEC-257` `3a59636`/`b447d1b` R1–R2 **APPROVE**; `a1f0647` R3 **APPROVE**; `16c2f20` R2 **APPROVE**)
Independent-Review: `DEC-257` (`3a59636`/`b447d1b`, centered app shell + SSR wide mode) R1–R2 **APPROVE** (isolated reviewer `9ad2ce47`); `a1f0647` (`do:migrate` stale-isolate guard) R1–R3 **APPROVE** (`2a4441e5`); `16c2f20` (`TASK-604` live Mengantar drifts) R1–R2 **APPROVE** (`944d5612`); `TASK-706..714` R1–R4 **APPROVE** (`cx/gpt-6.2-sol`, `claude`). Prior history archived verbatim in `docs/archive/STATUS-HISTORY-2026-11-25.md`.
Primary-Worker: Antigravity session, 2026-11-27
Independent-Reviewer: Isolated Reviewer `9ad2ce47` (`3a59636`), `2a4441e5` (`a1f0647`), `944d5612` (`16c2f20`), `cx/gpt-6.2-sol` (`TASK-707..714`), `claude` (`TASK-706`)
Independent-Review-Head: `b447d1b` (live on staging & production)

## Now

| Task | State | Evidence |
|---|---|---|
| **TASK-714** `/panduan` illustrated user guide (R2) | **LIVE 2026-11-26 (`b923860`)** | Staging `ccbb248e` (5/5 probes) & Production `c603faca` (6/6 probes); live `https://geraiexpress.com/panduan` 200 (0 `Set-Cookie`), desktop + `-hp.webp` 200 `image/webp`, `sitemap.xml` 11 URLs; hosted `ci.yml` run `45802206472` green (502/502 Workers, 174/174 Playwright); `check-page.mjs` 11/11 0 fail 0 warn; `cx/gpt-6.2-sol` R4 **APPROVE** (`docs/review/panduan/`). |
| **TASK-706..TASK-713** + Kasir UX & `pollStatus` auto-reconcile (R4, DEC-255) | **LIVE 2026-11-26 (`b923860`)** | Shipped in `REL-2026-11-26-hygiene-and-panduan` (staging `CF_SAAS_ZONE_ID = "disabled"` verified live, `do:migrate` current, probes PASS); archived in `docs/archive/TASKS-706-713-2026-11-26.md`. |
| **TASK-601** Partner relay in production (R4) | **DONE 2026-11-23** | Coolify `partner-relay` co-hosted on `99ribu-prod` (`149.28.129.53`, DEC-235), `RELAY VERIFY PASS 6/6`, production `relay-health` probe PASS (`BUILD-LOG.md`, `docs/runbooks/production-zones.md` §6). |
| **TASK-603** Backups & remote restore drill (R3) | **DONE 2026-11-26** | Remote D1 Time Travel (stg & prod bookmarks), staging D1 export → APAC scratch D1 `geraiexpress-drill-20261126` (33/33 tables + exact row parity, 4.92 s import; scratch DB deleted post-verification), and R2 daily backups → scratch DO restore for `demo-tenant-001` (894 rows) & `probe` (3 rows) on both staging & production (exact SHA-256 match, < 1 s RTO, 422/409 refusals verified; `docs/evidence/TASK-603/drill-remote-2026-11-26.md`). |
| **TASK-602 / 604** Remaining M6 live owner gates | OPEN (owner-run) | Production & staging live (5/5 stg, 6/6 prod probes). Live prod Mengantar checks (`TASK-604`) executed 2026-11-26 (`docs/evidence/TASK-604/mengantar-prod-checks-2026-11-26.md`) incl. zero-debit `unpaid_hold` + idempotent replay + `pay-unpaid` + `DELETE /order`; **all 6 live contract drifts fixed** (float `balanceAmount`, `/invoices` signed cashflow & `typeAddBalance.total`, `pending_rescan` ISO `dateRange`, `DELETE /order` `typeRefund`, `pay-unpaid` `400 "balance is not enough"`, `0021` `SAP`/`spx`/`lion` rounding tolerances). Remaining: set real `ALERT_WEBHOOK_URL` + alert drill (`TASK-602`), clean Rp0 pilot courier parcels + paid `pay-unpaid` verification (`TASK-604`). |
| **Completed M1–M5, TASK-701/705, DEC-234..251** | DONE (archived) | Verbatim history preserved in `docs/archive/STATUS-HISTORY-2026-11-25.md` and `BUILD-LOG.md`. |

## Next

1. Owner M6 gates before opening public registration: set real `ALERT_WEBHOOK_URL` + confirm 17 `[DRILL]` alerts (`TASK-602`); complete live courier pilot + paid `pay-unpaid` verification on clean Rp0 Mengantar pilot account (`TASK-604`).
2. Post-launch P2 backlog when owner schedules it: `TASK-702` (sender stamp card, counsel first), `TASK-703` (multi-outlet owner), `TASK-704` (Shift & Laci Kasir UI).

## Blockers

- Counsel review (Permenkomdigi 8/2025 Art. 77 vs masked labels; UU PDP retention; cashback vs e-money) — before masking is advertised (DEC-231) and before post-launch cashback ledger accrual (DEC-255).
- Clean Rp0 pilot parcel & paid `pay-unpaid` verification (`TASK-604`) + real `ALERT_WEBHOOK_URL` (`TASK-602`) before opening public registration.

## Standing rules

- `STATUS.md` is the only workflow-state authority; `TASKS.md` is the only execution queue.
- Docs English, product UI Indonesian (DEC-217). Desk-scale size contract (`design/admin-contract.json`, DEC-239) for every admin screen.
- No deploy, DNS, VPS or Mengantar production action without explicit owner approval at the time.

<!-- Keep Now/Next/Blockers within the first 80 lines and this file under 12 KB; history goes to docs/archive/ and BUILD-LOG.md. -->
