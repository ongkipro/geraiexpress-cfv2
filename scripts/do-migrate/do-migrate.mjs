#!/usr/bin/env node
// `pnpm do:migrate --env <local|staging|production> [--dry-run] [--json] [--batch 25] [--expect-version <N|auto|none>]`
// Walks tenants in batches through the Worker's ops endpoint (POST /internal/ops/do-migrate on the owner host), which
// migrates each GeraiVaultDO by explicit RPC, records progress in D1 `tenant_schema_versions`, and stops on the first
// failure (that tenant enters `recovery`; the others keep serving). Automatically retries on post-deploy stale Worker
// isolates (`409 STALE_ISOLATE` or `targetVersion < expectVersion`). ADR-0006 §4, spec 07 §6.
// The ops token is read from the environment (GX_OPS_TOKEN); it is never printed.
import { readFileSync } from "node:fs"
import { parseArgs } from "node:util"
import { readLocalTenantSchemaVersion, runDoMigrate } from "./do-migrate-lib.mjs"

const { values } = parseArgs({
  options: {
    env: { type: "string", default: "local" },
    "dry-run": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    batch: { type: "string", default: "25" },
    "expect-version": { type: "string", default: "auto" },
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
const localVersion = readLocalTenantSchemaVersion()
let expectVersion = null
if (values["expect-version"] === "auto") {
  if (!values["dry-run"] && localVersion === null) {
    console.error("do:migrate: FAIL — could not parse local TENANT_SCHEMA_VERSION from packages/db/src/tenant.ts (pass --expect-version <N|none> to override)")
    process.exit(2)
  }
  expectVersion = localVersion
} else if (values["expect-version"] !== "none") {
  const n = Number(values["expect-version"])
  if (!Number.isSafeInteger(n) || n < 1) {
    console.error(`do:migrate: invalid --expect-version ${values["expect-version"]}`)
    process.exit(2)
  }
  expectVersion = n
}

const result = await runDoMigrate({
  origin,
  token,
  batch,
  dryRun: values["dry-run"],
  expectVersion,
  onLog: (line) => {
    if (!values.json) console.log(line)
  },
})

if (!result.ok) {
  console.error(`do:migrate: ${result.code === "TENANT_FAILED" ? result.message : `FAIL — ${result.message}`}`)
  process.exit(1)
}

if (values.json) {
  console.log(
    JSON.stringify({
      env: values.env,
      dryRun: values["dry-run"],
      targetVersion: result.targetVersion,
      localVersion,
      pending: result.pending,
      migrated: result.migrated,
      alreadyCurrent: result.alreadyCurrent,
      retries: result.retries,
      report: result.report,
    }),
  )
} else {
  const retryNote = result.retries > 0 ? `, retries ${result.retries}` : ""
  const verNote = values["dry-run"] ? ` [live v${result.targetVersion ?? "?"}, local v${localVersion ?? "?"}]` : ""
  console.log(
    `do:migrate: ${values["dry-run"] ? "DRY RUN " : ""}PASS (${values.env}) — migrated ${result.migrated}, already current ${result.alreadyCurrent}${retryNote}${verNote}`,
  )
}
