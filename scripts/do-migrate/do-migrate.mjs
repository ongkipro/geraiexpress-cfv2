#!/usr/bin/env node
// `pnpm do:migrate --env <local|staging|production> [--dry-run] [--batch 25]`
// Walks tenants in batches through the Worker's ops endpoint (POST /internal/ops/do-migrate on the owner host), which
// migrates each GeraiVaultDO by explicit RPC, records progress in D1 `tenant_schema_versions`, and stops on the first
// failure (that tenant enters `recovery`; the others keep serving). ADR-0006 §4, spec 07 §6.
// The ops token is read from the environment (GX_OPS_TOKEN); it is never printed.
import { readFileSync } from "node:fs"
import { parseArgs } from "node:util"

const { values } = parseArgs({
  options: {
    env: { type: "string", default: "local" },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    batch: { type: "string", default: "25" },
    origin: { type: "string" },
    port: { type: "string", default: "8787" },
  },
})

const ORIGINS = {
  local: `http://owner.geraiexpress.localhost:${values.port}`,
  staging: "https://owner-staging.geraiexpress.com",
  production: "https://owner.geraiexpress.com",
}
const origin = values.origin ?? ORIGINS[values.env]
if (!origin) {
  console.error(`do:migrate: unknown --env ${values.env}`)
  process.exit(2)
}
const token = process.env.GX_OPS_TOKEN ?? (values.env === "local" ? localOpsToken() : undefined)
if (!token) {
  console.error("do:migrate: GX_OPS_TOKEN is not set (use `secrets-env run -- pnpm do:migrate ...` or the CI secret)")
  process.exit(2)
}

// Local only: read OPS_TOKEN from the device-local .dev.vars (never printed).
function localOpsToken() {
  try {
    const m = readFileSync(".dev.vars", "utf8").match(/^OPS_TOKEN=(.*)$/m)
    return m?.[1]?.trim().replace(/^(["'])(.*)\1$/, "$2") || undefined
  } catch {
    return undefined
  }
}
const batch = Math.max(1, Math.min(100, Number(values.batch) || 25))

let cursor = null
let migrated = 0
let alreadyCurrent = 0
let pending = 0
const allReport = []
for (;;) {
  const res = await fetch(`${origin}/internal/ops/do-migrate`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ cursor, batch, dryRun: values["dry-run"] }),
    signal: AbortSignal.timeout(120_000),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.ok) {
    console.error(`do:migrate: FAIL — HTTP ${res.status} ${body?.error?.code ?? ""}`)
    process.exit(1)
  }
  const d = body.data
  migrated += d.migrated
  alreadyCurrent += d.alreadyCurrent
  if (values["dry-run"]) pending += d.report.length
  allReport.push(...d.report)
  if (!values.json) {
    for (const line of d.report) console.log(`  ${line}`)
  }
  if (d.failed) {
    console.error(`do:migrate: STOPPED at tenant ${d.failed.tenantId} (now in recovery): ${d.failed.error}`)
    process.exit(1)
  }
  if (!d.nextCursor) break
  cursor = d.nextCursor
}
if (values.json) {
  console.log(JSON.stringify({ env: values.env, dryRun: values["dry-run"], pending, migrated, alreadyCurrent, report: allReport }))
} else {
  console.log(`do:migrate: ${values["dry-run"] ? "DRY RUN " : ""}PASS (${values.env}) — migrated ${migrated}, already current ${alreadyCurrent}`)
}
