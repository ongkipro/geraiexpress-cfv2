// DEC-238: Mengantar Public API Sandbox v2.0.0 contract parity (create-order, add-time, add-users-address,
// check-shipping-fee, get-receiver-score-number, dropshippers, simulate-order-status).
import { describe, expect, it } from "vitest"
import { MengantarError, MengantarPublicClient, nextPickupSlot, pickupVolume, posCodRefusal } from "../src/public/client"
import { KEY } from "./fixtures"

function fake(responses: Array<{ status?: number; json?: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  let i = 0
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init })
    const r = responses[i++]
    return new Response(JSON.stringify(r?.json ?? {}), { status: r?.status ?? 200, headers: { "content-type": "application/json" } })
  }) as unknown as typeof fetch
  return { calls, client: new MengantarPublicClient({ origin: "https://sandbox.example", apiKey: KEY, fetchImpl }) }
}
const body = (c: { init: RequestInit }) => JSON.parse(String(c.init.body)) as Record<string, unknown>
// 2026-11-16 08:00 WIB = 01:00 UTC.
const at = (h: number, m = 0, day = 16) => Date.UTC(2026, 10, day, h - 7, m)

describe("DEC-238 Mengantar v2.0.0 contract", () => {
  it("POST /address sends PICKUP_PIC + PICKUP_PIC_PHONE + pinpointData; update uses PUT /address/{id}", async () => {
    const { calls, client } = fake([{ json: { success: true, data: { _id: "a1" } } }, { json: { success: true, data: { _id: "a1" } } }])
    expect(await client.saveAddress({ areaId: "ar", name: "Gerai", phone: "0812", address: "Jl. A", pinpoint: { lat: -6.9, lng: 107.5 } })).toBe("a1")
    expect(calls[0]!.init.method).toBe("POST")
    expect(body(calls[0]!)).toEqual({ PICKUP_AUTOFILL: "ar", PICKUP_NAME: "Gerai", PICKUP_PIC: "Gerai", PICKUP_PIC_PHONE: "0812", PICKUP_ADDRESS: "Jl. A", pinpointData: { lat: -6.9, lng: 107.5 } })
    await client.saveAddress({ _id: "a1", areaId: "ar", name: "Gerai", pic: "Budi", phone: "0812", address: "Jl. A" })
    expect(calls[1]!.init.method).toBe("PUT")
    expect(calls[1]!.url).toBe(`https://sandbox.example/api/public/${KEY}/address/a1`)
    expect(body(calls[1]!)).not.toHaveProperty("pinpointData")
  })

  it("POST /time accepts only MM-DD-YYYY and two-digit hours 09:00–20:00", async () => {
    const { calls, client } = fake([{ json: { success: true, data: { _id: "t1" } } }])
    expect(await client.reserveTime("a1", "11-30-2026", "13:00")).toBe("t1")
    expect(body(calls[0]!)).toEqual({ address_id: "a1", date: "11-30-2026", time: "13:00" })
    await expect(client.reserveTime("a1", "11-30-2026", "9:00")).rejects.toMatchObject({ code: "PICKUP_TIME_INVALID" })
    await expect(client.reserveTime("a1", "2026-11-30", "10:00")).rejects.toMatchObject({ code: "PICKUP_TIME_INVALID" })
    await expect(client.reserveTime("a1", "11-30-2026", "21:00")).rejects.toMatchObject({ code: "PICKUP_TIME_INVALID" })
    expect(calls).toHaveLength(1)
  })

  it("nextPickupSlot: >= 120 min lead in WIB, rolls to 10:00 next day after the cut-off, honours SPX windows", () => {
    expect(nextPickupSlot(at(8))).toMatchObject({ date: "11-16-2026", time: "10:00" })
    expect(nextPickupSlot(at(8, 1))).toMatchObject({ date: "11-16-2026", time: "11:00" })
    expect(nextPickupSlot(at(16))).toMatchObject({ date: "11-16-2026", time: "18:00" })
    expect(nextPickupSlot(at(16, 1))).toMatchObject({ date: "11-17-2026", time: "10:00" })
    expect(nextPickupSlot(at(23, 30))).toMatchObject({ date: "11-17-2026", time: "10:00" })
    // Month boundary.
    expect(nextPickupSlot(Date.UTC(2026, 10, 30, 12))).toMatchObject({ date: "12-01-2026", time: "10:00" })
    const spx = { "2026-11-16": [{ start: "14:00", end: "22:00" }] }
    expect(nextPickupSlot(at(8), 120, spx)).toMatchObject({ date: "11-16-2026", time: "14:00" })
    expect(nextPickupSlot(at(17), 120, spx)).toBeNull()
  })

  it("pickupVolume follows billable weight", () => {
    expect([pickupVolume(1000), pickupVolume(19_999), pickupVolume(20_000), pickupVolume(99_999), pickupVolume(100_000)]).toEqual(["volumeMotor", "volumeMotor", "volumeMobil", "volumeMobil", "volumeTruck"])
  })

  it("estimate keeps discountExtra*, SAP/SAPLite/JTEco keys and the SPX pickupSchedule", async () => {
    const { client } = fake([
      {
        json: {
          success: true,
          data: {
            SAP: { price: 10000, discount: 3000, discountExtra: 500, discountExtraPercent: 5, estimatedSpecialPrice: 6500 },
            SAPLite: { price: 8000, estimatedSpecialPrice: 6000 },
            JTEco: { price: 9000, estimatedSpecialPrice: 7000 },
            spx: { price: 12000, pickupSchedule: { "2026-11-16": [{ timeRangeId: 1, start: "14:00", end: "22:00", timeEpoch: 1 }] } },
          },
        },
      },
    ])
    const r = await client.estimate({ originId: "o", destinationId: "d", courier: "all", weightKg: 1 })
    expect(r.SAP).toMatchObject({ discountExtra: 500, discountExtraPercent: 5 })
    expect(Object.keys(r)).toEqual(["SAP", "SAPLite", "JTEco", "spx"])
    expect(r.spx!.pickupSchedule!["2026-11-16"]![0]).toMatchObject({ start: "14:00", end: "22:00" })
  })

  it("receiver score: grade with/without ≈, empty shape, one phone per call", async () => {
    const { calls, client } = fake([
      { json: { success: true, data: { phone: "8123456789", JNE: { total: 3, delivered: 2, rts: 1, undelivered: 0, inProgress: 0, rate: 6.7 }, pos: {}, summary: { average_number: 6.7, average_score: "≈B-" } } } },
      { json: { success: true, data: { JNE: {}, summary: { average_number: null, average_score: "-" } } } },
      { status: 403, json: { success: false, message: "Not allowed" } },
    ])
    expect(await client.receiverScore("0812-3456-789")).toEqual({ grade: "B-", approximate: true, averageRate: 6.7, total: 3, delivered: 2, rts: 1 })
    expect(calls[0]!.url).toContain("/getReceiverScoreByNumberUser?search=0812345678")
    expect(await client.receiverScore("08123456780")).toEqual({ grade: null, approximate: false, averageRate: null, total: 0, delivered: 0, rts: 0 })
    await expect(client.receiverScore("08123456781")).rejects.toMatchObject({ status: 403 })
    await expect(client.receiverScore("12")).rejects.toMatchObject({ code: "PHONE_INVALID" })
  })

  it("dropshippers save/search and sandbox status simulation", async () => {
    const ds = { id: "66ab1234567890abcdef1234", name: "Toko Partner", phone: "081234567890" }
    const { calls, client } = fake([{ status: 201, json: { success: true, data: ds } }, { json: { success: true, data: [ds] } }, { json: { success: true, data: { orderId: "O1", statusCategory: "DELIVERED" } } }])
    expect(await client.saveDropshipper(" Toko Partner ", "081234567890")).toMatchObject(ds)
    expect(body(calls[0]!)).toEqual({ name: "Toko Partner", phone: "081234567890" })
    expect(await client.searchDropshippers("Toko (A)")).toEqual([ds])
    expect(calls[1]!.url).toContain("/dropshippers?search=Toko+A&page=1&perPage=20")
    expect(await client.simulateStatus("JT", "O1", "DELIVERED")).toMatchObject({ statusCategory: "DELIVERED" })
    expect(body(calls[2]!)).toEqual({ courier: "JT", orderId: "O1", statusCategory: "DELIVERED" })
  })

  it("posCodRefusal recognises the three blocked statuses only", () => {
    const e = (b: unknown, s = 403) => new MengantarError("http", "/order", s, null, "x", null, false, b)
    expect(posCodRefusal(e({ status: "blocked", deliveredRate: 70, minimumDeliveredRate: 82 }))).toEqual({ status: "blocked", deliveredRate: 70, minimumDeliveredRate: 82 })
    expect(posCodRefusal(e({ status: "new_seller", deliveredRate: 0 }))).toMatchObject({ status: "new_seller", minimumDeliveredRate: 82 })
    expect(posCodRefusal(e({ status: "warning" }))).toBeNull()
    expect(posCodRefusal(e({ status: "blocked" }, 400))).toBeNull()
    expect(posCodRefusal(e({ message: "Not allowed" }))).toBeNull()
  })
})
