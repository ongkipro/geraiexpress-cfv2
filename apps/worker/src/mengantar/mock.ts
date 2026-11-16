// Deterministic offline Mengantar for local development and tests (spec 07 §2: never call live Mengantar without
// explicit sandbox keys). Shapes follow the recorded fixtures of TASK-201/202; values are synthetic.
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

/** Order read-back fixtures keyed by AWB or ORDER_ID (`history[].date` is Asia/Jakarta `DD-MM-YYYY HH:mm`). */
export const mockOrders = new Map<string, { cnote_no: string; ORDER_ID: string; statusCategory: string; history: Array<{ date: string; statusCategory: string }> }>()

/** Discount Mengantar currently gives this mock seller, per rate key, in bps (default 2000 regular, 2000 cargo). */
export const mockDiscountBps = new Map<string, number>()

/** Rate keys answered as `unsupported: true` (coverage gaps); `SiCepatPickup` flags `unsupportedPickup`. */
export const mockUnsupported = new Set<string>()
/** When on, every COD estimate returns a different fee (spec 02 §3.3 `COD_FEE_UNSTABLE`). */
export const mockCodFeeUnstable = { on: false, n: 0 }

/** Fault injection for tests: the next call to a route throws a timeout (after or before Mengantar applied it). */
export const mockFaults: {
  regenerate?: "timeout_after_apply" | "timeout_before_apply" | "error"
  apiKey?: "timeout"
  order?: "timeout_after_create" | "timeout_before_create" | "validation_error" | "replayed_5xx" | "unavailable"
  deleteOrder?: "timeout_after_delete" | "refused"
  readBack?: "timeout"
  invoices?: "error"
} = {}

/** Seller balance per mock key (IDR); an order the balance cannot cover is created unpaid (no AWB). */
export const mockSeller = { balanceIdr: 1_000_000, createCalls: 0, payUnpaidCalls: 0, deleteCalls: 0, invoiceCalls: 0 }
/** `/invoices` rows this mock seller returns (newest first by `createdAt`); tests push fixtures here. */
export const mockInvoices: Array<Record<string, unknown>> = []

type MockOrder = { _id: string; ORDER_ID: string; cnote_no: string | null; batch: string; batch_id: string; isPaid: boolean; status: string; statusCategory: string; destinationMark: string; DESTINATION_CODE: string | null; WEIGHT: string; COD_FEE: string; courier: string; cost: number; history: Array<{ date: string; statusCategory: string }> }
/** Orders created through the mock `POST /order`, by ORDER_ID. */
export const mockCreated = new Map<string, MockOrder>()
const idempotent = new Map<string, { status: number; body: unknown }>()
const hex24 = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("")
const jakartaNow = () => {
  const d = new Date(Date.now() + 7 * 3600_000)
  const p2 = (n: number) => String(n).padStart(2, "0")
  return `${p2(d.getUTCDate())}-${p2(d.getUTCMonth() + 1)}-${d.getUTCFullYear()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`
}
const digits = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => String(b % 10)).join("")
const awbFor = (courier: string) => `${courier.toUpperCase().slice(0, 3)}${digits(10)}`

const sellers = new Map<string, { sellerId: string; email: string; apiKey: string; callbackSecret?: string }>()
const takenEmails = new Set(["sudahada@contoh.test"])

