// Daily tenant-object export (TASK-603, ADR-0006 §7) at 02:00 WIB (`0 19 * * *`) and the restore drill used by
// `POST /internal/ops/backup-restore` (owner host, OPS_TOKEN) and the tests. Each object exports itself (data never
// passes through the Worker in pieces); the Worker only lists tenants and reports failures via an owner alert.
import { emit } from "@gx/telemetry"
import { vaultFor } from "../../do/gerai-vault/stub"
import { sendAlert } from "../../telemetry/alerts"

export async function exportAll(env: Env, now: number): Promise<{ exported: number; skipped: number; failed: string[] }> {
  // Every live tenant; the object itself decides (an unprovisioned object refuses and is not a failure).
  const rows = (await env.DB.prepare("SELECT id FROM tenants WHERE status IN ('active','suspended') ORDER BY id").all<{ id: string }>()).results
  let exported = 0
  let skipped = 0
  const failed: string[] = []
  for (const { id } of rows) {
    try {
      const r = await vaultFor(env, id).exportBackup(id, now)
      if (!r.ok) {
        if (r.refused !== "TENANT_NOT_PROVISIONED") failed.push(id)
      }
      else if (r.value.skipped) skipped++
      else exported++
    } catch {
      failed.push(id)
    }
  }
  emit("tenant.object", { outcome: failed.length ? "backup_partial" : "backup_ok" }, { exported, skipped, failed: failed.length }, { env: env.GX_ENV, severity: failed.length ? "error" : "info", now })
  if (failed.length) await sendAlert(env, { key: "tenant_backup_failed", severity: "error", text: `Cadangan harian gagal untuk ${failed.length} gerai. Periksa log tenant.object.` }, now)
  return { exported, skipped, failed }
}

/** Restore drill: load the backup in `key` into an EMPTY object named `target` and compare checksums. */
export async function restoreInto(env: Env, key: string, target: string): Promise<{ rows: number; sourceChecksum: string; restoredChecksum: string }> {
  const r = await vaultFor(env, target).restoreBackup(key)
  if (!r.ok) throw new Error(r.error)
  return r.value
}
