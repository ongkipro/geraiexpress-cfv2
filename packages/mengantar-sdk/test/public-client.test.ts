import { describe, expect, it } from "vitest"
import { MengantarError, MengantarPublicClient } from "../src/public/client"
import { CREATE_ERROR, CREATE_PAID, CREATE_UNPAID, ESTIMATE_ALL, INVOICES, KEY, ORDER_HISTORY, PAY_UNPAID } from "./fixtures"

type Call = { url: string; init: RequestInit }
function fake(responses: Array<{ status?: number; json?: unknown; text?: string; headers?: Record<string, string> } | "timeout" | "network">) {
  const calls: Call[] = []
  let i = 0
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init })
    const r = responses[i++]
    if (r === "timeout") throw Object.assign(new Error("timed out"), { name: "TimeoutError" })
    if (r === "network") throw new TypeError(`fetch failed for ${url}`)
    return new Response(r?.text ?? JSON.stringify(r?.json ?? {}), { status: r?.status ?? 200, headers: { "content-type": "application/json", ...(r?.headers ?? {}) } })
  }) as unknown as typeof fetch
  return { calls, client: new MengantarPublicClient({ origin: "https://sandbox-api-public.mengantar.example", apiKey: KEY, fetchImpl }) }
}

/** No string representation of an error may contain the seller key. */
function assertNoKey(e: unknown) {
  const all = [String(e), JSON.stringify(e), (e as Error).message, (e as Error).stack ?? "", JSON.stringify((e as MengantarError).body ?? null), (e as MengantarError).path ?? ""].join("\n")
  expect(all).not.toContain(KEY)
}

