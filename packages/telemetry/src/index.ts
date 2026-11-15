// Structured telemetry events (OBSERVABILITY.md). Diagnostic only, never the audit trail.
// Rules: bounded labels (no tenant id, phone, token in labels); every value passes `redact`; one JSON line per event
// to console (Workers Logs). Tenant id may appear as an attribute (not a metric label) for per-tenant diagnosis.

export type Severity = "debug" | "info" | "warn" | "error"

/** Event names and their bounded label sets (OBSERVABILITY.md "Operator decisions and signals"). */
export const EVENTS = {
  "http.request": ["context", "route", "status_class"],
  "shipment.issue": ["outcome", "courier"],
  "webhook.inbox": ["outcome"],
  "finance.sync": ["outcome"],
  "mengantar.public_api": ["route", "status", "outcome"],
  "mengantar.partner_api": ["route", "status", "outcome"],
  "discount.verification": ["state"],
  "email.outbox": ["template", "outcome"],
  "auth.otp": ["outcome"],
  "hostname.lifecycle": ["state"],
  "tenant.object": ["outcome"],
  "probe.check": ["probe", "outcome"],
  "alert.fired": ["alert"],
} as const satisfies Record<string, readonly string[]>

export type EventName = keyof typeof EVENTS
type Labels<E extends EventName> = { [K in (typeof EVENTS)[E][number]]?: string | number }

export const OUTCOMES = {
  "shipment.issue": ["issued", "unpaid_hold", "reconciliation_needed", "failed"],
  "mengantar.public_api": ["ok", "ip_not_allowed", "unauthorized", "forbidden", "rate_limited", "timeout", "error"],
} as const

