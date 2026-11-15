import { env, exports } from "cloudflare:workers"
import { createScheduledController, createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { ALERT_DEDUP_MS, sendAlert } from "../../src/telemetry/alerts"
import { runChecks } from "../../src/telemetry/checks"
import worker from "../../src/index"

describe("owner alert channel (TASK-110)", () => {
  it("delivers to the webhook once per key per 30 min; logs only without a webhook", async () => {
    const sent: { url: string; body: string }[] = []
    const fake: typeof fetch = async (url, init) => {
      sent.push({ url: String(url), body: String(init?.body) })
      return new Response("ok")
    }
    const e = { DB: env.DB, GX_ENV: "staging" as const, ALERT_WEBHOOK_URL: "https://chat.example/hook" }
    const a = { key: "test_dryrun", severity: "warn" as const, text: "Uji alert (dry run)" }
    const t0 = 1_800_000_000_000
    expect(await sendAlert(e, a, t0, fake)).toBe("sent")
    expect(await sendAlert(e, a, t0 + 60_000, fake)).toBe("suppressed")
    expect(await sendAlert(e, a, t0 + ALERT_DEDUP_MS, fake)).toBe("sent")
    expect(sent).toHaveLength(2)
    expect(JSON.parse(sent[0]!.body)).toEqual({ text: "[GeraiExpress staging] Uji alert (dry run)", key: "test_dryrun", severity: "warn" })
    expect(await sendAlert({ DB: env.DB, GX_ENV: "local" as const }, { ...a, key: "test_logged" }, t0, fake)).toBe("logged")
    expect(sent).toHaveLength(2)
  })

  it("a webhook failure is reported, never thrown, and the next check retries within the window", async () => {
    const e = { DB: env.DB, GX_ENV: "staging" as const, ALERT_WEBHOOK_URL: " https://chat.example/hook " }
    expect(await sendAlert(e, { key: "test_fail", severity: "error", text: "x" }, 1, async () => new Response("no", { status: 500 }))).toBe("failed")
    expect(await sendAlert(e, { key: "test_fail", severity: "error", text: "x" }, 2, async () => new Response("ok"))).toBe("sent")
    expect(await sendAlert(e, { key: "test_throw", severity: "error", text: "x" }, 1, async () => { throw new Error("down") })).toBe("failed")
    expect(await sendAlert({ ...e, ALERT_WEBHOOK_URL: "   " }, { key: "test_blank", severity: "warn", text: "x" }, 1)).toBe("logged")
    await expect(sendAlert(e, { key: "Bad Key!", severity: "warn", text: "x" }, 1)).rejects.toThrow()
  })

  it("the webhook payload is redacted", async () => {
    let body = ""
    await sendAlert({ DB: env.DB, GX_ENV: "staging" as const, ALERT_WEBHOOK_URL: "https://chat.example/hook" }, { key: "test_redact", severity: "warn", text: "gagal untuk 081234567890 di /api/public/SELLERKEY1/order" }, 1, async (_u, init) => {
      body = String(init?.body)
      return new Response("ok")
    })
    expect(body).not.toContain("081234567890")
    expect(body).not.toContain("SELLERKEY1")
  })

  it("the recovery check fires when a tenant is in recovery", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenants (id, slug, name, status, created_at, updated_at) VALUES ('alert-t', 'alert-t', 'A', 'active', 1, 1)"),
      env.DB.prepare("INSERT INTO tenant_schema_versions (tenant_id, schema_version, state, updated_at) VALUES ('alert-t', 1, 'recovery', 1)"),
    ])
    const sent: string[] = []
    const r = await runChecks({ DB: env.DB, GX_ENV: "staging" as const, ALERT_WEBHOOK_URL: "https://chat.example/hook" }, 2_000_000_000_000, async (_u, init) => {
      sent.push(String(init?.body))
      return new Response("ok")
    })
    expect(r).toEqual([{ key: "tenant_recovery", outcome: "sent" }])
    expect(sent[0]).toContain("pemulihan")
    await env.DB.prepare("DELETE FROM tenant_schema_versions WHERE tenant_id = 'alert-t'").run()
  })

  it("only the */5 cron runs the checks and records the alert", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenants (id, slug, name, status, created_at, updated_at) VALUES ('cron-t', 'cron-t', 'C', 'active', 1, 1)"),
      env.DB.prepare("INSERT INTO tenant_schema_versions (tenant_id, schema_version, state, updated_at) VALUES ('cron-t', 1, 'recovery', 1)"),
      env.DB.prepare("DELETE FROM alert_state WHERE alert_key = 'tenant_recovery'"),
    ])
    try {
      const hourly = createExecutionContext()
      await worker.scheduled!(createScheduledController({ cron: "0 * * * *", scheduledTime: Date.now() }), env, hourly)
      await waitOnExecutionContext(hourly)
      expect(await env.DB.prepare("SELECT 1 FROM alert_state WHERE alert_key = 'tenant_recovery'").first()).toBeNull()
      const five = createExecutionContext()
      await worker.scheduled!(createScheduledController({ cron: "*/5 * * * *", scheduledTime: Date.now() }), env, five)
      await waitOnExecutionContext(five)
      expect(await env.DB.prepare("SELECT count FROM alert_state WHERE alert_key = 'tenant_recovery'").first()).toEqual({ count: 1 })
    } finally {
      await env.DB.prepare("DELETE FROM tenant_schema_versions WHERE tenant_id = 'cron-t'").run()
    }
    expect(exports.default).toBeDefined()
  })
})
