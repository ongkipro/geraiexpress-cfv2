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
