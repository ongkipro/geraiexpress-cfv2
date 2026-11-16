// Partner OpenAPI `/api/v1` (TASK-503, PR-21, DEC-214, spec 08 §1–3) on `app.`. One route table is the single source:
// it drives runtime validation (Zod), scope checks, the handlers AND `/api/v1/openapi.json` (OpenAPI 3.1 built with
// `z.toJSONSchema`). Bearer `gx_live_…` only — cookies are ignored; no CSRF surface. Errors: stable English
// `error.code` + Indonesian `error.message`. Counter payment/payout mutations are intentionally absent (POS-only).
import { z } from "zod"
import { AppError, fail, fromError, ok } from "../http/envelope"
import { searchAreas } from "../couriers/areas"
import { cashierCard, frozenFrom, ownerCard, parseQuoteInput, runQuote } from "../pricing/quote/service"
import { projectFor } from "../dto/projection"
import { vaultFor } from "../do/gerai-vault/stub"
import { escposBytes, labelsPdf, rollLines } from "@gx/thermal-print"
import { platformOf, enqueue } from "../bulk/service"
import { rowsFromCsv, validateRow } from "@gx/domain/bulk"
import { primaryHost } from "../hostnames/service"
import { periodFromParams, previousOf, resolvePreset } from "@gx/domain/period"
import { authenticate, type ApiKeyPrincipal, type Scope } from "./keys"

export type { Route }

/** The cap ledger lives in the tenant object (tenant 0022); keys without `shipments:issue` never reach it. */
const spendOf = (k: ApiKeyPrincipal) => ({ keyId: k.keyId, capIdr: k.dailyIssueCapIdr })

type Ctx = { env: Env; key: ApiKeyPrincipal; actor: string; params: Record<string, string>; query: URLSearchParams; body: unknown; exec: ExecutionContext }
type Handler = (c: Ctx) => Promise<Response>
interface Route {
  method: "GET" | "POST"
  path: string
  scope: Scope
  summary: string
  description?: string
  query?: z.ZodObject
  body?: z.ZodType
  idempotent?: boolean
  handler: Handler
}

const slug = z.string().regex(/^[23456789abcdefghjkmnpqrstvwxyz]{7}$/).describe("INV slug, e.g. 8k4m2p7")
const AREA = z.string().regex(/^[0-9a-f]{24}$/).describe("Mengantar area id (from GET /areas)")
// A key's response is projected like a Kasir's unless it carries `finance:read` (spec 08 §2).
const project = <T>(k: ApiKeyPrincipal, v: T) => projectFor(k.scopes.has("finance:read") ? "gerai_admin" : "cashier", v)
const vaultErr = (r: { refused?: string; error?: { status: number; code: string; message: string; fields?: Record<string, string> } }): never => {
  if (r.error) throw new AppError(r.error.status, r.error.code, r.error.message, r.error.fields ?? {})
  throw new AppError(503, "TENANT_NOT_READY", "Data gerai sedang diperbarui. Coba lagi sebentar lagi.")
}
const originOf = async (env: Env, tenantId: string) => {
  const o = await vaultFor(env, tenantId).defaultOutlet(tenantId)
  if (!o.ok || !o.value?.areaId) throw new AppError(409, "NO_PICKUP_AREA", "Titik jemput gerai belum diatur.")
  return o.value.areaId
}

const QuoteBody = z.object({
  destination_area_id: AREA,
  weight_gram: z.number().int().min(10).max(100_000).default(1000),
  length_cm: z.number().int().min(1).max(300).optional(),
  width_cm: z.number().int().min(1).max(300).optional(),
  height_cm: z.number().int().min(1).max(300).optional(),
  cod_fee_mode: z.enum(["none", "buyer_bears_fee", "sender_bears_fee", "cod_all_in", "dfod"]).default("none"),
  cod_goods_amount_idr: z.number().int().min(0).optional(),
})
const toQuoteInput = (b: z.infer<typeof QuoteBody>) => ({ destinationAreaId: b.destination_area_id, weightGram: b.weight_gram, lengthCm: b.length_cm, widthCm: b.width_cm, heightCm: b.height_cm, mode: b.cod_fee_mode, codGoodsIdr: b.cod_goods_amount_idr })

