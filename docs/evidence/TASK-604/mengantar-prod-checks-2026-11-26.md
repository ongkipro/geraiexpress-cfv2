# TASK-604 live Mengantar production API verification (2026-11-26)

- **Target:** Live production Mengantar Public API (`https://api-public.mengantar.com`), executed under explicit owner authorization using the device-local production demo seller key via `secrets-env run`.
- **Safety & hygiene:** Zero API keys, raw keyed URLs, real customer/seller names, phone numbers, addresses, or AWB/order identifiers are recorded below. Zero `POST /order` calls and zero balance-debiting calls were issued (the demo account holds real balance `Rp10.500`).
- **Timestamp:** `2026-11-26T11:22–11:26Z` (`18:22–18:26 WIB`).

---

## Summary Matrix (4 Blocker Checks + Discovered Production Drifts)

| Check (`STATUS.md` Blockers) | Live Prod Result | Code / Spec Impact |
|---|---|---|
| **1. Weight echo & rounding** (`/order/estimate` + historical `GET /order`) | Verified across 16 weights (`0.4`..`10` kg) on 9 regular + 4 cargo couriers and 20 historical `GET /order` rows. | **Drift #1 (P2):** `SAP` and `spx` round up at `1.30 kg` (tolerance `299 g`, not `300 g`); `lion` rounds up at `1.31 kg` (`<= 305 g`, not `<= 310 g`). `iDexpress` exposes live `≤ 0.50 kg` sub-kg pricing (`iDlite`), unused while `min_weight_gram` is `NULL`. |
| **2. `POST /time` timezone & format** | Verified via `GET /time` + 10 `POST /time` probes (past, future, single-digit vs two-digit hour). | **SDK MATCH:** `POST /time` rejects `"9:00"` (`400 Time allowed 09:00..20:00`), accepts `"09:00".."20:00"`, returns `data._id`. `POST /time` itself accepts past dates (`200`), while `GET /time` filters by **WIB** and hides past WIB slots (`11-26-2026 14:00` hidden at `18:25 WIB`, `11-27-2026 09:00/10:00` shown). SDK `nextPickupSlot` (WIB ≥ 120 min, two-digit `09:00..18:00`) is safe. |
| **3. `GET /invoices` ordering, `balanceAmount` monotonicity & `dateRange`** | Verified across 200 live invoices (4 pages, `size=50`, `nextCursor`, 198 `statusCleared`, 2 `statusExpired`). Strictly newest-first (`0` descending violations); newest cleared `balanceAmount` matches top-level `balance` (`10500`). | **4 CRITICAL P1 DRIFTS CAUGHT:**<br>• **Drift #2 (P1):** `balanceAmount` is a non-integer float in **137/200 (68.5%)** of live rows (e.g. `604623.6478313487`) — `finance/index.ts` `int()` rejects floats and stores `NULL`!<br>• **Drift #3 (P1):** Live sign convention differs from mock/tests (`typePayment` & `typeWithdraw` have **positive** `amount` while debiting balance; `typeRefund` claim credits have **negative** `amount` while crediting balance; `typeAddBalance` credits `total`, not `amount`) — `settleBalance()` flags 167/197 pairs as false `balance_gap` and UI displays debits in green `+`!<br>• **Drift #4 (P1):** `GET /invoices` `dateRange` with identical `YYYY-MM-DD` dates (`{"startDate":"2026-10-07","endDate":"2026-10-07"}`) returns **0 rows** on live prod (needs full ISO timestamps `T00:00:00.000Z..T23:59:59.999Z` or wide range) — breaks `pending_rescan`!<br>• **Drift #5 (P2):** Live `DELETE /order` cancellation refund observed (`type: "typeRefund"`, positive `amount`, `"Return for deleted Non-COD order <ORDER_ID> from batch <BATCH>"`) — `finance/index.ts` regex `/order\s+([A-Za-z0-9-]+)\s*$/i` fails to match trailing `from batch ...` and would wrongly call `markClaimPaid` if matched! |
| **4. `POST /order/pay-unpaid` & unpaid hold** | Probed non-existent 24-hex `batch_id` (`400 "batch not found"`, 55 ms) + **owner-approved zero-debit live probe**: `POST /order` JNE 3 kg Non-COD `dropOff` (`Rp31.500 > Rp10.500`) → `200` `isPaid: false`, `cnote_no: null`, `batch_id` 24-hex, `WEIGHT: 3`; idempotent replay confirmed (`Idempotent-Replayed: true`, identical `ORDER_ID`); `POST /order/pay-unpaid` × 2 → `400 {"success":false,"message":"balance is not enough"}` (`code` omitted); `GET /order` read-back confirmed `isPaid: false`; `DELETE /order` deleted cleanly (`deletedCount: 1`); final balance unchanged (`Rp10.500`). | **Drift #6 (P1/P2) caught & fixed:** live `pay-unpaid` returns `HTTP 400` with `message: "balance is not enough"` and **no `code` field** (`e.code === null`), so checking only `e.code === "INSUFFICIENT_BALANCE"` missed it. Now mapped to `402 INSUFFICIENT_BALANCE` with Indonesian copy. Paid repeat-call idempotency remains guarded as non-idempotent by `GeraiVaultDO` fence + journal + read-back (to be verified on clean Rp0 pilot account). |

