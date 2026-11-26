# 09 — Dual-Book Financial Accounting & Precision Mengantar Sync (`geraiexpress-cfv2`)

- **Related Decisions:** `DEC-203`, `DEC-216`
- **Primary Evidence:** Verified Mengantar Public API `GET /api/public/{API_KEY}/invoices` read-only capture (150 invoices / 554 `subItems` verified, 5 observed top-level types), Mengantar client bundle invoice mapper (`411606a4_5a5ed2d.js` for additional subtype awareness), and `POST /order/pay-unpaid` + `GET /batch` operations contract.

---

## 1. Architectural Principle: Dual-Book Accounting (Zero Guesswork)

Under Scheme 1 (`DEC-203`), each outlet owns its Mengantar seller balance (top-ups, Non-COD shipping debits, return-shipping debits, weight adjustments, COD payouts, claim refunds, and bank withdrawals happen in Mengantar), while walk-in cash/QRIS collection and packing add-ons happen physically at the outlet's counter.

`geraiexpress-cfv2` maintains **two linked, append-only books** per outlet:
1. **Book 1 — Local Counter Cash Book (`counter_receipts` + `cashier_shifts`):** authoritative for physical counter money (`Tunai`, `QRIS`, `Transfer`, `Deposit Reseller`, `Void`, shop `Packing Add-Ons`, and `Cashier Shift` drawer counts).
2. **Book 2 — Mengantar Seller Mirror Book (`mengantar_invoice_mirror` & `mengantar_invoice_subitems`):** an idempotent mirror of Mengantar's `GET /api/public/{API_KEY}/invoices` stream, reconciled 1:1 to local `shipments` (`(tenant_id, slug)`) via `cnote_no` (AWB) first, then `ORDER_ID`. The `batch` code is stored on the mirror row but is not used for matching.

**Realized vs Estimated Profit:**
- **`Estimasi Laba` (accrued):** per mode, `(P - N) + K + S - V` (spec 02 §3.3) from issue time; for COD modes the
  counter-due may be only `K + S - V`, so profit is **never** computed as `counter_total_paid_idr - gerai_shipping_cost_idr`.
- **`Laba Kas` (cash-realized, `Sync Mengantar ✓`):** exactly the predicate and value in spec 02 §3.5 — counter part
  `paid`/`not_required` **and** provider side reconciled (`provider_reconciled_cost_idr` for Non-COD,
  `reconciled_provider_cod_credit_idr` for COD). Provider reconciliation alone never marks an unpaid counter customer
  as paid (DEC-220). Dashboard and `Keuangan` show both labels side by side, never summed.
- **`quote_drift`:** an order whose raw `COD_FEE` or reconciled debit differs from the frozen quote (spec 02 §3.3) is
  listed under `Selisih Sync` with both numbers; nothing is re-sent or cancelled automatically.
- **Sender COD payable** is a liability of the outlet to the walk-in sender, distinct from Mengantar's seller credit;
  `Keuangan` shows `Hutang COD ke Pengirim` until the outlet records `sender_cod_payout`.

---

## 2. Verified Mengantar `/invoices` Contract & Integer-Money Hygiene

