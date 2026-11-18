// DEC-249: every Playwright run persists local D1/DO state to a fresh `.wrangler/state-e2e-<run>` folder; abandoned
// ones pile up into gigabytes. Removes those whose newest content is older than `maxAgeMs` (default 2 h). Never
// touches: anything that is not a real directory (files, symlinks), the `keep` folder(s), any folder a live process
// is persisting to (`--persist-to <dir>` in `/proc/*/cmdline` on Linux), or folders not named `state-e2e-*`.
// Runs from playwright.config.ts (skipped with GX_REUSE_SERVER) and on demand via `pnpm clean:e2e-state`.
import { lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/** Latest mtime of a directory and everything under it (symlinks are not followed). */
export function newestMtime(dir) {
  let newest = lstatSync(dir).mtimeMs
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = lstatSync(p)
    newest = Math.max(newest, st.isDirectory() && !st.isSymbolicLink() ? newestMtime(p) : st.mtimeMs)
  }
  return newest
}

/** Absolute `--persist-to` paths of live processes (wrangler/workerd); [] where `/proc` is unavailable. */
export function activePersistPaths(procRoot = "/proc") {
  const out = []
  let pids
  try {
    pids = readdirSync(procRoot).filter((n) => /^\d+$/.test(n))
  } catch {
    return out
  }
  for (const pid of pids) {
    try {
      const args = readFileSync(path.join(procRoot, pid, "cmdline"), "utf8").split("\0")
      const i = args.findIndex((a) => a === "--persist-to" || a.startsWith("--persist-to="))
      if (i < 0) continue
      const arg = args[i].startsWith("--persist-to=") ? args[i].slice("--persist-to=".length) : args[i + 1]
      if (!arg) continue
      let cwd = process.cwd()
      try {
        cwd = readlinkSync(path.join(procRoot, pid, "cwd"))
      } catch {
        // Another user's process: resolve against our own directory (best effort).
      }
      out.push(path.resolve(cwd, arg))
    } catch {
      // The process exited while we looked.
    }
  }
  return out
}

export function pruneStaleE2eState({ root = ".wrangler", maxAgeMs = 2 * 3600_000, keep = [], activePaths, now = Date.now() } = {}) {
  let names
  try {
    names = readdirSync(root)
  } catch {
    return []
  }
  // Both spellings of every protected path: as written (also for one not created yet) and with symlinks resolved, so
  // `.wrangler/active-run -> .wrangler/state-e2e-x` protects the real folder too.
  const real = (p) => {
    try {
      return realpathSync(p)
    } catch {
      return null
    }
  }
  const protectedDirs = new Set(
    [...[keep].flat(), ...(activePaths ?? activePersistPaths())].filter(Boolean).flatMap((k) => [path.resolve(k), real(k)]).filter(Boolean),
  )
  const removed = []
  for (const name of names) {
    if (!name.startsWith("state-e2e-")) continue
    const dir = path.join(root, name)
    try {
      const st = lstatSync(dir)
      if (!st.isDirectory() || st.isSymbolicLink()) continue
      if (protectedDirs.has(path.resolve(dir)) || protectedDirs.has(real(dir))) continue
      if (now - newestMtime(dir) < maxAgeMs) continue
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
