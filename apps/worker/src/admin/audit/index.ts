// Super Admin `Sistem & Audit` (TASK-208): audit log viewer (filtered, audited read), integration & relay health,
// admin access list, and the `Rotasi Kunci Seller` action (TOTP + reason → the TASK-205 fence primitive).
import type { Hono } from "hono"
import { register } from "../../api/registry"
import { auditStatement, ownerGuard, requireReason, type OwnerCtx } from "../../api/owner"
import { resolveKeyRotation, rotateSellerKey } from "../../do/gerai-vault/credentials/rotation"
import { quotaFor } from "../../do/partner-quota"
import { AppError, ok } from "../../http/envelope"

async function body(c: OwnerCtx): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json()
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Relay reachability without secrets: `GET {PARTNER_RELAY_URL}/healthz` with a short timeout. */
export async function relayHealth(env: Pick<Env, "PARTNER_RELAY_URL" | "PARTNER_TRANSPORT" | "GX_ENV">, fetchImpl: typeof fetch = fetch): Promise<{ transport: string; reachable: boolean | null; latencyMs: number | null }> {
  if (env.PARTNER_TRANSPORT !== "relay" || !env.PARTNER_RELAY_URL || env.GX_ENV === "local") return { transport: env.PARTNER_TRANSPORT, reachable: null, latencyMs: null }
  const t0 = Date.now()
  try {
    const r = await fetchImpl(`${env.PARTNER_RELAY_URL.replace(/\/$/, "")}/healthz`, { signal: AbortSignal.timeout(3000), redirect: "manual" })
    return { transport: "relay", reachable: r.ok, latencyMs: Date.now() - t0 }
  } catch {
    return { transport: "relay", reachable: false, latencyMs: null }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerSystem(app: Hono<any>): void {
  const r = (method: "GET" | "POST", path: string, auth: "owner_aal2" | "owner_recent", handler: (c: OwnerCtx) => Promise<Response>) =>
    register(app, { context: "owner", method, path, auth, projection: "role" }, ownerGuard, (c) => handler(c as OwnerCtx))

  r("GET", "/sistem/kesehatan", "owner_aal2", async (c) => {
    const now = Date.now()
    const [relay, quota, onboarding, email, recovery, rotations] = await Promise.all([
      relayHealth(c.env),
      quotaFor(c.env).usage(now).catch(() => null),
      c.env.DB.prepare("SELECT onboarding_state, COUNT(*) AS n FROM tenant_onboarding GROUP BY onboarding_state").all<{ onboarding_state: string; n: number }>(),
      c.env.DB.prepare("SELECT state, COUNT(*) AS n FROM email_outbox WHERE created_at >= ? GROUP BY state").bind(now - 7 * 24 * 3600_000).all<{ state: string; n: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) AS n FROM tenant_schema_versions WHERE state = 'recovery'").first<{ n: number }>(),
      c.env.DB.prepare("SELECT tenant_id, action, at FROM audit_logs WHERE action IN ('seller_key.rotate','seller_key.resolve') ORDER BY at DESC LIMIT 10").all(),
    ])
    return ok({ relay, partnerQuota: quota, partnerLimits: { perMinute: 60, registrationsPerDay: 1000 }, onboarding: onboarding.results, email: email.results, tenantsInRecovery: recovery?.n ?? 0, recentRotations: rotations.results })
  })

  // Audit log viewer: filters, newest first; the read itself is audited (needs recent TOTP).
  r("GET", "/sistem/audit", "owner_recent", async (c) => {
    const limit = Math.min(200, Math.max(1, Number(c.req.query("limit")) || 50))
    const before = Number(c.req.query("before")) || Date.now() + 1
    const action = (c.req.query("action") ?? "").trim()
    const tenant = (c.req.query("tenant") ?? "").trim()
    const where = ["a.at < ?1"]
    const binds: unknown[] = [before]
    if (action) {
      // Escape LIKE wildcards (never strip them: almost every action name has an underscore).
      where.push(`a.action LIKE ?${binds.length + 1} ESCAPE '\\'`)
      binds.push(`${action.replace(/[\\%_]/g, "\\$&")}%`)
    }
    if (tenant) {
      where.push(`(t.slug = ?${binds.length + 1} OR a.tenant_id = ?${binds.length + 1})`)
      binds.push(tenant)
    }
    binds.push(limit)
    const rows = await c.env.DB.prepare(
      `SELECT a.id, a.at, a.actor_type, u.name AS actor_name, a.tenant_id, t.slug AS tenant_slug, a.action, a.target_type, a.target_id, a.reason
       FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id LEFT JOIN tenants t ON t.id = a.tenant_id
       WHERE ${where.join(" AND ")} ORDER BY a.at DESC LIMIT ?${binds.length}`,
    )
      .bind(...binds)
      .all()
    await auditStatement(c.env, { actorId: c.get("session").user.id, action: "audit.read", reason: "lihat log audit", metadata: { action: action || null, tenant: tenant || null }, now: Date.now() }).run()
    return ok({ items: rows.results })
  })

  r("GET", "/sistem/admin", "owner_aal2", async (c) => {
    const rows = await c.env.DB.prepare(
      "SELECT s.user_id, u.name, u.email, s.totp_state, s.status, s.risk_review, s.enrolled_at FROM super_admins s JOIN users u ON u.id = s.user_id ORDER BY s.created_at",
    ).all()
    return ok({ items: rows.results, me: c.get("session").user.id })
  })

  r("POST", "/sistem/admin/:userId/risk-review", "owner_recent", async (c) => {
    const b = await body(c)
    const reason = requireReason(b.reason)
    const target = c.req.param("userId") ?? ""
    const actor = c.get("session").user.id
    if (target === actor) throw new AppError(409, "SELF_FORBIDDEN", "Tidak dapat mengubah akses Anda sendiri.")
    const enabled = b.enabled === true ? 1 : b.enabled === false ? 0 : null
    if (enabled === null) throw new AppError(422, "INVALID_INPUT", "Pilihan izin tidak valid.")
    const now = Date.now()
    const res = await c.env.DB.batch([
      c.env.DB.prepare("UPDATE super_admins SET risk_review = ?, updated_at = ? WHERE user_id = ?").bind(enabled, now, target),
      auditStatement(c.env, { actorId: actor, action: enabled ? "admin.risk_review_grant" : "admin.risk_review_revoke", targetType: "super_admin", targetId: target, reason, now }),
    ])
    if ((res[0]?.meta.changes ?? 0) !== 1) throw new AppError(404, "ADMIN_NOT_FOUND", "Super Admin tidak ditemukan.")
    return ok({ userId: target, riskReview: enabled === 1 })
  })

  // `Rotasi Kunci Seller` (spec 10 §4.4): recent TOTP + reason; uses the TASK-205 fence (never a raw regenerate).
  r("POST", "/sistem/rotasi-kunci/:slug", "owner_recent", async (c) => {
    const b = await body(c)
    const reason = requireReason(b.reason)
    const t = await c.env.DB.prepare("SELECT id FROM tenants WHERE slug = ? AND status IN ('active','suspended')").bind(c.req.param("slug")).first<{ id: string }>()
    if (!t) throw new AppError(404, "TENANT_NOT_FOUND", "Gerai tidak ditemukan.")
    const actor = c.get("session").user.id
    const now = Date.now()
    const out = b.mode === "resolve" ? await resolveKeyRotation(c.env, t.id, now) : await rotateSellerKey(c.env, { tenantId: t.id, actorId: actor, reason, now })
    await auditStatement(c.env, { actorId: actor, action: b.mode === "resolve" ? "seller_key.resolve" : "seller_key.rotate", targetType: "tenant", targetId: t.id, tenantId: t.id, reason, metadata: out, now }).run()
    return ok(out)
  })
}
