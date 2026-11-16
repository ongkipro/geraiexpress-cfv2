-- Final review (M3 #7, M5 #2): the counter service fee and promo discount are part of the frozen quote, so the INV
-- draft, receipts and Laba Kas carry exactly what the counter quoted.
ALTER TABLE quote_snapshots ADD COLUMN counter_service_fee_idr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quote_snapshots ADD COLUMN promo_discount_idr INTEGER NOT NULL DEFAULT 0;
