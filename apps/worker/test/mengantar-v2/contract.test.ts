// DEC-238 Mengantar Public API Sandbox v2.0.0 parity, end to end through the app API, the tenant object and the
// deterministic mock (which enforces the v2.0.0 create-order body rules): scheduledPickup time_id + volume, J&T ECO,
// SAP key normalisation, courier limits, Pos COD 82 % guard, goodsValue / quantity / deliveryInstruction / DG,
// discountExtra in the observed discount, receiver score cache, dropshipper sync, sandbox status simulation.
import { env } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import type { GeraiVaultDO } from "../../src/do/gerai-vault"
import { hostCache } from "../../src/host/lookup"
import { mockCreated, mockDiscountExtraBps, mockFaults, mockLog, mockUnsupported, resetMock } from "../../src/mengantar/mock"
import { appGet, appPost } from "../webhooks/helpers"
import { checkoutGerai, DEST, post, readyInv } from "../dispatch/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

type Card = { serviceCode: string; available: boolean; unavailableReason: string | null; codCollectionTotalIdr: number; observedBps?: number | null }
const quote = async (cookie: string, b: Record<string, unknown>) => {
  const r = await appPost("/quotes", cookie, { destinationAreaId: DEST, weightGram: 1000, ...b })
  expect(r.status).toBe(200)
  return ((await r.json()) as { data: { cards: Card[] } }).data.cards
}
const card = (cards: Card[], code: string) => cards.find((c) => c.serviceCode === code)
const sentOrder = () => mockLog.filter((l) => l.path === "/order" && l.method === "POST").at(-1)!.body as { courier: string; pickup: Record<string, unknown>; orders: Array<Record<string, unknown>> }
const dispatch = async (t: Awaited<ReturnType<typeof checkoutGerai>>, slug: string) => {
  const r = await post(`/shipments/${slug}/dispatch`, t.cookie, {})
  return { status: r.status, body: (await r.json()) as { data?: { state: string; awb: string | null }; error?: { code: string; message: string } } }
}

