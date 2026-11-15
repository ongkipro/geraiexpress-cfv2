-- TASK-206 per-outlet courier preferences (`Pengaturan › Ekspedisi Aktif`). A missing row = enabled with the catalog
-- default pickup mode; rows are written only when the owner changes something.
CREATE TABLE tenant_courier_prefs (
  tenant_id TEXT NOT NULL,
  courier_code TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  pickup_mode TEXT NOT NULL CHECK (pickup_mode IN ('scheduled_pickup','drop_off_only')),
  updated_at INTEGER NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (tenant_id, courier_code)
);
