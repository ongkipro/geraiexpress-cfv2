-- TASK-403 pickup manifests (`Surat Jalan`, spec 04 §1, spec 01 §2.4): one open batch per courier; scanned INVs are
-- recorded per batch; handover needs driver fields + signature/photo and moves every scanned INV to custody
-- `handed_to_courier`.
CREATE TABLE pickup_batches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT,
  courier_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','handed_over','dropped_at_branch','cancelled')),
  driver_name TEXT,
  driver_phone TEXT,
  driver_vehicle_no TEXT,
  signature_r2_key TEXT,
  signed_manifest_photo_r2_key TEXT,
  scanned_count INTEGER NOT NULL DEFAULT 0,
  handed_over_at INTEGER,
  handed_over_by TEXT,
  surat_jalan_pdf_r2_key TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX pickup_batches_one_open ON pickup_batches(courier_code) WHERE status = 'open';

CREATE TABLE pickup_batch_items (
  batch_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  scanned_at INTEGER NOT NULL,
  scanned_by TEXT NOT NULL,
  unpaid_warning INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (batch_id, slug)
);
CREATE UNIQUE INDEX pickup_batch_items_slug ON pickup_batch_items(slug);

ALTER TABLE shipments ADD COLUMN pickup_batch_id TEXT;
