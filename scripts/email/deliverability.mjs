#!/usr/bin/env node
// `pnpm email:deliverability [--domain mail.geraiexpress.com] [--dkim-selector <sel>] [--headers <file>...]`
// Read-only gate for TASK-112 (spec 12 §6): checks SPF/DKIM/DMARC DNS and, for each pasted header file, SPF/DKIM/DMARC
// pass and delivery time < 60 s. Prints the 12-send inbox matrix the owner completes. Exit 1 on any failure.
import { readFileSync } from "node:fs"
import { parseArgs } from "node:util"
import { deliverySeconds, dohTxt, evaluateDns, evaluateHeaders, INBOX_MATRIX } from "./deliverability-lib.mjs"

const { values } = parseArgs({ options: { domain: { type: "string", default: "mail.geraiexpress.com" }, "dkim-selector": { type: "string" }, headers: { type: "string", multiple: true, default: [] } } })
const domain = values.domain
const org = domain.split(".").slice(-2).join(".")
const [spf, dmarc, dkim] = await Promise.all([
  dohTxt(domain),
  dohTxt(`_dmarc.${org}`),
  values["dkim-selector"] ? dohTxt(`${values["dkim-selector"]}._domainkey.${domain}`) : Promise.resolve([]),
])
let failed = false
for (const c of evaluateDns({ spf, dmarc, dkim })) {
  console.log(`${c.ok ? "PASS" : "FAIL"} dns.${c.id} — ${c.detail}`)
  if (!c.ok) failed = true
}
for (const file of values.headers) {
  const raw = readFileSync(file, "utf8")
  const h = evaluateHeaders(raw)
  const secs = deliverySeconds(raw)
  const ok = h.pass && secs !== null && secs < 60
  console.log(`${ok ? "PASS" : "FAIL"} ${file} — spf=${h.spf} dkim=${h.dkim} dmarc=${h.dmarc} delivery=${secs ?? "?"} s`)
  if (!ok) failed = true
}
console.log("\nInbox matrix (owner fills in BUILD-LOG.md: Inbox / Spam / Promotions per send):")
for (const m of INBOX_MATRIX) console.log(`  [ ] ${m.provider} · ${m.template} · kirim ke-${m.send}`)
console.log("  [ ] mail-tester score ≥ 9/10")
process.exit(failed ? 1 : 0)
