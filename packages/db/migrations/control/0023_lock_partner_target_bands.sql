-- DEC-258 Lock default & ceiling discount bands to Partner Target Gerai (Master - 5% platform margin).
-- Regular couriers: 20% min / 25% default / 25% max (2000 / 2500 / 2500 bps).
-- Pos Indonesia: 10% min / 10% default / 10% max (1000 / 1000 / 1000 bps).
-- Existing tenant_discount_rules (e.g. existing high-discount BYOK accounts) are never modified.
UPDATE platform_pricing_policy
SET min_discount_bps = 2000,
    default_discount_bps = 2500,
    max_discount_bps = 2500,
    updated_at = 0,
    updated_by = 'system'
WHERE id = 1;

INSERT INTO courier_discount_policy (courier_code, default_discount_bps, min_discount_bps, max_discount_bps, updated_at, updated_by)
SELECT courier_code,
       MAX(0, master_discount_bps - platform_margin_bps) AS default_discount_bps,
       MIN(2000, MAX(0, master_discount_bps - platform_margin_bps)) AS min_discount_bps,
       MAX(0, master_discount_bps - platform_margin_bps) AS max_discount_bps,
       0,
       'system'
FROM partner_discount_schedule
WHERE 1 = 1
ON CONFLICT(courier_code) DO UPDATE SET
  default_discount_bps = excluded.default_discount_bps,
  min_discount_bps = excluded.min_discount_bps,
  max_discount_bps = excluded.max_discount_bps,
  updated_at = excluded.updated_at,
  updated_by = excluded.updated_by;
