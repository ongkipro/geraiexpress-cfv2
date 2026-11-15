// Generic DO → D1 outbox (ADR-0006 §3): every push is an absolute, versioned upsert; D1 applies a row only when its
// version is newer, so a retry after a lost acknowledgement, a duplicate or a reordered delivery never changes D1.
// The outbox row is written in the same object transaction as the state change that produced it.

export type OutboxTopic = "shipment_index" | "recipient_risk_index" | "tenant_daily_stats"

export type OutboxRow = {
  id: number
  topic: OutboxTopic
  entity_key: string
  version: number
  payload_json: string
  attempts: number
  next_attempt_at: number
}

/** Retry schedule after a failed delivery attempt: 10 s, 30 s, 2 min, 10 min, then every 30 min. */
export function backoffMs(attempts: number): number {
  const steps = [10_000, 30_000, 120_000, 600_000]
  return steps[attempts - 1] ?? 1_800_000
}

/** Enqueue inside the caller's synchronous transaction. Version must be monotone per (topic, entity_key). */
export function enqueueOutbox(sql: SqlStorage, topic: OutboxTopic, entityKey: string, version: number, payload: unknown, now: number): void {
  sql.exec(
    `INSERT INTO outbox (topic, entity_key, version, payload_json, attempts, next_attempt_at, created_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(topic, entity_key, version) DO NOTHING`,
    topic,
    entityKey,
    version,
    JSON.stringify(payload),
    now,
    now,
  )
}

export function dueOutbox(sql: SqlStorage, now: number, limit = 50): OutboxRow[] {
  return sql
    .exec<OutboxRow>("SELECT id, topic, entity_key, version, payload_json, attempts, next_attempt_at FROM outbox WHERE next_attempt_at <= ? ORDER BY id LIMIT ?", now, limit)
    .toArray()
}

export function nextOutboxAt(sql: SqlStorage): number | null {
  const row = sql.exec<{ t: number | null }>("SELECT MIN(next_attempt_at) AS t FROM outbox").toArray()[0]
  return row?.t ?? null
}

/** Statement that applies one outbox row to D1 (versioned absolute upsert). */
export function d1UpsertStatement(db: D1Database, tenantId: string, row: OutboxRow): D1PreparedStatement {
  const p = JSON.parse(row.payload_json) as Record<string, unknown>
  switch (row.topic) {
    case "shipment_index":
      return db
        .prepare(
          `INSERT INTO shipment_index (tenant_id, slug, awb_number, courier_code, status, created_at, updated_at, version)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
           ON CONFLICT(tenant_id, slug) DO UPDATE SET awb_number = excluded.awb_number, courier_code = excluded.courier_code,
             status = excluded.status, updated_at = excluded.updated_at, version = excluded.version
           WHERE excluded.version > shipment_index.version`,
        )
        .bind(tenantId, row.entity_key, p.awb_number ?? null, p.courier_code ?? null, p.status, p.created_at, p.updated_at, row.version)
    default:
      throw new Error(`outbox topic ${row.topic} has no D1 applier yet`)
  }
}
