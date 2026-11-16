### Final End-of-Build Review — Milestone M2 Part B (`TASK-204`, `TASK-206..208`)

**Verdict: FAIL (6 real defects found)**

#### Audit Checklist Summary
- **Webhook verify (token hash, HMAC `ts.body`, ±5 min, environment)**: D1 `sha256(token)` lookup (`apps/worker/src/webhooks/ingest.ts:16`) + DO constant-time token check with 24h rotation grace (`apps/worker/src/do/gerai-vault/index.ts:2470-2474`), HMAC-SHA256 over `${timestamp}.${rawBody}`, ±5 min window, and `x-environment: sandbox` rejection on `production` (`apps/worker/src/webhooks/verify.ts:15-28`) are sound. **Defect #3** affects secret updates on active connections.
- **Store-before-200**: Verified. `handleMengantarWebhook` commits `webhook_inbox` (`state = 'received'`) and sets `inbox_sweep` inside `transactionSync` before enqueueing to `WEBHOOK_QUEUE` and returning `200`, returning `503` on `TENANT_NOT_READY` / `TENANT_NOT_PROVISIONED` (`apps/worker/src/webhooks/ingest.ts:22-41`, `apps/worker/src/do/gerai-vault/index.ts:2491-2510`). **Defect #6** affects direct `sweepInbox` RPC calls.
- **Inbox idempotent apply**: Deduplicated by `event_key = sha256("${timestamp}.${rawBody}")` in `webhook_inbox` and `wh:${eventKey}` in `shipment_events` (`apps/worker/src/do/gerai-vault/index.ts:2489-2501, 2514-2542`). **Defect #2** affects pre-issue dispatch states and `markIssued` status projection.
- **Status combine & monotonic custody**: `reduceProvider` and `reduceCustody` are total-order maxima (`packages/domain/src/status/index.ts:36-52`). **Defect #1** causes false status conflicts on confirmed cancellations.
- **Polling floor**: **Defect #4** (head-of-line starvation on failed `getOrder` calls, `POLL_BATCH` cap sleeping 1h/24h with backlog remaining, and fenced-key poll lying `"ok"` / delaying 24h).
- **Discount verifier states & alerts**: Band checks, SLA catch-up scheduling, and `selisih` alerting work, except **Defect #5** (stale alert sent when optimistic-lock `UPDATE` loses a race).
- **Super Admin never mutates shipments**: Pass across all `apps/worker/src/admin/**/*.ts` routes — zero routes create, pay, edit, or cancel tenant shipments.
- **PII reads audited**: `POST /pengawasan/risiko` enforces `owner_recent` + `risk_review === 1` + `requireReason`, hashes phone via `phoneHmac`, and awaits `auditStatement(...).run()` (storing only `key.slice(0, 12)`) before reading `recipient_risk_index` (`apps/worker/src/admin/monitor/index.ts:54-74`). `GET /sistem/audit` requires `owner_recent` and audits reads (`apps/worker/src/admin/audit/index.ts:49-75`), but has **Defect #6/5 below (audit filter)**.

---

### Real Defects

#### 1. `combine("cancelled", "cancelled_local")` falsely marks every provider-confirmed local cancellation as a status conflict
- **Cite**: `packages/domain/src/status/index.ts:15, 61, 66-67`; `apps/worker/src/do/gerai-vault/status/index.ts:107-115`
- **Code**:
  - `PROVIDER_RANK.cancelled` is `90` (`packages/domain/src/status/index.ts:15`).
  - `combine` handles `custody === "cancelled_local"` with:
    `return { status: "cancelled", conflict: provider === "delivered" || provider === "lost" || rank >= 30 }` (`packages/domain/src/status/index.ts:66-67`).
- **Concrete failure scenario**: A gerai cancels an issued shipment (`DELETE /order` confirmed, recording `custody_stage = "cancelled_local"` via `recordCustody` at `apps/worker/src/do/gerai-vault/status/index.ts:181`). Mengantar then delivers the `"CANCELLED"` webhook (or `pollStatus` reads `"CANCELLED"` from `GET /order` history). Even though both local custody and Mengantar agree the shipment is cancelled, `rank` is `90 >= 30`, so `combine("cancelled", "cancelled_local")` returns `{ status: "cancelled", conflict: true }` and `project()` stamps `provider_status_conflict_at = now` on the shipment.
- **Fix**: Exclude `provider === "cancelled"` from the conflict predicate (`provider !== "cancelled" && rank >= 30`).

---

