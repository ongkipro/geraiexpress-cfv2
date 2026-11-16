// TASK-303 quote engine: five collection modes on fixture estimates (incl. an unstable COD fee), quick check never
// allocates a slug, per-tenant quote rate limit, observed_bps recorded per service class, Kasir sees customer prices.
import { env } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import type { GeraiVaultDO } from "../../src/do/gerai-vault"
import { ownerOnlyKeysIn } from "../../src/dto/projection"
import { hostCache } from "../../src/host/lookup"
import { mockCodFeeUnstable, mockDiscountBps, mockUnsupported, resetMock } from "../../src/mengantar/mock"
import { buildCard, priceOf } from "../../src/pricing/quote/engine"
import { appUser } from "../onboarding/helpers"
import { appPost, seedConnected } from "../webhooks/helpers"

const ORIGIN = "5fc62f5df8f44b34aa4c0d8c"
const DEST = "5fc64714f8f44b34aa4cdd60"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

async function geraiWithOutlet(slug: string) {
  const t = await seedConnected(slug)
  await t.vault.upsertDefaultOutlet(t.tenantId, { name: slug, areaId: ORIGIN })
  // Rules as after approval (20 %), so assigned bps is known.
  await env.DB.prepare(
    `INSERT INTO tenant_discount_rules (tenant_id, service_code, courier_code, service_class, assigned_bps, effective_from, requested_at, updated_at)
     SELECT ?1, service_code, courier_code, service_class, 2000, 1, 1, 1 FROM courier_service_catalog WHERE is_active = 1`,
  ).bind(t.tenantId).run()
  return t
}

type Card = { serviceCode: string; available: boolean; unavailableReason: string | null; publishShippingIdr: number; codFeeIdr: number; counterDueIdr: number; codCollectionTotalIdr: number; senderCodPayableIdr: number; providerNetShippingIdr?: number; estimatedProfitIdr?: number }
const quote = async (cookie: string, b: Record<string, unknown>) => {
  const r = await appPost("/quotes", cookie, { destinationAreaId: DEST, weightGram: 1000, ...b })
  return { status: r.status, body: (await r.json()) as { data: { cards: Card[]; medals: Record<string, string | null> }; error?: { code: string; message: string } } }
}
const card = (cards: Card[], code: string) => cards.find((c) => c.serviceCode === code)!

