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
  deleteOrder?: "timeout_after_delete" | "timeout_before_delete" | "refused"
  readBack?: "timeout"
  /** `GET /order` for these order ids times out (every call while set). */
  readBackFailFor?: Set<string>
  /** `GET /order` for these order ids shows them still unpaid (a lagging provider view) while set. */
  readBackLagFor?: Set<string>
  invoices?: "error"
  /** `sellers/list` ignores the externalUserId filter and returns every seller (loose provider filter). */
  listIgnoresFilter?: true
  /** Every Public API call answers `403 IP_NOT_ALLOWED` (DEC-232 alert drill). */
  publicIpNotAllowed?: true
  /** `POST /address` waits on this promise first (tests interleave a request while dispatch is awaiting). */
  addressGate?: Promise<void>
  /** Pos Indonesia COD create-order answers 403 with this eligibility status (create-order "Pos Indonesia"). */
  posCod?: "new_seller" | "insufficient" | "blocked"
  /** `GET /getReceiverScoreByNumberUser` answers 403 (not whitelisted) or 429 (daily limit). */
  receiverScore?: 403 | 429
  /** `/dropshippers` answers 403 "feature not enabled". */
  dropshipperDisabled?: true
} = {}

/** Requests the mock received, for contract assertions (path without the key, method, parsed body). */
export const mockLog: Array<{ path: string; method: string; body: Record<string, unknown> }> = []
/** Extra promo per rate key in bps (v2.0.0 `discountExtra`, already netted in `estimatedSpecialPrice`). */
export const mockDiscountExtraBps = new Map<string, number>()
/** Saved pickup addresses by `_id` (to validate `pinpointData` for a Pos scheduled pickup). */
const mockAddresses = new Map<string, Record<string, unknown>>()
const mockTimes = new Set<string>()
const mockDropshippers = new Map<string, { id: string; name: string; phone: string }>()

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
  if (p.startsWith("/api/public/")) mockLog.push({ path: p.replace(/^\/api\/public\/[^/]+/, ""), method: init?.method ?? "GET", body })
  if (mockFaults.publicIpNotAllowed && p.startsWith("/api/public/")) return json(403, { success: false, code: "IP_NOT_ALLOWED", message: "IP not allowed" })
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
    const all = [...sellers.entries()].map(([k, v]) => ({ ...v, externalUserId: k, active: true }))
    const list = mockFaults.listIgnoresFilter ? all : body.externalUserId ? (s ? [{ ...s, externalUserId: body.externalUserId, active: true }] : []) : all
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
    if (mockFaults.readBackFailFor?.has(id)) throw Object.assign(new Error("timeout"), { name: "TimeoutError" })
    const created = mockCreated.get(id) ?? [...mockCreated.values()].find((o) => o.cnote_no === id)
    if (created && mockFaults.readBackLagFor?.has(created.ORDER_ID)) return json(200, { success: true, data: { ...created, isPaid: false, cnote_no: null, status: "UNPAID" } })
    if (created) return json(200, { success: true, data: created })
    const o = mockOrders.get(id)
    return o ? json(200, { success: true, data: o }) : json(404, { success: false, code: "ORDER_NOT_FOUND", message: "not found" })
  }
  if (/^\/api\/public\/[^/]+\/address$/.test(p) && init?.method === "POST" && mockFaults.addressGate) {
    const gate = mockFaults.addressGate
    delete mockFaults.addressGate
    await gate
  }
  if (/^\/api\/public\/[^/]+\/address(\/[0-9a-f]{24})?$/.test(p) && (init?.method === "POST" || init?.method === "PUT")) {
    // v2.0.0 add-users-address: PICKUP_PIC and PICKUP_PIC_PHONE are required when adding.
    for (const f of ["PICKUP_NAME", "PICKUP_PIC", "PICKUP_PIC_PHONE", "PICKUP_ADDRESS", "PICKUP_AUTOFILL"]) if (init.method === "POST" && !body[f]) return json(400, { success: false, field: f, message: `${f} is required` })
    const id = p.split("/")[5] ?? hex24()
    mockAddresses.set(id, { ...(mockAddresses.get(id) ?? {}), ...body })
    return json(200, { success: true, data: { _id: id } })
  }
  if (/^\/api\/public\/[^/]+\/time$/.test(p) && init?.method === "POST") {
    if (!/^\d{2}-\d{2}-\d{4}$/.test(String(body.date))) return json(400, { success: false, message: "Error on add time" })
    if (!/^(09|1\d|20):00$/.test(String(body.time))) return json(400, { success: false, message: "Time allowed 09:00, 10:00, 11:00, 12:00, 13:00, 14:00, 15:00, 16:00, 17:00, 18:00, 19:00, 20:00" })
    if (!mockAddresses.has(String(body.address_id))) return json(404, { success: false, message: "address not found" })
    const id = hex24()
    mockTimes.add(id)
    return json(200, { success: true, data: { _id: id, date: body.date, time: body.time } })
  }
  if (/^\/api\/public\/[^/]+\/getReceiverScoreByNumberUser$/.test(p)) {
    if (mockFaults.receiverScore === 403) return json(403, { success: false, message: "Not allowed" })
    if (mockFaults.receiverScore === 429) return json(429, { success: false, message: "Daily limit reached" })
    const search = url.searchParams.getAll("search")
    if (search.length !== 1 || !search[0]) return json(422, { success: false, message: "Missing 'search' in the query param." })
    const phone = search[0].replace(/^(\+?62|0)/, "")
    if (phone.endsWith("0")) return json(200, { success: true, data: { JNE: {}, JT: {}, summary: { average_number: null, average_score: "-" } } })
    const rts = Number(phone.at(-1)) % 4
    const total = 10
    const rate = Math.round(((total - rts) * 100) / total) / 10
    const grade = rate >= 9 ? "A" : rate >= 8 ? "A-" : rate >= 7 ? "B" : "B-"
    return json(200, { success: true, data: { phone, JNE: { total, value: 1000000, inProgress: 0, delivered: total - rts, rts, undelivered: 0, rate }, summary: { average_number: rate, average_score: phone.endsWith("1") ? `≈${grade}` : grade } } })
  }
  if (/^\/api\/public\/[^/]+\/dropshippers$/.test(p)) {
    if (mockFaults.dropshipperDisabled) return json(403, { success: false, message: "Dropshipper Feature is not enabled. Enable it through Seller Web." })
    if (init?.method === "POST") {
      const name = String(body.name ?? "").trim()
      const phone = String(body.phone ?? "").trim()
      if (!name || !phone) return json(400, { success: false, message: "Missing fields: name, phone" })
      const k = `${name}|${phone}`
      const existing = mockDropshippers.get(k) ?? { id: hex24(), name, phone }
      mockDropshippers.set(k, existing)
      return json(201, { success: true, data: existing })
    }
    const q = (url.searchParams.get("search") ?? "").toLowerCase()
    return json(200, { success: true, data: [...mockDropshippers.values()].filter((d) => d.name.toLowerCase().startsWith(q) || d.phone.startsWith(q)) })
  }
  if (/^\/api\/public\/[^/]+\/order\/simulation$/.test(p) && init?.method === "POST") {
    const o = mockCreated.get(String(body.orderId)) ?? [...mockCreated.values()].find((x) => x.cnote_no === body.trackingId)
    if (!o) return json(404, { success: false, message: "Order not found" })
    const next = String(body.statusCategory ?? body.status)
    if (!["ON DELIVERY", "DELIVERED", "RTS"].includes(next)) return json(400, { success: false, message: "Invalid statusCategory" })
    const previous = o.statusCategory
    o.status = next
    o.statusCategory = next
    o.history.push({ date: jakartaNow(), statusCategory: next })
    return json(200, { success: true, data: { orderId: o.ORDER_ID, trackingNumber: o.cnote_no, courier: o.courier, previousStatusCategory: previous, statusCategory: next, history: o.history } })
  }
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
    const o = body.orders?.[0] ?? {}
    const courier = String(body.courier)
    // v2.0.0 create-order body rules the mock enforces (a real 400 would otherwise surface only against live sandbox).
    const pk = (body.pickup ?? {}) as Record<string, unknown>
    const bad = (message: string) => json(400, { success: false, message })
    if (pk.type === "scheduledPickup") {
      if (!mockTimes.has(String(pk.time_id))) return bad("invalid pickup time")
      if (!["volumeMotor", "volumeMobil", "volumeTruck"].includes(String(pk.volume))) return bad("pickup.volume is required")
      if (courier === "pos") {
        const pin = mockAddresses.get(String(pk.address_id))?.pinpointData as { lat?: unknown; lng?: unknown } | undefined
        if (typeof pin?.lat !== "number" || typeof pin?.lng !== "number") return bad("Pickup address must have pinpointData for courier pos")
      }
    } else if (pk.type === "dropOff") {
      if (courier === "anteraja") return bad("anteraja does not support dropOff")
    } else return bad("pickup.type is required")
    if (o.eco !== undefined && (courier !== "JT" || o.cargo || o.isDangerousGoods || typeof o.eco !== "boolean")) return bad("orders[0].eco is only available for courier JT")
    if (o.isDangerousGoods !== undefined && typeof o.isDangerousGoods !== "boolean") return bad("orders[0].isDangerousGoods must be a boolean")
    if (o.isDangerousGoods === true && o.cargo) return bad("Dangerous goods cannot be combined with cargo service")
    if (o.isDangerousGoods === true && !["SiCepat", "iDexpress"].includes(courier)) return bad(`Dangerous goods service is not supported by courier ${courier}`)
    if (o.COD === undefined && typeof o.goodsValue !== "number") return bad("goodsValue must be a number")
    if (["anteraja", "pos", "spx"].includes(courier) && o.COD === undefined && (o.goodsValue < 1000 || o.goodsValue > 10_000_000)) return bad("goodsValue out of range")
    const maxCod = ["Sap", "anteraja", "pos"].includes(courier) ? 2_000_000 : 5_000_000
    if (o.COD !== undefined && (o.COD < (courier === "lion" ? 10_000 : 1000) || o.COD > maxCod)) return bad("COD amount exceeds the courier limit")
    if (!Number.isInteger(o.quantity) || o.quantity < 1) return bad("orders[0].quantity must be a positive number")
    for (const f of ["price", "estimatedPrice", "estimatedSpecialPrice", "discount", "discountPercent", "discountExtra", "discountExtraPercent"]) if (f in o) return bad(`Fields not allowed in public API request: ${f}`)
    if (courier === "pos" && o.COD !== undefined && mockFaults.posCod) {
      const status = mockFaults.posCod
      return json(403, { success: false, message: "Pos Indonesia COD is not available for this account", status, deliveredRate: status === "new_seller" ? 0 : status === "insufficient" ? 40 : 70, minimumDeliveredRate: 82 })
    }
    mockSeller.createCalls++
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
    if (fault === "timeout_before_delete") throw Object.assign(new Error("timeout"), { name: "TimeoutError" })
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
    // v2.0.0 keys: `SAP` (not the booking courier `Sap`), `SAPLite`, `SapCargo`, and `JTEco` next to `JT` (courier=all).
    const dg = url.searchParams.get("isDangerousGoods") === "true"
    const keys = ["JNE", "JNECargo", "SiCepat", "SiCepatCargo", "SAP", "SAPLite", "SapCargo", "iDexpress", "iDexpressCargo", "JT", "JTEco", "lion", "anteraja", "pos", "spx"]
    const base: Record<string, number> = { JNE: 12000, SiCepat: 13000, SAP: 11000, SAPLite: 9000, iDexpress: 11500, JT: 12500, JTEco: 10500, lion: 11200, anteraja: 12800, pos: 14000, spx: 11800 }
    const forCourier: Record<string, string[]> = { Sap: ["SAP", "SapCargo"], JT: ["JT"] }
    const data: Record<string, unknown> = {}
    for (const k of keys) {
      if (only !== "all" && !(forCourier[only] ?? [only, `${only}Cargo`]).includes(k)) continue
      if (k === "JTEco" && (dg || mockUnsupported.has("JTEco"))) continue
      const bps = mockDiscountBps.get(k) ?? 2000
      const fee = codAmount === null ? 0 : mockCodFeeUnstable.on ? ++mockCodFeeUnstable.n * 37 : Math.ceil((codAmount * 0.028) / 1000) * 1000
      if (k.endsWith("Cargo")) {
        const cargoPrice = 60000 + Math.max(0, weight - 5) * 6000
        const cargoDiscount = Math.floor((cargoPrice * bps) / 10000)
        const cargoDiscountExtra = Math.floor((cargoPrice * (mockDiscountExtraBps.get(k) ?? 0)) / 10000)
        data[k] = { unsupported: false, unsupported_cod: true, price: 0, discountPercent: 0, discount: 0, codFee: 0, cargoPrice, cargoDiscount, cargoDiscountExtra, cargoEstimatedPrice: cargoPrice, cargoEstimatedSpecialPrice: cargoPrice - cargoDiscount - cargoDiscountExtra, minimumWeightCargo: 5, estimate_delivery: "3 - 5 hari" }
        continue
      }
      const price = base[k]! * weight
      const discount = Math.floor((price * bps) / 10000)
      const extraBps = mockDiscountExtraBps.get(k) ?? 0
      const discountExtra = Math.floor((price * extraBps) / 10000)
      const heavy = ["anteraja", "pos", "spx"].includes(k) && weight > 50
      data[k] = {
        unsupported: mockUnsupported.has(k) || heavy,
        unsupported_cod: false,
        unsupportedPickup: k === "SiCepat" && mockUnsupported.has("SiCepatPickup"),
        price,
        discountPercent: bps / 100,
        discount,
        codFee: fee,
        estimatedPrice: price + fee,
        discountExtra,
        discountExtraPercent: extraBps / 100,
        estimatedSpecialPrice: price - discount - discountExtra + fee,
        estimate_delivery: k === "SiCepat" ? "1 - 2 hari" : "2 - 3 hari",
        ...(dg ? { isDangerousGoodsSupported: k === "SiCepat" || k === "iDexpress" } : {}),
        ...(k === "spx" ? { pickupSchedule: spxSchedule() } : {}),
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

/** SPX open pickup windows for today and the next two days (WIB dates), 08:00–22:00. */
function spxSchedule() {
  const out: Record<string, Array<{ timeRangeId: number; start: string; end: string; timeEpoch: number }>> = {}
  for (let d = 0; d < 3; d++) out[new Date(Date.now() + 7 * 3600_000 + d * 86_400_000).toISOString().slice(0, 10)] = [{ timeRangeId: 1, start: "08:00", end: "22:00", timeEpoch: 0 }]
  return out
}

export function resetMock() {
  sellers.clear()
  mockOrders.clear()
  mockDiscountBps.clear()
  mockUnsupported.clear()
  mockCreated.clear()
  mockLog.length = 0
  mockDiscountExtraBps.clear()
  mockAddresses.clear()
  mockTimes.clear()
  mockDropshippers.clear()
  idempotent.clear()
  Object.assign(mockSeller, { balanceIdr: 1_000_000, createCalls: 0, payUnpaidCalls: 0, deleteCalls: 0, invoiceCalls: 0 })
  mockInvoices.length = 0
  mockCodFeeUnstable.on = false
  mockCodFeeUnstable.n = 0
  for (const k of Object.keys(mockFaults)) delete mockFaults[k as keyof typeof mockFaults]
}
