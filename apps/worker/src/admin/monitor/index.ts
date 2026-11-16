// Super Admin `Pengawasan` (TASK-208, DEC-209, spec 01 §2.6, spec 05 §1). Cross-tenant, read-only:
//  - INV / AWB search over the thin `shipment_index` (no PII in D1);
//  - `Radar Risiko COD`: phone → HMAC server-side → per-tenant counts. Needs the `risk_review` permission AND a recent
//    TOTP, and the READ itself is audited (phone never stored in the audit row, only its HMAC prefix).
import type { Hono } from "hono"
import { register } from "../../api/registry"
import { auditStatement, ownerGuard, requireReason, type OwnerCtx } from "../../api/owner"
import { hmacSha256Hex } from "../../crypto"
import { AppError, ok } from "../../http/envelope"

/** Indonesian mobile number → canonical `62…` digits, or null when it is not one. */
export function canonicalPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  let d = raw.replace(/[\s\-().+]/g, "")
  if (!/^\d+$/.test(d)) return null
  if (d.startsWith("0")) d = `62${d.slice(1)}`
  else if (d.startsWith("8")) d = `62${d}`
  return /^628\d{7,12}$/.test(d) ? d : null
}

/** The only way a phone becomes an index key (tenant outbox and this search use the same function). */
export const phoneHmac = (pepper: string, phone: string) => hmacSha256Hex(pepper, `risk-phone:${phone}`)

async function body(c: OwnerCtx): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json()
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerMonitor(app: Hono<any>): void {
  const r = (method: "GET" | "POST", path: string, auth: "owner_aal2" | "owner_recent", handler: (c: OwnerCtx) => Promise<Response>) =>
    register(app, { context: "owner", method, path, auth, projection: "role" }, ownerGuard, (c) => handler(c as OwnerCtx))

  r("GET", "/pengawasan/kiriman", "owner_aal2", async (c) => {
    const q = (c.req.query("q") ?? "").trim().replace(/^INV\s*/i, "").replace(/^#/, "")
    if (q.length < 4 || q.length > 40 || !/^[A-Za-z0-9-]+$/.test(q)) return ok({ items: [] })
    const rows = await c.env.DB.prepare(
      `SELECT s.tenant_id, t.slug AS tenant_slug, t.name AS tenant_name, s.slug, s.awb_number, s.courier_code, s.status, s.created_at, s.updated_at
       FROM shipment_index s JOIN tenants t ON t.id = s.tenant_id WHERE s.slug = ?1 OR s.awb_number = ?2 ORDER BY s.updated_at DESC LIMIT 20`,
    )
      .bind(q.toLowerCase(), q.toUpperCase())
      .all()
    return ok({ items: rows.results })
  })

  r("GET", "/pengawasan/antrean", "owner_aal2", async (c) => {
    const rows = await c.env.DB.prepare(
      `SELECT s.status, COUNT(*) AS n FROM shipment_index s WHERE s.status IN ('reconciliation_needed','provider_unpaid_hold','issuing_in_flight') GROUP BY s.status`,
    ).all<{ status: string; n: number }>()
    const webhookIssues = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM tenant_discount_rules WHERE verification_state = 'selisih'").first<{ n: number }>()
    return ok({ queues: rows.results, discountMismatch: webhookIssues?.n ?? 0 })
  })

  r("POST", "/pengawasan/risiko", "owner_recent", async (c) => {
    const b = await body(c)
    const actor = c.get("session").user.id
    const perm = await c.env.DB.prepare("SELECT risk_review FROM super_admins WHERE user_id = ? AND status = 'active'").bind(actor).first<{ risk_review: number }>()
    if (perm?.risk_review !== 1) throw new AppError(403, "RISK_REVIEW_REQUIRED", "Akun Anda belum punya izin melihat radar risiko COD.")
    const reason = requireReason(b.reason)
    const phone = canonicalPhone(b.phone)
    if (!phone) throw new AppError(422, "INVALID_PHONE", "Nomor HP tidak valid.", { phone: "Isi nomor HP Indonesia, misalnya 0812…" })
    const key = await phoneHmac(c.env.AUTH_SESSION_PEPPER, phone)
    const now = Date.now()
    // Audit the read first (a failed audit write means no data is returned).
    await auditStatement(c.env, { actorId: actor, action: "risk.read", targetType: "recipient_risk_index", targetId: key.slice(0, 12), reason, now }).run()
    const rows = await c.env.DB.prepare(
      `SELECT r.tenant_id, t.name AS tenant_name, t.slug AS tenant_slug, r.delivered_count, r.rts_count, r.last_event_at
       FROM recipient_risk_index r JOIN tenants t ON t.id = r.tenant_id WHERE r.phone_hmac = ? ORDER BY r.last_event_at DESC`,
    )
      .bind(key)
      .all<{ delivered_count: number; rts_count: number }>()
    const delivered = rows.results.reduce((n, x) => n + x.delivered_count, 0)
    const rts = rows.results.reduce((n, x) => n + x.rts_count, 0)
    return ok({ items: rows.results, total: { delivered, rts, rtsBps: delivered + rts > 0 ? Math.floor((rts * 10_000) / (delivered + rts)) : null } })
  })
}
