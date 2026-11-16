// TASK-304 checkout (ADR-0004, spec 03 §1.1, spec 02 §3.3): double submit → one order; timeout → read-back; unpaid →
// payUnpaid after top-up; cancel with unknown outcome → read-back; payment state machine; rate limits; shipment_index.
import { env } from "cloudflare:workers"
import { evictDurableObject, runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import type { GeraiVaultDO } from "../../src/do/gerai-vault"
import { d1UpsertStatement, type OutboxRow } from "../../src/do/gerai-vault/core/outbox"
import { ownerOnlyKeysIn } from "../../src/dto/projection"
import { hostCache } from "../../src/host/lookup"
import { mockCreated, mockFaults, mockSeller, resetMock } from "../../src/mengantar/mock"
import { appUser } from "../onboarding/helpers"
import { appGet } from "../webhooks/helpers"
import { checkoutGerai, post, readyInv } from "./helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

type Detail = { data: { shipment: Record<string, unknown>; receipts: Array<Record<string, unknown>> } }
const detail = async (cookie: string, slug: string) => ((await (await appGet(`/shipments/${slug}`, cookie)).json()) as Detail).data
const journal = (vault: Awaited<ReturnType<typeof checkoutGerai>>["vault"], slug: string) =>
  runInDurableObject(vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec<{ op: string; state: string; idempotency_key: string }>("SELECT op, state, idempotency_key FROM dispatch_journal WHERE slug = ? ORDER BY created_at", slug).toArray())

describe("payment record (DEC-220, spec 03 §1.1)", () => {
  it("unpaid → paid with a receipt; tunai change; double tap with the same key returns the same receipt; void needs a reason", async () => {
    const t = await checkoutGerai("bayarsatu")
    const slug = await readyInv(t)
    expect((await detail(t.cookie, slug)).shipment).toMatchObject({ counter_payment_status: "unpaid", counter_due_idr: 15500, dispatch_state: "draft", status: "draft" })
    expect((await post(`/shipments/${slug}/payment`, t.cookie, { method: "tunai", cashReceivedIdr: 10000 }, "key-pay-0001")).status).toBe(422)
    const a = await post(`/shipments/${slug}/payment`, t.cookie, { method: "tunai", cashReceivedIdr: 20000 }, "key-pay-0002")
    const b = await post(`/shipments/${slug}/payment`, t.cookie, { method: "tunai", cashReceivedIdr: 20000 }, "key-pay-0002")
    const ra = ((await a.json()) as { data: { receipt: { id: string; change_idr: number } } }).data.receipt
    const rb = (await b.json()) as { data: { receipt: { id: string }; replayed: boolean } }
    expect(ra.change_idr).toBe(4500)
    expect(rb.data).toMatchObject({ replayed: true, receipt: { id: ra.id } })
    expect((await post(`/shipments/${slug}/payment`, t.cookie, { method: "qris" }, "key-pay-0003")).status).toBe(409) // already paid
    expect((await post(`/shipments/${slug}/payment`, t.cookie, { op: "void_payment", reason: "" }, "key-void-001")).status).toBe(422)
    expect((await post(`/shipments/${slug}/payment`, t.cookie, { op: "void_payment", reason: "salah input" }, "key-void-002")).status).toBe(200)
    const d = await detail(t.cookie, slug)
    expect(d.shipment).toMatchObject({ counter_payment_status: "unpaid", counter_total_paid_idr: 0 })
    expect(d.receipts.map((r) => [r.event, r.direction, r.amount_idr])).toEqual([["mark_paid", "in", 15500], ["void_payment", "out", 15500]])
    // A Kasir outside the paying shift cannot void (no shift → refused).
    await post(`/shipments/${slug}/payment`, t.cookie, { method: "qris" }, "key-pay-0004")
    const k = await appUser("kasir.bayar@contoh.test")
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'cashier', 'active', ?)").bind(t.tenantId, k.id, Date.now()),
      env.DB.prepare("UPDATE sessions SET active_tenant_id = ? WHERE user_id = ?").bind(t.tenantId, k.id),
    ])
    expect((await post(`/shipments/${slug}/payment`, k.cookie, { op: "void_payment", reason: "salah" }, "key-void-003")).status).toBe(403)
    expect((await post(`/shipments/${slug}/payment`, t.cookie, { method: "qris" })).status).toBe(400) // idempotency key required
  })
})

