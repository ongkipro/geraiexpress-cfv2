# Final reviewer-carbon pass — disposition (2026-11-16)

Reviewer: `reviewer-carbon` (`9router-fantastico/ag/gemini-4-carbon-high`), read-only, one pass per milestone diff
(goal runbook §2). Inputs: `M1..M6.diff.gz` (base..`fd28815`, ..`fd7c754`, ..`d53b72d`, ..`90375fc`, ..`8c71201`,
..`82e90aa`); findings verified against HEAD. M2 timed out once as one review and was re-run as two bounded reviews
(M2A Mengantar SDK/onboarding/rotation, M2B webhooks/status/pricing/admin). All verdicts were `REQUEST_CHANGES`.

Every P0–P2 finding below was fixed (or answered) in the fix commit; each fix has a regression test unless noted, and
the key ones were proven with a mutation that turned the test red. P3 items were fixed where cheap.

## M1 (foundation)

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | P0 | Auth pages sent a dummy Turnstile token (login/sign-up impossible outside local) | Fixed: public `GET /auth/config` → site key; explicit-render widget (`lib/turnstile.tsx`) on `/masuk`, `/daftar-akun`; `turnstileOk` fails closed without a site key; local test keys keep the dev token |
| 2 | P1 | Unnormalised `Host` in email links + render throw blocks the outbox | Fixed: `hostOrigin` normalises; decrypt/render inside try → terminal `E_RENDER`; test proves a bad row never blocks the batch |
| 3 | P1 | `armOutbox` re-armed `daily_stats` forever (DO never sleeps) | Fixed: `armAlarm()` for alarm/flush/timer paths; test asserts no timer after flush; mutation red |
| 4 | P1 | OTP enumeration, attempts race, multi-OTP bypass; invitation password brute force | Fixed: unmatchable row for existing emails, only newest code valid, atomic per-email wrong counter, lock checked on request; invitation accept uses login lock/IP/fail counters; tests + mutation |
| 5 | P2 | Route scan only checked the self-reported registry | Fixed: test compares Hono `app.routes` of both APIs to the registry; side-door mutation red |
| 6 | P2 | CSRF ignored scheme; host compare not normalised | Fixed: scheme + normalised host/port; table test |
| 7 | P2 | Owner security alert linked to a 404; `kembali` dropped; enrolment reload | Fixed: link to `app./akun`, mail dispatched; `kembali` validated relative path; `TOTP_ENROL_REQUIRED` → enrol mode; test |
| 8 | P3 | Suppressed address silently dropped on invite | Fixed: `EMAIL_SUPPRESSED` with the spec 12 message |

## M2A (Mengantar SDK, onboarding, rotation)

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | P1 | Body read failure / non-JSON 5xx not ambiguous | Fixed: body read inside try; `ambiguous` for any 5xx and unreadable 2xx; tests |
| 2 | P1 | Partner 2xx unreadable → `error` | Fixed: → `maybe_sent`; test |
| 3 | P1 | Redaction gaps | Fixed: envelope message never echoed; origin validated before the key enters a string; deep scrub returns `[REDACTED]`; `routeLabel` strips any prefix |
| 4 | P1 | Crash after approval wedged onboarding | Fixed: `tenant_onboarding` row in the approval batch; `provisionSeller` migrates + creates the outlet idempotently; retry route uses LEFT JOIN |
| 5 | P1 | Read-back adopted `sellers[0]` | Fixed: exact `externalUserId` match, empty key → `provider_restricted`, VaultResult checked; test with a filter-ignoring mock, mutation red |
| 6 | P2 | Quota bypass on list/apiKey; release semantics inverted | Fixed: `reserve("call")` before both; no release on `KEY_PROVISIONING_FAILED`; relay refusal releases and stays pending |
| 7 | P2 | `completeKeyRotation` throw / no poll floor / lost secret | Fixed: refusal instead of throw; hourly floor + arm; secret kept under a new token when none existed; inbox sweep keeps the previous-token expiry |
| 8 | P2 | BYOK set externalUserId, ignored the fence | Fixed: object stores `externalUserId: null`, D1 `seller_id` cleared (D1 column is NOT NULL and stays the tenant key); refused during rotation or when Partner-connected |
| 9 | P2 | Same-ms duplicate decision email; resubmit race | Fixed: deterministic outbox id + `ON CONFLICT DO NOTHING`; resubmit only from `rejected` |
| 10 | P3 | Day buckets never pruned | Fixed |
| — | — | Reviewer could not read `credentials/rotation.ts` (Safety Net path rule) | Noted: the DO-side fence was reviewed; the Worker caller is covered by `test/key-rotation` |

## M2B (webhooks, status, pricing, admin)

| # | Finding | Disposition |
|---|---|---|
| 1 | `cancelled` + `cancelled_local` flagged as conflict | Fixed in `combine`; domain test |
| 2 | Observation clobbered pre-issue states; `markIssued` hard-coded status | Fixed: pre-issue states keep `status` (provider status recorded); `markIssued` projects via `combine`; test |
| 3 | New webhook secret kept `active` | Fixed: → `awaiting_seller_setup` until a delivery proves it |
| 4 | Poll starvation / batch cap / fenced key | Fixed: failed rows move to the back, backlog continues in 1 min, fenced key retries in 10 min without marking ok |
| 5 | Audit filter stripped underscores | Fixed: escaped `LIKE`; test |
| 6 | Stale Selisih alert on lost CAS; `sweepInbox` not arming | Fixed |

## M3 (POS)

