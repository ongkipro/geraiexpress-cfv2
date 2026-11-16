// Mengantar Public API client (TASK-201, DEC-204, ARCHITECTURE §4). Server only. Every response is Zod-parsed with
// `.passthrough()` so unknown fields are kept raw for audit; every call goes through the redacting transport.
import { z } from "zod"
import { MengantarError, request, type RawResponse, type TransportOptions } from "./transport"

export { MengantarError, scrubKey, KEY_PLACEHOLDER } from "./transport"
export type { TransportOptions } from "./transport"

// ---------------------------------------------------------------------------------------------------------------
// Schemas

const num = z.number()
const numOrNull = z.number().nullable().optional()

export const CourierRateSchema = z
  .object({
    unsupported: z.boolean().nullable().optional(),
    unsupported_cod: z.boolean().nullable().optional(),
    price: numOrNull,
    discountPercent: numOrNull,
    discount: numOrNull,
    // v2.0.0: an extra promo on top of the seller discount; `estimatedSpecialPrice` already nets both.
    discountExtra: numOrNull,
    discountExtraPercent: numOrNull,
    cargoDiscountPercent: numOrNull,
    cargoDiscountExtra: numOrNull,
    cargoDiscountExtraPercent: numOrNull,
    codFee: numOrNull,
    estimatedPrice: numOrNull,
    estimatedSpecialPrice: numOrNull,
    cargoPrice: numOrNull,
    cargoDiscount: numOrNull,
    cargoEstimatedPrice: numOrNull,
    cargoEstimatedSpecialPrice: numOrNull,
    minimumWeightCargo: numOrNull,
    isDangerousGoodsSupported: z.boolean().nullable().optional(),
    unsupportedOriginSpx: z.boolean().nullable().optional(),
    unsupportedPickup: z.boolean().nullable().optional(),
    estimate_delivery: z.string().nullable().optional(),
    estimatedDate: z.string().nullable().optional(),
    /** `spx` only: open pickup slots by `YYYY-MM-DD` (v2.0.0). */
    pickupSchedule: z.record(z.string(), z.array(z.object({ start: z.string(), end: z.string() }).passthrough())).nullable().optional(),
  })
  .passthrough()
export type CourierRate = z.infer<typeof CourierRateSchema>

/** `courier=all` answers a map keyed by rate keys (`JNE`, `JNECargo`, `SAPLite`, …), a single courier one object. */
export const EstimateSchema = z.object({ success: z.literal(true), data: z.union([z.record(z.string(), CourierRateSchema), CourierRateSchema]) }).passthrough()

