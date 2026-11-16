# GPT-6.1 Sol delta re-review of the Carbon fixes — disposition (2026-11-16)

Reviewer: `reviewer` on `9router-fantastico/cx/gpt-6.1-sol` (goal runbook §2: every delta and later review on Sol),
read-only, three lanes over `82e90aa..bd009ce`: A (auth, SDK, onboarding, rotation, webhooks, pricing verifier,
route scan), B (POS dispatch, projection, quote/fees, shift, bulk, labels, POS UI), C (finance, recovery, exceptions,
pickup/returns, `/api/v1`, hostnames, public surfaces, telemetry, backups, relay). All three: `REQUEST_CHANGES`.
Every P0–P2 finding is fixed below with a regression test; each fix's test was proven red by a mutation.

| Lane # | Sev | Finding | Fix | Test (mutation red) |
|---|---|---|---|---|
| A-1 | P1 | 2xx with `{}`/`null`/no data was a definitive Partner error | `maybe_sent` for any 2xx without a success/error envelope | `partner-client.test.ts` |
| A-2 | P1 | Replacing an active webhook secret left the next poll up to 24 h away | `saveWebhookSecret` pulls `status_poll` to ≤ 1 h and arms the alarm | `webhooks.test.ts` |
| A-3 | P2 | BYOK check-then-write race over a Partner-connected seller; fence checked before the await | object refuses `ALREADY_CONNECTED` / `KEY_ROTATING` at commit time, after encryption | `onboarding.test.ts` |
| A-4 | P2 | Rotation read-back bypassed the global Partner quota | `resolveKeyRotation` reserves a call; refused → keep the fence, retry later | key-rotation suite |
| A-5 | P2 | Same-ms decisions duplicated audit/routing side effects | control `0014_decision_nonce`: every batch side effect gated on this call's nonce | `onboarding.test.ts` (2 races) |
| A-6 | P2 | Route scan skipped every `ALL` route and never checked guards | `register()` records guard + handler identity; scan rejects `app.all`, extra `use`, handlers outside `register` | `route-scan.test.ts` fixtures |
| A-7 | P2 | Email-change request ignored the confirm lock | request checks `email-change-lock` first | `account.test.ts` |
| A-8 | P2 | Non-HTTP origin threw outside the redacting boundary | scheme check + URL build inside one catch with a fixed message | `public-client.test.ts` |
| B-1 / C-1 | P1 | `payUnpaid` fence taken after an await; unresolved attempts checked per slug; failed sibling read-back | fence before the first await; unresolved check and settlement batch-wide; paid batch with an unread sibling stays `unknown`; crash recovery reads every held member | `dispatch.test.ts` (sibling + concurrent) |
| B-2 | P1 | Out-of-order re-quotes: dispatch used newest `quoted_at`, not the bound quote | `latestQuote` follows `shipments.quote_snapshot_id` | `dispatch.test.ts` |
| B-3 | P1 | Re-freeze during dispatch's awaits changed money after the payload was built | dispatch owns the INV before its first await; `freezeQuote` refuses while owned; journal re-checks state + quote id | `dispatch.test.ts` (gated address call) |
| B-4 | P2 | Service fee sent for COD Barang (every card refused) | fee hidden and never sent for COD Barang | e2e `quote.spec.ts` |
| B-5 | P2 | Fee line could run off the 100 mm receipt | charge items wrap within the content width | `print.test.ts` geometry |
| B-6 | P2 | Checkout preview ignored "Samarkan HP penerima untuk COD" | preview applies the same rule (mode + setting) | e2e `masking.spec.ts` |
| C-2 | P1 | Held/ambiguous `/issue` released its reservation → recovery spent past the cap | control `0015_api_key_spend_items`: one reservation per INV/row, kept for held/unknown, released only on established non-issue; pay-unpaid never counts an INV twice | `api-v1.test.ts` (2) |
| C-3 | P1 | Daily pending rescan starved old pending invoices | range ends at the newest non-final day and continues from a stored cursor (tenant `0021`) | `finance.test.ts` (300 newer rows) |
| C-4 | P2 | Bulk cap used the publish tariff; failed rows kept reservations | per-row frozen due + gerai cost, all or nothing; consumer releases rows that did not issue | `api-v1.test.ts` (exact cap / one short) |
| C-5 | P2 | Claim evidence purpose; idle expiry; badge vs bucket 48 h rule | purpose filter; `claim_expiry` timer; `kendalaWhere(now)` shares the live predicate | `exceptions.test.ts` |
| C-6 | P2 | Return/refund matching ignored sub-item references | top-level → sub-item AWB/order → description token; sub-items linked | `finance.test.ts` |
| C-7 | P2 | Return-debit fallback multiplied the invoice amount across null sub-items | per-invoice aggregation, invoice amount once | `finance.test.ts` (+ re-read) |
| C-8 | P2 | Hostname rollback could purge a concurrent winner | control `0016_hostname_request`: rollback by this request's id only | `lifecycle.test.ts` (injected race) |
| C-9 | P3 | Restore success/409 not tested over HTTP | added | `backup.test.ts` |

