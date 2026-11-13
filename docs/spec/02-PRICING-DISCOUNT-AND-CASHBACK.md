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
| **1. Base Outlet Discount (`gerai_discount_bps`)** | **Super Admin** (per outlet × courier/service) | **Outlet** (lowers outlet shipping cost) | `effective_bps = allow_subsidy ? assigned_bps : min(assigned_bps, provider_observed_bps)`. `discount_idr = floor(publish_shipping_idr * effective_bps / 10000)`. `gerai_shipping_cost_idr = publish_shipping_idr - discount_idr`. |
| **2. Counter Packing Add-On (`packing_addon_idr`)** | **Gerai Admin** (shop cardboard/bubble catalog) | **Outlet 100%** (stays in shop cash drawer) | Added as an explicit receipt line item; never sent to Mengantar. |
| **3. Counter Promo / Voucher (`promo_discount_idr`)** | **Gerai Admin** (outlet-funded) or **Super Admin** (capped campaign) | **Walk-in Sender / Reseller** | Subtracted on receipt; clamped so total due >= `0`. |
| **4. Deferred Cashback (`cashback_bps`)** | **Super Admin** or **Gerai Admin** (for loyal resellers) | **Outlet** or **Sender Contact** | Recorded `PENDING` at dispatch; transitions to `RELEASED` 24h after `delivered` if no dispute exists; `CLAWBACK` on `RTS` or `cancelled`. |

> **Observed Discount & Provider Cost Precedence:** On Mengantar's seller `/order/estimate`, `estimatedSpecialPrice` includes `codFee`. Thus `provider_net_shipping_idr = estimatedSpecialPrice - codFee`, and `provider_observed_discount_bps = floor((publish_shipping_idr - provider_net_shipping_idr) * 10000 / publish_shipping_idr)` (raw `discountPercent` is stored separately for audit). When `assigned_bps == provider_observed_bps`, `gerai_shipping_cost_idr` equals `provider_net_shipping_idr` pre-sync, and `provider_reconciled_cost_idr` records actual billed truth once synced from `GET /invoices`.

---

## 3. Three Collection Modes

Let `P = publish_shipping_idr`, `M = gerai_shipping_cost_idr`, `I = insurance_fee_idr ?? 0` (*Mengantar Public API currently exposes no separate insurance fee parameter; `insurance_fee_idr` stays `NULL` until a verified provider field exists*), `K = packing_addon_idr`, `V = promo_discount_idr`, `G = item_value_idr`, and `F = cod_service_fee_idr` (integer `codFee` from Mengantar's two-pass seller estimate).

1. **`NON_COD` (Paid Upfront at the Counter):**
   - `Customer_Receipt_Total = P + I + K - V`
   - `Expected_Mengantar_Debit = M` *(plus `I` only if provider bills insurance in `/invoices`)*
   - `Estimated_Counter_Margin = (P - M) + K - V_outlet_funded`
2. **`COD_GOODS` (Recipient Pays Goods + Shipping to Courier):**
   - Uses Mengantar's **two-pass quote** (`COD_AMOUNT` on estimate = `G + P`, while Create Order `COD` = total collected from recipient `G + P + F` when fee is borne by recipient, or `G + P` when absorbed by sender, matching Mengantar's documented `"Goods Value + Shipping Fee + COD Fee"` definition).
   - Both **`Tagih ke Penerima`** (`cod_collection_total_idr`) and **`Estimasi Cair Bersih`** (`estimated_cod_net_payout_idr`) print clearly on the sender's receipt stub.
3. **`COD_SHIPPING` / DFOD (`G = 0`, Recipient Pays Shipping + COD Fee on Delivery):**
   - Displays an explicit counter notice that uninsured `G = 0` shipments carry minimal carrier loss coverage (`1x ongkir`).

---

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
