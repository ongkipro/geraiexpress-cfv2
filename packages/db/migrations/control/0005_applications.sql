-- TASK-203 outlet applications and Mengantar onboarding visibility (PR-01, PR-02, PR-03, DEC-203).
-- The application is the owner's submission (control plane: reviewed before any tenant object holds data). The seller
-- key itself is stored only encrypted inside the tenant object (mengantar_connections), never here.
CREATE TABLE tenant_applications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id),
  applicant_user_id TEXT NOT NULL REFERENCES users(id),
  state TEXT NOT NULL CHECK (state IN ('draft','submitted','approved','rejected')),
  business_name TEXT NOT NULL,
  contact_whatsapp TEXT NOT NULL,
  seller_email TEXT NOT NULL CHECK (seller_email = lower(seller_email)),
  outlet_json TEXT NOT NULL,            -- pickup address incl. verified Mengantar area_id
  consent_mengantar_at INTEGER,         -- agreement to Mengantar terms (Partner contract)
  submitted_at INTEGER,
  decided_at INTEGER,
  decided_by TEXT,
  decision_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX tenant_applications_state ON tenant_applications(state, submitted_at);

-- Onboarding state mirror for the Super Admin directory (non-secret; the object is authoritative).
CREATE TABLE tenant_onboarding (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
  environment TEXT NOT NULL CHECK (environment IN ('sandbox','production')),
  onboarding_state TEXT NOT NULL CHECK (onboarding_state IN ('not_connected','consent_recorded','registration_pending','registration_unknown','existing_account_required','connected','byok_connected','provider_restricted')),
  seller_id TEXT,
  external_user_id TEXT NOT NULL,
  last_error_code TEXT,
  updated_at INTEGER NOT NULL
);
