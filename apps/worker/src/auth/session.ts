// Server-side sessions (spec 05 §2.2). app.: 7-day rolling, 30-day absolute; owner.: 12 h absolute, no rolling.
import { tokenHash, newToken, TOKEN_RE } from "./tokens"
import { cookieName, isSecureRequest, readCookie, setSessionCookie, type HostContextName } from "./cookies"

export const APP_IDLE_MS = 7 * 24 * 3600_000
export const APP_ABSOLUTE_MS = 30 * 24 * 3600_000
export const OWNER_ABSOLUTE_MS = 12 * 3600_000
const ROLL_EVERY_MS = 3600_000

export interface SessionRow {
  token_hash: string
  user_id: string
  host_context: HostContextName
  active_tenant_id: string | null
  aal: "aal1" | "aal2"
  totp_verified_at: number | null
  created_at: number
  last_seen_at: number
  expires_at: number
  absolute_expires_at: number
}

export interface SessionUser {
  id: string
  email: string
  name: string
  phone: string | null
  status: "active" | "disabled"
}

export interface Session {
  row: SessionRow
  user: SessionUser
}

export async function createSession(
  env: Pick<Env, "DB" | "AUTH_SESSION_PEPPER">,
  input: { userId: string; ctx: HostContextName; activeTenantId: string | null; deviceHash: string | null; userAgent: string | null; aal?: "aal1" | "aal2"; now: number },
): Promise<{ token: string; statement: D1PreparedStatement; maxAgeSeconds: number }> {
  const token = newToken()
  const hash = await tokenHash(env.AUTH_SESSION_PEPPER, "session", token)
  const absolute = input.now + (input.ctx === "owner" ? OWNER_ABSOLUTE_MS : APP_ABSOLUTE_MS)
  const expires = input.ctx === "owner" ? absolute : input.now + APP_IDLE_MS
  const statement = env.DB.prepare(
    `INSERT INTO sessions (token_hash, user_id, host_context, active_tenant_id, aal, device_hash, user_agent, created_at, last_seen_at, expires_at, absolute_expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?9, ?10)`,
  ).bind(hash, input.userId, input.ctx, input.activeTenantId, input.aal ?? "aal1", input.deviceHash, input.userAgent?.slice(0, 200) ?? null, input.now, expires, absolute)
  return { token, statement, maxAgeSeconds: Math.floor((expires - input.now) / 1000) }
}

/** Reads and validates the session for this host context; rolls the app session (returns a refreshed cookie). */
export async function readSession(
  env: Pick<Env, "DB" | "AUTH_SESSION_PEPPER" | "GX_ENV">,
  request: Request,
  ctx: HostContextName,
  now: number = Date.now(),
): Promise<{ session: Session; setCookie: string | null } | null> {
  const secure = isSecureRequest(request, env.GX_ENV)
  const token = readCookie(request, cookieName(ctx, secure))
  if (!token || !TOKEN_RE.test(token)) return null
  const hash = await tokenHash(env.AUTH_SESSION_PEPPER, "session", token)
  const r = await env.DB.prepare(
    `SELECT s.token_hash, s.user_id, s.host_context, s.active_tenant_id, s.aal, s.totp_verified_at, s.created_at, s.last_seen_at, s.expires_at,
            s.absolute_expires_at, s.revoked_at, u.email, u.name, u.phone, u.status
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
  )
    .bind(hash)
    .first<SessionRow & { revoked_at: number | null; email: string; name: string; phone: string | null; status: "active" | "disabled" }>()
  if (!r || r.revoked_at !== null || r.host_context !== ctx || r.status !== "active") return null
  if (now >= r.expires_at || now >= r.absolute_expires_at) return null
  let setCookie: string | null = null
  if (ctx === "app" && now - r.last_seen_at >= ROLL_EVERY_MS) {
    const expires = Math.min(now + APP_IDLE_MS, r.absolute_expires_at)
    await env.DB.prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?").bind(now, expires, hash).run()
    r.last_seen_at = now
    r.expires_at = expires
    setCookie = setSessionCookie(ctx, secure, token, Math.floor((expires - now) / 1000))
  }
  const { revoked_at: _revoked, email, name, phone, status, ...row } = r
  return { session: { row, user: { id: r.user_id, email, name, phone, status } }, setCookie }
}

export function revokeSession(db: D1Database, hash: string, now: number): D1PreparedStatement {
  return db.prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL").bind(now, hash)
}

/** Revokes every live session of a user except `keepHash` (password reset/change, spec 05 §2). */
export function revokeOtherSessions(db: D1Database, userId: string, keepHash: string | null, now: number): D1PreparedStatement {
  return db.prepare("UPDATE sessions SET revoked_at = ?1 WHERE user_id = ?2 AND revoked_at IS NULL AND token_hash != ?3").bind(now, userId, keepHash ?? "")
}
