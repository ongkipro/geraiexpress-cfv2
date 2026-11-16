-- TASK-405 exceptions and claims (spec 04 §3): one claim record per INV + kind with its frozen filing deadline, the
-- packet (photos/notes) and its lifecycle; conflict notes for `Status Bertentangan`.
CREATE TABLE shipment_claims (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  shipment_slug TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('rusak','hilang','isi_kurang')),
  status TEXT NOT NULL CHECK (status IN ('draft','submitted','approved','rejected','paid','expired')),
  deadline_at INTEGER,
  note TEXT,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  submitted_at INTEGER,
  decided_at INTEGER,
  paid_invoice_id TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX shipment_claims_slug_kind ON shipment_claims(shipment_slug, kind);

ALTER TABLE shipments ADD COLUMN conflict_note TEXT;
ALTER TABLE shipments ADD COLUMN conflict_resolved_at INTEGER;
