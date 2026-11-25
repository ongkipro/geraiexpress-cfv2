#!/usr/bin/env node
// Unified zero-downtime deploy pipeline for staging & production:
//   secrets-env run -- pnpm deploy:staging [--skip-build] [--dry-run]
//   secrets-env run -- pnpm deploy:production [--skip-build] [--dry-run]
//
// Runs the exact ordered pipeline used by CI (deploy-staging.yml / deploy-production.yml):
//   0. Pre-flight guards: clean git working tree on `main` + hosted `ci.yml` status check (TASK-712)
//   1. Build SPA bundles + security:bundle-audit (unless --skip-build)
//   2. Pre-deploy DO migration check: warn if release ships a tenant DO migration (roll-forward only, DEC-254/255)
//   3. Apply D1 control-plane migrations (`wrangler d1 migrations apply DB --remote --env <env>`)
//   4. Deploy Worker + static assets (`wrangler deploy --env <env>`)
//   5. Sweep tenant GeraiVaultDO schema versions & reconcile D1 (`pnpm do:migrate --env <env>`)
//   6. Verify live liveness probes (`pnpm probes --env <env>`)
import { execFileSync } from "node:child_process"
import { parseArgs } from "node:util"

const { values } = parseArgs({
  options: {
    env: { type: "string" },
    "skip-build": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
})

const target = values.env
if (target !== "staging" && target !== "production") {
  console.error("deploy: --env must be 'staging' or 'production'")
  process.exit(2)
}

const opsToken =
  process.env.GX_OPS_TOKEN ??
  (target === "staging" ? process.env.GX_CFV2_STG_OPS_TOKEN : process.env.GX_CFV2_PROD_OPS_TOKEN)
if (!opsToken) {
  console.error(
    `deploy: ops token not found. Run via 'secrets-env run -- pnpm deploy:${target}' or set GX_OPS_TOKEN.`,
  )
  process.exit(2)
}

const childEnv = { ...process.env, GX_OPS_TOKEN: opsToken }

function run(label, cmd, args) {
  console.log(`\n==> [${target}] ${label}`)
  execFileSync(cmd, args, { stdio: "inherit", env: childEnv })
}

function capture(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8", env: childEnv }).trim()
}

if (values["dry-run"]) {
  run("Dry-run tenant DO migrations", "node", ["scripts/do-migrate/do-migrate.mjs", "--env", target, "--dry-run"])
  run("Live probes", "node", ["scripts/probes/probes.mjs", "--env", target])
  console.log(`\ndeploy: DRY RUN PASS (${target})`)
  process.exit(0)
}

// Guard 1 (TASK-712): refuse manual deploys from a dirty working tree or non-main branch so live deploys always map
// to an exact commit on `main`.
const branch = capture("git", ["rev-parse", "--abbrev-ref", "HEAD"])
if (branch !== "main") {
  console.error(`deploy: refusing to deploy from branch '${branch}'. Switch to 'main' first.`)
  process.exit(2)
}
const dirty = capture("git", ["status", "--porcelain"])
if (dirty) {
  console.error("deploy: refusing to deploy with uncommitted changes in the working tree. Commit or clean first.")
  process.exit(2)
}
const sha = capture("git", ["rev-parse", "HEAD"])
console.log(`\n==> [${target}] Pre-flight: main @ ${sha.slice(0, 7)} (clean tree)`)

// Guard 2 (TASK-712 / DEC-253): require a completed, green hosted ci.yml run for the exact HEAD SHA before touching
// remote migrations or Worker deployment (Sol P1).
let runs
try {
  const raw = capture("gh", ["run", "list", "--workflow", "ci.yml", "--commit", sha, "--limit", "5", "--json", "status,conclusion,url"])
  runs = JSON.parse(raw)
} catch {
  console.error(`deploy: refusing to deploy — could not verify hosted ci.yml status for ${sha.slice(0, 7)} via 'gh'.`)
  process.exit(2)
}
const passedRun = Array.isArray(runs) ? runs.find((r) => r.status === "completed" && r.conclusion === "success") : null
if (!passedRun) {
  const latest = Array.isArray(runs) && runs.length > 0 ? runs[0] : null
  console.error(
    latest
      ? `deploy: refusing to deploy — hosted ci.yml for ${sha.slice(0, 7)} is status=${latest.status} conclusion=${latest.conclusion ?? "pending"} (${latest.url ?? "no url"}). Wait for a green run.`
      : `deploy: refusing to deploy — no completed green hosted ci.yml run found for ${sha.slice(0, 7)}. Push and wait for CI first.`,
  )
  process.exit(2)
}
console.log(`deploy: hosted ci.yml (${sha.slice(0, 7)}): PASS ${passedRun.url ?? ""}`)

if (!values["skip-build"]) {
  run("Build web-app & web-owner", "pnpm", ["build"])
  run("Bundle security audit", "pnpm", ["security:bundle-audit"])
}

// Guard 3 (TASK-710 / DEC-254 / DEC-255): inspect structured pending tenant DO migration count before deploy and warn
// prominently whenever a tenant migration is pending (roll-forward only) OR if the probe cannot determine safety.
try {
  const dryJson = JSON.parse(capture("node", ["scripts/do-migrate/do-migrate.mjs", "--env", target, "--dry-run", "--json"]))
  if (!dryJson || !Number.isSafeInteger(dryJson.pending) || dryJson.pending < 0) {
    throw new Error("invalid do-migrate dry-run JSON payload")
  }
  if (dryJson.pending > 0) {
    console.warn(
      [
        "",
        "========================================================================",
        `WARNING (DEC-254/DEC-255): ${dryJson.pending} tenant DO migration(s) pending on ${target}!`,
        "Once deployed, healthy gerai objects lazy-upgrade on their first request.",
        "This release is ROLL-FORWARD ONLY: 'wrangler rollback' will refuse upgraded",
        "gerai with 503 TENANT_NOT_READY until newer code is redeployed.",
        "========================================================================",
        "",
      ].join("\n"),
    )
  }
} catch {
  console.warn(
    [
      "",
      "========================================================================",
      `WARNING (DEC-254/DEC-255): UNKNOWN ROLLBACK SAFETY on ${target}!`,
      "Pre-deploy DO migration probe failed; verify TENANT_SCHEMA_VERSION manually",
      "before assuming 'wrangler rollback' is safe after this deploy.",
      "========================================================================",
      "",
    ].join("\n"),
  )
}

run("Apply D1 control migrations", "pnpm", [
  "exec",
  "wrangler",
  "d1",
  "migrations",
  "apply",
  "DB",
  "--remote",
  "--env",
  target,
])

run("Deploy Cloudflare Worker & assets", "pnpm", ["exec", "wrangler", "deploy", "--env", target])

run("Sweep tenant DO migrations & reconcile D1", "node", [
  "scripts/do-migrate/do-migrate.mjs",
  "--env",
  target,
])

run("Verify live probes", "node", ["scripts/probes/probes.mjs", "--env", target])

console.log(`\ndeploy: PASS (${target})`)
