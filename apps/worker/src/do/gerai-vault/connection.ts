// Mengantar connection inside the tenant object (spec 01 §2.1, ADR-0004 §5). The seller key and webhook secret are
// stored AES-256-GCM-encrypted; plaintext leaves the object only to the server-side SDK call that needs it.
export type OnboardingState =
  | "not_connected"
  | "consent_recorded"
  | "registration_pending"
  | "registration_unknown"
  | "existing_account_required"
  | "connected"
  | "byok_connected"
  | "provider_restricted"

export type ConnectionRow = {
  tenant_id: string
  environment: "sandbox" | "production"
  onboarding_state: OnboardingState
  webhook_state: "unconfigured" | "awaiting_seller_setup" | "active" | "secret_mismatch" | "paused"
  seller_id: string | null
  external_user_id: string | null
  encrypted_api_key: string | null
  key_version: number
  webhook_path_token: string | null
  encrypted_webhook_secret: string | null
  synced_balance_idr: number | null
  updated_at: number
}

/** Non-secret projection for owner/Super Admin screens (never the key or secret). */
export interface ConnectionView {
  environment: "sandbox" | "production"
  onboardingState: OnboardingState
  webhookState: ConnectionRow["webhook_state"]
  sellerId: string | null
  hasKey: boolean
  keyVersion: number
}

export function readConnection(sql: SqlStorage): ConnectionRow | null {
  return sql.exec<ConnectionRow>("SELECT * FROM mengantar_connections LIMIT 1").toArray()[0] ?? null
}

export function viewOf(row: ConnectionRow | null): ConnectionView | null {
  if (!row) return null
  return {
    environment: row.environment,
    onboardingState: row.onboarding_state,
    webhookState: row.webhook_state,
    sellerId: row.seller_id,
    hasKey: !!row.encrypted_api_key,
    keyVersion: row.key_version,
  }
}

export function upsertConnection(sql: SqlStorage, tenantId: string, patch: Partial<Omit<ConnectionRow, "tenant_id">> & { environment: "sandbox" | "production" }, now: number): void {
  const cur = readConnection(sql)
  const next = { ...(cur ?? { onboarding_state: "not_connected", webhook_state: "unconfigured", key_version: 0 }), ...patch }
  sql.exec(
    `INSERT INTO mengantar_connections (tenant_id, environment, onboarding_state, webhook_state, seller_id, external_user_id, encrypted_api_key, key_version,
       webhook_path_token, encrypted_webhook_secret, synced_balance_idr, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
     ON CONFLICT(tenant_id) DO UPDATE SET environment = excluded.environment, onboarding_state = excluded.onboarding_state,
       webhook_state = excluded.webhook_state, seller_id = excluded.seller_id, external_user_id = excluded.external_user_id,
       encrypted_api_key = excluded.encrypted_api_key, key_version = excluded.key_version, webhook_path_token = excluded.webhook_path_token,
       encrypted_webhook_secret = excluded.encrypted_webhook_secret, synced_balance_idr = excluded.synced_balance_idr, updated_at = excluded.updated_at`,
    tenantId,
    next.environment,
    next.onboarding_state,
    next.webhook_state,
    next.seller_id ?? null,
    next.external_user_id ?? null,
    next.encrypted_api_key ?? null,
    next.key_version ?? 0,
    next.webhook_path_token ?? null,
    next.encrypted_webhook_secret ?? null,
    next.synced_balance_idr ?? null,
    now,
  )
}
