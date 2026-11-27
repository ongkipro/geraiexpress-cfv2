-- DEC-256 Mengantar Partner Master Discount Schedule & 500 bps (5%) Platform Margin Split.
-- Reference schedule per courier (editable by Super Admin with TOTP + reason + audit):
--   Master Rate (from Mengantar to partner `ongkirich`) - Platform Margin (500 bps) = Target Gerai Discount.
-- Stored separately from `courier_discount_policy` so resetting a courier's band override never erases the Master Rate.
CREATE TABLE partner_discount_schedule (
  courier_code TEXT PRIMARY KEY,
  master_discount_bps INTEGER NOT NULL CHECK (master_discount_bps BETWEEN 0 AND 10000),
  extra_promo_bps INTEGER NOT NULL DEFAULT 0 CHECK (extra_promo_bps BETWEEN 0 AND 10000),
  extra_promo_note TEXT,
  platform_margin_bps INTEGER NOT NULL DEFAULT 500 CHECK (platform_margin_bps BETWEEN 0 AND master_discount_bps),
  updated_at INTEGER NOT NULL,
  updated_by TEXT,
  CHECK (master_discount_bps + extra_promo_bps <= 10000)
);

INSERT INTO partner_discount_schedule (courier_code, master_discount_bps, extra_promo_bps, extra_promo_note, platform_margin_bps, updated_at, updated_by) VALUES
  ('JNE',       3000, 0,   NULL, 500, 0, 'system'),
  ('SiCepat',   3000, 0,   NULL, 500, 0, 'system'),
  ('Sap',       3000, 0,   NULL, 500, 0, 'system'),
  ('iDexpress', 3000, 0,   NULL, 500, 0, 'system'),
  ('JT',        3000, 500, 'Promo ekstra J&T EZ mengikuti ketentuan Mengantar.', 500, 0, 'system'),
  ('lion',      3000, 0,   NULL, 500, 0, 'system'),
  ('anteraja',  3000, 0,   NULL, 500, 0, 'system'),
  ('pos',       1500, 0,   NULL, 500, 0, 'system'),
  ('spx',       3000, 500, 'Promo ekstra SPX mengikuti ketentuan Mengantar.', 500, 0, 'system');
