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

/** Daily Rupiah cap for `shipments:issue` (WIB day). Returns false when this issue would exceed the cap. */
export async function reserveDailySpend(env: Env, keyId: string, capIdr: number | null, amountIdr: number, now: number): Promise<boolean> {
  const day = new Date(now + 7 * 3600_000).toISOString().slice(0, 10)
  if (capIdr === null) {
    await env.DB.prepare("INSERT INTO api_key_daily_usage (key_id, wib_day, issued_idr, issued_count) VALUES (?, ?, ?, 1) ON CONFLICT(key_id, wib_day) DO UPDATE SET issued_idr = issued_idr + excluded.issued_idr, issued_count = issued_count + 1").bind(keyId, day, amountIdr).run()
    return true
  }
  // Conditional upsert: the row only grows when the new total stays within the cap (atomic in one statement).
  const r = await env.DB.prepare(
    `INSERT INTO api_key_daily_usage (key_id, wib_day, issued_idr, issued_count) SELECT ?1, ?2, ?3, 1 WHERE ?3 <= ?4
     ON CONFLICT(key_id, wib_day) DO UPDATE SET issued_idr = issued_idr + excluded.issued_idr, issued_count = issued_count + 1 WHERE issued_idr + excluded.issued_idr <= ?4 RETURNING issued_idr`,
  )
    .bind(keyId, day, amountIdr, capIdr)
    .first()
  return r !== null
}

export async function releaseDailySpend(env: Env, keyId: string, amountIdr: number, now: number): Promise<void> {
  const day = new Date(now + 7 * 3600_000).toISOString().slice(0, 10)
  await env.DB.prepare("UPDATE api_key_daily_usage SET issued_idr = MAX(0, issued_idr - ?), issued_count = MAX(0, issued_count - 1) WHERE key_id = ? AND wib_day = ?").bind(amountIdr, keyId, day).run()
}
