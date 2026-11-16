// Redacting transport for the Mengantar Public API (ARCHITECTURE §4.1, DEC-210). The seller key lives in the URL path
// (`/api/public/{API_KEY}/…`); it is substituted only at fetch time and never appears in an error, a log or a returned
// value. Every call is bounded by AbortSignal.timeout.
export const KEY_PLACEHOLDER = "{API_KEY}"
export const DEFAULT_TIMEOUT_MS = 15_000

export type MengantarErrorKind = "http" | "timeout" | "network" | "envelope" | "parse"

/** Thrown for every failure. `path` is the templated path (`/api/public/{API_KEY}/order`), never the real URL. */
export class MengantarError extends Error {
  constructor(
    readonly kind: MengantarErrorKind,
    readonly path: string,
    readonly status: number | null,
    readonly code: string | null,
    message: string,
    readonly retryAfterSeconds: number | null = null,
    readonly idempotentReplayed = false,
    /** Response body with the key scrubbed (for reconciliation), never the request. */
    readonly body: unknown = null,
  ) {
    super(message)
    this.name = "MengantarError"
  }
  /** An outcome we cannot know (timeout, network, 5xx): callers must read back, never blindly retry (ADR-0004). */
  get ambiguous(): boolean {
    // Any 5xx (JSON or an HTML gateway page) and an unreadable 2xx body may hide an applied request.
    return this.kind === "timeout" || this.kind === "network" || (this.status ?? 0) >= 500 || (this.kind === "parse" && (this.status ?? 0) >= 200 && (this.status ?? 0) < 300)
  }
}

export function scrubKey(text: string, apiKey: string | null): string {
  let out = text.replace(/(\/api\/public\/)(?!\{API_KEY\})[^/?#\s"']+/g, `$1${KEY_PLACEHOLDER}`)
  if (apiKey && apiKey.length >= 4) out = out.split(apiKey).join("[REDACTED]")
  return out
}

function scrubDeep(value: unknown, apiKey: string | null, depth = 0): unknown {
  if (typeof value === "string") return scrubKey(value, apiKey)
  if (value === null || typeof value !== "object") return value
  if (depth > 6) return "[REDACTED]"
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, apiKey, depth + 1))
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, scrubDeep(v, apiKey, depth + 1)]))
}

export interface TransportOptions {
  origin: string
  apiKey: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export interface RequestSpec {
  method: "GET" | "POST" | "PUT" | "DELETE"
  /** Path under the keyed prefix, e.g. `/order/estimate`; or an absolute unkeyed path when `keyed` is false. */
  path: string
  keyed?: boolean
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  headers?: Record<string, string>
  timeoutMs?: number
}

export interface RawResponse {
  status: number
  headers: Headers
  json: unknown
}

export async function request(opts: TransportOptions, spec: RequestSpec): Promise<RawResponse> {
  const keyed = spec.keyed !== false
  const templ = keyed ? `/api/public/${KEY_PLACEHOLDER}${spec.path}` : spec.path
  if (keyed && (!opts.apiKey || /[/?#\s]/.test(opts.apiKey))) throw new MengantarError("envelope", templ, null, "KEY_MISSING", "Kunci Mengantar gerai belum tersedia.")
  // Validate the origin before the key enters any string (a bad origin must never throw with the key in it).
  let url: URL
  try {
    const base = new URL(opts.origin)
    if (base.protocol !== "https:" && base.protocol !== "http:") throw new Error("scheme")
    url = new URL(base.origin + base.pathname.replace(/\/$/, "") + (keyed ? templ.replace(KEY_PLACEHOLDER, encodeURIComponent(opts.apiKey)) : templ))
  } catch {
    // Fixed message only: the rejected input (which may contain the key) never leaves this boundary.
    throw new MengantarError("envelope", templ, null, "BAD_ORIGIN", "Konfigurasi Mengantar tidak valid.")
  }
  for (const [k, v] of Object.entries(spec.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v))
  let res: Response
  try {
    res = await (opts.fetchImpl ?? fetch)(url.toString(), {
      method: spec.method,
      headers: { accept: "application/json", ...(spec.body === undefined ? {} : { "content-type": "application/json" }), ...spec.headers },
      body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
      signal: AbortSignal.timeout(spec.timeoutMs ?? opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })
  } catch (err) {
    const name = (err as { name?: string })?.name
    const timeout = name === "TimeoutError" || name === "AbortError"
    throw new MengantarError(timeout ? "timeout" : "network", templ, null, null, timeout ? "Mengantar tidak merespons tepat waktu." : "Tidak dapat terhubung ke Mengantar.")
  }
  let text: string
  try {
    text = await res.text()
  } catch (err) {
    // Headers arrived but the body did not: the request may have been applied (ambiguous, read back).
    const name = (err as { name?: string })?.name
    throw new MengantarError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network", templ, res.status, null, "Respons Mengantar terputus.")
  }
  let json: unknown
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    throw new MengantarError("parse", templ, res.status, null, "Respons Mengantar tidak dapat dibaca.", null, false, scrubKey(text.slice(0, 500), opts.apiKey))
  }
  const replayed = res.headers.get("idempotent-replayed") === "true" || (json as { idempotentReplayed?: unknown })?.idempotentReplayed === true
  if (!res.ok) {
    const body = scrubDeep(json, opts.apiKey) as Record<string, unknown> | null
    const code = typeof body?.code === "string" ? body.code : typeof body?.errorCode === "string" ? body.errorCode : null
    const msg = typeof body?.message === "string" ? scrubKey(body.message, opts.apiKey) : `HTTP ${res.status}`
    const ra = Number(res.headers.get("retry-after"))
    throw new MengantarError("http", templ, res.status, code, msg, Number.isFinite(ra) && ra > 0 ? ra : null, replayed, body)
  }
  return { status: res.status, headers: res.headers, json }
}
