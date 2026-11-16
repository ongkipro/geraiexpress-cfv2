// Builds Mengantar clients from environment configuration (spec 07 §3.2). Local development uses an in-process mock
// (MENGANTAR_*_ORIGIN = "mock"); staging calls the sandbox; production calls the Partner API through the relay only.
import { MengantarPublicClient, PartnerClient } from "@gx/mengantar-sdk"
import { emit, ipNotAllowedAlert, publicApiOutcome } from "@gx/telemetry"
import { sendAlert } from "../telemetry/alerts"
import { mockFetch } from "./mock"

export function partnerClient(env: Env): PartnerClient {
  const mock = env.MENGANTAR_PARTNER_ORIGIN === "mock"
  if (env.GX_ENV === "production" && env.PARTNER_TRANSPORT !== "relay") throw new Error("production requires PARTNER_TRANSPORT=relay (spec 10 §4.3)")
  return new PartnerClient({
    transport: mock ? "direct" : env.PARTNER_TRANSPORT === "relay" ? "relay" : "direct",
    partnerId: env.MENGANTAR_PARTNER_ID,
    partnerSecret: env.MENGANTAR_PARTNER_SECRET,
    partnerOrigin: mock ? "https://mock.mengantar.local" : env.MENGANTAR_PARTNER_ORIGIN,
    relayUrl: env.PARTNER_RELAY_URL,
    relaySecret: env.PARTNER_RELAY_SECRET,
    fetchImpl: partnerObserved(env, mock ? mockFetch : fetch),
  })
}

/** Any Partner `403 IP_NOT_ALLOWED` (relay egress IP not on Mengantar's allowlist) alerts the owner at once. */
function partnerObserved(env: Env, inner: typeof fetch): typeof fetch {
  return async (input, init) => {
    const res = await inner(input, init)
    if (res.status === 403) {
      const body = (await res.clone().json().catch(() => null)) as { code?: string; errorCode?: string } | null
      if ((body?.code ?? body?.errorCode) === "IP_NOT_ALLOWED") {
        await sendAlert(env, { key: "partner_api_ip_not_allowed", severity: "error", text: "Mengantar menolak panggilan Partner API dengan IP_NOT_ALLOWED. Periksa IP relay dan allowlist Mengantar (spec 10 §6)." }).catch(() => undefined)
      }
    }
    return res
  }
}

/**
 * Public API client. With `tenantId`, every response is counted per tenant/minute/outcome/route in D1
 * `public_api_events` (no key, URL or body) and any `403 IP_NOT_ALLOWED` raises the DEC-232 alert at once
 * (OBSERVABILITY.md "Is a seller key being misused?"). Counting never blocks or fails the call.
 */
export function publicClient(env: Env, apiKey: string, tenantId?: string): MengantarPublicClient {
  const mock = env.MENGANTAR_PUBLIC_ORIGIN === "mock"
  // Always observed (telemetry + IP_NOT_ALLOWED alert); per-tenant D1 counters only when the tenant is known.
  return new MengantarPublicClient({ origin: mock ? "https://mock.mengantar.local" : env.MENGANTAR_PUBLIC_ORIGIN, apiKey, fetchImpl: observed(env, tenantId ?? null, mock ? mockFetch : fetch) })
}

/** Route label without the key: `/api/public/{KEY}/order/estimate` → `/order/estimate`. */
export const routeLabel = (url: string) => new URL(url).pathname.replace(/^.*\/api\/public\/[^/]+/, "").slice(0, 60) || "/"

function observed(env: Env, tenantId: string | null, inner: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    let status: number | null = null
    let code: string | null = null
    try {
      const res = await inner(input, init)
      status = res.status
      if (res.status === 403) {
        const b = (await res.clone().json().catch(() => null)) as { code?: string; errorCode?: string } | null
        code = b?.code ?? b?.errorCode ?? null
      }
      return res
    } finally {
      const outcome = publicApiOutcome(status, code)
      const route = routeLabel(url)
      emit("mengantar.public_api", { route, status: status ?? 0, outcome }, {}, { env: env.GX_ENV, severity: outcome === "ok" ? "info" : "warn" })
      const now = Date.now()
      if (tenantId) await env.DB.prepare(
        "INSERT INTO public_api_events (tenant_id, minute, outcome, route, count) VALUES (?1, ?2, ?3, ?4, 1) ON CONFLICT(tenant_id, minute, outcome, route) DO UPDATE SET count = count + 1",
      )
        .bind(tenantId, Math.floor(now / 60_000), outcome, route)
        .run()
        .catch(() => undefined)
      if (outcome === "ip_not_allowed") {
        const a = ipNotAllowedAlert(1, route)!
        await sendAlert(env, { key: a.key, severity: a.severity, text: a.text }, now).catch(() => undefined)
      }
    }
  }
}
