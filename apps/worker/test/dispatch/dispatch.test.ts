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
import { checkoutGerai, DEST, ORIGIN, post, readyInv } from "./helpers"

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

describe("review fixes (final Carbon pass)", () => {
  it("cancel_unknown + read-back shows the order still active → back to issued (not wedged); printing works again", async () => {
    const t = await checkoutGerai("batalmacet")
    const slug = await readyInv(t)
    await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    mockFaults.deleteOrder = "timeout_before_delete"
    mockFaults.readBack = "timeout"
    expect(((await (await post(`/shipments/${slug}/cancel`, t.cookie, { reason: "batal" })).json()) as { error: { code: string } }).error.code).toBe("CANCEL_UNKNOWN")
    expect((await detail(t.cookie, slug)).shipment).toMatchObject({ dispatch_state: "cancel_unknown" })
    // Connectivity back; DELETE never applied: the read-back finds an active order → issued, cancel refused cleanly.
    const r = await post(`/shipments/${slug}/cancel`, t.cookie, { reason: "batal" })
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe("CANCEL_REFUSED")
    expect((await detail(t.cookie, slug)).shipment).toMatchObject({ dispatch_state: "issued" })
  })

  it("reconcile only acts on reconciliation_needed: an issued shipment is untouched", async () => {
    const t = await checkoutGerai("rekonaman")
    const slug = await readyInv(t)
    await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    const before = (await detail(t.cookie, slug)).shipment as { issued_at: number; dispatch_state: string }
    const r = await post(`/shipments/${slug}/reconcile`, t.cookie, {})
    expect(((await r.json()) as { data: { state: string } }).data.state).toBe("issued")
    expect(((await detail(t.cookie, slug)).shipment as { issued_at: number }).issued_at).toBe(before.issued_at)
  })

  it("pay-unpaid after an unknown outcome reads back first instead of paying again", async () => {
    const t = await checkoutGerai("bayarbelum")
    const slug = await readyInv(t)
    mockSeller.balanceIdr = 0
    await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    mockSeller.balanceIdr = 50_000
    // Seed an unresolved previous attempt (timeout on pay + read-back).
    await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec("INSERT INTO dispatch_journal (idempotency_key, slug, op, state, created_at, updated_at) VALUES ('gx-pay-prev', ?, 'pay_unpaid', 'unknown', 1, 1)", slug))
    const calls = mockSeller.payUnpaidCalls
    const r = await post(`/shipments/${slug}/pay-unpaid`, t.cookie, {})
    expect(r.status).toBe(409) // read back: still unpaid, nothing paid blindly
    expect(mockSeller.payUnpaidCalls).toBe(calls)
    // The read-back settled the old attempt; the next click may pay.
    const paid = await post(`/shipments/${slug}/pay-unpaid`, t.cookie, {})
    expect(((await paid.json()) as { data: { state: string } }).data.state).toBe("issued")
    expect(mockSeller.payUnpaidCalls).toBe(calls + 1)
  })
})

