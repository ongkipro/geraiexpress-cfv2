// POST /internal/ops/do-migrate (owner host only, Bearer OPS_TOKEN). Migrates tenant objects in batches by explicit
// RPC and records progress in D1 `tenant_schema_versions`; stops at the first failure, which leaves only that tenant
// in `recovery` (503 on its hosts) while the others keep serving (ADR-0006 §4, spec 07 §6). Driven by
// `pnpm do:migrate --env <env>`. A dry run never writes anything (neither D1 nor object storage).
import { TENANT_SCHEMA_VERSION } from "@gx/db/tenant"
import { timingSafeEqualStr } from "../crypto"
import { vaultFor } from "../do/gerai-vault/stub"
import { hostCache } from "../host/lookup"
import { fail, ok } from "../http/envelope"

interface Body {
  cursor?: string | null
  batch?: number
  dryRun?: boolean
}

type Progress = "ok" | "migrating" | "recovery"

export async function handleDoMigrate(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
  if (!token || !env.OPS_TOKEN || !(await timingSafeEqualStr(token, env.OPS_TOKEN))) {
    return fail(401, "UNAUTHORIZED", "Akses ditolak.")
  }
  const body = (await request.json().catch(() => ({}))) as Body
  const batch = Math.max(1, Math.min(100, Math.trunc(Number(body.batch) || 25)))
  const cursor = typeof body.cursor === "string" ? body.cursor : ""
  const dryRun = body.dryRun === true
  const rows = await env.DB.prepare(
    `SELECT t.id, v.schema_version AS d1_version, v.state AS d1_state FROM tenants t LEFT JOIN tenant_schema_versions v ON v.tenant_id = t.id
     WHERE t.status IN ('active','suspended','pending_review') AND t.id > ? ORDER BY t.id LIMIT ?`,
  )
    .bind(cursor, batch + 1)
    .all<{ id: string; d1_version: number | null; d1_state: Progress | null }>()
  const page = rows.results.slice(0, batch)
  const nextCursor = rows.results.length > batch ? (page.at(-1)?.id ?? null) : null
  const report: string[] = []
  let migrated = 0
  let alreadyCurrent = 0
  for (const { id, d1_version, d1_state } of page) {
    const stub = vaultFor(env, id)
    const state = await stub.schemaState()
    const objectCurrent = state.version === TENANT_SCHEMA_VERSION && state.state === "ok" && state.tenantId === id
    if (objectCurrent) {
      alreadyCurrent++
      // Reconcile D1 when an earlier run died between the RPC and the D1 write, the object lazy-upgraded, or it was repaired.
      if (!dryRun && (d1_state !== "ok" || d1_version !== TENANT_SCHEMA_VERSION)) {
        await setProgress(env, id, TENANT_SCHEMA_VERSION, "ok", null, d1_state === "recovery")
        report.push(`${id}: D1 progress ${d1_state ?? "missing"}(v${d1_version ?? 0}) → ok(v${TENANT_SCHEMA_VERSION})`)
      }
      continue
    }
    if (dryRun) {
      report.push(`${id}: v${state.version}${state.state === "recovery" ? " (recovery)" : ""} → v${TENANT_SCHEMA_VERSION} (dry run)`)
      continue
    }
    await setProgress(env, id, state.version, "migrating", null, false)
    let error: string | null = null
    let reached = state.version
    try {
      const r = await stub.migrate(id, TENANT_SCHEMA_VERSION)
      if (r.ok) reached = r.to
      else if ("refused" in r) error = r.refused
      else {
        error = r.error
        reached = r.to
      }
    } catch (e) {
      error = `RPC_FAILED: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300)
    }
    if (error !== null) {
      await setProgress(env, id, reached, "recovery", error, true)
      return ok({ migrated, alreadyCurrent, report, nextCursor: null, failed: { tenantId: id, error } })
    }
    await setProgress(env, id, reached, "ok", null, d1_state === "recovery")
    migrated++
    report.push(`${id}: v${state.version} → v${reached}`)
  }
  return ok({ migrated, alreadyCurrent, report, nextCursor, failed: null })
}

/** Writes progress; a routing change (into or out of recovery) bumps routing_version and drops this isolate's cache. */
async function setProgress(env: Env, tenantId: string, version: number, state: Progress, error: string | null, routingChanged: boolean) {
  const now = Date.now()
  const stmts = [
    env.DB.prepare(
      `INSERT INTO tenant_schema_versions (tenant_id, schema_version, state, last_error, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(tenant_id) DO UPDATE SET schema_version = excluded.schema_version, state = excluded.state, last_error = excluded.last_error, updated_at = excluded.updated_at`,
    ).bind(tenantId, version, state, error, now),
  ]
  if (routingChanged) stmts.push(env.DB.prepare("UPDATE tenants SET routing_version = routing_version + 1, updated_at = ? WHERE id = ?").bind(now, tenantId))
  await env.DB.batch(stmts)
  if (routingChanged) hostCache.clear()
}
