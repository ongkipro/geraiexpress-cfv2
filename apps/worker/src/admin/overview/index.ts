// Super Admin `Ringkasan` (TASK-208, visual 07 §3.3): 4 KPI → alerts → 14-day volume. Read-only, aggregates only
// (no PII), from D1 control-plane rows (`shipment_index` is the thin cross-tenant index).
import type { Hono } from "hono"
import { register } from "../../api/registry"
import { ownerGuard, type OwnerCtx } from "../../api/owner"
import { quotaFor } from "../../do/partner-quota"
import { ok } from "../../http/envelope"

const WIB = 7 * 3600_000
const DAY = 24 * 3600_000
export const wibDayStart = (ms: number) => Math.floor((ms + WIB) / DAY) * DAY - WIB

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerOverview(app: Hono<any>): void {
  register(app, { context: "owner", method: "GET", path: "/overview", auth: "owner_aal2", projection: "role" }, ownerGuard, async (c) => {
    const ctx = c as OwnerCtx
    const now = Date.now()
    const today = wibDayStart(now)
    const from = today - 13 * DAY
    const [kpi, trend, alerts, quota] = await Promise.all([
      ctx.env.DB.prepare(
        `SELECT (SELECT COUNT(*) FROM tenants WHERE status = 'active') AS active_tenants,
                (SELECT COUNT(*) FROM shipment_index WHERE created_at >= ?1) AS shipments_today,
                (SELECT COUNT(*) FROM tenant_applications WHERE state = 'submitted') AS pending_applications,
                (SELECT COUNT(*) FROM tenant_onboarding WHERE onboarding_state IN ('registration_pending','registration_unknown')) AS onboarding_stuck,
                (SELECT COUNT(*) FROM tenant_schema_versions WHERE state = 'recovery') AS tenants_in_recovery,
                (SELECT COUNT(*) FROM tenant_discount_rules WHERE verification_state = 'selisih') AS discount_mismatch,
                (SELECT COUNT(*) FROM email_outbox WHERE state = 'failed' AND created_at >= ?2) AS email_failed_7d`,
      )
        .bind(today, now - 7 * DAY)
        .first<Record<string, number>>(),
      ctx.env.DB.prepare(`SELECT ((created_at + ${WIB}) / ${DAY}) * ${DAY} - ${WIB} AS day, COUNT(*) AS n FROM shipment_index WHERE created_at >= ? GROUP BY day ORDER BY day`)
        .bind(from)
        .all<{ day: number; n: number }>(),
      ctx.env.DB.prepare("SELECT alert_key, last_sent_at, count FROM alert_state WHERE last_sent_at >= ? ORDER BY last_sent_at DESC LIMIT 20").bind(now - 7 * DAY).all<{ alert_key: string; last_sent_at: number; count: number }>(),
      quotaFor(ctx.env).usage(now).catch(() => null),
    ])
    const byDay = new Map(trend.results.map((r) => [r.day, r.n]))
    const series = Array.from({ length: 14 }, (_, i) => ({ day: from + i * DAY, shipments: byDay.get(from + i * DAY) ?? 0 }))
    const issues = (kpi?.tenants_in_recovery ?? 0) + (kpi?.onboarding_stuck ?? 0) + (kpi?.email_failed_7d ?? 0)
    return ok({ kpi: { ...kpi, health: issues === 0 ? "ok" : "attention", partnerQuota: quota }, series, alerts: alerts.results })
  })
}
