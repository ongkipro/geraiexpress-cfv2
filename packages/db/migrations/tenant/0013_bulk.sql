-- TASK-308 `Paket Massal` (spec 03 §1.3, spec 01 §2.5, DEC-229): one sender, many rows, one counter payment.
CREATE TABLE bulk_import_batches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  sender_contact_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual','csv','xlsx')),
  file_name TEXT,
  mask_preset TEXT NOT NULL DEFAULT 'standar_gerai',
  cod_fee_mode TEXT NOT NULL DEFAULT 'none',
  service_code TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  ready_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL CHECK (state IN ('draft','checking','ready','dispatching','done','partially_failed','cancelled')),
  counter_payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (counter_payment_status IN ('not_required','unpaid','paid','voided')),
  payment_idempotency_key TEXT,
  cash_received_idr INTEGER,
  change_idr INTEGER,
  dispatch_lease_until INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX bulk_import_batches_created ON bulk_import_batches(created_at);

CREATE TABLE bulk_import_rows (
  batch_id TEXT NOT NULL,
  row_no INTEGER NOT NULL,
  raw_json TEXT NOT NULL,
  recipient_name TEXT,
  recipient_phone TEXT,
  street TEXT,
  area_text TEXT,
  area_id TEXT,
  area_label TEXT,
  postal_code TEXT,
  content TEXT,
  weight_gram INTEGER,
  length_cm INTEGER,
  width_cm INTEGER,
  height_cm INTEGER,
  cod_goods_idr INTEGER NOT NULL DEFAULT 0,
  declared_value_idr INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  errors_json TEXT,
  candidates_json TEXT,
  quote_json TEXT,
  quoted_at INTEGER,
  publish_shipping_idr INTEGER,
  cod_fee_idr INTEGER,
  counter_due_idr INTEGER,
  cod_collection_total_idr INTEGER,
  sender_cod_payable_idr INTEGER,
  estimated_margin_idr INTEGER,
  service_code TEXT,
  dispatch_attempted_at INTEGER,
  dispatch_error TEXT,
  state TEXT NOT NULL CHECK (state IN ('pending','needs_fix','ready','created','removed')),
  shipment_slug TEXT,
  PRIMARY KEY (batch_id, row_no)
);
CREATE INDEX bulk_import_rows_slug ON bulk_import_rows(shipment_slug);

ALTER TABLE shipments ADD COLUMN bulk_batch_id TEXT;
