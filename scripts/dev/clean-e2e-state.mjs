// DEC-249: every Playwright run persists local D1/DO state to a fresh `.wrangler/state-e2e-<run>` folder; abandoned
// ones pile up into gigabytes. Removes those older than `maxAgeMs` (default 2 h), never `keep`. Runs automatically
// from playwright.config.ts and on demand via `pnpm clean:e2e-state`.
import { readdirSync, rmSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export function pruneStaleE2eState({ root = ".wrangler", maxAgeMs = 2 * 3600_000, keep = "", now = Date.now() } = {}) {
  let names
  try {
    names = readdirSync(root)
  } catch {
    return []
  }
  const removed = []
  for (const name of names) {
    if (!name.startsWith("state-e2e-")) continue
    const dir = path.join(root, name)
    if (path.normalize(dir) === path.normalize(keep)) continue
    try {
      if (now - statSync(dir).mtimeMs < maxAgeMs) continue
      rmSync(dir, { recursive: true, force: true })
      removed.push(dir)
    } catch {
      // A folder another run is still writing to (or already gone) is left alone.
    }
  }
  return removed
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const removed = pruneStaleE2eState()
  console.log(`clean:e2e-state: removed ${removed.length} stale folder(s)${removed.length ? `: ${removed.join(", ")}` : ""}`)
}
