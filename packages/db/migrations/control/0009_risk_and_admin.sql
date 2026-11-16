-- TASK-208 cross-tenant COD risk index (spec 01 §2.6) and the Super Admin `risk_review` permission (spec 05 §1).
-- No plain phone in D1: `phone_hmac` = HMAC-SHA256(normalised phone) with the server pepper. Rows arrive from each
-- tenant object's outbox as absolute, versioned upserts (a retried or reordered message never double-counts).
CREATE TABLE recipient_risk_index (
  phone_hmac TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  delivered_count INTEGER NOT NULL CHECK (delivered_count >= 0),
  rts_count INTEGER NOT NULL CHECK (rts_count >= 0),
  last_event_at INTEGER NOT NULL,
  version INTEGER NOT NULL,
  PRIMARY KEY (phone_hmac, tenant_id)
);

ALTER TABLE super_admins ADD COLUMN risk_review INTEGER NOT NULL DEFAULT 0 CHECK (risk_review IN (0,1));
