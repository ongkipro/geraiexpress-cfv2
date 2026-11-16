-- TASK-505 custom domains (spec 11 §4–7, DEC-228). Pro entitlement per gerai (set by Super Admin with TOTP + reason),
-- lifecycle bookkeeping on tenant_hostnames, and the daily Cloudflare for SaaS quota snapshot.
ALTER TABLE tenants ADD COLUMN custom_domain_enabled INTEGER NOT NULL DEFAULT 0 CHECK (custom_domain_enabled IN (0, 1));

ALTER TABLE tenant_hostnames ADD COLUMN ssl_method TEXT CHECK (ssl_method IN ('http','txt'));
-- DNS/DCV records to show the owner (Cloudflare `ownership_verification` + `ssl.validation_records`), no secrets.
ALTER TABLE tenant_hostnames ADD COLUMN dns_records_json TEXT;
-- When `state` last changed: the 7-day reaper and the owner page read it.
ALTER TABLE tenant_hostnames ADD COLUMN state_changed_at INTEGER;
-- Consecutive failed activation/health probes (reset on success).
ALTER TABLE tenant_hostnames ADD COLUMN probe_failures INTEGER NOT NULL DEFAULT 0;
CREATE INDEX tenant_hostnames_state ON tenant_hostnames(kind, state, last_checked_at);

CREATE TABLE custom_hostname_quota (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  used INTEGER NOT NULL,
  allocated INTEGER NOT NULL,
  hard_cap INTEGER,
  checked_at INTEGER NOT NULL
);
