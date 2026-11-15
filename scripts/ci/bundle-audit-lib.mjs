// Pure scanner for DEC-210 / spec 05 §4 gates 1–2. Kept dependency-free so CI and tests share it.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

// Key-shaped literals, any bundle.
export const SECRET_PATTERNS = [
  { id: "private-key", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { id: "github-token", re: /\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/ },
  { id: "aws-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "google-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: "openai-style", re: /(?:^|[^A-Za-z0-9_])sk-[A-Za-z0-9_-]{24,}/ },
  { id: "gx-live-key", re: /\bgx_live_[A-Za-z0-9]{20,}\b/ },
  { id: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  // A literal Mengantar seller key in a URL path (the SDK only ever holds a `{API_KEY}` template, AGENTS §3.5).
  { id: "mengantar-url-key", re: /https?:\/\/(?:sandbox-)?api-public\.mengantar\.com\/api\/public\/(?!\{|\$\{|["'`])[A-Za-z0-9_-]{8,}/ },
]

// Client (browser) bundles must not even mention secret-like names (spec 05 §4 gate 2: SECRET, PARTNER, PRIVATE).
export const CLIENT_FORBIDDEN_TOKEN = /\b[A-Z0-9_]*(?:SECRET|PARTNER|PRIVATE|PEPPER|KEK_|OPS_TOKEN|API_TOKEN)[A-Z0-9_]*\b/g

const SOURCEMAP_COMMENT = /(?:\/\/|\/\*)[#@]\s*sourceMappingURL=/

export function walk(dir) {
  const out = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

export function scanText(text, { client }) {
  const findings = []
  for (const { id, re } of SECRET_PATTERNS) if (re.test(text)) findings.push(id)
  if (client) for (const m of new Set(text.match(CLIENT_FORBIDDEN_TOKEN) ?? [])) findings.push(`name:${m}`)
  if (SOURCEMAP_COMMENT.test(text)) findings.push("sourcemap-comment")
  return findings
}

export function auditDirs(roots) {
  const problems = []
  let files = 0
  for (const { dir, client } of roots) {
    for (const file of walk(dir)) {
      files++
      const rel = relative(process.cwd(), file)
      if (file.toLowerCase().endsWith(".map")) {
        problems.push(`${rel}: source map file`)
        continue
      }
      if (!/\.(m?js|cjs|css|html|json|txt|svg|webmanifest)$/i.test(file)) continue
      for (const f of scanText(readFileSync(file, "utf8"), { client })) problems.push(`${rel}: ${f}`)
    }
  }
  return { files, problems }
}
