# M0 Specification Review — Round 2 Verification (`geraiexpress-cfv2`)

- **Reviewer:** `reviewer-fable` (read-only audit)
- **Date:** 2026-11-12
- **Baseline:** `docs/review/2026-11-12-fable-round1-review.md` (9 × P1, 11 × P2, 12 × P3)
- **Scope re-read:** `PRD.md`, `DECISIONS.md`, `ROADMAP.md`, `ARCHITECTURE.md`, `docs/adr/ADR-0003..0005`, `docs/spec/01..09`, `docs/visual/01..06`, `README.md`. Every verdict below was checked against the file on disk; research notes are not present under this repo and were not re-read (Round 1 citations stand as the evidence basis).

## Decision: REQUEST_CHANGES (narrow — one mechanical regression; all Round 1 P1/P2 items are resolved)

## Summary

All 9 P1 and all 11 P2 findings are resolved, and the fixes are consistent across the owning files (schema → ADR → PRD → DECISIONS → wireframes). The P3 list is also cleared. The P1-1 fix (slug promoted from 6–7 chars to a fixed **7-char** CSPRNG Crockford Base32 string, per-tenant PK) was applied to the normative files but **not to the worked examples**: 20+ places still show the 6-char `8k4m2p` / `8K4M2P`, including the 58 mm receipt layout whose tracking-URL line is exactly 32 columns with the 6-char value and therefore **overflows to 33 columns with the now-mandated 7-char slug**. Because spec 07 §5.1 makes the 32-col ESC/POS layout a snapshot-tested artifact and spec 08 ships the 6-char value as the OpenAPI example, this needs one mechanical pass before M1. Everything else is P3 polish.

## Round 1 Resolution Matrix

| ID | Status | Evidence (file:line) |
|---|---|---|
| P1-1 slug scope/CSPRNG/case | **Resolved** | `docs/spec/01:25,55` PK `(tenant_id, slug)`, `crypto.getRandomValues`, Super Admin returns `(tenant.slug, shipment.slug)`; `ADR-0004:16` regenerate on UNIQUE conflict; `docs/spec/06:26,32` `30^7` per tenant, `LOWER(destinationMark) == slug`; `DECISIONS.md:17`, `PRD.md:50` aligned. (See **R2-1** for example drift.) |
| P1-2 float `COD_FEE` | **Resolved** | `docs/spec/09:29` `cod_fee_raw_text` TEXT, money columns integer only; `docs/spec/01:54` `cod_service_fee_idr` "sourced strictly from integer seller-estimate `codFee`"; `01:56` `provider_cod_fee_raw_text`; `01:50` `cod_fee_idr` on `quote_snapshots` from estimate. |
| P1-3 balance leak to cashier | **Resolved** | `docs/spec/09:47-50` boolean `balance_sufficient`; Kasir copy has no figures; consistent with `docs/spec/02:67`, `05:17`. |
| P1-4 upstream-field grounding | **Resolved** | POD: `DECISIONS.md:13`, `PRD.md:77`, `docs/spec/05:13,50`, `06:70`, `docs/visual/03:44` all "if supplied by upstream"; Sorting code: `docs/spec/01:56`, `docs/visual/04:13` fallback `█ COBLONG 40132 █` never invented; Pickup: `docs/spec/04:9` `tenant_courier_prefs.pickup_mode`, `01:19`, `PRD.md:52`, `docs/visual/05:23`; COD risk: `docs/spec/03:23` local counters first + whitelist-gated enrichment, `docs/visual/05:23` `⚪ Riwayat Baru`. |
| P1-5 cargo COD | **Resolved** | `docs/spec/02:19-21` NON_COD only, `cargoEstimatedPrice == cargoPrice`; `PRD.md:52`; `docs/visual/05:22`. |
| P1-6 weight sent upstream | **Resolved** | `docs/spec/02:16-17` integer `billed_kg` for ≥ 1000 g on estimate and order; echo stored in `provider_echoed_weight_kg_text` (`01:56`). (Residual gap in R2-4.) |
| P1-7 unbounded backfill | **Resolved** | `docs/spec/09:59-62` 5-page cap, assumption labelled for M4, daily `keyword`/`dateRange` rescan of pending rows. |
| P1-8 webhook provisioning | **Resolved** | `docs/spec/01:39` `webhook_state` enum; `PRD.md:44` PR-02b hourly `GET /order` floor; `ADR-0004:19` atomic `callbackSecret` persist; `docs/visual/06:99` webhook status. |
| P1-9 `EMAIL_ALREADY_REGISTERED` | **Resolved** | `docs/spec/01:39` `existing_account_required`, `byok_connected`; `PRD.md:43` BYOK or email correction, never blind retry. |
| P2-1 bundle-derived types | **Resolved** | `docs/spec/09:33-39` Provenance column; unknown type → `Selisih Sync`; `PRD.md:61`, `DECISIONS.md:22`, `ROADMAP.md:11` say "observed 5 + bundle/unknown fallback". |
| P2-2 `provider_observed_discount_bps` | **Resolved** | `docs/spec/02:28` formula from seller estimate; `raw_discount_percent` stored (`01:50`). |
| P2-3 missing tables | **Resolved** | `docs/spec/01:11,31` `users/sessions/email_otps/super_admins/courier_service_catalog/audit_logs/cashback_ledger`. |
| P2-4 CSRF / Bearer split | **Resolved** | `docs/spec/05:26-29` `SameSite=Lax`, Origin/CSRF check, Bearer-only on `/api/v1/*` and `/mcp`. |
| P2-5 rate-limit binding | **Resolved** | `docs/spec/07:41` `RATE_LIMITER` + WAF rules; referenced by `09:58`. |
| P2-6 `pay-unpaid` unknowns | **Resolved** | `docs/spec/09:52` `pay_unpaid_in_flight` journal + read-back before retry. |
| P2-7 cancel refund | **Resolved** | `docs/spec/09:37` `DELETE /order` refund Unknown; `GET /order` `isDeleted/status` first; counter `Void` independent. |
| P2-8 legal citations | **Resolved** | `ADR-0005:11` "Pending Counsel Confirmation"; `docs/spec/05:3` now UU PDP 27/2022 + pending counsel (the unverifiable "PP 33/2026" is gone). |
| P2-9 egress claim | **Resolved** | `ADR-0003:8` observed for reads; writes/Partner keys = M6 item (Q23). |
| P2-10 draft TTL | **Resolved** | `docs/spec/01:55` `draft_expires_at` +48 h, daily purge Cron. |
| P2-11 pickup TZ | **Resolved** | `docs/spec/04:10` TZ verified in M4, stored as provider `_id` + raw echo. |
| P3 (all 12) | **Resolved** | `03:10` 7-char; `PRD.md:55,56,79` PR-09/10/21 = P0; `ROADMAP.md:8` `ADR-0001..0005`; `08:33,61,67,70` `finance:sync` + `destructiveHint/openWorldHint`; `visual/01:29-33` 4.4/5.5/5.5; `02:43` debit `= M` (+I conditional); `09:27` `adminCleared/isViolation`; `01:38` `tier_code` enum + thresholds; `visual/04:158` dropship transparency note; `07:42` dual-SPA `env.ASSETS.fetch`; `05:18` PBKDF2 100,000; `PRD.md:17` Rp899k–Rp25.9M. |