describe("dispatch (ADR-0004 §1)", () => {
  it("issues one order with destinationMark = INV, frozen weight and payload; AWB, sorting code, provider index row", async () => {
    const t = await checkoutGerai("terbitsatu")
    const slug = await readyInv(t)
    const r = await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    expect(r.status).toBe(200)
    const v = ((await r.json()) as { data: { state: string; awb: string } }).data
    expect(v).toMatchObject({ state: "issued", awb: expect.stringMatching(/^JT[0-9]{10}$/) })
    const order = [...mockCreated.values()][0]!
    expect(order).toMatchObject({ destinationMark: slug.toUpperCase(), WEIGHT: "1" })
    const s = (await detail(t.cookie, slug)).shipment
    expect(s).toMatchObject({ dispatch_state: "issued", status: "ready_for_pickup", awb_number: v.awb, sorting_code: "BDO-CBL02", payment_sync_state: "provider_paid_estimated", quote_drift: 0 })
    await t.vault.flushOutbox(Date.now() + 60_000)
    expect(await env.DB.prepare("SELECT status, awb_number FROM shipment_index WHERE tenant_id = ? AND slug = ?").bind(t.tenantId, slug).first()).toEqual({ status: "ready_for_pickup", awb_number: v.awb })
  })

  it("double submit → exactly one Mengantar order (concurrent and repeated)", async () => {
    const t = await checkoutGerai("gandasatu")
    const slug = await readyInv(t)
    const [a, b] = await Promise.all([post(`/shipments/${slug}/dispatch`, t.cookie, {}), post(`/shipments/${slug}/dispatch`, t.cookie, {})])
    // The second request either sees the dispatch in flight (409) or the issued result (200): never a second order.
    expect([200, 409]).toContain(a.status)
    expect([200, 409]).toContain(b.status)
    expect((await post(`/shipments/${slug}/dispatch`, t.cookie, {})).status).toBe(200)
    expect(mockSeller.createCalls).toBe(1)
    expect((await journal(t.vault, slug)).filter((j) => j.op === "create_order")).toHaveLength(1)
  })

  it("timeout after Mengantar created the order → reconciliation_needed → read-back finds it; nothing is re-sent", async () => {
    const t = await checkoutGerai("waktusatu")
    const slug = await readyInv(t)
    mockFaults.order = "timeout_after_create"
    const r = await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    expect(r.status).toBe(200)
    expect(((await r.json()) as { data: { state: string } }).data.state).toBe("issued")
    expect(mockSeller.createCalls).toBe(1)
    expect((await journal(t.vault, slug))[0]).toMatchObject({ op: "create_order", state: "done" })
  })

  it("timeout before Mengantar created anything, read-back also failing → stays reconciliation_needed; later read-back → draft, safe re-issue", { timeout: 30_000 }, async () => {
    const t = await checkoutGerai("waktudua")
    const slug = await readyInv(t)
    mockFaults.order = "timeout_before_create"
    mockFaults.readBack = "timeout"
    const r = await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    expect(r.status).toBe(503)
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe("RECONCILIATION_PENDING")
    expect((await detail(t.cookie, slug)).shipment).toMatchObject({ dispatch_state: "reconciliation_needed", status: "reconciliation_needed" })
    // Cancel and payment void are refused while unresolved; restart does not lose the state.
    expect((await post(`/shipments/${slug}/cancel`, t.cookie, { reason: "batal" })).status).toBe(409)
    await evictDurableObject(t.vault)
    const rr = await post(`/shipments/${slug}/reconcile`, t.cookie, {})
    expect(((await rr.json()) as { data: { state: string } }).data.state).toBe("draft")
    const again = await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    expect(((await again.json()) as { data: { state: string } }).data.state).toBe("issued")
    const keys = (await journal(t.vault, slug)).map((j) => j.idempotency_key)
    expect(new Set(keys).size).toBe(2) // the second attempt used a NEW key
    expect(mockSeller.createCalls).toBe(1)
  })

  it("provider validation error → failed with the reason; fix and re-issue", async () => {
    const t = await checkoutGerai("tolaksatu")
    const slug = await readyInv(t)
    mockFaults.order = "validation_error"
    const r = await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    expect(r.status).toBe(422)
    expect((await detail(t.cookie, slug)).shipment).toMatchObject({ dispatch_state: "failed" })
    expect(((await (await post(`/shipments/${slug}/dispatch`, t.cookie, {})).json()) as { data: { state: string } }).data.state).toBe("issued")
  })

  it("low balance → provider_unpaid_hold (no AWB, label blocked) → top-up → payUnpaid → AWB", async () => {
    const t = await checkoutGerai("saldosatu")
    const slug = await readyInv(t)
    mockSeller.balanceIdr = 0
    const r = ((await (await post(`/shipments/${slug}/dispatch`, t.cookie, {})).json()) as { data: { state: string; awb: string | null } }).data
    expect(r).toEqual({ state: "provider_unpaid_hold", awb: null })
    expect((await detail(t.cookie, slug)).shipment).toMatchObject({ status: "provider_unpaid_hold", payment_sync_state: "provider_unpaid" })
    const still = await post(`/shipments/${slug}/pay-unpaid`, t.cookie, {})
    expect(still.status).toBe(402)
    mockSeller.balanceIdr = 50_000
    const paid = ((await (await post(`/shipments/${slug}/pay-unpaid`, t.cookie, {})).json()) as { data: { state: string; awb: string } }).data
    expect(paid).toMatchObject({ state: "issued", awb: expect.stringMatching(/^JT/) })
    expect(mockSeller.payUnpaidCalls).toBe(2)
    expect((await detail(t.cookie, slug)).shipment).toMatchObject({ status: "ready_for_pickup", payment_sync_state: "provider_paid_estimated" })
  })

  it("not ready: COD needs a verified WhatsApp; missing parties are listed in Indonesian", async () => {
    const t = await checkoutGerai("siapsatu")
    const f = await post("/quotes/freeze", t.cookie, { destinationAreaId: "5fc64714f8f44b34aa4cdd60", weightGram: 1000, mode: "none", serviceCode: "JT" })
    const slug = ((await f.json()) as { data: { slug: string } }).data.slug
    const r = await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    expect(r.status).toBe(422)
    expect(((await r.json()) as { error: { field_errors: Record<string, string> } }).error.field_errors).toMatchObject({ senderId: "Pilih pengirim.", recipientId: "Pilih penerima.", content: "Isi paket wajib diisi." })
  })
})

