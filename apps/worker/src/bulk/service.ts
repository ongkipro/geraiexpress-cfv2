// `Paket Massal` orchestration in the Worker (spec 03 §1.3, DEC-229): parse + validate rows, area match and quote
// through the `gx-bulk` Queue (never on the request path), then serialized dispatch inside the tenant object.
import { rowsFromCsv, validateRow, BULK_MAX_ROWS, type BulkRowInput, type ValidRow } from "@gx/domain/bulk"
import { searchAreas, type AreaItem } from "../couriers/areas"
import { AppError } from "../http/envelope"
import { frozenFrom, parseQuoteInput, runQuote } from "../pricing/quote/service"
import { vaultFor } from "../do/gerai-vault/stub"
import type { RowCheck } from "../do/gerai-vault/bulk"
import type { CodFeeMode } from "@gx/domain/money"

export type BulkMessage = { kind: "check" | "dispatch"; tenant_id: string; batch_id: string }
export type ParsedRow = { raw: Record<string, string>; valid: ValidRow | null; errors: string[] }

const FIELDS: Array<keyof Omit<BulkRowInput, "rowNo">> = ["name", "phone", "street", "areaText", "postalCode", "content", "weightGram", "lengthCm", "widthCm", "heightCm", "codIdr", "declaredIdr", "note"]

/** One manual/edited row (all cells as text) → validated row. */
export function parseRow(cells: Record<string, unknown>, rowNo: number): ParsedRow {
  const input = { rowNo } as BulkRowInput
  for (const f of FIELDS) input[f] = typeof cells[f] === "string" || typeof cells[f] === "number" ? String(cells[f]).slice(0, 300).trim() : ""
  const raw = Object.fromEntries(FIELDS.map((f) => [f, input[f]]))
  const v = validateRow(input)
  return v.ok ? { raw, valid: v.row, errors: [] } : { raw, valid: null, errors: v.errors }
}

/** Request body → rows (CSV text or manual rows). Throws Indonesian `AppError`s. */
export function parseRows(b: Record<string, unknown>): { source: "manual" | "csv"; rows: ParsedRow[] } {
  if (typeof b.csv === "string") {
    const r = rowsFromCsv(b.csv)
    if (!r.ok) throw new AppError(422, "INVALID_FILE", r.message, { file: r.message })
    return { source: "csv", rows: r.rows.map((x) => parseRow(x as unknown as Record<string, unknown>, x.rowNo)) }
  }
  const rows = Array.isArray(b.rows) ? (b.rows as unknown[]) : []
  if (rows.length === 0) throw new AppError(422, "NO_ROWS", "Tambahkan minimal satu baris paket.", { rows: "Tambahkan minimal satu baris." })
  if (rows.length > BULK_MAX_ROWS) throw new AppError(422, "TOO_MANY_ROWS", `Maksimal ${BULK_MAX_ROWS} baris per batch.`)
  return { source: "manual", rows: rows.map((x, i) => parseRow((x && typeof x === "object" ? x : {}) as Record<string, unknown>, i + 1)) }
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3)

/**
 * Destination text → one Mengantar area, or a reason. Searches by the first comma part (kelurahan/kecamatan), keeps
 * candidates whose label contains every typed word, and lets the postal code break ties. More than one left =
 * ambiguous (`Perlu Diperbaiki` with a picker), never a guess.
 */
export async function matchArea(env: Env, areaText: string, postalCode: string | null): Promise<{ ok: true; area: AreaItem } | { ok: false; reason: string; candidates: AreaItem[] }> {
  const parts = areaText.split(/[,/]/).map((p) => p.trim()).filter(Boolean)
  const found = new Map<string, AreaItem>()
  for (const p of parts.slice(0, 2)) for (const a of (await searchAreas(env, p)).items) found.set(a.id, a)
  const typed = words(areaText)
  let list = [...found.values()].filter((a) => typed.every((w) => a.label.toLowerCase().includes(w)))
  if (list.length === 0) list = [...found.values()]
  if (postalCode && list.length > 1) {
    const byZip = list.filter((a) => a.postalCode === postalCode)
    if (byZip.length) list = byZip
  }
  if (list.length === 1) return { ok: true, area: list[0]! }
  if (list.length === 0) return { ok: false, reason: "Kecamatan tidak ditemukan", candidates: [] }
  return { ok: false, reason: "Kecamatan lebih dari satu, pilih yang benar", candidates: list.slice(0, 8) }
}

const CHECK_CHUNK = 10