---

## Detailed Evidence

### 1. Weight Echo & Rounding (`GET /order/estimate`, Jakarta → Coblong, Bandung)

- **Rate keys returned by `courier=all`:** `JNE`, `JNECargo`, `SiCepat`, `SiCepatCargo`, `SAP`, `SAPLite`, `SapCargo`, `iDexpress`, `iDlite`, `JT`, `lion`, `iDexpressCargo`, `anteraja`, `spx`, `pos` (note: `SapCargo` is camelCase; `SAP` is uppercase — covered by `RATE_KEY_ALIASES`).
- **Weight echo:**
  - `GET /order/estimate`: echoed selectively (`JNE`, `SiCepat`, `SiCepatCargo` echo string `"0.4"`; `SAP` echoes `0.5`; `SapCargo` echoes `inputWeight`/`chargedWeight`; `anteraja` echoes `1` for `<1 kg` and decimal above; `JT`, `iDexpress`, `lion`, `spx`, `pos` omit `weight`).
  - Historical `GET /order` (`20` rows): `WEIGHT` is returned as a JSON number in kg (`1`, `0.5`, `0.2`, `0.05`); `COD_FEE` is returned as a non-integer float (e.g. `3354.8750999999997`), confirming `OrderItemSchema` and `cod_fee_raw_text`.
- **Fine-grained rounding boundary (`price` in Rp, regular services):**

| Courier | `0.5` kg | `0.51` kg | `1.0` kg | `1.29` kg | `1.30` kg | `1.305` kg | `1.31` kg | Observed Tolerance | Current Catalog (`0007`) |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| `JNE` | 11,000 | 11,000 | 11,000 | 11,000 | 11,000 | **22,000** | 22,000 | `300 g` | `300 g` (OK) |
| `SiCepat` | 8,500 | 8,500 | 8,500 | 8,500 | 8,500 | 8,500 | **17,000** | `305–309 g` | `300 g` (OK, safe) |
| `SAP` | 9,000 | 9,000 | 9,000 | 9,000 | **18,000** | 18,000 | 18,000 | **`299 g` (`< 1.30`)** | **`300 g` (DRIFT)** |
| `iDexpress` | **14,400** | 19,500 | 19,500 | 19,500 | 19,500 | **39,000** | 39,000 | `300 g` + `≤ 500 g` tier | `300 g`, `min=NULL` |
| `JT` | 18,000 | 18,000 | 18,000 | 18,000 | 18,000 | **36,000** | 36,000 | `300 g` | `300 g` (OK) |
| `lion` | 22,320 | 22,320 | 22,320 | 22,320 | 22,320 | 22,320 | **44,640** | **`< 310 g` (`305–309 g`)** | **`310 g` (DRIFT)** |
| `anteraja` | 9,000 | 9,000 | 9,000 | 9,000 | 9,000 | **18,000** | 18,000 | `300 g` | `300 g` (OK) |
| `spx` | 17,700 | 17,700 | 17,700 | 17,700 | **35,400** | 35,400 | 35,400 | **`299 g` (`< 1.30`)** | **`300 g` (DRIFT)** |
| `pos` | 19,000 | 19,000 | 19,000 | 19,000 | 19,000 | **38,000** | 38,000 | `300 g` | `300 g` (OK) |

