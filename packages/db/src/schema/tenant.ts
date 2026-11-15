// GeraiVaultDO tenant tables (ADR-0006 §2). Mirrors packages/db/migrations/tenant/*.sql (drift test).
import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const tenantSettings = sqliteTable("tenant_settings", {
  tenantId: text("tenant_id").primaryKey(),
  defaultLabelFormat: text("default_label_format", { enum: ["label_10x15_with_stub", "label_10x10", "label_10x15", "roll_58mm"] }).notNull().default("label_10x15_with_stub"),
  unboxingRemarkText: text("unboxing_remark_text").notNull().default("Rekam video saat buka paket untuk klaim"),
  showCommissionOnQuickCheck: integer("show_commission_on_quick_check").notNull().default(0),
  counterServiceFeeEnabled: integer("counter_service_fee_enabled").notNull().default(0),
  counterServiceFeeDefaultIdr: integer("counter_service_fee_default_idr"),
  cargoRecommendThresholdGram: integer("cargo_recommend_threshold_gram").notNull().default(5000),
  cashierMayPaySenderCod: integer("cashier_may_pay_sender_cod").notNull().default(0),
  maskingOffered: integer("masking_offered").notNull().default(0),
  maskingPresetsEnabled: text("masking_presets_enabled").notNull().default("[]"),
  maskingDefaultPreset: text("masking_default_preset").notNull().default("standar_gerai"),
  maskRecipientPhoneOnCodDefault: integer("mask_recipient_phone_on_cod_default").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
  updatedBy: text("updated_by"),
})

export const tenantBusinessProfiles = sqliteTable("tenant_business_profiles", {
  tenantId: text("tenant_id").primaryKey(),
  entityType: text("entity_type", { enum: ["perorangan", "ud", "cv", "pt", "koperasi", "lainnya"] }),
  legalName: text("legal_name"),
  brandName: text("brand_name"),
  nib: text("nib"),
  encryptedNpwp: text("encrypted_npwp"),
  registeredAddress: text("registered_address"),
  picName: text("pic_name"),
  picRole: text("pic_role"),
  picEmail: text("pic_email"),
  picPhone: text("pic_phone"),
  updatedBy: text("updated_by"),
  updatedAt: integer("updated_at"),
})

export const tenantOutlets = sqliteTable("tenant_outlets", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  picName: text("pic_name"),
  picPhone: text("pic_phone"),
  mengantarAddressId: text("mengantar_address_id"),
  mengantarAreaId: text("mengantar_area_id"),
  provinceName: text("province_name"),
  cityName: text("city_name"),
  districtName: text("district_name"),
  subdistrictName: text("subdistrict_name"),
  postalCode: text("postal_code"),
  streetAddress: text("street_address"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  isDefault: integer("is_default").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    at: integer("at").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    reason: text("reason"),
    metadataJson: text("metadata_json"),
  },
  (t) => [index("audit_logs_at").on(t.at)],
)

export const outbox = sqliteTable(
  "outbox",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    topic: text("topic").notNull(),
    entityKey: text("entity_key").notNull(),
    version: integer("version").notNull(),
    payloadJson: text("payload_json").notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: integer("next_attempt_at").notNull(),
    lastError: text("last_error"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("outbox_due").on(t.nextAttemptAt)],
)

export const invSlugs = sqliteTable("inv_slugs", {
  slug: text("slug").primaryKey(),
  purpose: text("purpose", { enum: ["draft", "minisite_qr", "bulk", "api"] }).notNull(),
  createdAt: integer("created_at").notNull(),
})

