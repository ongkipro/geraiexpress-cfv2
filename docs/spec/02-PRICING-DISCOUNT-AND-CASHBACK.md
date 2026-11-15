# 02 — Pricing, Volumetric Gram Math, Discounts & Risk Reserve (`geraiexpress-cfv2`)

This specification defines exact integer arithmetic for weights, customer tariffs, outlet net costs, COD gross-up, cashback, and return-risk reserves.

---

## 1. Integer Weight & Volumetric Calculation (`_gram`)

1. **Default & Bounds:** Counter and public inputs default to **`1000` grams** (`1.0 kg`), accepting `10` to `100,000` grams per parcel (further bounded per courier service in `courier_service_catalog`).
2. **Volumetric Weight in Grams:**
   - Regular divisor = `6000` (`4000` for JNE Regular and IDX Cargo per verified Mengantar help `5387484`).
   - When dimensions `L, W, H` (cm) are supplied:
     `volumetric_weight_gram = ceil((L * W * H * 1000) / volumetric_divisor)`
   - Raw billable basis: `raw_weight_gram = max(actual_weight_gram, volumetric_weight_gram)`.
3. **Courier Rounding Tolerance & Exact Upstream `weight` Dispatch:**
   - Each courier defines `rounding_tolerance_gram` (verified Mengantar default: `300` g for regular couriers, `310` g for Lion Parcel).
   - For `raw_weight_gram >= 1000`: if `raw_weight_gram % 1000 == 0`, `billed_kg = raw_weight_gram / 1000`; else if `(raw_weight_gram % 1000) <= rounding_tolerance_gram`, `billed_kg = floor(raw_weight_gram / 1000)`; else `billed_kg = ceil(raw_weight_gram / 1000)`. Both Mengantar `/order/estimate` and `POST /order` send this exact integer `billed_kg` so upstream rounding ambiguity cannot create surprise weight surcharges.
   - Sub-kilogram parcels (`raw_weight_gram < 1000`): for explicit sub-kg services (e.g., iDexpress `< 500` g half-fare tier where `route_min_weight_gram < 1000`), send `raw_weight_gram / 1000` decimal kg; for standard 1 kg-minimum couriers (`route_min_weight_gram == 1000`), send integer `billed_kg = 1`. Upon creation, provider echo `WEIGHT` is recorded in `provider_echoed_weight_kg_text` and flagged if mismatched.
4. **Cargo Service Isolation (`NON_COD` Only at Launch):**
   - Cargo rows (`JNECargo`, `SiCepatCargo`, `SapCargo`, `iDexpressCargo`) read **only** cargo-specific provider fields (`cargoPrice`, `cargoDiscount`, `cargoEstimatedSpecialPrice`, `minimumWeightCargo`), require `cargoEstimatedPrice == cargoPrice`, and dispatch with base courier + `orders[].cargo: true`.
   - **Cargo COD Exclusion:** because `SapCargo` is officially Non-COD only and cargo COD fee deltas in Mengantar public responses remain unverified (`geraiexpress-mengantar-public-api.md`), all cargo services are quoted and dispatched **strictly as `NON_COD`** until authenticated sandbox cargo COD read-back evidence is established.

---

## 2. Four Separated Commercial Instruments

| Instrument | Owner | Beneficiary | Integer Formula |
|---|---|---|---|
| **1. Base Outlet Discount (`gerai_discount_bps`)** | **Super Admin** (per outlet × courier/service) | **Outlet** (lowers outlet shipping cost) | `effective_bps = min(assigned_bps, provider_observed_bps)` (no subsidy at launch: a rate above what Mengantar gives would need a settlement ledger, which DEC-226 rejects for launch). `gerai_shipping_cost_idr` (the **commercial estimate** `M`) = `provider_net_shipping_idr` when `assigned_bps >= provider_observed_bps`, else `publish_shipping_idr - floor(publish_shipping_idr * assigned_bps / 10000)`. |
| **2. Counter Packing Add-On (`packing_addon_idr`)** | **Gerai Admin** (shop cardboard/bubble catalog) | **Outlet 100%** (stays in shop cash drawer) | Added as an explicit receipt line item; never sent to Mengantar. |
| **3. Counter Promo / Voucher (`promo_discount_idr`)** | **Gerai Admin** (outlet-funded only at launch; platform-funded campaigns are deferred until a settlement ledger exists) | **Walk-in Sender / Reseller** | Subtracted from the counter part only; capped so `counter_due_idr >= 0` **before** it is stored (`V <= P + I0 + K + S` for `none`, `V <= K + S` otherwise). |
| **4. Deferred Cashback (`cashback_bps`)** | **Super Admin** or **Gerai Admin** (for loyal resellers) | **Outlet** or **Sender Contact** | Recorded `PENDING` at dispatch; transitions to `RELEASED` 24h after `delivered` if no dispute exists; `CLAWBACK` on `RTS` or `cancelled`. |