const DraftBody = QuoteBody.extend({
  service_code: z.string().min(2).max(30).describe("Courier service from POST /quotes (e.g. JT)"),
  sender_id: z.string().uuid().optional().describe("Existing sender contact id (contacts:read)"),
  recipient_id: z.string().uuid().optional().describe("Existing recipient contact id"),
  content: z.string().min(3).max(100).optional(),
})
const ContactBody = z.object({ name: z.string().min(1).max(80), phone: z.string().min(6).max(20), street: z.string().max(200).optional(), area_id: AREA.optional(), area_label: z.string().max(200).optional(), postal_code: z.string().regex(/^\d{5}$/).optional() })
const LabelBody = z.object({ format: z.enum(["label_10x15_with_stub", "label_10x10", "label_10x15", "roll_58mm"]).default("label_10x15_with_stub"), reprint_reason: z.string().min(3).max(200).optional() })

export const ROUTES: Route[] = [
  {
    method: "GET",
    path: "/areas",
    scope: "rates:read",
    summary: "Cari kecamatan / kode pos",
    query: z.object({ q: z.string().min(3).max(60) }),
    handler: async (c) => ok({ items: (await searchAreas(c.env, c.query.get("q") ?? "")).items }),
  },
  {
    method: "POST",
    path: "/quotes",
    scope: "rates:read",
    summary: "Bandingkan tarif ekspedisi",
    description: "Customer tariffs; net cost and margin only with `finance:read`.",
    body: QuoteBody,
    handler: async (c) => {
      const b = c.body as z.infer<typeof QuoteBody>
      const input = parseQuoteInput(toQuoteInput(b), await originOf(c.env, c.key.tenantId))
      const q = await runQuote(c.env, c.key.tenantId, input, Date.now())
      const cards = q.cards.map((x) => (c.key.scopes.has("finance:read") ? ownerCard(x) : cashierCard(x)))
      return ok(project(c.key, { cards, medals: q.medals, quoted_at: q.quotedAt, expires_at: q.expiresAt }))
    },
  },
  {
    method: "POST",
    path: "/shipments",
    scope: "shipments:draft",
    summary: "Buat draf INV (pra-pesan) untuk ditimbang & dibayar di kasir",
    body: DraftBody,
    handler: async (c) => {
      const b = c.body as z.infer<typeof DraftBody>
      const input = parseQuoteInput(toQuoteInput(b), await originOf(c.env, c.key.tenantId))
      const q = await runQuote(c.env, c.key.tenantId, input, Date.now())
      const card = q.cards.find((x) => x.serviceCode === b.service_code && x.available)
      if (!card) throw new AppError(409, "SERVICE_UNAVAILABLE", "Layanan ini tidak tersedia untuk rute ini.")
      const vault = vaultFor(c.env, c.key.tenantId)
      const s = await vault.allocateSlug(c.key.tenantId, "api")
      if (!s.ok) return vaultErr(s)
      const f = await vault.freezeQuote(c.key.tenantId, frozenFrom(s.value, q, card))
      if (!f.ok) return vaultErr({})
      if (b.sender_id || b.recipient_id || b.content) {
        const p = await vault.setShipmentParties(c.key.tenantId, s.value, { senderId: b.sender_id, recipientId: b.recipient_id, content: b.content })
        if (!p.ok) return vaultErr(p)
      }
      const host = await primaryHost(c.env, c.key.tenantId, c.key.tenantSlug)
      return ok(project(c.key, { slug: s.value, inv: `INV ${s.value.toUpperCase()}`, expires_at: q.expiresAt, card: cashierCard(card), counter_url: `https://${host}/lacak?q=${s.value.toUpperCase()}` }), 201)
    },
  },
  {
    method: "GET",
    path: "/shipments",
    scope: "tracking:read",
    summary: "Daftar kiriman",
    query: z.object({ tab: z.enum(["semua", "belum-dibayar", "menunggu-saldo", "pickup", "kendala", "retur"]).optional(), q: z.string().max(60).optional(), awb: z.string().max(40).optional(), cursor: z.string().max(40).optional(), limit: z.coerce.number().int().min(1).max(100).optional() }),
    handler: async (c) => {
      const now = Date.now()
      const r = await vaultFor(c.env, c.key.tenantId).shipmentList(c.key.tenantId, { tab: (c.query.get("tab") as "semua") ?? "semua", q: c.query.get("awb") ?? c.query.get("q") ?? "", fromMs: now - 180 * 86_400_000, toMs: now + 60_000, courier: null, printed: "semua", cursor: c.query.get("cursor"), limit: Number(c.query.get("limit") ?? 50) })
      if (!r.ok) return vaultErr(r)
      return ok(project(c.key, { items: r.value.items, next_cursor: r.value.nextCursor }))
    },
  },
  {
    method: "GET",
    path: "/shipments/{slug}",
    scope: "tracking:read",
    summary: "Detail kiriman",
    handler: async (c) => {
      const r = await vaultFor(c.env, c.key.tenantId).shipmentDetail(c.key.tenantId, slug.parse(c.params.slug), c.actor)
      if (!r.ok) return vaultErr(r)
      if (!r.value) throw new AppError(404, "SHIPMENT_NOT_FOUND", "Kiriman tidak ditemukan.")
      const v = r.value
      return ok(project(c.key, { shipment: v.shipment, quote: v.quote, events: v.events, preflight: v.preflight }))
    },
  },
  {
    method: "POST",
    path: "/shipments/{slug}/issue",
    scope: "shipments:issue",
    summary: "Terbitkan resi di Mengantar (Idempotency-Key wajib)",
    idempotent: true,
    handler: async (c) => {
      const s = slug.parse(c.params.slug)
      const vault = vaultFor(c.env, c.key.tenantId)
      const d = await vault.shipmentDetail(c.key.tenantId, s, c.actor)
      if (!d.ok || !d.value) throw new AppError(404, "SHIPMENT_NOT_FOUND", "Kiriman tidak ditemukan.")
      // The daily Rupiah cap is reserved inside the tenant object, in the same transaction as the dispatch journal
      // (one reservation per INV, kept for held/ambiguous orders, released when non-issue is established).
      const r = await vault.dispatchShipment(c.key.tenantId, s, c.actor, Date.now(), await platformOf(c.env, c.key.tenantId), spendOf(c.key))
      if (!r.ok) return vaultErr(r)
      return ok(r.value)
    },
  },
  {
    method: "POST",
    path: "/shipments/{slug}/pay-unpaid",
    scope: "shipments:issue",
    summary: "Bayar kiriman yang menunggu saldo Mengantar",
    idempotent: true,
    handler: async (c) => {
      const s = slug.parse(c.params.slug)
      // Paying a held batch spends Mengantar balance: each held INV counts once against this key's cap (an INV the
      // key issued into a hold already counts).
      const r = await vaultFor(c.env, c.key.tenantId).payUnpaid(c.key.tenantId, s, c.actor, Date.now(), spendOf(c.key))
      if (!r.ok) return vaultErr(r)
      return ok(r.value)
    },
  },
  {
    method: "POST",
    path: "/shipments/{slug}/labels",
    scope: "shipments:issue",
    summary: "Label 100 mm (PDF) atau roll 58 mm (ESC/POS)",
    body: LabelBody,
    handler: async (c) => labels(c, [slug.parse(c.params.slug)]),
  },
  {
    method: "POST",
    path: "/labels/bulk",
    scope: "shipments:issue",
    summary: "Gabungkan label 1–50 INV dalam satu PDF",
    body: LabelBody.extend({ slugs: z.array(slug).min(1) }),
    handler: async (c) => {
      const b = c.body as { slugs: string[] }
      if (b.slugs.length > 50) throw new AppError(422, "BULK_LIMIT_EXCEEDED", "Maksimal 50 kiriman per cetak.")
      return labels(c, [...new Set(b.slugs)])
    },
  },
  {
    method: "POST",
    path: "/bulk-imports",
    scope: "shipments:issue",
    summary: "Unggah Paket Massal (CSV atau baris JSON, ≤ 200)",
    body: z.object({ sender_id: z.string().uuid(), service_code: z.string().min(2).max(30), cod_fee_mode: z.enum(["none", "buyer_bears_fee", "sender_bears_fee", "cod_all_in"]).default("none"), csv: z.string().max(1_048_576).optional(), rows: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).max(200).optional() }),
    handler: async (c) => {
      const b = c.body as { sender_id: string; service_code: string; cod_fee_mode: string; csv?: string; rows?: Array<Record<string, string | number>> }
      let rows: Array<{ raw: Record<string, string>; valid: ReturnType<typeof validateRow> extends infer V ? (V extends { ok: true; row: infer R } ? R : never) | null : never; errors: string[] }>
      if (b.csv) {
        const r = rowsFromCsv(b.csv)
        if (!r.ok) throw new AppError(422, "INVALID_FILE", r.message)
        rows = r.rows.map((x) => {
          const v = validateRow(x)
          return { raw: Object.fromEntries(Object.entries(x).map(([k, val]) => [k, String(val)])), valid: v.ok ? v.row : null, errors: v.ok ? [] : v.errors }
        })
      } else if (b.rows?.length) {
        rows = b.rows.map((x, i) => {
          const input = { rowNo: i + 1, name: "", phone: "", street: "", areaText: "", postalCode: "", content: "", weightGram: "", lengthCm: "", widthCm: "", heightCm: "", codIdr: "", declaredIdr: "", note: "", ...Object.fromEntries(Object.entries(x).map(([k, v]) => [k, String(v)])) }
          const v = validateRow(input)
          return { raw: Object.fromEntries(Object.entries(x).map(([k, val]) => [k, String(val)])), valid: v.ok ? v.row : null, errors: v.ok ? [] : v.errors }
        })
      } else throw new AppError(422, "NO_ROWS", "Kirim `csv` atau `rows`.")
      const r = await vaultFor(c.env, c.key.tenantId).bulkCreate(c.key.tenantId, { senderId: b.sender_id, source: b.csv ? "csv" : "manual", fileName: null, maskPreset: "standar_gerai", codFeeMode: b.cod_fee_mode, serviceCode: b.service_code, actorId: c.actor }, rows)
      if (!r.ok) return vaultErr(r)
      c.exec.waitUntil(enqueue(c.env, { kind: "check", tenant_id: c.key.tenantId, batch_id: r.value.id }))
      return ok({ id: r.value.id }, 201)
    },
  },
  {
    method: "GET",
    path: "/bulk-imports/{id}",
    scope: "shipments:issue",
    summary: "Status Paket Massal per baris",
    handler: async (c) => {
      const r = await vaultFor(c.env, c.key.tenantId).bulkView(c.key.tenantId, z.string().uuid().parse(c.params.id))
      if (!r.ok) return vaultErr(r)
      if (!r.value) throw new AppError(404, "BATCH_NOT_FOUND", "Batch tidak ditemukan.")
      return ok(project(c.key, { batch: r.value.batch, rows: r.value.rows.map((x) => ({ row_no: x.row_no, state: x.state, errors: x.errors_json ? JSON.parse(x.errors_json) : [], shipment_slug: x.shipment_slug, awb: x.awb_number, counter_due_idr: x.counter_due_idr, estimated_margin_idr: x.estimated_margin_idr })), totals: r.value.totals }))
    },
  },
  {
    method: "POST",
    path: "/bulk-imports/{id}/commit",
    scope: "shipments:issue",
    summary: "Buat INV untuk baris yang siap (dispatch antre)",
    idempotent: true,
    body: z.object({ prohibited_ack: z.literal(true).describe("Konfirmasi isi paket bukan barang terlarang") }),
    handler: async (c) => {
      const id = z.string().uuid().parse(c.params.id)
      const vault = vaultFor(c.env, c.key.tenantId)
      // Every created INV is reserved against the daily cap inside the materialization transaction: all or nothing,
      // and only the commit that moves the batch out of `ready` can reserve (no concurrent rollback of another's rows).
      const r = await vault.bulkMaterialize(c.key.tenantId, id, c.actor, true, spendOf(c.key))
      if (!r.ok) return vaultErr(r)
      c.exec.waitUntil(enqueue(c.env, { kind: "dispatch", tenant_id: c.key.tenantId, batch_id: id }))
      return ok(r.value)
    },
  },
  {
    method: "GET",
    path: "/contacts/senders",
    scope: "contacts:read",
    summary: "Daftar pengirim",
    query: z.object({ q: z.string().max(60).optional() }),
    handler: async (c) => contacts(c, { op: "list_senders", q: c.query.get("q") ?? "", filter: "all" }),
  },
  {
    method: "POST",
    path: "/contacts/senders",
    scope: "contacts:write",
    summary: "Tambah pengirim",
    description: "`wa_verified_*` is read-only over the API.",
    body: ContactBody.extend({ store_name: z.string().max(60).optional() }),
    handler: async (c) => {
      const b = c.body as z.infer<typeof ContactBody> & { store_name?: string }
      return contacts(c, { op: "create_sender", input: { senderKind: b.store_name ? "reseller_dropship" : "walk_in", name: b.name, phone: b.phone, street: b.street, areaId: b.area_id, areaLabel: b.area_label, postalCode: b.postal_code, brandName: b.store_name } }, 201)
    },
  },
  {
    method: "GET",
    path: "/contacts/recipients",
    scope: "contacts:read",
    summary: "Daftar penerima (dengan riwayat COD)",
    query: z.object({ q: z.string().max(60).optional() }),
    handler: async (c) => contacts(c, { op: "list_recipients", q: c.query.get("q") ?? "" }),
  },
  {
    method: "POST",
    path: "/contacts/recipients",
    scope: "contacts:write",
    summary: "Tambah penerima",
    body: ContactBody.extend({ street: z.string().min(5).max(200), area_id: AREA }),
    handler: async (c) => {
      const b = c.body as z.infer<typeof ContactBody>
      return contacts(c, { op: "create_recipient", input: { name: b.name, phone: b.phone, street: b.street, areaId: b.area_id, areaLabel: b.area_label, postalCode: b.postal_code } }, 201)
    },
  },
  {
    method: "POST",
    path: "/contacts/senders/{id}",
    scope: "contacts:write",
    summary: "Ubah pengirim",
    description: "Changing the phone clears `wa_verified_*`.",
    body: ContactBody.extend({ store_name: z.string().max(60).optional() }),
    handler: async (c) => {
      const b = c.body as z.infer<typeof ContactBody> & { store_name?: string }
      // An omitted store_name keeps the sender's kind and brand (partial update).
      const brand = b.store_name === undefined ? {} : { senderKind: b.store_name ? ("reseller_dropship" as const) : ("walk_in" as const), brandName: b.store_name }
      return contacts(c, { op: "update_sender", id: z.string().uuid().parse(c.params.id), input: { name: b.name, phone: b.phone, street: b.street, areaId: b.area_id, areaLabel: b.area_label, postalCode: b.postal_code, ...brand } })
    },
  },
  {
    method: "POST",
    path: "/contacts/recipients/{id}",
    scope: "contacts:write",
    summary: "Ubah penerima",
    body: ContactBody.extend({ street: z.string().min(5).max(200), area_id: AREA }),
    handler: async (c) => {
      const b = c.body as z.infer<typeof ContactBody>
      return contacts(c, { op: "update_recipient", id: z.string().uuid().parse(c.params.id), input: { name: b.name, phone: b.phone, street: b.street, areaId: b.area_id, areaLabel: b.area_label, postalCode: b.postal_code } })
    },
  },
  {
    method: "GET",
    path: "/contacts/recipient-risk",
    scope: "tracking:read",
    summary: "Riwayat COD penerima di gerai ini (badge risiko)",
    query: z.object({ phone: z.string().min(6).max(20) }),
    handler: async (c) => {
      const r = await vaultFor(c.env, c.key.tenantId).contacts(c.key.tenantId, { op: "badge", phone: c.query.get("phone") ?? "" }, c.actor)
      if (!r.ok) return vaultErr(r)
      if (r.value.kind !== "badge") throw new AppError(422, "INVALID_PHONE", "Nomor HP tidak valid.")
      const b = r.value.badge
      return ok({ badge: b.badge, delivered_count: b.delivered, rts_count: b.rts, rts_bps: b.rtsBps })
    },
  },
  {
    method: "GET",
    path: "/exceptions",
    scope: "tracking:read",
    summary: "Kiriman yang perlu perhatian (tidak bergerak > 48 jam, gagal antar, selisih berat, bisa klaim, status bertentangan)",
    query: z.object({ bucket: z.enum(["tidak_bergerak", "gagal_antar", "selisih_berat", "bisa_klaim", "bertentangan"]).optional() }),
    handler: async (c) => {
      const bucket = (c.query.get("bucket") ?? "tidak_bergerak") as "tidak_bergerak"
      const r = await vaultFor(c.env, c.key.tenantId).exceptionsOp(c.key.tenantId, { userId: c.actor, role: "cashier" }, { op: "list", bucket })
      if (!r.ok) return vaultErr(r)
      if (r.value.kind !== "list") return vaultErr({})
      return ok(project(c.key, { bucket, counts: r.value.counts, items: r.value.rows.map((x) => ({ slug: x.slug, awb: x.awb, courier: x.courier, status: x.status, provider_status: x.provider_status, last_scan_at: x.last_scan_at, claim_kind: x.claim_kind, deadline_at: x.deadline_at, claim_status: x.claim?.status ?? null })) }))
    },
  },
  {
    method: "GET",
    path: "/returns",
    scope: "tracking:read",
    summary: "Meja Retur: paket retur di gerai, sudah diambil (7 hari), dan dalam perjalanan kembali",
    handler: async (c) => {
      const r = await vaultFor(c.env, c.key.tenantId).returnsOp(c.key.tenantId, { userId: c.actor, role: "cashier" }, { op: "desk" })
      if (!r.ok) return vaultErr(r)
      if (r.value.kind !== "desk") return vaultErr({})
      const row = (x: { slug: string; awb_number: string | null; courier_code: string; status: string; condition?: string | null; intake_at?: number | null; storage_deadline_at?: number | null; handback_at?: number | null }) => ({ slug: x.slug, awb: x.awb_number, courier: x.courier_code, status: x.status, condition: x.condition ?? null, intake_at: x.intake_at ?? null, storage_deadline_at: x.storage_deadline_at ?? null, handback_at: x.handback_at ?? null })
      return ok({ at_gerai: r.value.open.map(row), returned_7d: r.value.returned.map(row), incoming: r.value.incoming.map(row) })
    },
  },
  {
    method: "GET",
    path: "/finance/analytics",
    scope: "finance:read",
    summary: "Analitik gerai: kiriman, uang loket, laba kas, COD, retur per ekspedisi",
    query: z.object({ periode: z.enum(["hari-ini", "kemarin", "7d", "30d", "bulan-ini", "bulan-lalu", "90d"]).optional() }),
    handler: async (c) => {
      const t = Date.now()
      const period = periodFromParams({ periode: c.query.get("periode") ?? "7d" }, t)
      const r = await vaultFor(c.env, c.key.tenantId).dashboard(c.key.tenantId, { role: "gerai_admin", userId: c.actor, period, previous: previousOf(period), today: resolvePreset("today", t) })
      if (!r.ok) return vaultErr(r)
      return ok({ period, ...r.value.data })
    },
  },
  {
    method: "GET",
    path: "/finance/summary",
    scope: "finance:read",
    summary: "Ringkasan keuangan dua buku",
    handler: async (c) => {
      const r = await vaultFor(c.env, c.key.tenantId).financeView(c.key.tenantId)
      if (!r.ok) return vaultErr(r)
      return ok({ summary: r.value.summary, discrepancies: r.value.discrepancies.length })
    },
  },
  {
    method: "POST",
    path: "/finance/sync",
    scope: "finance:sync",
    summary: "Sinkronkan mutasi Mengantar (maks. 1 per 30 detik)",
    handler: async (c) => {
      const r = await vaultFor(c.env, c.key.tenantId).financeSync(c.key.tenantId, "manual")
      if (!r.ok) return vaultErr(r)
      // The synced Mengantar balance is owner money data: only with `finance:read`.
      return ok(c.key.scopes.has("finance:read") ? r.value : { ...r.value, balance: undefined })
    },
  },
]