describe("create-order v2.0.0 body", () => {
  it("scheduledPickup reserves a POST /time slot (MM-DD-YYYY, HH:00, ≥ 120 min ahead) and reuses it; volume from billable weight", async () => {
    const t = await checkoutGerai("jemputv2")
    const a = await readyInv(t)
    expect((await dispatch(t, a)).body.data).toMatchObject({ state: "issued" })
    const first = sentOrder()
    expect(first.pickup).toMatchObject({ type: "scheduledPickup", volume: "volumeMotor", time_id: expect.stringMatching(/^[0-9a-f]{24}$/) })
    const time = mockLog.find((l) => l.path === "/time")!.body
    expect(time).toMatchObject({ date: expect.stringMatching(/^\d{2}-\d{2}-\d{4}$/), time: expect.stringMatching(/^(09|1\d|20):00$/) })
    const address = mockLog.find((l) => l.path === "/address" && l.method === "POST")!.body
    expect(address).toMatchObject({ PICKUP_PIC: expect.any(String), PICKUP_PIC_PHONE: "081200000000" })
    expect(address).not.toHaveProperty("PICKUP_PHONE")
    // Second INV: same slot reused (one POST /time), heavier parcel books a car.
    const b = await readyInv(t, { weightGram: 25_000 })
    expect((await dispatch(t, b)).body.data).toMatchObject({ state: "issued" })
    expect(mockLog.filter((l) => l.path === "/time")).toHaveLength(1)
    expect(sentOrder().pickup).toMatchObject({ time_id: first.pickup.time_id, volume: "volumeMobil" })
  })

  it("dropOff sends neither time_id nor volume", async () => {
    const t = await checkoutGerai("agenv2")
    expect((await appPost("/settings/couriers/JT", t.cookie, { pickupMode: "drop_off_only" })).status).toBe(200)
    const slug = await readyInv(t)
    expect((await dispatch(t, slug)).body.data).toMatchObject({ state: "issued" })
    expect(sentOrder().pickup).toEqual({ type: "dropOff", address_id: expect.any(String) })
    expect(mockLog.some((l) => l.path === "/time")).toBe(false)
  })

  it("non-COD sends the declared goodsValue, quantity and deliveryInstruction; J&T ECO books courier JT + eco: true", async () => {
    const t = await checkoutGerai("ecov2")
    const slug = await readyInv(t, { serviceCode: "JTEco", declaredValueIdr: 250_000 })
    const p = await post(`/shipments/${slug}/parties`, t.cookie, { quantity: 3, deliveryInstruction: "  Titip   satpam  " })
    expect(p.status).toBe(200)
    expect((await dispatch(t, slug)).body.data).toMatchObject({ state: "issued" })
    const o = sentOrder()
    expect(o.courier).toBe("JT")
    expect(o.orders[0]).toMatchObject({ goodsValue: 250_000, quantity: 3, deliveryInstruction: "Titip satpam", eco: true })
    expect(o.orders[0]).not.toHaveProperty("COD")
    expect((await post(`/shipments/${slug}/parties`, t.cookie, { quantity: 0 })).status).toBe(409) // issued: locked
    const fresh = await readyInv(t)
    expect((await post(`/shipments/${fresh}/parties`, t.cookie, { quantity: 0 })).status).toBe(422)
    expect((await post(`/shipments/${fresh}/parties`, t.cookie, { deliveryInstruction: "x".repeat(121) })).status).toBe(422)
  })

  it("JTEco absent from the estimate (route without ECO) is shown unavailable with an ECO reason", async () => {
    const t = await checkoutGerai("tanpaeco")
    mockUnsupported.add("JTEco")
    expect(card(await quote(t.cookie, { mode: "none" }), "JTEco")).toMatchObject({ available: false, unavailableReason: "J&T ECO tidak tersedia untuk rute ini." })
  })

  it("dangerous goods: only SiCepat and iDexpress regular are offered; the order carries isDangerousGoods: true", async () => {
    const t = await checkoutGerai("dgv2")
    const cards = await quote(t.cookie, { mode: "none", dangerousGoods: true })
    expect(cards.filter((c) => c.available).map((c) => c.serviceCode).sort()).toEqual(["SiCepat", "iDexpress"])
    expect(card(cards, "JT")).toMatchObject({ available: false, unavailableReason: "Barang berbahaya hanya lewat SiCepat (HALU) atau iDexpress." })
    expect(mockLog.find((l) => l.path === "/order/estimate")).toBeTruthy()
    const slug = await readyInv(t, { serviceCode: "SiCepat", dangerousGoods: true })
    expect((await dispatch(t, slug)).body.data).toMatchObject({ state: "issued" })
    expect(sentOrder().orders[0]).toMatchObject({ isDangerousGoods: true })
    expect((await appPost("/quotes", t.cookie, { destinationAreaId: DEST, dangerousGoods: "ya" })).status).toBe(422)
  })
})