export const AreaSchema = z
  .object({
    _id: z.string(),
    COUNTRY_NAME: z.string().optional(),
    PROVINCE_NAME: z.string().optional(),
    CITY_NAME: z.string().optional(),
    DISTRICT_NAME: z.string().optional(),
    SUBDISTRICT_NAME: z.string().optional(),
    ZIP_CODE: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough()
export const AreaSearchSchema = z.object({ success: z.literal(true), data: z.array(AreaSchema) }).passthrough()

export const OrderItemSchema = z
  .object({
    _id: z.string().optional(),
    ORDER_ID: z.string().optional(),
    cnote_no: z.string().nullable().optional(),
    batch: z.string().nullable().optional(),
    batch_id: z.string().nullable().optional(),
    isPaid: z.boolean().optional(),
    status: z.string().optional(),
    statusCategory: z.string().nullable().optional(),
    destinationMark: z.string().nullable().optional(),
    DESTINATION_CODE: z.string().nullable().optional(),
    WEIGHT: z.union([z.string(), z.number()]).nullable().optional(),
    COD_FEE: z.union([z.string(), z.number()]).nullable().optional(),
    COD_AMOUNT: z.union([z.string(), z.number()]).nullable().optional(),
    estimatedSpecialPrice: numOrNull,
    history: z.array(z.object({ date: z.string(), status: z.string().optional(), statusCategory: z.string().optional() }).passthrough()).optional(),
  })
  .passthrough()
export type OrderItem = z.infer<typeof OrderItemSchema>

export const CreateOrderSchema = z
  .object({
    success: z.boolean(),
    data: z.array(OrderItemSchema).default([]),
    batch_id: z.string().nullable().optional(),
    batch: z.string().nullable().optional(),
    errors: z.array(z.unknown()).optional(),
    ordersClosedDestination: z.array(z.unknown()).optional(),
    idempotentReplayed: z.boolean().optional(),
  })
  .passthrough()
export type CreateOrderResult = z.infer<typeof CreateOrderSchema>

export const OrderListSchema = z
  .object({
    success: z.literal(true),
    data: z.union([z.array(OrderItemSchema), OrderItemSchema]),
    nextCursor: z.string().nullable().optional(),
  })
  .passthrough()

export const InvoiceItemSchema = z
  .object({
    _id: z.string().optional(),
    type: z.string().optional(),
    amount: num.optional(),
    balanceAmount: numOrNull,
    createdAt: z.string().optional(),
    subItems: z.array(z.object({ amount: num.optional() }).passthrough()).optional(),
  })
  .passthrough()
export const InvoicesSchema = z
  .object({
    success: z.literal(true),
    data: z.array(InvoiceItemSchema),
    balance: numOrNull,
    nextCursor: z.string().nullable().optional(),
  })
  .passthrough()
export type InvoicesResult = z.infer<typeof InvoicesSchema>

export const SaveAddressSchema = z.object({ success: z.literal(true), _id: z.string().optional(), data: z.object({ _id: z.string() }).passthrough().optional() }).passthrough()
export const PayUnpaidSchema = z.object({ success: z.literal(true), data: z.object({ count: num.optional(), cnote_no: z.array(z.string()).optional() }).passthrough().optional() }).passthrough()
export const DeleteOrderSchema = z.object({ success: z.boolean() }).passthrough()

const CourierScoreSchema = z.object({ total: numOrNull, delivered: numOrNull, rts: numOrNull, undelivered: numOrNull, inProgress: numOrNull, rate: numOrNull }).passthrough()
/** GET /getReceiverScoreByNumberUser — COD history across every Mengantar seller; `average_score` may carry `≈`. */
export const ReceiverScoreSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        phone: z.string().optional(),
        summary: z.object({ average_number: z.number().nullable().optional(), average_score: z.string().nullable().optional() }).passthrough().nullable().optional(),
      })
      .catchall(z.unknown()),
  })
  .passthrough()
export interface ReceiverScore {
  /** `A`..`E-`, or null when no courier has data (`-`). */
  grade: string | null
  /** True when Mengantar marked the grade `≈` (fewer than 4 transactions combined). */
  approximate: boolean
  /** Average delivered rate on a 0–10 scale; null without data. */
  averageRate: number | null
  /** COD orders counted across couriers (delivered + rts + undelivered). */
  total: number
  delivered: number
  rts: number
}

export const DropshipperSchema = z.object({ id: z.string(), name: z.string(), phone: z.string() }).passthrough()
export const DropshipperSaveSchema = z.object({ success: z.literal(true), data: DropshipperSchema }).passthrough()
export const DropshipperListSchema = z.object({ success: z.literal(true), data: z.array(DropshipperSchema).default([]) }).passthrough()
export const SimulationSchema = z.object({ success: z.literal(true), data: z.object({ orderId: z.string().optional(), trackingNumber: z.string().nullable().optional(), statusCategory: z.string().optional() }).passthrough() }).passthrough()

// ---------------------------------------------------------------------------------------------------------------
// Client

/** Shipment names accepted by estimate/order (case-sensitive per Mengantar docs). */
export const COURIERS = ["JNE", "SiCepat", "Sap", "iDexpress", "JT", "lion", "anteraja", "pos", "spx"] as const
export type Courier = (typeof COURIERS)[number]

function parse<T>(schema: z.ZodType<T>, raw: RawResponse, path: string): T {
  const r = schema.safeParse(raw.json)
  if (!r.success) {
    const body = raw.json as { message?: unknown } | null
    // Never echo provider text (it may contain the keyed URL and is not Indonesian UI copy).
    void body
    throw new MengantarError("envelope", path, raw.status, "UNEXPECTED_SHAPE", "Respons Mengantar tidak sesuai format.")
  }
  return r.data
}

export interface EstimateQuery {
  originId: string
  destinationId: string
  courier: Courier | "all"
  /** Integer kg or decimal kg for sub-kg services (spec 02 §1). */
  weightKg: number
  codAmountIdr?: number
  dangerousGoods?: boolean
}

