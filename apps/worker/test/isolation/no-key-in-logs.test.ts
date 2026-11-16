// TASK-299 exit gate: zero raw key URLs in logs. Runs every M2 Mengantar path (onboarding, polling, discount verifier,
// key rotation, webhook ingest, provider errors and timeouts) with console capture, then asserts that no seller key,
// partner secret or `/api/public/<key>/` URL appears in any log line (AGENTS.md §3.5, DEC-210).
import { env } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { GeraiVaultDO } from "../../src/do/gerai-vault"
import { rotateSellerKey } from "../../src/do/gerai-vault/credentials/rotation"
import { insertShipment } from "../../src/do/gerai-vault/status"
import { decryptString } from "../../src/crypto/aead"
import { hostCache } from "../../src/host/lookup"
import { mockFaults, mockOrders, resetMock } from "../../src/mengantar/mock"
import { runDiscountVerifier } from "../../src/pricing/rules"
import { adminSession, ownerPost, submit } from "../onboarding/helpers"
import { configureWebhook, deliver } from "../webhooks/helpers"

const lines: string[] = []
beforeEach(() => {
  resetMock()
  hostCache.clear()
  lines.length = 0
  for (const m of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
      lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a, (_k, v) => (v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v)))).join(" "))
    })
  }
})
afterEach(() => vi.restoreAllMocks())

describe("no raw Mengantar key in logs (M2 exit gate)", () => {
  it("onboarding, polling, verifier, rotation (incl. timeouts) and webhooks never log a key or keyed URL", async () => {
    const s = await submit("tanpakunci", "tanpakunci.seller@contoh.test")
    const admin = await adminSession()
    expect((await ownerPost(`/gerai/applications/${s.applicationId}/approve`, admin, { reason: "data lengkap dan valid" })).status).toBe(200)
    const vault = (await import("../../src/do/gerai-vault/stub")).vaultFor(env, s.tenantId)
    const keyOf = async () => decryptString(env.KEK_SECRET, await runInDurableObject(vault, (_i: GeraiVaultDO, st) => st.storage.sql.exec<{ encrypted_api_key: string }>("SELECT encrypted_api_key FROM mengantar_connections").one().encrypted_api_key), `seller-key:${s.tenantId}`)
    const keys = new Set<string>([await keyOf()])

    // Polling with a provider 404 and a normal order.
    await runInDurableObject(vault, (_i: GeraiVaultDO, st) => {
      st.storage.transactionSync(() => {
        insertShipment(st.storage.sql, { tenantId: s.tenantId, slug: "k1k1k1k", courierCode: "JNE", orderCode: "ORD-k1", awb: "JNEKEY1", status: "ready_for_pickup" }, Date.now())
        insertShipment(st.storage.sql, { tenantId: s.tenantId, slug: "k2k2k2k", courierCode: "JNE", orderCode: "ORD-k2", awb: "JNEMISSING", status: "ready_for_pickup" }, Date.now())
      })
    })
    mockOrders.set("JNEKEY1", { cnote_no: "JNEKEY1", ORDER_ID: "ORD-k1", statusCategory: "ON DELIVERY", history: [{ date: "15-11-2026 10:00", statusCategory: "ON DELIVERY" }] })
    await vault.pollStatus(s.tenantId)
    // Discount verifier (estimate with the key in the path).
    await runDiscountVerifier(env, Date.now() + 16 * 60_000)
    // Rotation: success, then lost response + read-back timeout.
    await rotateSellerKey(env, { tenantId: s.tenantId, actorId: "sa", reason: "uji log", now: Date.now() })
    keys.add(await keyOf())
    mockFaults.regenerate = "timeout_after_apply"
    await rotateSellerKey(env, { tenantId: s.tenantId, actorId: "sa", reason: "uji log", now: Date.now() })
    keys.add(await keyOf())
    // Webhook ingest with a wrong and a right signature.
    const { url } = await configureWebhook(s.user.cookie, "nilai-log-uji")
    await deliver(url, { cnote_no: "JNEKEY1", status_category: "DELIVERED" }, { secret: "salah-salah-123" })
    await deliver(url, { cnote_no: "JNEKEY1", status_category: "DELIVERED" }, { secret: "nilai-log-uji" })

    expect(lines.length).toBeGreaterThan(0) // telemetry did emit events
    const all = lines.join("\n")
    for (const k of keys) {
      expect(k.length).toBeGreaterThan(4)
      expect(all).not.toContain(k)
    }
    expect(all).not.toMatch(/\/api\/public\/(?!\{API_KEY\}|\[REDACTED\])[^/\s"]+\//)
    expect(all).not.toContain(env.MENGANTAR_PARTNER_SECRET)
    expect(all).not.toContain("nilai-log-uji")
  })
})
