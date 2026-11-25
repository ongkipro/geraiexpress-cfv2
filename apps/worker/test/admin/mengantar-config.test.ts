import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { clearMengantarConfigCache, loadMengantarConfig } from "../../src/mengantar/factory"
import { adminSession, ownerGet, ownerPost, submit } from "../onboarding/helpers"

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM auth_throttle").run()
  await env.DB.prepare(
    "UPDATE platform_partner_config SET partner_id = NULL, partner_origin = NULL, public_origin = NULL, partner_secret_encrypted = NULL, partner_secret_tail = NULL, relay_url = NULL, relay_secret_encrypted = NULL, relay_secret_tail = NULL, updated_by = NULL, updated_at = NULL WHERE id = 1",
  ).run()
  clearMengantarConfigCache()
})

describe("Super Admin Mengantar Partner API config & registration notifications", () => {
  it("encrypts Partner Secret at rest, masks it in GET, blocks SSRF origins, audits field names only, and tests connection", async () => {
    const cookie = await adminSession()
    // Unauthenticated refused.
    expect((await ownerGet("/sistem/mengantar", "")).status).toBe(401)

    const initial = await ownerGet("/sistem/mengantar", cookie)
    expect(initial.status).toBe(200)
    const initJson = (await initial.json()) as { data: { partnerId: string; partnerSecretSource: string } }
    expect(initJson.data.partnerId).toBe("ongkirich")

    // Rejects non-HTTPS, localhost, IP literal and path-bearing origins (anti-SSRF).
    for (const bad of ["http://api-public.mengantar.com", "https://127.0.0.1", "https://localhost:8080", "https://10.0.0.1", "https://api-public.mengantar.com/api"]) {
      const r = await ownerPost("/sistem/mengantar", cookie, { partnerOrigin: bad, reason: "uji validasi ssrf" })
      expect(r.status, bad).toBe(422)
    }
    // Requires audit reason.
    expect((await ownerPost("/sistem/mengantar", cookie, { partnerId: "ongkirich", reason: "x" })).status).toBe(422)

    const secret = "prod-partner-secret-99887766"
    const save = await ownerPost("/sistem/mengantar", cookie, {
      partnerId: "ongkirich-prod",
      partnerOrigin: "https://api-public.mengantar.com",
      publicOrigin: "https://api-public.mengantar.com",
      relayUrl: "https://relay.geraiexpress.com",
      partnerSecret: secret,
      reason: "Isi kredensial produksi resmi Mengantar",
    })
    expect(save.status).toBe(200)

    // Stored encrypted in D1, never plaintext.
    const rawRow = await env.DB.prepare("SELECT partner_secret_encrypted, partner_secret_tail FROM platform_partner_config WHERE id = 1").first<{ partner_secret_encrypted: string; partner_secret_tail: string }>()
    expect(rawRow!.partner_secret_encrypted).toBeTruthy()
    expect(rawRow!.partner_secret_encrypted).not.toContain(secret)
    expect(rawRow!.partner_secret_tail).toBe("7766")

    // GET never returns plaintext secret; shows masked tail & database source.
    const after = await ownerGet("/sistem/mengantar", cookie)
    const afterText = await after.text()
    expect(afterText).not.toContain(secret)
    expect(JSON.parse(afterText)).toMatchObject({
      ok: true,
      data: {
        partnerId: "ongkirich-prod",
        hasPartnerSecret: true,
        partnerSecretSource: "database",
        partnerSecretMasked: "••••••••7766",
      },
    })

    // Runtime resolver decrypts and uses the saved override.
    const cfg = await loadMengantarConfig(env, { bypassCache: true })
    expect(cfg.partnerId).toBe("ongkirich-prod")
    expect(cfg.partnerSecret).toBe(secret)
    expect(cfg.partnerSecretSource).toBe("database")

    // Audit log records changed field names only, never the secret value.
    const audit = await env.DB.prepare("SELECT reason, metadata_json FROM audit_logs WHERE action = 'platform.mengantar_config_updated' ORDER BY at DESC LIMIT 1").first<{ reason: string; metadata_json: string }>()
    expect(audit!.reason).toBe("Isi kredensial produksi resmi Mengantar")
    expect(audit!.metadata_json).not.toContain(secret)

    // Connection test runs cleanly against the configured client (mock locally), reserves PartnerQuotaDO, and audits.
    const { quotaFor, PER_MINUTE } = await import("../../src/do/partner-quota")
    const beforeUsage = await quotaFor(env).usage(Date.now())
    const testRes = await ownerPost("/sistem/mengantar/uji", cookie, {})
    expect(testRes.status).toBe(200)
    expect(await testRes.json()).toMatchObject({ ok: true, data: { ok: true, state: "connected" } })
    const afterUsage = await quotaFor(env).usage(Date.now())
    expect(afterUsage.minute).toBeGreaterThanOrEqual(beforeUsage.minute + 1)

    // TASK-713d: when PartnerQuotaDO minute budget is full, POST /sistem/mengantar/uji refuses with 429 RATE_LIMITED.
    const now = Date.now()
    for (let i = afterUsage.minute; i < PER_MINUTE; i++) await quotaFor(env).reserve("call", now)
    const throttled = await ownerPost("/sistem/mengantar/uji", cookie, {})
    expect(throttled.status).toBe(429)
    expect(((await throttled.json()) as { error: { code: string } }).error.code).toBe("RATE_LIMITED")
  })

  it("enqueues both applicant confirmation and Super Admin notification emails on new outlet registration", async () => {
    await adminSession()
    const beforeSub = (await env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE template_id = 'application_submitted'").first<{ n: number }>())!.n
    const beforeAdm = (await env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE template_id = 'admin_new_application'").first<{ n: number }>())!.n
    await submit("notif-gerai-1", "notif-gerai-1@contoh.test")
    const afterSub = (await env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE template_id = 'application_submitted'").first<{ n: number }>())!.n
    const afterAdm = (await env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE template_id = 'admin_new_application'").first<{ n: number }>())!.n
    expect(afterSub).toBe(beforeSub + 1)
    expect(afterAdm).toBeGreaterThanOrEqual(beforeAdm + 1)
  })
})