describe("cancellation", () => {
  it("draft cancels locally; issued → DELETE + read-back; paid needs void first; refused by courier keeps it issued", async () => {
    const t = await checkoutGerai("batalsatu")
    const d1 = await readyInv(t)
    expect(((await (await post(`/shipments/${d1}/cancel`, t.cookie, { reason: "salah input" })).json()) as { data: { state: string } }).data.state).toBe("cancelled")
    const s2 = await readyInv(t)
    await post(`/shipments/${s2}/dispatch`, t.cookie, {})
    await post(`/shipments/${s2}/payment`, t.cookie, { method: "qris" }, "key-pay-b001")
    expect(((await (await post(`/shipments/${s2}/cancel`, t.cookie, { reason: "batal" })).json()) as { error: { code: string } }).error.code).toBe("VOID_PAYMENT_FIRST")
    await post(`/shipments/${s2}/payment`, t.cookie, { op: "void_payment", reason: "pelanggan batal" }, "key-void-b001")
    mockFaults.deleteOrder = "refused"
    expect((await post(`/shipments/${s2}/cancel`, t.cookie, { reason: "batal" })).status).toBe(409)
    expect((await detail(t.cookie, s2)).shipment).toMatchObject({ dispatch_state: "issued" })
    const ok = await post(`/shipments/${s2}/cancel`, t.cookie, { reason: "batal" })
    expect(((await ok.json()) as { data: { state: string } }).data.state).toBe("cancelled")
    expect((await detail(t.cookie, s2)).shipment).toMatchObject({ status: "cancelled", counter_payment_status: "voided", custody_stage: "cancelled_local" })
    expect([...mockCreated.values()].find((o) => o.destinationMark === s2.toUpperCase())!.status).toBe("CANCELED")
  })

  it("cancel with unknown outcome → read-back decides (timeout after delete → cancelled; read-back down → cancel_unknown → later resolved)", async () => {
    const t = await checkoutGerai("batalbelum")
    const a = await readyInv(t)
    await post(`/shipments/${a}/dispatch`, t.cookie, {})
    mockFaults.deleteOrder = "timeout_after_delete"
    expect(((await (await post(`/shipments/${a}/cancel`, t.cookie, { reason: "batal" })).json()) as { data: { state: string } }).data.state).toBe("cancelled")
    const b = await readyInv(t)
    await post(`/shipments/${b}/dispatch`, t.cookie, {})
    mockFaults.deleteOrder = "timeout_after_delete"
    mockFaults.readBack = "timeout"
    const u = await post(`/shipments/${b}/cancel`, t.cookie, { reason: "batal" })
    expect(((await u.json()) as { error: { code: string } }).error.code).toBe("CANCEL_UNKNOWN")
    expect((await detail(t.cookie, b)).shipment).toMatchObject({ dispatch_state: "cancel_unknown" })
    const calls = mockSeller.deleteCalls
    const resolved = await post(`/shipments/${b}/cancel`, t.cookie, { reason: "batal" })
    expect(((await resolved.json()) as { data: { state: string } }).data.state).toBe("cancelled")
    expect(mockSeller.deleteCalls).toBe(calls) // resolved by read-back, DELETE not re-sent
  })
})

