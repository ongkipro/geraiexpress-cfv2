-- TASK-105 accounts (spec 05 §2, DEC-209). Secrets are stored only as salted/peppered hashes; emails are stored
-- normalised (lowercase) because login needs them, never logged.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  phone TEXT,
  password_hash TEXT NOT NULL,           -- "pbkdf2-sha256$<iterations>$<salt b64u>$<hash b64u>"
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  email_verified_at INTEGER NOT NULL,
  password_changed_at INTEGER NOT NULL,
  last_login_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- One row per session; the cookie carries the plain token, D1 only its peppered SHA-256.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  host_context TEXT NOT NULL CHECK (host_context IN ('app','owner')),
  active_tenant_id TEXT,
  aal TEXT NOT NULL DEFAULT 'aal1' CHECK (aal IN ('aal1','aal2')),
  totp_verified_at INTEGER,
  device_hash TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  absolute_expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX sessions_user ON sessions(user_id, revoked_at);

-- Email OTPs for sign-up and email change (10 min; 5 wrong → 15 min lock via auth_throttle).
CREATE TABLE email_otps (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('signup','email_change')),
  email_hash TEXT NOT NULL,
  user_id TEXT,
  email_encrypted TEXT NOT NULL,          -- target address (sign-up or new email), AES-256-GCM
  code_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  ticket_hash TEXT,                      -- single-use continuation after a verified sign-up OTP (30 min)
  ticket_expires_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX email_otps_email ON email_otps(email_hash, purpose, created_at);
CREATE INDEX email_otps_ip ON email_otps(ip_hash, created_at);
CREATE UNIQUE INDEX email_otps_ticket ON email_otps(ticket_hash);

CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX password_resets_user ON password_resets(user_id, created_at);

-- Kasir invitations: single use, 7 days, role fixed at invite time.
CREATE TABLE invitations (
  token_hash TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  email_hash TEXT NOT NULL,
  email TEXT NOT NULL CHECK (email = lower(email)),
  role TEXT NOT NULL CHECK (role IN ('cashier','gerai_admin')),
  invited_by TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  consumed_by TEXT,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX invitations_tenant ON invitations(tenant_id, created_at);

-- Fixed-window throttles and locks (OTP wrong entries, login failures).
CREATE TABLE auth_throttle (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL,
  locked_until INTEGER
);

-- Devices seen per user (a new one triggers the security_alert email for owners and Super Admins).
CREATE TABLE known_devices (
  user_id TEXT NOT NULL REFERENCES users(id),
  device_hash TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, device_hash)
);