async function contacts(c: Ctx, op: Parameters<ReturnType<typeof vaultFor>["contacts"]>[1], status = 200): Promise<Response> {
  const r = await vaultFor(c.env, c.key.tenantId).contacts(c.key.tenantId, op, c.actor)
  if (!r.ok) return vaultErr(r)
  const v = r.value
  if (v.kind === "errors") throw new AppError(422, "INVALID_CONTACT", v.errors[0]!.message, Object.fromEntries(v.errors.map((e) => [e.field, e.message])))
  return ok(project(c.key, v), status)
}

async function labels(c: Ctx, slugs: string[]): Promise<Response> {
  const b = c.body as z.infer<typeof LabelBody>
  const r = await vaultFor(c.env, c.key.tenantId).preparePrint(c.key.tenantId, { slugs, reason: b.reprint_reason, actorId: c.actor, trackingHost: await primaryHost(c.env, c.key.tenantId, c.key.tenantSlug), record: true })
  if (!r.ok) return vaultErr(r)
  if (r.value.items.length === 0) {
    const first = r.value.refused[0]
    throw new AppError(first?.code === "SHIPMENT_NOT_FOUND" ? 404 : 409, first?.code ?? "NOTHING_TO_PRINT", first?.message ?? "Tidak ada label yang bisa dicetak.")
  }
  if (b.format === "roll_58mm") return new Response(new Uint8Array(r.value.items.flatMap((d) => [...escposBytes(rollLines(d))])), { headers: { "content-type": "application/octet-stream", "cache-control": "no-store" } })
  return new Response(labelsPdf(r.value.items, b.format), { headers: { "content-type": "application/pdf", "cache-control": "no-store", "x-refused": String(r.value.refused.length) } })
}

