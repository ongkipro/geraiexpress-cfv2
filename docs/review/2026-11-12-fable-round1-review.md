# M0 Specification Review — `geraiexpress-cfv2`

- **Reviewer:** `reviewer-fable` (read-only audit)
- **Date:** 2026-11-12
- **Scope:** `README.md`, `AGENTS.md`, `DECISIONS.md`, `PRD.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `docs/adr/ADR-0001..0005`, `docs/spec/01..09`, `docs/visual/01..06` (21 files), cross-checked against the six research/contract notes listed in the task.
- **Method:** every claim below was checked directly against the files on disk; where a spec claim could not be traced to any research note it is labelled **Unverified**.

## Decision: REQUEST_CHANGES

## Summary

The suite is internally consistent on the headline owner decisions (DEC-211 `INV` slug, DEC-215 gram default `1000`, DEC-212/213 6+5 menu navigation with `Kontak > Pengirim/Penerima`, DEC-216 dual book, DEC-217 language split, DEC-214 OpenAPI+MCP) and the thermal layouts are column-exact. No P0 was found. There are **9 P1 defects** that must be fixed before M1 because they affect the D1 schema, the integer-money invariant, cashier role projection, or promise P0 features on upstream capabilities that the research marks Unknown. The most important: (1) `shipments.slug` is declared a global PK while uniqueness is guaranteed by a *per-tenant* DO (and 6-char birthday collisions start at ~27k slugs platform-wide); (2) Mengantar `COD_FEE` is a non-integer float in both order and invoice payloads, yet spec 09 persists it into an integer-money table with no rounding rule; (3) spec 09's pre-flight warning prints the Mengantar balance to the cashier, violating AGENTS §3.4; (4) the POD-photo unlock, sorting code, pickup-coverage flag and "COD recipient risk" are specified as P0 UI, but no documented Mengantar Public API field or endpoint supplies them; (5) cargo COD is not excluded although the research explicitly leaves cargo COD parsing disabled; (6) the "backfill until continuity holds" balance check is unbounded and rests on an unverified assumption about `balanceAmount` ordering.

## Findings

### P1 — must fix before M1

**P1-1 — `INV` slug uniqueness scope contradicts the allocator.**
- `docs/spec/01-DATA-MODEL-AND-LEDGER.md:22` and `:51` declare `shipments.slug` the **PK** (global uniqueness). `docs/adr/ADR-0004-durable-object-per-gerai-vault.md:16` and `ARCHITECTURE.md:61` say the **per-tenant** `GeraiVaultDO` "guarantees unique 6–7 char `INV` slugs". A per-tenant DO cannot guarantee a global namespace; two tenants' DOs can allocate the same 6 chars. With `30^6 = 729M` (`docs/spec/06-DOMAINS-MENUS-AND-ROUTES.md:26`) the birthday bound is ~27,000 slugs, i.e. collisions become routine within months at the volumes shown in `docs/visual/02-WIREFRAMES-COUNTER-AND-ADMIN.md:12` (412 parcels/outlet/month × 48 outlets).
- Also unspecified: CSPRNG source for the slug (public `/lacak/:slug` and `/inv/:slug` are enumerable otherwise), and the `destinationMark` is sent uppercased (`06:32`) while the slug is stored lowercase (`01:51`) — matching must be case-insensitive.
- **Smallest fix:** in `01:51` change PK to `(tenant_id, slug)` and state "slug uniqueness is per tenant (host/session resolves tenant); Super Admin cross-tenant search returns `(tenant, slug)` pairs". In `ADR-0004:16` add "generated with `crypto.getRandomValues`; on D1 UNIQUE conflict regenerate; promote to 7 chars when a tenant exceeds N allocations". Add "compare `destinationMark` case-insensitively" to `06:32`.

**P1-2 — Non-integer `COD_FEE` stored into an integer-money mirror with no rounding rule.**
- `docs/spec/09-MENGANTAR-FINANCIAL-SYNC-AND-RECONCILIATION.md:31` lists `COD_FEE` among fields persisted to `mengantar_invoice_subitems`. Research: `COD_FEE == COD_AMOUNT × 3.33%` **non-integer** in 550/554 subItems (`2026-09-15-mengantar-reconciliation-contract.md:30-32`) and `COD_FEE: 3329.99` in the create-order response (`geraiexpress-mengantar-operations-contract.md:331`). `AGENTS.md:24` forbids float money; `docs/spec/01:3` declares all money `INTEGER _idr`.
- `docs/spec/01:54` also declares `cod_service_fee_idr` on `shipments` without stating whether it derives from the estimate's integer `codFee` (observed integer) or the order response's float `COD_FEE`.
- **Smallest fix:** in `09:31` replace `COD_FEE` with `cod_fee_raw_text` (verbatim provider string, non-money) **or** drop it, and add the invariant: "only `subItem.amount` (integer, `== COD_AMOUNT − estimatedSpecialPrice`, verified 554/554) is a money column; provider decimals are never rounded into `_idr`". In `01:54` state `cod_service_fee_idr` comes from the seller **estimate** `codFee` (integer), never from order `COD_FEE`.

**P1-3 — Pre-flight warning leaks Mengantar balance to cashiers.**
- `docs/spec/09:51` — POS shows *"Saldo Mengantar tercatat Rp12.000, estimasi debet Rp19.200"* before submission. `AGENTS.md:33`, `docs/spec/02-PRICING-DISCOUNT-AND-CASHBACK.md:67` and `docs/spec/05-IAM-SECURITY-AND-PRIVACY.md:17` strip `synced_balance_idr` and net cost from cashier DTOs. `09:55` also lets `Owner/Cashier` click `Bayar Batch Sekarang`, which is acceptable, but the amounts are not.
- **Smallest fix:** in `09:51` split copy by role: `gerai_admin` sees the amounts; `cashier` sees only *"Saldo Mengantar gerai belum cukup untuk resi ini — kiriman akan disimpan sebagai Menunggu Saldo. Hubungi pemilik gerai."* and the API returns a boolean `balance_sufficient`, never the figures.

**P1-4 — P0 tracking/label features depend on upstream fields that are not documented.**
- **POD photo:** `DECISIONS.md:13` (DEC-207), `PRD.md:76` (PR-19, P0), `docs/spec/05:13,49`, `docs/spec/06:70`, `docs/visual/03:33` promise a 4-digit-gated POD photo. The operations contract (`§5.2`, `§6.3`) documents `history[].{date,desc}` only — **no POD photo URL field** exists in any Mengantar Public API response in the research set.
- **Sorting code:** `docs/visual/04-THERMAL-LABEL-AND-RECEIPT-LAYOUT.md:14` makes `█ BDO-CBL02 █` Priority #1 on the label; `docs/spec/01:52` has `sorting_code`. `DESTINATION_CODE` is only observed on `GET /order` list rows (`operations-contract.md:279`), not in the create-order item, so it is not available at `Bayar & Cetak` time without an extra read-back.
- **Pickup coverage ("Drop-off saja"):** `PRD.md:51`, `docs/visual/05:44` — only SiCepat exposes `unsupportedPickup` (`public-api.md:29`); other couriers' pickup capability is Unknown (`operations-contract.md §2.3`, T-020 `GET /time` returned `[]`, Anteraja refuses drop-off).
- **COD recipient risk / "Sukses antar kec. tujuan 98%":** `PRD.md:51`, `docs/visual/05:21,70`, `docs/spec/03:24` — Mengantar `getReceiverScoreByNumberUser` and courier performance are **production-whitelist gated** (`operations-contract.md §10`); local history is empty at launch.
- **Smallest fix:** add an "Upstream Data Source" column/paragraph in `docs/spec/04` §3 and `docs/spec/05` §3 naming the field for each UI promise and the fallback: POD gate → "if provider exposes a POD asset (Unknown); otherwise unlock full recipient name + delivery timestamp only"; `sorting_code` → "populated from `GET /order?order_id=` `DESTINATION_CODE` after issue; label prints `KEC./kodepos` block only when absent — never invented"; pickup coverage → "per-courier `tenant_courier_prefs.pickup_mode` set at onboarding + SiCepat flag; everything else defaults to `dropOff` until M6 pilot"; COD risk → "local `recipient_contacts` counters first; Mengantar receiver score only when whitelisted". Downgrade the POD acceptance criterion in `PRD.md:76` accordingly.

**P1-5 — Cargo COD is not excluded.**
- `docs/spec/02:19-20` defines cargo rows but says nothing about COD; `PRD.md:51` quotes "all couriers for Non-COD, COD Barang, COD Ongkir; Reguler vs Cargo tabs". Research: SAP Cargo is Non-COD only; generic `codFee` (3329) ≠ cargo delta (3330); "All cargo COD parsing and creation remain disabled" (`public-api.md:112-114,129`).
- **Smallest fix:** add to `02:§1.4`: "Cargo rows are quoted and dispatched **Non-COD only** until seller-estimate + sandbox read-back evidence exists; `SapCargo` is never COD; cargo quotes must satisfy `cargoEstimatedPrice == cargoPrice` (non-COD) or be dropped."

**P1-6 — Weight value sent to Mengantar is ambiguous for ≥ 1 kg parcels.**
- `docs/spec/02:16` says sub-kg services send `raw_weight_gram / 1000` decimal kg, but never states what is sent for regular parcels ≥ 1000 g (billed integer kg vs raw decimal). Research: Mengantar accepts decimal `weight=1.5`, and whether the estimate applies the 0.30 kg rounding itself is **Unknown** (`public-api.md:40-45`). Sending `1.25` when Mengantar rounds up would bill 2 kg against a 1 kg counter quote — the exact "selisih berat" dispute class in `gerai-multi-courier-product-research.md:50`.
- **Smallest fix:** in `02:§1.3` add: "For `raw_weight_gram >= 1000` the estimate **and** order requests send the locally computed integer `billed_kg`; decimal kg is sent only for the documented iDexpress `< 500 g` tier. Record provider echo `WEIGHT` on the shipment and flag mismatch."

**P1-7 — Unbounded backfill on an unverified `balanceAmount` continuity assumption.**
- `docs/spec/09:66` — "If `prev_balance + delta != new_balanceAmount` … automatically backfills pages until full continuity holds." The reconciliation capture only lists `balanceAmount` as a field (`2026-09-15-…:20`); running-balance monotonicity by page order was **not** verified, and `/invoices` ordering (createdAt vs updatedAt when a pending top-up later clears) is Unknown. If the assumption is false the DO re-pages the entire history on every 15-minute cron for every tenant.
- Related: `09:62` watermark `(inv_number, status, updatedAt)` "newest-first" would miss an **old** invoice whose status flips (`statusExpired`) behind the watermark.
- **Smallest fix:** in `09:66` cap backfill at N pages (e.g. 5) and on failure write a `Selisih Sync` row with `synced_balance_idr` set from the newest row anyway; label the continuity rule "Assumption — verify in M4 sandbox". In `09:62` add a daily `keyword=`/`dateRange=` rescan of locally `pending` mirror rows.

**P1-8 — Webhook provisioning is manual, per-seller, and production-gated; no spec covers it.**
- `docs/spec/01:39` stores `webhook_path_token` / `encrypted_webhook_secret`; `ARCHITECTURE.md:75` verifies HMAC. But: the Webhook URL can **only** be set by the seller in Mengantar settings with a verification code; no Partner endpoint exists; production webhooks are enabled per account during staged rollout; secret rotates whenever the seller regenerates their own key; whether a `401` counts toward the 20-failure pause is Unknown (`operations-contract.md §4.1, §4.4, §4.5`). Neither `PRD.md` PR-02, `docs/spec/04`, `docs/spec/06` (`Pengaturan > Outlet & Mengantar`) nor `docs/visual/06:94` describes the Gerai Admin's manual step or a `webhook_state`.
- **Smallest fix:** add `webhook_state` (`unconfigured | awaiting_seller_setup | active | secret_mismatch | paused`) to `01:39`; add a PR-02b row in `PRD.md` §3.1: "Owner pastes `https://hooks.geraiexpress.com/webhooks/mengantar/<token>` into Mengantar, then pastes the generated secret into `Pengaturan > Outlet & Mengantar`; until `active`, the hourly `GET /order` sweep is the sole status source." State that `api-key/regenerate` must persist `callbackSecret` atomically with the new key (`ADR-0004:19`).

