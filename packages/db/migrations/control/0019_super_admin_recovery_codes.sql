-- DEC-246 backup second factor for Super Admin: 8 single-use recovery codes per admin. Only the peppered hash is stored
-- (tokenHash(AUTH_SESSION_PEPPER, "totp_recovery", code)); a code is consumed by setting used_at once. A new set
-- replaces the old one; a TOTP reset by another admin deletes them. Forward-only.
CREATE TABLE super_admin_recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES super_admins(user_id),
  code_hash TEXT NOT NULL CHECK (length(code_hash) = 64),
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX super_admin_recovery_codes_user ON super_admin_recovery_codes(user_id, used_at);
