-- TASK-203 Mengantar connection inside the tenant object (spec 01 §2.1, ADR-0006). Keys and secrets AES-256-GCM.
CREATE TABLE mengantar_connections (
  tenant_id TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox','production')),
  onboarding_state TEXT NOT NULL DEFAULT 'not_connected' CHECK (onboarding_state IN ('not_connected','consent_recorded','registration_pending','registration_unknown','existing_account_required','connected','byok_connected','provider_restricted')),
  webhook_state TEXT NOT NULL DEFAULT 'unconfigured' CHECK (webhook_state IN ('unconfigured','awaiting_seller_setup','active','secret_mismatch','paused')),
  seller_id TEXT,
  external_user_id TEXT,
  encrypted_api_key TEXT,
  key_version INTEGER NOT NULL DEFAULT 0,
  webhook_path_token TEXT,
  encrypted_webhook_secret TEXT,
  synced_balance_idr INTEGER,
  last_invoice_synced_at INTEGER,
  last_sync_status TEXT,
  updated_at INTEGER NOT NULL
);