- **Additional estimate checks confirmed:**
  - `COD_AMOUNT=100000`: `codFee` returned as exact integer `3329` across all couriers; `estimatedSpecialPrice - codFee == provider_net`; `JT` and `spx` return `discountPercent: 30` + `discountExtraPercent: 5` (total `35%`, confirming `TASK-708` ±Rp1 snap); flat-promo routes (`JNE`, `SiCepat`, `SAP`, `anteraja`) return `discountPercent: 0, discount: 500` (handled cleanly by `preciseObservedBps` fallback).
  - `isDangerousGoods=true`: only `SiCepat` and `iDexpress` return `isDangerousGoodsSupported: true` (exact match with `0018_courier_v2_limits.sql`).
  - `spx.pickupSchedule`: returned `YYYY-MM-DD` keyed slot array (`[{"timeRangeId":1,"start":"14:00","end":"22:00","timeEpoch":1795770000}]`), matching `CourierRateSchema`.
  - Cargo isolation validated: on COD estimates, `SiCepatCargo.estimatedPrice`/`estimatedSpecialPrice` mirror regular SiCepat values while cargo fields remain separate — confirming spec 02 §1.4 cargo-only field reads and Non-COD enforcement.

### 2. `GET /invoices` Ordering, Sign Convention, Float `balanceAmount` & `dateRange`