const match = (pattern: string, path: string): Record<string, string> | null => {
  const names: string[] = []
  const re = new RegExp(`^${pattern.replace(/\{(\w+)\}/g, (_m, n: string) => (names.push(n), "([^/]+)"))}$`)
  const m = re.exec(path)
  return m ? Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1]!)])) : null
}

const issueKey = (h: string | null) => (h && /^[A-Za-z0-9_-]{8,64}$/.test(h) ? h : null)

/**
 * Runs one route for an authenticated key: scope check, Idempotency-Key, Zod validation, handler. Shared by the HTTP
 * surface and the MCP tools (TASK-504), so a tool can never skip a check its REST twin enforces.
 */
export async function invoke(
  env: Env,
  exec: ExecutionContext,
  key: ApiKeyPrincipal,
  actor: string,
  r: Route,
  input: { params?: Record<string, string>; query?: Record<string, string>; body?: unknown; idempotencyKey?: string | null },
): Promise<Response> {
  try {
    if (!key.scopes.has(r.scope)) return fail(403, "SCOPE_REQUIRED", `Kunci API ini tidak punya izin ${r.scope}.`)
    if (r.idempotent && !issueKey(input.idempotencyKey ?? null)) return fail(400, "IDEMPOTENCY_KEY_REQUIRED", "Header Idempotency-Key wajib untuk aksi ini.")
    let body: unknown = undefined
    if (r.body) {
      const parsed = r.body.safeParse(input.body ?? {})
      if (!parsed.success) return fail(422, "INVALID_REQUEST", "Data permintaan tidak valid.", Object.fromEntries(parsed.error.issues.map((i) => [i.path.join(".") || "body", i.message])))
      body = parsed.data
    }
    const query = new URLSearchParams(input.query ?? {})
    if (r.query) {
      const parsed = r.query.safeParse(Object.fromEntries(query))
      if (!parsed.success) return fail(422, "INVALID_REQUEST", "Parameter tidak valid.", Object.fromEntries(parsed.error.issues.map((i) => [i.path.join(".") || "query", i.message])))
    }
    return await r.handler({ env, key, actor, params: input.params ?? {}, query, body, exec })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(404, "NOT_FOUND", "Data tidak ditemukan.")
    if (!(err instanceof AppError)) console.error("API_V1_ERROR", err instanceof Error ? err.message : String(err))
    return fromError(err)
  }
}

