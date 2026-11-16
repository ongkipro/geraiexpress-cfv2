-- TASK-305 masking (ADR-0005, DEC-206, DEC-231): the chosen preset and its immutable print snapshot on the INV, and
-- the per-WIB-day count of sender-masked issues for `masking_daily_quota`.
ALTER TABLE shipments ADD COLUMN mask_preset TEXT NOT NULL DEFAULT 'standar_gerai' CHECK (mask_preset IN ('standar_gerai','dropship_toko','privasi_penerima_cod','full_nama_gerai'));
ALTER TABLE shipments ADD COLUMN mask_snapshot_json TEXT;
ALTER TABLE shipments ADD COLUMN pickup_snapshot_json TEXT;
CREATE TABLE masking_usage (
  wib_day TEXT PRIMARY KEY,
  count INTEGER NOT NULL
);
