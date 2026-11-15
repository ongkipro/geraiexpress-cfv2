// D1 control plane (ADR-0006 §1). Columns, nullability and defaults mirror packages/db/migrations/control/*.sql
// (bidirectional drift test: apps/worker/test/migrations/schema-drift.test.ts).

import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  logoR2Key: text("logo_r2_key"),
  contactWhatsapp: text("contact_whatsapp"),
  operatingHoursJson: text("operating_hours_json"),
  status: text("status", { enum: ["draft_application", "pending_review", "active", "suspended"] }).notNull().default("draft_application"),
  routingVersion: integer("routing_version").notNull().default(1),
  maskingEnabled: integer("masking_enabled").notNull().default(0),
  maskingDailyQuota: integer("masking_daily_quota"),
  tierCode: text("tier_code", { enum: ["silver", "gold", "platinum", "titanium"] }).notNull().default("silver"),
  ownerUserId: text("owner_user_id"),
  createdAt: integer("created_at").notNull(),
  approvedAt: integer("approved_at"),
  updatedAt: integer("updated_at").notNull(),
})

export const tenantMembers = sqliteTable(
  "tenant_members",
  {
    tenantId: text("tenant_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ["gerai_admin", "cashier"] }).notNull(),
    status: text("status", { enum: ["active", "revoked"] }).notNull().default("active"),
    createdAt: integer("created_at").notNull(),
    revokedAt: integer("revoked_at"),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.userId] }), index("tenant_members_user").on(t.userId)],
)

export const tenantSchemaVersions = sqliteTable("tenant_schema_versions", {
  tenantId: text("tenant_id").primaryKey(),
  schemaVersion: integer("schema_version").notNull(),
  state: text("state", { enum: ["ok", "migrating", "recovery"] }).notNull(),
  lastError: text("last_error"),
  updatedAt: integer("updated_at").notNull(),
})

export const tenantHostnames = sqliteTable(
  "tenant_hostnames",
  {
    hostname: text("hostname").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    kind: text("kind", { enum: ["platform_subdomain", "custom"] }).notNull(),
    role: text("role", { enum: ["primary", "redirect"] }).notNull().default("primary"),
    state: text("state", { enum: ["pending", "active", "failed", "moved", "suspended", "purged"] }).notNull(),
    cfCustomHostnameId: text("cf_custom_hostname_id"),
    cfStatus: text("cf_status"),
    cfSslStatus: text("cf_ssl_status"),
    verificationErrorsJson: text("verification_errors_json"),
    dnsBranch: text("dns_branch", { enum: ["subdomain", "root_primary", "www_primary"] }),
    createdAt: integer("created_at").notNull(),
    activatedAt: integer("activated_at"),
    lastCheckedAt: integer("last_checked_at"),
    probeOkAt: integer("probe_ok_at"),
    deletedAt: integer("deleted_at"),
  },
  (t) => [index("tenant_hostnames_tenant").on(t.tenantId)],
)

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    at: integer("at").notNull(),
    actorType: text("actor_type", { enum: ["user", "super_admin", "system", "api_key"] }).notNull(),
    actorId: text("actor_id"),
    tenantId: text("tenant_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    reason: text("reason"),
    metadataJson: text("metadata_json"),
  },
  (t) => [index("audit_logs_tenant_at").on(t.tenantId, t.at), index("audit_logs_at").on(t.at)],
)

export const shipmentIndex = sqliteTable(
  "shipment_index",
  {
    tenantId: text("tenant_id").notNull(),
    slug: text("slug").notNull(),
    awbNumber: text("awb_number"),
    courierCode: text("courier_code"),
    status: text("status").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    version: integer("version").notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.slug] }), index("shipment_index_awb").on(t.awbNumber), index("shipment_index_slug").on(t.slug)],
)


export const alertState = sqliteTable("alert_state", {
  alertKey: text("alert_key").primaryKey(),
  lastSentAt: integer("last_sent_at").notNull(),
  count: integer("count").notNull().default(1),
})

export const emailOutbox = sqliteTable(
  "email_outbox",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id", { enum: ["signup_otp", "password_reset", "kasir_invite", "email_change_otp", "application_status", "security_alert"] }).notNull(),
    toEmailHash: text("to_email_hash").notNull(),
    toEmailEncrypted: text("to_email_encrypted"),
    payloadEncrypted: text("payload_encrypted"),
    expiresAt: integer("expires_at").notNull(),
    state: text("state", { enum: ["queued", "sending", "sent", "failed", "expired", "suppressed"] }).notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: integer("next_attempt_at").notNull(),
    leaseUntil: integer("lease_until"),
    createdAt: integer("created_at").notNull(),
    sentAt: integer("sent_at"),
    providerMessageId: text("provider_message_id"),
    lastErrorCode: text("last_error_code"),
  },
  (t) => [index("email_outbox_due").on(t.state, t.nextAttemptAt), index("email_outbox_to").on(t.toEmailHash, t.createdAt)],
)

export const emailSuppressions = sqliteTable("email_suppressions", {
  toEmailHash: text("to_email_hash").primaryKey(),
  reason: text("reason").notNull(),
  createdAt: integer("created_at").notNull(),
})

