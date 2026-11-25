#!/usr/bin/env node
// Unified zero-downtime deploy pipeline for staging & production:
//   secrets-env run -- pnpm deploy:staging [--skip-build] [--dry-run]
//   secrets-env run -- pnpm deploy:production [--skip-build] [--dry-run]
//
// Runs the exact ordered pipeline used by CI (deploy-staging.yml / deploy-production.yml):
//   1. Build SPA bundles + security:bundle-audit (unless --skip-build)
//   2. Apply D1 control-plane migrations (`wrangler d1 migrations apply DB --remote --env <env>`)
//   3. Deploy Worker + static assets (`wrangler deploy --env <env>`)
//   4. Sweep tenant GeraiVaultDO schema versions & reconcile D1 (`pnpm do:migrate --env <env>`)
//   5. Verify live liveness probes (`pnpm probes --env <env>`)
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

if (values["dry-run"]) {
  run("Dry-run tenant DO migrations", "node", ["scripts/do-migrate/do-migrate.mjs", "--env", target, "--dry-run"])
  run("Live probes", "node", ["scripts/probes/probes.mjs", "--env", target])
  console.log(`\ndeploy: DRY RUN PASS (${target})`)
  process.exit(0)
}

if (!values["skip-build"]) {
  run("Build web-app & web-owner", "pnpm", ["build"])
  run("Bundle security audit", "pnpm", ["security:bundle-audit"])
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
