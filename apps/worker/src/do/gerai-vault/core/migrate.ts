// Per-object tenant schema migrations (ADR-0006 §4): explicit `migrate(target)`, never in the constructor;
// version tracked in a `schema_version` row (no PRAGMA); each step is one synchronous transaction, so a failing step
// rolls back alone and leaves the object in `recovery` at the last good version.

import type { TenantMigration } from "@gx/db/tenant"

export type { TenantMigration }

export interface SchemaState {
  version: number
  state: "ok" | "recovery"
  lastError: string | null
  updatedAt: number
}

export type MigrateResult =
  | { ok: true; from: number; to: number; applied: number[] }
  | { ok: false; from: number; to: number; failedVersion: number; error: string }
  | { ok: false; refused: "TENANT_MISMATCH" | "FORWARD_ONLY" | "UNKNOWN_TARGET" }

const META_DDL = `CREATE TABLE IF NOT EXISTS schema_version (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('ok','recovery')),
  last_error TEXT,
  updated_at INTEGER NOT NULL
)`

export function tableExists(storage: DurableObjectStorage, name: string): boolean {
  return storage.sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", name).toArray().length > 0
}

/** Read-only: never creates tables, so a dry run or a state probe leaves an unprovisioned object untouched. */
export function readSchemaState(storage: DurableObjectStorage): SchemaState {
  if (!tableExists(storage, "schema_version")) return { version: 0, state: "ok", lastError: null, updatedAt: 0 }
  const row = storage.sql
    .exec<{ version: number; state: "ok" | "recovery"; last_error: string | null; updated_at: number }>(
      "SELECT version, state, last_error, updated_at FROM schema_version WHERE id = 1",
    )
    .toArray()[0]
  return row
    ? { version: row.version, state: row.state, lastError: row.last_error, updatedAt: row.updated_at }
    : { version: 0, state: "ok", lastError: null, updatedAt: 0 }
}

export function validateMigrationList(list: readonly TenantMigration[]): void {
  list.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`tenant migration list must be contiguous from 1; got ${m.version} at index ${i}`)
  })
}

export function applyTenantMigrations(
  storage: DurableObjectStorage,
  list: readonly TenantMigration[],
  target: number,
  now: number = Date.now(),
): MigrateResult {
  validateMigrationList(list)
  if (!Number.isSafeInteger(target) || target < 0 || target > list.length) return { ok: false, refused: "UNKNOWN_TARGET" }
  const start = readSchemaState(storage)
  if (target < start.version) return { ok: false, refused: "FORWARD_ONLY" }
  storage.sql.exec(META_DDL)
  const applied: number[] = []
  for (const m of list.slice(start.version, target)) {
    try {
      storage.transactionSync(() => {
        storage.sql.exec(m.sql)
        storage.sql.exec(
          `INSERT INTO schema_version (id, version, state, last_error, updated_at) VALUES (1, ?, 'ok', NULL, ?)
           ON CONFLICT(id) DO UPDATE SET version = excluded.version, state = 'ok', last_error = NULL, updated_at = excluded.updated_at`,
          m.version,
          now,
        )
      })
      applied.push(m.version)
    } catch (err) {
      const error = `${m.version}_${m.name}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500)
      const at = applied.at(-1) ?? start.version
      storage.sql.exec(
        `INSERT INTO schema_version (id, version, state, last_error, updated_at) VALUES (1, ?, 'recovery', ?, ?)
         ON CONFLICT(id) DO UPDATE SET state = 'recovery', last_error = excluded.last_error, updated_at = excluded.updated_at`,
        at,
        error,
        now,
      )
      return { ok: false, from: start.version, to: at, failedVersion: m.version, error }
    }
  }
  const to = applied.at(-1) ?? start.version
  if (start.state === "recovery" && applied.length === 0 && to === target) {
    // Re-running at the same version after the cause was fixed out of band clears recovery.
    storage.sql.exec("UPDATE schema_version SET state = 'ok', last_error = NULL, updated_at = ? WHERE id = 1", now)
  }
  return { ok: true, from: start.version, to, applied }
}
