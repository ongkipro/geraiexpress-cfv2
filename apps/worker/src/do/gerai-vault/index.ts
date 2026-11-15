import { DurableObject } from "cloudflare:workers"
import { TENANT_MIGRATIONS, TENANT_SCHEMA_VERSION } from "@gx/db/tenant"
import { applyTenantMigrations, readSchemaState, tableExists, type MigrateResult, type SchemaState } from "./core/migrate"
import { normalizeSlug } from "@gx/domain/slug"
import { allocateSlug, slugTaken, type SlugPurpose } from "./slug"
import { readConnection, upsertConnection, viewOf, type ConnectionView, type OnboardingState } from "./connection"
import { decryptString, encryptString } from "../../crypto/aead"
import { backoffMs, d1UpsertStatement, dueOutbox, enqueueOutbox, nextOutboxAt, type OutboxTopic } from "./core/outbox"
import { mapMengantarCategory, parseJakartaMinute } from "@gx/domain/status"
import { sha256Hex, timingSafeEqualStr } from "../../crypto"
import { publicClient } from "../../mengantar/factory"
import { eventKeyOf, newPathToken, verifySignature, type VerifyFailure } from "../../webhooks/verify"
import { dueTimers, flagStuck, nextTimerAt, pollCandidates, recordProviderObservation, setTimer, findShipment, type TimerName } from "./status"

export type VaultRefusal = "TENANT_MISMATCH" | "TENANT_NOT_PROVISIONED" | "TENANT_NOT_READY"
export type WebhookRefusal = VaultRefusal | VerifyFailure | "UNKNOWN_TOKEN"

/** Owner-facing webhook state for `/pengaturan/mengantar` (never the secret; the token only as the full URL path). */
export interface WebhookView {
  webhookState: "unconfigured" | "awaiting_seller_setup" | "active" | "secret_mismatch" | "paused"
  pathToken: string | null
  hasSecret: boolean
  lastEventAt: number | null
  lastFailureAt: number | null
  lastPolledAt: number | null
  lastSyncStatus: string | null
}

const HOUR = 3600_000
const POLL_INTERVAL_INACTIVE_MS = HOUR // PR-02b polling floor while the webhook is not active
const POLL_INTERVAL_ACTIVE_MS = 24 * HOUR // daily reconcile: Mengantar never resends updates missed while paused
const INBOX_RESEND_AFTER_MS = 10 * 60_000
const INBOX_RETENTION_MS = 30 * 24 * HOUR
const POLL_BATCH = 50
export type VaultResult<T> = { ok: true; value: T } | { ok: false; refused: VaultRefusal }

const IDENTITY_DDL = "CREATE TABLE IF NOT EXISTS vault_identity (id INTEGER PRIMARY KEY CHECK (id = 1), tenant_id TEXT NOT NULL CHECK (length(tenant_id) > 0), created_at INTEGER NOT NULL)"

/**
 * One object per tenant (ADR-0004, ADR-0006), addressed only through `vaultFor(env, tenantId)` with a tenant id from a
 * verified host or session. The object records its tenant id on the first `migrate` and refuses any other id, so a
 * mis-addressed stub can never read or write another tenant's rows.
 */
export class GeraiVaultDO extends DurableObject<Env> {
  private flushing: Promise<{ delivered: number; failed: number }> | null = null

  /** Read-only. */
  protected tenantId(): string | null {
    if (!tableExists(this.ctx.storage, "vault_identity")) return null
    const row = this.ctx.storage.sql.exec<{ tenant_id: string }>("SELECT tenant_id FROM vault_identity WHERE id = 1").toArray()[0]
    return row?.tenant_id ?? null
  }

