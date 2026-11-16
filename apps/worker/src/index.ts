import { appApi } from "./api/app"
import { ownerApi } from "./api/owner"
import { serveSpa } from "./assets/spa"
import { classify, hostShape, normalizeHost, probeSignature } from "./host/classify"
import { d1HostLookup, hostCache, hostNames, platformHostOf } from "./host/lookup"
import { healthz, notFoundHtml, recoveryHtml, suspendedHtml } from "./http/pages"
import { handleDevLastMail } from "./ops/dev-mail"
import { handleDevPreview } from "./ops/dev-preview"
import { handleDoMigrate } from "./ops/do-migrate"
import { handleBootstrapAdmin } from "./ops/bootstrap-admin"
import { dispatchDue } from "./email/mailer"
import { runChecks } from "./telemetry/checks"
import { runDiscountVerifier } from "./pricing/rules"
import { revokeExpiredRoutes } from "./do/gerai-vault/credentials/rotation"
import { consumeWebhookBatch, handleMengantarWebhook, type WebhookMessage } from "./webhooks/ingest"
import { consumeBulkBatch, type BulkMessage } from "./bulk/service"
import { handleMinisite } from "./minisite"
import { handleBrand } from "./brand"
import { handleApiV1 } from "./api-v1"
import { exportAll } from "./cron/backup"
import { handleBackupOps } from "./ops/backup"
import { handleAlertDrill } from "./ops/alert-drill"
import { checkQuota, consumeHostnameBatch, pollHosts, primaryHost, reapHosts, type HostMessage } from "./hostnames/service"
import { handleOutletMcp } from "./mcp/outlet"
import { handlePublicMcp } from "./mcp/public"
import { consumeFinanceBatch, enqueueFinanceSync, type FinanceMessage } from "./cron/finance"

export { GeraiVaultDO } from "./do/gerai-vault"
export { PartnerQuotaDO } from "./do/partner-quota"

const APP_API = appApi()

