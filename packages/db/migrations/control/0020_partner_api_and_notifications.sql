-- Super Admin Mengantar Partner API runtime configuration (encrypted at rest with KEK_SECRET) and widened
-- email_outbox template check for registration & Super Admin new-application notifications.
CREATE TABLE platform_partner_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  partner_id TEXT,
  partner_origin TEXT,
  public_origin TEXT,
  partner_secret_encrypted TEXT,
  partner_secret_tail TEXT,
  relay_url TEXT,
  relay_secret_encrypted TEXT,
  relay_secret_tail TEXT,
  updated_by TEXT,
  updated_at INTEGER
);
INSERT INTO platform_partner_config (id) VALUES (1);

CREATE TABLE email_outbox_new (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL CHECK (template_id IN (
    'signup_otp','password_reset','kasir_invite','email_change_otp','application_status','security_alert',
    'application_submitted','admin_new_application'
  )),
  to_email_hash TEXT NOT NULL,
  to_email_encrypted TEXT,
  payload_encrypted TEXT,
  expires_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','sending','sent','failed','expired','suppressed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  lease_until INTEGER,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  provider_message_id TEXT,
  last_error_code TEXT
);
INSERT INTO email_outbox_new SELECT * FROM email_outbox;
DROP TABLE email_outbox;
ALTER TABLE email_outbox_new RENAME TO email_outbox;
CREATE INDEX email_outbox_due ON email_outbox(state, next_attempt_at);
CREATE INDEX email_outbox_to ON email_outbox(to_email_hash, created_at);