describe("five collection modes (mock: JT publish 12.500, 20 % discount → N 10.000; codFee = 2,8 % of COD_AMOUNT up to Rp1.000)", () => {
  it("none, buyer_bears_fee, sender_bears_fee, cod_all_in, dfod — exact flows from the final estimate", async () => {
    const t = await geraiWithOutlet("kuotasatu")
    const none = card((await quote(t.cookie, { mode: "none", packingIdr: 3000 })).body.data.cards, "JT")
    expect(none).toMatchObject({ publishShippingIdr: 12500, providerNetShippingIdr: 10000, codFeeIdr: 0, counterDueIdr: 15500, codCollectionTotalIdr: 0, estimatedProfitIdr: 5500 })
    // buyer_bears_fee (fee-inclusive): B = G + P = 162.500 → F0 = 5.000 → F1(B + F0) = 5.000 → C = 167.500.
    const buyer = card((await quote(t.cookie, { mode: "buyer_bears_fee", codGoodsIdr: 150000 })).body.data.cards, "JT")
    expect(buyer).toMatchObject({ available: true, codFeeIdr: 5000, codCollectionTotalIdr: 167500, senderCodPayableIdr: 150000, counterDueIdr: 0, estimatedProfitIdr: 2500 })
    // sender_bears_fee (fixed): C = G + P = 162.500, F = 5.000 (one estimate), payable G − F.
    const sender = card((await quote(t.cookie, { mode: "sender_bears_fee", codGoodsIdr: 150000 })).body.data.cards, "JT")
    expect(sender).toMatchObject({ available: true, codFeeIdr: 5000, codCollectionTotalIdr: 162500, senderCodPayableIdr: 145000, counterDueIdr: 0, providerNetShippingIdr: 10000, estimatedProfitIdr: 2500 })
    // cod_all_in (fixed): C = G = 150.000, F = 5.000, payable G − P − F = 132.500.
    const allIn = card((await quote(t.cookie, { mode: "cod_all_in", codGoodsIdr: 150000 })).body.data.cards, "JT")
    expect(allIn).toMatchObject({ available: true, codFeeIdr: 5000, codCollectionTotalIdr: 150000, senderCodPayableIdr: 132500 })
    // Guard: G = 13.000 < P + F + 1.000 = 12.500 + 1.000 + 1.000 → refused, never a negative payable.
    const tooLow = card((await quote(t.cookie, { mode: "cod_all_in", codGoodsIdr: 13000 })).body.data.cards, "JT")
    expect(tooLow).toMatchObject({ available: false, unavailableReason: "COD all-in tidak cukup menutup ongkir dan biaya COD." })
    // dfod (fee-inclusive): B = P = 12.500 → F = 1.000 → C = 13.500, nothing to the sender, nothing at the counter.
    const dfod = card((await quote(t.cookie, { mode: "dfod" })).body.data.cards, "JT")
    expect(dfod).toMatchObject({ available: true, codFeeIdr: 1000, codCollectionTotalIdr: 13500, senderCodPayableIdr: 0, counterDueIdr: 0 })
  })

  it("fee-inclusive mode that converges: C = B + F with F from the final estimate (engine unit, fixed rows)", () => {
    const row = (codFee: number) => ({ unsupported: false, unsupportedCod: false, unsupportedPickup: false, price: 12000, discount: 2400, discountPercent: 20, codFee, estimatedPrice: 12000 + codFee, estimatedSpecialPrice: 9600 + codFee, cargoPrice: null, cargoDiscount: null, cargoEstimatedPrice: null, cargoEstimatedSpecialPrice: null, minimumWeightCargo: null, eta: "2 - 3 hari" })
    const p = priceOf("regular", row(5560))!
    expect(p).toMatchObject({ P: 12000, N: 9600, F: 5560, observedBps: 2000 })
    const c = buildCard({ serviceCode: "JT", courierCode: "JT", courierName: "J&T", name: "J&T", serviceClass: "regular", billableWeightGram: 1000, providerWeightKg: 1, eta: null, dropOffOnly: false, available: true, unavailableReason: null }, p, { originAreaId: ORIGIN, destinationAreaId: DEST, mode: "buyer_bears_fee", actualWeightGram: 1000, dims: null, codGoodsIdr: 150000, packingIdr: 3000, serviceFeeIdr: 0, promoIdr: 0, declaredValueIdr: 0, dangerousGoods: false }, 2000)
    // spec 02 §3.4 worked example row `buyer_bears_fee`.
    expect(c.flow).toMatchObject({ counterDueIdr: 3000, codCollectionTotalIdr: 167560, expectedProviderCodCreditIdr: 152400, senderCodPayableIdr: 150000, outletMarginIdr: 5400 })
  })

  it("unstable COD fee → the card says so and is never quoted with a guessed fee", async () => {
    const t = await geraiWithOutlet("kuotadua")
    mockCodFeeUnstable.on = true
    const r = await quote(t.cookie, { mode: "buyer_bears_fee", codGoodsIdr: 150000 })
    expect(r.status).toBe(200)
    for (const c of r.body.data.cards.filter((x) => x.serviceCode === "JT" || x.serviceCode === "JNE")) expect(c).toMatchObject({ available: false, unavailableReason: "Biaya COD berubah, ulangi cek ongkir." })
  })
})

describe("cargo, coverage and preferences", () => {
  it("cargo only Non-COD and ≥ 5 kg; unsupported routes and disabled couriers are not quoted", async () => {
    const t = await geraiWithOutlet("kuotatiga")
    const light = (await quote(t.cookie, { mode: "none", weightGram: 2000 })).body.data.cards
    expect(card(light, "JNECargo")).toMatchObject({ available: false, unavailableReason: "Cargo untuk paket mulai 5 kg." })
    const heavy = (await quote(t.cookie, { mode: "none", weightGram: 7000 })).body.data.cards
    expect(card(heavy, "JNECargo")).toMatchObject({ available: true, publishShippingIdr: 72000 })
    const codHeavy = (await quote(t.cookie, { mode: "sender_bears_fee", codGoodsIdr: 100000, weightGram: 7000 })).body.data.cards
    expect(card(codHeavy, "JNECargo").unavailableReason).toBe("Cargo hanya untuk kiriman Non-COD.")
    mockUnsupported.add("pos")
    await appPost("/settings/couriers/anteraja", t.cookie, { enabled: false })
    const after = (await quote(t.cookie, { mode: "none", declaredValueIdr: 100000 })).body.data.cards
    expect(card(after, "pos")).toMatchObject({ available: false, unavailableReason: "Layanan tidak tersedia untuk rute ini." })
    expect(after.find((c) => c.serviceCode === "anteraja")).toBeUndefined()
    expect(after.find((c) => c.serviceCode === "ninja")).toBeUndefined()
  })
})

