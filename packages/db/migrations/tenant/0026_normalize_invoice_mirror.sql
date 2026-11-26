-- TASK-604 (R4 review P1 #2): backfill & re-normalize pre-fix `mengantar_invoice_mirror` rows on existing DOs
-- (incremental sync stops after page 1 once all 50 rows are final, so rows 51+ would otherwise retain inverted signs
-- or NULL `balance_amount_idr` from rejected live Mengantar floats). Also clears legacy bare-date `rescan_range`.
UPDATE mengantar_invoice_mirror
SET balance_amount_idr = CAST(ROUND(json_extract(raw_json, '$.balanceAmount')) AS INTEGER)
WHERE balance_amount_idr IS NULL
  AND json_valid(raw_json) = 1
  AND typeof(json_extract(raw_json, '$.balanceAmount')) IN ('integer', 'real');

UPDATE mengantar_invoice_mirror
SET amount_idr = CASE
  WHEN type = 'typeAddBalance' THEN CASE WHEN COALESCE(total_idr, amount_idr) IS NULL THEN NULL ELSE ABS(COALESCE(total_idr, amount_idr)) END
  WHEN type IN ('typePayment', 'typeWithdraw') THEN CASE WHEN amount_idr IS NULL THEN NULL WHEN amount_idr = 0 THEN 0 ELSE -ABS(amount_idr) END
  WHEN type = 'typeRefund' THEN CASE WHEN amount_idr IS NULL THEN NULL ELSE ABS(amount_idr) END
  ELSE amount_idr
END
WHERE type IN ('typeAddBalance', 'typePayment', 'typeWithdraw', 'typeRefund');

UPDATE finance_sync_state
SET rescan_cursor = NULL, rescan_range = NULL
WHERE rescan_range IS NOT NULL
  AND (
    json_valid(rescan_range) = 0
    OR COALESCE(json_extract(rescan_range, '$.startDate'), '') NOT GLOB '????-??-??T*'
    OR COALESCE(json_extract(rescan_range, '$.endDate'), '') NOT GLOB '????-??-??T*'
  );