describe("estimate keys and courier limits (check-shipping-fee v2.0.0)", () => {
  it("SAP (uppercase key) prices the Sap service; SAPLite stays off; discountExtra counts in the observed discount", async () => {
    const t = await checkoutGerai("sapv2")
    mockDiscountExtraBps.set("SAP", 500)
    const cards = await quote(t.cookie, { mode: "none" })
    expect(card(cards, "Sap")).toMatchObject({ available: true, observedBps: 2500 })
    expect(card(cards, "SAPLite")).toBeUndefined()
    const rule = await env.DB.prepare("SELECT observed_bps FROM tenant_discount_rules WHERE tenant_id = ? AND service_code = 'Sap'").bind(t.tenantId).first<{ observed_bps: number }>()
    expect(rule?.observed_bps).toBe(2500)
  })

  it("COD caps: Pos / Anteraja / SAP above Rp2.000.000 and others above Rp5.000.000 are unavailable before dispatch", async () => {
    const t = await checkoutGerai("batascod")
    const cards = await quote(t.cookie, { mode: "buyer_bears_fee", codGoodsIdr: 2_500_000 })
    for (const code of ["pos", "anteraja", "Sap"]) expect(card(cards, code)).toMatchObject({ available: false, unavailableReason: "Total COD maksimal Rp2.000.000 untuk kurir ini." })
    expect(card(cards, "JT")).toMatchObject({ available: true })
  })

  it("non-COD goods value bounds for anteraja/pos/spx (Rp1.000–Rp10.000.000) and the 50 kg cap", async () => {
    const t = await checkoutGerai("nilaibrg")
    const none = await quote(t.cookie, { mode: "none" })
    expect(card(none, "pos")).toMatchObject({ available: false, unavailableReason: "Isi Nilai Barang minimal Rp1.000 untuk kurir ini." })
    expect(card(none, "JT")).toMatchObject({ available: true })
    const ok = await quote(t.cookie, { mode: "none", declaredValueIdr: 150_000 })
    expect(card(ok, "pos")).toMatchObject({ available: true })
    const heavy = await quote(t.cookie, { mode: "none", declaredValueIdr: 150_000, weightGram: 60_000 })
    expect(card(heavy, "spx")).toMatchObject({ available: false, unavailableReason: "Maksimal 50 kg untuk layanan ini." })
    expect((await appPost("/quotes", t.cookie, { destinationAreaId: DEST, declaredValueIdr: 10_000_001 })).status).toBe(422)
  })
})

describe("Pos Indonesia (create-order v2.0.0)", () => {
  it("scheduled Pos pickup needs outlet coordinates; with them the address carries pinpointData", async () => {
    const t = await checkoutGerai("posjemput")
    const slug = await readyInv(t, { serviceCode: "pos", declaredValueIdr: 100_000 })
    const r = await dispatch(t, slug)
    expect(r.status).toBe(409)
    expect(r.body.error).toMatchObject({ code: "PICKUP_PINPOINT_REQUIRED", message: expect.stringContaining("Pengaturan › Profil Gerai") })
    expect(mockLog.some((l) => l.path === "/order" && l.method === "POST")).toBe(false)
    await t.vault.upsertDefaultOutlet(t.tenantId, { name: "posjemput", areaId: "5fc62f5df8f44b34aa4c0d8c", street: "Jl. Dago No. 1", latitude: -6.9456, longitude: 107.5703 })
    expect((await dispatch(t, slug)).body.data).toMatchObject({ state: "issued" })
    expect(mockLog.filter((l) => l.path === "/address").at(-1)!.body).toMatchObject({ pinpointData: { lat: -6.9456, lng: 107.5703 } })
  })

  it("a 403 COD refusal (status blocked) explains 82 % and hides COD Pos for 24 h; non-COD Pos stays available", async () => {
    const t = await checkoutGerai("poscod")
    await t.vault.upsertDefaultOutlet(t.tenantId, { name: "poscod", areaId: "5fc62f5df8f44b34aa4c0d8c", street: "Jl. Dago No. 1", latitude: -6.9, longitude: 107.6 })
    mockFaults.posCod = "blocked"
    const slug = await readyInv(t, { serviceCode: "pos", mode: "buyer_bears_fee", codGoodsIdr: 100_000 })
    const r = await dispatch(t, slug)
    expect(r.status).toBe(422)
    expect(r.body.error).toMatchObject({ code: "POS_COD_NOT_ELIGIBLE", message: expect.stringContaining("Tingkat terkirim akun 70% (minimal 82%)") })
    const cod = await quote(t.cookie, { mode: "buyer_bears_fee", codGoodsIdr: 100_000 })
    expect(card(cod, "pos")).toMatchObject({ available: false, unavailableReason: expect.stringContaining("COD Pos Indonesia diblokir") })
    expect(card(await quote(t.cookie, { mode: "none", declaredValueIdr: 100_000 }), "pos")).toMatchObject({ available: true })
    const pref = await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec("SELECT cod_blocked_status, cod_delivered_rate FROM tenant_courier_prefs WHERE courier_code = 'pos'").one())
    expect(pref).toEqual({ cod_blocked_status: "blocked", cod_delivered_rate: 70 })
  })
})