**P1-9 — Partner `EMAIL_ALREADY_REGISTERED` "recovery" has no defined path.**
- `PRD.md:44` (PR-02) promises recovery; the Partner contract's only documented route is **BYOK** (owner supplies their own existing key) — `partner-api.md:139,147`. No BYOK state exists in `docs/spec/01:39` `onboarding_state`, and `DEC-203` says every outlet is Partner-provisioned.
- **Smallest fix:** add `existing_account_required` and `byok_connected` to `onboarding_state` in `01:39`, and in `PRD.md:44` define recovery as "offer BYOK form or a different owner email; never retry registration with the same email".

### P2 — should fix before the affected milestone

**P2-1 — Partner-derived invoice types presented as observed.** `docs/spec/09:40-42` (`typeCorrection`, `typeDeduction`, `typeMismatchM/P`, `typeAddBalanceCredit`, `typeWithdrawal`, `typeWithdrawApi`) and `09:37` (`reduce = total - amount`) come from the Mengantar client bundle, not from the `/invoices` capture, which observed only 5 types (`2026-09-15-…:12-13`). `PRD.md:61`, `ROADMAP.md:11` ("all 6 types") and `DECISIONS.md:22` treat `typeCorrection` as verified. **Fix:** tag bundle-derived rows "(bundle-derived, not yet observed)" in `09:§2.2`, and add "unknown `type` → park in `Selisih Sync`, never ignore" (the list is open-ended).