- **Pagination & ordering (200 rows across 4 pages, `size=50`):**
  - Strictly newest-first across all 200 rows and 3 cursor transitions (`0` descending violations).
  - Types observed: `typeRefund` (95), `typePayment` (82), `typeReconciliation` (8), `typeWithdraw` (8), `typeAddBalance` (6 — 4 `statusCleared`, 2 `statusExpired`), plus `1` oldest anchor row.
  - Sub-item integer hygiene: `subItem.amount` integer in `23/23` rows; `subItem.COD_FEE` non-integer float in `6/6` COD reconciliation sub-items (confirming spec 09 §2.1).
  - Top-level numeric types across 200 rows: `amount` integer `200/200`, `total` integer `200/200`, **`balanceAmount` integer `63/200` and non-integer float `137/200` (`68.5%`)** (recurring `.6478313487` / `-.3521686513` residue from Mengantar's internal floating-point `COD_FEE` accounting, occasionally reset/truncated on subsequent ledger rows).
- **Observed sign convention (`deltaBal = cur.balanceAmount - prev.balanceAmount`):**
  - `typePayment` (`82/82` positive `amount`, `subItems[].amount` negative on Non-COD batches): **debits** balance (`deltaBal ≈ -amount`).
  - `typeWithdraw` (`8/8` positive `amount`): **debits** balance (`deltaBal ≈ -amount`).
  - `typeRefund` — Claim approved (`94/95` negative `amount`): **credits** balance (`deltaBal ≈ -amount = +|amount|`).
  - `typeRefund` — Deleted Non-COD order (`1/95`, positive `amount`, `"Return for deleted Non-COD order <ORDER_ID> from batch <BATCH>"`): **credits** balance (`deltaBal ≈ +amount = +|amount|`).
  - `typeReconciliation` (`8/8` positive `amount`): **credits** balance (`deltaBal ≈ +amount`).
  - `typeAddBalance` (`4/4` cleared positive `amount` & `total`, where `total > amount`): **credits** balance by **`+total`** (not `amount`).
- **`dateRange` filter probes against newest invoice (`2026-10-07T04:26:37.939Z`):**
  - `{"startDate":"2026-10-07","endDate":"2026-10-07"}` → `200`, **`count: 0`** (parsed as `[00:00:00Z, 00:00:00Z]`).
  - `{"startDate":"2026-10-07T00:00:00.000Z","endDate":"2026-10-07T23:59:59.999Z"}` → `200`, **`count: 1`**.
  - `{"startDate":"2026-10-06","endDate":"2026-10-08"}` → `200`, **`count: 1`**.
  - `{"startDate":"10-07-2026","endDate":"10-07-2026"}` → `200`, **`count: 0`**; wide `10-06..10-08` → `count: 1`.

### 3. `POST /time` & `GET /time` Timezone Contract

- `POST /time` with single-digit `"9:00"` → `400 {"success":false,"message":"Time allowed 09:00, 10:00, 11:00, 12:00, 13:00, 14:00, 15:00, 16:00, 17:00, 18:00, 19:00, 20:00"}`.
- `POST /time` with `"09:00"` / `"10:00"` on `11-27-2026` → `200`, `data._id` returned, `data.date: "2026-11-27T00:00:00.000Z"`, `data.time: "09:00"` / `"10:00"`.
- `POST /time` does not reject past dates (`11-25-2026 15:00`, `11-26-2026 10:00`, `11-26-2026 14:00` all returned `200`), **but `GET /time` filters by WIB**: at `18:25 WIB` (`11:25 UTC`), `11-26-2026 14:00` (past in WIB, +2.5 h in UTC) was omitted by `GET /time`, while `11-27-2026 09:00` and `10:00` were returned (`date: 1795770000000` / `1795773600000`).

- **`iDexpress` sub-kg (`iDlite`) evaluation:** live `GET /order/estimate?courier=iDexpress&weight=0.5` returns `price: 14400`, `estimatedSpecialPrice: 12960`, **`discountPercent: 10`** (for both Non-COD and COD), vs `discountPercent: 30` at `>= 0.6 kg`. Because `iDlite` uses a 10% discount under the same `iDexpress` key, `min_weight_gram` stays `NULL` (1 kg minimum) so TASK-207 discount verification never raises false `Selisih` alerts on `iDexpress`.

---

## Code & Spec Remediation Applied (2026-11-26, branch `fix/mengantar-prod-drifts`)

1. **`apps/worker/src/do/gerai-vault/finance/index.ts` (Drifts #2, #3, #5 — FIXED):**
   - Added `roundIdr()` for `balanceAmount` / top-level `balance` (preserving raw floats in `raw_json` and `NULL` when absent), `signedAmountIdr()` for per-type signed cashflow normalization (`typeAddBalance -> +|total ?? amount|`, `typePayment`/`typeWithdraw -> -|amount|`, `typeRefund -> +|amount|`), ±Rp1 running-balance tolerance in `settleBalance()` (verified **0/197 false gaps** across 200 live prod invoices), and `DELETE /order` `typeRefund` matching (`/order\s+([A-Za-z0-9-]+)/i`, skipping `markClaimPaid` when description matches `deleted ... order`).
2. **`apps/worker/src/do/gerai-vault/index.ts` & `apps/worker/src/mengantar/mock.ts` (Drifts #4, #6 — FIXED):**
   - `pending_rescan` now sends full ISO UTC day bounds (`T00:00:00.000Z..T23:59:59.999Z`) and upgrades any previously saved bare `YYYY-MM-DD` `rescan_range`; `mock.ts` now parses `Date.parse(startDate..endDate)` faithfully.
   - `payUnpaidFenced` maps both `code === "INSUFFICIENT_BALANCE"` and live Mengantar `400 "balance is not enough"` to `402 INSUFFICIENT_BALANCE` with Indonesian UI copy.
   - `financeRun` falls back to rounded top-level `page.balance` when no cleared invoice mirror rows exist yet.
3. **`apps/web-app/src/routes/keuangan/page.tsx` (FIXED):**
   - Labels `typeRefund` cancellation returns (`deleted ... order`) as `Pengembalian batal` while keeping `Klaim disetujui` for claim refunds.
4. **`packages/db/migrations/control/0021_courier_rounding_live.sql` + `docs/spec/02` & `09` (Drift #1 — FIXED):**
   - Sets `rounding_tolerance_gram = 299` for `Sap` and `spx`, and `300` for `lion`; updated `spec/02` and `spec/09` to match live production reality.