| # | Sev | Disposition |
|---|---|---|
| 1 | P1 | parse/5xx ambiguous (SDK, above) |
| 2 | P1 | `reconcileDispatch` acts only on `reconciliation_needed`, never during an in-flight dispatch; masking slot released on "not found"; test |
| 3 | P1 | `pay-unpaid` fenced per batch, unresolved attempt reads back first; test |
| 4 | P1 | `cancel_unknown` resolved to `issued` when the order is still active; test |
| 5 | P1 | Kasir projection: reconciled COD credit / adjustments stripped; `cod_credit_settled` boolean; sweep extended to M4 routes with a key-list-independent assertion (mutation red) |
| 6 | P1 | True sender hidden on issued masked INVs in detail and list (printed identity shown); test |
| 7 | P2 | Service fee + promo frozen (tenant `0020_quote_fees`), on receipts/labels; POS loads packing/fee/showCommission via role-safe `GET /pos-config` |
| 8 | P2 | COD payout only on issued, non-returned INVs; payout key rotates after a partial payout |
| 9 | P2 | Kasir can void in the same shift (server-enforced); void errors shown |
| 10 | P2 | 58 mm: Bluetooth connects before the print is recorded; PDF fallback uses the 10×15 label |
| 11 | P2 | `Samarkan HP penerima untuk COD` applied; brand rule aligned with quota |
| 12 | P2 | Profile save keeps PIC, re-registers a moved pickup point, syncs the D1 name; test |
| 13 | P2 | Bulk: all-COD batch needs no payment, cancelled INVs excluded from totals, WA verification up front, `entry_channel = counter_multi` |
| 14 | P2 | Shift lines add up to the drawer (reversed payout nets in its own line); test |
| 15 | P2 | One Indonesian status dictionary (`lib/status.ts`) for Cek Resi, Dashboard, Kiriman |
| 16 | P3 | Deferred: cargo minimum weight check, 1-click kg/gram chip, DESTINATION_CODE backfill (listed in STATUS) |

## M4 (finance, ops)

| # | Sev | Disposition |
|---|---|---|
| 1 | P1 | Projection (M3 #5) |
| 2 | P1 | `recoverUnpaid` uses N + I0 and skips batches with unresolved attempts; `pay-unpaid` reads back every INV of the batch |
| 3 | P1 | Only `statusCleared` invoices move money; refunds unmatched → Selisih; single-INV adjustments linked; test |
| 4 | P1 | Backfill cursor (tenant `0021_finance_backfill`) completes capped histories; pending rescan never piggybacks; transient rescan errors retried; resolved flags close (`sync`, `balance_gap`, linked `unmatched`); owner can resolve a Selisih with a reason (audited); tests |
| 5 | P2 | COD waiting excludes returns/lost; payable includes settled credits; disputes summed per INV |
| 6 | P2 | Cancel removes the INV from open manifests; handover re-checks every item; test |
| 7 | P2 | Claims stay visible (any open claim), new `Gagal Terbit / Diperiksa` bucket, tab badge = bucket union; claims expire on read; test |
| 8 | P2 | One AudioContext; Meja Retur busy guard; handback commit in one transaction re-checking state; resolved conflicts not flagged; raw R2 keys replaced by `has_*` flags |
| 9 | P3 | Deferred (`finance.sync` event, shared `last_sync_status`) |

## M5 (public surfaces)

| # | Sev | Disposition |
|---|---|---|
| 1 | P1 | API cap: held issue spends nothing, `pay-unpaid` and bulk commit reserve; release on every non-issue path; one WIB day per call; test |
| 2 | P1 | Re-quote only an unpaid draft and move the draft with it; QR of a used INV opens the INV; test |
| 3 | P1 | `finance/sync` balance only with `finance:read`; projection (above) |
| 4 | P1 | Root + www purged together (reaper, Super Admin, owner); `www` never 301s to the platform subdomain; atomic request; test |
| 5 | P2 | `moved`/`failed` recovery returns to pending before probing; test through the real Worker path, mutation red |
| 6 | P2 | `/lacak` gate requires Turnstile; test |
| 7 | P2 | QR contacts matched on the typed details |
| 8 | P2 | Partial contact updates keep omitted fields; test |
| 9 | P2 | Privacy link from the platform origin; staging CTA host; `www.` apex → 301; JSON-LD `<` escaped |
| 10 | P2 | Public MCP charges per batched call; pre-booking validated before quota; tracking hides expired drafts and covers held INVs |
| 11 | P3 | `initialsMask` whitespace; no raw provider category on the public page |
| 12 | P3 | `www` canonical (above); invalid JSON on `/api/v1` and the bundle-audit regex: deferred |

## M6 (production readiness)

| # | Sev | Disposition |
|---|---|---|
| 1 | P1 | Relay never crashes on `//a:b` or client resets; busy calls not remembered as duplicates; `verify.mjs` rejects unknown flags, timeouts; tests |
| 2 | P1 | Public API hook always installed (also pickup address + area search), `errorCode` read; Partner `IP_NOT_ALLOWED` alert (`partner_api_ip_not_allowed`) |
| 3 | P2 | Bounce-rate check (`email_bounce_rate`); failed streak only when current; streak and rate are separate checks; never-synced connected tenants alert; rotating 200-tenant slice; tests |
| 4 | P2 | Restore only into `drill-*`, R2 checksum + tenant metadata required, restored checksum must match (else wiped), old exports deleted only after the new one; chunked BLOB encoding; tests |
| 5 | P2 | Staging CTA, privacy link, runbooks (`probe` seeded via `--remote`, `MENGANTAR_PARTNER_ID` is a var, `--remote` on D1 export/execute) |
| 6 | P3 | Ops endpoint test added |

Evidence: `pnpm check` green after the fixes (unit 163, Workers 347); see `BUILD-LOG.md` "Final review fixes".
