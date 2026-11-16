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

const wibDayOf = (now: number) => new Date(now + 7 * 3600_000).toISOString().slice(0, 10)

/**
 * Daily Rupiah cap for `shipments:issue` (WIB day), reserved per item (`slug` or `bulk:<batch>:<row>`). Returns
 * "reserved", "already" (this item is already counted — never twice) or "cap" (would exceed the cap). The usage
 * counter and the item row are written in one D1 batch, both gated on the cap check.
 */
export async function reserveSpend(env: Env, key: { keyId: string; tenantId: string; dailyIssueCapIdr: number | null }, item: string, amountIdr: number, now: number): Promise<"reserved" | "already" | "cap"> {
  if (await env.DB.prepare("SELECT 1 FROM api_key_spend_items WHERE item = ? AND key_id = ?").bind(item, key.keyId).first()) return "already"
  const day = wibDayOf(now)
  const cap = key.dailyIssueCapIdr
  const res = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO api_key_daily_usage (key_id, wib_day, issued_idr, issued_count) SELECT ?1, ?2, ?3, 1 WHERE (?4 IS NULL OR ?3 <= ?4) AND NOT EXISTS (SELECT 1 FROM api_key_spend_items WHERE item = ?5)
       ON CONFLICT(key_id, wib_day) DO UPDATE SET issued_idr = issued_idr + excluded.issued_idr, issued_count = issued_count + 1 WHERE ?4 IS NULL OR issued_idr + excluded.issued_idr <= ?4`,
    ).bind(key.keyId, day, amountIdr, cap, item),
    env.DB.prepare("INSERT INTO api_key_spend_items (item, key_id, tenant_id, wib_day, amount_idr, created_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE changes() = 1 ON CONFLICT(item) DO NOTHING").bind(item, key.keyId, key.tenantId, day, amountIdr, now),
  ])
  if ((res[1]?.meta.changes ?? 0) === 1) return "reserved"
  return (await env.DB.prepare("SELECT 1 FROM api_key_spend_items WHERE item = ?").bind(item).first()) ? "already" : "cap"
}

/** Gives an item's reservation back (non-issue established). Idempotent: a second release changes nothing. */
export async function releaseSpend(env: Env, keyId: string, item: string): Promise<void> {
  const row = await env.DB.prepare("DELETE FROM api_key_spend_items WHERE item = ? AND key_id = ? RETURNING wib_day, amount_idr").bind(item, keyId).first<{ wib_day: string; amount_idr: number }>()
  if (!row) return
  await env.DB.prepare("UPDATE api_key_daily_usage SET issued_idr = MAX(0, issued_idr - ?), issued_count = MAX(0, issued_count - 1) WHERE key_id = ? AND wib_day = ?").bind(row.amount_idr, keyId, row.wib_day).run()
}