**P2-2 — `provider_observed_discount_bps` derivation undefined.** `docs/spec/01:48`, `02:28`. Research shows `discountPercent`, `discount`, `discountExtra*` and a create-order example where `estimatedSpecialPrice` does not equal `price − discount + codFee` (`operations-contract.md §8.3`). **Fix:** define `provider_observed_discount_bps = round((price − (estimatedSpecialPrice − codFee)) × 10000 / price)` from the **seller estimate**, and store raw `discountPercent` separately for audit.

**P2-3 — Cashback instrument has no schema.** `docs/spec/02:31` defines `PENDING/RELEASED/CLAWBACK` cashback; `docs/spec/01` has no `cashback_ledger` table, nor `courier_service_catalog` (`02:9`), `audit_logs`, `users/sessions/email_otps`, or `super_admins`. **Fix:** add those tables to `01:§1` ERD (one line each).

**P2-4 — CSRF and Bearer/cookie separation unspecified.** `docs/spec/05:§2.2` defines `__Host-` cookies but no `SameSite` or Origin check; `/api/v1/*` and `/api/app/*` share `app.geraiexpress.com` (`ARCHITECTURE.md:72`). **Fix:** add to `05:§2.2`: "`SameSite=Lax` + Hono `csrf()` Origin check on `/api/app/*` and `/api/owner/*`; `/api/v1/*` and `/mcp` accept `Authorization: Bearer` only and ignore cookies."

