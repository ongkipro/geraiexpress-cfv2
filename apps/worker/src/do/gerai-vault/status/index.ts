// Shipment status inside the tenant object (spec 01 §2.7, §3). Synchronous SQL helpers: callers run them inside
// `transactionSync` so the observation, the history row, the projection and the `shipment_index` outbox row commit
// together.
import { combine, CUSTODY_LEVEL, keyOf, compareKeys, reduceCustody, type CustodyStage, type EffectiveStatus, type ProviderObservation, type ProviderStatus, PROVIDER_RANK } from "@gx/domain/status"
import { enqueueOutbox } from "../core/outbox"

export type ShipmentRow = {
  tenant_id: string
  slug: string
  courier_code: string | null
  mengantar_order_code: string | null
  awb_number: string | null
  status: string
  provider_status: ProviderStatus | null
  last_provider_event_at: number | null
  last_provider_rank: number | null
  custody_stage: CustodyStage
  custody_at: number | null
  provider_status_conflict_at: number | null
  stuck_attention_at: number | null
  last_polled_at: number | null
  index_version: number
  created_at: number
  updated_at: number
}

/** Effective statuses after which neither polling nor a webhook can change the outcome for the counter. */
export const SETTLED: readonly string[] = ["delivered", "cancelled", "lost", "rts_returned_to_sender"]
/** A cancelled or settled shipment can never be handed to a courier again (spec 04 manifest guard). */
export const blocksManifestHandover = (status: string) => SETTLED.includes(status)

export function readShipment(sql: SqlStorage, slug: string): ShipmentRow | null {
  return sql.exec<ShipmentRow>("SELECT * FROM shipments WHERE slug = ?", slug).toArray()[0] ?? null
}

/** Webhook bodies carry `cnote_no` and `order_id`; either identifies the shipment (AWB first). */
export function findShipment(sql: SqlStorage, ref: { awb?: string | null; orderCode?: string | null }): ShipmentRow | null {
  if (ref.awb) {
    const r = sql.exec<ShipmentRow>("SELECT * FROM shipments WHERE awb_number = ?", ref.awb).toArray()[0]
    if (r) return r
  }
  if (ref.orderCode) return sql.exec<ShipmentRow>("SELECT * FROM shipments WHERE mengantar_order_code = ?", ref.orderCode).toArray()[0] ?? null
  return null
}