// Activation/health probe of a custom hostname (spec 11 §5 step 5). `global_fetch_strictly_public` is not enabled, so
// the request is routed like an Internet request only for hosts outside this Worker's zones (customer domains are).
const probeFetch = (url: string) => fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "GeraiExpress-Probe/1.0" } })
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
    if (ctx.kind === "tenant") {
      // Mini-site (TASK-501): API families are foreign on tenant hosts (ADR-0002) — except the public MCP (TASK-504).
      if (path === "/mcp") return handlePublicMcp(request, env, { tenantId: ctx.tenantId, tenantSlug: ctx.tenantSlug, host: ctx.host })
      if (isApiFamily(path)) return notFoundHtml()
      // `www` twin of a root custom domain: permanent redirect to the primary (spec 11 §6 root_primary).
      // Only once the root itself is an active custom host (spec 11 §6): never redirect `www` to the platform subdomain.
      if (ctx.role === "redirect" && (request.method === "GET" || request.method === "HEAD")) {
        const primary = await primaryHost(env, ctx.tenantId, ctx.tenantSlug)
        if (primary !== ctx.host && primary !== platformHostOf(env, ctx.tenantSlug)) return new Response(null, { status: 301, headers: { location: `https://${primary}${url.pathname}${url.search}`, "cache-control": "public, max-age=3600" } })
      }
      return handleMinisite(request, env, { tenantId: ctx.tenantId, tenantSlug: ctx.tenantSlug, host: ctx.host, canonicalHost: await primaryHost(env, ctx.tenantId, ctx.tenantSlug) })
    }
    switch (ctx.context) {
      case "GERAI_WORKSPACE":
        if (path.startsWith("/api/app/")) return APP_API.fetch(request, env, exec)
        if (path === "/internal/dev/preview") return handleDevPreview(request, env, "app")
        // Partner API (TASK-503) and outlet MCP (TASK-504): Bearer only; every other API family is foreign here.
        if (path === "/api/v1" || path.startsWith("/api/v1/")) return handleApiV1(request, env, exec)
        if (path === "/mcp") return handleOutletMcp(request, env, exec)
        if (isApiFamily(path)) return notFoundHtml()
        return serveSpa(request, env.ASSETS, "app")
      case "PLATFORM_OWNER":
        if (path === "/internal/ops/do-migrate" && request.method === "POST") return handleDoMigrate(request, env)
        if (path === "/internal/dev/last-mail" && request.method === "GET") return handleDevLastMail(request, env)
        if (path === "/internal/ops/bootstrap-admin" && request.method === "POST") return handleBootstrapAdmin(request, env)
        if (path === "/internal/ops/alert-drill" && request.method === "POST") return handleAlertDrill(request, env)
        if ((path === "/internal/ops/backup-export" || path === "/internal/ops/backup-restore") && request.method === "POST") return handleBackupOps(request, env, path)
        if (path === "/internal/dev/preview") return handleDevPreview(request, env, "owner")
        if (path.startsWith("/api/owner/")) return OWNER_API.fetch(request, env, exec)
        if (isApiFamily(path)) return notFoundHtml()
        return serveSpa(request, env.ASSETS, "owner")
      case "WEBHOOK_INGEST": {
        const m = /^\/webhooks\/mengantar\/([^/]+)$/.exec(path)
        return m ? handleMengantarWebhook(request, env, m[1]!) : new Response(null, { status: 404 })
      }
      case "MARKETING_APEX":
        // Brand site (TASK-502). API families are foreign on the apex (ADR-0002); no cookies are set here.
        if (isApiFamily(path)) return notFoundHtml()
        return handleBrand(request, env, ctx.host)
    }
  },
  async queue(batch, env): Promise<void> {
    if (batch.queue.startsWith("gx-mengantar-webhooks")) return consumeWebhookBatch(batch as MessageBatch<WebhookMessage>, env)
    if (batch.queue.startsWith("gx-bulk")) return consumeBulkBatch(batch as MessageBatch<BulkMessage>, env)
    if (batch.queue.startsWith("gx-mengantar-finance-sync")) return consumeFinanceBatch(batch as MessageBatch<FinanceMessage>, env)
    if (batch.queue.startsWith("gx-hostnames")) return consumeHostnameBatch(batch as MessageBatch<HostMessage>, env, probeFetch)
    // Other consumers arrive with their tasks: acknowledge so nothing is redelivered into a missing handler.
    batch.ackAll()
  },
  async scheduled(controller, env, ctx): Promise<void> {
    // Every 5 min: email outbox retries/expiry (TASK-104) and operator checks with owner alerts (TASK-110).
    if (controller.cron === "0 * * * *") ctx.waitUntil(revokeExpiredRoutes(env, Date.now()).then(() => undefined))
    // Finance sync (spec 09 §4): every 15 min fan out one message per connected gerai; daily pending-row rescan.
    if (controller.cron === "*/5 * * * *" && new Date(controller.scheduledTime).getUTCMinutes() % 15 === 0) ctx.waitUntil(enqueueFinanceSync(env, "cron").then(() => undefined))
    if (controller.cron === "0 19 * * *") ctx.waitUntil(enqueueFinanceSync(env, "pending_rescan").then(() => undefined))
    // Custom domains (spec 11 §5, §7): status poll every 10 min; daily reaper + quota check at 02:00 WIB.
    if (controller.cron === "*/5 * * * *" && new Date(controller.scheduledTime).getUTCMinutes() % 10 === 0) ctx.waitUntil(pollHosts(env, Date.now(), probeFetch).then(() => undefined))
    if (controller.cron === "0 19 * * *") ctx.waitUntil(reapHosts(env, Date.now()).then(() => checkQuota(env, Date.now())).then(() => undefined))
    // Daily per-object export to R2 (TASK-603, ADR-0006 §7).
    if (controller.cron === "0 19 * * *") ctx.waitUntil(exportAll(env, Date.now()).then(() => undefined))
    // Public API outcome counters older than 2 days (TASK-602).
    if (controller.cron === "0 19 * * *") ctx.waitUntil(env.DB.prepare("DELETE FROM public_api_events WHERE minute < ?").bind(Math.floor((Date.now() - 2 * 86_400_000) / 60_000)).run().then(() => undefined))
    if (controller.cron === "*/5 * * * *") {
      ctx.waitUntil(dispatchDue(env).then(() => undefined))
      ctx.waitUntil(runChecks(env).then(() => undefined))
      ctx.waitUntil(runDiscountVerifier(env, Date.now()).then(() => undefined))
    }
  },
} satisfies ExportedHandler<Env>