export const mockFetch: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
  const body = init?.body ? JSON.parse(String(init.body)) : {}
  const p = url.pathname
  if (p === "/api/partner/v1/sellers") {
    if (String(body.email).startsWith("timeout")) throw Object.assign(new Error("timeout"), { name: "TimeoutError" })
    const existing = sellers.get(body.externalUserId)
    if (existing) return json(200, { success: true, alreadyRegistered: true, data: existing })
    if (takenEmails.has(body.email)) return json(409, { success: false, code: "EMAIL_ALREADY_REGISTERED", message: "exists" })
    const seller = { sellerId: crypto.randomUUID().replace(/-/g, "").slice(0, 24), email: body.email, apiKey: `MOCK-${crypto.randomUUID().slice(0, 8)}` }
    sellers.set(body.externalUserId, seller)
    return json(201, { success: true, alreadyRegistered: false, data: seller })
  }
  if (p === "/api/partner/v1/sellers/list") {
    const s = body.externalUserId ? sellers.get(body.externalUserId) : null
    const list = body.externalUserId ? (s ? [{ ...s, externalUserId: body.externalUserId, active: true }] : []) : [...sellers.entries()].map(([k, v]) => ({ ...v, externalUserId: k, active: true }))
    return json(200, { success: true, data: { sellers: list.map(({ apiKey: _k, callbackSecret: _c, ...r }) => r), page: 1, size: 50, total: list.length, totalPages: 1 } })
  }
  if (p === "/api/partner/v1/sellers/api-key" || p === "/api/partner/v1/sellers/api-key/regenerate") {
    const entry = [...sellers.values()].find((s) => s.sellerId === body.sellerId)
    if (!entry) return json(404, { success: false, code: "SELLER_NOT_FOUND" })
    const timeout = () => Object.assign(new Error("timeout"), { name: "TimeoutError" })
    if (p.endsWith("regenerate")) {
      const fault = mockFaults.regenerate
      delete mockFaults.regenerate
      if (fault === "error") return json(400, { success: false, code: "SELLER_INACTIVE", message: "inactive" })
      if (fault === "timeout_before_apply") throw timeout()
      entry.apiKey = `MOCK-${crypto.randomUUID().slice(0, 8)}`
      entry.callbackSecret = `cb-${crypto.randomUUID().slice(0, 12)}`
      if (fault === "timeout_after_apply") throw timeout()
      return json(200, { success: true, data: { sellerId: entry.sellerId, apiKey: entry.apiKey, callbackSecret: entry.callbackSecret } })
    }
    if (mockFaults.apiKey === "timeout") {
      delete mockFaults.apiKey
      throw timeout()
    }
    return json(200, { success: true, data: { sellerId: entry.sellerId, apiKey: entry.apiKey } })
  }
  if (/^\/api\/public\/[^/]+\/order$/.test(p) && (init?.method ?? "GET") === "GET") {
    if (mockFaults.readBack === "timeout") {
      delete mockFaults.readBack
      throw Object.assign(new Error("timeout"), { name: "TimeoutError" })
    }
    const kw = url.searchParams.get("keyword")
    if (kw !== null) {
      const hits = [...mockCreated.values()].filter((o) => o.destinationMark.toUpperCase() === kw.toUpperCase())
      return json(200, { success: true, data: hits, nextCursor: null })
    }
    const id = url.searchParams.get("tracking_id") ?? url.searchParams.get("order_id") ?? ""
    const created = mockCreated.get(id) ?? [...mockCreated.values()].find((o) => o.cnote_no === id)
    if (created) return json(200, { success: true, data: created })
    const o = mockOrders.get(id)
    return o ? json(200, { success: true, data: o }) : json(404, { success: false, code: "ORDER_NOT_FOUND", message: "not found" })
  }
  if (/^\/api\/public\/[^/]+\/address$/.test(p) && init?.method === "POST") return json(200, { success: true, data: { _id: body._id ?? hex24() } })
  if (/^\/api\/public\/[^/]+\/time$/.test(p) && init?.method === "POST") return json(200, { success: true, data: { _id: hex24(), date: body.date, time: body.time } })
  if (/^\/api\/public\/[^/]+\/order$/.test(p) && init?.method === "POST") {
    const headers = new Headers(init?.headers)
    const key = headers.get("idempotencyKey") ?? headers.get("idempotencykey") ?? ""
    const fault = mockFaults.order
    delete mockFaults.order
    if (fault === "timeout_before_create") throw Object.assign(new Error("timeout"), { name: "TimeoutError" })
    if (fault === "unavailable") return json(503, { success: false, code: "IDEMPOTENCY_UNAVAILABLE", message: "unavailable" })
    const prior = idempotent.get(key)
    if (prior) return new Response(JSON.stringify(prior.body), { status: prior.status, headers: { "content-type": "application/json", "idempotent-replayed": "true" } })
    if (fault === "validation_error") return json(400, { success: false, code: "VALIDATION_ERROR", message: "customerPhone must be 10-15 digits" })
    mockSeller.createCalls++
    const o = body.orders?.[0] ?? {}
    const courier = String(body.courier)
    // The debit the mock charges: 10.000 per kg (deterministic, independent of the quote mock's tariffs).
    const cost = 10_000 * Math.max(1, Math.ceil(Number(o.weight ?? 1)))
    const paid = mockSeller.balanceIdr >= cost
    if (paid) mockSeller.balanceIdr -= cost
    const batch_id = hex24()
    const order: MockOrder = {
      _id: hex24(),
      ORDER_ID: `MGT-${digits(8)}`,
      cnote_no: paid ? awbFor(courier) : null,
      batch: `B-${batch_id.slice(0, 6).toUpperCase()}`,
      batch_id,
      isPaid: paid,
      status: paid ? "PENDING PICKUP" : "UNPAID",
      statusCategory: paid ? "PENDING PICKUP" : "ACTIVE",
      destinationMark: String(o.destinationMark ?? ""),
      DESTINATION_CODE: "BDO-CBL02",
      WEIGHT: String(o.weight),
      COD_FEE: o.COD === undefined ? "0" : String(Math.ceil((Number(o.COD) * 0.028) / 1000) * 1000),
      courier,
      cost,
      history: [{ date: jakartaNow(), statusCategory: paid ? "PENDING PICKUP" : "ACTIVE" }],
    }
    mockCreated.set(order.ORDER_ID, order)
    const resBody = { success: true, data: [order], batch_id, batch: order.batch, errors: [] }
    if (fault === "replayed_5xx") {
      idempotent.set(key, { status: 502, body: { success: false, code: "UPSTREAM_ERROR", message: "partial" } })
      return new Response(JSON.stringify({ success: false, code: "UPSTREAM_ERROR", message: "partial" }), { status: 502, headers: { "content-type": "application/json", "idempotent-replayed": "true" } })
    }
    idempotent.set(key, { status: 200, body: resBody })
    if (fault === "timeout_after_create") throw Object.assign(new Error("timeout"), { name: "TimeoutError" })
    return json(200, resBody)
  }
  if (/^\/api\/public\/[^/]+\/invoices$/.test(p)) {
    mockSeller.invoiceCalls++
    if (mockFaults.invoices === "error") {
      delete mockFaults.invoices
      return json(503, { success: false, code: "UPSTREAM_ERROR", message: "unavailable" })
    }
    // Newest first; cursor = index of the next item; optional dateRange filters on createdAt (WIB day).
    const size = Math.min(50, Number(url.searchParams.get("size") ?? "50"))
    const start = Number(url.searchParams.get("cursor") ?? "0")
    const range = url.searchParams.get("dateRange")
    // Per seller: rows tagged with `_seller` belong only to that key (a shared dev server serves many gerai).
    const sellerKey = decodeURIComponent(p.split("/")[3] ?? "")
    let list = mockInvoices.filter((i) => i._seller === undefined || i._seller === sellerKey).map(({ _seller: _s, ...rest }) => rest).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    if (range) {
      const r = JSON.parse(range) as { startDate: string; endDate: string }
      const day = (s: unknown) => new Date(Date.parse(String(s)) + 7 * 3600_000).toISOString().slice(0, 10)
      list = list.filter((i) => day(i.createdAt) >= r.startDate && day(i.createdAt) <= r.endDate)
    }
    const page = list.slice(start, start + size)
    const next = start + size < list.length ? String(start + size) : null
    const newestCleared = list.find((i) => i.status === "statusCleared")
    return json(200, { success: true, data: page, balance: (newestCleared?.balanceAmount as number | undefined) ?? null, nextCursor: next })
  }
  if (/^\/api\/public\/[^/]+\/order\/pay-unpaid$/.test(p)) {
    mockSeller.payUnpaidCalls++
    const hit = [...mockCreated.values()].filter((o) => o.batch_id === body.batch_id && !o.isPaid)
    const need = hit.reduce((n, o) => n + o.cost, 0)
    if (mockSeller.balanceIdr < need) return json(402, { success: false, code: "INSUFFICIENT_BALANCE", message: "Saldo tidak cukup" })
    mockSeller.balanceIdr -= need
    for (const o of hit) {
      o.isPaid = true
      o.cnote_no = awbFor(o.courier)
      o.status = "PENDING PICKUP"
      o.statusCategory = "PENDING PICKUP"
      o.history.push({ date: jakartaNow(), statusCategory: "PENDING PICKUP" })
    }
    return json(200, { success: true, data: { count: hit.length, cnote_no: hit.map((o) => o.cnote_no) } })
  }
  if (/^\/api\/public\/[^/]+\/order$/.test(p) && init?.method === "DELETE") {
    mockSeller.deleteCalls++
    const fault = mockFaults.deleteOrder
    delete mockFaults.deleteOrder
    if (fault === "refused") return json(400, { success: false, code: "CANNOT_CANCEL", message: "Order sudah dijemput" })
    for (const id of body.ids ?? []) {
      const o = mockCreated.get(id) ?? [...mockCreated.values()].find((x) => x._id === id || x.cnote_no === id)
      if (o && ["PENDING PICKUP", "ACTIVE", "UNPAID"].includes(o.status)) {
        if (o.isPaid) mockSeller.balanceIdr += o.cost
        o.status = "CANCELED"
        o.statusCategory = "CANCELED"
        o.history.push({ date: jakartaNow(), statusCategory: "CANCELED" })
      }
    }
    if (fault === "timeout_after_delete") throw Object.assign(new Error("timeout"), { name: "TimeoutError" })
    return json(200, { success: true })
  }
  if (/^\/api\/public\/[^/]+\/order\/estimate$/.test(p)) {
    // Deterministic offline tariffs: price grows with weight; codFee = 2.8 % of COD_AMOUNT rounded up to Rp1.000
    // (a step function, so fee-inclusive modes reach a fixed point in two or three passes, as on Mengantar);
    // `mockCodFeeUnstable` makes every call return a different fee.
    const weight = Math.max(1, Math.ceil(Number(url.searchParams.get("weight") ?? "1")))
    const cod = url.searchParams.get("COD_AMOUNT")
    const codAmount = cod === null ? null : Number(cod)
    const only = url.searchParams.get("courier") ?? "all"
    const keys = ["JNE", "JNECargo", "SiCepat", "SiCepatCargo", "Sap", "SapCargo", "iDexpress", "iDexpressCargo", "JT", "lion", "anteraja", "pos", "spx"]
    const base: Record<string, number> = { JNE: 12000, SiCepat: 13000, Sap: 11000, iDexpress: 11500, JT: 12500, lion: 11200, anteraja: 12800, pos: 14000, spx: 11800 }
    const data: Record<string, unknown> = {}
    for (const k of keys) {
      if (only !== "all" && k !== only && k !== `${only}Cargo`) continue
      const bps = mockDiscountBps.get(k) ?? 2000
      const fee = codAmount === null ? 0 : mockCodFeeUnstable.on ? ++mockCodFeeUnstable.n * 37 : Math.ceil((codAmount * 0.028) / 1000) * 1000
      if (k.endsWith("Cargo")) {
        const cargoPrice = 60000 + Math.max(0, weight - 5) * 6000
        const cargoDiscount = Math.floor((cargoPrice * bps) / 10000)
        data[k] = { unsupported: false, unsupported_cod: true, price: 0, discountPercent: 0, discount: 0, codFee: 0, cargoPrice, cargoDiscount, cargoEstimatedPrice: cargoPrice, cargoEstimatedSpecialPrice: cargoPrice - cargoDiscount, minimumWeightCargo: 5, estimate_delivery: "3 - 5 hari" }
        continue
      }
      const price = base[k]! * weight
      const discount = Math.floor((price * bps) / 10000)
      data[k] = {
        unsupported: mockUnsupported.has(k),
        unsupported_cod: false,
        unsupportedPickup: k === "SiCepat" && mockUnsupported.has("SiCepatPickup"),
        price,
        discountPercent: bps / 100,
        discount,
        codFee: fee,
        estimatedPrice: price + fee,
        estimatedSpecialPrice: price - discount + fee,
        estimate_delivery: k === "SiCepat" ? "1 - 2 hari" : "2 - 3 hari",
      }
    }
    return json(200, { success: true, data })
  }
  if (p.endsWith("/address/search")) {
    const kw = (url.searchParams.get("keyword") ?? "").toLowerCase()
    const areas = [
      { _id: "5fc62f5df8f44b34aa4c0d8c", PROVINCE_NAME: "Jawa Barat", CITY_NAME: "Kota Bandung", DISTRICT_NAME: "Coblong", SUBDISTRICT_NAME: "Dago", ZIP_CODE: "40135" },
      { _id: "5fc64714f8f44b34aa4cdd60", PROVINCE_NAME: "DKI Jakarta", CITY_NAME: "Jakarta Selatan", DISTRICT_NAME: "Tebet", SUBDISTRICT_NAME: "Tebet Barat", ZIP_CODE: "12810" },
      { _id: "5fc63038f8f44b34aa4c1cc4", PROVINCE_NAME: "Jawa Timur", CITY_NAME: "Kota Surabaya", DISTRICT_NAME: "Gubeng", SUBDISTRICT_NAME: "Airlangga", ZIP_CODE: "60286" },
    ].filter((a) => kw.length >= 3 && Object.values(a).some((v) => String(v).toLowerCase().includes(kw)))
    return json(200, { success: true, data: areas })
  }
  return json(404, { success: false, message: "mock: route not implemented" })
}

export function resetMock() {
  sellers.clear()
  mockOrders.clear()
  mockDiscountBps.clear()
  mockUnsupported.clear()
  mockCreated.clear()
  idempotent.clear()
  Object.assign(mockSeller, { balanceIdr: 1_000_000, createCalls: 0, payUnpaidCalls: 0, deleteCalls: 0, invoiceCalls: 0 })
  mockInvoices.length = 0
  mockCodFeeUnstable.on = false
  mockCodFeeUnstable.n = 0
  for (const k of Object.keys(mockFaults)) delete mockFaults[k as keyof typeof mockFaults]
}
