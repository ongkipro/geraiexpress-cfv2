-- Final review (M4 #4): a run capped at 5 pages stores where it stopped; later runs refresh the newest page, then
-- continue from this cursor until the history is fully read (rows past page 5 are never orphaned).
ALTER TABLE finance_sync_state ADD COLUMN backfill_cursor TEXT;
-- Final review (Sol delta C-3): the daily pending rescan reads a FIXED range (oldest → newest non-final day) and
-- continues it from here on the next run, so old pending invoices behind many newer ones are always reached.
ALTER TABLE finance_sync_state ADD COLUMN rescan_cursor TEXT;
ALTER TABLE finance_sync_state ADD COLUMN rescan_range TEXT;