describe("pay-unpaid batch fence (Sol delta B-1 / C-1)", () => {
  async function twoHeldInOneBatch(name: string) {
    const t = await checkoutGerai(name)
    mockSeller.balanceIdr = 0
    const a = await readyInv(t)
    const b = await readyInv(t)
    await post(`/shipments/${a}/dispatch`, t.cookie, {})
    await post(`/shipments/${b}/dispatch`, t.cookie, {})
    // Put both INVs into A's Mengantar batch (pay-unpaid settles the whole batch at once).
    const batch = await runInDurableObject(t.vault, (_i: GeraiVaultDO, st) => {
      const ba = st.storage.sql.exec<{ id: string; code: string }>("SELECT mengantar_batch_object_id AS id, mengantar_order_code AS code FROM shipments WHERE slug = ?", a).one()
      const bb = st.storage.sql.exec<{ code: string }>("SELECT mengantar_order_code AS code FROM shipments WHERE slug = ?", b).one()
      st.storage.sql.exec("UPDATE shipments SET mengantar_batch_object_id = ? WHERE slug = ?", ba.id, b)
      return { id: ba.id, codeB: bb.code }
    })
    mockCreated.get(batch.codeB)!.batch_id = batch.id
    return { t, a, b, batch }
  }

  it("an unknown attempt through INV A stops INV B of the same batch from paying again", async () => {
    const { t, a, b } = await twoHeldInOneBatch("pagarbatch")
    mockSeller.balanceIdr = 100_000
    await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec("INSERT INTO dispatch_journal (idempotency_key, slug, op, state, request_json, created_at, updated_at) VALUES ('gx-pay-a-prev', ?, 'pay_unpaid', 'unknown', '{}', 1, 1)", a))
    const calls = mockSeller.payUnpaidCalls
    expect((await post(`/shipments/${b}/pay-unpaid`, t.cookie, {})).status).toBe(409)
    expect(mockSeller.payUnpaidCalls).toBe(calls)
    // Read back cleanly (still unpaid) settled A's old attempt too: now one payment issues both.
    expect((await post(`/shipments/${b}/pay-unpaid`, t.cookie, {})).status).toBe(200)
    expect(mockSeller.payUnpaidCalls).toBe(calls + 1)
    expect((await detail(t.cookie, a)).shipment).toMatchObject({ dispatch_state: "issued" })
  })

  it("paid through A with B unreadable: a later call through B never clears the fence or pays again (Sol R2 #1)", async () => {
    const { t, a, b, batch } = await twoHeldInOneBatch("pagarterbayar")
    mockSeller.balanceIdr = 100_000
    mockFaults.readBackFailFor = new Set([batch.codeB])
    const calls = mockSeller.payUnpaidCalls
    expect((await post(`/shipments/${a}/pay-unpaid`, t.cookie, {})).status).toBe(200)
    expect(mockSeller.payUnpaidCalls).toBe(calls + 1)
    // B is still held locally. Even if Mengantar briefly shows B unpaid (lagging view) while A is issued from the same
    // batch, a call through B stays read-back-only and never pays the batch again.
    mockFaults.readBackFailFor = undefined
    const ob = mockCreated.get(batch.codeB)!
    const saved = { isPaid: ob.isPaid, cnote_no: ob.cnote_no, status: ob.status }
    Object.assign(ob, { isPaid: false, cnote_no: null, status: "UNPAID" })
    expect((await post(`/shipments/${b}/pay-unpaid`, t.cookie, {})).status).toBe(409)
    expect((await post(`/shipments/${b}/pay-unpaid`, t.cookie, {})).status).toBe(409)
    expect(mockSeller.payUnpaidCalls).toBe(calls + 1)
    Object.assign(ob, saved)
    // Once B reads back, it is recorded issued without another payment.
    mockFaults.readBackFailFor = undefined
    expect((await post(`/shipments/${b}/pay-unpaid`, t.cookie, {})).status).toBe(200)
    expect(mockSeller.payUnpaidCalls).toBe(calls + 1)
  })

  it("paid through A while B reads back WITHOUT an AWB (lagging): the fence stays, B never pays again (Sol R3 #1)", async () => {
    const { t, a, b, batch } = await twoHeldInOneBatch("pagarlambat")
    mockSeller.balanceIdr = 100_000
    const calls = mockSeller.payUnpaidCalls
    // Mengantar pays both, but B's order view lags (readable, still unpaid) during A's call and right after it.
    mockFaults.readBackLagFor = new Set([batch.codeB])
    expect((await post(`/shipments/${a}/pay-unpaid`, t.cookie, {})).status).toBe(200)
    expect((await post(`/shipments/${b}/pay-unpaid`, t.cookie, {})).status).toBe(409)
    expect((await post(`/shipments/${b}/pay-unpaid`, t.cookie, {})).status).toBe(409)
    expect(mockSeller.payUnpaidCalls).toBe(calls + 1)
    // Once Mengantar's view catches up, B is recorded issued without another payment.
    mockFaults.readBackLagFor = undefined
    expect((await post(`/shipments/${b}/pay-unpaid`, t.cookie, {})).status).toBe(200)
    expect(mockSeller.payUnpaidCalls).toBe(calls + 1)
  })

  it("two concurrent pay-unpaid calls for sibling INVs pay the batch once", async () => {
    const { t, a, b } = await twoHeldInOneBatch("pagarserentak")
    mockSeller.balanceIdr = 100_000
    const calls = mockSeller.payUnpaidCalls
    const [ra, rb] = await Promise.all([post(`/shipments/${a}/pay-unpaid`, t.cookie, {}), post(`/shipments/${b}/pay-unpaid`, t.cookie, {})])
    expect([ra.status, rb.status].sort()).toEqual([200, 409])
    expect(mockSeller.payUnpaidCalls).toBe(calls + 1)
  })
})

