// Mengantar Partner API client (TASK-202, DEC-204, DEC-219, ADR-0003, spec 10 §4). Four POST routes. The Worker signs
// every call (`sha256(METHOD:PATH:TYPE:BODY:TIMESTAMP:PARTNER_SECRET)` over the exact body bytes, spec 10 §4.2 item 3)
// and sends it either directly (local/sandbox) or through the static-egress relay (production) with an HMAC envelope.
// `api-key/regenerate` is never retried automatically; an unknown outcome is reported as `maybe_sent`.
export const PARTNER_ROUTES = {
  register: "/api/partner/v1/sellers",
  list: "/api/partner/v1/sellers/list",
  apiKey: "/api/partner/v1/sellers/api-key",
  regenerate: "/api/partner/v1/sellers/api-key/regenerate",
} as const
export type PartnerRoute = keyof typeof PARTNER_ROUTES
export const PARTNER_PATHS: readonly string[] = Object.values(PARTNER_ROUTES)

const te = new TextEncoder()
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("")
export const sha256Hex = async (s: string) => hex(await crypto.subtle.digest("SHA-256", te.encode(s)))
async function hmacHex(secret: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return hex(await crypto.subtle.sign("HMAC", k, te.encode(msg)))
}

/** Mengantar Partner signature over the exact body string (TYPE is empty for every partner route). */
export function partnerSignature(input: { method: "POST"; path: string; body: string; timestamp: string; secret: string; type?: string }): Promise<string> {
  return sha256Hex(`${input.method}:${input.path}:${input.type ?? ""}:${input.body}:${input.timestamp}:${input.secret}`)
}

/** Relay envelope signature (spec 10 §4.1): HMAC(RELAY_SECRET, ts \n id \n target \n sha256(body)). */
export async function relaySignature(secret: string, ts: string, id: string, target: string, body: string): Promise<string> {
  return hmacHex(secret, `${ts}\n${id}\n${target}\n${await sha256Hex(body)}`)
}

export type PartnerOutcome<T> =
  | { kind: "ok"; status: number; data: T }
  | { kind: "error"; status: number; code: string; message: string; field?: string }
  /** The request may have reached Mengantar (timeout after send, relay duplicate, 5xx): reconcile per route. */
  | { kind: "maybe_sent"; reason: "timeout" | "network" | "relay_duplicate" | "upstream_5xx" }
  /** The relay refused before Mengantar was called (never a Mengantar answer). */
  | { kind: "relay_refused"; status: number; code: string }

export interface PartnerConfig {
  transport: "direct" | "relay"
  partnerId: string
  partnerSecret: string
  /** Mengantar Partner origin (direct) — never inferred from the Public origin. */
  partnerOrigin: string
  relayUrl?: string
  relaySecret?: string
  fetchImpl?: typeof fetch
  now?: () => number
  timeoutMs?: number
}

export interface RegisterInput {
  name: string
  email: string
  phone: string
  externalUserId: string
}

export class PartnerClient {
  constructor(private readonly cfg: PartnerConfig) {
    if (cfg.transport === "relay" && (!cfg.relayUrl || !cfg.relaySecret)) throw new Error("relay transport needs PARTNER_RELAY_URL and PARTNER_RELAY_SECRET")
  }

  register(input: RegisterInput) {
    return this.call<{ sellerId: string; email: string; apiKey: string | null }>("register", { name: input.name, email: input.email, phone: input.phone, externalUserId: input.externalUserId })
  }
  list(filter: { externalUserId?: string; page?: number; size?: number } = {}) {
    return this.call<{ sellers: Array<{ sellerId: string; externalUserId: string; active: boolean }>; total: number }>("list", filter)
  }
  apiKey(sellerId: string) {
    return this.call<{ sellerId: string; apiKey: string }>("apiKey", { sellerId })
  }
  /** Rotates the key AND the webhook secret. Called exactly once per decision; never auto-retried. */
  regenerate(sellerId: string) {
    return this.call<{ sellerId: string; apiKey: string; callbackSecret: string | null }>("regenerate", { sellerId })
  }

  private async call<T>(route: PartnerRoute, payload: Record<string, unknown>, relayId: string = crypto.randomUUID()): Promise<PartnerOutcome<T>> {
    const path = PARTNER_ROUTES[route]
    const body = JSON.stringify(payload) // built once; the same bytes are signed and sent
    const ts = String(Math.floor((this.cfg.now?.() ?? Date.now()) / 1000))
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "partner-id": this.cfg.partnerId,
      timestamp: ts,
      signature: await partnerSignature({ method: "POST", path, body, timestamp: ts, secret: this.cfg.partnerSecret }),
    }
    let url: string
    if (this.cfg.transport === "relay") {
      url = `${this.cfg.relayUrl!.replace(/\/$/, "")}/forward`
      headers["x-relay-timestamp"] = ts
      headers["x-relay-id"] = relayId
      headers["x-relay-target"] = path
      headers["x-relay-signature"] = await relaySignature(this.cfg.relaySecret!, ts, relayId, path, body)
    } else {
      url = `${this.cfg.partnerOrigin.replace(/\/$/, "")}${path}`
    }
    let res: Response
    try {
      res = await (this.cfg.fetchImpl ?? fetch)(url, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 15_000) })
    } catch (err) {
      const name = (err as { name?: string })?.name
      return { kind: "maybe_sent", reason: name === "TimeoutError" || name === "AbortError" ? "timeout" : "network" }
    }
    let json: { success?: boolean; data?: T; code?: string; message?: string; field?: string } | null
    try {
      json = JSON.parse(await res.text()) as typeof json
    } catch (err) {
      // Headers arrived but the body is unreadable: on 2xx/5xx the call may have been applied (never a refusal).
      if (res.ok || res.status >= 500) {
        const name = (err as { name?: string })?.name
        return { kind: "maybe_sent", reason: name === "TimeoutError" || name === "AbortError" ? "timeout" : res.ok ? "network" : "upstream_5xx" }
      }
      json = null
    }
    const code = json?.code ?? ""
    if (code.startsWith("relay_")) {
      if (code === "relay_duplicate") return { kind: "maybe_sent", reason: "relay_duplicate" }
      if (code === "relay_upstream_timeout") return { kind: "maybe_sent", reason: "timeout" }
      return { kind: "relay_refused", status: res.status, code }
    }
    if (res.ok && json?.success && json.data !== undefined) return { kind: "ok", status: res.status, data: json.data }
    if (res.status >= 500 && code !== "KEY_PROVISIONING_FAILED") return { kind: "maybe_sent", reason: "upstream_5xx" }
    // A 2xx without a readable success/error envelope (`{}`, `null`, success without data) proves nothing: unknown.
    if (res.ok && !(json && typeof json === "object" && json.success === false && code)) return { kind: "maybe_sent", reason: "network" }
    return { kind: "error", status: res.status, code: code || `HTTP_${res.status}`, message: typeof json?.message === "string" ? json.message : "", field: json?.field }
  }
}
