import { execFile } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { describe, expect, it } from "vitest"
import { verifyDispatch } from "./deploy-dispatch-gate.mjs"

const REPO = "owner1/gx"
const MAIN = "a".repeat(40)
const SHA = "b".repeat(40)
const ctx = {
  eventName: "workflow_dispatch",
  ref: "refs/heads/main",
  actor: "owner1",
  triggeringActor: "owner1",
  repositoryOwner: "owner1",
  deployOwner: "owner1",
  repository: REPO,
  sha: SHA,
}
const run = {
  id: 7,
  html_url: "https://example.test/runs/7",
  head_sha: SHA,
  event: "push",
  head_branch: "main",
  status: "completed",
  conclusion: "success",
  path: ".github/workflows/ci.yml",
  repository: { full_name: REPO },
  head_repository: { full_name: REPO },
}

/** A mocked GitHub API: `over` replaces one route's response; every call is logged. */
function mockApi(over = {}) {
  const calls = []
  const routes = {
    ref: { status: 200, body: { object: { sha: MAIN } } },
    compare: { status: 200, body: { status: "behind", merge_base_commit: { sha: SHA } } },
    runs: { status: 200, body: { workflow_runs: [run] } },
    ...over,
  }
  const api = async (path) => {
    calls.push(path)
    if (path === `repos/${REPO}/git/ref/heads/main`) return routes.ref
    if (path === `repos/${REPO}/compare/${MAIN}...${SHA}`) return routes.compare
    if (path.startsWith(`repos/${REPO}/actions/workflows/ci.yml/runs?`)) return routes.runs
    return { status: 404, body: null }
  }
  return { api, calls }
}

describe("staging dispatch gate (DEC-253)", () => {
  it("passes the owner's dispatch of a main commit with a green ci.yml push run", async () => {
    const { api, calls } = mockApi()
    expect(await verifyDispatch(ctx, api)).toEqual({ ok: true, sha: SHA, ciRun: run.html_url })
    expect(calls[2]).toContain(`head_sha=${SHA}&event=push&branch=main&status=success`)
  })

  it("passes when the commit is main's tip (identical)", async () => {
    const { api } = mockApi({ compare: { status: 200, body: { status: "identical", merge_base_commit: { sha: SHA } } } })
    expect((await verifyDispatch(ctx, api)).ok).toBe(true)
  })

  it.each([
    ["a non-dispatch event", { eventName: "workflow_run" }, /workflow_dispatch/],
    ["a dispatch from another branch", { ref: "refs/heads/feature" }, /refs\/heads\/main/],
    ["a dispatch from a tag named main", { ref: "refs/tags/main" }, /refs\/heads\/main/],
    ["a collaborator as actor", { actor: "someone" }, /actor someone/],
    ["a collaborator re-running the owner's run", { triggeringActor: "someone" }, /triggering actor someone/],
    ["a missing triggering actor", { triggeringActor: undefined }, /triggering actor/],
    ["a transferred repository", { repositoryOwner: "neworg", actor: "neworg", triggeringActor: "neworg" }, /pinned deploy owner/],
    ["an unset pinned owner", { deployOwner: "" }, /pinned deploy owner/],
    ["a repository of another owner", { repository: "other/gx" }, /not owned/],
    ["a short SHA", { sha: SHA.slice(0, 7) }, /40-character/],
    ["an upper-case SHA", { sha: SHA.toUpperCase() }, /40-character/],
    ["a branch name as SHA", { sha: "main" }, /40-character/],
    ["a SHA with a trailing newline", { sha: `${SHA}\n` }, /40-character/],
  ])("denies %s without calling the API", async (_name, patch, reason) => {
    const { api, calls } = mockApi()
    const result = await verifyDispatch({ ...ctx, ...patch }, api)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(reason)
    expect(calls).toEqual([])
  })

  it.each([
    ["main cannot be resolved", { ref: { status: 404, body: null } }, /refs\/heads\/main/],
    ["main resolves to garbage", { ref: { status: 200, body: { object: { sha: "x" } } } }, /refs\/heads\/main/],
    ["the commit is unknown", { compare: { status: 404, body: null } }, /not comparable/],
    ["the commit is ahead of main (unmerged branch)", { compare: { status: 200, body: { status: "ahead", merge_base_commit: { sha: MAIN } } } }, /not on main/],
    ["the commit diverged from main", { compare: { status: 200, body: { status: "diverged", merge_base_commit: { sha: MAIN } } } }, /not on main/],
    ["behind but the merge base is another commit", { compare: { status: 200, body: { status: "behind", merge_base_commit: { sha: MAIN } } } }, /not on main/],
    ["the runs API fails", { runs: { status: 500, body: null } }, /cannot list/],
    ["no ci.yml run exists", { runs: { status: 200, body: { workflow_runs: [] } } }, /no successful/],
  ])("denies when %s", async (_name, over, reason) => {
    const { api } = mockApi(over)
    const result = await verifyDispatch(ctx, api)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(reason)
  })

  it.each([
    ["a failed run", { conclusion: "failure" }],
    ["an in-progress run", { status: "in_progress", conclusion: null }],
    ["a pull_request run", { event: "pull_request" }],
    ["a run on another branch", { head_branch: "feature" }],
    ["a run of another commit", { head_sha: MAIN }],
    ["a run of another workflow file", { path: ".github/workflows/deploy-staging.yml" }],
    ["a run from a fork", { head_repository: { full_name: "fork/gx" } }],
  ])("denies when the only listed run is %s (the API filter is not trusted)", async (_name, patch) => {
    const { api } = mockApi({ runs: { status: 200, body: { workflow_runs: [{ ...run, ...patch }] } } })
    const result = await verifyDispatch(ctx, api)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/no successful/)
  })

  it("propagates a network error so the CLI fails closed", async () => {
    await expect(verifyDispatch(ctx, async () => Promise.reject(new Error("offline")))).rejects.toThrow("offline")
  })
})

