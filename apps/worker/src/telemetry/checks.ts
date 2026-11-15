// Scheduled operator checks (OBSERVABILITY.md "Operator decisions and signals"). Each check reads authoritative
// state and raises at most one de-duplicated owner alert. Later tasks add their checks here (webhook inbox age,
// finance sync age, discount Selisih, email failure rate, hostname quota).
import { emit } from "@gx/telemetry"
import { sendAlert, type Alert } from "./alerts"

export type AlertEnv = Pick<Env, "DB" | "GX_ENV"> & { ALERT_WEBHOOK_URL?: string }

export async function tenantsInRecovery(env: AlertEnv): Promise<Alert | null> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM tenant_schema_versions WHERE state = 'recovery'").first<{ n: number }>()
  const n = row?.n ?? 0
  return n > 0 ? { key: "tenant_recovery", severity: "error", text: `${n} gerai dalam status pemulihan (migrasi gagal). Periksa tenant_schema_versions.` } : null
}

export const CHECKS: ((env: AlertEnv, now: number) => Promise<Alert | null>)[] = [tenantsInRecovery]

export async function runChecks(env: AlertEnv, now = Date.now(), fetchImpl: typeof fetch = fetch) {
  const results: { key: string; outcome: string }[] = []
  for (const check of CHECKS) {
    try {
      const alert = await check(env, now)
      if (alert) results.push({ key: alert.key, outcome: await sendAlert(env, alert, now, fetchImpl) })
    } catch (err) {
      // One failing check never stops the others.
      results.push({ key: check.name || "check", outcome: "error" })
      emit("alert.fired", { alert: "check_failed" }, { check: check.name, error: err }, { severity: "error", env: env.GX_ENV, now })
    }
  }
  return results
}
