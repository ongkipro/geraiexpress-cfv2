-- TASK-103 baseline (D1 control plane, ADR-0006). Forward-only; never edit after any remote database has seen it.
-- Timestamps: UTC epoch ms INTEGER. Money _idr / weights _gram / rates _bps: INTEGER. NULL is distinct from 0.

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,                                   -- opaque id (crypto.randomUUID)
  -- spec 06 §1: 3–30 chars of [a-z0-9-], no leading/trailing hyphen (reserved words are checked in code).
  slug TEXT NOT NULL UNIQUE CHECK (length(slug) BETWEEN 3 AND 30 AND slug NOT GLOB '*[^a-z0-9-]*' AND slug NOT GLOB '-*' AND slug NOT GLOB '*-'),
  name TEXT NOT NULL,
  -- Public mini-site profile (spec 01 §2.1), read by cached SSR without waking the tenant object.
  logo_r2_key TEXT,
  contact_whatsapp TEXT,
  operating_hours_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft_application'
    CHECK (status IN ('draft_application','pending_review','active','suspended')),
  routing_version INTEGER NOT NULL DEFAULT 1,
  masking_enabled INTEGER NOT NULL DEFAULT 0 CHECK (masking_enabled IN (0,1)),
  masking_daily_quota INTEGER,                           -- NULL = no cap; seeded 20 on approval
  tier_code TEXT NOT NULL DEFAULT 'silver' CHECK (tier_code IN ('silver','gold','platinum','titanium')),
  owner_user_id TEXT,
  created_at INTEGER NOT NULL,
  approved_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE tenant_members (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('gerai_admin','cashier')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX tenant_members_user ON tenant_members(user_id);

-- Per-tenant DO schema progress, written by `pnpm do:migrate` (ADR-0006 §4). state = 'recovery' makes the host
-- classifier answer 503 for that tenant without touching tenants.status.
CREATE TABLE tenant_schema_versions (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
  schema_version INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('ok','migrating','recovery')),
  last_error TEXT,
  updated_at INTEGER NOT NULL
);

-- Spec 11 §4. Host → tenant is resolved only here (never KV).
CREATE TABLE tenant_hostnames (
  hostname TEXT PRIMARY KEY CHECK (length(hostname) BETWEEN 4 AND 253 AND hostname NOT GLOB '*[^a-z0-9.-]*'), -- normalised
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  kind TEXT NOT NULL CHECK (kind IN ('platform_subdomain','custom')),
  role TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary','redirect')),
  state TEXT NOT NULL CHECK (state IN ('pending','active','failed','moved','suspended','purged')),
  cf_custom_hostname_id TEXT,
  cf_status TEXT,
  cf_ssl_status TEXT,
  verification_errors_json TEXT,
  dns_branch TEXT CHECK (dns_branch IN ('subdomain','root_primary','www_primary')),
  created_at INTEGER NOT NULL,
  activated_at INTEGER,
  last_checked_at INTEGER,
  probe_ok_at INTEGER,
  deleted_at INTEGER
);
CREATE INDEX tenant_hostnames_tenant ON tenant_hostnames(tenant_id);

-- Platform-scope audit (tenant-scope audit lives in each GeraiVaultDO).
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user','super_admin','system','api_key')),
  actor_id TEXT,
  tenant_id TEXT,                                        -- NULL for platform-wide actions
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  reason TEXT,
  metadata_json TEXT
);
CREATE INDEX audit_logs_tenant_at ON audit_logs(tenant_id, at);
CREATE INDEX audit_logs_at ON audit_logs(at);

-- Thin, non-authoritative index pushed by each tenant object's outbox (versioned absolute upsert).
CREATE TABLE shipment_index (
  tenant_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  awb_number TEXT,
  courier_code TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, slug)
);
CREATE INDEX shipment_index_awb ON shipment_index(awb_number);
CREATE INDEX shipment_index_slug ON shipment_index(slug);

-- Outbox acknowledgement bookkeeping is in the DO; D1 only receives absolute rows.