export const routeOf = (method: Route["method"], path: string) => ROUTES.find((r) => r.method === method && r.path === path)!

/** Bearer key + per-key/IP rate limit; null response means the caller may proceed. */
export async function gate(env: Env, request: Request): Promise<{ key: ApiKeyPrincipal } | { res: Response }> {
  const key = await authenticate(env, request, Date.now())
  if (!key) return { res: fail(401, "UNAUTHENTICATED", "Kunci API tidak valid atau sudah dicabut.", {}, { "www-authenticate": 'Bearer realm="geraiexpress"' }) }
  const ip = request.headers.get("cf-connecting-ip") ?? "x"
  const { success } = env.RATE_LIMITER ? await env.RATE_LIMITER.limit({ key: `v1:${key.keyId}:${ip}` }) : { success: true }
  if (!success) return { res: fail(429, "RATE_LIMITED", "Terlalu banyak permintaan. Coba lagi sebentar lagi.") }
  return { key }
}

export async function handleApiV1(request: Request, env: Env, exec: ExecutionContext): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.slice("/api/v1".length) || "/"
  if (path === "/openapi.json" && request.method === "GET") return Response.json(openApi(`https://${url.host}`), { headers: { "cache-control": "public, max-age=300" } })
  if (path === "/docs" && request.method === "GET") return docsPage()
  for (const r of ROUTES) {
    if (r.method !== request.method) continue
    const params = match(r.path, path)
    if (!params) continue
    const g = await gate(env, request)
    if ("res" in g) return g.res
    let body: unknown = undefined
    if (r.body) body = await request.json().catch(() => ({}))
    return invoke(env, exec, g.key, `apikey:${g.key.keyId}`, r, { params, query: Object.fromEntries(url.searchParams), body, idempotencyKey: request.headers.get("idempotency-key") })
  }
  return fail(404, "NOT_FOUND", "Alamat API tidak ditemukan.")
}

