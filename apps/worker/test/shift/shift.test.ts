// TASK-307 cash drawer and sender COD payout (spec 03 §1.2, §4): expected_cash = float + Σ tunai in − Σ tunai out;
// money counts in the shift where it moved; every tunai payout needs an open shift; variance needs a reason code.
import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { resetMock } from "../../src/mengantar/mock"
import { appUser } from "../onboarding/helpers"
import { appGet } from "../webhooks/helpers"
import { checkoutGerai, post, readyInv } from "../dispatch/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

type Totals = { tunaiIn: number; tunaiOut: number; voidTunai: number; codPayoutTunai: number; qris: number; transfer: number; expectedCash: number }
type View = { shift: { id: string; state: string; opening_float_idr: number; variance_idr: number | null } | null; totals: Totals | null; shifts: Array<{ id: string; cashier_user_id: string }> }
const view = async (cookie: string, path = "/shift") => ((await (await appGet(path, cookie)).json()) as { data: View }).data

async function cashier(tenantId: string, email: string) {
  const k = await appUser(email)
  await env.DB.batch([
    env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'cashier', 'active', ?)").bind(tenantId, k.id, Date.now()),
    env.DB.prepare("UPDATE sessions SET active_tenant_id = ? WHERE user_id = ?").bind(tenantId, k.id),
  ])
  return k
}

describe("shift drawer", () => {
  it("open → tunai/QRIS → void → expected cash; close with exact count; one open shift per cashier", async () => {
    const t = await checkoutGerai("shiftsatu")
    const k = await cashier(t.tenantId, "kasir.shift1@contoh.test")
    expect((await post("/shift/open", k.cookie, { openingFloatIdr: 150000 })).status).toBe(200)
    expect((await post("/shift/open", k.cookie, { openingFloatIdr: 0 })).status).toBe(409)
    const a = await readyInv(t)
    const b = await readyInv(t)
    await post(`/shipments/${a}/payment`, k.cookie, { method: "tunai", cashReceivedIdr: 20000 }, `k-${a}-1`)
    await post(`/shipments/${b}/payment`, k.cookie, { method: "qris" }, `k-${b}-1`)
    // Kasir voids within the same open shift (allowed): cash out of this drawer.
    expect((await post(`/shipments/${a}/payment`, k.cookie, { op: "void_payment", reason: "salah layanan" }, `k-${a}-2`)).status).toBe(200)
    const v = await view(k.cookie)
    expect(v.totals).toMatchObject({ tunaiIn: 15500, tunaiOut: 15500, voidTunai: 15500, qris: 15500, expectedCash: 150000 })
    const close = await post("/shift/close", k.cookie, { countedCashIdr: 150000 })
    expect(close.status).toBe(200)
    expect(((await close.json()) as { data: { variance_idr: number } }).data.variance_idr).toBe(0)
    expect((await view(k.cookie)).shift).toBeNull()
  })

  it("variance needs a reason code + note and notifies the owner", async () => {
    const t = await checkoutGerai("shiftselisih")
    const k = await cashier(t.tenantId, "kasir.shift2@contoh.test")
    await post("/shift/open", k.cookie, { openingFloatIdr: 100000 })
    const a = await readyInv(t)
    await post(`/shipments/${a}/payment`, k.cookie, { method: "tunai", cashReceivedIdr: 15500 }, `k2-${a}-1`)
    const bad = await post("/shift/close", k.cookie, { countedCashIdr: 110000 })
    expect(bad.status).toBe(422)
    expect(((await bad.json()) as { error: { code: string; message: string } }).error).toMatchObject({ code: "VARIANCE_REASON_REQUIRED", message: "Ada selisih kas. Pilih alasan dan tulis catatan sebelum menutup shift." })
    const okRes = await post("/shift/close", k.cookie, { countedCashIdr: 110000, reasonCode: "salah_kembalian", note: "kembalian lebih" })
    expect(((await okRes.json()) as { data: { variance_idr: number } }).data.variance_idr).toBe(-5500)
    const notes = ((await (await appGet("/notifications", t.cookie)).json()) as { data: { items: Array<{ title: string }> } }).data.items
    expect(notes.map((n) => n.title)).toContain("Selisih kas shift Rp 5.500 (kurang)")
    // Kasir sees only own shifts; owner sees all.
    expect((await view(k.cookie, "/shifts")).shifts.every((s) => s.cashier_user_id === k.id)).toBe(true)
    expect((await view(t.cookie, "/shifts")).shifts.length).toBeGreaterThanOrEqual(1)
  })

  it("cross-shift payment: INV created in shift A, paid in shift B → counts in B", async () => {
    const t = await checkoutGerai("shiftsilang")
    const k1 = await cashier(t.tenantId, "kasir.a@contoh.test")
    const k2 = await cashier(t.tenantId, "kasir.b@contoh.test")
    await post("/shift/open", k1.cookie, { openingFloatIdr: 0 })
    const inv = await readyInv(t)
    await post(`/shipments/${inv}/dispatch`, k1.cookie, {}) // created/issued during shift A, unpaid
    await post("/shift/close", k1.cookie, { countedCashIdr: 0 })
    await post("/shift/open", k2.cookie, { openingFloatIdr: 50000 })
    await post(`/shipments/${inv}/payment`, k2.cookie, { method: "tunai", cashReceivedIdr: 15500 }, `kb-${inv}`)
    expect((await view(k2.cookie)).totals).toMatchObject({ tunaiIn: 15500, expectedCash: 65500 })
    // Kasir A cannot void a payment taken in shift B.
    await post("/shift/open", k1.cookie, { openingFloatIdr: 0 })
    expect((await post(`/shipments/${inv}/payment`, k1.cookie, { op: "void_payment", reason: "coba" }, `ka-void-${inv}`)).status).toBe(403)
  })
})

