// Scheduled operator checks (OBSERVABILITY.md "Operator decisions and signals", TASK-110 + TASK-602). Each check
// reads authoritative state and raises at most one de-duplicated owner alert (30 min per key, `alert_state`).
// Per-tenant signals come from each object's read-only `healthSnapshot` (bounded fan-out); D1 signals are queried
// directly. Alerts raised elsewhere (event-time): `discount_selisih.*` (verifier), `hostname_quota` and
// `hostname_probe.*` (custom domains), `tenant_backup_failed` (daily export), `public_api_ip_not_allowed` (SDK hook).
import { authFailureSpikeAlert, emit, issueVolumeSpikeAlert } from "@gx/telemetry"
import { vaultFor } from "../do/gerai-vault/stub"
import type { HealthSnapshot } from "../do/gerai-vault"
import { relayHealth } from "../admin/audit"
import { sendAlert, type Alert } from "./alerts"

export type AlertEnv = Pick<Env, "DB" | "GX_ENV"> & Partial<Pick<Env, "GERAI_VAULT" | "PARTNER_RELAY_URL" | "PARTNER_TRANSPORT">> & { ALERT_WEBHOOK_URL?: string }
type Check = (env: AlertEnv, now: number, ctx: CheckCtx) => Promise<Alert | null>
type CheckCtx = { snapshots: () => Promise<Array<{ tenantId: string; s: HealthSnapshot }>>; fetchImpl: typeof fetch }

export const INBOX_MAX_AGE_MS = 15 * 60_000
export const FINANCE_MAX_AGE_MS = 60 * 60_000
export const RECON_RATE_BPS = 200 // 2 %
export const EMAIL_FAIL_BPS = 500 // 5 %
export const RELAY_DOWN_MS = 5 * 60_000
const MAX_TENANTS_PER_TICK = 200

export async function tenantsInRecovery(env: AlertEnv): Promise<Alert | null> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM tenant_schema_versions WHERE state = 'recovery'").first<{ n: number }>()
  const n = row?.n ?? 0
  return n > 0 ? { key: "tenant_recovery", severity: "error", text: `${n} gerai dalam status pemulihan (migrasi gagal). Periksa tenant_schema_versions.` } : null
}

/** "Can counters issue?" — reconciliation_needed > 2 % of issues in 30 min, or a 5-issue failed streak. */
export const issueHealth: Check = async (_env, _now, ctx) => {
  const all = await ctx.snapshots()
  const issues = all.reduce((n, x) => n + x.s.issues30m, 0)
  const recon = all.reduce((n, x) => n + x.s.reconciliation30m, 0)
  const streak = all.filter((x) => x.s.failedStreak).length
  if (streak > 0) return { key: "issue_failed_streak", severity: "error", text: `${streak} gerai gagal menerbitkan resi 5 kali berturut-turut. Periksa status Mengantar dan kunci seller.` }
  if (issues >= 10 && recon * 10_000 > issues * RECON_RATE_BPS) return { key: "issue_reconciliation_rate", severity: "error", text: `${recon} dari ${issues} penerbitan resi 30 menit terakhir perlu rekonsiliasi (> 2 %). Periksa Mengantar dan relay.` }
  return null
}

/** "Are provider statuses fresh?" — oldest `received` webhook older than 15 minutes. */
export const webhookInboxAge: Check = async (_env, _now, ctx) => {
  const stale = (await ctx.snapshots()).filter((x) => x.s.oldestInboxAgeMs !== null && x.s.oldestInboxAgeMs > INBOX_MAX_AGE_MS)
  if (!stale.length) return null
  const worst = Math.max(...stale.map((x) => x.s.oldestInboxAgeMs!))
  return { key: "webhook_inbox_age", severity: "error", text: `Webhook Mengantar belum diproses di ${stale.length} gerai (tertua ${Math.round(worst / 60_000)} menit). Periksa antrean gx-mengantar-webhooks.` }
}

/** "Is money in sync?" — last successful finance sync older than 60 minutes for a connected tenant that has synced before. */
export const financeSyncAge: Check = async (_env, _now, ctx) => {
  const stale = (await ctx.snapshots()).filter((x) => x.s.connected && x.s.financeEverRan && (x.s.financeLastOkAgeMs === null || x.s.financeLastOkAgeMs > FINANCE_MAX_AGE_MS))
  return stale.length ? { key: "finance_sync_age", severity: "warn", text: `Sinkron keuangan Mengantar tertinggal > 60 menit di ${stale.length} gerai. Periksa antrean gx-mengantar-finance-sync.` } : null
}

/** "Is a seller key being misused?" — issue volume > 3× the 7-day hourly baseline (floor 20/h). */
export const issueVolumeSpike: Check = async (_env, _now, ctx) => {
  for (const x of await ctx.snapshots()) {
    const a = issueVolumeSpikeAlert(x.tenantId, x.s.issuesLastHour, x.s.issuesBaselineHourly)
    if (a) return { key: a.key, severity: a.severity, text: a.text }
  }
  return null
}

