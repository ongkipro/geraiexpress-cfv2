// Ops endpoints for backups (TASK-603, owner host, Bearer OPS_TOKEN): `POST /internal/ops/backup-export` runs the
// daily export now (drill / before a release), `POST /internal/ops/backup-restore` restores one backup into an EMPTY
// scratch object and returns both checksums. A scratch object is never routed by any host.
import { timingSafeEqualStr } from "../crypto"
import { exportAll, restoreInto } from "../cron/backup"
import { fail, ok } from "../http/envelope"

async function authorized(request: Request, env: Env): Promise<boolean> {
  const auth = request.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
  return !!token && !!env.OPS_TOKEN && (await timingSafeEqualStr(token, env.OPS_TOKEN))
}

export async function handleBackupOps(request: Request, env: Env, path: string): Promise<Response> {
  if (!(await authorized(request, env))) return fail(401, "UNAUTHORIZED", "Akses ditolak.")
  if (path === "/internal/ops/backup-export") return ok(await exportAll(env, Date.now()))
  const b = (await request.json().catch(() => ({}))) as { key?: unknown; target?: unknown }
  const key = typeof b.key === "string" ? b.key : ""
  const target = typeof b.target === "string" ? b.target : ""
  // Scratch names are namespaced so they can never equal a real tenant id (UUID or seeded ids).
  if (!/^drill-[a-z0-9-]{3,80}$/.test(target)) return fail(422, "INVALID_TARGET", "Target harus diawali drill- (huruf kecil, angka, tanda hubung).")
  try {
    return ok(await restoreInto(env, key, target))
  } catch (e) {
    return fail(409, "RESTORE_REFUSED", `Pemulihan ditolak: ${e instanceof Error ? e.message : "alasan tidak diketahui"}.`)
  }
}
