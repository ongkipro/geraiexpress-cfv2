// Tenant (GeraiVaultDO) migration list, bundled as Text modules. Append-only: a new file gets the next version;
// never edit a file that a deployed object has seen (docs/WORKFLOW.md §3).
import m0001 from "../migrations/tenant/0001_baseline.sql"
import m0002 from "../migrations/tenant/0002_inv_slugs.sql"
import m0003 from "../migrations/tenant/0003_mengantar_connection.sql"
import m0004 from "../migrations/tenant/0004_webhooks_status.sql"
import m0005 from "../migrations/tenant/0005_key_rotation.sql"
import m0006 from "../migrations/tenant/0006_courier_prefs.sql"
import m0007 from "../migrations/tenant/0007_notifications.sql"
import m0008 from "../migrations/tenant/0008_contacts.sql"
import m0009 from "../migrations/tenant/0009_quotes.sql"
import m0010 from "../migrations/tenant/0010_dispatch.sql"
import m0011 from "../migrations/tenant/0011_masking.sql"
import m0012 from "../migrations/tenant/0012_shifts.sql"
import m0013 from "../migrations/tenant/0013_bulk.sql"
import m0014 from "../migrations/tenant/0014_settings.sql"
import m0015 from "../migrations/tenant/0015_finance.sql"
import m0016 from "../migrations/tenant/0016_pickup.sql"

export interface TenantMigration {
  version: number
  name: string
  sql: string
}

export const TENANT_MIGRATIONS: readonly TenantMigration[] = [
  { version: 1, name: "baseline", sql: m0001 },
  { version: 2, name: "inv_slugs", sql: m0002 },
  { version: 3, name: "mengantar_connection", sql: m0003 },
  { version: 4, name: "webhooks_status", sql: m0004 },
  { version: 5, name: "key_rotation", sql: m0005 },
  { version: 6, name: "courier_prefs", sql: m0006 },
  { version: 7, name: "notifications", sql: m0007 },
  { version: 8, name: "contacts", sql: m0008 },
  { version: 9, name: "quotes", sql: m0009 },
  { version: 10, name: "dispatch", sql: m0010 },
  { version: 11, name: "masking", sql: m0011 },
  { version: 12, name: "shifts", sql: m0012 },
  { version: 13, name: "bulk", sql: m0013 },
  { version: 14, name: "settings", sql: m0014 },
  { version: 15, name: "finance", sql: m0015 },
  { version: 16, name: "pickup", sql: m0016 },
]

export const TENANT_SCHEMA_VERSION = TENANT_MIGRATIONS.length
