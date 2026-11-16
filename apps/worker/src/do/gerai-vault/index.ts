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
import { partnerClient, publicClient } from "../../mengantar/factory"
import type { Courier, CourierRate } from "@gx/mengantar-sdk"
import { safeLink, type NotificationItem, type NotificationKind } from "../../notifications"
import { archiveContact, badgeForPhone, badgeOf, createRecipient, createSender, markWaVerified, readRecipient, readSender, recordCodOutcome, searchRecipients, searchSenders, senderCounts, updateRecipient, updateSender, type ContactError, type RecipientInput, type RecipientRow, type SenderInput, type SenderRow } from "./contacts"
import { phoneHmac } from "../../admin/monitor"
import type { MediaPurpose } from "../../media"
import { eventKeyOf, newPathToken, verifySignature, type VerifyFailure } from "../../webhooks/verify"
import { dueTimers, flagStuck, nextTimerAt, pollCandidates, recordProviderObservation, setTimer, findShipment, type TimerName } from "./status"

export type ContactOp =
  | { op: "list_senders"; q?: string; filter?: "all" | "walk_in" | "reseller_dropship" }
  | { op: "list_recipients"; q?: string }
  | { op: "get_sender"; id: string }
  | { op: "get_recipient"; id: string }
  | { op: "create_sender"; input: SenderInput }
  | { op: "update_sender"; id: string; input: SenderInput }
  | { op: "create_recipient"; input: RecipientInput }
  | { op: "update_recipient"; id: string; input: RecipientInput }
  | { op: "verify_wa"; id: string }
  | { op: "archive"; contact: "sender" | "recipient"; id: string }
  | { op: "badge"; phone: string }

type Risk = { badge: "baru" | "hijau" | "kuning" | "merah"; rtsBps: number | null }
export type ContactOpResult =
  | { kind: "none" }
  | { kind: "senders"; items: SenderRow[]; counts: { all: number; reseller_dropship: number; walk_in: number } }
  | { kind: "recipients"; items: Array<RecipientRow & { risk: Risk }> }
  | { kind: "sender"; item: SenderRow | null }
  | { kind: "recipient"; item: (RecipientRow & { risk: Risk }) | null }
  | { kind: "errors"; errors: ContactError[] }
  | { kind: "archived"; done: boolean }
  | { kind: "badge"; badge: { phone: string | null; delivered: number; rts: number } & Risk }

/** One estimate row as plain values (safe across RPC; spec 02 §1 cargo fields kept apart). */
export interface ObservedRate {
  unsupported: boolean
  unsupportedCod: boolean
  unsupportedPickup: boolean
  price: number | null
  discount: number | null
  discountPercent: number | null
  codFee: number | null
  estimatedPrice: number | null
  estimatedSpecialPrice: number | null
  cargoPrice: number | null
  cargoDiscount: number | null
  cargoEstimatedPrice: number | null
  cargoEstimatedSpecialPrice: number | null
  minimumWeightCargo: number | null
  eta: string | null
}