#### 2. Pre-issue dispatch states (`provider_unpaid_hold`, `reconciliation_needed`, `issuing_in_flight`) are overwritten by `recordProviderObservation`, and `markIssued` hardcodes `status = 'ready_for_pickup'` instead of projecting `combine(...)`
- **Cite**: `apps/worker/src/do/gerai-vault/status/index.ts:71-73, 92-98, 107-125, 136-168, 207-211`; `apps/worker/src/do/gerai-vault/index.ts:2529-2537`
- **Concrete failure scenarios**:
  1. **Unpaid hold clobbered by webhook**: `status/index.ts:71-73` and `pollCandidates` (`status/index.ts:209-210`) explicitly treat `draft`, `issuing_in_flight`, `reconciliation_needed`, and `provider_unpaid_hold` as pre-issue dispatch states owned outside `combine`. However, an order in `provider_unpaid_hold` already has `mengantar_order_code` / `awb_number` populated. When Mengantar delivers an initial `"PENDING PICKUP"` / `"ACTIVE"` webhook for that order, `applyWebhook` (`gerai-vault/index.ts:2529-2536`) calls `recordProviderObservation`, which unconditionally runs `project()` (`status/index.ts:154-168`) and overwrites `shipments.status` from `'provider_unpaid_hold'` to `'ready_for_pickup'` (and publishes `'ready_for_pickup'` to D1 `shipment_index`, dropping it from `/pengawasan/antrean` at `apps/worker/src/admin/monitor/index.ts:48` before `pay-unpaid` ever completes).
  2. **`markIssued` desyncs `status` from `provider_status` / `custody_stage`**: `markIssued` (`status/index.ts:95`) preserves any already-recorded `provider_status` via `COALESCE(provider_status, 'ready_for_pickup')` while unconditionally setting `status = 'ready_for_pickup'`. If a webhook/poll observation (e.g. `'in_transit'`, `'cancelled'`, `'delivered'`) or custody action was recorded prior to `markIssued` (e.g. during reconciliation), `shipments.status` is reset to `'ready_for_pickup'` while `provider_status` holds the advanced state; subsequent deliveries/polls of that same observation hit `ON CONFLICT(event_key) DO NOTHING` (`status/index.ts:146, 150`) and return without re-running `project()`, leaving `status` permanently stuck at `'ready_for_pickup'`.
- **Fix**: In `recordProviderObservation`, record `shipment_events` and update `provider_status` / `last_provider_event_at` / `last_provider_rank` without overwriting `shipments.status` while `s.status` is in a pre-issue dispatch state (`draft`, `issuing_in_flight`, `reconciliation_needed`, `provider_unpaid_hold`); in `markIssued`, seed `provider_status = COALESCE(provider_status, 'ready_for_pickup')` and compute `status` through `project()` / `combine(provider_status, custody_stage)`.

---

#### 3. `saveWebhookSecret` preserves `webhook_state = 'active'` for an unverified secret, suppressing `secret_mismatch` and the 1-hour polling floor
- **Cite**: `apps/worker/src/do/gerai-vault/index.ts:2432, 2441, 2483, 2614, 2620`
- **Concrete failure scenario**: A gerai has `webhook_state = 'active'`. The seller regenerates their Webhook Secret in Mengantar Seller Settings and pastes a mistyped/wrong secret in `/pengaturan/mengantar`. `saveWebhookSecret` (`gerai-vault/index.ts:2441`) overwrites `encrypted_webhook_secret` with the unverified secret, clears `webhook_last_failure_at = NULL`, and keeps `webhook_state = 'active'` (`CASE WHEN webhook_state = 'active' THEN 'active' ELSE 'awaiting_seller_setup' END`). Every subsequent Mengantar webhook fails with `BAD_SIGNATURE` (`401`), yet `ingestWebhook` (`gerai-vault/index.ts:2483`) refuses to transition out of `'active'` (`CASE WHEN webhook_state = 'active' THEN 'active' ELSE 'secret_mismatch' END`). As a result:
  1. `/pengaturan/mengantar` continues showing `webhookState: "active"` instead of `"awaiting_seller_setup"` / `"secret_mismatch"`, and
  2. `pollStatus` (`gerai-vault/index.ts:2614, 2620`) stays on the 24-hour `POLL_INTERVAL_ACTIVE_MS` schedule instead of the 1-hour polling floor while 100% of webhooks are rejected.
- **Fix**: When `saveWebhookSecret` writes a changed secret, set `webhook_state = 'awaiting_seller_setup'` (matching `rotateSellerKey` at line 2098) so the next delivery proves it (`'active'`) or flags `'secret_mismatch'`, while hourly polling covers the gap.

---