describe("receiver score, dropshipper and simulation", () => {
  it("receiver score: parsed grade with ≈, 24 h cache, 403 cached as forbidden", async () => {
    const t = await checkoutGerai("skorv2")
    const get = async (phone: string) => ((await (await appGet(`/contacts/receiver-score?phone=${phone}`, t.cookie)).json()) as { data: Record<string, unknown> }).data
    expect(await get("081234567891")).toMatchObject({ state: "ok", grade: expect.stringMatching(/^[A-E]-?$/), approximate: true, total: 10 })
    expect(await get("081234567891")).toMatchObject({ state: "ok" })
    expect(mockLog.filter((l) => l.path === "/getReceiverScoreByNumberUser")).toHaveLength(1)
    expect(await get("081234567890")).toMatchObject({ state: "ok", grade: null, total: 0 })
    mockFaults.receiverScore = 403
    expect(await get("081234567892")).toEqual({ state: "forbidden" })
    delete mockFaults.receiverScore
    expect(await get("081234567892")).toEqual({ state: "forbidden" })
    expect(await get("12")).toEqual({ state: "invalid" })
  })

  it("dropshipper sync (opt-in) sends the saved brand on a masked send; a 403 falls back to the local label", async () => {
    const t = await checkoutGerai("dropv2")
    await env.DB.prepare("UPDATE tenants SET masking_enabled = 1 WHERE id = ?").bind(t.tenantId).run()
    expect((await appPost("/settings/masking", t.cookie, { offered: true, presetsEnabled: ["dropship_toko"], defaultPreset: "standar_gerai", dropshipperSync: true })).status).toBe(200)
    await appPost(`/contacts/senders/${t.sender}`, t.cookie, { name: "Ibu Siti", phone: "081234567890", senderKind: "reseller_dropship", brandName: "Toko Siti", brandPhone: "081299990000" })
    const slug = await readyInv(t)
    expect((await post(`/shipments/${slug}/parties`, t.cookie, { maskPreset: "dropship_toko" })).status).toBe(200)
    expect((await dispatch(t, slug)).body.data).toMatchObject({ state: "issued" })
    expect(sentOrder().orders[0]!.dropShipper).toMatchObject({ id: expect.any(String), name: "Toko Siti", phone: "081299990000" })
    mockFaults.dropshipperDisabled = true
    await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec("UPDATE sender_contacts SET mengantar_dropshipper_id = NULL"))
    const again = await readyInv(t)
    await post(`/shipments/${again}/parties`, t.cookie, { maskPreset: "dropship_toko" })
    expect((await dispatch(t, again)).body.data).toMatchObject({ state: "issued" })
    expect(sentOrder().orders[0]).not.toHaveProperty("dropShipper")
    const s = (await (await appGet("/settings/masking", t.cookie)).json()) as { data: { dropshipperState: string } }
    expect(s.data.dropshipperState).toBe("disabled")
  })

  it("sandbox status simulation moves an issued INV (owner only) and is closed in production", async () => {
    const t = await checkoutGerai("simv2")
    const slug = await readyInv(t)
    await dispatch(t, slug)
    const r = await appPost("/dev/simulate-status", t.cookie, { slug, status: "DELIVERED" })
    expect(r.status).toBe(200)
    expect([...mockCreated.values()][0]!.statusCategory).toBe("DELIVERED")
    expect(((await (await appGet(`/shipments/${slug}`, t.cookie)).json()) as { data: { shipment: { status: string } } }).data.shipment.status).toBe("delivered")
    expect((await appPost("/dev/simulate-status", t.cookie, { slug, status: "LOST" })).status).toBe(422)
  })
})

