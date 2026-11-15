import { appApi } from "./api/app"
import { ownerApi } from "./api/owner"
import { serveSpa } from "./assets/spa"
import { classify, hostShape, normalizeHost, probeSignature } from "./host/classify"
import { d1HostLookup, hostCache, hostNames } from "./host/lookup"
import { escapeHtml, healthz, notFoundHtml, recoveryHtml, suspendedHtml } from "./http/pages"
import { handleDevLastMail } from "./ops/dev-mail"
import { handleDoMigrate } from "./ops/do-migrate"
import { handleBootstrapAdmin } from "./ops/bootstrap-admin"
import { dispatchDue } from "./email/mailer"
import { runChecks } from "./telemetry/checks"

export { GeraiVaultDO } from "./do/gerai-vault"
export { PartnerQuotaDO } from "./do/partner-quota"

const APP_API = appApi()
const OWNER_API = ownerApi()

// Path families that belong to exactly one context; on any other context they are a neutral 404 (ADR-0002).
const API_FAMILIES = [/^\/api\//, /^\/webhooks\//, /^\/internal\//, /^\/mcp(\/|$)/]
const isApiFamily = (path: string) => API_FAMILIES.some((re) => re.test(path))

export default {
  async fetch(request, env, exec): Promise<Response> {
    const url = new URL(request.url)
    const names = hostNames(env)

    // Liveness without storage (spec 07 §2), only on hosts this Worker may serve (never relay., never IP literals).
    if (url.pathname === "/healthz" && (request.method === "GET" || request.method === "HEAD")) {
      const host = normalizeHost(request.headers.get("host") ?? url.host)
      return host && hostShape(host, names) !== "never" ? healthz() : notFoundHtml()
    }

    const c = await classify(request, names, d1HostLookup(env.DB), hostCache)
    switch (c.outcome) {
      case "dcv":
        // HTTP DCV for custom hostnames must reach Cloudflare untouched (spec 11 §3 step 1).
        return env.GX_ENV === "local" ? notFoundHtml() : fetch(request)
      case "probe":
        return new Response(await probeSignature(env.PROBE_SECRET, c.host, c.nonce), {
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
        })
      case "bad_request":
      case "not_found":
        return notFoundHtml()
      case "suspended":
        return suspendedHtml()
      case "recovery":
        return recoveryHtml()
    }

    const ctx = c.ctx
    const path = url.pathname
    const readOnly = request.method === "GET" || request.method === "HEAD"
    if (ctx.kind === "tenant") {
      // Mini-site routes arrive with TASK-501; until then only `GET /` answers.
      if (!readOnly || path !== "/") return notFoundHtml()
      return new Response(
        `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Gerai</title></head><body><p>Gerai ${escapeHtml(ctx.tenantSlug)}</p></body></html>`,
        { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
      )
    }
    switch (ctx.context) {
      case "GERAI_WORKSPACE":
        if (path.startsWith("/api/app/")) return APP_API.fetch(request, env, exec)
        // `/api/v1/*` and `/mcp` are added by their tasks; every other API family is foreign here.
        if (isApiFamily(path)) return notFoundHtml()
        return serveSpa(request, env.ASSETS, "app")
      case "PLATFORM_OWNER":
        if (path === "/internal/ops/do-migrate" && request.method === "POST") return handleDoMigrate(request, env)
        if (path === "/internal/dev/last-mail" && request.method === "GET") return handleDevLastMail(request, env)
        if (path === "/internal/ops/bootstrap-admin" && request.method === "POST") return handleBootstrapAdmin(request, env)
        if (path.startsWith("/api/owner/")) return OWNER_API.fetch(request, env, exec)
        if (isApiFamily(path)) return notFoundHtml()
        return serveSpa(request, env.ASSETS, "owner")
      case "MARKETING_APEX":
      case "WEBHOOK_INGEST":
        return notFoundHtml()
    }
  },
  async queue(batch): Promise<void> {
    // No consumer is wired yet: acknowledge so nothing is redelivered into a missing handler.
    batch.ackAll()
  },
  async scheduled(controller, env, ctx): Promise<void> {
    // Every 5 min: email outbox retries/expiry (TASK-104) and operator checks with owner alerts (TASK-110).
    if (controller.cron === "*/5 * * * *") {
      ctx.waitUntil(dispatchDue(env).then(() => undefined))
      ctx.waitUntil(runChecks(env).then(() => undefined))
    }
  },
} satisfies ExportedHandler<Env>