// ---- OpenAPI 3.1 from the same table -------------------------------------------------------------------------------

const ErrorSchema = { type: "object", properties: { ok: { const: false }, error: { type: "object", properties: { code: { type: "string" }, message: { type: "string", description: "Indonesian, user-facing" }, field_errors: { type: "object", additionalProperties: { type: "string" } } }, required: ["code", "message"] } }, required: ["ok", "error"] }

export function openApi(server: string): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const r of ROUTES) {
    const params = [...r.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }))
    const query = r.query ? Object.entries((z.toJSONSchema(r.query) as { properties?: Record<string, unknown>; required?: string[] }).properties ?? {}).map(([name, schema]) => ({ name, in: "query", required: ((z.toJSONSchema(r.query!) as { required?: string[] }).required ?? []).includes(name), schema })) : []
    const headers = r.idempotent ? [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", pattern: "^[A-Za-z0-9_-]{8,64}$" } }] : []
    const op: Record<string, unknown> = {
      operationId: `${r.method.toLowerCase()}${r.path.replace(/\{(\w+)\}/g, "By_$1").replace(/[^A-Za-z0-9]+(\w)/g, (_m, ch: string) => ch.toUpperCase())}`,
      summary: r.summary,
      description: `${r.description ? `${r.description}\n\n` : ""}Scope: \`${r.scope}\`.`,
      tags: [r.path.split("/")[1]!],
      security: [{ bearer: [r.scope] }],
      parameters: [...params, ...query, ...headers],
      responses: {
        "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { ok: { const: true }, data: {} }, required: ["ok", "data"] } } } },
        "401": { description: "Kunci API tidak valid", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        "403": { description: "Scope kurang", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        "422": { description: "Data tidak valid", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        "429": { description: "Batas permintaan / batas harian", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    }
    if (r.body) op.requestBody = { required: true, content: { "application/json": { schema: z.toJSONSchema(r.body, { io: "input" }) } } }
    paths[r.path] = { ...(paths[r.path] ?? {}), [r.method.toLowerCase()]: op }
  }
  return {
    openapi: "3.1.0",
    info: { title: "GeraiExpress Partner API", version: "1.0.0", description: "Integrasi toko online, bot WhatsApp, dan asisten AI dengan gerai. Uang dalam Rupiah bulat (`_idr`), berat dalam gram (`weight_gram`). Pembayaran di loket tidak tersedia lewat API." },
    servers: [{ url: `${server}/api/v1` }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "gx_live_…" } }, schemas: { Error: ErrorSchema } },
    security: [{ bearer: [] }],
    paths,
  }
}

/** Scalar API reference (self-hosted HTML that loads the pinned Scalar script from its CDN). */
function docsPage(): Response {
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>GeraiExpress Partner API</title><meta name="robots" content="noindex"></head>
<body><script id="api-reference" data-url="/api/v1/openapi.json"></script><script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.25.0"></script></body></html>`
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300", "content-security-policy": "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src https://cdn.jsdelivr.net data:; img-src 'self' data:; connect-src 'self'" } })
}
