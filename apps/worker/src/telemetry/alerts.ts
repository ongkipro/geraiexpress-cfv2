// Owner alert channel (TASK-110, OBSERVABILITY.md). Alerts go to ALERT_WEBHOOK_URL (owner's chat incoming webhook)
// when configured; without it they are `alert.fired` events only (Workers Logs). One delivery per alert key per
// 30 min (D1 `alert_state`); a failed delivery releases the claim so the next check retries.
import { emit, redactString } from "@gx/telemetry"

export interface Alert {
  key: string // bounded identifier, e.g. "tenant_recovery"
  text: string // Indonesian, no secrets, no PII (redacted again before leaving the Worker)
  severity: "warn" | "error"
}

export const ALERT_DEDUP_MS = 30 * 60_000
export type AlertOutcome = "sent" | "logged" | "suppressed" | "failed"
export type AlertSendEnv = Pick<Env, "DB" | "GX_ENV"> & { ALERT_WEBHOOK_URL?: string }

export async function sendAlert(env: AlertSendEnv, alert: Alert, now = Date.now(), fetchImpl: typeof fetch = fetch): Promise<AlertOutcome> {
  if (!/^[a-z0-9_.-]{1,80}$/.test(alert.key)) throw new Error("alert key must be 1–80 chars of [a-z0-9_.-]")
  const text = redactString(alert.text)
  const claimed = await env.DB.prepare(
    `INSERT INTO alert_state (alert_key, last_sent_at, count) VALUES (?1, ?2, 1)
     ON CONFLICT(alert_key) DO UPDATE SET last_sent_at = excluded.last_sent_at, count = alert_state.count + 1
     WHERE alert_state.last_sent_at <= ?3
     RETURNING alert_key`,
  )
    .bind(alert.key, now, now - ALERT_DEDUP_MS)
    .first()
  if (!claimed) return "suppressed"
  emit("alert.fired", { alert: alert.key }, { text }, { severity: alert.severity, env: env.GX_ENV, now })
  const hook = (env.ALERT_WEBHOOK_URL ?? "").trim()
  if (!hook) return "logged"
  let delivered: boolean
  try {
    const res = await fetchImpl(hook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `[GeraiExpress ${env.GX_ENV}] ${text}`, key: alert.key, severity: alert.severity }),
      signal: AbortSignal.timeout(10_000),
    })
    delivered = res.ok
  } catch {
    delivered = false
  }
  if (delivered) return "sent"
  // Release the claim so the next check retries instead of staying silent for 30 minutes.
  await env.DB.prepare("UPDATE alert_state SET last_sent_at = ?1, count = MAX(0, count - 1) WHERE alert_key = ?2 AND last_sent_at = ?3")
    .bind(now - ALERT_DEDUP_MS - 1, alert.key, now)
    .run()
  emit("alert.fired", { alert: "delivery_failed" }, { key: alert.key }, { severity: "error", env: env.GX_ENV, now })
  return "failed"
}
