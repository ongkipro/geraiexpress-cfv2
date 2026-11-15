-- TASK-104: transactional email outbox (spec 12 §3, DEC-227). payload_encrypted holds the rendered variables
-- (incl. plain OTP/link) AES-256-GCM-encrypted under KEK_SECRET and is NULLed on sent, terminal failure and expiry.
CREATE TABLE email_outbox (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL CHECK (template_id IN ('signup_otp','password_reset','kasir_invite','email_change_otp','application_status','security_alert')),
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
CREATE INDEX email_outbox_due ON email_outbox(state, next_attempt_at);
CREATE INDEX email_outbox_to ON email_outbox(to_email_hash, created_at);

-- Addresses that hard-bounced or are suppressed by the provider; cleared when the user changes email (spec 12 §7).
CREATE TABLE email_suppressions (
  to_email_hash TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- DEC-218 platform operator legal profile (singleton, all NULL until the owner fills it; read by email footers).
CREATE TABLE platform_legal_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  legal_name TEXT,
  brand_name TEXT NOT NULL DEFAULT 'GeraiExpress',
  entity_type TEXT NOT NULL DEFAULT 'pt',
  nib TEXT,
  encrypted_npwp TEXT,
  akta_number TEXT,
  akta_date TEXT,
  sk_kemenkumham_number TEXT,
  pse_registration_number TEXT,
  registered_address TEXT,
  correspondence_address TEXT,
  support_email TEXT,
  support_whatsapp TEXT,
  privacy_contact_email TEXT,
  director_name TEXT,
  updated_by TEXT,
  updated_at INTEGER
);
INSERT INTO platform_legal_profile (id) VALUES (1);