**P2-5 — Rate-limit mechanism undeclared.** `docs/spec/05:9,49`, `docs/spec/08:24`, `09:64` assert per-IP/per-outlet limits, but `docs/spec/07:§3.1` declares no rate-limit binding and no WAF rule. **Fix:** add a `RATE_LIMITER` (Workers Rate Limiting binding) or "Cloudflare WAF rate-limit rules on `*.gerai.cc/api/public/*`, `/mcp`" to `07:§3.1`.

**P2-6 — `pay-unpaid` semantics marked as handled "cleanly" but unobserved.** `docs/spec/09:46-55`. Research: no live `pay-unpaid` call exists; idempotency on repeat, partial batch, insufficient-balance error shape, and `cnote_no` ordering are all Unknown (`operations-contract.md §7.1`). The spec does mandate per-order `GET /order?order_id=` verification (good). **Fix:** add "Unknown until M4 sandbox: repeat-call behaviour — DO must journal `pay_unpaid_in_flight` and read back before any retry."

**P2-7 — Cancellation refund modelled as `typeRefund`.** `docs/spec/09:41` "Approved Claim or Cancelled-Order Refund". Observed `typeRefund` descriptions are claim/returned-order only; `DELETE /order` refund is Unknown; only `DELETE /batch` for lion/anteraja/pos/spx documents `totalBalanceRefund` (`operations-contract.md §3.1-3.2`). **Fix:** split the row; model cancel as "read back `GET /order` `isDeleted/status`, then wait for any invoice; counter `Void` is independent."

