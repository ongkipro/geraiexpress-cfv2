-- TASK-304 checkout, dispatch, payment record and cancellation (spec 01 §2.3–2.4, spec 03 §1.1, ADR-0004).
-- The status core (`shipments`, TASK-204) gains the checkout projection; money columns are integer IDR.
ALTER TABLE shipments ADD COLUMN quote_snapshot_id TEXT;
ALTER TABLE shipments ADD COLUMN entry_channel TEXT NOT NULL DEFAULT 'counter_pos';
ALTER TABLE shipments ADD COLUMN outlet_id TEXT;
ALTER TABLE shipments ADD COLUMN sender_contact_id TEXT;
ALTER TABLE shipments ADD COLUMN recipient_contact_id TEXT;
ALTER TABLE shipments ADD COLUMN cashier_shift_id TEXT;
ALTER TABLE shipments ADD COLUMN created_by_user_id TEXT;
ALTER TABLE shipments ADD COLUMN dispatch_state TEXT NOT NULL DEFAULT 'draft' CHECK (dispatch_state IN ('draft','issuing_in_flight','reconciliation_needed','provider_unpaid_hold','issued','failed','cancel_in_flight','cancel_unknown','cancelled'));
ALTER TABLE shipments ADD COLUMN dispatch_error TEXT;
ALTER TABLE shipments ADD COLUMN service_code TEXT;
ALTER TABLE shipments ADD COLUMN is_cargo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN cod_fee_mode TEXT;
ALTER TABLE shipments ADD COLUMN mengantar_order_item_id TEXT;
ALTER TABLE shipments ADD COLUMN mengantar_batch_code TEXT;
ALTER TABLE shipments ADD COLUMN mengantar_batch_object_id TEXT;
ALTER TABLE shipments ADD COLUMN payment_sync_state TEXT NOT NULL DEFAULT 'unissued' CHECK (payment_sync_state IN ('unissued','provider_unpaid','provider_paid_estimated','provider_invoice_reconciled'));
ALTER TABLE shipments ADD COLUMN sorting_code TEXT;
ALTER TABLE shipments ADD COLUMN provider_echoed_weight_kg_text TEXT;
ALTER TABLE shipments ADD COLUMN provider_cod_fee_raw_text TEXT;
ALTER TABLE shipments ADD COLUMN quote_drift INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN true_sender_json TEXT;
ALTER TABLE shipments ADD COLUMN true_recipient_json TEXT;
ALTER TABLE shipments ADD COLUMN content_declaration_text TEXT;
ALTER TABLE shipments ADD COLUMN prohibited_ack_at INTEGER;
ALTER TABLE shipments ADD COLUMN publish_shipping_idr INTEGER;
ALTER TABLE shipments ADD COLUMN gerai_shipping_cost_idr INTEGER;
ALTER TABLE shipments ADD COLUMN packing_addon_idr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN counter_service_fee_idr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN promo_discount_idr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN insurance_fee_idr INTEGER;
ALTER TABLE shipments ADD COLUMN cod_goods_amount_idr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN cod_service_fee_idr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN cod_collection_total_idr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN counter_due_idr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN counter_total_paid_idr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN expected_provider_cod_credit_idr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN sender_cod_payable_idr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN actual_weight_gram INTEGER;
ALTER TABLE shipments ADD COLUMN billable_weight_gram INTEGER;
ALTER TABLE shipments ADD COLUMN counter_payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (counter_payment_status IN ('not_required','unpaid','paid','voided'));
ALTER TABLE shipments ADD COLUMN counter_payment_method TEXT CHECK (counter_payment_method IS NULL OR counter_payment_method IN ('qris','tunai','transfer','deposit'));
ALTER TABLE shipments ADD COLUMN counter_paid_at INTEGER;
ALTER TABLE shipments ADD COLUMN counter_paid_by TEXT;
ALTER TABLE shipments ADD COLUMN counter_paid_shift_id TEXT;
ALTER TABLE shipments ADD COLUMN counter_payment_note TEXT;
ALTER TABLE shipments ADD COLUMN first_printed_at INTEGER;
ALTER TABLE shipments ADD COLUMN print_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN issued_at INTEGER;
ALTER TABLE shipments ADD COLUMN cancelled_at INTEGER;

-- Write-ahead journal for every provider call that moves money or creates/cancels an order (ADR-0004 §1).
CREATE TABLE dispatch_journal (
  idempotency_key TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('create_order','pay_unpaid','cancel_order')),
  state TEXT NOT NULL CHECK (state IN ('in_flight','done','failed','unknown')),
  request_json TEXT,
  result_json TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX dispatch_journal_slug ON dispatch_journal(slug, created_at);

CREATE TABLE counter_receipts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  shipment_slug TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('mark_paid','void_payment','sender_cod_payout','void_sender_payout')),
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  amount_idr INTEGER NOT NULL CHECK (amount_idr > 0),
  method TEXT NOT NULL CHECK (method IN ('qris','tunai','transfer','deposit')),
  cash_received_idr INTEGER,
  change_idr INTEGER,
  shift_id TEXT,
  actor_user_id TEXT NOT NULL,
  reason TEXT,
  voids_receipt_id TEXT,
  bulk_batch_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX counter_receipts_slug ON counter_receipts(shipment_slug, created_at);
CREATE INDEX counter_receipts_shift ON counter_receipts(shift_id);
