// TASK-205 seller key rotation fence (ADR-0004 §5, spec 10 §4.3): crash/timeout at each step, in-flight dispatch with
// the old version rejected, regenerate never repeated, webhook route rotation 24 h.
import { env } from "cloudflare:workers"
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { sha256Hex } from "../../src/crypto"
import { decryptString } from "../../src/crypto/aead"
import type { GeraiVaultDO } from "../../src/do/gerai-vault"
import { revokeExpiredRoutes, rotateSellerKey } from "../../src/do/gerai-vault/credentials/rotation"
import { hostCache } from "../../src/host/lookup"
import { partnerClient } from "../../src/mengantar/factory"
import { mockFaults, resetMock } from "../../src/mengantar/mock"
import { configureWebhook, deliver, seedConnected } from "../webhooks/helpers"

type Vault = Awaited<ReturnType<typeof seedConnected>>["vault"]

async function seedRotatable(slug: string) {
  const t = await seedConnected(slug)
  // A real (mock) seller so regenerate / api-key answer.
  const reg = await partnerClient(env).register({ name: slug, email: `${slug}@seller.test`, phone: "081200000000", externalUserId: t.tenantId })
  if (reg.kind !== "ok" || !reg.data.apiKey) throw new Error("mock register failed")
  await t.vault.recordOnboarding(t.tenantId, { environment: "sandbox", state: "connected", sellerId: reg.data.sellerId, externalUserId: t.tenantId, apiKey: reg.data.apiKey })
  return { ...t, sellerId: reg.data.sellerId }
}
type Conn = { key_version: number; rotation_state: string; encrypted_api_key: string; encrypted_webhook_secret: string | null; webhook_state: string; webhook_path_token: string | null; previous_webhook_path_token: string | null }
const conn = (vault: Vault) => runInDurableObject(vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec<Conn>("SELECT * FROM mengantar_connections").one())
const storedKey = async (t: { vault: Vault; tenantId: string }) => decryptString(env.KEK_SECRET, (await conn(t.vault)).encrypted_api_key, `seller-key:${t.tenantId}`)
async function mengantarKey(sellerId: string) {
  const r = await partnerClient(env).apiKey(sellerId)
  if (r.kind !== "ok") throw new Error("mock apiKey failed")
  return r.data.apiKey
}
const audits = (vault: Vault) =>
  runInDurableObject(vault, (_i: GeraiVaultDO, s) =>
    s.storage.sql
      .exec<{ action: string }>("SELECT action FROM audit_logs WHERE action LIKE 'mengantar.key_%' ORDER BY at, rowid")
      .toArray()
      .map((r) => r.action),
  )

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