**P2-8 — Legal citation stated as settled.** `docs/adr/ADR-0005:12` — "Permenkomdigi No. 8/2025 Art. 77 governs postal QR metadata". The research labels this a **counsel-confirm risk** (`gerai-multi-courier-product-research.md:254,320`). `docs/spec/05:3` cites "PP 33/2026" — **Unverified** (not in any research file). **Fix:** label both "pending counsel confirmation".

**P2-9 — ADR-0003 overstates Public-API egress proof.** `ADR-0003:8` "Verified in `workerd` and production read probes to not require source-IP allowlisting." Research: production **reads** from a dev machine succeeded; workerd proved reachability with an invalid key only; the label-generation error table implies a per-key IP concept exists (`operations-contract.md §10`). **Fix:** "Observed for reads; Unknown for writes and for Partner-created keys — confirm with Mengantar (Q23) before M6."

**P2-10 — Public mini-site drafts lack TTL/purge.** `docs/visual/03:27` says "dalam 48 jam"; `docs/spec/01` has no `expires_at`/purge for `entry_channel = minisite_qr` drafts, which share the slug namespace (P1-1). **Fix:** add `draft_expires_at` and a daily purge cron.

**P2-11 — Pickup time zone & lead time stated as fact.** `docs/spec/04:8` "within `09:00–18:00 WIB`". The API time zone for `POST /time` is Unknown (`operations-contract.md §2.2, Q8`). **Fix:** append "(time zone Unknown — verify in M4 sandbox; store slot as provider `_id` + echo)".

### P3 — polish

