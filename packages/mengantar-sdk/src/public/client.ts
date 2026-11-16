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

export interface CreateOrderInput {
  courier: Courier
  pickup: { type: "scheduledPickup" | "dropOff"; address_id: string; time_id?: string; volume: "volumeMotor" | "volumeMobil" | "volumeTruck" }
  orders: Array<Record<string, unknown>>
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
  async saveAddress(input: { _id?: string; areaId: string; name: string; phone: string; address: string; pinpoint?: { lat: number; lng: number } }): Promise<string> {
    const raw = await request(this.opts, {
      method: "POST",
      path: "/address",
      body: { ...(input._id ? { _id: input._id } : {}), PICKUP_AUTOFILL: input.areaId, PICKUP_NAME: input.name, PICKUP_PHONE: input.phone, PICKUP_ADDRESS: input.address, ...(input.pinpoint ? { pinpointData: input.pinpoint } : {}) },
    })
    const out = parse(SaveAddressSchema, raw, "/address")
    const id = out.data?._id ?? out._id
    if (!id) throw new MengantarError("envelope", "/address", raw.status, "UNEXPECTED_SHAPE", "Alamat jemput tidak tersimpan di Mengantar.")
    return id
  }

  /** POST /time: reserves one pickup slot (`date` mm-dd-yyyy, `time` "9:00".."18:00", ≥ 90 min ahead); returns its `_id`. */
  async reserveTime(addressId: string, date: string, time: string): Promise<string> {
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

  async deleteOrders(courier: Courier, ids: string[]) {
    const raw = await request(this.opts, { method: "DELETE", path: "/order", body: { courier, ids } })
    return parse(DeleteOrderSchema, raw, "/order")
  }
}
