-- TASK-206 courier/service catalog (D1, platform-owned; spec 01 §1, spec 02 §1, spec 04 §2). Rows are data: adding a
-- service or changing a rule needs no code change. `courier_code` is the Mengantar `courier` parameter; `service_code`
-- is the estimate rate key. Seeded only with rules verified in the Mengantar docs (skill reference 2026-11-11).
CREATE TABLE courier_service_catalog (
  service_code TEXT PRIMARY KEY,
  courier_code TEXT NOT NULL,
  courier_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  service_class TEXT NOT NULL CHECK (service_class IN ('regular','cargo')),
  pickup_capability TEXT NOT NULL CHECK (pickup_capability IN ('pickup_and_drop_off','pickup_only','drop_off_only')),
  cod_supported INTEGER NOT NULL CHECK (cod_supported IN (0,1)),
  min_weight_gram INTEGER,
  max_weight_gram INTEGER,
  rounding_tolerance_gram INTEGER NOT NULL DEFAULT 300,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  sort_order INTEGER NOT NULL,
  note TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX courier_service_catalog_courier ON courier_service_catalog(courier_code, sort_order);

INSERT INTO courier_service_catalog (service_code, courier_code, courier_name, display_name, service_class, pickup_capability, cod_supported, min_weight_gram, max_weight_gram, rounding_tolerance_gram, is_active, sort_order, note, updated_at) VALUES
  ('JNE',            'JNE',       'JNE', 'JNE Reguler',        'regular', 'pickup_and_drop_off', 1, NULL,  NULL,  300, 1, 10,  NULL, 0),
  ('JNECargo',       'JNE',       'JNE', 'JNE Cargo',          'cargo',   'pickup_and_drop_off', 0, NULL,  NULL,  300, 1, 11,  'Cargo hanya untuk kiriman Non-COD.', 0),
  ('SiCepat',        'SiCepat',   'SiCepat', 'SiCepat Reguler',    'regular', 'pickup_and_drop_off', 1, NULL,  NULL,  300, 1, 20,  'Di beberapa wilayah SiCepat hanya menerima antar ke agen.', 0),
  ('SiCepatCargo',   'SiCepat',   'SiCepat', 'SiCepat Cargo',      'cargo',   'pickup_and_drop_off', 0, NULL,  NULL,  300, 1, 21,  'Cargo hanya untuk kiriman Non-COD.', 0),
  ('Sap',            'Sap',       'SAP Express', 'SAP Express',        'regular', 'pickup_and_drop_off', 1, NULL,  NULL,  300, 1, 30,  NULL, 0),
  ('SapCargo',       'Sap',       'SAP Express', 'SAP Cargo',          'cargo',   'pickup_and_drop_off', 0, NULL,  NULL,  300, 1, 31,  'Cargo hanya untuk kiriman Non-COD.', 0),
  ('iDexpress',      'iDexpress', 'iDexpress', 'iDexpress Reguler',  'regular', 'pickup_and_drop_off', 1, NULL,  NULL,  300, 1, 40,  NULL, 0),
  ('iDexpressCargo', 'iDexpress', 'iDexpress', 'iDexpress Cargo',    'cargo',   'pickup_and_drop_off', 0, NULL,  NULL,  300, 1, 41,  'Cargo hanya untuk kiriman Non-COD.', 0),
  ('JT',             'JT',        'J&T Express', 'J&T Express',        'regular', 'pickup_and_drop_off', 1, NULL,  NULL,  300, 1, 50,  NULL, 0),
  ('lion',           'lion',      'Lion Parcel', 'Lion Parcel',        'regular', 'pickup_and_drop_off', 1, NULL,  NULL,  310, 1, 60,  NULL, 0),
  ('anteraja',       'anteraja',  'Anteraja', 'Anteraja',           'regular', 'pickup_only',         1, NULL,  NULL,  300, 1, 70,  'Anteraja selalu dijemput kurir.', 0),
  ('pos',            'pos',       'Pos Indonesia', 'Pos Indonesia',      'regular', 'pickup_and_drop_off', 1, NULL,  NULL,  300, 1, 80,  'COD Pos Indonesia butuh riwayat kiriman dengan tingkat terkirim minimal 82%.', 0),
  ('spx',            'spx',       'SPX Express', 'SPX Express',        'regular', 'pickup_and_drop_off', 1, NULL,  50000, 300, 1, 90,  'Antar ke agen hanya bila fitur SPX Drop Off aktif di akun Mengantar.', 0),
  ('ninja',          'ninja',     'Ninja Xpress', 'Ninja Xpress',       'regular', 'pickup_and_drop_off', 1, NULL,  NULL,  300, 0, 100, 'Dihentikan Mengantar sejak 1 Sep 2026.', 0);