> **Observed Discount & Provider Cost Precedence:** On Mengantar's seller `/order/estimate`, `estimatedSpecialPrice` includes `codFee`. Thus `provider_net_shipping_idr = estimatedSpecialPrice - codFee` (an **exact integer**, stored as-is). `provider_observed_discount_bps = floor((publish_shipping_idr - provider_net_shipping_idr) * 10000 / publish_shipping_idr)` is a **lossy display/control value** (raw `discountPercent` is stored separately for audit). When `assigned_bps >= provider_observed_bps`, `gerai_shipping_cost_idr = provider_net_shipping_idr` (the exact integer — never re-derived from bps); bps arithmetic is used only when the assigned rate is lower. **All money flows and margins in §3 use the provider amount `N = provider_net_shipping_idr`**, because that is what Mengantar actually debits; `M` is shown only as the Super Admin's commercial reference and the gap `M - N` as `Selisih tarif` (§2.1). Once DEC-226's provider-enforced target is active, Mengantar bills the assigned rate, so `N = M` by construction. Regression example (TASK-107): `P = 12000`, provider net `9599` → observed bps `2000`; with assigned bps `2000` the cost is **Rp9.599**, not Rp9.600. `provider_reconciled_cost_idr` records actual billed truth once synced from `GET /invoices`. See §2.1 for what the assigned rate means under Scheme 1.

### 2.1 What the Super Admin assigned rate controls under Scheme 1 (DEC-226)

Each outlet owns its Mengantar seller account (ADR-0003), so the **actual debit is whatever Mengantar charges that
seller**; GeraiExpress cannot reduce or raise it by calculation, and the documented Partner API has no discount endpoint.

- **Target:** after Mengantar confirms that a partner can set a per-seller discount, the Super Admin rate is applied on
  Mengantar's side and becomes the billed rate; activation is recorded with date, channel and the observed
  `discountPercent` from `/order/estimate`.
- **Until then (fallback):** `assigned_gerai_discount_bps`
is an **internal commercial estimate** used for margin preview and the `assigned <= observed` guard only; reconciled
profit always uses `provider_reconciled_cost_idr`. Any gap (`assigned < observed`) is shown to the owner as
`Selisih tarif` and is never booked as platform revenue (a platform-fee settlement of the gap is rejected for launch).

---

## 3. Collection Modes and Exact Money Flows (DEC-220, DEC-225)

### 3.1 Symbols (all integer IDR; `NULL` never coerced to `0` in storage)

| Symbol | Column | Meaning |
|---|---|---|
| `P` | `publish_shipping_idr` | Mengantar publish tariff charged to the customer for shipping |
| `N` | `provider_net_shipping_idr` | Exact provider shipping charge for this seller (`estimatedSpecialPrice - codFee` of the **final** estimate, §3.3) — used in every flow and margin |
| `M` | `gerai_shipping_cost_idr` | Super Admin commercial estimate (§2); display/guard only, never used in money flows |
| `I` | `insurance_fee_idr` | `NULL` until a verified provider field exists; formulas use `I0 = I ?? 0` and receipts print `—` when `NULL` |
| `F` | `cod_service_fee_idr` | Integer `codFee` from the **final** seller estimate whose `COD_AMOUNT` equals the create-order `COD` (§3.3 quote passes) |
| `K` | `packing_addon_idr` | Outlet packing add-ons, paid at the counter, outlet-kept |
| `S` | `counter_service_fee_idr` | Optional outlet service fee (`Biaya Layanan Loket`), a **separate disclosed line**, never added to `P` (DEC-205 stays intact: `P` is always the publish tariff) |
| `V` | `promo_discount_idr` | Counter promo, outlet-funded at launch, capped so `counter_due_idr >= 0` |
| `G` | `cod_goods_amount_idr` | Goods amount the courier collects on COD Barang (`0` for Non-COD and DFOD) |
| `D` | `declared_item_value_idr` | Declared goods value for insurance/claims (independent of `G`) |