- `docs/spec/03:10` "6-char code" vs 6–7 chars elsewhere.
- `PRD.md:54,56,78` priorities (PR-09/PR-10/PR-21 = P1) conflict with `ROADMAP.md:9,11,12` and `DECISIONS.md:14,20` treating them as launch scope.
- `ROADMAP.md:8` "docs/adr/01..05" vs actual `ADR-0001..0005`.
- `docs/spec/08:67` `sync_mengantar_finance` requires only `finance:read` yet performs upstream calls; consider `finance:sync`. `08:64` `issue_paid_shipment` should set `destructiveHint`/`openWorldHint` explicitly.
- `docs/visual/01:28,32,37` contrast values drift from computed (`#7A7A7A` ≈ 4.5:1, `#0066CC` ≈ 5.7:1, `#C92A2A` ≈ 5.5:1 < claimed 5.6). All still pass AA.
- `docs/spec/02:43` `Expected_Mengantar_Debit = M + I` assumes insurance is billed inside the same `typePayment` debit — Unknown; `02:46` adds `I` to Create-Order `COD` though the docs say "Goods + Shipping + COD Fee".
- `docs/spec/09:30` omits observed invoice fields `adminCleared`, `isViolation` (`2026-09-15-…:18`).
- `docs/spec/01:34` `tier_code` and `docs/visual/02:34` "Tier GOLD → PLATINUM" have no definition anywhere.
- `docs/visual/04:§4` Dropship preset: note in product copy that the courier app may still display the outlet's `PICKUP_NAME`/`SHIPPER_NAME` to the recipient (Unknown per `operations-contract.md §9`).
- `ARCHITECTURE.md:59` — serving two SPAs (`app.`, `owner.`) from one Workers Static Assets directory requires host-based path rewriting via `env.ASSETS.fetch`; state it in `docs/spec/07`.
- `docs/spec/05:21` PBKDF2 "high-iteration" — Cloudflare Workers caps WebCrypto PBKDF2 iterations (verify current limit; 100k on Free was documented); state the exact iteration count.
- `PRD.md:11` "Rp350k–Rp10M franchise fees" and `:14` "Rp900k" starter kits — not found in the research files read (lane-b cites Rp2.5M–Rp25M+; AutoKirim Rp1.9M–25.9M). Mark source or adjust.

## Verified Strengths

- Batch code vs 24-hex `batch_id` handled correctly and consistently (`ARCHITECTURE.md:85`, `docs/spec/01:52,89`, `09:52-55`), matching the P0-2 lesson in the operations contract §7.3.
- URL-path API key redaction is an invariant in all six places it must appear (`AGENTS.md:42`, `DEC-210`, `ARCHITECTURE.md:82`, `ADR-0003:21`, `docs/spec/05:27`, `07:70`).
- Webhook contract fidelity: HMAC over `{x-timestamp}.{rawBody}`, ms timestamps, ±5 min, per-seller path token (solves the "no seller id in payload" problem), Queue decoupling against the 5 s / 20-failure rules, `x-timestamp` ordering with non-regressing terminal states.
- Integer volumetric math and 300/310 g rounding tolerance match help 5387484; `/4000` for JNE Regular and IDX Cargo correct; thermal examples (1 250 g → 1 kg, 1 500 g → 2 kg) compute correctly.
- `estimatedSpecialPrice − codFee` net-cost rule matches T-019; `subItem.amount == COD_AMOUNT − estimatedSpecialPrice` matches 554/554; `typeReconciliation` PII stripping is explicit.
- Cookie isolation via two eTLD+1 and `__Host-` prefix is correct; cashier DTO stripping is server-side in `02:§5`/`05:§1`.
- 58 mm layouts in `docs/visual/04` are exactly 32 columns per line (checked every line of §2.1 and §2.2); barcode quiet-zone and borderless rule are sound for 384-dot printers.
- No public top-up/withdraw endpoint is assumed anywhere; `09:37` explicitly notes top-up is seller-initiated in Mengantar.
- 6-menu / 5-menu navigation and `Kontak > Pengirim / Penerima` are identical across README, DEC-212/213, spec 06, visual 01/02/06.

## Unverified External Dependencies

- Mengantar: `/invoices` ordering and `balanceAmount` running-balance semantics; `pay-unpaid` idempotency/partial batch; `DELETE /order` refund; cargo COD pricing; whether estimate applies weight rounding to decimal kg; POD photo availability; `DESTINATION_CODE` on create; per-courier `scheduledPickup`/`dropOff` support and `POST /time` time zone; production webhook enablement for Partner-created sellers; Public-API IP restriction for writes; receiver-score whitelist.
- Cloudflare: "first 100 custom hostnames free" (`ADR-0002:20`, `ARCHITECTURE.md:64`) and PBKDF2 iteration cap — not verifiable from files on disk.
- Legal: Permenkomdigi 8/2025 Art. 77 applicability to locally printed labels; "PP 33/2026" citation.