/** Public API 401/403 spike per tenant (last hour), from the `public_api_events` counters written by the SDK hook. */
export const publicApiAuthSpike: Check = async (env, now) => {
  const r = await env.DB.prepare("SELECT tenant_id, SUM(count) AS n FROM public_api_events WHERE outcome IN ('unauthorized','forbidden') AND minute >= ? GROUP BY tenant_id ORDER BY n DESC LIMIT 1")
    .bind(Math.floor((now - 3600_000) / 60_000))
    .first<{ tenant_id: string; n: number }>()
  const a = r ? authFailureSpikeAlert(r.tenant_id, r.n) : null
  return a ? { key: a.key, severity: a.severity, text: a.text } : null
}

/** "Is the Partner relay usable?" — relay `/healthz` failing for 5 minutes (two consecutive checks). */
export const relayDown: Check = async (env, now, ctx) => {
  if (env.PARTNER_TRANSPORT !== "relay" || !env.PARTNER_RELAY_URL || env.GX_ENV === "local") return null
  const h = await relayHealth({ PARTNER_RELAY_URL: env.PARTNER_RELAY_URL, PARTNER_TRANSPORT: env.PARTNER_TRANSPORT, GX_ENV: env.GX_ENV }, ctx.fetchImpl)
  if (h.reachable) {
    await env.DB.prepare("DELETE FROM alert_state WHERE alert_key = 'relay_down_since'").run()
    return null
  }
  const since = await env.DB.prepare("INSERT INTO alert_state (alert_key, last_sent_at, count) VALUES ('relay_down_since', ?1, 0) ON CONFLICT(alert_key) DO UPDATE SET count = count RETURNING last_sent_at").bind(now).first<{ last_sent_at: number }>()
  return since && now - since.last_sent_at >= RELAY_DOWN_MS ? { key: "relay_down", severity: "error", text: "Relay Partner Mengantar tidak terjangkau ≥ 5 menit. Pendaftaran gerai baru tertunda; kasir tetap berjalan." } : null
}

/** "Can people sign up and log in?" — failed or expired > 5 % of transactional emails in the last hour (min 20). */
export const emailFailureRate: Check = async (env, now) => {
  const r = await env.DB.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(state IN ('failed','expired')), 0) AS bad FROM email_outbox WHERE created_at >= ? AND state != 'queued' AND state != 'sending'")
    .bind(now - 3600_000)
    .first<{ total: number; bad: number }>()
  if (!r || r.total < 20 || r.bad * 10_000 <= r.total * EMAIL_FAIL_BPS) return null
  return { key: "email_failure_rate", severity: "error", text: `${r.bad} dari ${r.total} email transaksi 1 jam terakhir gagal/kedaluwarsa (> 5 %). Periksa Email Sending dan DNS.` }
}

/** Discount rules stuck in `belum_diterapkan` past 2 × SLA are a Selisih for the Super Admin (DEC-230). */
export const discountOverdue: Check = async (env, now) => {
  const sla = (await env.DB.prepare("SELECT apply_sla_minutes FROM platform_pricing_policy WHERE id = 1").first<{ apply_sla_minutes: number }>())?.apply_sla_minutes ?? 60
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM tenant_discount_rules WHERE verification_state = 'belum_diterapkan' AND requested_at IS NOT NULL AND requested_at < ?").bind(now - 2 * sla * 60_000).first<{ n: number }>()
  return r && r.n > 0 ? { key: "discount_overdue", severity: "warn", text: `${r.n} aturan diskon belum diterapkan Mengantar lewat 2× SLA (${sla} menit). Periksa Tarif & Kurir.` } : null
}

export const CHECKS: Check[] = [tenantsInRecovery, issueHealth, webhookInboxAge, financeSyncAge, issueVolumeSpike, publicApiAuthSpike, relayDown, emailFailureRate, discountOverdue]

/** Bounded per-tenant fan-out, computed once per tick and shared by every check. */
function snapshotLoader(env: AlertEnv, now: number): CheckCtx["snapshots"] {
  let cache: Promise<Array<{ tenantId: string; s: HealthSnapshot }>> | null = null
  return () =>
    (cache ??= (async () => {
      if (!env.GERAI_VAULT) return []
      const ids = (await env.DB.prepare("SELECT id FROM tenants WHERE status = 'active' ORDER BY id LIMIT ?").bind(MAX_TENANTS_PER_TICK).all<{ id: string }>()).results
      const out: Array<{ tenantId: string; s: HealthSnapshot }> = []
      for (const { id } of ids) {
        const r = await vaultFor({ GERAI_VAULT: env.GERAI_VAULT }, id).healthSnapshot(id, now).catch(() => null)
        if (r && r.ok) out.push({ tenantId: id, s: r.value })
      }
      return out
    })())
}

export async function runChecks(env: AlertEnv, now = Date.now(), fetchImpl: typeof fetch = fetch) {
  const results: { key: string; outcome: string }[] = []
  const ctx: CheckCtx = { snapshots: snapshotLoader(env, now), fetchImpl }
  for (const check of CHECKS) {
    try {
      const alert = await check(env, now, ctx)
      if (alert) results.push({ key: alert.key, outcome: await sendAlert(env, alert, now, fetchImpl) })
    } catch (err) {
      // One failing check never stops the others.
      results.push({ key: check.name || "check", outcome: "error" })
      emit("alert.fired", { alert: "check_failed" }, { check: check.name, error: err }, { severity: "error", env: env.GX_ENV, now })
    }
  }
  return results
}
