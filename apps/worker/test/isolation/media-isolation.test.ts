// TASK-302 isolation: a media link or id from gerai A never opens anything for gerai B (signature bound to the tenant,
// key prefix bound to the tenant, index lives in each tenant object).
import { env, exports } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { signMediaUrl } from "../../src/media"
import { APP, seedConnected } from "../webhooks/helpers"

describe("media cross-tenant denial", () => {
  it("A's signed URL with B's session, and B signing A's id, are both refused", async () => {
    const a = await seedConnected("mediaa")
    const b = await seedConnected("mediab")
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const up = await exports.default.fetch(`${APP}/api/app/media?purpose=claim`, { method: "POST", headers: { origin: APP, cookie: a.cookie }, body: png })
    const { id, url } = ((await up.json()) as { data: { id: string; url: string } }).data
    expect((await exports.default.fetch(`${APP}${url}`, { headers: { cookie: a.cookie } })).status).toBe(200)
    // B presents A's URL: the signature was made for A's tenant → 403.
    expect((await exports.default.fetch(`${APP}${url}`, { headers: { cookie: b.cookie } })).status).toBe(403)
    // A URL correctly signed for B but naming A's media id: B's object has no such id → 404.
    const forged = await signMediaUrl(env.KEK_SECRET, b.tenantId, id, Date.now())
    expect((await exports.default.fetch(`${APP}${forged}`, { headers: { cookie: b.cookie } })).status).toBe(404)
    // The object refuses to register a key outside its own prefix.
    expect(await b.vault.registerMedia(b.tenantId, { key: `t/${a.tenantId}/claim/x.png`, purpose: "claim", contentType: "image/png", sizeBytes: 8, uploadedBy: "x" })).toEqual({ ok: false, refused: "TENANT_MISMATCH" })
  })

  it("contacts of A are invisible to B", async () => {
    const a = await seedConnected("kontaka")
    const b = await seedConnected("kontakb")
    await exports.default.fetch(`${APP}/api/app/contacts/senders`, { method: "POST", headers: { origin: APP, cookie: a.cookie, "content-type": "application/json" }, body: JSON.stringify({ name: "Rahasia A", phone: "081299998888" }) })
    const l = (await (await exports.default.fetch(`${APP}/api/app/contacts/senders?q=Rahasia`, { headers: { cookie: b.cookie } })).json()) as { data: { items: unknown[] } }
    expect(l.data.items).toHaveLength(0)
  })
})
