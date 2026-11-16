// POST /internal/ops/alert-drill (owner host, Bearer OPS_TOKEN; TASK-602): sends one `[DRILL]` message per alert key
// of OBSERVABILITY.md to ALERT_WEBHOOK_URL so the owner can confirm each one arrives. Drill keys are prefixed
// `drill.` so they never suppress (30-min dedupe) a real alert of the same name.
import { timingSafeEqualStr } from "../crypto"
import { fail, ok } from "../http/envelope"
import { sendAlert } from "../telemetry/alerts"

export const ALERT_KEYS = [
  "issue_reconciliation_rate",
  "issue_failed_streak",
  "webhook_inbox_age",
  "finance_sync_age",
  "public_api_ip_not_allowed",
  "partner_api_ip_not_allowed",
  "public_api_auth_spike",
  "public_api_issue_volume_spike",
  "relay_down",
  "discount_overdue",
  "discount_selisih",
  "email_failure_rate",
  "email_bounce_rate",
  "hostname_quota",
  "hostname_probe",
  "tenant_recovery",
  "tenant_backup_failed",
] as const

export async function handleAlertDrill(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
  if (!token || !env.OPS_TOKEN || !(await timingSafeEqualStr(token, env.OPS_TOKEN))) return fail(401, "UNAUTHORIZED", "Akses ditolak.")
  const now = Date.now()
  const results: Record<string, string> = {}
  for (const k of ALERT_KEYS) results[k] = await sendAlert(env, { key: `drill.${k}`, severity: "warn", text: `[DRILL] Uji alert ${k} — abaikan, bukan kejadian nyata.` }, now)
  return ok({ results, webhookConfigured: !!(env.ALERT_WEBHOOK_URL ?? "").trim() })
}
