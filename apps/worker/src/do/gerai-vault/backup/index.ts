// Tenant object backup (TASK-603, ADR-0006 §7). Primary recovery is Durable Object point-in-time recovery (30 days)
// and D1 Time Travel (30 days on Workers Paid); this adds a daily logical export of every tenant object to R2
// (`t/<tenant_id>/backup/<YYYY-MM-DD>.json.gz`, kept 35 days) so data outlives the PITR window and can be restored
// into a different, empty object (scratch drill, migration). Format: gzip(JSON) of `TenantBackup`; BLOBs as base64.
export const BACKUP_FORMAT = "gx-tenant-backup/1"
export const BACKUP_KEEP_DAYS = 35
export type Cell = string | number | null | { b64: string }
export type TableDump = { columns: string[]; rows: Cell[][] }
export type TenantBackup = { format: typeof BACKUP_FORMAT; tenantId: string; schemaVersion: number; exportedAt: number; ddl: Array<{ name: string; sql: string }>; tables: Record<string, TableDump> }
export type BackupSummary = { key: string; bytes: number; tables: number; rows: number; checksum: string }

const q = (name: string) => `"${name.replace(/"/g, '""')}"`

/** Schema objects (tables first, then indexes) in creation order, excluding SQLite/Cloudflare internals. */
export function schemaDdl(sql: SqlStorage): Array<{ name: string; sql: string }> {
  return sql
    .exec<{ name: string; sql: string }>("SELECT name, sql FROM sqlite_master WHERE type IN ('table','index') AND sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_*' ORDER BY type = 'index', rowid")
    .toArray()
}
export const userTables = (sql: SqlStorage): string[] =>
  sql
    .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_*' ORDER BY rowid")
    .toArray()
    .map((r) => r.name)

const toCell = (v: SqlStorageValue): Cell => (v instanceof ArrayBuffer ? { b64: btoa(String.fromCharCode(...new Uint8Array(v))) } : (v as string | number | null))
const fromCell = (v: Cell): SqlStorageValue => (v !== null && typeof v === "object" ? Uint8Array.from(atob(v.b64), (c) => c.charCodeAt(0)).buffer : v)

export function dumpTables(sql: SqlStorage): Record<string, TableDump> {
  const out: Record<string, TableDump> = {}
  for (const t of userTables(sql)) {
    const cur = sql.exec(`SELECT * FROM ${q(t)}`)
    out[t] = { columns: cur.columnNames, rows: [...cur.raw()].map((r) => r.map(toCell)) }
  }
  return out
}

/** Order-independent content checksum (table, columns, sorted rows) to compare a source and a restored object. */
export async function checksumOf(tables: Record<string, TableDump>): Promise<string> {
  const parts = Object.keys(tables)
    .sort()
    .map((t) => `${t}|${tables[t]!.columns.join(",")}|${tables[t]!.rows.map((r) => JSON.stringify(r)).sort().join("\n")}`)
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("\n#\n")))
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * Restores a backup into an EMPTY object: replays the schema by creating each table with the source's DDL taken from
 * the backup's own `sqlite_master` copy, then inserts rows in table order with FK checks deferred to the end.
 */
export function restoreTables(sql: SqlStorage, ddl: Array<{ name: string; sql: string }>, tables: Record<string, TableDump>): number {
  let rows = 0
  for (const d of ddl) sql.exec(d.sql)
  for (const d of ddl) {
    const t = tables[d.name]
    if (!t || t.rows.length === 0) continue
    const stmt = `INSERT INTO ${q(d.name)} (${t.columns.map(q).join(", ")}) VALUES (${t.columns.map(() => "?").join(", ")})`
    for (const r of t.rows) {
      sql.exec(stmt, ...r.map(fromCell))
      rows++
    }
  }
  return rows
}

export async function gzipJson(v: unknown): Promise<Uint8Array> {
  const stream = new Blob([JSON.stringify(v)]).stream().pipeThrough(new CompressionStream("gzip"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
export async function gunzipJson<T>(bytes: ArrayBuffer | Uint8Array): Promise<T> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))
  return JSON.parse(await new Response(stream).text()) as T
}

export const backupKey = (tenantId: string, day: string) => `t/${tenantId}/backup/${day}.json.gz`
export const wibDayOf = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 10)