describe("pickup pinpoint (Profil Gerai, /daftar)", () => {
  it("profile saves latitude/longitude (both or neither, ranges) and a moved pinpoint re-registers the address", async () => {
    const t = await checkoutGerai("titikv2")
    const base = { name: "Gerai Titik", areaId: "5fc62f5df8f44b34aa4c0d8c", areaLabel: "Dago", street: "Jl. Dago No. 1" }
    const bad = async (b: Record<string, unknown>) => ((await (await appPost("/settings/profile", t.cookie, { ...base, ...b })).json()) as { error: { field_errors: Record<string, string> } }).error.field_errors
    expect(await bad({ latitude: "-6,9", longitude: "" })).toMatchObject({ longitude: expect.stringContaining("sekaligus") })
    expect(await bad({ latitude: "95", longitude: "107" })).toMatchObject({ latitude: expect.stringContaining("-90 sampai 90") })
    expect((await appPost("/settings/profile", t.cookie, { ...base, latitude: "-6,9456", longitude: "107.5703" })).status).toBe(200)
    const v = ((await (await appGet("/settings", t.cookie)).json()) as { data: { profile: { latitude: number; longitude: number } } }).data.profile
    expect(v).toMatchObject({ latitude: -6.9456, longitude: 107.5703 })
    // The registered Mengantar address follows a moved pinpoint (re-registered on the next issue).
    await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec("UPDATE tenant_outlets SET mengantar_address_id = 'aaaaaaaaaaaaaaaaaaaaaaaa'"))
    expect((await appPost("/settings/profile", t.cookie, { ...base, latitude: "-6.9", longitude: "107.6" })).status).toBe(200)
    const addr = await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec("SELECT mengantar_address_id FROM tenant_outlets WHERE is_default = 1").one())
    expect(addr.mengantar_address_id).toBeNull()
  })

  it("application validates the optional pinpoint", async () => {
    const { validateApplication } = await import("../../src/onboarding/service")
    const ok = { slug: "titikdaftar", businessName: "Titik Daftar", contactWhatsapp: "081234567890", sellerEmail: "a@contoh.test", consentMengantar: true, outlet: { picName: "Budi", picPhone: "081234567890", areaId: "5fc62f5df8f44b34aa4c0d8c", areaLabel: "Dago", streetAddress: "Jl. Dago 1" } }
    expect(validateApplication({ ...ok, outlet: { ...ok.outlet, latitude: "-6.9456", longitude: "107.5703" } }).outlet).toMatchObject({ latitude: -6.9456, longitude: 107.5703 })
    expect(validateApplication(ok).outlet).toMatchObject({ latitude: null, longitude: null })
    expect(() => validateApplication({ ...ok, outlet: { ...ok.outlet, latitude: "-6.9" } })).toThrow("INVALID_PINPOINT")
  })
})

describe("pickup address recovery", () => {
  it("POST /time 404 (address deleted at Mengantar) re-registers the outlet address once and books the slot", async () => {
    const t = await checkoutGerai("alamathilang")
    await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec("UPDATE tenant_outlets SET mengantar_address_id = 'bbbbbbbbbbbbbbbbbbbbbbbb'"))
    const slug = await readyInv(t)
    expect((await dispatch(t, slug)).body.data).toMatchObject({ state: "issued" })
    expect(mockLog.filter((l) => l.path === "/time").length).toBe(2)
    expect(mockLog.filter((l) => l.path === "/address" && l.method === "POST")).toHaveLength(1)
    const addr = await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec("SELECT mengantar_address_id FROM tenant_outlets WHERE is_default = 1").one())
    expect(addr.mengantar_address_id).not.toBe("bbbbbbbbbbbbbbbbbbbbbbbb")
  })
})

