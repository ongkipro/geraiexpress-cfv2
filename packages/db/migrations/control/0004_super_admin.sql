-- TASK-106 Super Admin (spec 05 §1–2, DEC-209). TOTP secret AES-256-GCM-encrypted (purpose "totp"); a pending
-- enrolment exists until the admin proves the first code. Recovery/enrolment by another Super Admin is audited.
CREATE TABLE super_admins (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  totp_secret_encrypted TEXT,
  totp_state TEXT NOT NULL DEFAULT 'pending' CHECK (totp_state IN ('pending','active','reset')),
  totp_last_step INTEGER,               -- last accepted 30 s step (replay guard)
  enrolled_by TEXT,
  enrolled_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
