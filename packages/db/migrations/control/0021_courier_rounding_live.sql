-- TASK-604 live Mengantar production weight-rounding parity (verified 2026-11-26,
-- docs/evidence/TASK-604/mengantar-prod-checks-2026-11-26.md):
-- - SAP & SPX bill 2 kg starting at 1.30 kg (1.29 kg = 1 kg) -> rounding_tolerance_gram = 299.
-- - Lion Parcel bills 2 kg starting at 1.31 kg (1.305 kg = 1 kg) -> rounding_tolerance_gram = 300 (safe integer ceiling).
-- - iDexpress sub-kg (<= 500 g `iDlite`) returns a 10% discount under the `iDexpress` key (vs 30% regular), so
--   min_weight_gram remains NULL (1 kg) to keep TASK-207 discount verification clean.
UPDATE courier_service_catalog SET rounding_tolerance_gram = 299, updated_at = 1795680000000 WHERE service_code IN ('Sap', 'spx');
UPDATE courier_service_catalog SET rounding_tolerance_gram = 300, updated_at = 1795680000000 WHERE service_code = 'lion';
