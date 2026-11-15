// D1 control plane (ADR-0006 §1). Columns, nullability and defaults mirror packages/db/migrations/control/*.sql
// (bidirectional drift test: apps/worker/test/migrations/schema-drift.test.ts).

import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"

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

