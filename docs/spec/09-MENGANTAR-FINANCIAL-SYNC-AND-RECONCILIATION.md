# 09 — Dual-Book Financial Accounting & Precision Mengantar Sync (`geraiexpress-cfv2`)

- **Related Decisions:** `DEC-203`, `DEC-216`
- **Primary Evidence:** Verified Mengantar Public API `GET /api/public/{API_KEY}/invoices` read-only capture (150 invoices / 554 `subItems` verified, 5 observed top-level types), Mengantar client bundle invoice mapper (`411606a4_5a5ed2d.js` for additional subtype awareness), and `POST /order/pay-unpaid` + `GET /batch` operations contract.

---

## 1. Architectural Principle: Dual-Book Accounting (Zero Guesswork)

Under Scheme 1 (`DEC-203`), each outlet owns its Mengantar seller balance (top-ups, Non-COD shipping debits, return-shipping debits, weight adjustments, COD payouts, claim refunds, and bank withdrawals happen in Mengantar), while walk-in cash/QRIS collection and packing add-ons happen physically at the outlet's counter.

`geraiexpress-cfv2` maintains **two linked, append-only books** per outlet:
1. **Book 1 — Local Counter Cash Book (`counter_ledger_entries`):** authoritative for physical counter money (`Tunai`, `QRIS`, `Transfer`, `Deposit Reseller`, `Void`, shop `Packing Add-Ons`, and `Cashier Shift` drawer counts).
2. **Book 2 — Mengantar Seller Mirror Book (`mengantar_invoice_mirror` & `mengantar_invoice_subitems`):** an idempotent mirror of Mengantar's `GET /api/public/{API_KEY}/invoices` stream, reconciled 1:1 to local `shipments` (`(tenant_id, slug)`) via `cnote_no` (AWB), `ORDER_ID`, and `batch` code.

**Realized vs Estimated Profit:**
- **`Estimasi Laba` (accrued):** per mode, `(P - M) + K + S - V_outlet` (spec 02 §3.3) from issue time; for COD modes the
  counter-due may be only `K + S - V`, so profit is **never** computed as `counter_total_paid_idr - gerai_shipping_cost_idr`.
- **`Laba Kas` (cash-realized, `Sync Mengantar ✓`):** the same margin recomputed with `provider_reconciled_cost_idr` (Non-COD)
  or `reconciled_provider_cod_credit_idr - sender_cod_payable_idr` (COD), counted only when the counter part is `paid`
  (or `not_required`). Provider reconciliation alone never marks an unpaid counter customer as paid (DEC-220).
- **Sender COD payable** is a liability of the outlet to the walk-in sender, distinct from Mengantar's seller credit;
  `Keuangan` shows `Hutang COD ke Pengirim` until the outlet records `sender_cod_payout`.

---

## 2. Verified Mengantar `/invoices` Contract & Integer-Money Hygiene

### 2.1 `GET /api/public/{API_KEY}/invoices` Fields & Non-Integer `COD_FEE` Rule
Query parameters: `page`, `size`, `invoiceFilter`, `keyword` (accepts `cnote_no`), `dateRange`.
- **Top-level invoice fields:** `_id`, `inv_number`, `type`, `status` (`statusCleared | statusExpired | ...`), `courier`, `ORDER_ID`, `cnote_no`, `amount` (integer), `total` (integer), **`balanceAmount` (integer running balance)**, `adminCleared`, `isViolation`, `description`, `createdAt`, `updatedAt`, `balanceAdjustmentStatus`, `balanceAdjustmentInvoiceId`, `subItems[]`.
- **PII Stripping Rule:** `subItems[]` carry `RECEIVER_NAME`, `RECEIVER_PHONE`, `GOODS_DESC`, and `PICKUP_NAME`. The sync worker **strips all PII fields** before persisting `mengantar_invoice_subitems`.
- **Non-Integer `COD_FEE` Invariant (Critical):** in Mengantar captures, `subItem.COD_FEE` is a non-integer float (`COD_AMOUNT × 3.33%`) in 550/554 rows, whereas **`subItem.amount` (`== COD_AMOUNT - estimatedSpecialPrice`) is an exact integer in 554/554 rows**. Therefore, `mengantar_invoice_subitems` stores `amount_idr`, `cod_amount_idr`, `estimated_price_idr`, and `estimated_special_price_idr` as `INTEGER`, while storing `cod_fee_raw_text` as verbatim `TEXT` (never rounded into an `_idr` money column).

### 2.2 Mapping of Observed & Bundle-Known Invoice Types

