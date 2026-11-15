-- TASK-103 tenant baseline (every GeraiVaultDO SQLite store, ADR-0006). Forward-only; applied once per object, tracked in schema_version.
CREATE TABLE tenant_settings (
  tenant_id TEXT PRIMARY KEY,
  default_label_format TEXT NOT NULL DEFAULT 'label_10x15_with_stub'
    CHECK (default_label_format IN ('label_10x15_with_stub','label_10x10','label_10x15','roll_58mm')),
  unboxing_remark_text TEXT NOT NULL DEFAULT 'Rekam video saat buka paket untuk klaim' CHECK (length(unboxing_remark_text) <= 50),
  show_commission_on_quick_check INTEGER NOT NULL DEFAULT 0 CHECK (show_commission_on_quick_check IN (0,1)),
  counter_service_fee_enabled INTEGER NOT NULL DEFAULT 0 CHECK (counter_service_fee_enabled IN (0,1)),
  counter_service_fee_default_idr INTEGER CHECK (counter_service_fee_default_idr IS NULL OR counter_service_fee_default_idr BETWEEN 1000 AND 200000),
  cargo_recommend_threshold_gram INTEGER NOT NULL DEFAULT 5000,
  cashier_may_pay_sender_cod INTEGER NOT NULL DEFAULT 0 CHECK (cashier_may_pay_sender_cod IN (0,1)),
  masking_offered INTEGER NOT NULL DEFAULT 0 CHECK (masking_offered IN (0,1)),
  masking_presets_enabled TEXT NOT NULL DEFAULT '[]',
  masking_default_preset TEXT NOT NULL DEFAULT 'standar_gerai',
  mask_recipient_phone_on_cod_default INTEGER NOT NULL DEFAULT 0 CHECK (mask_recipient_phone_on_cod_default IN (0,1)),
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

CREATE TABLE tenant_business_profiles (
  tenant_id TEXT PRIMARY KEY,
  entity_type TEXT CHECK (entity_type IS NULL OR entity_type IN ('perorangan','ud','cv','pt','koperasi','lainnya')),
  legal_name TEXT,
  brand_name TEXT,
  nib TEXT,
  encrypted_npwp TEXT,
  registered_address TEXT,
  pic_name TEXT,
  pic_role TEXT,
  pic_email TEXT,
  pic_phone TEXT,
  updated_by TEXT,
  updated_at INTEGER
);

CREATE TABLE tenant_outlets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  pic_name TEXT,
  pic_phone TEXT,
  mengantar_address_id TEXT,
  mengantar_area_id TEXT,
  province_name TEXT,
  city_name TEXT,
  district_name TEXT,
  subdistrict_name TEXT,
  postal_code TEXT,
  street_address TEXT,
  latitude REAL,
  longitude REAL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  reason TEXT,
  metadata_json TEXT
);
CREATE INDEX audit_logs_at ON audit_logs(at);

-- Generic DO→D1 outbox (ADR-0006 §3): absolute, versioned upserts; retried by alarm until acknowledged.
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL,              -- e.g. shipment_index, recipient_risk_index, tenant_daily_stats
  entity_key TEXT NOT NULL,         -- natural key inside the topic (e.g. shipment slug)
  version INTEGER NOT NULL,         -- monotone per (topic, entity_key)
  payload_json TEXT NOT NULL,       -- the full absolute row to upsert
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (topic, entity_key, version)
);
CREATE INDEX outbox_due ON outbox(next_attempt_at);
