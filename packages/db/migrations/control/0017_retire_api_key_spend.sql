-- Final review (Sol delta round 2): the API-key daily cap ledger moved into each tenant object (`api_key_spend`,
-- tenant 0022) so a reservation commits in the same transaction as the dispatch journal (no cross-request release
-- races, tenant-local slugs, atomic release). The D1 counters are retired.
--
-- Fail closed instead of discarding live spend (Sol round 3): no deployed environment has ever written these tables
-- (no staging/production exists before TASK-109/602), but if one had, this migration aborts on any outstanding
-- reservation or any spend recorded for the current WIB day. Drain first: wait for the next WIB day and resolve held
-- orders, then re-run.
CREATE TABLE _gx_retire_guard (n INTEGER NOT NULL CHECK (n = 0));
INSERT INTO _gx_retire_guard (n) SELECT COUNT(*) FROM api_key_spend_items;
INSERT INTO _gx_retire_guard (n) SELECT COUNT(*) FROM api_key_daily_usage WHERE wib_day >= date('now', '+7 hours') AND issued_idr > 0;
DROP TABLE _gx_retire_guard;
DROP TABLE api_key_spend_items;
DROP TABLE api_key_daily_usage;
