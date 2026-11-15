#!/usr/bin/env node
// Fails closed (exit 1) on any *.map file or secret-shaped literal in built output (DEC-210, spec 05 §4).
// Scans: client SPAs (dist/assets/**) and the bundled Worker (wrangler deploy --dry-run --outdir, never uploaded).
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { auditDirs } from "./bundle-audit-lib.mjs"

const roots = [{ dir: "dist/assets", client: true }]
if (!existsSync("dist/assets/app/index.html") || !existsSync("dist/assets/owner/index.html")) {
  console.error("bundle-audit: FAIL — dist/assets/{app,owner} missing; run `pnpm build` first")
  process.exit(1)
}
let workerOut
if (!process.argv.includes("--client-only")) {
  workerOut = mkdtempSync(join(tmpdir(), "gx-worker-bundle-"))
  execFileSync("pnpm", ["exec", "wrangler", "deploy", "--dry-run", "--env=", "--outdir", workerOut], { stdio: ["ignore", "ignore", "inherit"] })
  roots.push({ dir: workerOut, client: false })
}
const { files, problems } = auditDirs(roots)
if (workerOut) rmSync(workerOut, { recursive: true, force: true })
if (problems.length) {
  console.error(`bundle-audit: FAIL — ${problems.length} problem(s) in ${files} file(s)`)
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}
console.log(`bundle-audit: PASS — ${files} file(s), 0 source maps, 0 secret literals`)
