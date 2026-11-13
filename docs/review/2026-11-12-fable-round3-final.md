# M0 Specification Review — Round 3 Final Verification (`geraiexpress-cfv2`)

- **Reviewer:** `reviewer-fable` (read-only audit)
- **Date:** 2026-11-12
- **Baseline:** `docs/review/2026-11-12-fable-round2-review.md` (R2-1 P2; R2-2..R2-9 P3)
- **Method:** Every R2 item re-read from the file on disk; a repo-wide case-insensitive grep for `8k4m2p` confirmed no remaining 6-char example outside the historical review files; the 58 mm receipt in `docs/visual/04 §2.1/§2.2` was re-counted line by line for ≤ 32 columns.

## Decision: APPROVE

## Summary

R2-1 is fully resolved: all 7-char `INV` examples (`8k4m2p7` / `8K4M2P7`) are now consistent across `DECISIONS.md`, `PRD.md`, `docs/spec/01,03,06,07,08`, and `docs/visual/02,03,04,05,06`; the 58 mm receipt is exact at ≤ 32 columns on every line, and a normative two-line URL wrap rule was added. R2-2 through R2-9 are all resolved with no new contradictions introduced. The only residuals are three P3 polish items (one typo, one incomplete bound in the wrap rule, one cosmetic centring offset) that do not block M1.

## Round 2 Resolution Matrix

| ID | Status | Evidence (file:line) |
|---|---|---|
| **R2-1** 7-char slug examples + 32-col receipt + URL wrap | **Resolved** | Grep for `8k4m2p`/`8K4M2P` (case-insensitive) returns only 7-char forms outside `docs/review/*`. OpenAPI examples: `docs/spec/08:18,48` `"8k4m2p7"`. Receipt: `docs/visual/04:54` `Kota Bandung        INV: 8K4M2P7` = 12+8+12 = **32**; `:84-86` URL split into `     berkahjaya.gerai.cc` (24) / `        /lacak/8k4m2p7` (22) / `[ QR 8K4M2P7 ]` row = 32. Wrap rule added at `docs/visual/04:21` ("always splits across two centered lines … `/lacak/<7-char-slug>` on line 2"). All other §2.1/§2.2 lines re-counted: `KEC. COBLONG, KOTA BANDUNG 40132` 32, `TOKO HIJAB NISA (0812-3456-7890)` 32, `Berat : 1.200 g (Tagih: 2.000 g)` 32, `Ukuran: 30x20x15 cm \| Asuransi:-` 32, `*Wajib video utuh saat buka pkt*` 32, `Tujuan   : Rina K. (Coblong BDG)` 32, money rows 32, `*Dilarang buka sblm bayar kurir*` 32, COD banner `█  COD - TAGIH: Rp 167.560     █` 32, ` Simpan struk ini sbg bukti sah ` 32. A6 label `:136` `INV:8K4M2P7` cell width matches the `[QR LACAK]` cell. Other 7-char examples valid Crockford: `5N7R3V4`, `2K9P4M8` (`docs/visual/06:74,84`). |
| **R2-2** low-balance copy drift | **Resolved** | `docs/spec/07:67` now "Menunggu Saldo (INV 8K4M2P7) — silakan beri tahu pemilik gerai"; `:70` notes role projection per `09 §3.1`. Matches `09:50`, `06:44`, `visual/01:32`, `visual/06:14,23`. |
| **R2-3** sorting-code read-back timing | **Resolved** | `ADR-0004:15` "Immediately after a paid `POST /order` succeeds, performs one bounded `GET /order?order_id=` read-back (`<= 5s` budget) … on timeout prints the subdistrict/postcode fallback immediately and backfills asynchronously." Consistent with `docs/spec/01:56`, `docs/visual/04:13`, `visual/05:100`; 5 s sits inside the DO's 15 s `AbortSignal` ceiling (`ADR-0004:28`). |
| **R2-4** sub-1 kg on 1 kg-min courier | **Resolved** | `docs/spec/02:18`: `route_min_weight_gram < 1000` → decimal kg; `route_min_weight_gram == 1000` → integer `billed_kg = 1`. Echo stored in `provider_echoed_weight_kg_text`. |
| **R2-5** DEC-203 / ADR-0003 BYOK | **Resolved** | `DECISIONS.md:9` and `ADR-0003:13` both add BYOK fallback with `external_user_id = NULL` excluded from `sellers/list` sweeps; aligned with `PRD.md:43`, `docs/spec/01:43`. |
| **R2-6** hourly `GET /order` poll in ARCHITECTURE | **Resolved** | `ARCHITECTURE.md:38` "Hourly Order Status Sweep"; `:63` "hourly `GET /order` status polling floor (authoritative whenever `webhook_state != 'active'`)". Matches `PRD.md:44`. |
| **R2-7** column name drift | **Resolved** | `docs/spec/09:21` now `counter_total_paid_idr - gerai_shipping_cost_idr`; both exist in `docs/spec/01:59`. `expected_mengantar_debit_idr` no longer appears (only the formula symbol `Expected_Mengantar_Debit` in `02:44`, which is not a column). |
| **R2-8** ledger arithmetic | **Resolved** | `docs/visual/06:80-87` chronological: 14.000 +500.000 → 514.000; −14.000 → 500.000; +434.200 → 934.200; −19.200 → 915.000. Header card `:71` `Rp 915.000`; `Saldo Aman` 915.000 − 75.000 = 840.000 ✓. |
| **R2-9** wording | **Resolved** | `docs/spec/04:13` "is to be verified in M4 sandbox". `docs/visual/03:28` marketing bullet left as-is — acceptable per the Round 2 note ("fine as copy"); cargo COD exclusion remains normative in `docs/spec/02:21`. |

