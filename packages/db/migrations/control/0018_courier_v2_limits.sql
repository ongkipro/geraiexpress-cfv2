-- DEC-238 Mengantar Public API Sandbox v2.0.0 parity (check-shipping-fee "Courier limits" + "Courier rules",
-- create-order body rules). Limits are catalog data so a change needs no code: COD amount bounds, non-COD goods-value
-- bounds, weight caps, and which services carry dangerous goods. `booking_eco` books J&T ECO as `courier: "JT"` +
-- `eco: true`. (A `courier=all` estimate answers `SAP`/`SAPCargo` for the `Sap` service codes; the tenant object
-- normalises those keys, so service codes stay as seeded.)
ALTER TABLE courier_service_catalog ADD COLUMN min_cod_idr INTEGER;
ALTER TABLE courier_service_catalog ADD COLUMN max_cod_idr INTEGER;
ALTER TABLE courier_service_catalog ADD COLUMN min_goods_value_idr INTEGER;
ALTER TABLE courier_service_catalog ADD COLUMN max_goods_value_idr INTEGER;
ALTER TABLE courier_service_catalog ADD COLUMN dg_supported INTEGER NOT NULL DEFAULT 0 CHECK (dg_supported IN (0,1));
ALTER TABLE courier_service_catalog ADD COLUMN booking_eco INTEGER NOT NULL DEFAULT 0 CHECK (booking_eco IN (0,1));

-- Maximum COD: Rp2.000.000 for Sap, anteraja and pos; Rp5.000.000 for the others. Minimum Rp1.000, Rp10.000 for lion.
UPDATE courier_service_catalog SET min_cod_idr = 1000, max_cod_idr = 5000000 WHERE cod_supported = 1;
UPDATE courier_service_catalog SET max_cod_idr = 2000000 WHERE cod_supported = 1 AND courier_code IN ('Sap','anteraja','pos');
UPDATE courier_service_catalog SET min_cod_idr = 10000 WHERE courier_code = 'lion';
-- anteraja, pos and spx: 1–50 kg and a non-COD goods value of Rp1.000–Rp10.000.000. JT rejects more than 50 kg.
UPDATE courier_service_catalog SET max_weight_gram = 50000, min_goods_value_idr = 1000, max_goods_value_idr = 10000000 WHERE courier_code IN ('anteraja','pos','spx');
UPDATE courier_service_catalog SET max_weight_gram = 50000 WHERE service_code = 'JT';
-- Dangerous goods: only SiCepat (HALU) and iDexpress regular (create-order "Dangerous Goods"); never cargo or ECO.
UPDATE courier_service_catalog SET dg_supported = 1 WHERE service_code IN ('SiCepat','iDexpress');
UPDATE courier_service_catalog SET note = 'COD Pos Indonesia butuh tingkat terkirim minimal 82% (periode 21–60 hari). Wajib titik koordinat untuk penjemputan.' WHERE service_code = 'pos';

INSERT INTO courier_service_catalog (service_code, courier_code, courier_name, display_name, service_class, pickup_capability, cod_supported, min_weight_gram, max_weight_gram, rounding_tolerance_gram, is_active, sort_order, note, updated_at, min_cod_idr, max_cod_idr, dg_supported, booking_eco) VALUES
  ('JTEco',   'JT',  'J&T Express', 'J&T ECO',  'regular', 'pickup_and_drop_off', 1, NULL, 50000, 300, 1, 51, 'J&T ECO hanya tersedia di sebagian rute.', 0, 1000, 5000000, 0, 1),
  -- Listed by `courier=all` but the Public API has no field to book it (create-order accepts only `courier: "Sap"`),
  -- so it stays inactive: quoting a service that cannot be booked would let the counter sell a different tariff.
  ('SAPLite', 'Sap', 'SAP Express', 'SAP Lite', 'regular', 'pickup_and_drop_off', 0, NULL, 500,   300, 0, 32, 'Belum bisa dipesan lewat Public API Mengantar.', 0, NULL, NULL, 0, 0);
