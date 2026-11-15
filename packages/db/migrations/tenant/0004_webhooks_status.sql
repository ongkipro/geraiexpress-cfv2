-- TASK-204 status core (spec 01 §2.7, §3). `shipments` starts with the status-relevant columns; dispatch, payment
-- and label columns are added by their tasks (TASK-304 onwards) with ALTER TABLE in later migrations.
CREATE TABLE shipments (
  tenant_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  courier_code TEXT,
  mengantar_order_code TEXT,
  awb_number TEXT,
  status TEXT NOT NULL,
  provider_status TEXT,
  last_provider_event_at INTEGER,
  last_provider_rank INTEGER,
  custody_stage TEXT NOT NULL DEFAULT 'none' CHECK (custody_stage IN ('none','handed_to_courier','rts_at_gerai','rts_returned_to_sender','cancelled_local')),
  custody_at INTEGER,
  provider_status_conflict_at INTEGER,
  stuck_attention_at INTEGER,
  last_polled_at INTEGER,
  index_version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, slug)
);
CREATE INDEX shipments_awb ON shipments(awb_number);
CREATE INDEX shipments_order_code ON shipments(mengantar_order_code);

-- Every provider observation and local custody action, kept verbatim (exact provider time and raw category).
CREATE TABLE shipment_events (
  event_key TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('webhook','poll','local')),
  raw_category TEXT,
  mapped_status TEXT,
  event_at INTEGER NOT NULL,
  event_at_text TEXT,
  recorded_at INTEGER NOT NULL
);
CREATE INDEX shipment_events_slug ON shipment_events(slug, event_at);

-- Verified webhook bodies, inserted in the same transaction as verification, before the 200 (spec 01 §2.7).
CREATE TABLE webhook_inbox (
  event_key TEXT PRIMARY KEY,
  provider_timestamp_raw TEXT NOT NULL,
  provider_event_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  raw_body TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'received' CHECK (state IN ('received','applied','rejected')),
  applied_at INTEGER,
  error TEXT
);
CREATE INDEX webhook_inbox_state ON webhook_inbox(state, received_at);

-- Named object timers (status polling floor, inbox sweep); the single DO alarm is armed at the earliest due time.
CREATE TABLE vault_timers (
  name TEXT PRIMARY KEY,
  due_at INTEGER NOT NULL
);

ALTER TABLE mengantar_connections ADD COLUMN webhook_last_event_at INTEGER;
ALTER TABLE mengantar_connections ADD COLUMN webhook_last_failure_at INTEGER;
ALTER TABLE mengantar_connections ADD COLUMN last_polled_at INTEGER;
