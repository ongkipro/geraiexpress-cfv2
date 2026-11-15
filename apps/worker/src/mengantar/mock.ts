// Deterministic offline Mengantar for local development and tests (spec 07 §2: never call live Mengantar without
// explicit sandbox keys). Shapes follow the recorded fixtures of TASK-201/202; values are synthetic.
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

/** Order read-back fixtures keyed by AWB or ORDER_ID (`history[].date` is Asia/Jakarta `DD-MM-YYYY HH:mm`). */
export const mockOrders = new Map<string, { cnote_no: string; ORDER_ID: string; statusCategory: string; history: Array<{ date: string; statusCategory: string }> }>()

/** Fault injection for tests: the next call to a route throws a timeout (after or before Mengantar applied it). */
export const mockFaults: { regenerate?: "timeout_after_apply" | "timeout_before_apply" | "error"; apiKey?: "timeout" } = {}

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
    const id = url.searchParams.get("tracking_id") ?? url.searchParams.get("order_id") ?? ""
    const o = mockOrders.get(id)
    return o ? json(200, { success: true, data: o }) : json(404, { success: false, code: "ORDER_NOT_FOUND", message: "not found" })
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
  for (const k of Object.keys(mockFaults)) delete mockFaults[k as keyof typeof mockFaults]
}
