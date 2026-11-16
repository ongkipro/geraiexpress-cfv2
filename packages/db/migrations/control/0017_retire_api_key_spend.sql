-- Final review (Sol delta round 2): the API-key daily cap ledger moved into each tenant object (`api_key_spend`,
-- tenant 0022) so a reservation commits in the same transaction as the dispatch journal (no cross-request release
-- races, tenant-local slugs, atomic release). The D1 counters are retired.
DROP TABLE api_key_spend_items;
DROP TABLE api_key_daily_usage;
