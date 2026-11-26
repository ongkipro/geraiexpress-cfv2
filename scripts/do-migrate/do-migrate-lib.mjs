// Pure helpers for `scripts/do-migrate/do-migrate.mjs`: local TENANT_SCHEMA_VERSION detection and bounded stale-isolate
// retry loop after a Worker deploy (prevents Cloudflare edge propagation from failing or mis-sweeping against a draining
// older Worker isolate).
import { readFileSync } from "node:fs"

export const DEFAULT_RETRY_DELAYS_MS = [2000, 3000, 4000, 5000, 6000, 8000]

/** Parses `TENANT_MIGRATIONS = [ ... ]` from `packages/db/src/tenant.ts` (ignoring comments) and returns sequential count N. */
export function parseTenantSchemaVersion(source) {
  const stripped = String(source)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
  const m = /\bTENANT_MIGRATIONS\b[^=]*=\s*\[([\s\S]*?)\]/.exec(stripped)
  if (!m) return null
  const versions = [...m[1].matchAll(/\{[^}]*\bversion\s*:\s*(\d+)\b[^}]*\}/g)].map((x) => Number(x[1]))
  if (versions.length === 0) return null
  for (let i = 0; i < versions.length; i++) {
    if (versions[i] !== i + 1) return null
  }
  return versions.length
}

export function readLocalTenantSchemaVersion(tenantTsPath = new URL("../../packages/db/src/tenant.ts", import.meta.url)) {
  try {
    return parseTenantSchemaVersion(readFileSync(tenantTsPath, "utf8"))
  } catch {
    return null
  }
}

/**
 * Classifies one `/internal/ops/do-migrate` response for stale-isolate retry handling:
 * - `dryRun`: never retries on version skew (pre-deploy dry-run intentionally reads the live old Worker).
 * - Non-dry-run: retries on HTTP 409 `STALE_ISOLATE`, missing or older `targetVersion` when `expectVersion` is set,
 *   or legacy `FORWARD_ONLY`.
 */
export function staleReason(status, body, { dryRun, expectVersion }) {
  if (dryRun) return null
  if (status === 409 && body?.error?.code === "STALE_ISOLATE") {
    return body?.error?.message || "STALE_ISOLATE"
  }
  if (status >= 200 && status < 300 && body?.ok && body?.data) {
    const tv = body.data.targetVersion
    if (expectVersion) {
      if (!Number.isSafeInteger(tv)) return `edge omitted targetVersion, expected >= v${expectVersion}`
      if (tv < expectVersion) return `edge serving v${tv}, expected >= v${expectVersion}`
    }
    if (body.data.failed?.error === "FORWARD_ONLY") {
      return `stale isolate reported FORWARD_ONLY on ${body.data.failed.tenantId}`
    }
  }
  return null
}

/** Walks all tenant batches with bounded retry on stale-isolate responses. */
export async function runDoMigrate({
  origin,
  token,
  batch,
  dryRun,
  expectVersion = null,
  fetchImpl = fetch,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  onLog = () => {},
}) {
  let cursor = null
  let migrated = 0
  let alreadyCurrent = 0
  let pending = 0
  let targetVersion = null
  let retries = 0
  const report = []

  for (;;) {
    let attempt = 0
    let body
    let resStatus
    for (;;) {
      const payload = { cursor, batch, dryRun, ...(!dryRun && expectVersion ? { expectVersion } : {}) }
      const res = await fetchImpl(`${origin}/internal/ops/do-migrate`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120_000),
      })
      resStatus = res.status
      body = await res.json().catch(() => null)
      const reason = staleReason(resStatus, body, { dryRun, expectVersion })
      if (!reason) break
      if (attempt >= retryDelaysMs.length) {
        return {
          ok: false,
          code: "STALE_ISOLATE",
          message: `edge still stale after ${attempt} retries (${reason})`,
          targetVersion,
          migrated,
          alreadyCurrent,
          pending,
          retries,
          report,
        }
      }
      const waitMs = retryDelaysMs[attempt++]
      retries++
      onLog(`  waiting ${Math.round(waitMs / 1000)}s for new Worker isolate (${reason})...`)
      await sleep(waitMs)
    }

    if (resStatus < 200 || resStatus >= 300 || !body?.ok) {
      return {
        ok: false,
        code: body?.error?.code ?? `HTTP_${resStatus}`,
        message: `HTTP ${resStatus} ${body?.error?.code ?? ""}`.trim(),
        targetVersion,
        migrated,
        alreadyCurrent,
        pending,
        retries,
        report,
      }
    }

    const d = body.data
    if (Number.isSafeInteger(d.targetVersion)) targetVersion = d.targetVersion
    migrated += d.migrated
    alreadyCurrent += d.alreadyCurrent
    if (dryRun) pending += d.report.length
    report.push(...d.report)
    for (const line of d.report) onLog(`  ${line}`)
    if (d.failed) {
      return {
        ok: false,
        code: "TENANT_FAILED",
        failed: d.failed,
        message: `STOPPED at tenant ${d.failed.tenantId} (now in recovery): ${d.failed.error}`,
        targetVersion,
        migrated,
        alreadyCurrent,
        pending,
        retries,
        report,
      }
    }
    if (!d.nextCursor) break
    cursor = d.nextCursor
  }

  return { ok: true, targetVersion, migrated, alreadyCurrent, pending, retries, report }
}
