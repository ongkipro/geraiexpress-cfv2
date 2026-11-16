-- TASK-309 per-tenant daily counters (spec 01 control plane, ADR-0006): absolute values per WIB day pushed by each
-- tenant object's outbox; applied only when newer (`version`), so a retried or reordered message never double-counts.
CREATE TABLE tenant_daily_stats (
  tenant_id TEXT NOT NULL,
  day TEXT NOT NULL,
  shipments INTEGER NOT NULL CHECK (shipments >= 0),
  cod_shipments INTEGER NOT NULL CHECK (cod_shipments >= 0),
  counter_paid_idr INTEGER NOT NULL,
  cancelled INTEGER NOT NULL CHECK (cancelled >= 0),
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, day)
);
CREATE INDEX tenant_daily_stats_day ON tenant_daily_stats(day);