Deferred (P3, recorded): `scale_photo_r2_key` (spec 01) has no writer yet, so claim packets carry no counter scale
photo; `finance.sync` event and shared `last_sync_status` (M4-9); malformed-JSON on `/api/v1` and bundle-audit regex
(M5-12); operator-check snapshot tests with seeded non-zero SQL (M6-6).

Evidence: `pnpm check` green (unit 166, Workers 366); e2e `quote` + `masking` at 390/768/1280; integrated run on the
fixed tree recorded in `BUILD-LOG.md`.

## Round 2 (Sol, `bd009ce..3bf169a`): REQUEST_CHANGES — 5 P1, 7 P2; all fixed

| # | Sev | Finding | Fix | Test (mutation red) |
|---|---|---|---|---|
| R2-1 | P1 | A call through a still-held sibling could clear the read-back-only fence of a paid batch | the fence clears only when the WHOLE batch reads back unpaid and no member is issued; otherwise the attempt stays `unknown` | `dispatch.test.ts` (lagging view) |
| R2-2 | P1 | A concurrent `/issue` (DISPATCH_IN_PROGRESS) released the active request's reservation | cap ledger moved INTO the tenant object (`api_key_spend`, tenant `0022`): reserved in the dispatch-journal transaction, released only in the transaction that establishes non-issue | `api-v1.test.ts` (gated concurrent issue) |
| R2-3 | P1 | Concurrent bulk commits rolled back the winner's reservations | reserved inside the materialization transaction (all or nothing; only the commit that leaves `ready` reserves) | `api-v1.test.ts` |
| R2-4 | P1 | Editing shipped migration 0021 left v21 objects without the rescan columns | 0021 restored; new tenant `0022_rescan_and_api_spend` | `migrations/tenant.test.ts` (v21 → current) |
| R2-5 | P1 | Read back "not found" → draft kept the reservation; a heavier re-quote was not charged | release in the same transaction as the draft reset (and on rejection / cancel) | `api-v1.test.ts` |
| R2-6 | P2 | Spend identity was global though slugs are tenant-local | ledger is per tenant object | (structural: per-object table) |
| R2-7 | P2 | A held bulk row was counted twice on pay-unpaid | one row per INV; pay-unpaid reserves each held INV of the batch once | `api-v1.test.ts` (exact cap then pay) |
| R2-8 | P2 | Release not atomic with the usage decrement | single-row delete inside the DO transaction (no separate counter) | — |
| R2-9 | P2 | Claim expiry timer set without arming the alarm | `exceptionsOp` arms the alarm after its transaction | `exceptions.test.ts` (idle object, no alarm before) |
| R2-10 | P2 | Route scan did not prove the guard is mounted | `register()` records handler→guard; scan checks the exact guard precedes each handler and allowed middleware by identity | `route-scan.test.ts` (unguarded re-mount fixture) |
| R2-11 | P2 | Refund sub-items all linked to the first matched INV | each sub-item resolved and linked independently; unmatched items flagged | `finance.test.ts` |
| R2-12 | P2 | Mixed known/null return amounts produced a partial total | sub-item sum only when all are known; else the invoice amount once | `finance.test.ts` |

Control `0015_api_key_spend_items` is superseded by `0017_retire_api_key_spend` (both forward-only). Evidence:
`pnpm check` green (unit 166, Workers 371).

## Round 3 (Sol, `3bf169a..d50c664`): REQUEST_CHANGES — 3 P1, 2 P2; R2 items 2–12 FIXED, R2-1 PARTIAL; all fixed

| # | Sev | Finding | Fix | Test (mutation red) |
|---|---|---|---|---|
| R3-1 | P1 | Paid batch, sibling readable WITHOUT an AWB (lagging view) cleared the fence | with the batch known paid, a sibling without an AWB keeps the attempt `unknown` | `dispatch.test.ts` (`readBackLagFor`) |
| R3-2 | P1 | A reserved bulk draft could be re-quoted (increase uncharged) | `freezeQuote` refuses a draft holding an API-key reservation | `api-v1.test.ts` |
| R3-3 | P2 | Bulk rows refused before the journal kept their reservation | released in the same transaction that records the row's definitive pre-journal failure | `api-v1.test.ts` (expired quote) |
| R3-4 | P1 | 0017 dropped populated D1 counters | 0017 aborts on any outstanding reservation or today's spend (no environment has written them yet) | `migrations/control-retire.test.ts` |
| R3-5 | P2 | Refund with one amount-only sub-item lost the description fallback | a single sub-item may use the invoice's own reference or description token | `finance.test.ts` |