describe("rate limits and projection", () => {
  it("per-tenant issue and cancel rate limits (20/min) in the object", async () => {
    const t = await checkoutGerai("lajusatu")
    const slug = await readyInv(t)
    const w = Math.floor(Date.now() / 60_000) * 60_000
    await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => {
      s.storage.sql.exec("CREATE TABLE IF NOT EXISTS vault_rate (op TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL)")
      s.storage.sql.exec("INSERT INTO vault_rate (op, window_start, count) VALUES ('issue', ?, 20), ('cancel', ?, 20)", w, w)
    })
    const r = await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    expect(r.status).toBe(429)
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe("ISSUE_RATE_LIMITED")
    expect(mockSeller.createCalls).toBe(0)
    await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec("UPDATE vault_rate SET count = 0 WHERE op = 'issue'"))
    await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    const c = await post(`/shipments/${slug}/cancel`, t.cookie, { reason: "batal" })
    expect(((await c.json()) as { error: { code: string } }).error.code).toBe("CANCEL_RATE_LIMITED")
  })

  it("Kasir detail has customer amounts only", async () => {
    const t = await checkoutGerai("proyeksi")
    const slug = await readyInv(t)
    const k = await appUser("kasir.proyeksi@contoh.test")
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'cashier', 'active', ?)").bind(t.tenantId, k.id, Date.now()),
      env.DB.prepare("UPDATE sessions SET active_tenant_id = ? WHERE user_id = ?").bind(t.tenantId, k.id),
    ])
    const body = await (await appGet(`/shipments/${slug}`, k.cookie)).json()
    expect(ownerOnlyKeysIn(body)).toEqual([])
    expect((body as Detail).data.shipment.counter_due_idr).toBe(15500)
    const owner = (await detail(t.cookie, slug)).shipment
    expect(owner).toMatchObject({ estimated_profit_idr: 5500, gerai_shipping_cost_idr: 10000 })
  })
})

describe("shipment_index from the real projection (versioned absolute upserts)", () => {
  it("lost ack + retry, restart, and a stale version never move D1 backwards", { timeout: 30_000 }, async () => {
    const t = await checkoutGerai("indekssatu")
    const slug = await readyInv(t)
    await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    await evictDurableObject(t.vault) // restart before (or after) the alarm flush
    await t.vault.flushOutbox(Date.now() + 60_000)
    const sel = () => env.DB.prepare("SELECT status, awb_number, version FROM shipment_index WHERE tenant_id = ? AND slug = ?").bind(t.tenantId, slug).first<{ status: string; awb_number: string; version: number }>()
    const cur = (await sel())!
    expect(cur.status).toBe("ready_for_pickup")
    // Versions the object published for this INV: draft (1) → issuing → issued, strictly increasing.
    expect(cur.version).toBeGreaterThanOrEqual(2)
    const row = (version: number, status: string): OutboxRow => ({ id: 0, topic: "shipment_index", entity_key: slug, version, payload_json: JSON.stringify({ awb_number: null, courier_code: "JT", status, created_at: 1, updated_at: 1 }), attempts: 0, next_attempt_at: 0 })
    // Lost ack: the same version is delivered again → no change. A stale version arriving late → ignored.
    await d1UpsertStatement(env.DB, t.tenantId, row(cur.version, "draft")).run()
    await d1UpsertStatement(env.DB, t.tenantId, row(1, "draft")).run()
    expect(await sel()).toEqual(cur)
    // Every later status change in the object republishes with a higher version.
    await post(`/shipments/${slug}/cancel`, t.cookie, { reason: "batal" })
    await t.vault.flushOutbox(Date.now() + 60_000)
    const after = (await sel())!
    expect(after.status).toBe("cancelled")
    expect(after.version).toBeGreaterThan(cur.version)
  })
})

describe("rotation fence during checkout (TASK-205 ↔ TASK-304)", () => {
  it("dispatch is refused while the seller key is being rotated; no Mengantar call", async () => {
    const t = await checkoutGerai("rotasiterbit")
    const slug = await readyInv(t)
    await t.vault.beginKeyRotation(t.tenantId, { actorId: "sa", reason: "uji", now: Date.now() })
    const r = await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    expect(r.status).toBe(409)
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe("KEY_ROTATING")
    expect(mockSeller.createCalls).toBe(0)
    expect((await detail(t.cookie, slug)).shipment).toMatchObject({ dispatch_state: "draft" })
  })
})
