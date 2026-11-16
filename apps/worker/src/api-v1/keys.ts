// API keys (TASK-503, spec 08 §2): `gx_live_<43 b64url chars>`; D1 stores the peppered SHA-256 only. Scopes gate every
// route; payment/payout mutations have no scope at all (POS-only). Keys never authenticate browser routes and cookies
// never authenticate `/api/v1` (Bearer only).
import { sha256Hex } from "../crypto"

export const SCOPES = ["rates:read", "finance:read", "finance:sync", "contacts:read", "contacts:write", "shipments:draft", "shipments:issue", "tracking:read"] as const
export type Scope = (typeof SCOPES)[number]

export interface ApiKeyPrincipal {
  keyId: string
  tenantId: string
  tenantSlug: string
  scopes: Set<Scope>
  dailyIssueCapIdr: number | null
}

const TOKEN_RE = /^gx_live_[A-Za-z0-9_-]{43}$/

export function newApiToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32))
  return `gx_live_${btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`
}

export const hashApiToken = (pepper: string, token: string) => sha256Hex(`${pepper}:api-key:${token}`)

export function parseScopes(raw: unknown): Scope[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out = [...new Set(raw.filter((s): s is Scope => typeof s === "string" && (SCOPES as readonly string[]).includes(s)))]
  return out.length === raw.length ? out : null
}

/** Resolves `Authorization: Bearer gx_live_…` to an active key of an active gerai; touches `last_used_at` (≤ 1/min). */
export async function authenticate(env: Env, request: Request, now: number): Promise<ApiKeyPrincipal | null> {
  const h = request.headers.get("authorization") ?? ""
  const m = /^Bearer\s+(\S+)$/.exec(h)
  if (!m || !TOKEN_RE.test(m[1]!)) return null
  const row = await env.DB.prepare(
    `SELECT k.id, k.tenant_id, k.scopes_json, k.daily_issue_cap_idr, k.last_used_at, t.slug FROM tenant_api_keys k JOIN tenants t ON t.id = k.tenant_id
     WHERE k.token_hash = ? AND k.revoked_at IS NULL AND t.status = 'active'`,
  )
    .bind(await hashApiToken(env.AUTH_SESSION_PEPPER, m[1]!))
    .first<{ id: string; tenant_id: string; scopes_json: string; daily_issue_cap_idr: number | null; last_used_at: number | null; slug: string }>()
  if (!row) return null
  if (!row.last_used_at || now - row.last_used_at > 60_000) await env.DB.prepare("UPDATE tenant_api_keys SET last_used_at = ? WHERE id = ?").bind(now, row.id).run()
  return { keyId: row.id, tenantId: row.tenant_id, tenantSlug: row.slug, scopes: new Set(JSON.parse(row.scopes_json) as Scope[]), dailyIssueCapIdr: row.daily_issue_cap_idr }
}