describe("pickup contact (add-users-address v2.0.0)", () => {
  it("an outlet without street or WhatsApp is refused before Mengantar with a pointer to Profil Gerai", async () => {
    const t = await checkoutGerai("tanpakontak")
    const slug = await readyInv(t)
    await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec("UPDATE tenant_outlets SET street_address = NULL, mengantar_address_id = NULL"))
    const r = await dispatch(t, slug)
    expect(r.status).toBe(409)
    expect(r.body.error).toMatchObject({ code: "PICKUP_CONTACT_REQUIRED", message: expect.stringContaining("Profil Gerai") })
    expect(mockLog.some((l) => l.path === "/address")).toBe(false)
  })
})

describe("Sol review R1 regressions (DEC-238)", () => {
  it("J&T ECO is quoted for COD from the courier=all row and books courier JT + eco with the COD amount", async () => {
    const t = await checkoutGerai("ecocod")
    const cards = await quote(t.cookie, { mode: "buyer_bears_fee", codGoodsIdr: 100_000 })
    const eco = card(cards, "JTEco")!
    const jt = card(cards, "JT")!
    expect(eco).toMatchObject({ available: true })
    // ECO's own tariff (mock 10.500) — never the regular J&T price (12.500).
    expect(eco.codCollectionTotalIdr).toBeLessThan(jt.codCollectionTotalIdr)
    const slug = await readyInv(t, { serviceCode: "JTEco", mode: "buyer_bears_fee", codGoodsIdr: 100_000 })
    expect((await dispatch(t, slug)).body.data).toMatchObject({ state: "issued" })
    expect(sentOrder()).toMatchObject({ courier: "JT", orders: [{ eco: true, COD: eco.codCollectionTotalIdr }] })
  })

  it("cargo extra discount counts in the observed cargo discount", async () => {
    const t = await checkoutGerai("cargoextra")
    mockDiscountExtraBps.set("JNECargo", 500)
    const cards = await quote(t.cookie, { mode: "none", weightGram: 6000 })
    expect(card(cards, "JNECargo")).toMatchObject({ available: true, observedBps: 2500 })
  })

  it("a reserved slot is reused while ≥ 90 min ahead even when a new slot would need 120 min", async () => {
    const t = await checkoutGerai("slotreuse")
    // 2026-12-01 11:00 WIB → the first reservation is 13:00 the same day.
    const t0 = Date.UTC(2026, 11, 1, 4, 0)
    const a = await readyInv(t)
    const b = await readyInv(t)
    // The frozen quotes must still be valid at the simulated dispatch time.
    await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec("UPDATE quote_snapshots SET expires_at = ?", t0 + 3_600_000))
    expect(await t.vault.dispatchShipment(t.tenantId, a, "u", t0)).toMatchObject({ ok: true })
    const first = sentOrder().pickup.time_id
    expect(mockLog.filter((l) => l.path === "/time").at(-1)!.body).toMatchObject({ date: "12-01-2026", time: "13:00" })
    // 11:10 WIB: 13:00 is 110 min ahead (≥ 90, < 120) → reused, no new POST /time.
    expect(await t.vault.dispatchShipment(t.tenantId, b, "u", t0 + 10 * 60_000)).toMatchObject({ ok: true })
    expect(sentOrder().pickup.time_id).toBe(first)
    expect(mockLog.filter((l) => l.path === "/time")).toHaveLength(1)
  })
})

describe("stale pickup slot", () => {
  it("`invalid pickup time` drops the cached slot so the next issue reserves a fresh one", async () => {
    const t = await checkoutGerai("slotbasi")
    const a = await readyInv(t)
    expect((await dispatch(t, a)).body.data).toMatchObject({ state: "issued" })
    // Mengantar forgets the slot (the mock only knows time ids it issued).
    await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec("UPDATE pickup_time_slots SET time_id = 'cccccccccccccccccccccccc'"))
    const b = await readyInv(t)
    const r1 = await dispatch(t, b)
    expect(r1.status).toBe(422)
    expect(r1.body.error?.message).toContain("Tekan sekali lagi")
    expect((await dispatch(t, b)).body.data).toMatchObject({ state: "issued" })
    expect(mockLog.filter((l) => l.path === "/time")).toHaveLength(2)
  })
})