describe("staging dispatch gate CLI (environment wiring)", () => {
  const script = fileURLToPath(new URL("./deploy-dispatch-gate.mjs", import.meta.url))

  async function cli(envPatch, routes) {
    const server = createServer((req, res) => {
      const hit = Object.entries(routes).find(([prefix]) => req.url?.startsWith(prefix))
      res.writeHead(hit ? 200 : 404, { "content-type": "application/json" })
      res.end(JSON.stringify(hit ? hit[1] : {}))
    })
    await new Promise((r) => server.listen(0, "127.0.0.1", r))
    const out = join(mkdtempSync(join(tmpdir(), "gx-gate-")), "output")
    const env = {
      PATH: process.env.PATH,
      GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
      GITHUB_OUTPUT: out,
      GH_TOKEN: "synthetic-token",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_REF: "refs/heads/main",
      GITHUB_ACTOR: "owner1",
      GITHUB_TRIGGERING_ACTOR: "owner1",
      GITHUB_REPOSITORY_OWNER: "owner1",
      GITHUB_REPOSITORY: REPO,
      DEPLOY_OWNER: "owner1",
      DISPATCH_SHA: SHA,
      GITHUB_RUN_ATTEMPT: "1",
      ...envPatch,
    }
    try {
      const r = await promisify(execFile)(process.execPath, [script], { env }).then(
        (x) => ({ code: 0, ...x }),
        (e) => ({ code: e.code, stdout: e.stdout, stderr: e.stderr }),
      )
      let output = ""
      try {
        output = readFileSync(out, "utf8")
      } catch {
        // no output file means the gate never wrote one
      }
      return { ...r, output }
    } finally {
      server.close()
    }
  }

  const routes = {
    [`/repos/${REPO}/git/ref/heads/main`]: { object: { sha: MAIN } },
    [`/repos/${REPO}/compare/${MAIN}...${SHA}`]: { status: "behind", merge_base_commit: { sha: SHA } },
    [`/repos/${REPO}/actions/workflows/ci.yml/runs?`]: { workflow_runs: [run] },
  }

  it("writes the verified sha and its own run attempt to GITHUB_OUTPUT on success", async () => {
    const r = await cli({ GITHUB_RUN_ATTEMPT: "3" }, routes)
    expect(r.code).toBe(0)
    expect(r.output).toBe(`sha=${SHA}\nattempt=3\n`)
  })

  it.each([["missing", undefined], ["empty", ""], ["zero", "0"], ["non-numeric", "1; x"]])(
    "fails closed with no output when GITHUB_RUN_ATTEMPT is %s",
    async (_name, attempt) => {
      const r = await cli({ GITHUB_RUN_ATTEMPT: attempt }, routes)
      expect(r.code).toBe(1)
      expect(r.stderr).toMatch(/GITHUB_RUN_ATTEMPT is missing or malformed/)
      expect(r.output).toBe("")
    },
  )

  it("exits 1 with no output when a collaborator re-runs the dispatch", async () => {
    const r = await cli({ GITHUB_TRIGGERING_ACTOR: "someone" }, routes)
    expect(r.code).toBe(1)
    expect(r.stderr).toMatch(/deploy gate denied: triggering actor someone/)
    expect(r.output).toBe("")
  })

  it("exits 1 with no output when there is no green CI run", async () => {
    const r = await cli({}, { ...routes, [`/repos/${REPO}/actions/workflows/ci.yml/runs?`]: { workflow_runs: [] } })
    expect(r.code).toBe(1)
    expect(r.output).toBe("")
  })

  it("fails closed without a token", async () => {
    const r = await cli({ GH_TOKEN: "" }, routes)
    expect(r.code).toBe(1)
    expect(r.stderr).toMatch(/failed closed: GH_TOKEN is required/)
    expect(r.output).toBe("")
  })
})