describe("rotation fence (ADR-0004 §5)", () => {
  it("happy path: version bumped before regenerate, new key + callback secret + new webhook URL stored atomically", async () => {
    const t = await seedRotatable("rot1")
    const { url: oldUrl, token: oldToken } = await configureWebhook(t.cookie)
    expect((await deliver(oldUrl, { cnote_no: "X", status_category: "ON DELIVERY" })).status).toBe(200)
    const before = await conn(t.vault)
    const out = await rotateSellerKey(env, { tenantId: t.tenantId, actorId: "sa-1", reason: "dugaan kebocoran", now: Date.now() })
    expect(out).toMatchObject({ state: "rotated", keyVersion: before.key_version + 1, webhookUrlChanged: true, secretKnown: true })
    const after = await conn(t.vault)
    expect(after).toMatchObject({ key_version: before.key_version + 1, rotation_state: "idle", webhook_state: "awaiting_seller_setup", previous_webhook_path_token: oldToken })
    expect(after.webhook_path_token).not.toBe(oldToken)
    expect(await storedKey(t)).toBe(await mengantarKey(t.sellerId))
    // D1: new route active, old route rotating (still verifies for 24 h).
    const routes = await env.DB.prepare("SELECT token_hash, state FROM webhook_routes WHERE tenant_id = ?").bind(t.tenantId).all<{ token_hash: string; state: string }>()
    const byHash = Object.fromEntries(routes.results.map((r) => [r.token_hash, r.state]))
    expect(byHash[await sha256Hex(oldToken)]).toBe("rotating")
    expect(byHash[await sha256Hex(after.webhook_path_token!)]).toBe("active")
    expect(await audits(t.vault)).toEqual(["mengantar.key_rotation_started", "mengantar.key_rotated"])
  })

  it("in-flight dispatch holding the old version is rejected; new dispatches pause while the fence is up", async () => {
    const t = await seedRotatable("rot2")
    const held = await t.vault.probeDispatchFence(t.tenantId)
    expect(held).toMatchObject({ ok: true, value: { allowed: true } })
    const oldVersion = held.ok ? held.value.version! : -1
    const fence = await t.vault.beginKeyRotation(t.tenantId, { actorId: "sa", reason: "uji", now: Date.now() })
    expect(fence.ok).toBe(true)
    // Crash point A: fenced, regenerate not yet called.
    expect(await t.vault.probeDispatchFence(t.tenantId)).toMatchObject({ ok: true, value: { allowed: false, reason: "KEY_ROTATING" } })
    expect(await t.vault.probeDispatchFence(t.tenantId, oldVersion)).toMatchObject({ ok: true, value: { allowed: false, reason: "STALE_KEY_VERSION" } })
    // A second rotation cannot start on top.
    expect(await t.vault.beginKeyRotation(t.tenantId, { actorId: "sa", reason: "uji", now: Date.now() })).toEqual({ ok: false, refused: "ROTATION_IN_PROGRESS" })
    // Polling (also a Mengantar call) does not use the key while fenced.
    expect(await t.vault.pollStatus(t.tenantId)).toMatchObject({ ok: true, value: { polled: 0 } })
  })

  it("crash after the fence, before regenerate: the alarm reads the key back (no regenerate) and lifts the fence", async () => {
    const t = await seedRotatable("rot3")
    const keyBefore = await storedKey(t)
    const fence = await t.vault.beginKeyRotation(t.tenantId, { actorId: "sa", reason: "uji", now: Date.now() - 6 * 60_000 })
    expect(fence.ok).toBe(true)
    await evictDurableObject(t.vault) // the Worker died
    // The overdue check may already have fired; otherwise run it now. Either way only the alarm resolves it.
    await runDurableObjectAlarm(t.vault)
    await expect.poll(async () => (await conn(t.vault)).rotation_state, { timeout: 5000 }).toBe("idle")
    const c = await conn(t.vault)
    expect(c.rotation_state).toBe("idle")
    expect(await storedKey(t)).toBe(keyBefore) // Mengantar never rotated
    expect(await t.vault.probeDispatchFence(t.tenantId)).toMatchObject({ ok: true, value: { allowed: true, version: c.key_version } })
  })

  it("timeout AFTER Mengantar rotated: never regenerate again; read-back stores the current key; active webhook → secret_mismatch", async () => {
    const t = await seedRotatable("rot4")
    const { url } = await configureWebhook(t.cookie)
    await deliver(url, { cnote_no: "X", status_category: "ON DELIVERY" })
    mockFaults.regenerate = "timeout_after_apply"
    const out = await rotateSellerKey(env, { tenantId: t.tenantId, actorId: "sa", reason: "uji", now: Date.now() })
    expect(out.state).toBe("rotated")
    expect(await storedKey(t)).toBe(await mengantarKey(t.sellerId))
    expect((await conn(t.vault)).webhook_state).toBe("secret_mismatch")
    expect(await audits(t.vault)).toEqual(["mengantar.key_rotation_started", "mengantar.key_rotation_unknown", "mengantar.key_rotated"])
  })

  it("timeout AND read-back timeout: stays fenced (unknown); a later alarm resolves it; a new rotation is refused meanwhile", async () => {
    const t = await seedRotatable("rot5")
    mockFaults.regenerate = "timeout_before_apply"
    mockFaults.apiKey = "timeout"
    const out = await rotateSellerKey(env, { tenantId: t.tenantId, actorId: "sa", reason: "uji", now: Date.now() })
    expect(out).toMatchObject({ state: "unknown", code: "timeout" })
    expect((await conn(t.vault)).rotation_state).toBe("unknown")
    await expect(rotateSellerKey(env, { tenantId: t.tenantId, actorId: "sa", reason: "lagi", now: Date.now() })).rejects.toMatchObject({ code: "ROTATION_IN_PROGRESS" })
    await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec("UPDATE vault_timers SET due_at = 0 WHERE name = 'key_rotation_check'"))
    await runDurableObjectAlarm(t.vault)
    await expect.poll(async () => (await conn(t.vault)).rotation_state, { timeout: 5000 }).toBe("idle")
    expect(await storedKey(t)).toBe(await mengantarKey(t.sellerId))
  })

  it("Mengantar error: old key stays valid, fence lifted, version stays bumped (old holders still rejected)", async () => {
    const t = await seedRotatable("rot6")
    const v0 = (await conn(t.vault)).key_version
    const keyBefore = await storedKey(t)
    mockFaults.regenerate = "error"
    expect(await rotateSellerKey(env, { tenantId: t.tenantId, actorId: "sa", reason: "uji", now: Date.now() })).toMatchObject({ state: "failed", code: "SELLER_INACTIVE" })
    expect(await conn(t.vault)).toMatchObject({ rotation_state: "idle", key_version: v0 + 1 })
    expect(await storedKey(t)).toBe(keyBefore)
    expect(await t.vault.probeDispatchFence(t.tenantId, v0)).toMatchObject({ ok: true, value: { allowed: false } })
  })

  it("a stale completion for an older version is refused", async () => {
    const t = await seedRotatable("rot7")
    const f = await t.vault.beginKeyRotation(t.tenantId, { actorId: "sa", reason: "uji", now: Date.now() })
    const v = f.ok ? f.value.keyVersion : 0
    expect(await t.vault.completeKeyRotation(t.tenantId, v - 1, { apiKey: "MOCK-stale", callbackSecret: null })).toEqual({ ok: false, refused: "STALE_KEY_VERSION" })
    expect(await t.vault.completeKeyRotation(t.tenantId, v, { apiKey: "MOCK-fresh", callbackSecret: null })).toMatchObject({ ok: true })
    expect(await t.vault.completeKeyRotation(t.tenantId, v, { apiKey: "MOCK-again", callbackSecret: null })).toEqual({ ok: false, refused: "STALE_KEY_VERSION" })
    expect(await storedKey(t)).toBe("MOCK-fresh")
  })
})

