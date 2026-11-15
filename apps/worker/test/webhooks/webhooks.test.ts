// TASK-204: webhook routing, verification-in-object, inbox before ack, apply, sweep/retention, status combine and the
// polling floor (spec 01 §2.7, §3; PR-02b).
import { env } from "cloudflare:workers"
import { evictDurableObject, runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { hmacSha256Hex } from "../../src/crypto"
import { vaultFor } from "../../src/do/gerai-vault/stub"
import type { GeraiVaultDO } from "../../src/do/gerai-vault"
import { blocksManifestHandover, insertShipment, readShipment, recordCustody } from "../../src/do/gerai-vault/status"
import { hostCache } from "../../src/host/lookup"
import { mockOrders, resetMock } from "../../src/mengantar/mock"
import { verifySignature } from "../../src/webhooks/verify"
import { appGet, appPost, configureWebhook, deliver, WEBHOOK_TEST_VALUE, seedConnected } from "./helpers"


async function addShipment(vault: ReturnType<typeof vaultFor>, tenantId: string, slug: string, awb: string) {
  await runInDurableObject(vault, (_i: GeraiVaultDO, state) => {
    state.storage.transactionSync(() => insertShipment(state.storage.sql, { tenantId, slug, courierCode: "JNE", orderCode: `ORD-${slug}`, awb, status: "ready_for_pickup" }, Date.now()))
  })
}
const shipment = (vault: ReturnType<typeof vaultFor>, slug: string) => runInDurableObject(vault, (_i: GeraiVaultDO, s) => readShipment(s.storage.sql, slug)!)
const inboxRows = (vault: ReturnType<typeof vaultFor>) => runInDurableObject(vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec<{ event_key: string; state: string; provider_event_at: number }>("SELECT event_key, state, provider_event_at FROM webhook_inbox ORDER BY received_at").toArray())
const appliedKeys = async (vault: ReturnType<typeof vaultFor>, tenantId: string) => {
  for (const r of await inboxRows(vault)) if (r.state === "received") await vault.applyWebhook(tenantId, r.event_key)
}

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

describe("signature (Mengantar docs test vector)", () => {
  it("matches the published vector; rejects stale, tampered and sandbox-on-production", async () => {
    const body = '{"cnote_no":"JNE1234567890","order_id":"ORD-000123","courier":"JNE","status_category":"DELIVERED"}'
    const sig = "05826dec707ea7164801d952cb7eaf7ce9adc0c8aa0b93366480434164a1a111"
    const at = 1787548800000
    const base = { timestamp: String(at), signature: sig, rawBody: body, environmentHeader: null, expect: "sandbox" as const }
    expect(await verifySignature("testsecret", base, at + 1000)).toEqual({ ok: true, eventAt: at })
    expect(await verifySignature("testsecret", base, at + 5 * 60_000 + 1)).toEqual({ ok: false, reason: "STALE_TIMESTAMP" })
    expect(await verifySignature("testsecret", { ...base, rawBody: body.replace("DELIVERED", "RTS") }, at)).toEqual({ ok: false, reason: "BAD_SIGNATURE" })
    expect(await verifySignature("testsecret", { ...base, environmentHeader: "sandbox", expect: "production" }, at)).toEqual({ ok: false, reason: "WRONG_ENVIRONMENT" })
    expect(await verifySignature("testsecret", { ...base, signature: null }, at)).toEqual({ ok: false, reason: "MISSING_HEADERS" })
  })
})

describe("ingest → inbox → apply (spec 01 §2.7)", () => {
  it("setup flow: URL, secret, first verified delivery activates; status applied and shipment_index republished", async () => {
    const t = await seedConnected("alur")
    const before = (await (await appGet("/settings/mengantar", t.cookie)).json()) as { data: { webhookState: string; hasSecret: boolean } }
    expect(before.data).toMatchObject({ webhookState: "awaiting_seller_setup", hasSecret: false })
    const { url } = await configureWebhook(t.cookie)
    // The same URL on every read (token created once).
    expect(((await (await appGet("/settings/mengantar", t.cookie)).json()) as { data: { webhookUrl: string } }).data.webhookUrl).toBe(url)
    await addShipment(t.vault, t.tenantId, "a1b2c3d", "JNE0001")
    const r = await deliver(url, { cnote_no: "JNE0001", order_id: "ORD-a1b2c3d", courier: "JNE", status_category: "ON DELIVERY" })
    expect(r.status).toBe(200)
    expect(await r.text()).toBe("")
    const rows = await inboxRows(t.vault)
    expect(rows).toHaveLength(1)
    await appliedKeys(t.vault, t.tenantId)
    expect((await shipment(t.vault, "a1b2c3d")).status).toBe("in_transit")
    const after = (await (await appGet("/settings/mengantar", t.cookie)).json()) as { data: { webhookState: string; hasSecret: boolean; lastEventAt: number } }
    expect(after.data).toMatchObject({ webhookState: "active", hasSecret: true })
    // shipment_index: version 1 at creation, version 2 after the status change; D1 holds the latest.
    await t.vault.flushOutbox(Date.now() + 60_000)
    const idx = await env.DB.prepare("SELECT status, version FROM shipment_index WHERE tenant_id = ? AND slug = 'a1b2c3d'").bind(t.tenantId).first<{ status: string; version: number }>()
    expect(idx).toEqual({ status: "in_transit", version: 2 })
  })

  it("unknown, malformed or revoked token → 404 without a body; bad signature → 401 + secret_mismatch before activation", async () => {
    const t = await seedConnected("tolak")
    const { url, token } = await configureWebhook(t.cookie)
    const unknown = await deliver(url.replace(token, "A".repeat(43)), { status_category: "DELIVERED" })
    expect(unknown.status).toBe(404)
    expect(await unknown.text()).toBe("")
    expect((await deliver(url.replace(token, "short"), {})).status).toBe(404)
    const bad = await deliver(url, { cnote_no: "X", status_category: "DELIVERED" }, { secret: "wrong-secret-123" })
    expect(bad.status).toBe(401)
    expect(((await (await appGet("/settings/mengantar", t.cookie)).json()) as { data: { webhookState: string } }).data.webhookState).toBe("secret_mismatch")
    expect((await deliver(url, { status_category: "DELIVERED" }, { ts: Date.now() - 6 * 60_000 })).status).toBe(401)
    expect(await inboxRows(t.vault)).toHaveLength(0)
    await env.DB.prepare("UPDATE webhook_routes SET state = 'revoked', revoked_at = ? WHERE tenant_id = ?").bind(Date.now(), t.tenantId).run()
    expect((await deliver(url, { status_category: "DELIVERED" })).status).toBe(404)
  })

  it("production connection refuses sandbox deliveries", async () => {
    const t = await seedConnected("produksi", { environment: "production" })
    const { url } = await configureWebhook(t.cookie)
    expect((await deliver(url, { cnote_no: "X", status_category: "DELIVERED" }, { env: "sandbox" })).status).toBe(401)
  })

  it("duplicate delivery is one inbox row; restart between ingest and consumption still applies once", async () => {
    const t = await seedConnected("ganda")
    const { url } = await configureWebhook(t.cookie)
    await addShipment(t.vault, t.tenantId, "d1d2d3d", "JNE0002")
    const ts = Date.now()
    const body = { cnote_no: "JNE0002", order_id: "ORD-d1d2d3d", courier: "JNE", status_category: "DELIVERED" }
    expect((await deliver(url, body, { ts })).status).toBe(200)
    expect((await deliver(url, body, { ts })).status).toBe(200)
    const rows = await inboxRows(t.vault)
    expect(rows).toHaveLength(1)
    await evictDurableObject(t.vault)
    const a = await t.vault.applyWebhook(t.tenantId, rows[0]!.event_key)
    const b = await t.vault.applyWebhook(t.tenantId, rows[0]!.event_key)
    expect(a.ok && b.ok && [a.value.state, b.value.state]).toEqual(expect.arrayContaining(["noop"]))
    expect((await shipment(t.vault, "d1d2d3d")).status).toBe("delivered")
    const events = await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM shipment_events WHERE slug = 'd1d2d3d' AND source = 'webhook'").one().n)
    expect(events).toBe(1)
  })

  it("enqueue failure after commit: the sweep re-enqueues rows still received after 10 minutes; retention deletes old applied rows", async () => {
    const t = await seedConnected("sapu")
    const { token } = await configureWebhook(t.cookie)
    await addShipment(t.vault, t.tenantId, "s1s2s3s", "JNE0003")
    const raw = JSON.stringify({ cnote_no: "JNE0003", status_category: "PICKED UP" })
    const ts = String(Date.now())
    // Ingest without the Worker's enqueue = the enqueue failed after the commit.
    const ing = await t.vault.ingestWebhook(t.tenantId, { token, timestamp: ts, signature: await hmacSha256Hex(WEBHOOK_TEST_VALUE, `${ts}.${raw}`), environmentHeader: "sandbox", rawBody: raw })
    expect(ing).toMatchObject({ ok: true, value: { duplicate: false } })
    expect(await t.vault.sweepInbox(t.tenantId, Date.now() + 60_000)).toEqual({ ok: true, value: { resent: 0, deleted: 0 } })
    expect(await t.vault.sweepInbox(t.tenantId, Date.now() + 11 * 60_000)).toMatchObject({ ok: true, value: { resent: 1 } })
    await appliedKeys(t.vault, t.tenantId)
    expect((await shipment(t.vault, "s1s2s3s")).status).toBe("in_transit")
    expect(await t.vault.sweepInbox(t.tenantId, Date.now() + 31 * 24 * 3600_000)).toMatchObject({ ok: true, value: { deleted: 1 } })
    expect(await inboxRows(t.vault)).toHaveLength(0)
  })

  it("two events consumed in reverse order after a restart: stale non-terminal ignored, terminal never regresses", async () => {
    const t = await seedConnected("balik")
    const { url } = await configureWebhook(t.cookie)
    await addShipment(t.vault, t.tenantId, "r1r2r3r", "JNE0004")
    const now = Date.now()
    await deliver(url, { cnote_no: "JNE0004", status_category: "ON DELIVERY" }, { ts: now - 3 * 60_000 })
    await deliver(url, { cnote_no: "JNE0004", status_category: "DELIVERED" }, { ts: now - 60_000 })
    const rows = (await inboxRows(t.vault)).sort((a, b) => b.provider_event_at - a.provider_event_at)
    await t.vault.applyWebhook(t.tenantId, rows[0]!.event_key) // DELIVERED first
    await evictDurableObject(t.vault)
    await t.vault.applyWebhook(t.tenantId, rows[1]!.event_key) // older ON DELIVERY afterwards
    expect((await shipment(t.vault, "r1r2r3r")).status).toBe("delivered")
  })

  it("an event for an unknown shipment is kept and marked rejected (no transition)", async () => {
    const t = await seedConnected("asing")
    const { url } = await configureWebhook(t.cookie)
    expect((await deliver(url, { cnote_no: "NOPE", status_category: "DELIVERED" })).status).toBe(200)
    const [row] = await inboxRows(t.vault)
    expect(await t.vault.applyWebhook(t.tenantId, row!.event_key)).toMatchObject({ ok: true, value: { state: "rejected" } })
  })
})

describe("status combine in the object (spec 01 §3.6, both orders and after restart)", () => {
  const obs = (vault: ReturnType<typeof vaultFor>, slug: string, key: string, category: string, at: number, source: "webhook" | "poll" = "webhook") =>
    runInDurableObject(vault, async (_i: GeraiVaultDO, s) => {
      const { recordProviderObservation } = await import("../../src/do/gerai-vault/status")
      const { mapMengantarCategory } = await import("@gx/domain/status")
      s.storage.transactionSync(() => recordProviderObservation(s.storage.sql, { slug, eventKey: key, source, rawCategory: category, mapped: mapMengantarCategory(category), eventAt: at, eventAtText: null }, Date.now()))
    })
  const custody = (vault: ReturnType<typeof vaultFor>, slug: string, stage: "handed_to_courier" | "rts_at_gerai" | "rts_returned_to_sender" | "cancelled_local") =>
    runInDurableObject(vault, (_i: GeraiVaultDO, s) => s.storage.transactionSync(() => recordCustody(s.storage.sql, { slug, stage, eventKey: `local:${slug}:${stage}` }, Date.now())))

  it("webhook in_transit 10:15:40 vs poll rts_in_transit 10:15 → rts_in_transit in both orders", async () => {
    const t = await seedConnected("urutan")
    for (const [slug, order] of [["u1u1u1u", 0], ["u2u2u2u", 1]] as const) {
      await addShipment(t.vault, t.tenantId, slug, `AWB-${slug}`)
      const a = () => obs(t.vault, slug, `w-${slug}`, "ON DELIVERY", Date.parse("2026-11-15T10:15:40+07:00"))
      const b = () => obs(t.vault, slug, `p-${slug}`, "RTS", Date.parse("2026-11-15T10:15:00+07:00"), "poll")
      const [first, second] = order === 0 ? [a, b] : [b, a]
      await first()
      await evictDurableObject(t.vault)
      await second()
      expect((await shipment(t.vault, slug)).status).toBe("rts_in_transit")
    }
  })

  it("custody wins: handover vs ready_for_pickup, Meja Retur vs in_transit, handback vs delivered (+conflict), local cancel blocks handover after restart", async () => {
    const t = await seedConnected("kustodi")
    const later = Date.now() + 60_000
    await addShipment(t.vault, t.tenantId, "k1k1k1k", "AWB-K1")
    await custody(t.vault, "k1k1k1k", "handed_to_courier")
    await obs(t.vault, "k1k1k1k", "k1", "PENDING PICKUP", later)
    expect((await shipment(t.vault, "k1k1k1k")).status).toBe("handed_to_courier")

    await addShipment(t.vault, t.tenantId, "k2k2k2k", "AWB-K2")
    await custody(t.vault, "k2k2k2k", "rts_at_gerai")
    await obs(t.vault, "k2k2k2k", "k2", "ON DELIVERY", later)
    expect((await shipment(t.vault, "k2k2k2k")).status).toBe("rts_at_gerai")

    await addShipment(t.vault, t.tenantId, "k3k3k3k", "AWB-K3")
    await custody(t.vault, "k3k3k3k", "rts_returned_to_sender")
    await obs(t.vault, "k3k3k3k", "k3", "DELIVERED", later)
    const k3 = await shipment(t.vault, "k3k3k3k")
    expect(k3.status).toBe("rts_returned_to_sender")
    expect(k3.provider_status_conflict_at).not.toBeNull()

    await addShipment(t.vault, t.tenantId, "k4k4k4k", "AWB-K4")
    await custody(t.vault, "k4k4k4k", "cancelled_local")
    await evictDurableObject(t.vault)
    const k4 = await shipment(t.vault, "k4k4k4k")
    expect(k4.status).toBe("cancelled")
    expect(blocksManifestHandover(k4.status)).toBe(true)
  })

  it("permutation property: random arrival orders of mixed observations and restarts give one stored status", { timeout: 60_000 }, async () => {
    const t = await seedConnected("permutasi")
    const cats = ["PENDING PICKUP", "ON DELIVERY", "UNDELIVERED", "RTS", "RETURNED", "DELIVERED", "CANCELED", "LOST"]
    const base = Date.parse("2026-11-15T09:00:00+07:00")
    for (let round = 0; round < 6; round++) {
      const seq = Array.from({ length: 5 }, (_, i) => ({ key: `r${round}-${i}`, cat: cats[crypto.getRandomValues(new Uint8Array(1))[0]! % cats.length]!, at: base + (crypto.getRandomValues(new Uint16Array(1))[0]! % 300) * 1000 }))
      const results = new Set<string>()
      for (let p = 0; p < 3; p++) {
        const slug = `p${round}${p}pppp`.slice(0, 7)
        await addShipment(t.vault, t.tenantId, slug, `AWB-${round}-${p}`)
        const order = [...seq].sort(() => (crypto.getRandomValues(new Uint8Array(1))[0]! & 1 ? 1 : -1))
        for (const [i, o] of order.entries()) {
          await obs(t.vault, slug, `${slug}-${o.key}`, o.cat, o.at)
          if (i === 2) await evictDurableObject(t.vault)
        }
        results.add((await shipment(t.vault, slug)).status)
      }
      expect(results.size, JSON.stringify(seq)).toBe(1)
    }
  })
})

describe("polling floor (PR-02b)", () => {
  it("hourly while the webhook is not active; history entries become observations; daily after activation", { timeout: 30_000 }, async () => {
    const t = await seedConnected("poll")
    await addShipment(t.vault, t.tenantId, "q1q1q1q", "JNEPOLL1")
    mockOrders.set("JNEPOLL1", { cnote_no: "JNEPOLL1", ORDER_ID: "ORD-q1q1q1q", statusCategory: "ON DELIVERY", history: [{ date: "15-11-2026 09:00", statusCategory: "PENDING PICKUP" }, { date: "15-11-2026 10:15", statusCategory: "ON DELIVERY" }] })
    const now = Date.now()
    expect(await t.vault.pollStatus(t.tenantId, now)).toEqual({ ok: true, value: { polled: 1, changed: 1, failed: 0 } })
    expect((await shipment(t.vault, "q1q1q1q")).status).toBe("in_transit")
    const timer = () => runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec<{ due_at: number }>("SELECT due_at FROM vault_timers WHERE name = 'status_poll'").toArray()[0]?.due_at)
    expect(await timer()).toBe(now + 3600_000)
    // Re-polling the same history records nothing new.
    expect(await t.vault.pollStatus(t.tenantId, now + 3600_000)).toEqual({ ok: true, value: { polled: 1, changed: 0, failed: 0 } })
    // Activate the webhook → daily reconcile.
    const { url } = await configureWebhook(t.cookie)
    await deliver(url, { cnote_no: "OTHER", status_category: "ON DELIVERY" })
    expect(await t.vault.pollStatus(t.tenantId, now + 7200_000)).toMatchObject({ ok: true })
    expect(await timer()).toBe(now + 7200_000 + 24 * 3600_000)
    // The alarm is armed for the earliest timer.
    const alarm = await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.getAlarm())
    expect(alarm).not.toBeNull()
  })

  it("a provider change missed by an active webhook marks the connection paused", async () => {
    const t = await seedConnected("jeda")
    const { url } = await configureWebhook(t.cookie)
    await deliver(url, { cnote_no: "OTHER", status_category: "ON DELIVERY" })
    await addShipment(t.vault, t.tenantId, "j1j1j1j", "JNEJEDA1")
    mockOrders.set("JNEJEDA1", { cnote_no: "JNEJEDA1", ORDER_ID: "ORD-j1j1j1j", statusCategory: "DELIVERED", history: [{ date: "01-11-2026 09:00", statusCategory: "DELIVERED" }] })
    await t.vault.pollStatus(t.tenantId)
    expect(((await (await appGet("/settings/mengantar", t.cookie)).json()) as { data: { webhookState: string } }).data.webhookState).toBe("paused")
    expect((await shipment(t.vault, "j1j1j1j")).status).toBe("delivered")
  })
})

describe("settings access", () => {
  it("cashiers cannot read the webhook settings; secrets are validated in Indonesian", async () => {
    const c = await seedConnected("kasir", { role: "cashier" })
    expect((await appGet("/settings/mengantar", c.cookie)).status).toBe(403)
    const o = await seedConnected("validasi")
    const bad = (await (await appPost("/settings/mengantar/webhook-secret", o.cookie, { secret: "ab cd" })).json()) as { error: { code: string; message: string } }
    expect(bad.error.code).toBe("INVALID_SECRET")
    const body = JSON.stringify(await (await appGet("/settings/mengantar", o.cookie)).json())
    expect(body).not.toContain("KEY-validasi")
  })
})