| `invoice.type` | Provenance | Meaning & Structure | Local Sync & Reconciliation Action |
|---|---|---|---|
| **`typeAddBalance`** | **Observed** (`/invoices` capture) | Seller balance top-up (`statusCleared` / `statusExpired`). *(Note: Public API has no `POST` top-up endpoint; sellers top up in Mengantar Web/App, and `/invoices` reflects it).* | Upsert mirror row; when `statusCleared`, update `synced_balance_idr` and flag any `provider_unpaid_hold` batches as ready for `pay-unpaid`. |
| **`typePayment`** | **Observed** (`/invoices` capture) | 1. `"Payment for Non-COD batch <batch>"` (`subItems[].amount == -estimatedSpecialPrice`)<br>2. `"Payment for returned order <AWB>"` (**Return shipping debit**)<br>3. Descriptions containing `"penyesuaian"` *(bundle-observed weight/Cordest adjustment)* | Match `cnote_no` / `batch` / `ORDER_ID` to `(tenant_id, slug)`:<br>• Batch payment → set `provider_reconciled_cost_idr` & `provider_invoice_reconciled`.<br>• Return payment → add to `reconciled_extra_adjustment_idr` & release `Active_Return_Exposure_Idr`.<br>• `"penyesuaian"` → flag `INV` in `Kendala > Selisih Berat/Cordest`. |
| **`typeReconciliation`** | **Observed** (`/invoices` capture) | COD Auto-Reconciliation payout (`invoice.amount == sum(subItems.amount)`; per-AWB `subItem.amount == COD_AMOUNT - estimatedSpecialPrice`). | Match each `subItem.cnote_no` → set `reconciled_provider_cod_credit_idr = subItem.amount` (Mengantar seller credit, not the sender payable) & mark `provider_invoice_reconciled`; flag a `Selisih Sync` row if it differs from `expected_provider_cod_credit_idr`. |
| **`typeRefund`** | **Observed** (`/invoices` capture) | Approved claim credit (`"Claim approved for damaged or lost / returned order <AWB>"`). *(Note: `DELETE /order` cancellation refund behavior is **Unknown**; cancellations reconcile via `GET /order` `isDeleted/status` first, independent of counter `Void`, and link any subsequent refund invoice if emitted).* | Match `<AWB>` to `shipment_claims` → mark claim `paid` & record `CLAIM_PAYOUT_CREDITED`. |
| **`typeWithdraw`** | **Observed** (`/invoices` capture) | Seller balance withdrawal to bank (`statusCleared`). | Record payout in mirror & update `synced_balance_idr`. |
| `typeCorrection`, `typeDeduction`, `typeMismatchM/P`, `typeAddBalanceCredit`, `typeWithdrawal`, `typeWithdrawApi`, or **any unknown `type`** | *Bundle-derived / Open-ended* | Additional adjustment or future provider types. | Never drop unknown types: persist verbatim in `mengantar_invoice_mirror` and surface unlinked/unrecognized rows in the **`Selisih Sync`** review tab. |

---

## 3. Low-Balance Orders (`provider_unpaid_hold` → `POST /order/pay-unpaid`)

When seller balance is insufficient on Non-COD `POST /order`, Mengantar returns HTTP 200 with `ORDER_ID`, `batch` (code), `batch_id` (**24-hex `_id`**), `isPaid: false`, and `cnote_no: null`.

1. **Role-Safe Pre-Flight Warning (Never Leaks Balance to Cashiers):**
   - API returns boolean `balance_sufficient` to POS.
   - **`Gerai Admin` sees:** *"Saldo Mengantar tercatat Rp12.000, estimasi debet Rp19.200."*
   - **`Kasir` sees only:** *"Saldo pengiriman gerai belum mencukupi untuk menerbitkan AWB sekarang. Kiriman akan disimpan sebagai Menunggu Saldo — silakan beri tahu pemilik gerai."* (Zero balance or net-cost numbers exposed, preserving `AGENTS.md §3.4`).
2. **Crash-Safe `pay-unpaid` Settlement:**
   - Because repeat-call idempotency and partial-batch semantics of `POST /order/pay-unpaid` are **Unknown** until M4 sandbox verification, `GeraiVaultDO` writes a `pay_unpaid_in_flight` journal before calling `{ courier, batch_id: mengantar_batch_object_id }`, and **always reads back `GET /order?order_id=`** per member before retrying or unlocking label printing.

---

## 4. Bounded Sync Cadence & Watermark Rules

1. **Triggers (Serialized via `GeraiVaultDO`):** 15-minute Cron for active outlets, event-driven trigger +60s after order/webhook mutations, and manual `[🔄 Sinkronkan Sekarang]` button in `/keuangan` (rate-limited 1 per 30s via `RATE_LIMITER`).
2. **Bounded Pagination & Pending Rescan:**
   - Incremental sync pages `GET /invoices` (size 50) up to a hard cap of **5 pages per run** until hitting known `statusCleared / statusExpired` `_id`s; sets `synced_balance_idr` from the newest `statusCleared` row's `balanceAmount`.
   - *(Assumption to verify in M4 sandbox: `/invoices` sort order and `balanceAmount` monotonicity).* If an unexplained balance jump occurs beyond 5 pages, sync logs a `Selisih Sync` diagnostic banner rather than looping unboundedly.
   - A daily sweep re-queries locally non-final (`pending`) mirror rows by `keyword` / `dateRange` so older top-ups or withdrawals that clear/expire behind the newest-page watermark are never missed.
