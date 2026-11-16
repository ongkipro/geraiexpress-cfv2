-- Final review (Sol delta C-3): the daily pending rescan reads a FIXED range (oldest → newest non-final day) and
-- continues it from here on the next run, so old pending invoices behind many newer ones are always reached.
ALTER TABLE finance_sync_state ADD COLUMN rescan_cursor TEXT;
ALTER TABLE finance_sync_state ADD COLUMN rescan_range TEXT;

-- Final review (Sol delta round 2): the per-API-key daily Rupiah cap (spec 08 §2) is accounted HERE, in the tenant
-- object that dispatches, so a reservation is taken and released in the same transaction as the dispatch journal
-- (no race with a concurrent request, one row per INV, tenant-local slugs). Kept for issued, held and ambiguous
-- orders; deleted when non-issue is established (rejected, read back as not found, cancelled).
CREATE TABLE api_key_spend (
  slug TEXT PRIMARY KEY,
  key_id TEXT NOT NULL,
  wib_day TEXT NOT NULL,
  amount_idr INTEGER NOT NULL CHECK (amount_idr >= 0),
  created_at INTEGER NOT NULL
);
CREATE INDEX api_key_spend_key_day ON api_key_spend(key_id, wib_day);
