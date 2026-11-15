# Status — GeraiExpress v2 (`geraiexpress-cfv2`)

Updated: 2026-11-16
Status: M1 in progress — TASK-101, 102, 103, 107, 108 done (Carbon APPROVE), TASK-110, 104, 105 done (review in the final pass); next TASK-106 → TASK-111/109/112 → TASK-199
State: IN_PROGRESS
Review-Risk: R4
Independent-Review: owner directive 2026-11-16 — per-task reviews deferred to one final reviewer-carbon pass after M1–M6 code; TASK-110 round 1 REQUEST_CHANGES (2 P1, 3 P2, 1 P3) fixed, pending final pass; TASK-107/108 PASS — reviewer-carbon round 1 REQUEST_CHANGES (1 P1, 5 P2, 1 P3, fixed), round 2 APPROVE (`docs/review/TASK-107-108/`); TASK-102/103 PASS — reviewer-carbon round 1 REQUEST_CHANGES (2 P1, 4 P2, 1 P3, all fixed), round 2 APPROVE (`docs/review/TASK-102-103/`); TASK-101 PASS (round 2 APPROVE, `docs/review/TASK-101/`)
Primary-Worker: pi session (Claude Opus 5.5 via 9router-fantastico), 2026-11-16
Independent-Reviewer: reviewer-carbon (9router-fantastico/ag/gemini-4-carbon-high)
Independent-Review-Head: TASK-107/108 working tree (diff `docs/review/TASK-107-108/TASK-107-108.diff.gz`)

## Now

M1 build on branch `dev` (worktree `~/Projects/.worktrees/geraiexpress-cfv2/dev`), merged fast-forward to `main` per task.

| Task | State | Evidence |
|---|---|---|
| TASK-105 Accounts | DONE 2026-11-16 | D1 `users`, `sessions`, `email_otps`, `password_resets`, `invitations`, `auth_throttle`, `known_devices`; PBKDF2-SHA256 100k + salt + pepper; host-only `__Host-ge_app`/`dev_ge_app` (7-day rolling, 30-day absolute); Origin/CSRF on unsafe requests; OTP 10 min, 5 wrong → 15 min lock, 3/15 min per email, 10/h per IP; reset revokes all sessions; invitations single use 7 days; `security_alert` on new owner device; `/api/app` route registry with auth level + projection; screens `/masuk`, `/daftar-akun`, `/lupa-sandi`, `/atur-sandi/:token`, `/undangan/:token`; 17 Workers tests; Playwright 6/6 (390/768/1280); UI gates 0 fail on 5 routes; mutations (reset revocation, missing Origin) red |
| TASK-104 Email outbox + mailer | DONE 2026-11-16 | D1 `email_outbox` (encrypted address + payload, nulled on sent/terminal/expiry), `email_suppressions`, `platform_legal_profile`; one `sendMail` path (`dispatchDue`, lease-based claim), retries 30 s/2 min/5 min max 4, never after `expires_at`; six Indonesian templates (text + html, snapshot); 14 Workers tests incl. crash-after-claim; mutation (expiry guard) red |
| TASK-110 Observability base | DONE 2026-11-16 (staging channel: AWAITING_OWNER_ACTION) | `@gx/telemetry` events + redaction (keys, tokens, links, cookies, OTPs, phones); Public API anomaly evaluators; `*/5` checks + owner alerts (`alert_state` de-dup, retry on failed delivery); `pnpm probes --env local` 5/5 PASS vs `wrangler dev`; `--force-fail --alert-dry-run` drill; staging `ALERT_WEBHOOK_URL` needs the owner's webhook URL + `wrangler secret put` |
| TASK-107 Money/weight math | DONE 2026-11-16 | `packages/domain` money + weight: every spec 02 §3.4 row, 9599, not-yet-applied fixture, insured Laba Kas, COD fee fixed point, guards, 2,000-case property test (S, V sampled); mutation (9599) red |
| TASK-108 INV slug | DONE 2026-11-16 | rejection-sampled CSPRNG slug; tenant migration `0002_inv_slugs`; 10,000 slugs → 0 duplicates; same slug in two tenants; case-insensitive `INV: …`; mutations (upsert, biased bytes) red |
| TASK-103 Storage foundation | DONE 2026-11-16 | two migration tracks; `migrate(version)` RPC with per-step rollback and `recovery`; versioned absolute-upsert outbox with safety alarm; `pnpm do:migrate --env local` dry run + run + re-run; bidirectional Drizzle↔SQL drift test (D1 + object); Workers tests incl. failure-path (tenant in recovery → 503, others 200) |
| TASK-102 Host classifier | DONE 2026-11-16 | five contexts; D1 `tenant_hostnames` (≤ 30 s cache); 404/403/503; DCV/probe rules; cross-context 404 matrix; four mutations each turned a test red |
| TASK-101 Scaffold | DONE 2026-11-16 | `pnpm check` exit 0 incl. clean-clone copy (`pnpm install --frozen-lockfile`); `wrangler dev` `/healthz` 200 on 5 hosts; both shells served host-isolated (Workers tests `spa.test.ts`); dotuiux 0 fail + admin-geometry exit 0 at 390/1366/1536 on both shells; bundle audit mutation-proved (`.map`, client secret name) |

Live owner actions so far: none required by TASK-101.

## Next

1. TASK-106 (Super Admin TOTP), TASK-111, TASK-109, TASK-112, TASK-199.
3. Live steps awaiting the owner: staging alert webhook URL (TASK-110).
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