### 2.1 `GET /api/public/{API_KEY}/invoices` Fields & Non-Integer `COD_FEE` Rule
Query parameters sent by the SDK (`packages/mengantar-sdk/src/public/client.ts`): `cursor`, `size` (50), `invoiceFilter` (default `all`), `dateRange`; the next page is read from `nextCursor`. `page` and `keyword` are not used.
- **Top-level invoice fields:** `_id`, `inv_number`, `type`, `status` (`statusCleared | statusExpired | ...`), `courier`, `ORDER_ID`, `cnote_no`, `amount` (integer), `total` (integer), **`balanceAmount` (running balance — non-integer float in ~68.5% of live production rows due to internal `COD_FEE` residue, rounded to integer Rupiah in `balance_amount_idr` with the verbatim float preserved in `raw_json`)**, `adminCleared`, `isViolation`, `description`, `createdAt`, `updatedAt`, `balanceAdjustmentStatus`, `balanceAdjustmentInvoiceId`, `subItems[]`.
- **PII Stripping Rule:** `subItems[]` carry `RECEIVER_NAME`, `RECEIVER_PHONE`, `GOODS_DESC`, and `PICKUP_NAME`. The sync worker **strips all PII fields** before persisting `mengantar_invoice_subitems`.
- **Non-Integer `COD_FEE` & Signed Cashflow Normalization (Live-Verified 2026-11-26, `TASK-604`):**
  - In Mengantar captures, `subItem.COD_FEE` is a non-integer float (`COD_AMOUNT × 3.33%`), whereas **`subItem.amount` (`== COD_AMOUNT - estimatedSpecialPrice`) is an exact integer**. Therefore `mengantar_invoice_subitems` stores `amount_idr`, `cod_amount_idr`, `estimated_price_idr`, and `estimated_special_price_idr` as `INTEGER`, while storing `cod_fee_raw_text` as verbatim `TEXT` (never rounded into an `_idr` money column).
  - Live production `/invoices` emits **positive** `amount` for `typePayment` & `typeWithdraw` (even though both debit the seller balance), **negative** `amount` for claim `typeRefund` (even though claims credit the balance), **positive** `amount` for deleted-order `typeRefund`, and credits `total` (not `amount`) on `typeAddBalance`. `applyInvoice` normalizes `mengantar_invoice_mirror.amount_idr` to signed seller-wallet cashflow (`+` credit, `-` debit: `typeAddBalance -> +|total ?? amount|`, `typePayment`/`typeWithdraw -> -|amount|`, `typeRefund -> +|amount|`, `typeReconciliation`/unknown -> verbatim `amount`) so `settleBalance()` and the `/keuangan` ledger agree. Running-balance checks allow `±Rp1` rounding tolerance for Mengantar's float `balanceAmount` residue and flag any gap `>= Rp2` as `balance_gap`.

### 2.2 Mapping of Observed & Bundle-Known Invoice Types

| `invoice.type` | Provenance | Meaning & Structure | Local Sync & Reconciliation Action |
|---|---|---|---|
| **`typeAddBalance`** | **Observed** (live prod `/invoices`) | Seller balance top-up (`statusCleared` / `statusExpired`). Wallet is credited by `total` (`total >= amount`). *(Public API has no `POST` top-up endpoint; sellers top up in Mengantar Web/App).* | Upsert mirror row (`amount_idr = +|total ?? amount|`); when `statusCleared`, update `synced_balance_idr`. After every successful sync the object (`recoverUnpaid`) first settles interrupted `pay_unpaid` attempts by read-back, then pays `provider_unpaid_hold` batches itself as the `system` actor, oldest first, one call per batch, while the synced balance covers provider net + insurance; batches it cannot cover wait for the next top-up. |
| **`typePayment`** | **Observed** (live prod `/invoices`) | Positive top-level `amount` debiting seller balance:<br>1. `"Payment for Non-COD batch <batch>"` (`subItems[].amount == -estimatedSpecialPrice`)<br>2. `"Payment for returned order <AWB>"` (**Return shipping debit**)<br>3. Descriptions containing `"penyesuaian"` *(weight/Cordest adjustment)* | Normalize `amount_idr = -|amount|`; match `cnote_no`, then `ORDER_ID`, to `(tenant_id, slug)`:<br>• Batch payment → set `provider_reconciled_cost_idr` & `provider_invoice_reconciled`.<br>• Return payment → `reconciled_extra_adjustment_idr` = sum of cleared `"returned order"` debits for that INV, which also removes the INV from the return exposure (`finance/reserve.ts`).<br>• `"penyesuaian"` → a `finance_discrepancies` row of kind `adjustment` (shown under `Selisih Sync` and counted as dispute exposure until resolved); it is not added to `reconciled_extra_adjustment_idr`. |
| **`typeReconciliation`** | **Observed** (live prod `/invoices`) | COD Auto-Reconciliation payout (`invoice.amount == sum(subItems.amount)`; per-AWB `subItem.amount == COD_AMOUNT - estimatedSpecialPrice`). | Match each `subItem.cnote_no` → set `reconciled_provider_cod_credit_idr = subItem.amount` (Mengantar seller credit, not the sender payable) & mark `provider_invoice_reconciled`; flag a `Selisih Sync` row if it differs from `expected_provider_cod_credit_idr`. |
| **`typeRefund`** | **Observed** (live prod `/invoices`) | Two live-verified credit subtypes (both normalized to `amount_idr = +|amount|`):<br>1. Claim credit (negative raw `amount`): `"Claim approved for damaged or lost / returned order <AWB>"`.<br>2. Deleted Non-COD order refund (positive raw `amount`, verified 2026-11-26): `"Return for deleted Non-COD order <ORDER_ID> from batch <BATCH>"`. | Match `cnote_no`, `ORDER_ID`, or `/order\s+([A-Za-z0-9-]+)/i` from description to `(tenant_id, slug)`:<br>• Claim credit → link to INV and mark `shipment_claims.status = 'paid'` with `paid_invoice_id`.<br>• Deleted-order return (`deleted ... order`) → link to INV (`Pengembalian batal` in UI); do **not** call `markClaimPaid`. |
| **`typeWithdraw`** | **Observed** (live prod `/invoices`) | Seller balance withdrawal to bank (`statusCleared`, positive raw `amount` debiting balance). | Normalize `amount_idr = -|amount|`; record payout in mirror & update `synced_balance_idr`. |
| `typeCorrection`, `typeDeduction`, `typeMismatchM/P`, `typeAddBalanceCredit`, `typeWithdrawal`, `typeWithdrawApi`, or **any unknown `type`** | *Bundle-derived / Open-ended* | Additional adjustment or future provider types. | Never drop unknown types: persist verbatim in `mengantar_invoice_mirror` and surface unlinked/unrecognized rows in the **`Selisih Sync`** review tab. |