describe("deploy-staging.yml deploy condition (DEC-253 supervisor finding)", () => {
  const yml = readFileSync(fileURLToPath(new URL("../../.github/workflows/deploy-staging.yml", import.meta.url)), "utf8")
  const job = (name) => {
    const m = yml.match(new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z-]+:\\n|$)`))
    if (!m) throw new Error(`job ${name} not found`)
    return m[1]
  }
  const deploy = job("deploy")
  const verify = job("verify")
  const cond = deploy.match(/^ {4}if: \$\{\{ (.+) \}\}$/m)?.[1]

  /** Evaluates the `a == b && c != d` subset GitHub uses here; string equality is case-insensitive like Actions. */
  function evaluate(expr, ctx) {
    const value = (op) => {
      const lit = op.match(/^'(.*)'$/)
      if (lit) return lit[1]
      const v = op.split(".").reduce((o, k) => (o == null ? undefined : o[k]), ctx)
      if (v === undefined) throw new Error(`unknown context ${op}`)
      return String(v).toLowerCase()
    }
    return expr.split(" && ").every((term) => {
      const m = term.match(/^(\S+) (==|!=) (\S+)$/)
      if (!m) throw new Error(`unsupported term ${term}`)
      const eq = value(m[1]).toLowerCase() === value(m[3]).toLowerCase()
      return m[2] === "==" ? eq : !eq
    })
  }
  const base = (over = {}) => ({
    github: { event_name: "workflow_dispatch", ref: "refs/heads/main", repository_owner: "ongkipro", actor: "ongkipro", triggering_actor: "ongkipro", run_attempt: "1", ...over.github },
    needs: { verify: { result: "success", outputs: { sha: SHA, attempt: "1", ...over.outputs }, ...over.verify } },
  })

  it("is only a dispatch trigger and the verify job holds no secrets", () => {
    expect(yml).toMatch(/^on:\n {2}workflow_dispatch:\n/m)
    const code = yml.replace(/^\s*#.*\n/gm, "")
    expect(code).not.toMatch(/workflow_run|^\s+push:|pull_request/m)
    expect(verify).not.toMatch(/secrets\.|environment:/)
    expect(verify).toMatch(/attempt: \$\{\{ steps\.gate\.outputs\.attempt \}\}/)
    expect(deploy).toMatch(/^ {4}environment: staging-deploy$/m)
    // Only the gated job may name a deploy environment; the legacy `staging` environment is never referenced.
    expect(yml.match(/^\s+environment:/gm)).toHaveLength(1)
    expect(yml).not.toMatch(/environment: staging$/m)
    // The Wrangler target is unchanged.
    const runs = deploy.match(/^ {8}run: .+$/gm).map((l) => l.trim())
    for (const cmd of ["pnpm exec wrangler d1 migrations apply DB --remote --env staging", "pnpm exec wrangler deploy --env staging", "pnpm do:migrate --env staging", "pnpm probes --env staging"]) {
      expect(runs).toContain(`run: ${cmd}`)
    }
    expect(deploy).toMatch(/ref: \$\{\{ needs\.verify\.outputs\.sha \}\}/)
  })

  it("holds the deployment concurrency slot only in the authorized deploy job", () => {
    expect(yml).not.toMatch(/^concurrency:/m)
    expect(verify).not.toMatch(/concurrency:/)
    expect(deploy).toMatch(/^ {4}concurrency:\n {6}group: deploy-staging\n {6}cancel-in-progress: false$/m)
  })

  // Retries, by which jobs GitHub actually re-runs in the new attempt. The evaluator checks the context values each
  // retry produces; it does not prove GitHub's scheduling (a re-run job takes its dependents with it, a job that is not
  // re-run keeps the previous attempt's result and outputs).
  const retry = (attempt, rerunVerify, over = {}) => ({
    github: { run_attempt: String(attempt), ...over.github },
    outputs: { attempt: String(rerunVerify ? attempt : attempt - 1), ...over.outputs },
  })
  it.each([
    ["\"Re-run failed jobs\" after a deploy-only failure (verify not re-run, stale outputs)", retry(2, false), false],
    ["re-running only deploy", retry(2, false), false],
    ["a third attempt that again re-runs only deploy", retry(3, false), false],
    ["re-running verify selectively (its dependent deploy re-runs with it)", retry(2, true), true],
    ["\"Re-run failed jobs\" after verify failed (verify and deploy both re-run)", retry(2, true), true],
    ["\"Re-run all jobs\"", retry(2, true), true],
    ["a collaborator re-running verify and deploy", retry(2, true, { github: { triggering_actor: "someone" } }), false],
  ])("retry: deploy runs for %s: %s", (_name, over, expected) => {
    expect(evaluate(cond, base(over))).toBe(expected)
  })

  it.each([
    ["the owner's first dispatch", {}, true],
    ["the owner's re-run of all jobs (verify ran again in attempt 2)", { github: { run_attempt: "2" }, outputs: { attempt: "2" } }, true],
    ["a re-run of only deploy (verify outputs reused from attempt 1)", { github: { run_attempt: "2" } }, false],
    ["a re-run of only deploy after two attempts", { github: { run_attempt: "3" }, outputs: { attempt: "2" } }, false],
    ["a collaborator re-running all jobs", { github: { run_attempt: "2", triggering_actor: "someone" }, outputs: { attempt: "2" } }, false],
    ["a collaborator dispatch", { github: { actor: "someone", triggering_actor: "someone" } }, false],
    ["the owner re-running a collaborator's dispatch", { github: { actor: "someone", run_attempt: "2" }, outputs: { attempt: "2" } }, false],
    ["a dispatch from another branch", { github: { ref: "refs/heads/feature" } }, false],
    ["a dispatch from a tag named main", { github: { ref: "refs/tags/main" } }, false],
    ["a non-dispatch event", { github: { event_name: "workflow_run" } }, false],
    ["a transferred repository", { github: { repository_owner: "neworg" } }, false],
    ["a failed verify", { verify: { result: "failure" } }, false],
    ["a verify without a sha output", { outputs: { sha: "" } }, false],
    ["a verify without an attempt output", { outputs: { attempt: "" } }, false],
  ])("deploy runs for %s: %s", (_name, over, expected) => {
    expect(cond).toBeTruthy()
    expect(evaluate(cond, base(over))).toBe(expected)
  })
})