describe("Mengantar Public API client (TASK-201)", () => {
  it("estimate (courier=all): keyed path, query, parsed map; unknown fields kept raw", async () => {
    const { calls, client } = fake([{ json: ESTIMATE_ALL }])
    const rates = await client.estimate({ originId: "o1", destinationId: "d1", courier: "all", weightKg: 2, codAmountIdr: 167560 })
    expect(calls[0]!.url).toBe(`https://sandbox-api-public.mengantar.example/api/public/${KEY}/order/estimate?origin_id=o1&destination_id=d1&courier=all&weight=2&COD_AMOUNT=167560`)
    expect(rates.JT).toMatchObject({ price: 12000, discountPercent: 20, estimatedSpecialPrice: 9600 })
    expect(rates.JNECargo).toMatchObject({ cargoPrice: 60000, cargoDiscount: 15000 })
    expect((rates.spx as Record<string, unknown>).futureField).toEqual({ x: 1 })
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal)
  })

  it("create order paid / unpaid / error, with the idempotency header", async () => {
    const { calls, client } = fake([{ json: CREATE_PAID }, { json: CREATE_UNPAID, headers: { "idempotent-replayed": "true" } }, { status: 400, json: CREATE_ERROR }])
    const body = { courier: "JT" as const, pickup: { type: "scheduledPickup" as const, address_id: "a1", time_id: "t1", volume: "volumeMotor" as const }, orders: [{ goodsValue: 100000 }] }
    const paid = await client.createOrder(body, "gx:t1:8k4m2p7:1")
    expect(paid.data[0]).toMatchObject({ cnote_no: "JX0000000001", isPaid: true })
    expect((calls[0]!.init.headers as Record<string, string>).idempotencyKey).toBe("gx:t1:8k4m2p7:1")
    const unpaid = await client.createOrder(body, "gx:t1:9x9x9x9:1")
    expect(unpaid).toMatchObject({ batch_id: "665f00000000000000000002", idempotentReplayed: true })
    expect(unpaid.data[0]).toMatchObject({ isPaid: false, cnote_no: null })
    const err = await client.createOrder(body, "gx:t1:2222222:1").catch((e) => e)
    expect(err).toBeInstanceOf(MengantarError)
    expect(err).toMatchObject({ kind: "http", status: 400, code: "X000", path: "/api/public/{API_KEY}/order" })
    expect(err.ambiguous).toBe(false)
    assertNoKey(err)
    await expect(client.createOrder(body, "x".repeat(51))).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_INVALID" })
  })

  it("GET /order history read-back; invoices with balance and unknown types; pay-unpaid; delete", async () => {
    const { calls, client } = fake([{ json: ORDER_HISTORY }, { json: INVOICES }, { json: PAY_UNPAID }, { json: { success: true } }])
    const o = await client.getOrder({ orderId: "MGT-0001" })
    expect(o?.history).toHaveLength(2)
    expect(o?.DESTINATION_CODE).toBe("BDO-CBL02")
    const inv = await client.invoices({ cursor: null })
    expect(inv.balance).toBe(250000)
    expect(inv.data.map((d) => d.type)).toEqual(["typeAddBalance", "typePayment", "typeSomethingNew"])
    expect(inv.nextCursor).toBe("c2")
    expect(await client.payUnpaid("JT", "665f00000000000000000002")).toMatchObject({ data: { count: 1 } })
    expect(JSON.parse(String(calls[2]!.init.body))).toEqual({ courier: "JT", batch_id: "665f00000000000000000002" })
    expect(await client.deleteOrders("JT", ["665f000000000000000000aa"])).toMatchObject({ success: true })
    expect(calls[3]!.init.method).toBe("DELETE")
    await expect(client.payUnpaid("JT", "B-JT-0002")).rejects.toMatchObject({ code: "BATCH_ID_INVALID" })
  })

  it("an HTML 502 gateway page after POST /order is ambiguous (never treated as a rejection)", async () => {
    const { client } = fake([{ status: 502, text: "<html><body>Bad Gateway</body></html>" }])
    const e = await client.estimate({ originId: "o", destinationId: "d", courier: "JT", weightKg: 1 }).catch((x) => x)
    expect(e).toMatchObject({ kind: "parse", status: 502 })
    expect(e.ambiguous).toBe(true)
  })

  it("4xx/5xx/timeout/network/parse errors never contain the key, even when Mengantar echoes it", async () => {
    const echo = { status: 500, json: { success: false, message: `Internal error at /api/public/${KEY}/order for key ${KEY}` } }
    const { client } = fake([echo, { status: 401, json: { message: `invalid key ${KEY}`, code: "X001" } }, "timeout", "network", { status: 200, text: `<html>${KEY}</html>` }, { status: 200, json: { success: true, data: "nope" } }])
    const e1 = await client.estimate({ originId: "o", destinationId: "d", courier: "JT", weightKg: 1 }).catch((e) => e)
    expect(e1).toMatchObject({ kind: "http", status: 500 })
    expect(e1.ambiguous).toBe(true)
    assertNoKey(e1)
    const e2 = await client.estimate({ originId: "o", destinationId: "d", courier: "JT", weightKg: 1 }).catch((e) => e)
    expect(e2).toMatchObject({ status: 401, code: "X001" })
    assertNoKey(e2)
    const e3 = await client.getOrder({ orderId: "x" }).catch((e) => e)
    expect(e3).toMatchObject({ kind: "timeout", status: null })
    expect(e3.ambiguous).toBe(true)
    assertNoKey(e3)
    const e4 = await client.getOrder({ orderId: "x" }).catch((e) => e)
    expect(e4).toMatchObject({ kind: "network" })
    assertNoKey(e4)
    const e5 = await client.invoices({}).catch((e) => e)
    expect(e5).toMatchObject({ kind: "parse" })
    // An unreadable 200 body may hide an applied order: ambiguous (read back, never blind-retry).
    expect(e5.ambiguous).toBe(true)
    assertNoKey(e5)
    const e6 = await client.invoices({}).catch((e) => e)
    expect(e6).toMatchObject({ kind: "envelope", code: "UNEXPECTED_SHAPE" })
    assertNoKey(e6)
  })

  it("refuses to call without a key or with a key that would break the path", async () => {
    const c = new MengantarPublicClient({ origin: "https://x.example", apiKey: "", fetchImpl: (async () => new Response("{}")) as unknown as typeof fetch })
    await expect(c.searchArea("bandung")).rejects.toMatchObject({ code: "KEY_MISSING" })
    const c2 = new MengantarPublicClient({ origin: "https://x.example", apiKey: "a/b", fetchImpl: (async () => new Response("{}")) as unknown as typeof fetch })
    await expect(c2.searchArea("bandung")).rejects.toMatchObject({ code: "KEY_MISSING" })
  })
})
