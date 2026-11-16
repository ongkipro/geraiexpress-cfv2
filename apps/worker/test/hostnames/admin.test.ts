// TASK-505 Super Admin side (spec 11 §7): Pro entitlement with reason (audited), `Domain Mitra` list with quota, and
// `Hapus` deletes at Cloudflare (stops billing) and purges the row; non-impersonation: no shipment path is touched.
import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { mockCf } from "../../src/hostnames/cloudflare"
import { checkQuota, createAtCloudflare } from "../../src/hostnames/service"
import { adminSession, ownerGet, ownerPost } from "../onboarding/helpers"
import { appPost, seedConnected } from "../webhooks/helpers"

beforeEach(() => {
  mockCf.reset()
  hostCache.clear()
})

describe("Super Admin custom domains", () => {
  it("Pro toggle needs a reason and is audited; Domain Mitra lists hosts + quota; Hapus deletes at Cloudflare", async () => {
    const admin = await adminSession()
    const t = await seedConnected("cdadmin")
    expect((await appPost("/custom-domain", t.cookie, { hostname: "kirim.tokoadmin.id" })).status).toBe(403)
    expect((await ownerPost("/gerai/cdadmin/custom-domain", admin, { enabled: true })).status).toBe(422)
    expect((await ownerPost("/gerai/cdadmin/custom-domain", admin, { enabled: true, reason: "paket Pro dibayar" })).status).toBe(200)
    expect(await env.DB.prepare("SELECT reason FROM audit_logs WHERE action = 'tenant.custom_domain' AND tenant_id = ?").bind(t.tenantId).first()).toEqual({ reason: "paket Pro dibayar" })
    expect((await appPost("/custom-domain", t.cookie, { hostname: "kirim.tokoadmin.id" })).status).toBe(201)
    await createAtCloudflare(env, "kirim.tokoadmin.id", Date.now())
    await checkQuota(env, Date.now())
    const list = (await (await ownerGet("/domains", admin)).json()) as { data: { items: Array<{ hostname: string; state: string; slug: string }>; quota: { used: number } } }
    expect(list.data.items.find((x) => x.hostname === "kirim.tokoadmin.id")).toMatchObject({ state: "pending", slug: "cdadmin" })
    expect(list.data.quota.used).toBeGreaterThanOrEqual(1)
    const id = (await env.DB.prepare("SELECT cf_custom_hostname_id FROM tenant_hostnames WHERE hostname = 'kirim.tokoadmin.id'").first<{ cf_custom_hostname_id: string }>())!.cf_custom_hostname_id
    expect((await ownerPost("/domains/kirim.tokoadmin.id/delete", admin, {})).status).toBe(422)
    expect((await ownerPost("/domains/kirim.tokoadmin.id/delete", admin, { reason: "permintaan pemilik gerai" })).status).toBe(200)
    expect(mockCf.hosts.has(id)).toBe(false)
    expect(await env.DB.prepare("SELECT state FROM tenant_hostnames WHERE hostname = 'kirim.tokoadmin.id'").first()).toEqual({ state: "purged" })
    expect(await env.DB.prepare("SELECT target_id FROM audit_logs WHERE action = 'hostname.delete'").first()).toEqual({ target_id: "kirim.tokoadmin.id" })
    expect((await ownerPost("/domains/kirim.tokoadmin.id/delete", admin, { reason: "kedua kalinya" })).status).toBe(404)
  })
})