### 3.2 `cod_fee_mode` (one canonical enum, stored in `quote_snapshots` and `shipments`)

`none` (Non-COD) · `buyer_bears_fee` · `sender_bears_fee` · `cod_all_in` · `dfod` (COD Ongkir). The same enum is used
in the POS, OpenAPI (`POST /api/v1/quotes`, `/shipments`) and MCP tools.

### 3.3 Exact flows per mode

| Mode | Counter due now (`counter_due_idr`) | Courier collects (`cod_collection_total_idr`) | Mengantar seller COD credit (`expected_provider_cod_credit_idr`) | Sender payable (`sender_cod_payable_idr`) | Outlet margin (accrued) |
|---|---|---|---|---|---|
| `none` | `P + I0 + K + S - V` | `0` | `0` (debit `N + I0` instead) | `0` | `(P - N) + K + S - V` |
| `buyer_bears_fee` | `K + S - V` | `G + P + I0 + F` | `G + P - N` | `G` | `(P - N) + K + S - V` |
| `sender_bears_fee` | `K + S - V` | `G + P + I0` | `G + P - F - N` | `G - F` | `(P - N) + K + S - V` |
| `cod_all_in` | `K + S - V` | `G` | `G - F - N - I0` | `G - P - I0 - F` | `(P - N) + K + S - V` |
| `dfod` | `K + S - V` | `P + I0 + F` | `P - N` | `0` | `(P - N) + K + S - V` |

