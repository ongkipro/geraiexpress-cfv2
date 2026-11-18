// DEC-249 (Sol R1): the stale e2e state pruner removes only old, idle, real `state-e2e-*` directories.
import { existsSync, lstatSync, lutimesSync, mkdirSync, mkdtempSync, symlinkSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { activePersistPaths, newestMtime, pruneStaleE2eState } from "./clean-e2e-state.mjs"

const HOUR = 3600_000
const now = Date.now()
const old = (p) => utimesSync(p, (now - 5 * HOUR) / 1000, (now - 5 * HOUR) / 1000)
function oldDir(root, name, inner = []) {
  const dir = path.join(root, name)
  mkdirSync(dir, { recursive: true })
  for (const f of inner) {
    const p = path.join(dir, f)
    mkdirSync(path.dirname(p), { recursive: true })
    writeFileSync(p, "x")
    old(p)
    for (let d = path.dirname(p); d !== dir; d = path.dirname(d)) old(d)
  }
  old(dir)
  return dir
}

describe("pruneStaleE2eState", () => {
  it("removes an old idle state-e2e directory and nothing else", () => {
    const root = mkdtempSync(path.join(tmpdir(), "gx-prune-"))
    const stale = oldDir(root, "state-e2e-old", ["v3/d1/db.sqlite"])
    const dev = oldDir(root, "state-dev", ["v3/d1/db.sqlite"])
    const removed = pruneStaleE2eState({ root, now, activePaths: [] })
    expect(removed).toEqual([stale])
    expect(existsSync(stale)).toBe(false)
    expect(existsSync(dev)).toBe(true)
  })

  it("never removes a regular file or a symlink, even when named like a state folder", () => {
    const root = mkdtempSync(path.join(tmpdir(), "gx-prune-"))
    const target = oldDir(root, "elsewhere", ["keep.txt"])
    const file = path.join(root, "state-e2e-file")
    writeFileSync(file, "x")
    old(file)
    const link = path.join(root, "state-e2e-link")
    symlinkSync(target, link)
    // The link and its target are as old as an abandoned run: only the type guard keeps them.
    lutimesSync(link, (now - 5 * HOUR) / 1000, (now - 5 * HOUR) / 1000)
    expect(pruneStaleE2eState({ root, now, activePaths: [] })).toEqual([])
    expect(existsSync(file)).toBe(true)
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(existsSync(path.join(link, "keep.txt"))).toBe(true)
  })

  it("keeps the current run's folder whether `keep` is relative or absolute", () => {
    const root = mkdtempSync(path.join(tmpdir(), "gx-prune-"))
    const a = oldDir(root, "state-e2e-abs")
    const r = oldDir(root, "state-e2e-rel")
    const rel = path.relative(process.cwd(), r)
    expect(pruneStaleE2eState({ root, now, keep: [a, rel], activePaths: [] })).toEqual([])
    expect(existsSync(a) && existsSync(r)).toBe(true)
  })

  it("an old folder with a fresh file deep inside (SQLite under v3/d1) is still in use", () => {
    const root = mkdtempSync(path.join(tmpdir(), "gx-prune-"))
    const dir = oldDir(root, "state-e2e-busy", ["v3/d1/miniflare-D1DatabaseObject/db.sqlite"])
    writeFileSync(path.join(dir, "v3/d1/miniflare-D1DatabaseObject/db.sqlite-wal"), "fresh")
    expect(newestMtime(dir)).toBeGreaterThan(now - HOUR)
    expect(pruneStaleE2eState({ root, now, activePaths: [] })).toEqual([])
    expect(existsSync(dir)).toBe(true)
  })

  it("a folder a live process persists to is never removed", () => {
    const root = mkdtempSync(path.join(tmpdir(), "gx-prune-"))
    const dir = oldDir(root, "state-e2e-live")
    expect(pruneStaleE2eState({ root, now, activePaths: [dir] })).toEqual([])
    expect(existsSync(dir)).toBe(true)
  })

  it("reads `--persist-to` (both forms) from a /proc-like tree, resolved against the process cwd", () => {
    const proc = mkdtempSync(path.join(tmpdir(), "gx-proc-"))
    const cwd = mkdtempSync(path.join(tmpdir(), "gx-cwd-"))
    mkdirSync(path.join(proc, "101"))
    writeFileSync(path.join(proc, "101", "cmdline"), ["node", "wrangler", "dev", "--persist-to", ".wrangler/state-e2e-a", ""].join("\0"))
    symlinkSync(cwd, path.join(proc, "101", "cwd"))
    mkdirSync(path.join(proc, "102"))
    writeFileSync(path.join(proc, "102", "cmdline"), ["workerd", "--persist-to=/srv/state-e2e-b", ""].join("\0"))
    mkdirSync(path.join(proc, "self-not-a-pid"))
    expect(activePersistPaths(proc).sort()).toEqual([path.join(cwd, ".wrangler/state-e2e-a"), "/srv/state-e2e-b"].sort())
    expect(activePersistPaths(path.join(proc, "missing"))).toEqual([])
  })
})