  /** Bind this object to its tenant (idempotent) and migrate to `target`. Used by onboarding and `pnpm do:migrate`. */
  async migrate(tenantId: string, target: number = TENANT_SCHEMA_VERSION): Promise<MigrateResult> {
    if (typeof tenantId !== "string" || tenantId.length === 0) return { ok: false, refused: "TENANT_MISMATCH" }
    if (!Number.isSafeInteger(target) || target < 0 || target > TENANT_MIGRATIONS.length) return { ok: false, refused: "UNKNOWN_TARGET" }
    const bound = this.tenantId()
    if (bound !== null && bound !== tenantId) return { ok: false, refused: "TENANT_MISMATCH" }
    if (bound === null) {
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec(IDENTITY_DDL)
        this.ctx.storage.sql.exec("INSERT INTO vault_identity (id, tenant_id, created_at) VALUES (1, ?, ?)", tenantId, Date.now())
      })
    }
    return applyTenantMigrations(this.ctx.storage, TENANT_MIGRATIONS, target)
  }

  async schemaState(): Promise<SchemaState & { tenantId: string | null }> {
    return { ...readSchemaState(this.ctx.storage), tenantId: this.tenantId() }
  }

  /**
   * Guard every feature RPC: right tenant, current schema, not in recovery. Returns a refusal code instead of throwing,
   * so a refusal crosses the RPC boundary as data (no remote exception, no partial work).
   */
  protected refusal(tenantId: string): VaultRefusal | null {
    const bound = this.tenantId()
    if (bound !== tenantId) return bound ? "TENANT_MISMATCH" : "TENANT_NOT_PROVISIONED"
    const s = readSchemaState(this.ctx.storage)
    if (s.state !== "ok" || s.version !== TENANT_SCHEMA_VERSION) return "TENANT_NOT_READY"
    return null
  }

  /** Allocates one INV slug (feature tasks call `allocateSlug` inside their own transaction instead). */
  async allocateSlug(tenantId: string, purpose: SlugPurpose): Promise<VaultResult<string>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    return { ok: true, value: allocateSlug(this.ctx.storage, purpose, Date.now()) }
  }

  /** Case-insensitive existence check (`INV 8K4M2P7`, `#8k4m2p7`, `8k4m2p7`). */
  async slugExists(tenantId: string, input: string): Promise<VaultResult<boolean>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const slug = normalizeSlug(input)
    return { ok: true, value: slug !== null && slugTaken(this.ctx.storage, slug) }
  }

  // ---- Mengantar connection (TASK-203) --------------------------------------------------------------------------

  async connectionView(tenantId: string): Promise<VaultResult<ConnectionView | null>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    return { ok: true, value: viewOf(readConnection(this.ctx.storage.sql)) }
  }

  /** Records an onboarding step; a key, when given, is encrypted before it touches storage. */
  async recordOnboarding(
    tenantId: string,
    step: { environment: "sandbox" | "production"; state: OnboardingState; sellerId?: string | null; externalUserId?: string; apiKey?: string | null },
  ): Promise<VaultResult<ConnectionView | null>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const now = Date.now()
    const cur = readConnection(this.ctx.storage.sql)
    const encrypted = step.apiKey ? await encryptString(this.env.KEK_SECRET, step.apiKey, `seller-key:${tenantId}`) : undefined
    upsertConnection(
      this.ctx.storage.sql,
      tenantId,
      {
        environment: step.environment,
        onboarding_state: step.state,
        ...(step.sellerId !== undefined ? { seller_id: step.sellerId } : {}),
        ...(step.externalUserId !== undefined ? { external_user_id: step.externalUserId } : {}),
        ...(encrypted ? { encrypted_api_key: encrypted, key_version: (cur?.key_version ?? 0) + 1, webhook_state: cur?.webhook_state === "active" ? "active" : "awaiting_seller_setup" } : {}),
      },
      now,
    )
    this.ctx.storage.sql.exec(
      "INSERT INTO audit_logs (id, tenant_id, at, actor_type, action, target_type, metadata_json) VALUES (?, ?, ?, 'system', 'mengantar.onboarding', 'mengantar_connection', ?)",
      crypto.randomUUID(),
      tenantId,
      now,
      JSON.stringify({ state: step.state, sellerId: step.sellerId ?? null, keyStored: !!encrypted }),
    )
    return { ok: true, value: viewOf(readConnection(this.ctx.storage.sql)) }
  }

  /** Decrypts the seller key for a server-side Mengantar call; never returned through a public API. */
  protected async sellerKey(tenantId: string): Promise<{ key: string; version: number } | null> {
    const row = readConnection(this.ctx.storage.sql)
    if (!row?.encrypted_api_key) return null
    return { key: await decryptString(this.env.KEK_SECRET, row.encrypted_api_key, `seller-key:${tenantId}`), version: row.key_version }
  }

  /**
   * Feature code calls this inside its own `transactionSync` together with the state change, then awaits
   * `armOutbox()` before returning so the alarm exists even if the object is evicted right after the commit.
   */
  protected enqueue(topic: OutboxTopic, entityKey: string, version: number, payload: unknown, now: number = Date.now()): void {
    enqueueOutbox(this.ctx.storage.sql, topic, entityKey, version, payload, now)
  }

  /** Arms the single DO alarm at the earliest of the outbox and the named timers. */
  protected async armOutbox(): Promise<void> {
    if (!tableExists(this.ctx.storage, "outbox")) return
    const o = nextOutboxAt(this.ctx.storage.sql)
    const t = tableExists(this.ctx.storage, "vault_timers") ? nextTimerAt(this.ctx.storage.sql) : null
    const at = o === null ? t : t === null ? o : Math.min(o, t)
    if (at === null) return
    const current = await this.ctx.storage.getAlarm()
    if (current === null || current > at) await this.ctx.storage.setAlarm(at)
  }

  /** Deliver due rows to D1; one flush at a time per object; a row is deleted only after D1 acknowledged it. */
  async flushOutbox(now: number = Date.now()): Promise<{ delivered: number; failed: number }> {
    if (this.flushing) return this.flushing
    this.flushing = this.flushOnce(now).finally(() => {
      this.flushing = null
    })
    return this.flushing
  }

  private async flushOnce(now: number): Promise<{ delivered: number; failed: number }> {
    const tenantId = this.tenantId()
    if (!tenantId || !tableExists(this.ctx.storage, "outbox")) return { delivered: 0, failed: 0 }
    const rows = dueOutbox(this.ctx.storage.sql, now)
    if (rows.length === 0) {
      await this.armOutbox()
      return { delivered: 0, failed: 0 }
    }
    // Safety net first: if the object dies while D1 is awaited, the alarm still retries these rows.
    const safety = now + backoffMs(1)
    const current = await this.ctx.storage.getAlarm()
    if (current === null || current > safety) await this.ctx.storage.setAlarm(safety)
    let delivered = 0
    let failed = 0
    for (const row of rows) {
      try {
        await d1UpsertStatement(this.env.DB, tenantId, row).run()
        this.ctx.storage.sql.exec("DELETE FROM outbox WHERE id = ?", row.id)
        delivered++
      } catch (err) {
        failed++
        const message = (err instanceof Error ? err.message : String(err)).slice(0, 300)
        const r = this.ctx.storage.sql.exec<{ attempts: number }>("UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ? RETURNING attempts", message, row.id).toArray()[0]
        if (r) this.ctx.storage.sql.exec("UPDATE outbox SET next_attempt_at = ? WHERE id = ?", now + backoffMs(r.attempts), row.id)
      }
    }
    await this.ctx.storage.deleteAlarm()
    await this.armOutbox()
    return { delivered, failed }
  }

  async alarm(): Promise<void> {
    await this.flushOutbox()
    await this.runTimers()
  }

  /** Runs due named timers (status polling floor, inbox sweep) and re-arms the alarm. */
  async runTimers(now: number = Date.now()): Promise<TimerName[]> {
    const tenantId = this.tenantId()
    if (!tenantId || !tableExists(this.ctx.storage, "vault_timers") || this.refusal(tenantId)) return []
    const due = dueTimers(this.ctx.storage.sql, now)
    for (const name of due) {
      if (name === "status_poll") await this.pollStatus(tenantId, now)
      if (name === "inbox_sweep") await this.sweepInbox(tenantId, now)
    }
    await this.armOutbox()
    return due
  }

  // ---- Webhooks, inbox and status (TASK-204, spec 01 §2.7 and §3) ---------------------------------------------------

  private webhookView(): WebhookView | null {
    const row = this.ctx.storage.sql
      .exec<{ webhook_state: WebhookView["webhookState"]; webhook_path_token: string | null; encrypted_webhook_secret: string | null; webhook_last_event_at: number | null; webhook_last_failure_at: number | null; last_polled_at: number | null; last_sync_status: string | null }>(
        "SELECT webhook_state, webhook_path_token, encrypted_webhook_secret, webhook_last_event_at, webhook_last_failure_at, last_polled_at, last_sync_status FROM mengantar_connections LIMIT 1",
      )
      .toArray()[0]
    if (!row) return null
    return {
      webhookState: row.webhook_state,
      pathToken: row.webhook_path_token,
      hasSecret: !!row.encrypted_webhook_secret,
      lastEventAt: row.webhook_last_event_at,
      lastFailureAt: row.webhook_last_failure_at,
      lastPolledAt: row.last_polled_at,
      lastSyncStatus: row.last_sync_status,
    }
  }

  async webhookStatus(tenantId: string): Promise<VaultResult<WebhookView | null>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    return { ok: true, value: this.webhookView() }
  }

  /**
   * Returns the tenant's webhook path token, creating it once (idempotent). The caller registers
   * `sha256(token)` in D1 `webhook_routes`; `created` tells it whether a new row is needed.
   */
  async ensureWebhookToken(tenantId: string): Promise<VaultResult<{ token: string; keyVersion: number; created: boolean }>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const row = readConnection(this.ctx.storage.sql)
    if (!row) return { ok: false, refused: "TENANT_NOT_PROVISIONED" }
    if (row.webhook_path_token) return { ok: true, value: { token: row.webhook_path_token, keyVersion: row.key_version, created: false } }
    const token = newPathToken()
    this.ctx.storage.sql.exec(
      "UPDATE mengantar_connections SET webhook_path_token = ?, webhook_state = CASE WHEN webhook_state = 'unconfigured' THEN 'awaiting_seller_setup' ELSE webhook_state END, updated_at = ?",
      token,
      Date.now(),
    )
    return { ok: true, value: { token, keyVersion: row.key_version, created: true } }
  }

  /** Stores the Webhook Secret pasted by the owner (AES-GCM); verification proves it on the next delivery. */
  async saveWebhookSecret(tenantId: string, secret: string, actorId: string): Promise<VaultResult<WebhookView | null>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const row = readConnection(this.ctx.storage.sql)
    if (!row?.webhook_path_token) return { ok: false, refused: "TENANT_NOT_PROVISIONED" }
    const enc = await encryptString(this.env.KEK_SECRET, secret, `webhook-secret:${tenantId}`)
    const now = Date.now()
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "UPDATE mengantar_connections SET encrypted_webhook_secret = ?, webhook_state = CASE WHEN webhook_state = 'active' THEN 'active' ELSE 'awaiting_seller_setup' END, webhook_last_failure_at = NULL, updated_at = ?",
        enc,
        now,
      )
      this.ctx.storage.sql.exec(
        "INSERT INTO audit_logs (id, tenant_id, at, actor_type, actor_id, action, target_type, metadata_json) VALUES (?, ?, ?, 'user', ?, 'mengantar.webhook_secret_saved', 'mengantar_connection', '{}')",
        crypto.randomUUID(),
        tenantId,
        now,
        actorId,
      )
    })
    return { ok: true, value: this.webhookView() }
  }

  /**
   * Verify (token, signature, window, environment) and store the raw body in `webhook_inbox` before the Worker answers
   * 200. A duplicate delivery is a no-op that still answers 200.
   */
  async ingestWebhook(
    tenantId: string,
    input: { token: string; timestamp: string | null; signature: string | null; environmentHeader: string | null; rawBody: string },
    now: number = Date.now(),
  ): Promise<{ ok: true; value: { eventKey: string; duplicate: boolean } } | { ok: false; refused: WebhookRefusal }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const row = readConnection(this.ctx.storage.sql)
    // The object checks the token itself, so a wrong D1 route can never deliver into this tenant.
    if (!row?.webhook_path_token || !(await timingSafeEqualStr(row.webhook_path_token, input.token))) return { ok: false, refused: "UNKNOWN_TOKEN" }
    if (!row.encrypted_webhook_secret) return { ok: false, refused: "NOT_CONFIGURED" }
    const secret = await decryptString(this.env.KEK_SECRET, row.encrypted_webhook_secret, `webhook-secret:${tenantId}`)
    const v = await verifySignature(secret, { ...input, expect: row.environment }, now)
    if (!v.ok) {
      if (v.reason === "BAD_SIGNATURE") {
        this.ctx.storage.sql.exec(
          "UPDATE mengantar_connections SET webhook_last_failure_at = ?, webhook_state = CASE WHEN webhook_state = 'active' THEN 'active' ELSE 'secret_mismatch' END",
          now,
        )
      }
      return { ok: false, refused: v.reason }
    }
    const eventKey = await eventKeyOf(input.timestamp!, input.rawBody)
    let duplicate = false
    this.ctx.storage.transactionSync(() => {
      duplicate =
        this.ctx.storage.sql
          .exec(
            "INSERT INTO webhook_inbox (event_key, provider_timestamp_raw, provider_event_at, received_at, raw_body, state) VALUES (?, ?, ?, ?, ?, 'received') ON CONFLICT(event_key) DO NOTHING RETURNING event_key",
            eventKey,
            input.timestamp!,
            v.eventAt,
            now,
            input.rawBody,
          )
          .toArray().length === 0
      this.ctx.storage.sql.exec("UPDATE mengantar_connections SET webhook_state = 'active', webhook_last_event_at = ?", now)
      // Safety net for a lost Queue message or a failed enqueue after this commit.
      setTimer(this.ctx.storage.sql, "inbox_sweep", now + INBOX_RESEND_AFTER_MS, "earliest")
    })
    await this.armOutbox()
    return { ok: true, value: { eventKey, duplicate } }
  }

  /** Queue consumer step: apply one stored event idempotently (spec 01 §2.7 Apply). */
  async applyWebhook(tenantId: string, eventKey: string, now: number = Date.now()): Promise<VaultResult<{ state: "applied" | "rejected" | "noop"; status: string | null }>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    let out: { state: "applied" | "rejected" | "noop"; status: string | null } = { state: "noop", status: null }
    this.ctx.storage.transactionSync(() => {
      const row = sql.exec<{ raw_body: string; provider_event_at: number; state: string }>("SELECT raw_body, provider_event_at, state FROM webhook_inbox WHERE event_key = ?", eventKey).toArray()[0]
      if (!row || row.state !== "received") return
      let body: { cnote_no?: unknown; order_id?: unknown; status_category?: unknown } = {}
      try {
        body = JSON.parse(row.raw_body) as typeof body
      } catch {
        body = {}
      }
      const str = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 100 ? v : null)
      const ship = findShipment(sql, { awb: str(body.cnote_no), orderCode: str(body.order_id) })
      const category = str(body.status_category)
      if (!ship || !category) {
        sql.exec("UPDATE webhook_inbox SET state = 'rejected', applied_at = ?, error = ? WHERE event_key = ?", now, !ship ? "UNKNOWN_SHIPMENT" : "MISSING_STATUS", eventKey)
        out = { state: "rejected", status: null }
        return
      }
      const r = recordProviderObservation(sql, { slug: ship.slug, eventKey: `wh:${eventKey}`, source: "webhook", rawCategory: category, mapped: mapMengantarCategory(category), eventAt: row.provider_event_at, eventAtText: null }, now)
      sql.exec("UPDATE webhook_inbox SET state = 'applied', applied_at = ? WHERE event_key = ?", now, eventKey)
      out = { state: "applied", status: r.status }
    })
    await this.armOutbox()
    return { ok: true, value: out }
  }

  /** Re-enqueue rows still `received` after 10 minutes; delete `applied`/`rejected` rows older than 30 days. */
  async sweepInbox(tenantId: string, now: number = Date.now()): Promise<VaultResult<{ resent: number; deleted: number }>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const stale = sql.exec<{ event_key: string }>("SELECT event_key FROM webhook_inbox WHERE state = 'received' AND received_at <= ? ORDER BY received_at LIMIT 100", now - INBOX_RESEND_AFTER_MS).toArray()
    let resent = 0
    for (const r of stale) {
      try {
        await this.env.WEBHOOK_QUEUE.send({ tenant_id: tenantId, event_key: r.event_key })
        resent++
      } catch {
        // stays `received`; the next sweep retries
      }
    }
    const deleted = sql.exec("DELETE FROM webhook_inbox WHERE state IN ('applied','rejected') AND COALESCE(applied_at, received_at) < ? RETURNING event_key", now - INBOX_RETENTION_MS).toArray().length
    const pending = sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM webhook_inbox WHERE state = 'received'").one().n
    const any = sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM webhook_inbox").one().n
    if (pending > 0) setTimer(sql, "inbox_sweep", now + INBOX_RESEND_AFTER_MS)
    else if (any > 0) setTimer(sql, "inbox_sweep", now + 24 * HOUR)
    else sql.exec("DELETE FROM vault_timers WHERE name = 'inbox_sweep'")
    return { ok: true, value: { resent, deleted } }
  }

  /**
   * Polling floor (PR-02b): reads `GET /order` for open shipments and records each history entry as a provider
   * observation. Hourly while the webhook is not `active`, daily otherwise.
   */
  async pollStatus(tenantId: string, now: number = Date.now()): Promise<VaultResult<{ polled: number; changed: number; failed: number }>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const conn = readConnection(sql)
    const candidates = pollCandidates(sql, POLL_BATCH)
    let polled = 0
    let changed = 0
    let failed = 0
    const key = conn ? await this.sellerKey(tenantId) : null
    if (key && candidates.length > 0) {
      const client = publicClient(this.env, key.key)
      for (const s of candidates) {
        try {
          const order = await client.getOrder(s.awb_number ? { trackingId: s.awb_number } : { orderId: s.mengantar_order_code! })
          polled++
          const history = order?.history ?? []
          const obs = await Promise.all(
            history.map(async (h) => {
              const category = (h.statusCategory ?? h.status ?? "").trim()
              return { category, eventAt: parseJakartaMinute(h.date), text: h.date, key: await sha256Hex(`poll|${s.slug}|${h.date}|${category}`) }
            }),
          )
          let paused = false
          this.ctx.storage.transactionSync(() => {
            for (const o of obs) {
              if (o.eventAt === null || !o.category) continue
              const r = recordProviderObservation(sql, { slug: s.slug, eventKey: o.key, source: "poll", rawCategory: o.category, mapped: mapMengantarCategory(o.category), eventAt: o.eventAt, eventAtText: o.text }, now)
              if (r.changed) changed++
              // A provider change older than 2 h that never arrived by webhook means Mengantar paused deliveries.
              if (r.changed && conn?.webhook_state === "active" && o.eventAt < now - 2 * HOUR) paused = true
            }
            sql.exec("UPDATE shipments SET last_polled_at = ? WHERE slug = ?", now, s.slug)
            if (paused) sql.exec("UPDATE mengantar_connections SET webhook_state = 'paused'")
          })
        } catch {
          failed++
        }
      }
    }
    const active = readConnection(sql)?.webhook_state === "active"
    this.ctx.storage.transactionSync(() => {
      flagStuck(sql, now)
      if (conn) sql.exec("UPDATE mengantar_connections SET last_polled_at = ?, last_sync_status = ?", now, failed > 0 ? `poll_failed:${failed}` : "ok")
      if (pollCandidates(sql, 1).length > 0) setTimer(sql, "status_poll", now + (active ? POLL_INTERVAL_ACTIVE_MS : POLL_INTERVAL_INACTIVE_MS))
      else sql.exec("DELETE FROM vault_timers WHERE name = 'status_poll'")
    })
    await this.armOutbox()
    return { ok: true, value: { polled, changed, failed } }
  }
}
