// Finance sync fan-out (TASK-401, spec 09 §4): the 15-minute Cron enqueues one `gx-mengantar-finance-sync` message per
// active connected gerai; the consumer runs that tenant's bounded sync inside its object (serialized there). Once a
// day (02:00 WIB cron) the same fan-out asks for the pending-row rescan.
import { vaultFor } from "../../do/gerai-vault/stub"

export type FinanceMessage = { tenant_id: string; trigger: "cron" | "pending_rescan" }

export async function enqueueFinanceSync(env: Env, trigger: FinanceMessage["trigger"], limit = 500): Promise<number> {
  const rows = await env.DB.prepare(
    `SELECT t.id FROM tenants t JOIN tenant_onboarding o ON o.tenant_id = t.id
     WHERE t.status = 'active' AND o.onboarding_state IN ('connected','byok_connected') ORDER BY t.id LIMIT ?`,
  )
    .bind(limit)
    .all<{ id: string }>()
  const msgs = rows.results.map((r) => ({ body: { tenant_id: r.id, trigger } satisfies FinanceMessage }))
  for (let i = 0; i < msgs.length; i += 100) await env.FINANCE_SYNC_QUEUE.sendBatch(msgs.slice(i, i + 100))
  return msgs.length
}

export async function consumeFinanceBatch(batch: MessageBatch<FinanceMessage>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    const m = msg.body
    if (!m || typeof m.tenant_id !== "string" || (m.trigger !== "cron" && m.trigger !== "pending_rescan")) {
      msg.ack()
      continue
    }
    try {
      const r = await vaultFor(env, m.tenant_id).financeSync(m.tenant_id, m.trigger)
      if (!r.ok && r.refused === "TENANT_NOT_READY") msg.retry({ delaySeconds: 120 })
      else msg.ack()
    } catch {
      msg.retry({ delaySeconds: 60 })
    }
  }
}
