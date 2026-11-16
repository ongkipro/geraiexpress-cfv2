import { hmacSha256Hex } from "../crypto"

// Host classifier (spec 11 §3, ARCHITECTURE §3, ADR-0002) — the tenant security boundary (R4).
// Order: DCV pass-through → normalise Host → exact platform match → authoritative D1 lookup (in-isolate cache of at
// most 30 s per host; the resolved row carries routing_version, which every downstream edge-cache key includes) →
// state outcome. KV is never consulted.

export type PlatformContext = "MARKETING_APEX" | "GERAI_WORKSPACE" | "PLATFORM_OWNER" | "WEBHOOK_INGEST"
export type HostContext =
  | { kind: "platform"; context: PlatformContext; host: string }
  | { kind: "tenant"; context: "TENANT_MINISITE"; host: string; tenantId: string; tenantSlug: string; routingVersion: number; role?: "primary" | "redirect" }

export type Classified =
  | { outcome: "ok"; ctx: HostContext }
  | { outcome: "dcv" } // pass through untouched
  | { outcome: "probe"; host: string; nonce: string } // activation probe, answered for pending hosts too
  | { outcome: "not_found" } // neutral 404
  | { outcome: "suspended" } // 403
  | { outcome: "recovery" } // 503 + Retry-After
  | { outcome: "bad_request" } // malformed Host

export interface HostNames {
  /** `geraiexpress.com` in production, `geraiexpress.localhost` locally. */
  platformApex: string
  /** `geraimitra.com` in production, `geraimitra.localhost` locally. */
  tenantZone: string
  /** Staging uses `app-staging.` etc. (spec 07 §7). */
  stagingLabels?: boolean
}

export interface HostRow {
  hostname: string
  tenantId: string
  tenantSlug: string
  hostState: "pending" | "active" | "failed" | "moved" | "suspended" | "purged"
  tenantStatus: "draft_application" | "pending_review" | "active" | "suspended"
  /** `tenant_schema_versions.state`; `recovery` → 503 (ADR-0006 §4). */
  schemaState: "ok" | "migrating" | "recovery"
  routingVersion: number
  /** `redirect` = the `www` twin of a root custom domain (301 to the primary once active, spec 11 §6). */
  role?: "primary" | "redirect"
}

export type HostLookup = (hostname: string) => Promise<HostRow | null>

const MAX_HOST_LENGTH = 253
const LABEL_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/
// The rightmost label (TLD, incl. `xn--` punycode) starts with a letter and has 2+ chars, which rejects every IPv4
// literal form (decimal, octal `0177.0.0.1`, hex `0x7f.0.0.1`, shorthand `127.1`) before any lookup.
const TLD_RE = /^[a-z][a-z0-9-]{0,61}[a-z0-9]$/

/** Lowercase, strip port and trailing dot; `null` for IP literals, bad labels or over-long names. */
export function normalizeHost(raw: string | null): string | null {
  if (!raw) return null
  let h = raw.trim().toLowerCase()
  if (h.startsWith("[")) return null // IPv6 literal
  const colon = h.lastIndexOf(":")
  if (colon !== -1) {
    const port = h.slice(colon + 1)
    if (!/^\d{1,5}$/.test(port)) return null
    h = h.slice(0, colon)
  }
  if (h.endsWith(".")) h = h.slice(0, -1)
  if (!h || h.length > MAX_HOST_LENGTH) return null
  const labels = h.split(".")
  if (labels.length < 2 || !labels.every((l) => LABEL_RE.test(l))) return null
  if (!TLD_RE.test(labels.at(-1)!)) return null
  return h
}

export function platformContextFor(host: string, names: HostNames): PlatformContext | null {
  const apex = names.platformApex
  const s = names.stagingLabels ? "-staging" : ""
  const map: Record<string, PlatformContext> = names.stagingLabels
    ? {
        [`staging.${apex}`]: "MARKETING_APEX",
        [`app${s}.${apex}`]: "GERAI_WORKSPACE",
        [`owner${s}.${apex}`]: "PLATFORM_OWNER",
        [`hooks${s}.${apex}`]: "WEBHOOK_INGEST",
      }
    : {
        [apex]: "MARKETING_APEX",
        [`www.${apex}`]: "MARKETING_APEX",
        [`app.${apex}`]: "GERAI_WORKSPACE",
        [`owner.${apex}`]: "PLATFORM_OWNER",
        [`hooks.${apex}`]: "WEBHOOK_INGEST",
      }
  return map[host] ?? null
}

/**
 * Syntactic host eligibility without storage: a platform host, or a candidate tenant host (exactly one label under the
 * tenant zone, or any host outside both platform domains). Used to answer `/healthz` and DCV only on hosts that could
 * be ours; `relay.` and other platform subdomains are never served (spec 11 §1).
 */