- **Seller credit rule (all COD modes):** `expected_provider_cod_credit_idr = cod_collection_total_idr - (N + F + I0)`, i.e.
  Mengantar's `COD_AMOUNT − estimatedSpecialPrice` (which already contains `F`) minus insurance. Identity for every COD
  mode: `seller credit − sender payable = P − N` (the outlet's shipping spread); with `N = M` this equals `P − M`.
- **Seller credit vs sender payable are different numbers.** Mengantar credits the outlet's seller balance
  (`expected_provider_cod_credit_idr`, later `reconciled_provider_cod_credit_idr` from `typeReconciliation`
  `subItem.amount`). The outlet then owes the walk-in sender `sender_cod_payable_idr` and keeps the rest (its shipping
  spread). The sender payout is recorded in the counter book when the outlet actually pays the sender
  (`counter_ledger_entries.type = 'cod_payout_to_sender'`).
- **Guard for `cod_all_in`:** reject the quote when `G < P + I0 + F + 1000` (`COD all-in tidak cukup menutup ongkir dan
  biaya COD`). Never store a negative payable.
- **Bounds:** `G` for COD Barang `Rp10.000–Rp5.000.000`. `D` (declared value) limits are **per courier/service from
  Mengantar** (`MAX_NON_COD = 5.000.000` observed in Mengantar's form constants); AutoKirim's Rp20.000.000 is a
  competitor observation only. Final limits are a sandbox verification item (M2).
- **Service fee `S`:** `0` by default; when the outlet enables it, `Rp1.000–Rp200.000`, allowed on `none` and `dfod`
  (paid at the counter), not on COD Barang modes. Printed as its own line `Biaya Layanan Loket`.
- **DFOD:** `G = 0`; the counter shows `Ongkir dibayar penerima saat paket tiba`; uninsured DFOD carries minimal loss
  coverage (`1x ongkir`) — shown as a notice.
- **Quote passes (`codFee` depends on `COD_AMOUNT`):**
  1. Pass 1 — Non-COD estimate (no `COD_AMOUNT`) gives `P` and `N` for every courier card.
  2. Fixed collection modes (`sender_bears_fee`: `C = G + P + I0`; `cod_all_in`: `C = G`): one COD estimate with
     `COD_AMOUNT = C`; its `codFee` is `F`.
  3. Fee-inclusive modes (`buyer_bears_fee`: base `B = G + P + I0`; `dfod`: `B = P + I0`; `C = B + F`): estimate at
     `COD_AMOUNT = B` to get `F0`, re-estimate at `COD_AMOUNT = B + F0` to get `F1`; accept when `F1 = F0`, otherwise
     re-estimate at `B + F1` (at most 3 estimates). If it is still changing, the quote fails with `COD_FEE_UNSTABLE` (`Biaya COD berubah, ulangi
     cek ongkir`) — never guess.
  4. The **frozen** quote stores `F`, `N` and `C` from the **final** estimate, whose `COD_AMOUNT` equals the create-order
     `COD`. Create-order always sends that frozen `C`; it never re-derives it.
  5. After create, the order's raw `COD_FEE` text is compared with `F`; a difference of 1 Rupiah or more marks the INV
     `quote_drift` for reconciliation (spec 09), without cancelling or re-sending the order.

### 3.4 Worked examples (P = 12.000, N = 9.600, I = NULL, F = 5.560 for every mode for readability, K = 3.000, S = 0, V = 0, G = 150.000)

| Mode | Counter due | Courier collects | Seller credit (expected) | Sender payable | Outlet margin |
|---|---:|---:|---:|---:|---:|
| `none` | 15.000 | 0 | — (debit 9.600) | 0 | 5.400 |
| `buyer_bears_fee` | 3.000 | 167.560 | 152.400 | 150.000 | 5.400 |
| `sender_bears_fee` | 3.000 | 162.000 | 146.840 | 144.440 | 5.400 |
| `cod_all_in` | 3.000 | 150.000 | 134.840 | 132.440 | 5.400 |
| `dfod` | 3.000 | 17.560 | 2.400 | 0 | 5.400 |

Reconciliation check for every COD row: `seller credit − sender payable = P − N = 2.400` (outlet shipping spread).
In production `F` differs per mode because `COD_AMOUNT` differs; unit tests (TASK-107) cover both this fixture and a
per-mode fee fixture. Second fixture for the fallback case (DEC-226 not yet provider-enforced): assigned `1000 bps` →
`M = 10.800` while Mengantar still debits `N = 9.600`; every flow above is unchanged (it uses `N`), `Estimasi Laba` shows
`5.400`, and `Selisih tarif` shows `M − N = 1.200` as information only.

### 3.5 Profit labels (spec 09)

- **`Estimasi Laba` (accrued):** the outlet-margin column above, available from issue time, regardless of whether the
  counter part is paid.
- **`Laba Kas` (cash-realized):** one predicate for every mode (spec 09 uses the same): counted only when
  (a) `counter_payment_status IN ('paid','not_required')` **and** (b) the provider side is reconciled —
  `provider_reconciled_cost_idr IS NOT NULL` for `none`, `reconciled_provider_cod_credit_idr IS NOT NULL` for COD modes.
  Value: `none` → `(P − provider_reconciled_cost_idr − I0) + K + S − V`; COD → `(reconciled_provider_cod_credit_idr −
  sender_cod_payable_idr) + K + S − V`. Provider reconciliation alone never implies that an unpaid counter customer has
  paid. Dashboards show `Estimasi Laba` and `Laba Kas` as **two separate numbers**, never summed.

## 4. Non-Freezing Return Risk Reserve (`Saldo Aman`)

Instead of locking an outlet's entire balance when one parcel enters return:

```text
Active_Return_Exposure_Idr  = SUM(publish_shipping_idr + estimated_courier_return_fee_idr)
                              for shipments in ('rts_in_transit', 'undelivery_hold') not yet settled in /invoices

Active_Dispute_Exposure_Idr = SUM(pending_weight_or_cordest_diff_idr)
                              for open disputed shipments

Safe_Available_Balance_Idr  = Synced_Mengantar_Balance_Idr - (Active_Return_Exposure_Idr + Active_Dispute_Exposure_Idr)
```

Every Rupiah in `Active_Return_Exposure_Idr` links directly to its contributing `INV` slugs in `/keuangan`.

---

## 5. Server-Enforced Role Field Projection

| Field Group | Public / Receipt | `cashier` JSON DTO | `gerai_admin` JSON DTO | `super_admin` JSON DTO |
|---|:---:|:---:|:---:|:---:|
| `publish_shipping_idr`, `packing_addon_idr`, `counter_total_paid_idr` | ✓ | ✓ | ✓ | ✓ |
| `gerai_shipping_cost_idr`, `estimated_gerai_margin_idr`, `synced_balance_idr` | **✗** | **✗ (Omitted)** | ✓ | ✓ |
| `provider_observed_discount_bps` vs `assigned_gerai_discount_bps` variance | **✗** | **✗** | Own rate only | ✓ (Full + Audit) |