describe("sender COD payout (spec 03 §1.2)", () => {
  async function codInv(t: Awaited<ReturnType<typeof checkoutGerai>>) {
    const slug = await readyInv(t, { mode: "sender_bears_fee", codGoodsIdr: 150000 })
    expect((await post(`/shipments/${slug}/dispatch`, t.cookie, {})).status).toBe(200)
    return slug
  }

  it("not settled → refused (owner may override with a reason); tunai works without a shift (DEC-241); partial payouts up to the payable; void puts cash back", async () => {
    const t = await checkoutGerai("payoutsatu")
    const slug = await codInv(t)
    const notSettled = await post(`/shipments/${slug}/cod-payout`, t.cookie, { amountIdr: 10000, method: "transfer" }, "po-001-xxxx")
    expect(((await notSettled.json()) as { error: { code: string } }).error.code).toBe("COD_NOT_SETTLED")
    await t.vault.setReconciledCodCredit(t.tenantId, slug, 147500)
    // DEC-241 (Shift Loket deferred): a tunai payout with no open shift is recorded without a shift, then voided back.
    const noShift = await post(`/shipments/${slug}/cod-payout`, t.cookie, { amountIdr: 10000, method: "tunai" }, "po-002-xxxx")
    expect(noShift.status).toBe(200)
    const ns = ((await noShift.json()) as { data: { receipt: { id: string; shift_id: string | null }; remaining: number } }).data
    expect(ns.receipt.shift_id).toBeNull()
    expect(ns.remaining).toBe(135000)
    expect((await post(`/shipments/${slug}/cod-payout`, t.cookie, { op: "void", receiptId: ns.receipt.id, reason: "uji tanpa shift" }, "po-002-void")).status).toBe(200)
    await post("/shift/open", t.cookie, { openingFloatIdr: 200000 })
    // sender_bears_fee: payable = G − F = 150.000 − 5.000 = 145.000.
    const p1 = await post(`/shipments/${slug}/cod-payout`, t.cookie, { amountIdr: 100000, method: "tunai" }, "po-003-xxxx")
    expect(((await p1.json()) as { data: { remaining: number } }).data.remaining).toBe(45000)
    const again = await post(`/shipments/${slug}/cod-payout`, t.cookie, { amountIdr: 100000, method: "tunai" }, "po-003-xxxx")
    expect(((await again.json()) as { data: { replayed: boolean } }).data.replayed).toBe(true)
    const over = await post(`/shipments/${slug}/cod-payout`, t.cookie, { amountIdr: 45001, method: "transfer" }, "po-004-xxxx")
    expect(over.status).toBe(422)
    const p2 = await post(`/shipments/${slug}/cod-payout`, t.cookie, { amountIdr: 45000, method: "transfer" }, "po-005-xxxx")
    expect(((await p2.json()) as { data: { remaining: number } }).data.remaining).toBe(0)
    // Transfer payouts never touch drawer totals (spec 03 §1.2): only the tunai 100.000 leaves this drawer.
    expect((await view(t.cookie)).totals).toMatchObject({ codPayoutTunai: 100000, expectedCash: 100000, transfer: 0 })
    const rid = ((await p1.json().catch(() => null)) as null) ?? null
    void rid
    const list = ((await (await appGet(`/shipments/${slug}`, t.cookie)).json()) as { data: { receipts: Array<{ id: string; event: string; method: string }> } }).data.receipts
    // The in-shift tunai payout (the shift-less one above was already voided).
    const tunaiPayout = list.find((r) => r.event === "sender_cod_payout" && r.method === "tunai" && r.id !== ns.receipt.id)!
    const v = await post(`/shipments/${slug}/cod-payout`, t.cookie, { op: "void", receiptId: tunaiPayout.id, reason: "salah nominal" }, "po-void-xxxx")
    expect(v.status).toBe(200)
    const tot = (await view(t.cookie)).totals as { codPayoutTunai: number; expectedCash: number; tunaiIn: number; voidTunai: number }
    expect(tot).toMatchObject({ codPayoutTunai: 0, expectedCash: 200000 })
    // The displayed lines add up to the drawer: Modal + Tunai masuk − Void − Pencairan COD = Seharusnya di laci.
    const opening = (await view(t.cookie)).shift as unknown as { opening_float_idr: number }
    expect(opening.opening_float_idr + tot.tunaiIn - tot.voidTunai - tot.codPayoutTunai).toBe(tot.expectedCash)
    const s = ((await (await appGet(`/shipments/${slug}`, t.cookie)).json()) as { data: { shipment: { sender_cod_paid_idr: number } } }).data.shipment
    expect(s.sender_cod_paid_idr).toBe(45000)
  })

  it("Kasir payout only when the owner allows it; never a void; owner override needs a reason", async () => {
    const t = await checkoutGerai("payoutkasir")
    const slug = await codInv(t)
    const k = await cashier(t.tenantId, "kasir.payout@contoh.test")
    await post("/shift/open", k.cookie, { openingFloatIdr: 200000 })
    expect(((await (await post(`/shipments/${slug}/cod-payout`, k.cookie, { amountIdr: 1000, method: "tunai" }, "kp-001-xxxx")).json()) as { error: { code: string } }).error.code).toBe("OWNER_ONLY")
    await t.vault.setReconciledCodCredit(t.tenantId, slug, 147500)
    await env.DB.prepare("SELECT 1").run()
    // Owner enables `Kasir boleh bayar COD` (stored in tenant_settings; TASK-310 adds the screen).
    const { runInDurableObject } = await import("cloudflare:test")
    await runInDurableObject(t.vault, (_i, s) => s.storage.sql.exec("INSERT INTO tenant_settings (tenant_id, cashier_may_pay_sender_cod, updated_at) VALUES (?, 1, ?) ON CONFLICT(tenant_id) DO UPDATE SET cashier_may_pay_sender_cod = 1", t.tenantId, Date.now()))
    const ok1 = await post(`/shipments/${slug}/cod-payout`, k.cookie, { amountIdr: 1000, method: "tunai" }, "kp-002-xxxx")
    expect(ok1.status).toBe(200)
    const rid = ((await ok1.json()) as { data: { receipt: { id: string } } }).data.receipt.id
    expect((await post(`/shipments/${slug}/cod-payout`, k.cookie, { op: "void", receiptId: rid, reason: "salah" }, "kp-003-xxxx")).status).toBe(403)
    // Owner override before settlement on another INV needs a reason.
    const other = await codInv(t)
    expect(((await (await post(`/shipments/${other}/cod-payout`, t.cookie, { amountIdr: 1000, method: "transfer", override: "x" }, "ov-001-xxxx")).json()) as { error: { code: string } }).error.code).toBe("COD_NOT_SETTLED")
    expect((await post(`/shipments/${other}/cod-payout`, t.cookie, { amountIdr: 1000, method: "transfer", override: "pelanggan langganan" }, "ov-002-xxxx")).status).toBe(200)
  })
})