export const mengantarConnections = sqliteTable("mengantar_connections", {
  tenantId: text("tenant_id").primaryKey(),
  environment: text("environment", { enum: ["sandbox", "production"] }).notNull(),
  onboardingState: text("onboarding_state").notNull().default("not_connected"),
  webhookState: text("webhook_state").notNull().default("unconfigured"),
  sellerId: text("seller_id"),
  externalUserId: text("external_user_id"),
  encryptedApiKey: text("encrypted_api_key"),
  keyVersion: integer("key_version").notNull().default(0),
  webhookPathToken: text("webhook_path_token"),
  encryptedWebhookSecret: text("encrypted_webhook_secret"),
  syncedBalanceIdr: integer("synced_balance_idr"),
  lastInvoiceSyncedAt: integer("last_invoice_synced_at"),
  lastSyncStatus: text("last_sync_status"),
  updatedAt: integer("updated_at").notNull(),
  webhookLastEventAt: integer("webhook_last_event_at"),
  webhookLastFailureAt: integer("webhook_last_failure_at"),
  lastPolledAt: integer("last_polled_at"),
  rotationState: text("rotation_state", { enum: ["idle", "in_flight", "unknown"] }).notNull().default("idle"),
  rotationStartedAt: integer("rotation_started_at"),
  previousWebhookPathToken: text("previous_webhook_path_token"),
  encryptedPreviousWebhookSecret: text("encrypted_previous_webhook_secret"),
  previousTokenExpiresAt: integer("previous_token_expires_at"),
})

export const shipments = sqliteTable(
  "shipments",
  {
    tenantId: text("tenant_id").notNull(),
    slug: text("slug").notNull(),
    courierCode: text("courier_code"),
    mengantarOrderCode: text("mengantar_order_code"),
    awbNumber: text("awb_number"),
    status: text("status").notNull(),
    providerStatus: text("provider_status"),
    lastProviderEventAt: integer("last_provider_event_at"),
    lastProviderRank: integer("last_provider_rank"),
    custodyStage: text("custody_stage", { enum: ["none", "handed_to_courier", "rts_at_gerai", "rts_returned_to_sender", "cancelled_local"] }).notNull().default("none"),
    custodyAt: integer("custody_at"),
    providerStatusConflictAt: integer("provider_status_conflict_at"),
    stuckAttentionAt: integer("stuck_attention_at"),
    lastPolledAt: integer("last_polled_at"),
    indexVersion: integer("index_version").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.slug] }), index("shipments_awb").on(t.awbNumber), index("shipments_order_code").on(t.mengantarOrderCode)],
)

export const shipmentEvents = sqliteTable(
  "shipment_events",
  {
    eventKey: text("event_key").primaryKey(),
    slug: text("slug").notNull(),
    source: text("source", { enum: ["webhook", "poll", "local"] }).notNull(),
    rawCategory: text("raw_category"),
    mappedStatus: text("mapped_status"),
    eventAt: integer("event_at").notNull(),
    eventAtText: text("event_at_text"),
    recordedAt: integer("recorded_at").notNull(),
  },
  (t) => [index("shipment_events_slug").on(t.slug, t.eventAt)],
)

export const webhookInbox = sqliteTable(
  "webhook_inbox",
  {
    eventKey: text("event_key").primaryKey(),
    providerTimestampRaw: text("provider_timestamp_raw").notNull(),
    providerEventAt: integer("provider_event_at").notNull(),
    receivedAt: integer("received_at").notNull(),
    rawBody: text("raw_body").notNull(),
    state: text("state", { enum: ["received", "applied", "rejected"] }).notNull().default("received"),
    appliedAt: integer("applied_at"),
    error: text("error"),
  },
  (t) => [index("webhook_inbox_state").on(t.state, t.receivedAt)],
)

export const vaultTimers = sqliteTable("vault_timers", {
  name: text("name").primaryKey(),
  dueAt: integer("due_at").notNull(),
})

export const tenantCourierPrefs = sqliteTable(
  "tenant_courier_prefs",
  {
    tenantId: text("tenant_id").notNull(),
    courierCode: text("courier_code").notNull(),
    enabled: integer("enabled").notNull(),
    pickupMode: text("pickup_mode", { enum: ["scheduled_pickup", "drop_off_only"] }).notNull(),
    updatedAt: integer("updated_at").notNull(),
    updatedBy: text("updated_by"),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.courierCode] })],
)
