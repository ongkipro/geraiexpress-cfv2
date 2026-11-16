-- TASK-503 API keys for `/api/v1` and `/mcp` (spec 08 §2, DEC-214): `gx_live_<token>` shown once; D1 keeps only the
-- SHA-256 (peppered) hash, a short display prefix, scopes, and usage. Owner-managed per gerai.
CREATE TABLE tenant_api_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 60),
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  daily_issue_cap_idr INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER,
  revoked_by TEXT
);
CREATE INDEX tenant_api_keys_tenant ON tenant_api_keys(tenant_id, revoked_at);

-- Per-key daily spend for `shipments:issue` (WIB day, integer Rupiah of issued counter totals).
CREATE TABLE api_key_daily_usage (
  key_id TEXT NOT NULL,
  wib_day TEXT NOT NULL,
  issued_idr INTEGER NOT NULL DEFAULT 0,
  issued_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, wib_day)
);
