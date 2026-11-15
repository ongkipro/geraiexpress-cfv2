-- TASK-204 webhook routing (spec 01 §2.7): path token hash → tenant. The plain token lives only in the URL given to
-- Mengantar and in the tenant object.
CREATE TABLE webhook_routes (
  token_hash TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  key_version INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active','rotating','revoked')),
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX webhook_routes_tenant ON webhook_routes(tenant_id, state);