export function hostShape(host: string, names: HostNames): "platform" | "tenant_candidate" | "never" {
  if (platformContextFor(host, names)) return "platform"
  if (host === names.platformApex || host.endsWith(`.${names.platformApex}`)) return "never"
  if (host === names.tenantZone) return "never"
  if (host.endsWith(`.${names.tenantZone}`) && host.slice(0, -names.tenantZone.length - 1).includes(".")) return "never"
  return "tenant_candidate"
}

const DCV_PREFIXES = ["/.well-known/acme-challenge/", "/.well-known/pki-validation/"]
const PROBE_PREFIX = "/.well-known/geraiexpress-probe/"

interface CacheEntry {
  row: HostRow | null
  expiresAt: number
}

/** In-isolate cache, ≤ 30 s, per host. A routing_version bump is visible after at most the TTL (spec 11 §3). */
export class HostCache {
  private readonly map = new Map<string, CacheEntry>()
  constructor(
    private readonly ttlMs = 30_000,
    private readonly maxEntries = 5_000,
  ) {}
  get(host: string, now: number): HostRow | null | undefined {
    const e = this.map.get(host)
    if (!e) return undefined
    if (e.expiresAt <= now) {
      this.map.delete(host)
      return undefined
    }
    return e.row
  }
  set(host: string, row: HostRow | null, now: number): void {
    if (this.map.size >= this.maxEntries) this.map.clear()
    this.map.set(host, { row, expiresAt: now + this.ttlMs })
  }
  clear(): void {
    this.map.clear()
  }
}

export async function classify(
  request: Request,
  names: HostNames,
  lookup: HostLookup,
  cache: HostCache,
  now: number = Date.now(),
): Promise<Classified> {
  const url = new URL(request.url)
  // X-Forwarded-Host is never read. The Host header is what the edge routed on; fall back to the URL host.
  const host = normalizeHost(request.headers.get("host") ?? url.host)
  const path = url.pathname

  if (!host) return { outcome: "bad_request" }
  // 2. Structural eligibility: relay., other platform subdomains, the tenant zone apex and multi-label names under it
  // are never served by this Worker (spec 11 §1).
  const shape = hostShape(host, names)
  if (shape === "never") return { outcome: "not_found" }

  // 1. DCV paths on candidate tenant hosts pass through untouched (GET/HEAD; platform hosts have no origin behind them).
  if (DCV_PREFIXES.some((p) => path.startsWith(p))) {
    const readOnly = request.method === "GET" || request.method === "HEAD"
    return shape === "tenant_candidate" && readOnly ? { outcome: "dcv" } : { outcome: "not_found" }
  }

  // 3. Exact platform hosts.
  const platform = platformContextFor(host, names)
  if (platform) return { outcome: "ok", ctx: { kind: "platform", context: platform, host } }

  // 4. Authoritative lookup (cache ≤ 30 s).
  let row = cache.get(host, now)
  if (row === undefined) {
    row = await lookup(host)
    cache.set(host, row, now)
  }

  // Activation probe: answered for pending/active hosts of a non-suspended tenant, GET only, HMAC only (no tenant data).
  if (path.startsWith(PROBE_PREFIX)) {
    const nonce = path.slice(PROBE_PREFIX.length)
    const probeable =
      row !== null &&
      (row.hostState === "pending" || row.hostState === "active") &&
      row.tenantStatus !== "suspended" &&
      request.method === "GET" &&
      /^[A-Za-z0-9_-]{16,128}$/.test(nonce)
    return probeable ? { outcome: "probe", host, nonce } : { outcome: "not_found" }
  }

  if (!row) return { outcome: "not_found" }
  if (row.hostState === "pending" || row.hostState === "purged" || row.hostState === "failed" || row.hostState === "moved") {
    return { outcome: "not_found" }
  }
  if (row.tenantStatus === "suspended" || row.hostState === "suspended") return { outcome: "suspended" }
  if (row.schemaState === "recovery") return { outcome: "recovery" }
  if (row.tenantStatus !== "active" || row.hostState !== "active") return { outcome: "not_found" }
  return {
    outcome: "ok",
    ctx: { kind: "tenant", context: "TENANT_MINISITE", host, tenantId: row.tenantId, tenantSlug: row.tenantSlug, routingVersion: row.routingVersion, role: row.role ?? "primary" },
  }
}

/**
 * `HMAC(probe_secret, host ":" nonce)` as lowercase hex (spec 11 §5 step 5). The `:` separator cannot occur in a
 * normalised host or a nonce, so `kirim.toko.co` + `m…` can never collide with `kirim.toko.com` + `…`.
 */
export function probeSignature(secret: string, host: string, nonce: string): Promise<string> {
  return hmacSha256Hex(secret, `${host}:${nonce}`)
}
