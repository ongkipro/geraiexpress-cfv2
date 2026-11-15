// TASK-204 isolation: webhook tokens never cross tenants (spec 01 §2.7, AGENTS.md §3.2).
import { env, exports } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { sha256Hex } from "../../src/crypto"
import type { GeraiVaultDO } from "../../src/do/gerai-vault"
import { insertShipment, readShipment } from "../../src/do/gerai-vault/status"
import { hostCache } from "../../src/host/lookup"
import { resetMock } from "../../src/mengantar/mock"
import { configureWebhook, deliver, seedConnected } from "../webhooks/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

describe("cross-tenant webhook tokens", () => {
  it("A's token signed with B's secret is refused; a D1 route re-pointed at B is refused by B's object; nothing is stored", async () => {
    const a = await seedConnected("isoa")
    const b = await seedConnected("isob")
    const wa = await configureWebhook(a.cookie, "secret-of-tenant-a")
    const wb = await configureWebhook(b.cookie, "secret-of-tenant-b")
    expect(wa.token).not.toBe(wb.token)
    for (const t of [a, b]) {
      await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.transactionSync(() => insertShipment(s.storage.sql, { tenantId: t.tenantId, slug: "x1x1x1x", courierCode: "JNE", orderCode: "ORD-SAME", awb: "AWB-SAME", status: "ready_for_pickup" }, Date.now())))
    }
    // B's secret on A's URL.
    expect((await deliver(wa.url, { cnote_no: "AWB-SAME", status_category: "DELIVERED" }, { secret: "secret-of-tenant-b" })).status).toBe(401)
    // A tampered/stale D1 route maps A's token to B: B's object checks its own token and refuses.
    await env.DB.prepare("UPDATE webhook_routes SET tenant_id = ? WHERE token_hash = ?").bind(b.tenantId, await sha256Hex(wa.token)).run()
    expect((await deliver(wa.url, { cnote_no: "AWB-SAME", status_category: "DELIVERED" }, { secret: "secret-of-tenant-a" })).status).toBe(404)
    for (const t of [a, b]) {
      const n = await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM webhook_inbox").one().n)
      expect(n).toBe(0)
      expect((await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => readShipment(s.storage.sql, "x1x1x1x")))!.status).toBe("ready_for_pickup")
    }
    // B's own URL still works for B only.
    expect((await deliver(wb.url, { cnote_no: "AWB-SAME", status_category: "DELIVERED" }, { secret: "secret-of-tenant-b" })).status).toBe(200)
    expect(await runInDurableObject(a.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM webhook_inbox").one().n)).toBe(0)
  })

  it("webhook paths answer only on hooks.; app., owner. and tenant hosts give a neutral 404", async () => {
    const a = await seedConnected("isoc")
    const { token } = await configureWebhook(a.cookie)
    await env.DB.prepare("INSERT INTO tenant_hostnames (hostname, tenant_id, kind, state, created_at) VALUES ('isoc.gerai.localhost', ?, 'platform_subdomain', 'active', ?)").bind(a.tenantId, Date.now()).run()
    for (const host of ["app.geraiexpress.localhost", "owner.geraiexpress.localhost", "isoc.gerai.localhost"]) {
      const r = await exports.default.fetch(`http://${host}:8787/webhooks/mengantar/${token}`, { method: "POST", body: "{}" })
      expect(r.status, host).toBe(404)
    }
  })
})
