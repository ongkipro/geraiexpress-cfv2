-- Final review (M4 #4): a run capped at 5 pages stores where it stopped; later runs refresh the newest page, then
-- continue from this cursor until the history is fully read (rows past page 5 are never orphaned).
ALTER TABLE finance_sync_state ADD COLUMN backfill_cursor TEXT;