/** Creates the status projection for an issued shipment (dispatch, TASK-304, calls this inside its transaction). */
export function insertShipment(
  sql: SqlStorage,
  row: { tenantId: string; slug: string; courierCode: string | null; orderCode: string | null; awb: string | null; status?: EffectiveStatus | string },
  now: number,
  opts: { poll?: boolean } = {},
): void {
  sql.exec(
    `INSERT INTO shipments (tenant_id, slug, courier_code, mengantar_order_code, awb_number, status, index_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    row.tenantId,
    row.slug,
    row.courierCode,
    row.orderCode,
    row.awb,
    row.status ?? "none",
    now,
    now,
  )
  publishIndex(sql, readShipment(sql, row.slug)!, now)
  // Polling floor: the first read-back within the hour (PR-02b); `pollStatus` reschedules itself.
  if (opts.poll !== false) setTimer(sql, "status_poll", now + 3600_000, "earliest")
}

/**
 * Pre-issue and dispatch states (ADR-0004: `draft`, `issuing_in_flight`, `reconciliation_needed`,
 * `provider_unpaid_hold`, `cancelled`) are set explicitly; after issue the provider/custody combine owns `status`.
 * Republishes `shipment_index` (versioned) when the effective status changes.
 */
export function setDispatchStatus(sql: SqlStorage, slug: string, status: string, now: number, extra: Record<string, SqlStorageValue> = {}): void {
  const before = readShipment(sql, slug)
  if (!before) return
  const keys = Object.keys(extra)
  const changed = before.status !== status
  sql.exec(
    `UPDATE shipments SET status = ?, index_version = index_version + ?, updated_at = ?${keys.map((k) => `, ${k} = ?`).join("")} WHERE slug = ?`,
    status,
    changed ? 1 : 0,
    now,
    ...keys.map((k) => extra[k]!),
    slug,
  )
  if (changed || keys.includes("awb_number")) publishIndex(sql, readShipment(sql, slug)!, now)
}

/** After issue: the shipment joins the status projection (provider observations + custody decide `status`). */
export function markIssued(sql: SqlStorage, slug: string, now: number): void {
  const s = readShipment(sql, slug)
  if (!s) return
  sql.exec("UPDATE shipments SET provider_status = COALESCE(provider_status, 'ready_for_pickup'), last_provider_event_at = COALESCE(last_provider_event_at, ?), last_provider_rank = COALESCE(last_provider_rank, 10), index_version = index_version + 1, updated_at = ? WHERE slug = ?", Math.floor(now / 60_000) * 60_000, now, slug)
  // `status` is projected (an observation recorded before issue — e.g. during reconciliation — is not lost).
  const after = readShipment(sql, slug)!
  sql.exec("UPDATE shipments SET status = ? WHERE slug = ?", combine(after.provider_status, after.custody_stage).status, slug)
  publishIndex(sql, readShipment(sql, slug)!, now)
  setTimer(sql, "status_poll", now + 3600_000, "earliest")
}

function publishIndex(sql: SqlStorage, s: ShipmentRow, now: number): void {
  enqueueOutbox(sql, "shipment_index", s.slug, s.index_version, { awb_number: s.awb_number, courier_code: s.courier_code, status: s.status, created_at: s.created_at, updated_at: s.updated_at }, now)
}

export type ObservationSource = "webhook" | "poll" | "local"

/** Re-derives the effective status from both projections; republishes `shipment_index` only when it changed. */
function project(sql: SqlStorage, before: ShipmentRow, next: Pick<ShipmentRow, "provider_status" | "last_provider_event_at" | "last_provider_rank" | "custody_stage" | "custody_at" | "stuck_attention_at">, now: number): { changed: boolean; status: string } {
  const out = combine(next.provider_status, next.custody_stage)
  const status = out.status
  const changed = status !== before.status
  const conflictAt = out.conflict ? (before.provider_status_conflict_at ?? now) : null
  const version = changed ? before.index_version + 1 : before.index_version
  sql.exec(
    `UPDATE shipments SET provider_status = ?, last_provider_event_at = ?, last_provider_rank = ?, custody_stage = ?, custody_at = ?,
       stuck_attention_at = ?, provider_status_conflict_at = ?, status = ?, index_version = ?, updated_at = ? WHERE slug = ?`,
    next.provider_status,
    next.last_provider_event_at,
    next.last_provider_rank,
    next.custody_stage,
    next.custody_at,
    next.stuck_attention_at,
    conflictAt,
    status,
    version,
    now,
    before.slug,
  )
  if (changed) publishIndex(sql, readShipment(sql, before.slug)!, now)
  return { changed, status }
}

/**
 * Records one provider observation (history always; projection only when it wins the ordering key). Idempotent by
 * `eventKey`: a repeated observation is a no-op.
 */
export function recordProviderObservation(
  sql: SqlStorage,
  input: { slug: string; eventKey: string; source: ObservationSource; rawCategory: string | null; mapped: ProviderStatus | null; eventAt: number; eventAtText: string | null },
  now: number,
): { recorded: boolean; changed: boolean; status: string | null } {
  const s = readShipment(sql, input.slug)
  if (!s) return { recorded: false, changed: false, status: null }
  const inserted = sql
    .exec(
      `INSERT INTO shipment_events (event_key, slug, source, raw_category, mapped_status, event_at, event_at_text, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(event_key) DO NOTHING RETURNING event_key`,
      input.eventKey,
      input.slug,
      input.source,
      input.rawCategory,
      input.mapped,
      input.eventAt,
      input.eventAtText,
      now,
    )
    .toArray().length
  if (!inserted || !input.mapped) return { recorded: inserted > 0, changed: false, status: s.status }
  // Pre-issue dispatch states own `status` (a held/unresolved order is not "ready for pickup" yet): record the
  // provider status for later, but leave `status` until `markIssued` projects it.
  if (["draft", "issuing_in_flight", "reconciliation_needed", "provider_unpaid_hold"].includes(s.status)) {
    const incoming0: ProviderObservation = { status: input.mapped, eventAt: input.eventAt }
    const current0: ProviderObservation | null = s.provider_status && s.last_provider_event_at !== null ? { status: s.provider_status, eventAt: s.last_provider_event_at } : null
    if (!current0 || compareKeys(keyOf(incoming0), keyOf(current0)) > 0) {
      sql.exec("UPDATE shipments SET provider_status = ?, last_provider_event_at = ?, last_provider_rank = ?, updated_at = ? WHERE slug = ?", input.mapped, Math.floor(input.eventAt / 60_000) * 60_000, PROVIDER_RANK[input.mapped], now, input.slug)
    }
    return { recorded: true, changed: false, status: s.status }
  }
  const incoming: ProviderObservation = { status: input.mapped, eventAt: input.eventAt }
  const current: ProviderObservation | null = s.provider_status && s.last_provider_event_at !== null ? { status: s.provider_status, eventAt: s.last_provider_event_at } : null
  // Stored event time is the bucket start, so compare keys (bucket-based), not raw instants.
  const wins = !current || compareKeys(keyOf(incoming), keyOf(current)) > 0
  const bucketStart = Math.floor(input.eventAt / 60_000) * 60_000
  const r = project(
    sql,
    s,
    {
      provider_status: wins ? input.mapped : s.provider_status,
      last_provider_event_at: wins ? bucketStart : s.last_provider_event_at,
      last_provider_rank: wins ? PROVIDER_RANK[input.mapped] : s.last_provider_rank,
      custody_stage: s.custody_stage,
      custody_at: s.custody_at,
      // Any newer observation clears the derived "stuck" flag (spec 01 §3.5).
      stuck_attention_at: s.last_provider_event_at === null || input.eventAt >= s.last_provider_event_at ? null : s.stuck_attention_at,
    },
    now,
  )
  return { recorded: true, changed: r.changed, status: r.status }
}

/** Verified local custody action (manifest handover, Meja Retur intake, OTP handback, read-back-confirmed cancel). */
export function recordCustody(sql: SqlStorage, input: { slug: string; stage: Exclude<CustodyStage, "none">; eventKey: string }, now: number): { changed: boolean; status: string } | null {
  const s = readShipment(sql, input.slug)
  if (!s) return null
  sql.exec(
    "INSERT INTO shipment_events (event_key, slug, source, raw_category, mapped_status, event_at, event_at_text, recorded_at) VALUES (?, ?, 'local', ?, NULL, ?, NULL, ?) ON CONFLICT(event_key) DO NOTHING",
    input.eventKey,
    input.slug,
    input.stage,
    now,
    now,
  )
  const stage = reduceCustody(s.custody_stage, input.stage)
  return project(
    sql,
    s,
    { provider_status: s.provider_status, last_provider_event_at: s.last_provider_event_at, last_provider_rank: s.last_provider_rank, custody_stage: stage, custody_at: stage !== s.custody_stage ? now : s.custody_at, stuck_attention_at: s.stuck_attention_at },
    now,
  )
}

/** spec 01 §3.5: in transit and no provider observation for 48 h → attention flag (not a status). */
export function flagStuck(sql: SqlStorage, now: number): number {
  return sql.exec("UPDATE shipments SET stuck_attention_at = ? WHERE status = 'in_transit' AND stuck_attention_at IS NULL AND last_provider_event_at < ? RETURNING slug", now, now - 48 * 3600_000).toArray().length
}

/** Shipments the polling floor should read, least recently polled first. */
export function pollCandidates(sql: SqlStorage, limit: number): ShipmentRow[] {
  return sql
    .exec<ShipmentRow>(
      `SELECT * FROM shipments WHERE status NOT IN ('delivered','cancelled','lost','rts_returned_to_sender','draft','issuing_in_flight','reconciliation_needed','provider_unpaid_hold') AND (awb_number IS NOT NULL OR mengantar_order_code IS NOT NULL)
       ORDER BY COALESCE(last_polled_at, 0) ASC LIMIT ?`,
      limit,
    )
    .toArray()
}

// ---- named timers (one DO alarm serves the outbox and these) ----------------------------------------------------

export type TimerName = "status_poll" | "inbox_sweep" | "key_rotation_check" | "daily_stats" | "finance_sync"

/** Sets a timer to `at`, or earlier only when `earliest` (keeps an already sooner timer). */
export function setTimer(sql: SqlStorage, name: TimerName, at: number, mode: "replace" | "earliest" = "replace"): void {
  if (mode === "earliest") sql.exec("INSERT INTO vault_timers (name, due_at) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET due_at = MIN(due_at, excluded.due_at)", name, at)
  else sql.exec("INSERT INTO vault_timers (name, due_at) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET due_at = excluded.due_at", name, at)
}

export function dueTimers(sql: SqlStorage, now: number): TimerName[] {
  return sql.exec<{ name: TimerName }>("SELECT name FROM vault_timers WHERE due_at <= ?", now).toArray().map((r) => r.name)
}

export function nextTimerAt(sql: SqlStorage): number | null {
  return sql.exec<{ at: number | null }>("SELECT MIN(due_at) AS at FROM vault_timers").toArray()[0]?.at ?? null
}

export { CUSTODY_LEVEL }
