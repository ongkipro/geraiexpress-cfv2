-- TASK-501 `Kirim dari Rumah` (DEC-207, visual 03 §1 tab 2): a public QR pre-booking holds the visitor's typed data
-- for 48 hours under its own INV slug; the counter claims it into a normal checkout (contacts + fresh quote).
CREATE TABLE minisite_drafts (
  slug TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  cod INTEGER NOT NULL CHECK (cod IN (0,1)),
  sender_name TEXT NOT NULL,
  sender_phone TEXT NOT NULL,
  sender_store TEXT,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  recipient_area_id TEXT NOT NULL,
  recipient_area_label TEXT,
  recipient_street TEXT NOT NULL,
  content TEXT NOT NULL,
  weight_gram INTEGER NOT NULL CHECK (weight_gram BETWEEN 10 AND 100000),
  cod_goods_idr INTEGER NOT NULL DEFAULT 0,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  claimed_at INTEGER,
  claimed_by TEXT
);
CREATE INDEX minisite_drafts_expires ON minisite_drafts(expires_at);

-- Phone-gate attempts on public tracking (per INV; 5 wrong → 15 min lock).
CREATE TABLE tracking_unlocks (
  slug TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  updated_at INTEGER NOT NULL
);