/** Checks pending rows of a batch in chunks. Returns `more` when rows remain (rate limit / provider hiccup / chunk). */
export async function checkBatch(env: Env, tenantId: string, batchId: string, now: number = Date.now()): Promise<{ more: boolean }> {
  const vault = vaultFor(env, tenantId)
  const o = await vault.defaultOutlet(tenantId)
  const origin = o.ok ? o.value?.areaId : null
  const pending = await vault.bulkPending(tenantId, batchId, CHECK_CHUNK)
  if (!pending.ok || !pending.value) return { more: false }
  const { codFeeMode, serviceCode, rows } = pending.value
  if (!origin) {
    for (const r of rows) await vault.bulkApplyCheck(tenantId, batchId, r.row_no, { kind: "needs_fix", errors: ["Titik jemput gerai belum diatur"] })
    return { more: rows.length === CHECK_CHUNK }
  }
  for (const r of rows) {
    let area: AreaItem | null = r.area_id ? { id: r.area_id, label: r.area_label ?? r.area_text ?? "", postalCode: r.postal_code } : null
    if (!area) {
      const m = await matchArea(env, r.area_text ?? "", r.postal_code)
      if (!m.ok) {
        await vault.bulkApplyCheck(tenantId, batchId, r.row_no, { kind: "needs_fix", errors: [m.reason], candidates: m.candidates.map((c) => ({ id: c.id, label: c.label })) })
        continue
      }
      area = m.area
    }
    // A row with a COD amount uses the batch COD mode (buyer pays the fee when the batch is Non-COD).
    const mode: CodFeeMode = r.cod_goods_idr > 0 ? (codFeeMode === "none" || codFeeMode === "dfod" ? "buyer_bears_fee" : (codFeeMode as CodFeeMode)) : "none"
    let check: RowCheck
    try {
      const input = parseQuoteInput({ destinationAreaId: area.id, weightGram: r.weight_gram, lengthCm: r.length_cm, widthCm: r.width_cm, heightCm: r.height_cm, mode, codGoodsIdr: r.cod_goods_idr, declaredValueIdr: r.declared_value_idr }, origin)
      const q = await runQuote(env, tenantId, input, now, { rateKey: `bulkquote:${tenantId}`, perMinute: 240, serviceCode })
      const card = q.cards.find((c) => c.serviceCode === serviceCode)
      if (!card || !card.available) check = { kind: "needs_fix", errors: [card?.unavailableReason?.replace(/\.$/, "") ?? "Kurir tidak melayani rute"] }
      else {
        const snap = frozenFrom("pending", q, card)
        check = { kind: "ready", areaId: area.id, areaLabel: area.label, serviceCode: card.serviceCode, P: card.P, F: card.F, due: card.flow.counterDueIdr, C: card.flow.codCollectionTotalIdr, payable: card.flow.senderCodPayableIdr, margin: card.flow.outletMarginIdr, quoteJson: JSON.stringify(snap), quotedAt: q.quotedAt }
      }
    } catch (e) {
      if (e instanceof AppError && (e.status === 429 || e.status === 502 || e.status === 503)) return { more: true }
      check = { kind: "needs_fix", errors: [e instanceof AppError ? e.userMessage.replace(/\.$/, "") : "Ongkir tidak bisa dihitung"] }
    }
    await vault.bulkApplyCheck(tenantId, batchId, r.row_no, check)
  }
  return { more: rows.length === CHECK_CHUNK }
}

export async function platformOf(env: Env, tenantId: string) {
  const t = await env.DB.prepare("SELECT masking_enabled, masking_daily_quota FROM tenants WHERE id = ?").bind(tenantId).first<{ masking_enabled: number; masking_daily_quota: number | null }>()
  return { maskingEnabled: t?.masking_enabled === 1, dailyQuota: t?.masking_daily_quota ?? null }
}

/** `gx-bulk` consumer: one message per step; `more` → re-delivered later (never blocks the counter). */
export async function consumeBulkBatch(batch: MessageBatch<BulkMessage>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    const m = msg.body
    if (!m || typeof m.tenant_id !== "string" || typeof m.batch_id !== "string" || (m.kind !== "check" && m.kind !== "dispatch")) {
      msg.ack()
      continue
    }
    try {
      if (m.kind === "check") {
        const r = await checkBatch(env, m.tenant_id, m.batch_id)
        if (r.more) msg.retry({ delaySeconds: 5 })
        else msg.ack()
      } else {
        const r = await vaultFor(env, m.tenant_id).bulkDispatch(m.tenant_id, m.batch_id, await platformOf(env, m.tenant_id))
        if (r.ok && r.value.more) msg.retry({ delaySeconds: 30 })
        else msg.ack()
      }
    } catch {
      msg.retry({ delaySeconds: 30 })
    }
  }
}

/** Enqueue a step; a failed send is not fatal (the screen offers `Periksa lagi` / the next view re-enqueues). */
export async function enqueue(env: Env, m: BulkMessage): Promise<void> {
  try {
    await env.BULK_QUEUE.send(m)
  } catch {
    // Best effort; the batch stays in its state and can be nudged again.
  }
}