export type FrozenQuote = {
  shipment_slug: string
  origin_area_id: string
  destination_area_id: string
  cod_fee_mode: string
  actual_weight_gram: number
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  volumetric_divisor: number
  billable_weight_gram: number
  provider_weight_kg_text: string
  courier_code: string
  service_code: string
  service_class: string
  publish_shipping_idr: number
  provider_net_shipping_idr: number
  raw_discount_percent: string | null
  provider_observed_discount_bps: number | null
  assigned_gerai_discount_bps: number | null
  effective_gerai_cost_idr: number
  insurance_fee_idr: number | null
  cod_fee_idr: number
  cod_goods_amount_idr: number
  cod_collection_total_idr: number
  counter_due_idr: number
  sender_cod_payable_idr: number
  expected_provider_cod_credit_idr: number
  packing_addon_idr: number
  estimated_margin_idr: number
  quoted_at: number
  expires_at: number
}

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
const ROTATION_STALE_MS = 5 * 60_000
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
    // Rotation fence (ADR-0004 §5): no Mengantar call with a key that may be replaced right now.
    if (!row?.encrypted_api_key || row.rotation_state !== "idle") return null
    return { key: await decryptString(this.env.KEK_SECRET, row.encrypted_api_key, `seller-key:${tenantId}`), version: row.key_version }
  }

  // ---- Contacts (TASK-302) -----------------------------------------------------------------------------------------

  async contacts(tenantId: string, op: ContactOp, actorId: string, now: number = Date.now()): Promise<VaultResult<ContactOpResult>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    let out: ContactOpResult = { kind: "none" }
    this.ctx.storage.transactionSync(() => {
      switch (op.op) {
        case "list_senders":
          out = { kind: "senders", items: searchSenders(sql, op.q ?? "", op.filter ?? "all"), counts: senderCounts(sql) }
          return
        case "list_recipients":
          out = { kind: "recipients", items: searchRecipients(sql, op.q ?? "").map((r) => ({ ...r, risk: badgeOf(r) })) }
          return
        case "get_sender":
          out = { kind: "sender", item: readSender(sql, op.id) }
          return
        case "get_recipient": {
          const r = readRecipient(sql, op.id)
          out = { kind: "recipient", item: r ? { ...r, risk: badgeOf(r) } : null }
          return
        }
        case "create_sender":
        case "update_sender": {
          const r = op.op === "create_sender" ? createSender(sql, tenantId, op.input, now) : updateSender(sql, op.id, op.input, now)
          if (r.ok) this.audit(tenantId, now, "user", actorId, op.op === "create_sender" ? "contact.sender_create" : "contact.sender_update", { id: r.value.id })
          out = r.ok ? { kind: "sender", item: r.value } : { kind: "errors", errors: r.errors }
          return
        }
        case "create_recipient":
        case "update_recipient": {
          const r = op.op === "create_recipient" ? createRecipient(sql, tenantId, op.input, now) : updateRecipient(sql, op.id, op.input, now)
          if (r.ok) this.audit(tenantId, now, "user", actorId, op.op === "create_recipient" ? "contact.recipient_create" : "contact.recipient_update", { id: r.value.id })
          out = r.ok ? { kind: "recipient", item: { ...r.value, risk: badgeOf(r.value) } } : { kind: "errors", errors: r.errors }
          return
        }
        case "verify_wa": {
          const r = markWaVerified(sql, op.id, actorId, now)
          if (r) this.audit(tenantId, now, "user", actorId, "contact.wa_verified", { id: op.id, method: "operator_confirmed" })
          out = { kind: "sender", item: r }
          return
        }
        case "archive": {
          const done = archiveContact(sql, op.contact, op.id, now)
          if (done) this.audit(tenantId, now, "user", actorId, "contact.archive", { id: op.id, contact: op.contact })
          out = { kind: "archived", done }
          return
        }
        case "badge":
          out = { kind: "badge", badge: badgeForPhone(sql, op.phone) }
          return
      }
    })
    return { ok: true, value: out }
  }

  /**
   * A terminal COD outcome for a recipient: bumps local counters and publishes the absolute, versioned counts to D1
   * `recipient_risk_index` (phone HMAC only) in the same transaction (spec 01 §2.6).
   */
  async recordRecipientCodOutcome(tenantId: string, recipientId: string, outcome: "delivered" | "rts", now: number = Date.now()): Promise<VaultResult<{ delivered: number; rts: number; version: number } | null>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const row = readRecipient(this.ctx.storage.sql, recipientId)
    if (!row) return { ok: true, value: null }
    const key = await phoneHmac(this.env.AUTH_SESSION_PEPPER, `62${row.phone.slice(1)}`)
    let res: { delivered: number; rts: number; version: number } | null = null
    this.ctx.storage.transactionSync(() => {
      const r = recordCodOutcome(this.ctx.storage.sql, recipientId, outcome, now)
      if (!r) return
      enqueueOutbox(this.ctx.storage.sql, "recipient_risk_index", key, r.version, { delivered_count: r.delivered, rts_count: r.rts, last_event_at: now }, now)
      res = { delivered: r.delivered, rts: r.rts, version: r.version }
    })
    await this.armOutbox()
    return { ok: true, value: res }
  }

  // ---- Media (TASK-302): the object owns the index of this gerai's R2 keys ----------------------------------------

  async registerMedia(tenantId: string, m: { key: string; purpose: MediaPurpose; contentType: string; sizeBytes: number; uploadedBy: string }, now: number = Date.now()): Promise<VaultResult<string>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    if (!m.key.startsWith(`t/${tenantId}/`)) return { ok: false, refused: "TENANT_MISMATCH" }
    const id = crypto.randomUUID()
    this.ctx.storage.sql.exec("INSERT INTO media_objects (id, tenant_id, r2_key, purpose, content_type, size_bytes, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, tenantId, m.key, m.purpose, m.contentType, m.sizeBytes, m.uploadedBy, now)
    return { ok: true, value: id }
  }

  async mediaKey(tenantId: string, id: string): Promise<VaultResult<{ key: string; contentType: string } | null>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const r = this.ctx.storage.sql.exec<{ r2_key: string; content_type: string }>("SELECT r2_key, content_type FROM media_objects WHERE id = ?", id).toArray()[0]
    return { ok: true, value: r ? { key: r.r2_key, contentType: r.content_type } : null }
  }

  // ---- Notifications (TASK-301) -------------------------------------------------------------------------------------

  async addNotification(tenantId: string, n: { kind: NotificationKind; audience: "all" | "owner"; title: string; body?: string | null; link?: string | null; dedupeKey?: string }, now: number = Date.now()): Promise<VaultResult<string>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const id = n.dedupeKey ? `d:${n.dedupeKey}`.slice(0, 120) : crypto.randomUUID()
    this.ctx.storage.sql.exec(
      "INSERT INTO notifications (id, tenant_id, kind, audience, title, body, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
      id,
      tenantId,
      n.kind,
      n.audience,
      n.title.slice(0, 160),
      n.body?.slice(0, 500) ?? null,
      safeLink(n.link),
      now,
    )
    // Keep the table bounded: 90 days.
    this.ctx.storage.sql.exec("DELETE FROM notification_reads WHERE notification_id IN (SELECT id FROM notifications WHERE created_at < ?)", now - 90 * 24 * 3600_000)
    this.ctx.storage.sql.exec("DELETE FROM notifications WHERE created_at < ?", now - 90 * 24 * 3600_000)
    return { ok: true, value: id }
  }

  /** Newest first for one user; owner-only items are excluded for cashiers at the source. */
  async listNotifications(tenantId: string, viewer: { userId: string; role: "gerai_admin" | "cashier" }, limit = 100): Promise<VaultResult<{ items: NotificationItem[]; unread: number }>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const audience = viewer.role === "gerai_admin" ? "('all','owner')" : "('all')"
    const rows = this.ctx.storage.sql
      .exec<{ id: string; kind: NotificationKind; title: string; body: string | null; link: string | null; created_at: number; read_at: number | null }>(
        `SELECT n.id, n.kind, n.title, n.body, n.link, n.created_at, r.read_at FROM notifications n
         LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
         WHERE n.audience IN ${audience} ORDER BY n.created_at DESC LIMIT ?`,
        viewer.userId,
        Math.min(200, Math.max(1, limit)),
      )
      .toArray()
    const unread = this.ctx.storage.sql
      .exec<{ n: number }>(`SELECT COUNT(*) AS n FROM notifications n LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ? WHERE n.audience IN ${audience} AND r.read_at IS NULL`, viewer.userId)
      .one().n
    return { ok: true, value: { items: rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, link: r.link, createdAt: r.created_at, readAt: r.read_at })), unread } }
  }

  /** Marks the given ids (or all visible ones) read for this user only. */
  async markNotificationsRead(tenantId: string, viewer: { userId: string; role: "gerai_admin" | "cashier" }, ids: string[] | "all", now: number = Date.now()): Promise<VaultResult<number>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const audience = viewer.role === "gerai_admin" ? "('all','owner')" : "('all')"
    let n = 0
    this.ctx.storage.transactionSync(() => {
      const visible = this.ctx.storage.sql.exec<{ id: string }>(`SELECT id FROM notifications WHERE audience IN ${audience}`).toArray().map((r) => r.id)
      const target = ids === "all" ? visible : ids.filter((id) => visible.includes(id))
      for (const id of target) n += this.ctx.storage.sql.exec("INSERT INTO notification_reads (notification_id, user_id, read_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING RETURNING notification_id", id, viewer.userId, now).toArray().length
    })
    return { ok: true, value: n }
  }

  // ---- Discount verification (TASK-207) -----------------------------------------------------------------------------

  /** One `courier=all` estimate (1 kg, origin = destination = the outlet area) for the discount verifier. */
  async observeRates(tenantId: string, areaId: string): Promise<{ ok: true; value: Record<string, ObservedRate> } | { ok: false; refused: VaultRefusal | "NO_KEY" }> {
    const r = await this.estimateRates(tenantId, { originId: areaId, destinationId: areaId, courier: "all", weightKg: 1 })
    return r.ok ? { ok: true, value: r.value } : { ok: false, refused: r.refused === "PROVIDER_ERROR" ? "NO_KEY" : r.refused }
  }

  /**
   * Mengantar `/order/estimate` with this gerai's key (the key never leaves the object). Returns plain numbers only;
   * a provider failure is a refusal, never an exception across the RPC boundary.
   */
  async estimateRates(
    tenantId: string,
    q: { originId: string; destinationId: string; courier: Courier | "all"; weightKg: number; codAmountIdr?: number },
  ): Promise<{ ok: true; value: Record<string, ObservedRate> } | { ok: false; refused: VaultRefusal | "NO_KEY" | "PROVIDER_ERROR"; message?: string }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const key = await this.sellerKey(tenantId)
    if (!key) return { ok: false, refused: "NO_KEY" }
    let rates: Record<string, CourierRate>
    try {
      rates = await publicClient(this.env, key.key).estimate({ originId: q.originId, destinationId: q.destinationId, courier: q.courier, weightKg: q.weightKg, codAmountIdr: q.codAmountIdr })
    } catch (err) {
      return { ok: false, refused: "PROVIDER_ERROR", message: err instanceof Error ? err.message.slice(0, 200) : "estimate failed" }
    }
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
    const t = (v: unknown) => (typeof v === "string" ? v.slice(0, 40) : null)
    const value: Record<string, ObservedRate> = {}
    for (const [k, r] of Object.entries(rates)) {
      value[k] = {
        unsupported: r.unsupported === true,
        unsupportedCod: r.unsupported_cod === true,
        unsupportedPickup: r.unsupportedPickup === true,
        price: n(r.price),
        discount: n(r.discount),
        discountPercent: n(r.discountPercent),
        codFee: n(r.codFee),
        estimatedPrice: n(r.estimatedPrice),
        estimatedSpecialPrice: n(r.estimatedSpecialPrice),
        cargoPrice: n(r.cargoPrice),
        cargoDiscount: n(r.cargoDiscount),
        cargoEstimatedPrice: n(r.cargoEstimatedPrice),
        cargoEstimatedSpecialPrice: n(r.cargoEstimatedSpecialPrice),
        minimumWeightCargo: n(r.minimumWeightCargo),
        eta: t(r.estimate_delivery) ?? t(r.estimatedDate),
      }
    }
    return { ok: true, value }
  }

  /** The default outlet (pickup origin). Written on approval from the application (TASK-303). */
  async defaultOutlet(tenantId: string): Promise<VaultResult<{ id: string; areaId: string | null; name: string } | null>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const r = this.ctx.storage.sql.exec<{ id: string; mengantar_area_id: string | null; name: string }>("SELECT id, mengantar_area_id, name FROM tenant_outlets WHERE is_default = 1 LIMIT 1").toArray()[0]
    return { ok: true, value: r ? { id: r.id, areaId: r.mengantar_area_id, name: r.name } : null }
  }

  async upsertDefaultOutlet(tenantId: string, o: { name: string; picName?: string | null; picPhone?: string | null; areaId: string; areaLabel?: string | null; street?: string | null; postalCode?: string | null }, now: number = Date.now()): Promise<VaultResult<string>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const cur = sql.exec<{ id: string }>("SELECT id FROM tenant_outlets WHERE is_default = 1 LIMIT 1").toArray()[0]
    const id = cur?.id ?? crypto.randomUUID()
    sql.exec(
      `INSERT INTO tenant_outlets (id, tenant_id, name, pic_name, pic_phone, mengantar_area_id, subdistrict_name, postal_code, street_address, is_default, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, ?10, ?10)
       ON CONFLICT(id) DO UPDATE SET name = ?3, pic_name = ?4, pic_phone = ?5, mengantar_area_id = ?6, subdistrict_name = ?7, postal_code = ?8, street_address = ?9, updated_at = ?10`,
      id,
      tenantId,
      o.name,
      o.picName ?? null,
      o.picPhone ?? null,
      o.areaId,
      o.areaLabel ?? null,
      o.postalCode ?? null,
      o.street ?? null,
      now,
    )
    return { ok: true, value: id }
  }

  /** Stores a server-computed frozen quote for an allocated INV slug (TASK-304 dispatch sends these values). */
  async freezeQuote(tenantId: string, snap: FrozenQuote): Promise<VaultResult<string> | { ok: false; refused: "UNKNOWN_SLUG" }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    if (!slugTaken(this.ctx.storage, snap.shipment_slug)) return { ok: false, refused: "UNKNOWN_SLUG" }
    const id = crypto.randomUUID()
    const cols = Object.keys(snap) as (keyof FrozenQuote)[]
    this.ctx.storage.sql.exec(
      `INSERT INTO quote_snapshots (id, tenant_id, ${cols.join(", ")}) VALUES (?, ?, ${cols.map(() => "?").join(", ")})`,
      id,
      tenantId,
      ...cols.map((c) => snap[c] as SqlStorageValue),
    )
    return { ok: true, value: id }
  }

  // ---- Courier preferences (TASK-206) --------------------------------------------------------------------------------

  async courierPrefs(tenantId: string): Promise<VaultResult<Array<{ courier_code: string; enabled: number; pickup_mode: "scheduled_pickup" | "drop_off_only"; updated_at: number }>>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    return { ok: true, value: this.ctx.storage.sql.exec<{ courier_code: string; enabled: number; pickup_mode: "scheduled_pickup" | "drop_off_only"; updated_at: number }>("SELECT courier_code, enabled, pickup_mode, updated_at FROM tenant_courier_prefs").toArray() }
  }

  /** Upserts one courier preference (validated by the caller against the catalog) with a tenant audit row. */
  async setCourierPref(
    tenantId: string,
    p: { courierCode: string; enabled?: boolean; pickupMode?: "scheduled_pickup" | "drop_off_only"; defaultMode: "scheduled_pickup" | "drop_off_only"; actorId: string },
  ): Promise<VaultResult<Array<{ courier_code: string; enabled: number; pickup_mode: "scheduled_pickup" | "drop_off_only"; updated_at: number }>>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const now = Date.now()
    this.ctx.storage.transactionSync(() => {
      const sql = this.ctx.storage.sql
      const cur = sql.exec<{ enabled: number; pickup_mode: string }>("SELECT enabled, pickup_mode FROM tenant_courier_prefs WHERE courier_code = ?", p.courierCode).toArray()[0]
      const enabled = p.enabled === undefined ? (cur?.enabled ?? 1) : p.enabled ? 1 : 0
      const mode = p.pickupMode ?? cur?.pickup_mode ?? p.defaultMode
      sql.exec(
        `INSERT INTO tenant_courier_prefs (tenant_id, courier_code, enabled, pickup_mode, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(tenant_id, courier_code) DO UPDATE SET enabled = excluded.enabled, pickup_mode = excluded.pickup_mode, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        tenantId,
        p.courierCode,
        enabled,
        mode,
        now,
        p.actorId,
      )
      this.audit(tenantId, now, "user", p.actorId, "courier.preference_changed", { courierCode: p.courierCode, enabled: enabled === 1, pickupMode: mode })
    })
    return this.courierPrefs(tenantId)
  }

  // ---- Seller key rotation fence (TASK-205, ADR-0004 §5) ----------------------------------------------------------

  /** Step 1: bump `key_version` and fence BEFORE Partner `regenerate`. Refuses while a rotation is unresolved. */
  async beginKeyRotation(tenantId: string, meta: { actorId: string; reason: string; now: number }): Promise<{ ok: true; value: { sellerId: string; keyVersion: number } } | { ok: false; refused: VaultRefusal | "ROTATION_IN_PROGRESS" | "NO_SELLER" }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const row = readConnection(this.ctx.storage.sql)
    if (!row?.seller_id || !row.encrypted_api_key) return { ok: false, refused: "NO_SELLER" }
    if (row.rotation_state !== "idle") return { ok: false, refused: "ROTATION_IN_PROGRESS" }
    const keyVersion = row.key_version + 1
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("UPDATE mengantar_connections SET key_version = ?, rotation_state = 'in_flight', rotation_started_at = ?, updated_at = ?", keyVersion, meta.now, meta.now)
      this.audit(tenantId, meta.now, "user", meta.actorId, "mengantar.key_rotation_started", { keyVersion, reason: meta.reason })
      // If the Worker dies before recording the outcome, the object reads the key back by itself.
      setTimer(this.ctx.storage.sql, "key_rotation_check", meta.now + ROTATION_STALE_MS + 1000, "earliest")
    })
    await this.armOutbox()
    return { ok: true, value: { sellerId: row.seller_id, keyVersion } }
  }

  /** Mengantar answered with an error: the old key is still valid; lift the fence (the version stays bumped). */
  async abortKeyRotation(tenantId: string, keyVersion: number, code: string): Promise<VaultResult<boolean>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const now = Date.now()
    let changed = false
    this.ctx.storage.transactionSync(() => {
      changed = this.ctx.storage.sql.exec("UPDATE mengantar_connections SET rotation_state = 'idle', rotation_started_at = NULL, updated_at = ? WHERE key_version = ? AND rotation_state = 'in_flight' RETURNING tenant_id", now, keyVersion).toArray().length > 0
      if (changed) this.ctx.storage.sql.exec("DELETE FROM vault_timers WHERE name = 'key_rotation_check'")
      if (changed) this.audit(tenantId, now, "system", null, "mengantar.key_rotation_failed", { keyVersion, code })
    })
    return { ok: true, value: changed }
  }

  /** Lost response: stay fenced; only a key read-back (never another regenerate) can resolve it. */
  async markKeyRotationUnknown(tenantId: string, keyVersion: number, reason: string): Promise<VaultResult<boolean>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const now = Date.now()
    let changed = false
    this.ctx.storage.transactionSync(() => {
      changed = this.ctx.storage.sql.exec("UPDATE mengantar_connections SET rotation_state = 'unknown', updated_at = ? WHERE key_version = ? AND rotation_state = 'in_flight' RETURNING tenant_id", now, keyVersion).toArray().length > 0
      if (changed) this.audit(tenantId, now, "system", null, "mengantar.key_rotation_unknown", { keyVersion, reason })
      if (changed) setTimer(this.ctx.storage.sql, "key_rotation_check", now + 60_000, "earliest")
    })
    await this.armOutbox()
    return { ok: true, value: changed }
  }

  /** A rotation that needs a read-back: `unknown`, or `in_flight` for over 5 minutes (the Worker died mid-call). */
  async pendingKeyRotation(tenantId: string, now: number = Date.now()): Promise<VaultResult<{ sellerId: string; keyVersion: number; state: "in_flight" | "unknown" } | null>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const row = readConnection(this.ctx.storage.sql)
    if (!row?.seller_id || row.rotation_state === "idle") return { ok: true, value: null }
    if (row.rotation_state === "in_flight" && now - (row.rotation_started_at ?? now) < ROTATION_STALE_MS) return { ok: true, value: null }
    return { ok: true, value: { sellerId: row.seller_id, keyVersion: row.key_version, state: row.rotation_state } }
  }

  /**
   * Step 2: store the new key and (when Mengantar returned one) the new callback secret and a new webhook path token,
   * atomically, only for the fenced `keyVersion`. The previous token keeps verifying for 24 h.
   */
  async completeKeyRotation(
    tenantId: string,
    keyVersion: number,
    next: { apiKey: string; callbackSecret: string | null; readBack?: boolean },
    now: number = Date.now(),
  ): Promise<{ ok: true; value: { routes: { token: string; keyVersion: number; previous: string | null } } } | { ok: false; refused: VaultRefusal | "STALE_KEY_VERSION" }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const row = readConnection(this.ctx.storage.sql)
    if (!row || row.key_version !== keyVersion || row.rotation_state === "idle") return { ok: false, refused: "STALE_KEY_VERSION" }
    const encKey = await encryptString(this.env.KEK_SECRET, next.apiKey, `seller-key:${tenantId}`)
    const encSecret = next.callbackSecret ? await encryptString(this.env.KEK_SECRET, next.callbackSecret, `webhook-secret:${tenantId}`) : null
    const oldKey = row.encrypted_api_key ? await decryptString(this.env.KEK_SECRET, row.encrypted_api_key, `seller-key:${tenantId}`) : null
    const keyChanged = oldKey !== next.apiKey
    let token = row.webhook_path_token
    let previous: string | null = null
    this.ctx.storage.transactionSync(() => {
      const sql = this.ctx.storage.sql
      // Re-check inside the transaction (the awaits above could interleave with another call).
      const cur = readConnection(sql)
      if (!cur || cur.key_version !== keyVersion || cur.rotation_state === "idle") throw new Error("STALE_KEY_VERSION")
      if (encSecret && row.webhook_path_token) {
        previous = row.webhook_path_token
        token = newPathToken()
        sql.exec(
          `UPDATE mengantar_connections SET previous_webhook_path_token = webhook_path_token, encrypted_previous_webhook_secret = encrypted_webhook_secret,
             previous_token_expires_at = ?, webhook_path_token = ?, encrypted_webhook_secret = ?, webhook_state = 'awaiting_seller_setup'`,
          now + 24 * HOUR,
          token,
          encSecret,
        )
        setTimer(sql, "inbox_sweep", now + 24 * HOUR, "earliest")
      } else if (keyChanged && cur.webhook_state === "active") {
        // The callback secret rotated with the key but its value is unknown here (read-back path).
        sql.exec("UPDATE mengantar_connections SET webhook_state = 'secret_mismatch'")
      }
      sql.exec("UPDATE mengantar_connections SET encrypted_api_key = ?, rotation_state = 'idle', rotation_started_at = NULL, updated_at = ?", encKey, now)
      sql.exec("DELETE FROM vault_timers WHERE name = 'key_rotation_check'")
      this.audit(tenantId, now, "system", null, "mengantar.key_rotated", { keyVersion, readBack: !!next.readBack, keyChanged, webhookUrlRotated: previous !== null, secretKnown: !!encSecret })
    })
    return { ok: true, value: { routes: { token: token ?? "", keyVersion, previous } } }
  }

  /**
   * Read-back after an unknown outcome or a crash mid-rotation: `POST /sellers/api-key`, never `regenerate`.
   * Stores whatever key Mengantar reports as current under the fenced version. Safe to repeat.
   */
  async resolveKeyRotation(tenantId: string, now: number = Date.now()): Promise<VaultResult<{ state: "rotated" | "unknown" | "none"; keyVersion: number | null; code: string | null }>> {
    const pending = await this.pendingKeyRotation(tenantId, now)
    if (!pending.ok) return pending
    if (!pending.value) return { ok: true, value: { state: "none", keyVersion: null, code: null } }
    const { sellerId, keyVersion } = pending.value
    const key = await partnerClient(this.env).apiKey(sellerId)
    if (key.kind !== "ok") {
      setTimer(this.ctx.storage.sql, "key_rotation_check", now + 15 * 60_000)
      await this.armOutbox()
      return { ok: true, value: { state: "unknown", keyVersion, code: key.kind === "error" || key.kind === "relay_refused" ? key.code : key.reason } }
    }
    const done = await this.completeKeyRotation(tenantId, keyVersion, { apiKey: key.data.apiKey, callbackSecret: null, readBack: true }, now)
    if (!done.ok) return { ok: true, value: { state: "unknown", keyVersion, code: done.refused } }
    return { ok: true, value: { state: "rotated", keyVersion, code: null } }
  }

  /**
   * Dispatch fence for feature code (TASK-304): the key and version to use for one Mengantar call, or a refusal while
   * a rotation is unresolved. Callers re-check with `keyVersionCurrent` before recording the outcome.
   */
  protected async keyForDispatch(tenantId: string): Promise<{ ok: true; key: string; version: number } | { ok: false; refused: "KEY_ROTATING" | "NO_KEY" }> {
    const row = readConnection(this.ctx.storage.sql)
    if (!row?.encrypted_api_key) return { ok: false, refused: "NO_KEY" }
    if (row.rotation_state !== "idle") return { ok: false, refused: "KEY_ROTATING" }
    const k = await this.sellerKey(tenantId)
    return k ? { ok: true, key: k.key, version: k.version } : { ok: false, refused: "KEY_ROTATING" }
  }

  protected keyVersionCurrent(version: number): boolean {
    const row = readConnection(this.ctx.storage.sql)
    return !!row && row.rotation_state === "idle" && row.key_version === version
  }

  /** Test/ops probe of the fence (no key material leaves the object). */
  async probeDispatchFence(tenantId: string, heldVersion?: number): Promise<VaultResult<{ allowed: boolean; version: number | null; reason: string | null }>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    if (heldVersion !== undefined) return { ok: true, value: { allowed: this.keyVersionCurrent(heldVersion), version: heldVersion, reason: this.keyVersionCurrent(heldVersion) ? null : "STALE_KEY_VERSION" } }
    const k = await this.keyForDispatch(tenantId)
    return { ok: true, value: k.ok ? { allowed: true, version: k.version, reason: null } : { allowed: false, version: null, reason: k.refused } }
  }

  private audit(tenantId: string, at: number, actorType: "user" | "system", actorId: string | null, action: string, meta: Record<string, unknown>): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO audit_logs (id, tenant_id, at, actor_type, actor_id, action, target_type, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      crypto.randomUUID(),
      tenantId,
      at,
      actorType,
      actorId,
      action,
      action.startsWith("courier.") ? "courier_pref" : "mengantar_connection",
      JSON.stringify(meta),
    )
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
    const due = o === null ? t : t === null ? o : Math.min(o, t)
    if (due === null) return
    // Overdue work runs on the next tick; setAlarm refuses times <= 0.
    const at = Math.max(due, Date.now())
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
      if (name === "key_rotation_check") {
        const r = await this.resolveKeyRotation(tenantId, now)
        if (r.ok && r.value.state === "none") {
          // Still in flight but not yet stale: check again when it would be.
          const row = readConnection(this.ctx.storage.sql)
          if (row?.rotation_state === "in_flight") setTimer(this.ctx.storage.sql, "key_rotation_check", (row.rotation_started_at ?? now) + ROTATION_STALE_MS + 1000)
          else this.ctx.storage.sql.exec("DELETE FROM vault_timers WHERE name = 'key_rotation_check'")
        }
      }
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
    if (!row?.webhook_path_token) return { ok: false, refused: "UNKNOWN_TOKEN" }
    const current = await timingSafeEqualStr(row.webhook_path_token, input.token)
    // After a key rotation the previous URL keeps working for 24 h (spec 01 §2.7 Rotation). Mengantar keeps posting
    // to the URL configured in Seller Settings, signed with the new secret, so it accepts both secret versions.
    const previous = !current && !!row.previous_webhook_path_token && (row.previous_token_expires_at ?? 0) > now && (await timingSafeEqualStr(row.previous_webhook_path_token, input.token))
    if (!current && !previous) return { ok: false, refused: "UNKNOWN_TOKEN" }
    if (!row.encrypted_webhook_secret) return { ok: false, refused: "NOT_CONFIGURED" }
    const secrets = [await decryptString(this.env.KEK_SECRET, row.encrypted_webhook_secret, `webhook-secret:${tenantId}`)]
    if (previous && row.encrypted_previous_webhook_secret) secrets.push(await decryptString(this.env.KEK_SECRET, row.encrypted_previous_webhook_secret, `webhook-secret:${tenantId}`))
    let v = await verifySignature(secrets[0]!, { ...input, expect: row.environment }, now)
    if (!v.ok && v.reason === "BAD_SIGNATURE" && secrets[1]) v = await verifySignature(secrets[1], { ...input, expect: row.environment }, now)
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
      // Only a delivery on the current URL proves the seller's setup; the previous URL just keeps statuses flowing.
      if (current) this.ctx.storage.sql.exec("UPDATE mengantar_connections SET webhook_state = 'active', webhook_last_event_at = ?", now)
      else this.ctx.storage.sql.exec("UPDATE mengantar_connections SET webhook_last_event_at = ?", now)
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
    sql.exec("UPDATE mengantar_connections SET previous_webhook_path_token = NULL, encrypted_previous_webhook_secret = NULL, previous_token_expires_at = NULL WHERE previous_token_expires_at IS NOT NULL AND previous_token_expires_at <= ?", now)
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