describe("status projection around issue (final Carbon pass, M2B #2)", () => {
  it("a provider observation during unpaid hold does not turn it into ready_for_pickup; issue then projects it", async () => {
    const { recordProviderObservation } = await import("../../src/do/gerai-vault/status")
    const t = await checkoutGerai("tahanstatus")
    const slug = await readyInv(t)
    mockSeller.balanceIdr = 0
    await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => recordProviderObservation(s.storage.sql, { slug, eventKey: `obs-${slug}`, source: "webhook", rawCategory: "PENDING PICKUP", mapped: "ready_for_pickup", eventAt: Date.now(), eventAtText: null }, Date.now()))
    expect((await detail(t.cookie, slug)).shipment).toMatchObject({ status: "provider_unpaid_hold", dispatch_state: "provider_unpaid_hold" })
    mockSeller.balanceIdr = 100_000
    await post(`/shipments/${slug}/pay-unpaid`, t.cookie, {})
    expect((await detail(t.cookie, slug)).shipment).toMatchObject({ status: "ready_for_pickup", dispatch_state: "issued" })
  })
})

describe("re-quote of an INV (final Carbon pass, M5 #2)", () => {
  it("re-freezing an unpaid draft moves the draft to the new quote; after payment the INV is locked", async () => {
    const t = await checkoutGerai("ubahtarif")
    const slug = await readyInv(t)
    const first = (await detail(t.cookie, slug)).shipment as { counter_due_idr: number; actual_weight_gram: number }
    const { frozenFrom, parseQuoteInput, runQuote } = await import("../../src/pricing/quote/service")
    const q = await runQuote(env, t.tenantId, parseQuoteInput({ destinationAreaId: DEST, weightGram: 3000, mode: "none" }, "5fc62f5df8f44b34aa4c0d8c"), Date.now())
    const card = q.cards.find((c) => c.serviceCode === "JT" && c.available)!
    expect((await t.vault.freezeQuote(t.tenantId, frozenFrom(slug, q, card))).ok).toBe(true)
    const moved = (await detail(t.cookie, slug)).shipment as { counter_due_idr: number; actual_weight_gram: number }
    expect(moved.actual_weight_gram).toBe(3000)
    expect(moved.counter_due_idr).toBeGreaterThan(first.counter_due_idr)
    await post(`/shipments/${slug}/payment`, t.cookie, { method: "qris" }, `rq-${slug}`)
    expect(await t.vault.freezeQuote(t.tenantId, frozenFrom(slug, q, card))).toMatchObject({ ok: false, refused: "SHIPMENT_LOCKED" })
  })

  it("an older quote that finishes freezing last never becomes the dispatched quote (Sol delta B-2)", async () => {
    const t = await checkoutGerai("urutantarif")
    const slug = await readyInv(t)
    const { frozenFrom, parseQuoteInput, runQuote } = await import("../../src/pricing/quote/service")
    const at = Date.now()
    const qOld = await runQuote(env, t.tenantId, parseQuoteInput({ destinationAreaId: DEST, weightGram: 2000, mode: "none" }, ORIGIN), at)
    const qNew = await runQuote(env, t.tenantId, parseQuoteInput({ destinationAreaId: DEST, weightGram: 3000, mode: "none" }, ORIGIN), at + 1000)
    const pick = (q: typeof qOld) => q.cards.find((c) => c.serviceCode === "JT" && c.available)!
    // The newer quote (3 kg) commits first, the older one (2 kg) last: the shipment follows the last commit and dispatch
    // must use exactly that bound quote, never "newest quoted_at".
    expect((await t.vault.freezeQuote(t.tenantId, frozenFrom(slug, qNew, pick(qNew)))).ok).toBe(true)
    expect((await t.vault.freezeQuote(t.tenantId, frozenFrom(slug, qOld, pick(qOld)))).ok).toBe(true)
    const d = (await detail(t.cookie, slug)) as unknown as { shipment: { actual_weight_gram: number; counter_due_idr: number }; quote: { actual_weight_gram: number; counter_due_idr: number } }
    expect(d.shipment.actual_weight_gram).toBe(2000)
    expect(d.quote.actual_weight_gram).toBe(2000)
    expect(d.quote.counter_due_idr).toBe(d.shipment.counter_due_idr)
  })

  it("a re-quote while dispatch awaits pickup registration is refused; the journaled order matches the shipment (Sol delta B-3)", async () => {
    const { mockFaults } = await import("../../src/mengantar/mock")
    const t = await checkoutGerai("tarifbalap")
    const slug = await readyInv(t)
    let open!: () => void
    mockFaults.addressGate = new Promise<void>((r) => (open = r))
    const dispatching = post(`/shipments/${slug}/dispatch`, t.cookie, {})
    await new Promise((r) => setTimeout(r, 50))
    const { frozenFrom, parseQuoteInput, runQuote } = await import("../../src/pricing/quote/service")
    const q = await runQuote(env, t.tenantId, parseQuoteInput({ destinationAreaId: DEST, weightGram: 3000, mode: "none" }, ORIGIN), Date.now())
    const card = q.cards.find((c) => c.serviceCode === "JT" && c.available)!
    expect(await t.vault.freezeQuote(t.tenantId, frozenFrom(slug, q, card))).toMatchObject({ ok: false, refused: "SHIPMENT_LOCKED" })
    open()
    expect((await dispatching).status).toBe(200)
    const d = (await detail(t.cookie, slug)) as unknown as { shipment: { actual_weight_gram: number; dispatch_state: string } }
    expect(d.shipment).toMatchObject({ actual_weight_gram: 1000, dispatch_state: "issued" })
    const sent = await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => JSON.parse(s.storage.sql.exec<{ request_json: string }>("SELECT request_json FROM dispatch_journal WHERE slug = ? AND op = 'create_order'", slug).one().request_json) as { orders: Array<{ weight: number }> })
    expect(sent.orders[0]!.weight).toBe(1)
  })
})

describe("rate limits and projection", () => {
  it("per-tenant issue and cancel rate limits (20/min) in the object", async () => {
    const t = await checkoutGerai("lajusatu")
    const slug = await readyInv(t)
    // The window is the wall-clock minute: start with ≥ 10 s left so the seeded window cannot roll over mid-test.
    if (Date.now() % 60_000 > 50_000) await new Promise((r) => setTimeout(r, 60_000 - (Date.now() % 60_000) + 50))
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
    // Re-seed the cancel window for the current minute (the dispatch above may have taken a few seconds).
    const w2 = Math.floor(Date.now() / 60_000) * 60_000
    await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec("UPDATE vault_rate SET window_start = ?, count = 20 WHERE op = 'cancel'", w2))
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