/** `SAP` / `SAPLite` / `JTEco` rate keys (courier=all) mapped to the catalog code; booking courier for each code. */
export const RATE_KEY_ALIASES: Record<string, string> = { SAP: "Sap", SAPCargo: "SapCargo" }
export const BOOKING_COURIER: Record<string, { courier: Courier; eco?: true; cargo?: true }> = {
  JTEco: { courier: "JT", eco: true },
  SAPLite: { courier: "Sap" },
}

export interface CreateOrderInput {
  courier: Courier
  /** `time_id` and `volume` are required for `scheduledPickup` and must be omitted for `dropOff` (v2.0.0). */
  pickup: { type: "scheduledPickup"; address_id: string; time_id: string; volume: PickupVolume } | { type: "dropOff"; address_id: string }
  orders: Array<Record<string, unknown>>
}

export type PickupVolume = "volumeMotor" | "volumeMobil" | "volumeTruck"

/** Vehicle for a scheduled pickup from the batch's billable weight (< 20 kg motor, < 100 kg car, else truck). */
export const pickupVolume = (billableGram: number): PickupVolume => (billableGram < 20_000 ? "volumeMotor" : billableGram < 100_000 ? "volumeMobil" : "volumeTruck")

/** WIB wall clock (UTC+7, no DST). */
const wib = (ms: number) => {
  const d = new Date(ms + 7 * 3_600_000)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes() }
}
const pad = (n: number) => String(n).padStart(2, "0")

/**
 * Next pickup slot for `POST /time`: the earliest whole hour 09:00–18:00 WIB at least `leadMinutes` (default 120, stricter
 * than Mengantar's 90) from now; after the cut-off it rolls to 10:00 the next day. `spxWindows` (estimate
 * `pickupSchedule`) narrows the choice to an open SPX slot. Returns `date` as MM-DD-YYYY and `time` as `HH:00`.
 */
export function nextPickupSlot(nowMs: number, leadMinutes = 120, spxWindows?: Record<string, Array<{ start: string; end: string }>> | null): { date: string; time: string; startsAtMs: number } | null {
  for (let day = 0; day < 3; day++) {
    const base = wib(nowMs + day * 86_400_000)
    const firstHour = day === 0 ? 9 : 10
    for (let h = firstHour; h <= 18; h++) {
      const startsAtMs = Date.UTC(base.y, base.m - 1, base.d, h - 7, 0)
      if (startsAtMs - nowMs < leadMinutes * 60_000) continue
      const iso = `${base.y}-${pad(base.m)}-${pad(base.d)}`
      if (spxWindows) {
        const slots = spxWindows[iso] ?? []
        const hh = `${pad(h)}:00`
        if (!slots.some((s) => s.start <= hh && hh < s.end)) continue
      }
      return { date: `${pad(base.m)}-${pad(base.d)}-${base.y}`, time: `${pad(h)}:00`, startsAtMs }
    }
  }
  return null
}

/** Pos Indonesia COD eligibility refusal (403 with `status` new_seller / insufficient / blocked), else null. */
export function posCodRefusal(err: unknown): { status: "new_seller" | "insufficient" | "blocked"; deliveredRate: number | null; minimumDeliveredRate: number } | null {
  if (!(err instanceof MengantarError) || err.status !== 403) return null
  const b = err.body as { status?: unknown; deliveredRate?: unknown; minimumDeliveredRate?: unknown } | null
  if (b?.status !== "new_seller" && b?.status !== "insufficient" && b?.status !== "blocked") return null
  return { status: b.status, deliveredRate: typeof b.deliveredRate === "number" ? b.deliveredRate : null, minimumDeliveredRate: typeof b.minimumDeliveredRate === "number" ? b.minimumDeliveredRate : 82 }
}

const GRADE = /^(≈)?\s*([A-E]-?)$/

/** Parses the receiver-score response into a stable shape (grade without the `≈`, totals across couriers). */
export function receiverScoreOf(data: z.infer<typeof ReceiverScoreSchema>["data"]): ReceiverScore {
  const raw = (data.summary?.average_score ?? "-").trim()
  const m = GRADE.exec(raw)
  let total = 0
  let delivered = 0
  let rts = 0
  for (const [k, v] of Object.entries(data)) {
    if (k === "summary" || !v || typeof v !== "object") continue
    const c = CourierScoreSchema.safeParse(v)
    if (!c.success) continue
    total += c.data.total ?? 0
    delivered += c.data.delivered ?? 0
    rts += c.data.rts ?? 0
  }
  return { grade: m ? m[2]! : null, approximate: !!m?.[1], averageRate: data.summary?.average_number ?? null, total, delivered, rts }
}