const SENSITIVE_KEY = /(pass(word)?|secret|token|api[_-]?key|apikey|authorization|cookie|otp|code_plain|pepper|kek|signature|session|raw_?body|^body$|phone|^hp$|whatsapp|email_plain|npwp|link|^to$|^email$)/i
// Value patterns redacted wherever they appear (free text, URLs, error messages).
const VALUE_RULES: [RegExp, string][] = [
  // Mengantar Public API key in the URL path (ARCHITECTURE §4.1).
  [/(\/api\/public\/)(?!\{API_KEY\})[^/?#\s"']+/g, "$1{API_KEY}"],
  // Single-use tokens in paths: password reset, invitation, webhook path token (spec 01 §2.7).
  [/(\/(?:atur-sandi|undangan|webhooks\/mengantar)\/)[^/?#\s"']+/g, "$1[REDACTED]"],
  // Sensitive query parameters.
  [/([?&](?:token|code|otp|secret|api_key|apikey|key|signature|sig)=)[^&#\s"']+/gi, "$1[REDACTED]"],
  // Session cookies and cookie headers.
  [/\b((?:__Host-)?(?:dev_)?ge_(?:app|owner))=[^;\s"',]+/g, "$1=[REDACTED]"],
  [/\b((?:set-)?cookie)\s*:\s*[^\n"]+/gi, "$1: [REDACTED]"],
  // Bearer/Basic credentials, JWTs, GeraiExpress API keys.
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [REDACTED]"],
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, "[JWT]"],
  [/\bgx_(?:live|test)_[A-Za-z0-9_-]+/g, "gx_[REDACTED]"],
  // Indonesian mobile numbers incl. separators (08…, +62 8…, 62-8…): keep the last 4 digits only.
  [/(?<![\d])(?:\+?62[\s.-]?|0)8(?:\d[\s.-]?){4,11}?(\d{4})(?![\d])/g, "08xx-xxxx-$1"],
  // OTPs: 6-digit codes and 4-digit return pickup codes near an OTP word (incl. TOTP and "Kode verifikasi …: 482915").
  [/\b(t?otp|kode|code|pin)\b([^\d\n]{0,40})\d{4,8}\b/gi, "$1$2[REDACTED]"],
  // Email addresses.
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[EMAIL]"],
]

export function redactString(s: string): string {
  let out = s
  for (const [re, rep] of VALUE_RULES) out = out.replace(re, rep)
  return out.length > 1000 ? `${out.slice(0, 1000)}…` : out
}

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === "string") return redactString(value)
  if (typeof value === "number" || typeof value === "boolean") return value
  if (typeof value === "bigint") return value.toString()
  if (depth > 4) return "[DEPTH]"
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "[INVALID_DATE]" : value.toISOString()
  if (value instanceof URL) return redactString(value.href)
  if (typeof Headers !== "undefined" && value instanceof Headers) {
    const out: Record<string, string> = {}
    value.forEach((v, k) => (out[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : redactString(v)))
    return out
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return "[BYTES]"
  if (Array.isArray(value)) {
    // Header tuples: [["cookie", "..."], ...]
    if (value.length === 2 && typeof value[0] === "string" && SENSITIVE_KEY.test(value[0])) return [value[0], "[REDACTED]"]
    return value.slice(0, 50).map((v) => redact(v, depth + 1))
  }
  if (value instanceof Error) return { name: value.name, message: redactString(value.message) }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : redact(v, depth + 1)
    }
    return out
  }
  return redactString(String(value))
}

export interface EventRecord {
  ts: string
  event: EventName
  severity: Severity
  env: string
  labels: Record<string, string | number>
  attrs: Record<string, unknown>
}

export type Sink = (line: string, severity: Severity) => void

const defaultSink: Sink = (line, severity) => {
  if (severity === "error") console.error(line)
  else if (severity === "warn") console.warn(line)
  else console.log(line)
}

/** Emits one structured event. Unknown label keys are dropped (bounded cardinality). */
export function emit<E extends EventName>(
  event: E,
  labels: Labels<E>,
  attrs: Record<string, unknown> = {},
  opts: { severity?: Severity; env?: string; sink?: Sink; now?: number } = {},
): EventRecord {
  const allowed = new Set<string>(EVENTS[event])
  const cleanLabels: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(labels as Record<string, string | number | undefined>)) {
    if (!allowed.has(k) || v === undefined) continue
    cleanLabels[k] = typeof v === "number" ? v : redactString(String(v)).slice(0, 64)
  }
  const rec: EventRecord = {
    ts: new Date(opts.now ?? Date.now()).toISOString(),
    event,
    severity: opts.severity ?? "info",
    env: opts.env ?? "unknown",
    labels: cleanLabels,
    attrs: redact(attrs) as Record<string, unknown>,
  }
  ;(opts.sink ?? defaultSink)(JSON.stringify(rec), rec.severity)
  return rec
}

// -------------------------------------------------------------------------------------------------------------
// Public API anomaly signals (spec 10 §4.4, OBSERVABILITY.md "Is a seller key being misused?"). Pure evaluators:
// callers (Mengantar SDK wrapper, scheduled checks) supply counts; tenant ids stay in attributes, never in keys.

export type PublicApiOutcome = (typeof OUTCOMES)["mengantar.public_api"][number]

/** Maps a Mengantar Public API HTTP result to the bounded outcome label. */
export function publicApiOutcome(status: number | null, bodyCode?: string | null): PublicApiOutcome {
  if (status === null) return "timeout"
  if (status === 403 && bodyCode === "IP_NOT_ALLOWED") return "ip_not_allowed"
  if (status === 401) return "unauthorized"
  if (status === 403) return "forbidden"
  if (status === 429) return "rate_limited"
  if (status >= 200 && status < 300) return "ok"
  return "error"
}

export interface AnomalyAlert {
  key: string
  severity: "warn" | "error"
  text: string
  attrs: Record<string, unknown>
}

/** Any Public API `403 IP_NOT_ALLOWED` alerts immediately (DEC-232). */
export function ipNotAllowedAlert(count: number, route: string): AnomalyAlert | null {
  if (count < 1) return null
  return {
    key: "public_api_ip_not_allowed",
    severity: "error",
    text: `Mengantar menolak ${count} panggilan Public API dengan IP_NOT_ALLOWED (rute ${route}). Rute ini mungkin perlu lewat relay (spec 10 §6).`,
    attrs: { count, route },
  }
}

export const AUTH_SPIKE_MIN = 5
/** 401/403 spike for one tenant within the window (default floor 5 to avoid low-volume noise). */
export function authFailureSpikeAlert(tenantId: string, failures: number, min = AUTH_SPIKE_MIN): AnomalyAlert | null {
  if (failures < min) return null
  return {
    key: "public_api_auth_spike",
    severity: "warn",
    text: `Lonjakan penolakan 401/403 dari Mengantar untuk satu gerai (${failures} dalam 1 jam). Periksa kunci seller; rotasi bila perlu.`,
    attrs: { tenantId, failures },
  }
}

export const VOLUME_SPIKE_FACTOR = 3
export const VOLUME_SPIKE_MIN = 20
/** Issue volume in the last hour above 3× the tenant's 7-day hourly baseline (floor 20 issues/hour). */
export function issueVolumeSpikeAlert(tenantId: string, lastHour: number, baselineHourly: number): AnomalyAlert | null {
  if (lastHour < VOLUME_SPIKE_MIN) return null
  if (lastHour <= VOLUME_SPIKE_FACTOR * baselineHourly) return null
  return {
    key: "public_api_issue_volume_spike",
    severity: "warn",
    text: `Volume penerbitan resi satu gerai ${lastHour}/jam, di atas 3× rata-rata 7 hari (${baselineHourly.toFixed(1)}/jam).`,
    attrs: { tenantId, lastHour, baselineHourly },
  }
}
