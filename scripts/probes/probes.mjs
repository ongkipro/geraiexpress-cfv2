#!/usr/bin/env node
// `pnpm probes --env <local|staging|production> [--port 8787] [--alert-dry-run] [--force-fail <probe>]`
// Runs the OBSERVABILITY.md probes (liveness, no database or provider call) and exits 1 on any failure. A failure posts
// one alert to ALERT_WEBHOOK_URL (owner channel) when set; `--alert-dry-run` prints the payload instead.
import { readFileSync } from "node:fs"
import { parseArgs } from "node:util"
import { alertPayload, ENVS, parseProbes, postAlert, probeUrlsFor, runProbe } from "./probes-lib.mjs"

const { values } = parseArgs({
  options: {
    env: { type: "string", default: "local" },
    port: { type: "string", default: "8787" },
    "alert-dry-run": { type: "boolean", default: false },
    "force-fail": { type: "string" },
  },
})
if (!ENVS.includes(values.env)) {
  console.error(`probes: unknown --env ${values.env} (use ${ENVS.join(", ")})`)
  process.exit(2)
}
const probes = parseProbes(readFileSync(new URL("../../OBSERVABILITY.md", import.meta.url), "utf8"))
const targets = probeUrlsFor(probes, values.env, Number(values.port))
if (targets.length === 0) {
  console.error("probes: no probe lines found in OBSERVABILITY.md")
  process.exit(2)
}
if (values["force-fail"] && !targets.some((p) => p.name === values["force-fail"])) {
  console.error(`probes: --force-fail ${values["force-fail"]} matches no probe for ${values.env}`)
  process.exit(2)
}
const failed = []
for (const p of targets) {
  const r = await runProbe(p, { forceFail: values["force-fail"] === p.name })
  console.log(`${r.ok ? "PASS" : "FAIL"} ${p.name} ${p.url} ${r.status ?? "-"} ${r.ms} ms${r.reason ? ` (${r.reason})` : ""}`)
  if (!r.ok) failed.push({ probe: p, result: r })
}
if (failed.length) {
  const payload = alertPayload(values.env, failed)
  const hook = (process.env.ALERT_WEBHOOK_URL ?? "").trim()
  if (values["alert-dry-run"] || !hook) {
    console.log(`ALERT ${values["alert-dry-run"] ? "(dry run)" : "(ALERT_WEBHOOK_URL not set)"}: ${JSON.stringify(payload)}`)
  } else {
    const r = await postAlert(hook, payload)
    console.log(r.ok ? `ALERT sent: HTTP ${r.status}` : `ALERT NOT delivered: ${r.status ?? r.error}`)
  }
  process.exit(1)
}
console.log(`probes: PASS — ${targets.length} probe(s) on ${values.env}`)
