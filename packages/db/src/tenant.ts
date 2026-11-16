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
]

export const TENANT_SCHEMA_VERSION = TENANT_MIGRATIONS.length