export class MengantarPublicClient {
  constructor(private readonly opts: TransportOptions) {}

  async searchArea(keyword: string) {
    const raw = await request(this.opts, { method: "GET", path: "/address/search", query: { keyword } })
    return parse(AreaSearchSchema, raw, "/address/search").data
  }

  async estimate(q: EstimateQuery) {
    const raw = await request(this.opts, {
      method: "GET",
      path: "/order/estimate",
      query: { origin_id: q.originId, destination_id: q.destinationId, courier: q.courier, weight: q.weightKg, COD_AMOUNT: q.codAmountIdr, isDangerousGoods: q.dangerousGoods ? "true" : undefined },
    })
    const data = parse(EstimateSchema, raw, "/order/estimate").data
    // Normalise to a map keyed by rate key.
    return ("price" in data || "unsupported" in data ? { [q.courier]: data as CourierRate } : (data as Record<string, CourierRate>)) as Record<string, CourierRate>
  }

  /** POST /address: registers (or updates with `_id`) a pickup address from an area id; returns the address `_id`. */
  /** POST /address (add) or PUT /address/{id} (update). v2.0.0 fields: `PICKUP_PIC` + `PICKUP_PIC_PHONE` are required on add;
   *  `pinpointData` is required for a Pos Indonesia scheduled pickup. */
  async saveAddress(input: { _id?: string; areaId: string; name: string; pic?: string; phone: string; address: string; pinpoint?: { lat: number; lng: number } | null }): Promise<string> {
    const body = { PICKUP_AUTOFILL: input.areaId, PICKUP_NAME: input.name, PICKUP_PIC: input.pic ?? input.name, PICKUP_PIC_PHONE: input.phone, PICKUP_ADDRESS: input.address, ...(input.pinpoint ? { pinpointData: input.pinpoint } : {}) }
    const path = input._id ? `/address/${encodeURIComponent(input._id)}` : "/address"
    const raw = await request(this.opts, { method: input._id ? "PUT" : "POST", path, body })
    const out = parse(SaveAddressSchema, raw, "/address")
    const id = out.data?._id ?? out._id
    if (!id) throw new MengantarError("envelope", "/address", raw.status, "UNEXPECTED_SHAPE", "Alamat jemput tidak tersimpan di Mengantar.")
    return id
  }

  /** POST /time: reserves one pickup slot (`date` MM-DD-YYYY, `time` two-digit hour "09:00".."20:00"); returns its `_id`. */
  async reserveTime(addressId: string, date: string, time: string): Promise<string> {
    if (!/^\d{2}-\d{2}-\d{4}$/.test(date) || !/^(09|1\d|20):00$/.test(time)) throw new MengantarError("envelope", "/time", null, "PICKUP_TIME_INVALID", "Jam penjemputan tidak valid.")
    const raw = await request(this.opts, { method: "POST", path: "/time", body: { address_id: addressId, date, time } })
    const out = parse(SaveAddressSchema, raw, "/time")
    const id = out.data?._id ?? out._id
    if (!id) throw new MengantarError("envelope", "/time", raw.status, "UNEXPECTED_SHAPE", "Slot penjemputan tidak tersedia.")
    return id
  }

  /** POST /order with the mandatory idempotencyKey (1–50 chars). Replays are surfaced via `idempotentReplayed`. */
  async createOrder(input: CreateOrderInput, idempotencyKey: string): Promise<CreateOrderResult> {
    if (!/^\S.{0,48}\S$|^\S$/.test(idempotencyKey) || idempotencyKey.length > 50) throw new MengantarError("envelope", "/order", null, "IDEMPOTENCY_KEY_INVALID", "Kunci idempotensi tidak valid.")
    const raw = await request(this.opts, { method: "POST", path: "/order", body: input, headers: { idempotencyKey }, timeoutMs: 15_000 })
    const out = parse(CreateOrderSchema, raw, "/order")
    if (raw.headers.get("idempotent-replayed") === "true") out.idempotentReplayed = true
    return out
  }

