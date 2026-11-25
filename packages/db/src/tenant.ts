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
import m0017 from "../migrations/tenant/0017_returns.sql"
import m0018 from "../migrations/tenant/0018_claims.sql"
import m0019 from "../migrations/tenant/0019_minisite.sql"
import m0020 from "../migrations/tenant/0020_quote_fees.sql"
import m0021 from "../migrations/tenant/0021_finance_backfill.sql"
import m0022 from "../migrations/tenant/0022_rescan_and_api_spend.sql"
import m0023 from "../migrations/tenant/0023_mengantar_v2.sql"
import m0024 from "../migrations/tenant/0024_customer_display.sql"
import m0025 from "../migrations/tenant/0025_contact_history_and_events.sql"

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
  { version: 17, name: "returns", sql: m0017 },
  { version: 18, name: "claims", sql: m0018 },
  { version: 19, name: "minisite", sql: m0019 },
  { version: 20, name: "quote_fees", sql: m0020 },
  { version: 21, name: "finance_backfill", sql: m0021 },
  { version: 22, name: "rescan_and_api_spend", sql: m0022 },
  { version: 23, name: "mengantar_v2", sql: m0023 },
  { version: 24, name: "customer_display", sql: m0024 },
  { version: 25, name: "contact_history_and_events", sql: m0025 },
]

export const TENANT_SCHEMA_VERSION = TENANT_MIGRATIONS.length