describe("quick check, freeze, rate limit, observations, projection", () => {
  it("quick check allocates no INV slug; freeze allocates one slug and stores the frozen quote", async () => {
    const t = await geraiWithOutlet("kuotaempat")
    const slugs = () => runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM inv_slugs").one().n)
    const snaps = () => runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM quote_snapshots").one().n)
    await quote(t.cookie, { mode: "none" })
    await quote(t.cookie, { mode: "sender_bears_fee", codGoodsIdr: 150000 })
    expect([await slugs(), await snaps()]).toEqual([0, 0])
    const f = await appPost("/quotes/freeze", t.cookie, { destinationAreaId: DEST, weightGram: 1000, mode: "sender_bears_fee", codGoodsIdr: 150000, serviceCode: "JT" })
    expect(f.status).toBe(201)
    const { slug } = ((await f.json()) as { data: { slug: string } }).data
    expect(slug).toMatch(/^[0-9a-z]{7}$/)
    expect([await slugs(), await snaps()]).toEqual([1, 1])
    const snap = await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec<Record<string, number | string>>("SELECT * FROM quote_snapshots").one())
    expect(snap).toMatchObject({ shipment_slug: slug, cod_fee_mode: "sender_bears_fee", cod_fee_idr: 5000, cod_collection_total_idr: 162500, provider_net_shipping_idr: 10000, publish_shipping_idr: 12500, provider_weight_kg_text: "1" })
  })

  it("observed_bps recorded per service class (regular discount, cargo cargoDiscount/cargoPrice) on every quote", async () => {
    const t = await geraiWithOutlet("kuotalima")
    mockDiscountBps.set("JT", 1990).set("JNECargo", 2500)
    await quote(t.cookie, { mode: "none", weightGram: 7000 })
    const rows = await env.DB.prepare("SELECT service_code, observed_bps, verification_state FROM tenant_discount_rules WHERE tenant_id = ? AND service_code IN ('JT','JNECargo')").bind(t.tenantId).all<{ service_code: string; observed_bps: number; verification_state: string }>()
    const by = Object.fromEntries(rows.results.map((r) => [r.service_code, r]))
    // Mock JT discount = floor(12.500 × 1990 / 10000) = 2.487 → floor(2.487 × 10000 / 12.500) = 1.989 (lossy floor, spec 02 §2).
    expect(by.JT).toMatchObject({ observed_bps: 1989 })
    expect(by.JNECargo).toMatchObject({ observed_bps: 2500 })
  })

  it("per-tenant quote rate limit; another gerai is unaffected", async () => {
    const a = await geraiWithOutlet("kuotaenam")
    const b = await geraiWithOutlet("kuotatujuh")
    await env.DB.prepare("INSERT INTO auth_throttle (key, count, window_started_at) VALUES (?, 30, ?)").bind(`quote:${a.tenantId}`, Date.now()).run()
    const r = await quote(a.cookie, { mode: "none" })
    expect(r.status).toBe(429)
    expect(r.body.error).toMatchObject({ code: "QUOTE_RATE_LIMITED", message: "Terlalu banyak cek ongkir. Coba lagi sebentar lagi." })
    expect((await quote(b.cookie, { mode: "none" })).status).toBe(200)
  })

  it("Kasir sees customer prices only (no N, discount, cost or margin)", async () => {
    const t = await geraiWithOutlet("kuotadelapan")
    const k = await appUser("kasir.kuota@contoh.test")
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'cashier', 'active', ?)").bind(t.tenantId, k.id, Date.now()),
      env.DB.prepare("UPDATE sessions SET active_tenant_id = ? WHERE user_id = ?").bind(t.tenantId, k.id),
    ])
    const r = await quote(k.cookie, { mode: "sender_bears_fee", codGoodsIdr: 150000 })
    expect(r.status).toBe(200)
    expect(ownerOnlyKeysIn(r.body)).toEqual([])
    const jt = card(r.body.data.cards, "JT")
    expect(jt.providerNetShippingIdr).toBeUndefined()
    expect(jt.estimatedProfitIdr).toBeUndefined()
    expect(jt.publishShippingIdr).toBe(12500)
    const bad = await quote(k.cookie, { mode: "sender_bears_fee", codGoodsIdr: 500, destinationAreaId: "x" })
    expect(bad.status).toBe(422)
  })
})