---

## 3. Low-Balance Orders (`provider_unpaid_hold` → `POST /order/pay-unpaid`)

When seller balance is insufficient on Non-COD `POST /order`, Mengantar returns HTTP 200 with `ORDER_ID`, `batch` (code), `batch_id` (**24-hex `_id`**), `isPaid: false`, and `cnote_no: null` (verified live 2026-11-26). Calling `POST /order/pay-unpaid` while balance is still insufficient returns HTTP `400 {"success":false,"message":"balance is not enough"}` (no `code` field); `GeraiVaultDO.payUnpaid` maps both `INSUFFICIENT_BALANCE` and message patterns (`balance is not enough` / `saldo tidak cukup`) to HTTP `402 INSUFFICIENT_BALANCE` with the Indonesian message.

1. **Role-Safe Pre-Flight Warning (Never Leaks Balance to Cashiers):**
   - API returns boolean `balance_sufficient` to POS.
   - **`Gerai Admin` sees:** *"Saldo Mengantar tercatat Rp12.000, estimasi debet Rp19.200."*
   - **`Kasir` sees only:** *"Saldo pengiriman gerai belum mencukupi untuk menerbitkan AWB sekarang. Kiriman akan disimpan sebagai Menunggu Saldo — silakan beri tahu pemilik gerai."* (Zero balance or net-cost numbers exposed, preserving `AGENTS.md §3.4`).
2. **Crash-Safe `pay-unpaid` Settlement:**
   - Because repeat-call idempotency on an already-paid batch is treated as **non-idempotent**, `GeraiVaultDO` serializes per batch (`pay:<batch_id>`), writes a `pay_unpaid` `in_flight` journal before calling `{ courier, batch_id: mengantar_batch_object_id }`, and **always reads back `GET /order?order_id=`** per member before retrying or unlocking label printing.

---

## 4. Bounded Sync Cadence & Watermark Rules

1. **Triggers (Serialized via `GeraiVaultDO`):** 15-minute Cron for active outlets, event-driven trigger +60s after order/webhook mutations, and manual `[🔄 Sinkronkan Sekarang]` button in `/keuangan` (1 per 30 s per gerai, enforced inside the object through `finance_sync_state.last_manual_at`; the `RATE_LIMITER` binding serves `/api/v1` only). The Cron fan-out covers active gerai whose onboarding state is `connected` or `byok_connected`.
2. **Bounded Pagination & Pending Rescan:**
   - Incremental sync pages `GET /invoices` (size 50, live-verified strictly newest-first across 200 rows) up to a hard cap of **5 pages per run** until hitting known `statusCleared / statusExpired` `_id`s; sets `synced_balance_idr` from the newest `statusCleared` row's rounded `balanceAmount` (falling back to top-level `page.balance` only when no cleared mirror row exists yet).
   - A run that stops at the 5-page cap stores `finance_sync_state.backfill_cursor`, and later runs continue the older history from there instead of looping unboundedly.
   - A daily sweep re-reads the fixed `dateRange` covering locally non-final (`pending`) mirror rows as **full ISO UTC day bounds** (`YYYY-MM-DDT00:00:00.000Z` .. `YYYY-MM-DDT23:59:59.999Z` — live-verified 2026-11-26 because equal bare `YYYY-MM-DD` dates evaluate to `[00:00Z, 00:00Z]` and return 0 rows), resumable through `rescan_cursor` / `rescan_range`.