export const platformLegalProfile = sqliteTable("platform_legal_profile", {
  id: integer("id").primaryKey(),
  legalName: text("legal_name"),
  brandName: text("brand_name").notNull().default("GeraiExpress"),
  entityType: text("entity_type").notNull().default("pt"),
  nib: text("nib"),
  encryptedNpwp: text("encrypted_npwp"),
  aktaNumber: text("akta_number"),
  aktaDate: text("akta_date"),
  skKemenkumhamNumber: text("sk_kemenkumham_number"),
  pseRegistrationNumber: text("pse_registration_number"),
  registeredAddress: text("registered_address"),
  correspondenceAddress: text("correspondence_address"),
  supportEmail: text("support_email"),
  supportWhatsapp: text("support_whatsapp"),
  privacyContactEmail: text("privacy_contact_email"),
  directorName: text("director_name"),
  updatedBy: text("updated_by"),
  updatedAt: integer("updated_at"),
})

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
  emailVerifiedAt: integer("email_verified_at").notNull(),
  passwordChangedAt: integer("password_changed_at").notNull(),
  lastLoginAt: integer("last_login_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const sessions = sqliteTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull(),
    hostContext: text("host_context", { enum: ["app", "owner"] }).notNull(),
    activeTenantId: text("active_tenant_id"),
    aal: text("aal", { enum: ["aal1", "aal2"] }).notNull().default("aal1"),
    totpVerifiedAt: integer("totp_verified_at"),
    deviceHash: text("device_hash"),
    userAgent: text("user_agent"),
    createdAt: integer("created_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    absoluteExpiresAt: integer("absolute_expires_at").notNull(),
    revokedAt: integer("revoked_at"),
  },
  (t) => [index("sessions_user").on(t.userId, t.revokedAt)],
)

export const emailOtps = sqliteTable(
  "email_otps",
  {
    id: text("id").primaryKey(),
    purpose: text("purpose", { enum: ["signup", "email_change"] }).notNull(),
    emailHash: text("email_hash").notNull(),
    userId: text("user_id"),
    emailEncrypted: text("email_encrypted").notNull(),
    codeHash: text("code_hash").notNull(),
    ipHash: text("ip_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: integer("expires_at").notNull(),
    consumedAt: integer("consumed_at"),
    ticketHash: text("ticket_hash"),
    ticketExpiresAt: integer("ticket_expires_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("email_otps_email").on(t.emailHash, t.purpose, t.createdAt), index("email_otps_ip").on(t.ipHash, t.createdAt), uniqueIndex("email_otps_ticket").on(t.ticketHash)],
)

export const passwordResets = sqliteTable(
  "password_resets",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull(),
    expiresAt: integer("expires_at").notNull(),
    consumedAt: integer("consumed_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("password_resets_user").on(t.userId, t.createdAt)],
)

export const invitations = sqliteTable(
  "invitations",
  {
    tokenHash: text("token_hash").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    emailHash: text("email_hash").notNull(),
    email: text("email").notNull(),
    role: text("role", { enum: ["cashier", "gerai_admin"] }).notNull(),
    invitedBy: text("invited_by").notNull(),
    expiresAt: integer("expires_at").notNull(),
    consumedAt: integer("consumed_at"),
    consumedBy: text("consumed_by"),
    revokedAt: integer("revoked_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("invitations_tenant").on(t.tenantId, t.createdAt)],
)

export const authThrottle = sqliteTable("auth_throttle", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStartedAt: integer("window_started_at").notNull(),
  lockedUntil: integer("locked_until"),
})

export const knownDevices = sqliteTable(
  "known_devices",
  {
    userId: text("user_id").notNull(),
    deviceHash: text("device_hash").notNull(),
    firstSeenAt: integer("first_seen_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.deviceHash] })],
)

export const superAdmins = sqliteTable("super_admins", {
  userId: text("user_id").primaryKey(),
  totpSecretEncrypted: text("totp_secret_encrypted"),
  totpState: text("totp_state", { enum: ["pending", "active", "reset"] }).notNull().default("pending"),
  totpLastStep: integer("totp_last_step"),
  enrolledBy: text("enrolled_by"),
  enrolledAt: integer("enrolled_at"),
  status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const tenantApplications = sqliteTable(
  "tenant_applications",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().unique(),
    applicantUserId: text("applicant_user_id").notNull(),
    state: text("state", { enum: ["draft", "submitted", "approved", "rejected"] }).notNull(),
    businessName: text("business_name").notNull(),
    contactWhatsapp: text("contact_whatsapp").notNull(),
    sellerEmail: text("seller_email").notNull(),
    outletJson: text("outlet_json").notNull(),
    consentMengantarAt: integer("consent_mengantar_at"),
    submittedAt: integer("submitted_at"),
    decidedAt: integer("decided_at"),
    decidedBy: text("decided_by"),
    decisionReason: text("decision_reason"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("tenant_applications_state").on(t.state, t.submittedAt)],
)

export const tenantOnboarding = sqliteTable("tenant_onboarding", {
  tenantId: text("tenant_id").primaryKey(),
  environment: text("environment", { enum: ["sandbox", "production"] }).notNull(),
  onboardingState: text("onboarding_state").notNull(),
  sellerId: text("seller_id"),
  externalUserId: text("external_user_id").notNull(),
  lastErrorCode: text("last_error_code"),
  updatedAt: integer("updated_at").notNull(),
})
