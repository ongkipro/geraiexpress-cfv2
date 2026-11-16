-- TASK-310 settings pages (visual 08 §2.3, DEC-218/223/225). Outlet profile fields the counter and mini-site use,
-- and the packing add-on catalogue (outlet-kept, `Packing & Biaya`).
ALTER TABLE tenant_outlets ADD COLUMN whatsapp TEXT;
ALTER TABLE tenant_outlets ADD COLUMN opening_hours TEXT;
ALTER TABLE tenant_outlets ADD COLUMN logo_media_id TEXT;

CREATE TABLE packing_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 40),
  price_idr INTEGER NOT NULL CHECK (price_idr BETWEEN 0 AND 1000000),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
