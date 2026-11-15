// Tenant (GeraiVaultDO) migration list, bundled as Text modules. Append-only: a new file gets the next version;
// never edit a file that a deployed object has seen (docs/WORKFLOW.md §3).
import m0001 from "../migrations/tenant/0001_baseline.sql"

export interface TenantMigration {
  version: number
  name: string
  sql: string
}

export const TENANT_MIGRATIONS: readonly TenantMigration[] = [{ version: 1, name: "baseline", sql: m0001 }]

export const TENANT_SCHEMA_VERSION = TENANT_MIGRATIONS.length