## Findings (new / residual)

### P2

**R2-1 — 7-char slug not propagated to examples; 58 mm receipt URL line now overflows 32 columns.**
- Normative: 7 chars fixed (`DECISIONS.md:17`, `PRD.md:50`, `docs/spec/01:55`, `06:26`, `ADR-0004:16`).
- Still 6-char in examples: `docs/visual/02:40,48`; `docs/visual/03:36,38,39` (Tab 2 uses `8k4m2p` while Tab 3 at `:41-42` uses `8k4m2p7` in the same file); `docs/visual/04:16,53,66,83,84,134` (while `:154` says `INV: 8K4M2P7`); `docs/visual/05:13,14,31,98,118`; `docs/visual/06:17,21,80`; `docs/spec/03:33`; `docs/spec/06:69`; `docs/spec/07:60,67`; `docs/spec/08:18,48`.
- Concrete defect: `docs/visual/04:83` `berkahjaya.gerai.cc/lacak/8k4m2p` is exactly 32 columns; the mandated `8k4m2p7` yields 33 → wraps/clips on 384-dot printers, contradicting the "`32-Col Exact Layout`" heading (`:38`) and the snapshot-test gate in `docs/spec/07:71`. `docs/visual/04:53` (`Kota Bandung         INV: 8K4M2P`) also needs one fewer pad space. Tenant slugs are allowed up to 30 chars (`docs/spec/01:38`), so the URL line needs a wrap rule in any case.
- `docs/spec/08:18,48` ship `"8k4m2p"` as the OpenAPI example — an M1 Zod `length(7)` validator would reject the documented example.
- **Smallest fix:** global replace `8k4m2p`→`8k4m2p7` / `8K4M2P`→`8K4M2P7` in the files above; in `docs/visual/04` §2.1 split the URL into two lines (`berkahjaya.gerai.cc/lacak/` ⏎ `8k4m2p7`) or add to §1.4: "tracking URL wraps at `/lacak/` when `len(host)+7+8 > 32`"; re-pad `:53` to 8 spaces.

### P3

**R2-2 — Copy/state-name drift for the low-balance case.** `docs/spec/07:67` error message says "Menunggu Pembayaran" and instructs "isi saldo Mengantar lalu klik Bayar Sekarang" (owner-oriented), whereas `docs/spec/09:50`, `06:44`, `docs/visual/01:32`, `06:14,23` use "Menunggu Saldo" and the cashier-safe wording. **Fix:** align `07:67` to "Menunggu Saldo" and note the message is role-projected per `09:§3.1`.