## Findings (residual, non-blocking)

### P3

**R3-1 — URL wrap rule bound does not cover the full tenant-slug range.** `docs/visual/04:21` guarantees no clipping for "tenant slugs up to 23 chars (or wrapped custom domains)", but `docs/spec/01:41` and `docs/spec/06:18` allow `3–30` chars; a 24–30-char slug yields a 33–39-col host line. **Smallest fix:** extend the sentence: "hosts longer than 32 chars (24–30-char slugs or long custom domains) wrap at the last `.` before column 32, identical to custom domains" — or cap `gerai-slug` at 23 chars in `docs/spec/06:18`/`01:41`.

**R3-2 — Typo.** `ARCHITECTURE.md:63` `'active'),stuck-dispatch` — missing space after the comma.

**R3-3 — Cosmetic centring in the illustrative receipt.** `docs/visual/04:84-86` lead with 5/8/8 spaces where true centring on 32 cols is 6/9/9. Harmless because ESC/POS `ESC a 1` centres at runtime and no line exceeds 32, but the snapshot fixture should use the centred values to avoid a one-column churn in `docs/spec/07:71` snapshot tests.

## Verified Strengths (Round 3)

- No regressions: `AGENTS.md §3.3/3.4` invariants (integer `_idr`/`_gram`/`_bps`, cashier DTO stripping, DO-routed dispatch/slug/`pay-unpaid`) are unchanged and still cross-referenced consistently (`02 §5`, `05 §1`, `09 §3.1`, `ADR-0004`, `ARCHITECTURE.md:61`).
- The R2-3 fix is correctly scoped to "paid" `POST /order` success; `provider_unpaid_hold` orders already have the mandatory post-`pay-unpaid` read-back (`09:52`), so there is no path that prints a sorting code without a `GET /order` read.
- Slug normative definition (7-char, CSPRNG, Crockford no `0/O/1/I/L/U`, `(tenant_id, slug)` PK, case-insensitive `destinationMark`) is identical in `DECISIONS.md:17`, `PRD.md:50`, `docs/spec/01:55`, `06:26-32`, `ADR-0004:16`, and every example now satisfies the alphabet and length.
- Dual-book provenance labels (Observed / bundle-derived / Unknown) are intact in `09 §2.2`, `02:21`, `04:13`, `09:52,60`.

## Unverified External Dependencies (unchanged)

- Mengantar: `DESTINATION_CODE` availability within 5 s of `POST /order` (the `ADR-0004:15` budget is an assumption to validate in M4); `/invoices` ordering and `balanceAmount` monotonicity; `pay-unpaid` idempotency; `DELETE /order` refund; cargo COD; estimate-side weight rounding for decimal kg; POD asset; per-courier pickup modes and `POST /time` TZ; Public-API IP policy for writes.
- Cloudflare: custom-hostname quota (M6); PBKDF2 100 k iteration ceiling (`05:18`).
- Legal: Permenkomdigi 8/2025 Art. 77 and UU PDP implementing rules — pending counsel.