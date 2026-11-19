// Staging dispatch gate (DEC-253). Runs in the secret-less `verify` job of `deploy-staging.yml` before any job can
// reach the `staging-deploy` environment. Owner approval is the owner's own `workflow_dispatch`; this is NOT GitHub Required
// reviewers. Every check fails closed: an API error, a missing field or an unexpected shape denies the deploy.
import { appendFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

const SHA = /^[0-9a-f]{40}$/
const CI_PATH = ".github/workflows/ci.yml"

/**
 * @param {{ eventName?: string, ref?: string, actor?: string, triggeringActor?: string, repositoryOwner?: string,
 *   deployOwner?: string, repository?: string, sha?: string }} ctx
 * @param {(path: string) => Promise<{ status: number, body: any }>} api GitHub REST GET, path relative to the API root
 * @returns {Promise<{ ok: true, sha: string, ciRun: string } | { ok: false, reason: string }>}
 */
export async function verifyDispatch(ctx, api) {
  const deny = (reason) => ({ ok: false, reason })
  if (ctx.eventName !== "workflow_dispatch") return deny(`event must be workflow_dispatch, got ${ctx.eventName}`)
  if (ctx.ref !== "refs/heads/main") return deny(`dispatch ref must be refs/heads/main, got ${ctx.ref}`)
  const owner = ctx.deployOwner
  if (!owner || ctx.repositoryOwner !== owner) return deny("repository owner does not match the pinned deploy owner")
  if (ctx.actor !== owner) return deny(`actor ${ctx.actor} is not the repository owner`)
  if (ctx.triggeringActor !== owner) return deny(`triggering actor ${ctx.triggeringActor} is not the repository owner`)
  if (!ctx.repository || ctx.repository.split("/")[0] !== owner) return deny("repository is not owned by the deploy owner")
  const sha = ctx.sha ?? ""
  if (!SHA.test(sha)) return deny("sha must be a full 40-character lowercase commit SHA")

  const repo = ctx.repository
  const main = await api(`repos/${repo}/git/ref/heads/main`)
  const mainSha = main.status === 200 ? main.body?.object?.sha : undefined
  if (!SHA.test(mainSha ?? "")) return deny(`cannot resolve refs/heads/main (HTTP ${main.status})`)

  // `<main>...<sha>` is `identical` or `behind` only when the commit is main itself or one of its ancestors.
  const cmp = await api(`repos/${repo}/compare/${mainSha}...${sha}`)
  if (cmp.status !== 200) return deny(`commit ${sha} not comparable with main (HTTP ${cmp.status})`)
  if (!["identical", "behind"].includes(cmp.body?.status) || cmp.body?.merge_base_commit?.sha !== sha) {
    return deny(`commit ${sha} is not on main (compare status ${cmp.body?.status})`)
  }

  const q = `head_sha=${sha}&event=push&branch=main&status=success&per_page=20`
  const runs = await api(`repos/${repo}/actions/workflows/ci.yml/runs?${q}`)
  if (runs.status !== 200 || !Array.isArray(runs.body?.workflow_runs)) return deny(`cannot list ci.yml runs (HTTP ${runs.status})`)
  // The query filters are re-checked on every field: a filter the API ignores must not widen the gate.
  const green = runs.body.workflow_runs.find(
    (r) =>
      r?.head_sha === sha &&
      r.event === "push" &&
      r.head_branch === "main" &&
      r.status === "completed" &&
      r.conclusion === "success" &&
      r.path === CI_PATH &&
      r.repository?.full_name === repo &&
      r.head_repository?.full_name === repo,
  )
  if (!green) return deny(`no successful ${CI_PATH} push run on main for ${sha}`)
  return { ok: true, sha, ciRun: green.html_url ?? String(green.id) }
}

async function main() {
  const env = process.env
  const token = env.GH_TOKEN
  if (!token) throw new Error("GH_TOKEN is required")
  const root = env.GITHUB_API_URL ?? "https://api.github.com"
  const api = async (path) => {
    const res = await fetch(`${root}/${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
    })
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  const result = await verifyDispatch(
    {
      eventName: env.GITHUB_EVENT_NAME,
      ref: env.GITHUB_REF,
      actor: env.GITHUB_ACTOR,
      triggeringActor: env.GITHUB_TRIGGERING_ACTOR,
      repositoryOwner: env.GITHUB_REPOSITORY_OWNER,
      deployOwner: env.DEPLOY_OWNER,
      repository: env.GITHUB_REPOSITORY,
      sha: env.DISPATCH_SHA,
    },
    api,
  )
  if (!result.ok) {
    console.error(`::error::deploy gate denied: ${result.reason}`)
    process.exit(1)
  }
  // The deploy job only runs for a verify of its own run attempt (a deploy-only re-run reuses an older attempt).
  const attempt = env.GITHUB_RUN_ATTEMPT ?? ""
  if (!/^[1-9][0-9]*$/.test(attempt)) throw new Error("GITHUB_RUN_ATTEMPT is missing or malformed")
  console.log(`deploy gate passed: ${result.sha} (ci ${result.ciRun}, attempt ${attempt})`)
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `sha=${result.sha}\nattempt=${attempt}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(`::error::deploy gate failed closed: ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  })
}