**R2-3 — Sorting-code read-back timing is implied but not specified.** `docs/visual/05:100` shows `Kode Sortir : BDO-CBL02` on the immediate post-issue screen and `docs/visual/04:13` prints it on the label, but no spec states that `GeraiVaultDO` performs `GET /order?order_id=` synchronously between `POST /order` success and print (`docs/spec/09:52` only mandates read-back for `pay-unpaid`; `ADR-0004:15` is silent). **Fix:** add one line to `docs/spec/03:§1` or `ADR-0004:15`: "after `POST /order` success the DO reads back `GET /order?order_id=` once (≤ 15 s budget) to populate `sorting_code`; on timeout print the subdistrict/postcode fallback and backfill asynchronously."

**R2-4 — Sub-1 kg parcel on a 1 kg-minimum courier is unspecified.** `docs/spec/02:16` covers `>= 1000 g`; `:17` covers "sub-kilogram services" only. What is sent for 800 g on J&T/SiCepat (min 1 kg) is not stated, although `route_min_weight_gram` exists (`01:50`). **Fix:** add "otherwise `billed_kg = max(1, …)` / send `route_min_weight_gram / 1000`".

**R2-5 — DEC-203 / ADR-0003 not amended for BYOK.** `DECISIONS.md:9` and `ADR-0003:13` still say every outlet is Partner-provisioned with `externalUserId = tenant.id`; `PRD.md:43` and `docs/spec/01:39` now allow `byok_connected` (no Partner-side `externalUserId`). **Fix:** append "(or BYOK fallback per PR-02; BYOK rows have `external_user_id = NULL` and are excluded from `POST /sellers/list` reconciliation)".

**R2-6 — Hourly `GET /order` polling floor exists only in PRD.** `PRD.md:44` makes it the authoritative status source until `webhook_state = active`; `ARCHITECTURE.md:63` Cron list mentions only `/invoices` reconciliation and stuck-dispatch sweeps; `docs/spec/01:28` says "polling" without cadence. **Fix:** add the hourly status poll to `ARCHITECTURE.md:63`.

**R2-7 — Column name drift.** `docs/spec/09:21` uses `expected_mengantar_debit_idr`, which is not a column in `docs/spec/01:58` (closest: `gerai_shipping_cost_idr`). **Fix:** use the schema name or add the column.

**R2-8 — Example ledger arithmetic.** `docs/visual/06:84-85`: `typeAddBalance +500.000 → 364.000` implies a prior balance of −136.000 on a prepaid account. **Fix:** change the post-top-up running balance to `Rp 864.000` and the preceding rows accordingly (or drop the row).

**R2-9 — Wording.** `docs/spec/04:10` "timezone interpretation is verified in M4 sandbox" reads as present-tense fact; use "is to be verified". `docs/visual/03:29` marketing bullet "Reguler, Cargo & COD" is fine as copy but should not be read as cargo-COD support (see `docs/spec/02:21`).

## Verified Strengths (Round 2)

- No contradiction between `AGENTS.md §3.3/3.4` and the fixes: cashier DTO stripping (`02:§5`, `05:§1`, `09:§3.1`) and DO routing of slug allocation/`pay-unpaid` (`ADR-0004`, `ARCHITECTURE.md:61`) remain consistent.
- Integer-money invariant is now airtight on provider floats: `cod_fee_raw_text` / `provider_cod_fee_raw_text` are TEXT; every `_idr` column names an integer source.
- Provenance discipline is applied uniformly: Observed vs bundle-derived vs Unknown is labelled in `09:§2.2`, `ADR-0003:8`, `ADR-0005:11`, `02:21`, `04:10`, `09:52,60`.
- `tier_code` (`01:38`) and `docs/visual/02:34` (`GOLD → PLATINUM`) now agree; 6/5-menu navigation unchanged and consistent.
- The 32-col 58 mm layout remains exact on every line **except** the two lines flagged in R2-1.

## Unverified External Dependencies (unchanged from Round 1)

- Mengantar: `/invoices` ordering & `balanceAmount` monotonicity (now explicitly an M4 assumption); `pay-unpaid` idempotency; `DELETE /order` refund; cargo COD; estimate-side weight rounding; POD asset availability; `DESTINATION_CODE` latency after create; per-courier pickup modes & `POST /time` TZ; production webhook enablement for Partner-created sellers; Public-API IP policy for writes; receiver-score whitelist.
- Cloudflare: custom-hostname quota (now flagged "verify at M6" in `ADR-0002:20`, `ARCHITECTURE.md:64`); PBKDF2 100 k iteration ceiling (`05:18` asserts "verified" — not verifiable from files on disk).
- Legal: Permenkomdigi 8/2025 Art. 77 and UU PDP implementing rules — both correctly marked pending counsel.