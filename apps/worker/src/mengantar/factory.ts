// Builds Mengantar clients from environment configuration with optional Super Admin D1 overrides (spec 07 §3.2).
// Local development uses an in-process mock (MENGANTAR_*_ORIGIN = "mock"); staging calls the sandbox; production
// always calls the Partner API through the relay (spec 10 §4.3).
import { MengantarPublicClient, PartnerClient } from "@gx/mengantar-sdk"
import { emit, ipNotAllowedAlert, publicApiOutcome } from "@gx/telemetry"
import { decryptString } from "../crypto/aead"
import { DEMO_SELLER_API_KEY } from "../demo/constants"
import { sendAlert } from "../telemetry/alerts"
import { mockFetch } from "./mock"

export const PARTNER_SECRET_AAD = "partner-api"
export const isPlaceholderSecret = (v: string | null | undefined): boolean => !v || /^placeholder/i.test(v.trim())

export interface ResolvedMengantarConfig {
  partnerId: string
  partnerOrigin: string
  publicOrigin: string
  partnerSecret: string
  partnerSecretSource: "database" | "env" | "placeholder"
  partnerSecretTail: string | null
  relayUrl: string
  relaySecret: string
  relaySecretSource: "database" | "env" | "placeholder"
  relaySecretTail: string | null
  transport: "relay" | "direct"
  updatedAt: number | null
}

interface PartnerConfigRow {
  partner_id: string | null
  partner_origin: string | null
  public_origin: string | null
  partner_secret_encrypted: string | null
  partner_secret_tail: string | null
  relay_url: string | null
  relay_secret_encrypted: string | null
  relay_secret_tail: string | null
  updated_at: number | null
}

// 30 s in-isolate cache for the singleton D1 override row; cleared immediately on Super Admin save.
let cached: { at: number; row: PartnerConfigRow | null } | null = null
const CACHE_TTL_MS = 30_000
export function clearMengantarConfigCache(): void {
  cached = null
}

async function readConfigRow(env: Env): Promise<PartnerConfigRow | null> {
  const now = Date.now()
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.row
  try {
    const row = await env.DB.prepare(
      "SELECT partner_id, partner_origin, public_origin, partner_secret_encrypted, partner_secret_tail, relay_url, relay_secret_encrypted, relay_secret_tail, updated_at FROM platform_partner_config WHERE id = 1",
    ).first<PartnerConfigRow>()
    cached = { at: now, row: row ?? null }
    return cached.row
  } catch {
    return null
  }
}

export async function loadMengantarConfig(env: Env, opts: { bypassCache?: boolean } = {}): Promise<ResolvedMengantarConfig> {
  if (opts.bypassCache) clearMengantarConfigCache()
  const row = await readConfigRow(env)
  const mock = env.MENGANTAR_PARTNER_ORIGIN === "mock"
  if (env.GX_ENV === "production" && env.PARTNER_TRANSPORT !== "relay") throw new Error("production requires PARTNER_TRANSPORT=relay (spec 10 §4.3)")
  const dbPartnerSecret = row?.partner_secret_encrypted ? await decryptString(env.KEK_SECRET, row.partner_secret_encrypted, PARTNER_SECRET_AAD).catch(() => null) : null
  const dbRelaySecret = row?.relay_secret_encrypted ? await decryptString(env.KEK_SECRET, row.relay_secret_encrypted, PARTNER_SECRET_AAD).catch(() => null) : null
  const partnerSecret = dbPartnerSecret || env.MENGANTAR_PARTNER_SECRET
  const relaySecret = dbRelaySecret || env.PARTNER_RELAY_SECRET
  return {
    partnerId: row?.partner_id?.trim() || env.MENGANTAR_PARTNER_ID,
    partnerOrigin: mock ? "https://mock.mengantar.local" : row?.partner_origin?.trim() || env.MENGANTAR_PARTNER_ORIGIN,
    publicOrigin: env.MENGANTAR_PUBLIC_ORIGIN === "mock" ? "https://mock.mengantar.local" : row?.public_origin?.trim() || env.MENGANTAR_PUBLIC_ORIGIN,
    partnerSecret,
    partnerSecretSource: dbPartnerSecret ? "database" : isPlaceholderSecret(env.MENGANTAR_PARTNER_SECRET) ? "placeholder" : "env",
    partnerSecretTail: dbPartnerSecret ? row?.partner_secret_tail ?? null : isPlaceholderSecret(env.MENGANTAR_PARTNER_SECRET) ? null : env.MENGANTAR_PARTNER_SECRET.slice(-4),
    relayUrl: row?.relay_url?.trim() || env.PARTNER_RELAY_URL,
    relaySecret,
    relaySecretSource: dbRelaySecret ? "database" : isPlaceholderSecret(env.PARTNER_RELAY_SECRET) ? "placeholder" : "env",
    relaySecretTail: dbRelaySecret ? row?.relay_secret_tail ?? null : isPlaceholderSecret(env.PARTNER_RELAY_SECRET) ? null : env.PARTNER_RELAY_SECRET.slice(-4),
    transport: mock ? "direct" : env.PARTNER_TRANSPORT === "relay" ? "relay" : "direct",
    updatedAt: row?.updated_at ?? null,
  }
}

export async function resolvePartnerClient(env: Env, opts: { bypassCache?: boolean } = {}): Promise<PartnerClient> {
  const mock = env.MENGANTAR_PARTNER_ORIGIN === "mock"
  const cfg = await loadMengantarConfig(env, opts)
  return new PartnerClient({
    transport: cfg.transport,
    partnerId: cfg.partnerId,
    partnerSecret: cfg.partnerSecret,
    partnerOrigin: cfg.partnerOrigin,
    relayUrl: cfg.relayUrl,
    relaySecret: cfg.relaySecret,
    fetchImpl: partnerObserved(env, mock ? mockFetch : fetch),
  })
}

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

/** Any Partner `403 IP_NOT_ALLOWED` or `403 PARTNER_DEACTIVATED` alerts the owner at once. */
function partnerObserved(env: Env, inner: typeof fetch): typeof fetch {
  return async (input, init) => {
    const res = await inner(input, init)
    if (res.status === 403) {
      const body = (await res.clone().json().catch(() => null)) as { code?: string; errorCode?: string } | null
      const code = body?.code ?? body?.errorCode
      if (code === "IP_NOT_ALLOWED") {
        await sendAlert(env, { key: "partner_api_ip_not_allowed", severity: "error", text: "Mengantar menolak panggilan Partner API dengan IP_NOT_ALLOWED. Periksa IP relay dan allowlist Mengantar (spec 10 §6)." }).catch(() => undefined)
      } else if (code === "PARTNER_DEACTIVATED") {
        await sendAlert(env, { key: "partner_api_deactivated", severity: "error", text: "Akses Mengantar Partner API dinonaktifkan (PARTNER_DEACTIVATED). Hubungi tim Mengantar segera; gerai yang sudah terhubung tetap dapat mengirim." }).catch(() => undefined)
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
  const demo = apiKey === DEMO_SELLER_API_KEY
  const mock = env.MENGANTAR_PUBLIC_ORIGIN === "mock" || demo
  // Always observed (telemetry + IP_NOT_ALLOWED alert); per-tenant D1 counters only for real tenants.
  return new MengantarPublicClient({ origin: mock ? "https://mock.mengantar.local" : env.MENGANTAR_PUBLIC_ORIGIN, apiKey, fetchImpl: observed(env, demo ? null : (tenantId ?? null), mock ? mockFetch : fetch) })
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
