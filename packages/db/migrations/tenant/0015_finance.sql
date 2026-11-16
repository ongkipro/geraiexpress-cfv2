-- TASK-401 dual book (spec 09, DEC-216): Book 2 mirrors Mengantar `GET /invoices` (append/upsert, PII stripped); the
-- per-INV reconciled provider amounts land on `shipments`; unknown or unmatched rows surface in `Selisih Sync`.
CREATE TABLE mengantar_invoice_mirror (
  invoice_id TEXT PRIMARY KEY,
  inv_number TEXT,
  type TEXT NOT NULL,
  status TEXT,
  courier TEXT,
  order_code TEXT,
  awb_number TEXT,
  amount_idr INTEGER,
  total_idr INTEGER,
  balance_amount_idr INTEGER,
  description TEXT,
  provider_created_at INTEGER,
  provider_updated_at INTEGER,
  raw_json TEXT NOT NULL,
  link_state TEXT NOT NULL CHECK (link_state IN ('linked','partial','unlinked','not_applicable','unknown_type')),
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX mengantar_invoice_mirror_created ON mengantar_invoice_mirror(provider_created_at);
CREATE INDEX mengantar_invoice_mirror_state ON mengantar_invoice_mirror(link_state);

CREATE TABLE mengantar_invoice_subitems (
  invoice_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  awb_number TEXT,
  order_code TEXT,
  batch_code TEXT,
  amount_idr INTEGER,
  cod_amount_idr INTEGER,
  estimated_price_idr INTEGER,
  estimated_special_price_idr INTEGER,
  cod_fee_raw_text TEXT,
  shipment_slug TEXT,
  PRIMARY KEY (invoice_id, idx)
);
CREATE INDEX mengantar_invoice_subitems_slug ON mengantar_invoice_subitems(shipment_slug);

-- `Selisih Sync`: one row per finding (unknown type, unmatched row, amount differs from the frozen quote).
CREATE TABLE finance_discrepancies (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('unknown_type','unmatched','cod_credit_differs','debit_differs','adjustment','balance_gap')),
  shipment_slug TEXT,
  expected_idr INTEGER,
  actual_idr INTEGER,
  detail TEXT,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL
);
-- shipment_slug is '' (not NULL) when a finding has no INV, so the upsert key stays unique.
CREATE UNIQUE INDEX finance_discrepancies_key ON finance_discrepancies(invoice_id, kind, shipment_slug);

CREATE TABLE finance_sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_run_at INTEGER,
  last_ok_at INTEGER,
  last_trigger TEXT,
  last_pages INTEGER,
  last_error TEXT,
  last_manual_at INTEGER,
  last_pending_rescan_at INTEGER,
  running_since INTEGER
);
INSERT INTO finance_sync_state (id) VALUES (1);

ALTER TABLE shipments ADD COLUMN provider_reconciled_cost_idr INTEGER;
ALTER TABLE shipments ADD COLUMN reconciled_extra_adjustment_idr INTEGER;
