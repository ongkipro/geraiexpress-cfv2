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
  expectVersion?: number | null
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
  const expectVersion = typeof body.expectVersion === "number" && Number.isSafeInteger(body.expectVersion) && body.expectVersion > 0 ? body.expectVersion : null
  // Post-deploy edge propagation guard: refuse immediately without touching any tenant or D1 if a draining isolate is
  // behind the newly deployed TENANT_SCHEMA_VERSION (the caller retries until the new isolate serves).
  if (!dryRun && expectVersion !== null && TENANT_SCHEMA_VERSION < expectVersion) {
    return fail(409, "STALE_ISOLATE", `Isolate masih di v${TENANT_SCHEMA_VERSION}, menunggu v${expectVersion}.`)
  }
  const rows = await env.DB.prepare(
    `SELECT t.id, v.schema_version AS d1_version, v.state AS d1_state, v.last_error AS d1_last_error FROM tenants t LEFT JOIN tenant_schema_versions v ON v.tenant_id = t.id
     WHERE t.status IN ('active','suspended','pending_review') AND t.id > ? ORDER BY t.id LIMIT ?`,
  )
    .bind(cursor, batch + 1)
    .all<{ id: string; d1_version: number | null; d1_state: Progress | null; d1_last_error: string | null }>()
  const page = rows.results.slice(0, batch)
  const nextCursor = rows.results.length > batch ? (page.at(-1)?.id ?? null) : null
  const report: string[] = []
  let migrated = 0
  let alreadyCurrent = 0
  for (const { id, d1_version, d1_state, d1_last_error } of page) {
    const stub = vaultFor(env, id)
    const state = await stub.schemaState()
    if (state.version > TENANT_SCHEMA_VERSION) {
      // Never downgrade or mark a healthy newer-schema tenant as `recovery` when hit by a draining older isolate.
      if (dryRun) {
        report.push(`${id}: v${state.version} > isolate v${TENANT_SCHEMA_VERSION} (stale isolate)`)
        continue
      }
      return fail(409, "STALE_ISOLATE", `Objek sudah di v${state.version}, melebihi isolate v${TENANT_SCHEMA_VERSION}.`)
    }
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
    const migratingAt = await setProgress(env, id, state.version, "migrating", null, false)
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
    if (error === "FORWARD_ONLY") {
      // Concurrent lazy-upgrade on a newer isolate raced between schemaState() and migrate(): conditionally revert
      // ONLY our own `migrating` write so a newer isolate's committed `ok(vN+1)` row is never clobbered.
      await revertMigratingProgress(env, id, { version: state.version, updatedAt: migratingAt }, { version: d1_version, state: d1_state, lastError: d1_last_error })
      return fail(409, "STALE_ISOLATE", `Objek sudah melampaui isolate v${TENANT_SCHEMA_VERSION}.`)
    }
    if (error !== null) {
      await setProgress(env, id, reached, "recovery", error, true)
      return ok({ targetVersion: TENANT_SCHEMA_VERSION, migrated, alreadyCurrent, report, nextCursor: null, failed: { tenantId: id, error } })
    }
    await setProgress(env, id, reached, "ok", null, d1_state === "recovery")
    migrated++
    report.push(`${id}: v${state.version} → v${reached}`)
  }
  return ok({ targetVersion: TENANT_SCHEMA_VERSION, migrated, alreadyCurrent, report, nextCursor, failed: null })
}

/**
 * Conditionally reverts a `migrating` marker written by a stale isolate that hit `FORWARD_ONLY` (CAS on
 * `state='migrating' AND schema_version AND updated_at`) so concurrent progress from a newer isolate is never clobbered.
 */
export async function revertMigratingProgress(
  env: Env,
  tenantId: string,
  marker: { version: number; updatedAt: number },
  prior: { version: number | null; state: Progress | null; lastError: string | null },
): Promise<void> {
  if (prior.state === null) {
    await env.DB.prepare("DELETE FROM tenant_schema_versions WHERE tenant_id = ?1 AND state = 'migrating' AND schema_version = ?2 AND updated_at = ?3")
      .bind(tenantId, marker.version, marker.updatedAt)
      .run()
    return
  }
  await env.DB.prepare(
    "UPDATE tenant_schema_versions SET schema_version = ?1, state = ?2, last_error = ?3, updated_at = ?4 WHERE tenant_id = ?5 AND state = 'migrating' AND schema_version = ?6 AND updated_at = ?7",
  )
    .bind(prior.version ?? marker.version, prior.state, prior.lastError, Date.now(), tenantId, marker.version, marker.updatedAt)
    .run()
}

/** Writes progress; a routing change (into or out of recovery) bumps routing_version and drops this isolate's cache. */
async function setProgress(env: Env, tenantId: string, version: number, state: Progress, error: string | null, routingChanged: boolean): Promise<number> {
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
  return now
}
