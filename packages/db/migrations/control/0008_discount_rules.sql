-- TASK-207 discount & cashback matrix (spec 02 §2.1, DEC-205/226/230/233). Band, default and SLA are configuration.
CREATE TABLE platform_pricing_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  default_discount_bps INTEGER NOT NULL CHECK (default_discount_bps BETWEEN 0 AND 10000),
  min_discount_bps INTEGER NOT NULL CHECK (min_discount_bps BETWEEN 0 AND 10000),
  max_discount_bps INTEGER NOT NULL CHECK (max_discount_bps BETWEEN 0 AND 10000),
  apply_sla_minutes INTEGER NOT NULL CHECK (apply_sla_minutes > 0),
  updated_at INTEGER NOT NULL,
  updated_by TEXT,
  CHECK (min_discount_bps <= default_discount_bps AND default_discount_bps <= max_discount_bps)
);
INSERT INTO platform_pricing_policy (id, default_discount_bps, min_discount_bps, max_discount_bps, apply_sla_minutes, updated_at) VALUES (1, 2000, 2000, 3000, 60, 0);

-- Per-courier band; a courier without a row uses the platform values.
CREATE TABLE courier_discount_policy (
  courier_code TEXT PRIMARY KEY,
  default_discount_bps INTEGER NOT NULL CHECK (default_discount_bps BETWEEN 0 AND 10000),
  min_discount_bps INTEGER NOT NULL CHECK (min_discount_bps BETWEEN 0 AND 10000),
  max_discount_bps INTEGER NOT NULL CHECK (max_discount_bps BETWEEN 0 AND 10000),
  updated_at INTEGER NOT NULL,
  updated_by TEXT,
  CHECK (min_discount_bps <= default_discount_bps AND default_discount_bps <= max_discount_bps)
);

-- One current rule per gerai × service; history lives in audit_logs (old/new values + reason).
CREATE TABLE tenant_discount_rules (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  service_code TEXT NOT NULL,
  courier_code TEXT NOT NULL,
  service_class TEXT NOT NULL CHECK (service_class IN ('regular','cargo')),
  assigned_bps INTEGER NOT NULL CHECK (assigned_bps BETWEEN 0 AND 10000),
  cashback_bps INTEGER NOT NULL DEFAULT 0 CHECK (cashback_bps BETWEEN 0 AND 10000),
  effective_from INTEGER NOT NULL,
  apply_channel TEXT NOT NULL DEFAULT 'mengantar_team' CHECK (apply_channel IN ('mengantar_team','partner_api')),
  requested_at INTEGER NOT NULL,
  request_sent_at INTEGER,
  applied_at INTEGER,
  verified_at INTEGER,
  verification_state TEXT NOT NULL DEFAULT 'belum_diterapkan' CHECK (verification_state IN ('belum_diterapkan','sesuai','selisih')),
  observed_bps INTEGER,
  observed_at INTEGER,
  next_check_at INTEGER,
  check_step INTEGER NOT NULL DEFAULT 0,
  alerted_at INTEGER,
  updated_at INTEGER NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (tenant_id, service_code)
);
CREATE INDEX tenant_discount_rules_due ON tenant_discount_rules(next_check_at);
CREATE INDEX tenant_discount_rules_state ON tenant_discount_rules(verification_state, requested_at);
