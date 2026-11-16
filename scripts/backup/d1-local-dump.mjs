// Usage: node scripts/backup/d1-local-dump.mjs <local D1 .sqlite> <out.sql>  (TASK-603 local D1 restore drill;
// remote D1 uses `wrangler d1 time-travel` / `wrangler d1 export --remote`).
// Dumps a local D1 SQLite file to SQL (schema + rows) the way `wrangler d1 export` does, for the restore drill.
import { DatabaseSync } from "node:sqlite"
import { writeFileSync } from "node:fs"
const [src, out] = process.argv.slice(2)
const db = new DatabaseSync(src, { readOnly: true })
const q = (v) => (v === null ? "NULL" : typeof v === "number" || typeof v === "bigint" ? String(v) : v instanceof Uint8Array ? `X'${Buffer.from(v).toString("hex")}'` : `'${String(v).replace(/'/g, "''")}'`)
const objs = db.prepare("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY type = 'index', rowid").all()
const lines = ["PRAGMA defer_foreign_keys=TRUE;"]
for (const o of objs.filter((o) => o.type === "table")) {
  lines.push(`${o.sql};`)
  for (const r of db.prepare(`SELECT * FROM "${o.name}"`).all()) lines.push(`INSERT INTO "${o.name}" VALUES(${Object.values(r).map(q).join(",")});`)
}
for (const o of objs.filter((o) => o.type !== "table")) lines.push(`${o.sql};`)
writeFileSync(out, lines.join("\n") + "\n")
console.log(`tables=${objs.filter((o) => o.type === "table").length} lines=${lines.length}`)
