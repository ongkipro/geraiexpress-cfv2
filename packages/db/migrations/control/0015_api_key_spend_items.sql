-- Final review (Sol delta C-2/C-4): what each API key reserved against its daily Rupiah cap, per INV (`slug`) or per
-- Paket Massal row (`bulk:<batch>:<row>`). A reservation is released only when non-issue is established (draft or
-- failed after dispatch, definitive pay-unpaid refusal, failed bulk row); a held or ambiguous order keeps it, so
-- automatic unpaid recovery never spends beyond the cap. One row per item: an INV is never counted twice.
CREATE TABLE api_key_spend_items (
  item TEXT PRIMARY KEY,
  key_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  wib_day TEXT NOT NULL,
  amount_idr INTEGER NOT NULL CHECK (amount_idr >= 0),
  created_at INTEGER NOT NULL
);
CREATE INDEX api_key_spend_items_key ON api_key_spend_items(key_id, wib_day);