describe("webhook route rotation (spec 01 §2.7)", () => {
  it("old URL verifies with either secret for 24 h, then stops; the D1 route is revoked by the hourly sweep", async () => {
    const t = await seedRotatable("rot8")
    const { url: oldUrl } = await configureWebhook(t.cookie, "nilai-lama-123")
    await rotateSellerKey(env, { tenantId: t.tenantId, actorId: "sa", reason: "uji", now: Date.now() })
    // Mengantar now signs with the new callback secret; Seller Settings may still hold the old URL.
    const newSecret = await decryptString(env.KEK_SECRET, (await conn(t.vault)).encrypted_webhook_secret!, `webhook-secret:${t.tenantId}`)
    expect((await deliver(oldUrl, { cnote_no: "X", status_category: "ON DELIVERY" }, { secret: newSecret })).status).toBe(200)
    expect((await deliver(oldUrl, { cnote_no: "X", status_category: "PICKED UP" }, { secret: "nilai-lama-123" })).status).toBe(200)
    // The previous URL does not count as completing the new setup.
    expect((await conn(t.vault)).webhook_state).toBe("awaiting_seller_setup")
    // 24 h later: the object forgets the old token and the D1 route is revoked.
    await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec("UPDATE mengantar_connections SET previous_token_expires_at = ?", Date.now() - 1))
    expect((await deliver(oldUrl, { cnote_no: "X", status_category: "DELIVERED" }, { secret: newSecret })).status).toBe(404)
    await env.DB.prepare("UPDATE webhook_routes SET created_at = ? WHERE tenant_id = ? AND state = 'active'").bind(Date.now() - 25 * 3600_000, t.tenantId).run()
    expect(await revokeExpiredRoutes(env, Date.now())).toBeGreaterThanOrEqual(1)
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM webhook_routes WHERE tenant_id = ? AND state = 'rotating'").bind(t.tenantId).first<{ n: number }>())!.n).toBe(0)
  })
})