  /** Read-back by ORDER_ID or AWB (history in Asia/Jakarta `DD-MM-YYYY HH:mm`). */
  async getOrder(by: { orderId: string } | { trackingId: string }): Promise<OrderItem | null> {
    const raw = await request(this.opts, { method: "GET", path: "/order", query: "orderId" in by ? { order_id: by.orderId } : { tracking_id: by.trackingId } })
    const data = parse(OrderListSchema, raw, "/order").data
    const item = Array.isArray(data) ? data[0] : data
    return item ?? null
  }

  /** Listing by batch code / destinationMark search with cursor pagination. */
  async listOrders(query: { batch?: string; keyword?: string; size?: number; cursor?: string | null }) {
    const raw = await request(this.opts, { method: "GET", path: "/order", query: { batch: query.batch, keyword: query.keyword, size: query.size ?? 100, cursor: query.cursor ?? undefined } })
    const p = parse(OrderListSchema, raw, "/order")
    return { items: Array.isArray(p.data) ? p.data : [p.data], nextCursor: p.nextCursor ?? null }
  }

  async invoices(query: { cursor?: string | null; size?: number; invoiceFilter?: string; dateRange?: { startDate: string; endDate: string } }): Promise<InvoicesResult> {
    const raw = await request(this.opts, {
      method: "GET",
      path: "/invoices",
      query: { size: query.size ?? 50, cursor: query.cursor ?? undefined, invoiceFilter: query.invoiceFilter ?? "all", dateRange: query.dateRange ? JSON.stringify(query.dateRange) : undefined },
    })
    return parse(InvoicesSchema, raw, "/invoices")
  }

  async payUnpaid(courier: Courier, batchId: string) {
    if (!/^[0-9a-f]{24}$/i.test(batchId)) throw new MengantarError("envelope", "/order/pay-unpaid", null, "BATCH_ID_INVALID", "batch_id tidak valid.")
    const raw = await request(this.opts, { method: "POST", path: "/order/pay-unpaid", body: { courier, batch_id: batchId } })
    return parse(PayUnpaidSchema, raw, "/order/pay-unpaid")
  }

  /** GET /getReceiverScoreByNumberUser: one phone per call. 403 (not whitelisted) and 429 (daily limit) are thrown. */
  async receiverScore(phone: string): Promise<ReceiverScore> {
    const digits = phone.replace(/\D/g, "")
    if (digits.length < 8 || digits.length > 15) throw new MengantarError("envelope", "/getReceiverScoreByNumberUser", null, "PHONE_INVALID", "Nomor HP tidak valid.")
    const raw = await request(this.opts, { method: "GET", path: "/getReceiverScoreByNumberUser", query: { search: digits } })
    return receiverScoreOf(parse(ReceiverScoreSchema, raw, "/getReceiverScoreByNumberUser").data)
  }

  /** POST /dropshippers: idempotent on exact (name, phone); 403 when the feature is off for the seller account. */
  async saveDropshipper(name: string, phone: string) {
    const raw = await request(this.opts, { method: "POST", path: "/dropshippers", body: { name: name.trim(), phone: phone.trim() } })
    return parse(DropshipperSaveSchema, raw, "/dropshippers").data
  }

  async searchDropshippers(search: string, page = 1) {
    const q = search.replace(/[()[\]{}]/g, "").trim()
    const raw = await request(this.opts, { method: "GET", path: "/dropshippers", query: { search: q || undefined, page, perPage: 20 } })
    return parse(DropshipperListSchema, raw, "/dropshippers").data
  }

  /** POST /order/simulation (sandbox only; 404 in production): moves one order to ON DELIVERY / DELIVERED / RTS. */
  async simulateStatus(courier: Courier, orderId: string, statusCategory: "ON DELIVERY" | "DELIVERED" | "RTS") {
    const raw = await request(this.opts, { method: "POST", path: "/order/simulation", body: { courier, orderId, statusCategory } })
    return parse(SimulationSchema, raw, "/order/simulation").data
  }

  async deleteOrders(courier: Courier, ids: string[]) {
    const raw = await request(this.opts, { method: "DELETE", path: "/order", body: { courier, ids } })
    return parse(DeleteOrderSchema, raw, "/order")
  }
}