#### 4. `pollStatus` suffers head-of-line starvation on failing orders, stretches the 1h/24h floor past 50 open shipments, and marks fenced-key runs `"ok"` for 24h
- **Cite**: `apps/worker/src/do/gerai-vault/index.ts:208, 2574-2621`; `apps/worker/src/do/gerai-vault/status/index.ts:207-214`
- **Concrete failure scenarios**:
  1. **Head-of-line starvation**: `pollCandidates` selects `ORDER BY COALESCE(last_polled_at, 0) ASC LIMIT 50` (`status/index.ts:211`), and `pollStatus` updates `shipments.last_polled_at` only inside the `try` block (`gerai-vault/index.ts:2606`). Any open shipment whose `client.getOrder` throws (e.g. upstream 404 / environment mismatch) keeps `last_polled_at` at `NULL` (`0`) or its frozen old timestamp, remaining permanently pinned at the top of `pollCandidates`. Once 50 such rows accumulate, all healthy and newly issued open shipments are starved forever.
  2. **Batch cap (`POLL_BATCH = 50`) sleeps full 1h / 24h despite overdue backlog**: When a gerai has `> 50` open shipments (e.g. 150 open shipments across a normal multi-day transit window), `pollStatus` polls 50 rows and unconditionally schedules `status_poll` for `now + 1h` (inactive) or `now + 24h` (active) (`gerai-vault/index.ts:2620`), turning the 1h polling floor into 3h+ and the 24h reconcile into 72h+.
  3. **Fenced/unavailable seller key falsely records `last_sync_status = 'ok'` and skips 24h**: When `this.sellerKey(tenantId)` returns `null` (e.g. during a 5-minute fenced key rotation) while `candidates.length > 0` (`gerai-vault/index.ts:2583-2584`), zero shipments are polled, yet line 2619 sets `last_polled_at = now, last_sync_status = 'ok'` and line 2620 pushes an active tenant's next poll out by 24 hours.
- **Fix**: Update `last_polled_at` (or a separate `last_poll_attempt_at` ordering column) on failed attempts so poison rows rotate to the back of the queue; schedule a short continuation delay when remaining candidates have `COALESCE(last_polled_at, 0) <= now - interval`; and when `candidates.length > 0 && !key`, do not mark `last_sync_status = 'ok'` or advance `status_poll` by 24h.

---

#### 5. `GET /sistem/audit` strips underscores from the `action` filter, breaking search for nearly all snake_case audit actions
- **Cite**: `apps/worker/src/admin/audit/index.ts:57-60`
- **Code**: `binds.push(`${action.replace(/[%_]/g, "")}%`)` (`apps/worker/src/admin/audit/index.ts:59`).
- **Concrete failure scenario**: Almost every multi-word audit action in M2 uses `_` (`seller_key.rotate`, `seller_key.resolve`, `admin.risk_review_grant`, `admin.risk_review_revoke`, `legal_profile.update`, `tenant.custom_domain`, `tenant.onboarding_retry`, `pricing.rule_update`, `pricing.request_sent`, `pricing.platform_policy_update`, `pricing.courier_policy_update`, `pricing.courier_policy_reset`). When a Super Admin queries `/sistem/audit?action=seller_key.rotate` (or `?action=pricing.rule_update`), `.replace(/[%_]/g, "")` deletes the underscore and binds `'sellerkey.rotate%'`, which matches **0 rows** in `audit_logs`.
- **Fix**: Escape SQL `LIKE` wildcards instead of deleting underscores: `a.action LIKE ?N ESCAPE '\'` with `${action.replace(/[\\%_]/g, "\\$&")}%`.

---

#### 6. Minor RPC / Concurrency Defects (`recordObservation` stale alert on lost CAS; `sweepInbox` missing `armOutbox`)
- **`apps/worker/src/pricing/rules/index.ts:235-246`**: `recordObservation` guards its `UPDATE` with `WHERE tenant_id = ?8 AND service_code = ?9 AND updated_at = ?10` so a concurrent `updateRule` (which bumps `updated_at` and resets `verification_state = 'belum_diterapkan'`) is not clobbered, **but discards `res.meta.changes`**. If `updateRule` commits while `recordObservation` is in flight (`meta.changes === 0`), line 243-245 still fires `sendAlert` for the superseded `assigned_bps` (emitting a false `discount_selisih` alert and burning the cooldown key for `discount_selisih.<tenantId>.<serviceCode>`) and returns the unpersisted `next` state. Check `(res.meta.changes ?? 0) === 1` before calling `sendAlert`.
- **`apps/worker/src/do/gerai-vault/index.ts:2546-2568`**: Unlike `ingestWebhook` (line 2509), `applyWebhook` (line 2541), and `pollStatus` (line 2623), the public `sweepInbox` RPC writes `vault_timers` (`lines 2564-2566`) without calling `await this.armOutbox()`. Calling `sweepInbox` directly via RPC outside `runTimers` leaves the DO alarm un-armed for the next `inbox_sweep`.