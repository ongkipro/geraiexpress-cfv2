import { BACKUP_FORMAT, BACKUP_KEEP_DAYS, backupKey, checksumOf, dumpTables, gunzipJson, gzipJson, restoreTables, schemaDdl, userTables, wibDayOf, type BackupSummary, type TenantBackup } from "./backup"
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
import type { Courier, CourierRate, OrderItem } from "@gx/mengantar-sdk"
import { safeLink, type NotificationItem, type NotificationKind } from "../../notifications"
import { archiveContact, badgeForPhone, badgeOf, createRecipient, createSender, markWaVerified, readRecipient, readSender, recordCodOutcome, searchRecipients, searchSenders, senderCounts, updateRecipient, updateSender, type ContactError, type RecipientInput, type RecipientRow, type SenderInput, type SenderRow } from "./contacts"
import { phoneHmac } from "../../admin/monitor"
import { dispatchKey, ensureDraft, latestQuote, orderPayload, readyToDispatch, recordOutcome, setParties, type DispatchError, type OrderOutcome, type QuoteRow } from "./dispatch"
import { markPaid, receiptsFor, voidPayment, type PaymentError, type Receipt } from "./payment"
import { closeShift, openShift, openShiftOf, senderPayout, shiftTotals, voidSenderPayout, type ShiftError, type ShiftRow, type ShiftTotals } from "./shift"
import { applyCheck, BatchPaymentAbort, createBatch, editRow, listBatches, payBatch, readBatch, refreshCounts, removeRow, totalsOf, type BatchRow, type BulkError, type BulkRow, type RowCheck } from "./bulk"
import type { ValidRow } from "@gx/domain/bulk"
import { normalizePhone08 } from "@gx/domain/contacts"
import { QUOTE_TTL_MS } from "../../pricing/quote/engine"
import { counterHome, dailyStatsOf, ownerDashboard, type CounterHome, type OwnerDashboard } from "../../analytics/queries"
import { resolvePreset, type Period } from "@gx/domain/period"
import { DEFAULT_PACKING, maskNpwp, parseBusiness, parsePacking, parseProfile, parseReceipt } from "./settings"
import { exportCsv, listShipments, tabCounts, type ListQuery, type ListRow, type Tab } from "./listing"
import { applyInvoice, FINAL_STATUSES, settleBalance } from "./finance"
import { financeView, type FinanceView } from "./finance/view"
import { balanceSufficient } from "./finance/reserve"
import { batchView, handover as handoverBatch, listBatches as listPickupBatches, openBatch as openPickupBatch, pickupQueue, scan as scanParcel, unscan as unscanParcel, type BatchRow as PickupBatchRow, type BatchView, type PickupError, type QueueGroup, type ScanResult } from "./pickup"
import { desk as returnDesk, handback as returnHandback, intake as returnIntake, issueCode as issueReturnCode, type ReturnError } from "./returns"
import { bucketCounts, expireClaims, listBucket, moveClaim, noteConflict, openClaim, type Bucket, type ExceptionError, type ExceptionRow } from "./exceptions"
import { insertDraft, parseDraft, publicProfile, publicTrack, purgeDrafts, readDraft, unlock as unlockTrack, type DraftInput, type DraftRow, type PublicProfile, type PublicTrack } from "./minisite"
import { claimPreset, maskingState, printedIdentity, readSettings, releasePreset, writeSettings, type Platform, type SettingsInput } from "./masking"
import type { MaskPreset } from "@gx/domain/masking"
import type { LabelData, LabelFormat } from "@gx/thermal-print"
import { labelDataFrom } from "../../labels/build"
import type { MediaPurpose } from "../../media"
import { eventKeyOf, newPathToken, verifySignature, type VerifyFailure } from "../../webhooks/verify"
import { dueTimers, flagStuck, nextTimerAt, pollCandidates, readShipment, recordProviderObservation, setDispatchStatus, setTimer, findShipment, type ShipmentRow, type TimerName } from "./status"

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

export interface ShipmentDetail {
  shipment: Record<string, SqlStorageValue>
  quote: Record<string, SqlStorageValue> | null
  sender: SenderRow | null
  recipient: RecipientRow | null
  receipts: Receipt[]
  events: Array<{ source: string; raw_category: string | null; mapped_status: string | null; event_at: number }>
  /** Non-COD issue pre-flight (spec 09 §3.1): Kasir gets the boolean only (projection strips the amounts). */
  preflight: { balance_sufficient: boolean | null; synced_balance_idr: number | null; estimated_debit_idr: number | null }
}

export type ShiftView = {
  shift: ShiftRow | null
  totals: ShiftTotals | null
  shifts: Array<ShiftRow & { totals: ShiftTotals }>
}
export type PayoutView = { id: string; amount_idr: number; method: string; shift_id: string | null; idempotency_key: string; shipment_slug: string; event: string; created_at: number }

export type TrackItem = {
  slug: string
  awb: string | null
  courier: string
  service: string
  status: string
  dispatchState: string
  recipient: string | null
  area: string | null
  createdAt: number
  history: Array<{ date: string; status: string | null; category: string | null }> | null
  events: Array<{ source: string; raw_category: string | null; mapped_status: string | null; event_at: number }>
}

export type SettingsView = {
  profile: { name: string; whatsapp: string | null; openingHours: string | null; areaId: string | null; areaLabel: string | null; street: string | null; postalCode: string | null; logoMediaId: string | null } | null
  business: { entityType: string | null; legalName: string | null; brandName: string | null; nib: string | null; npwpMasked: string | null; registeredAddress: string | null; picName: string | null; picRole: string | null; picEmail: string | null; picPhone: string | null }
  receipt: { defaultLabelFormat: string; unboxingRemark: string; showCommission: boolean }
  packing: { items: Array<{ id: string | null; name: string; priceIdr: number; active: boolean }>; serviceFeeEnabled: boolean; serviceFeeIdr: number | null }
  cashierMayPay: boolean
}

export type FinanceRun = { trigger: string; pages: number; rows: number; newRows: number; linked: number; unlinked: number; balance: number | null; gaps: number; capped: boolean; error: string | null; recovery?: { resolved: number; paid: number; skipped: number } }

function preflightOf(sql: SqlStorage, s: Record<string, SqlStorageValue>, q: QuoteRow | null): ShipmentDetail["preflight"] {
  if (!q || s.dispatch_state !== "draft" || q.cod_fee_mode !== "none") return { balance_sufficient: null, synced_balance_idr: null, estimated_debit_idr: null }
  const debit = q.provider_net_shipping_idr + (q.insurance_fee_idr ?? 0)
  const b = balanceSufficient(sql, debit)
  return { balance_sufficient: b.sufficient, synced_balance_idr: b.balance, estimated_debit_idr: debit }
}

export type PickupValue =
  | { kind: "queue"; groups: QueueGroup[] }
  | { kind: "history"; batches: PickupBatchRow[] }
  | { kind: "batch"; batch: BatchView }
  | { kind: "scan"; scan: ScanResult; batch: BatchView }

export type ReturnsValue =
  | ({ kind: "desk" } & ReturnType<typeof returnDesk>)
  | { kind: "intake"; slug: string; conflict: boolean; sender: { name: string; phone: string; brand: string | null } | null; awb: string | null }
  | { kind: "code"; code: string }
  | { kind: "handback"; method: "code" | "id_override" }

export type ExceptionsValue =
  | { kind: "list"; counts: Record<Bucket, number>; rows: ExceptionRow[] }
  | { kind: "claim"; id: string; deadline_at: number | null }
  | { kind: "moved" }
export type ClaimPacket = { slug: string; kind: string; status: string; deadline_at: number | null; note: string | null; evidenceKeys: string[]; awb_number: string; courier_code: string; mengantar_order_code: string | null; actual_weight_gram: number | null; billable_weight_gram: number | null; content_declaration_text: string | null; cod_goods_amount_idr: number | null; issued_at: number | null }

export type { PublicProfile, PublicTrack, DraftRow }

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

  async mediaIdsForKeys(tenantId: string, keys: string[]): Promise<VaultResult<string[]>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const ids: string[] = []
    for (const k of keys.slice(0, 20)) {
      const r = this.ctx.storage.sql.exec<{ id: string }>("SELECT id FROM media_objects WHERE r2_key = ?", k).toArray()[0]
      if (r) ids.push(r.id)
    }
    return { ok: true, value: ids }
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

  // ---- Checkout, payment record, dispatch, cancellation (TASK-304, ADR-0004) -------------------------------------

  private dispatching = new Set<string>()

  /** Detail of one INV for the checkout screen (the API projects it per role). */
  async shipmentDetail(tenantId: string, slug: string, actorId: string): Promise<VaultResult<ShipmentDetail | null>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    let draft: ShipmentRow | null = null
    this.ctx.storage.transactionSync(() => {
      const r = ensureDraft(sql, tenantId, slug, actorId, Date.now())
      draft = r.ok ? r.value : null
    })
    if (!draft) return { ok: true, value: null }
    const s = readShipment(sql, slug) as unknown as Record<string, SqlStorageValue>
    const q = latestQuote(sql, slug)
    return {
      ok: true,
      value: {
        shipment: s,
        quote: q as unknown as Record<string, SqlStorageValue> | null,
        sender: s.sender_contact_id ? readSender(sql, String(s.sender_contact_id)) : null,
        recipient: s.recipient_contact_id ? readRecipient(sql, String(s.recipient_contact_id)) : null,
        receipts: receiptsFor(sql, slug),
        preflight: preflightOf(sql, s, q),
        events: sql.exec<{ source: string; raw_category: string | null; mapped_status: string | null; event_at: number }>("SELECT source, raw_category, mapped_status, event_at FROM shipment_events WHERE slug = ? ORDER BY event_at DESC LIMIT 50", slug).toArray(),
      },
    }
  }

  async setShipmentParties(tenantId: string, slug: string, p: { senderId?: unknown; recipientId?: unknown; content?: unknown; prohibitedAck?: unknown; maskPreset?: unknown }): Promise<{ ok: true } | { ok: false; refused?: VaultRefusal; error?: DispatchError }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    let e: DispatchError | null = null
    this.ctx.storage.transactionSync(() => {
      const d = ensureDraft(this.ctx.storage.sql, tenantId, slug, "system", Date.now())
      e = d.ok ? setParties(this.ctx.storage.sql, slug, p, Date.now()) : d.error
    })
    return e ? { ok: false, error: e } : { ok: true }
  }

  async recordPayment(
    tenantId: string,
    p: { op: "mark_paid" | "void_payment"; slug: string; method?: unknown; cashReceivedIdr?: unknown; note?: unknown; reason?: unknown; idempotencyKey: string; actorId: string; role: "gerai_admin" | "cashier"; shiftId?: string | null },
  ): Promise<{ ok: true; value: Receipt; replayed: boolean } | { ok: false; refused?: VaultRefusal; error?: PaymentError }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const now = Date.now()
    return this.ctx.storage.transactionSync(() => {
      // Money counts in the actor's open shift (spec 03 §4.2); with no open shift the receipt is unattributed.
      const shiftId = openShiftOf(this.ctx.storage.sql, p.actorId)?.id ?? null
      const out = p.op === "mark_paid" ? markPaid(this.ctx.storage.sql, tenantId, { ...p, method: p.method, shiftId }, now) : voidPayment(this.ctx.storage.sql, tenantId, { ...p, reason: p.reason, shiftId }, now)
      if (out.ok && !out.replayed) this.audit(tenantId, now, "user", p.actorId, `payment.${p.op}`, { slug: p.slug, amount: out.value.amount_idr, method: out.value.method, shiftId })
      return out
    })
  }

  /**
   * Issue the INV at Mengantar (ADR-0004 §1): fence + journal before the call, one call with `idempotencyKey`, record
   * the outcome; ambiguous → `reconciliation_needed` (read back, never re-send blindly). A second call while one is in
   * flight returns `DISPATCH_IN_PROGRESS`; a call after issue returns the issued shipment (double submit → one order).
   */
  async dispatchShipment(tenantId: string, slug: string, actorId: string, now: number = Date.now(), platform: Platform = { maskingEnabled: false, dailyQuota: null }): Promise<{ ok: true; value: { state: string; awb: string | null } } | { ok: false; refused?: VaultRefusal; error?: DispatchError }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const cur = readShipment(sql, slug) as (ShipmentRow & { dispatch_state: string }) | null
    if (cur && ["issued", "provider_unpaid_hold", "cancelled"].includes(cur.dispatch_state)) return { ok: true, value: { state: cur.dispatch_state, awb: cur.awb_number } }
    if (cur && cur.dispatch_state === "reconciliation_needed") return this.reconcileDispatch(tenantId, slug, now)
    if (this.dispatching.has(slug) || cur?.dispatch_state === "issuing_in_flight") return { ok: false, error: { status: 409, code: "DISPATCH_IN_PROGRESS", message: "Kiriman sedang diproses. Tunggu sebentar." } }
    if (!cur) this.ctx.storage.transactionSync(() => void ensureDraft(sql, tenantId, slug, actorId, now))
    const ready = readyToDispatch(sql, slug, now)
    if (!ready.ok) return { ok: false, error: ready.error }
    // Per-tenant issue rate limit (spec 10 §4.4): 20 issues per minute.
    if (!this.allowRate("issue", 20, now)) return { ok: false, error: { status: 429, code: "ISSUE_RATE_LIMITED", message: "Terlalu banyak kiriman diterbitkan dalam semenit. Coba lagi sebentar lagi." } }
    const key = await this.keyForDispatch(tenantId)
    if (!key.ok) return { ok: false, error: { status: 409, code: key.refused, message: key.refused === "KEY_ROTATING" ? "Kunci Mengantar sedang diganti. Coba lagi sebentar lagi." : "Gerai belum terhubung ke Mengantar." } }
    const pickup = await this.pickupFor(tenantId, ready.q.courier_code, key.key)
    if (!pickup.ok) return { ok: false, error: pickup.error }
    const attempt = sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM dispatch_journal WHERE slug = ? AND op = 'create_order'", slug).one().n + 1
    const idem = dispatchKey(slug, attempt)
    const payload = orderPayload(ready.q, ready.sender, ready.recipient, String(ready.s.content_declaration_text), slug, pickup.value)
    const preset = (ready.s.mask_preset ?? "standar_gerai") as MaskPreset
    const reseller = ready.sender.sender_kind === "reseller_dropship"
    const outlet = sql.exec<{ name: string; pic_phone: string | null; street_address: string | null; subdistrict_name: string | null }>("SELECT name, pic_phone, street_address, subdistrict_name FROM tenant_outlets WHERE id = ?", pickup.value.outletId).toArray()[0]
    const printed = printedIdentity(preset, {
      trueSender: { name: ready.sender.true_name, phone: ready.sender.true_phone },
      brand: { name: ready.sender.display_brand_name, phone: ready.sender.display_brand_phone, hideOutlet: ready.sender.hide_gerai_branding === 1 },
      outlet: { name: outlet?.name ?? "", phone: outlet?.pic_phone ?? null },
      recipientPhone: ready.recipient.phone,
    })
    this.dispatching.add(slug)
    try {
      const claim = this.ctx.storage.transactionSync((): ReturnType<typeof claimPreset> => {
        const c = claimPreset(sql, platform, preset, reseller, now)
        if (!c.ok) return c
        sql.exec("INSERT INTO dispatch_journal (idempotency_key, slug, op, state, request_json, created_at, updated_at) VALUES (?, ?, 'create_order', 'in_flight', ?, ?, ?)", idem, slug, JSON.stringify(payload), now, now)
        setDispatchStatus(sql, slug, "issuing_in_flight", now, {
          dispatch_state: "issuing_in_flight",
          true_sender_json: JSON.stringify({ id: ready.sender.id, name: ready.sender.true_name, phone: ready.sender.true_phone, brand: ready.sender.display_brand_name }),
          true_recipient_json: JSON.stringify({ id: ready.recipient.id, name: ready.recipient.name, phone: ready.recipient.phone, street: ready.recipient.street_address, area: ready.recipient.subdistrict_name }),
          outlet_id: pickup.value.outletId,
          mask_snapshot_json: JSON.stringify({ preset, ...printed }),
          pickup_snapshot_json: JSON.stringify({ outletId: pickup.value.outletId, name: outlet?.name ?? null, phone: outlet?.pic_phone ?? null, street: outlet?.street_address ?? null, area: outlet?.subdistrict_name ?? null, addressId: pickup.value.addressId }),
        })
        return c
      })
      if (!claim.ok) return { ok: false, error: { status: claim.status, code: claim.code, message: claim.message, fields: { maskPreset: claim.message } } }
      let outcome: OrderOutcome
      try {
        const res = await publicClient(this.env, key.key).createOrder(payload, idem)
        const item = res.data[0]
        if (!res.success || !item) outcome = { kind: "rejected", code: "ORDER_REJECTED", message: "Mengantar menolak kiriman." }
        else if (res.idempotentReplayed && !item.ORDER_ID) outcome = { kind: "ambiguous", reason: "replayed without order" }
        else outcome = { kind: item.cnote_no ? "issued" : "unpaid", item, batchId: res.batch_id ?? null, batchCode: res.batch ?? null }
      } catch (err) {
        const e = err as { ambiguous?: boolean; code?: string | null; message?: string; status?: number | null; idempotentReplayed?: boolean }
        if (e.ambiguous || e.idempotentReplayed || e.code === "IDEMPOTENCY_REQUEST_UNRESOLVED") outcome = { kind: "ambiguous", reason: e.code ?? e.message ?? "unknown" }
        else outcome = { kind: "rejected", code: e.code ?? `HTTP_${e.status ?? 0}`, message: (e.message ?? "Mengantar menolak kiriman.").slice(0, 200) }
      }
      // A rotation that started during the call makes the recorded outcome unsafe to trust: read back instead.
      if (!this.keyVersionCurrent(key.version) && outcome.kind !== "rejected") outcome = { kind: "ambiguous", reason: "key rotated during dispatch" }
      const at = Date.now()
      this.ctx.storage.transactionSync(() => {
        recordOutcome(sql, slug, idem, outcome, ready.q.cod_fee_idr, at)
        // A rejected issue never happened: give the masking slot back.
        if (outcome.kind === "rejected") releasePreset(sql, preset, reseller, now)
        else this.scheduleFinanceSync(at)
        this.audit(tenantId, at, "user", actorId, "shipment.dispatch", { slug, outcome: outcome.kind, preset })
      })
      await this.armOutbox()
      if (outcome.kind === "ambiguous") return this.reconcileDispatch(tenantId, slug, at)
      if (outcome.kind === "rejected") return { ok: false, error: { status: 422, code: "PROVIDER_REJECTED", message: `Mengantar menolak kiriman: ${outcome.message}` } }
      const after = readShipment(sql, slug)!
      return { ok: true, value: { state: outcome.kind === "issued" ? "issued" : "provider_unpaid_hold", awb: after.awb_number } }
    } finally {
      this.dispatching.delete(slug)
    }
  }

  /** `reconciliation_needed` → read back by INV (`destinationMark`); found → record, absent → back to draft (safe to retry with a new key). */
  async reconcileDispatch(tenantId: string, slug: string, now: number = Date.now()): Promise<{ ok: true; value: { state: string; awb: string | null } } | { ok: false; refused?: VaultRefusal; error?: DispatchError }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const key = await this.keyForDispatch(tenantId)
    if (!key.ok) return { ok: false, error: { status: 409, code: key.refused, message: "Kunci Mengantar sedang diganti. Coba lagi sebentar lagi." } }
    const q = latestQuote(sql, slug)
    let found: OrderItem | null = null
    try {
      const list = await publicClient(this.env, key.key).listOrders({ keyword: slug.toUpperCase(), size: 10 })
      found = list.items.find((o) => (o.destinationMark ?? "").toUpperCase() === slug.toUpperCase()) ?? null
    } catch {
      return { ok: false, error: { status: 503, code: "RECONCILIATION_PENDING", message: "Status kiriman belum pasti. Sistem akan memeriksa lagi; jangan buat ulang kiriman ini." } }
    }
    const journal = sql.exec<{ idempotency_key: string }>("SELECT idempotency_key FROM dispatch_journal WHERE slug = ? AND op = 'create_order' ORDER BY created_at DESC LIMIT 1", slug).toArray()[0]
    this.ctx.storage.transactionSync(() => {
      if (found) recordOutcome(sql, slug, journal?.idempotency_key ?? "", { kind: found.cnote_no ? "issued" : "unpaid", item: found, batchId: found.batch_id ?? null, batchCode: found.batch ?? null }, q?.cod_fee_idr ?? 0, now)
      else {
        setDispatchStatus(sql, slug, "draft", now, { dispatch_state: "draft", dispatch_error: "Tidak ditemukan di Mengantar setelah diperiksa; aman untuk diterbitkan ulang." })
        if (journal) sql.exec("UPDATE dispatch_journal SET state = 'failed', error = 'not found on read-back', updated_at = ? WHERE idempotency_key = ?", now, journal.idempotency_key)
      }
    })
    await this.armOutbox()
    const after = readShipment(sql, slug) as (ShipmentRow & { dispatch_state: string }) | null
    return { ok: true, value: { state: after?.dispatch_state ?? "draft", awb: after?.awb_number ?? null } }
  }

  /** `provider_unpaid_hold` → `POST /order/pay-unpaid` (shared primitive, journaled) → read back the AWB. */
  async payUnpaid(tenantId: string, slug: string, actorId: string, now: number = Date.now()): Promise<{ ok: true; value: { state: string; awb: string | null } } | { ok: false; refused?: VaultRefusal; error?: DispatchError }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const s = readShipment(sql, slug) as (ShipmentRow & { dispatch_state: string; mengantar_batch_object_id: string | null; mengantar_order_code: string | null }) | null
    if (!s) return { ok: false, error: { status: 404, code: "SHIPMENT_NOT_FOUND", message: "Kiriman tidak ditemukan." } }
    if (s.dispatch_state !== "provider_unpaid_hold" || !s.mengantar_batch_object_id) return { ok: false, error: { status: 409, code: "NOT_UNPAID_HOLD", message: "Kiriman ini tidak menunggu saldo." } }
    const key = await this.keyForDispatch(tenantId)
    if (!key.ok) return { ok: false, error: { status: 409, code: key.refused, message: "Kunci Mengantar sedang diganti. Coba lagi sebentar lagi." } }
    const idem = `gx-pay-${slug}-${now}`
    this.ctx.storage.transactionSync(() => {
      sql.exec("INSERT INTO dispatch_journal (idempotency_key, slug, op, state, request_json, created_at, updated_at) VALUES (?, ?, 'pay_unpaid', 'in_flight', ?, ?, ?)", idem, slug, JSON.stringify({ batch_id: s.mengantar_batch_object_id }), now, now)
    })
    const client = publicClient(this.env, key.key)
    let payError: string | null = null
    try {
      await client.payUnpaid(s.courier_code as Courier, s.mengantar_batch_object_id)
    } catch (err) {
      const e = err as { ambiguous?: boolean; code?: string | null; message?: string }
      if (!e.ambiguous) {
        this.ctx.storage.transactionSync(() => sql.exec("UPDATE dispatch_journal SET state = 'failed', error = ?, updated_at = ? WHERE idempotency_key = ?", `${e.code}: ${e.message}`.slice(0, 300), Date.now(), idem))
        return { ok: false, error: { status: 402, code: e.code ?? "PAY_UNPAID_FAILED", message: e.code === "INSUFFICIENT_BALANCE" ? "Saldo Mengantar belum cukup. Isi saldo dulu, lalu coba lagi." : "Pembayaran ke Mengantar gagal." } }
      }
      payError = e.code ?? "ambiguous"
    }
    // Whatever happened, the truth is the order itself: read it back.
    let item: OrderItem | null = null
    try {
      item = await client.getOrder({ orderId: String(s.mengantar_order_code) })
    } catch {
      item = null
    }
    const at = Date.now()
    this.ctx.storage.transactionSync(() => {
      if (item?.cnote_no) {
        recordOutcome(sql, slug, idem, { kind: "issued", item, batchId: s.mengantar_batch_object_id, batchCode: item.batch ?? null }, latestQuote(sql, slug)?.cod_fee_idr ?? 0, at)
        this.audit(tenantId, at, "user", actorId, "shipment.pay_unpaid", { slug })
      } else sql.exec("UPDATE dispatch_journal SET state = ?, error = ?, updated_at = ? WHERE idempotency_key = ?", payError ? "unknown" : "failed", payError ?? "no AWB after pay-unpaid", at, idem)
    })
    this.scheduleFinanceSync(Date.now())
    await this.armOutbox()
    const after = readShipment(sql, slug) as (ShipmentRow & { dispatch_state: string }) | null
    if (after?.dispatch_state !== "issued") return { ok: false, error: { status: 409, code: "STILL_UNPAID", message: "Resi belum terbit. Periksa saldo Mengantar lalu coba lagi." } }
    return { ok: true, value: { state: "issued", awb: after.awb_number } }
  }

  /**
   * Cancel before pickup (spec 03 §1.1): a paid INV needs its payment voided first; issued orders go through
   * `DELETE /order` then a read-back (unknown outcome → `cancel_unknown`, resolved only by reading the order).
   */
  async cancelShipment(tenantId: string, slug: string, actorId: string, reason: string, now: number = Date.now()): Promise<{ ok: true; value: { state: string } } | { ok: false; refused?: VaultRefusal; error?: DispatchError }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const s = readShipment(sql, slug) as (ShipmentRow & { dispatch_state: string; counter_payment_status: string; mengantar_order_code: string | null; mengantar_order_item_id: string | null }) | null
    if (!s) return { ok: false, error: { status: 404, code: "SHIPMENT_NOT_FOUND", message: "Kiriman tidak ditemukan." } }
    if (s.dispatch_state === "cancelled") return { ok: true, value: { state: "cancelled" } }
    if (s.counter_payment_status === "paid") return { ok: false, error: { status: 409, code: "VOID_PAYMENT_FIRST", message: "Batalkan pembayaran dulu, baru kiriman bisa dibatalkan." } }
    if (["issuing_in_flight", "reconciliation_needed"].includes(s.dispatch_state)) return { ok: false, error: { status: 409, code: "DISPATCH_UNRESOLVED", message: "Status penerbitan belum pasti. Tunggu pemeriksaan selesai." } }
    if (s.custody_stage !== "none" || !["draft", "failed", "issued", "provider_unpaid_hold", "cancel_unknown"].includes(s.dispatch_state) || (s.provider_status && !["ready_for_pickup"].includes(s.provider_status))) {
      return { ok: false, error: { status: 409, code: "CANNOT_CANCEL", message: "Kiriman sudah dijemput atau diserahkan; tidak bisa dibatalkan di sini." } }
    }
    const finishCancel = (at: number) => {
      this.ctx.storage.transactionSync(() => {
        this.scheduleFinanceSync(at)
        setDispatchStatus(sql, slug, "cancelled", at, { dispatch_state: "cancelled", cancelled_at: at, counter_payment_status: "voided", custody_stage: "cancelled_local", custody_at: at })
        this.audit(tenantId, at, "user", actorId, "shipment.cancel", { slug, reason })
      })
    }
    if (!s.mengantar_order_code) {
      finishCancel(now)
      await this.armOutbox()
      return { ok: true, value: { state: "cancelled" } }
    }
    if (!this.allowRate("cancel", 20, now)) return { ok: false, error: { status: 429, code: "CANCEL_RATE_LIMITED", message: "Terlalu banyak pembatalan dalam semenit. Coba lagi sebentar lagi." } }
    const key = await this.keyForDispatch(tenantId)
    if (!key.ok) return { ok: false, error: { status: 409, code: key.refused, message: "Kunci Mengantar sedang diganti. Coba lagi sebentar lagi." } }
    const client = publicClient(this.env, key.key)
    const idem = `gx-cancel-${slug}-${now}`
    this.ctx.storage.transactionSync(() => {
      sql.exec("INSERT INTO dispatch_journal (idempotency_key, slug, op, state, request_json, created_at, updated_at) VALUES (?, ?, 'cancel_order', 'in_flight', ?, ?, ?)", idem, slug, JSON.stringify({ ids: [s.mengantar_order_item_id ?? s.mengantar_order_code] }), now, now)
      setDispatchStatus(sql, slug, s.status, now, { dispatch_state: "cancel_in_flight" })
    })
    let refusedByProvider: string | null = null
    if (s.dispatch_state !== "cancel_unknown") {
      try {
        await client.deleteOrders(s.courier_code as Courier, [String(s.mengantar_order_item_id ?? s.mengantar_order_code)])
      } catch (err) {
        const e = err as { ambiguous?: boolean; code?: string | null; message?: string }
        if (!e.ambiguous) refusedByProvider = e.message ?? e.code ?? "refused"
      }
    }
    // Read back: the order's status is the only truth after DELETE.
    let item: OrderItem | null = null
    try {
      item = await client.getOrder({ orderId: String(s.mengantar_order_code) })
    } catch {
      item = null
    }
    const at = Date.now()
    const cat = (item?.statusCategory ?? item?.status ?? "").toUpperCase()
    if (item && (cat === "CANCELED" || cat === "CANCELLED")) {
      this.ctx.storage.transactionSync(() => sql.exec("UPDATE dispatch_journal SET state = 'done', updated_at = ? WHERE idempotency_key = ?", at, idem))
      finishCancel(at)
      await this.armOutbox()
      return { ok: true, value: { state: "cancelled" } }
    }
    this.ctx.storage.transactionSync(() => {
      const known = item !== null
      sql.exec("UPDATE dispatch_journal SET state = ?, error = ?, updated_at = ? WHERE idempotency_key = ?", known ? "failed" : "unknown", refusedByProvider ?? (known ? `still ${cat}` : "read-back failed"), at, idem)
      setDispatchStatus(sql, slug, s.status, at, { dispatch_state: known ? s.dispatch_state : "cancel_unknown" })
    })
    if (!item) return { ok: false, error: { status: 503, code: "CANCEL_UNKNOWN", message: "Hasil pembatalan belum pasti. Sistem akan memeriksa ulang; jangan kirim paket ini dulu." } }
    return { ok: false, error: { status: 409, code: "CANCEL_REFUSED", message: `Mengantar menolak pembatalan${refusedByProvider ? `: ${refusedByProvider}` : "."}` } }
  }

  /** Fixed one-minute window counter per operation, stored in the object (survives restarts). */
  private allowRate(op: "issue" | "cancel", perMinute: number, now: number): boolean {
    const sql = this.ctx.storage.sql
    sql.exec("CREATE TABLE IF NOT EXISTS vault_rate (op TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL)")
    const w = Math.floor(now / 60_000) * 60_000
    const r = sql.exec<{ count: number }>(
      "INSERT INTO vault_rate (op, window_start, count) VALUES (?, ?, 1) ON CONFLICT(op) DO UPDATE SET count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END, window_start = excluded.window_start RETURNING count",
      op,
      w,
    ).one()
    return r.count <= perMinute
  }

  /** Pickup address registered at Mengantar for the default outlet (created once), and the courier's pickup mode. */
  private async pickupFor(tenantId: string, courierCode: string, apiKey: string): Promise<{ ok: true; value: { addressId: string; type: "scheduledPickup" | "dropOff"; outletId: string } } | { ok: false; error: DispatchError }> {
    const sql = this.ctx.storage.sql
    const o = sql.exec<{ id: string; name: string; pic_phone: string | null; mengantar_area_id: string | null; mengantar_address_id: string | null; street_address: string | null }>("SELECT id, name, pic_phone, mengantar_area_id, mengantar_address_id, street_address FROM tenant_outlets WHERE is_default = 1 LIMIT 1").toArray()[0]
    if (!o?.mengantar_area_id) return { ok: false, error: { status: 409, code: "NO_PICKUP_AREA", message: "Titik jemput gerai belum diatur." } }
    let addressId = o.mengantar_address_id
    if (!addressId) {
      try {
        addressId = await publicClient(this.env, apiKey).saveAddress({ areaId: o.mengantar_area_id, name: o.name, phone: o.pic_phone ?? "", address: o.street_address ?? o.name })
      } catch {
        return { ok: false, error: { status: 502, code: "PICKUP_ADDRESS_FAILED", message: "Alamat jemput gerai belum bisa didaftarkan ke Mengantar. Coba lagi." } }
      }
      this.ctx.storage.sql.exec("UPDATE tenant_outlets SET mengantar_address_id = ?, updated_at = ? WHERE id = ?", addressId, Date.now(), o.id)
    }
    const pref = sql.exec<{ pickup_mode: string }>("SELECT pickup_mode FROM tenant_courier_prefs WHERE courier_code = ?", courierCode).toArray()[0]
    void tenantId
    return { ok: true, value: { addressId, type: pref?.pickup_mode === "drop_off_only" ? "dropOff" : "scheduledPickup", outletId: o.id } }
  }

  // ---- Shift drawer and sender COD payout (TASK-307) ------------------------------------------------------------

  async shiftOp(
    tenantId: string,
    actor: { userId: string; role: "gerai_admin" | "cashier" },
    op: { op: "current" } | { op: "open"; floatIdr: unknown } | { op: "close"; countedCashIdr: unknown; reasonCode?: unknown; note?: unknown } | { op: "list"; limit?: number },
  ): Promise<{ ok: true; value: ShiftView } | { ok: false; refused?: VaultRefusal; error?: ShiftError }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const now = Date.now()
    return this.ctx.storage.transactionSync((): { ok: true; value: ShiftView } | { ok: false; error: ShiftError } => {
      if (op.op === "current") {
        const sh = openShiftOf(sql, actor.userId)
        return { ok: true, value: { shift: sh, totals: sh ? shiftTotals(sql, sh) : null, shifts: [] } }
      }
      if (op.op === "open") {
        const r = openShift(sql, tenantId, actor.userId, op.floatIdr, now)
        if (r.ok) this.audit(tenantId, now, "user", actor.userId, "shift.open", { shiftId: r.value.id, float: r.value.opening_float_idr })
        return r.ok ? { ok: true, value: { shift: r.value, totals: shiftTotals(sql, r.value), shifts: [] } } : r
      }
      if (op.op === "close") {
        const r0 = closeShift(sql, actor.userId, op, now)
        const r: { ok: true; value: ShiftView & { variance_idr: number | null; id: string; variance_reason_code: string | null; variance_note: string | null } } | { ok: false; error: ShiftError } = r0.ok
          ? { ok: true, value: { shift: r0.value, totals: r0.value.totals, shifts: [], variance_idr: r0.value.variance_idr, id: r0.value.id, variance_reason_code: r0.value.variance_reason_code, variance_note: r0.value.variance_note } }
          : r0
        if (r.ok) this.audit(tenantId, now, "user", actor.userId, "shift.close", { shiftId: r.value.id, variance: r.value.variance_idr, reason: r.value.variance_reason_code })
        // A non-zero variance is surfaced to the owner (Dashboard alert card + notification).
        if (r.ok && r.value.variance_idr !== 0) {
          sql.exec(
            "INSERT INTO notifications (id, tenant_id, kind, audience, title, body, link, created_at) VALUES (?, ?, 'system', 'owner', ?, ?, '/kasir/shift', ?)",
            crypto.randomUUID(),
            tenantId,
            `Selisih kas shift Rp ${Math.abs(r.value.variance_idr ?? 0).toLocaleString("id-ID")} (${(r.value.variance_idr ?? 0) > 0 ? "lebih" : "kurang"})`,
            `${r.value.variance_reason_code}: ${r.value.variance_note}`.slice(0, 300),
            now,
          )
        }
        return r
      }
      // Owner sees every shift; a Kasir only their own.
      const rows = sql
        .exec<ShiftRow>(`SELECT * FROM cashier_shifts ${actor.role === "gerai_admin" ? "" : "WHERE cashier_user_id = ?"} ORDER BY opened_at DESC LIMIT ?`, ...(actor.role === "gerai_admin" ? [] : [actor.userId]), Math.min(100, op.limit ?? 30))
        .toArray()
      return { ok: true, value: { shift: null, totals: null, shifts: rows.map((r) => ({ ...r, totals: shiftTotals(sql, r) })) } }
    })
  }

  async payoutOp(
    tenantId: string,
    actor: { userId: string; role: "gerai_admin" | "cashier" },
    op: { op: "payout"; slug: string; amountIdr: unknown; method: unknown; override?: unknown; idempotencyKey: string } | { op: "void"; slug: string; receiptId: string; reason: unknown; idempotencyKey: string },
  ): Promise<{ ok: true; value: { receipt: PayoutView; replayed: boolean; remaining?: number } } | { ok: false; refused?: VaultRefusal; error?: ShiftError }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const now = Date.now()
    const cashierMayPay = sql.exec<{ cashier_may_pay_sender_cod: number }>("SELECT cashier_may_pay_sender_cod FROM tenant_settings LIMIT 1").toArray()[0]?.cashier_may_pay_sender_cod === 1
    return this.ctx.storage.transactionSync(() => {
      const shiftId = openShiftOf(sql, actor.userId)?.id ?? null
      if (op.op === "payout") {
        const r = senderPayout(sql, tenantId, { slug: op.slug, amountIdr: op.amountIdr, method: op.method, idempotencyKey: op.idempotencyKey, actorId: actor.userId, role: actor.role, cashierMayPay, shiftId, override: op.override }, now)
        if (r.ok && !r.replayed) this.audit(tenantId, now, "user", actor.userId, "cod.sender_payout", { slug: op.slug, amount: r.value.amount_idr, method: r.value.method, override: typeof op.override === "string" ? op.override : null })
        return r.ok ? { ok: true as const, value: { receipt: r.value, replayed: r.replayed, remaining: r.remaining } } : r
      }
      const r = voidSenderPayout(sql, tenantId, { slug: op.slug, receiptId: op.receiptId, reason: op.reason, idempotencyKey: op.idempotencyKey, actorId: actor.userId, role: actor.role, shiftId }, now)
      if (r.ok && !r.replayed) this.audit(tenantId, now, "user", actor.userId, "cod.sender_payout_void", { slug: op.slug, receiptId: op.receiptId })
      return r.ok ? { ok: true as const, value: { receipt: r.value, replayed: r.replayed } } : r
    })
  }

  /** Test/finance hook: records Mengantar's reconciled COD credit for an INV (TASK-401 writes this from /invoices). */
  async setReconciledCodCredit(tenantId: string, slug: string, amountIdr: number): Promise<VaultResult<boolean>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    return { ok: true, value: this.ctx.storage.sql.exec("UPDATE shipments SET reconciled_provider_cod_credit_idr = ? WHERE slug = ? RETURNING slug", amountIdr, slug).toArray().length > 0 }
  }

  // ---- Finance sync, dual book (TASK-401, spec 09) ----------------------------------------------------------------

  private financeRunning: Promise<unknown> | null = null

  /**
   * One bounded `/invoices` sync (spec 09 §4): newest first, size 50, at most 5 pages, stop at the first page whose
   * rows are all already final in the mirror. Serialized per tenant; a run already in flight is joined.
   * `pending_rescan` re-reads non-final mirror rows by date range (daily). Manual runs: 1 per 30 s.
   */
  async financeSync(tenantId: string, trigger: "cron" | "mutation" | "manual" | "pending_rescan", now: number = Date.now()): Promise<{ ok: true; value: FinanceRun } | { ok: false; refused?: VaultRefusal; error?: { status: number; code: string; message: string } }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const st = sql.exec<{ last_manual_at: number | null }>("SELECT last_manual_at FROM finance_sync_state WHERE id = 1").one()
    if (trigger === "manual" && st.last_manual_at !== null && now - st.last_manual_at < 30_000) {
      return { ok: false, error: { status: 429, code: "SYNC_RATE_LIMITED", message: "Sinkronisasi baru saja dijalankan. Coba lagi dalam 30 detik." } }
    }
    if (trigger === "manual") sql.exec("UPDATE finance_sync_state SET last_manual_at = ? WHERE id = 1", now)
    if (this.financeRunning) return { ok: true, value: (await this.financeRunning) as FinanceRun }
    const run = this.financeRun(tenantId, trigger, now)
    this.financeRunning = run
    try {
      return { ok: true, value: await run }
    } finally {
      this.financeRunning = null
    }
  }

  private async financeRun(tenantId: string, trigger: string, now: number): Promise<FinanceRun> {
    const sql = this.ctx.storage.sql
    const key = await this.sellerKey(tenantId)
    const result: FinanceRun = { trigger, pages: 0, rows: 0, newRows: 0, linked: 0, unlinked: 0, balance: null, gaps: 0, capped: false, error: null }
    if (!key) {
      result.error = "NO_KEY"
      return result
    }
    sql.exec("UPDATE finance_sync_state SET running_since = ?, last_run_at = ?, last_trigger = ? WHERE id = 1", now, now, trigger)
    const client = publicClient(this.env, key.key)
    try {
      if (trigger === "pending_rescan") {
        // Non-final rows older than the newest page: re-read by their creation date range (spec 09 §4).
        const oldest = sql.exec<{ t: number | null }>("SELECT MIN(provider_created_at) AS t FROM mengantar_invoice_mirror WHERE status IS NULL OR status NOT IN ('statusCleared','statusExpired')").one().t
        if (oldest !== null) {
          const day = (t: number) => new Date(t + 7 * 3600_000).toISOString().slice(0, 10)
          let cursor: string | null = null
          do {
            const page = await client.invoices({ cursor, size: 50, dateRange: { startDate: day(oldest), endDate: day(now) } })
            result.pages++
            this.ctx.storage.transactionSync(() => {
              for (const item of page.data) this.tallyInvoice(result, applyInvoice(sql, item as Record<string, unknown>, now))
            })
            cursor = page.nextCursor ?? null
          } while (cursor && result.pages < 5)
          result.capped = !!cursor
        }
        sql.exec("UPDATE finance_sync_state SET last_pending_rescan_at = ? WHERE id = 1", now)
      } else {
        let cursor: string | null = null
        for (;;) {
          const page = await client.invoices({ cursor, size: 50 })
          result.pages++
          let allKnownFinal = page.data.length > 0
          this.ctx.storage.transactionSync(() => {
            for (const item of page.data) {
              const prior = sql.exec<{ status: string | null }>("SELECT status FROM mengantar_invoice_mirror WHERE invoice_id = ?", String((item as { _id?: string })._id ?? "")).toArray()[0]
              const o = applyInvoice(sql, item as Record<string, unknown>, now)
              this.tallyInvoice(result, o)
              if (!prior || !FINAL_STATUSES.has(prior.status ?? "")) allKnownFinal = false
            }
          })
          cursor = page.nextCursor ?? null
          if (!cursor || allKnownFinal) break
          if (result.pages >= 5) {
            result.capped = true
            break
          }
        }
      }
      const settled = this.ctx.storage.transactionSync(() => {
        const b = settleBalance(sql, now)
        if (b.balance !== null) sql.exec("UPDATE mengantar_connections SET synced_balance_idr = ?, last_invoice_synced_at = ?, last_sync_status = 'ok'", b.balance, now)
        else sql.exec("UPDATE mengantar_connections SET last_invoice_synced_at = ?, last_sync_status = 'ok'", now)
        if (result.capped) sql.exec("INSERT INTO finance_discrepancies (id, invoice_id, kind, shipment_slug, detail, created_at) VALUES (?, 'sync', 'balance_gap', '', 'Mutasi lebih dari 5 halaman; sisanya diperiksa pada sinkronisasi berikutnya.', ?) ON CONFLICT(invoice_id, kind, shipment_slug) DO NOTHING", crypto.randomUUID(), now)
        sql.exec("UPDATE finance_sync_state SET running_since = NULL, last_ok_at = ?, last_pages = ?, last_error = NULL WHERE id = 1", now, result.pages)
        return b
      })
      result.balance = settled.balance
      result.gaps = settled.gaps
    } catch (err) {
      result.error = err instanceof Error ? err.message.slice(0, 160) : "sync failed"
      sql.exec("UPDATE finance_sync_state SET running_since = NULL, last_error = ? WHERE id = 1", result.error)
      sql.exec("UPDATE mengantar_connections SET last_sync_status = 'error'")
    }
    if (!result.error) result.recovery = await this.recoverUnpaid(tenantId, Date.now())
    await this.armOutbox()
    return result
  }

  /**
   * Unpaid recovery (TASK-402, spec 09 §3): after a sync, settle `pay_unpaid` journal rows a crash left `in_flight` /
   * `unknown` by reading the order back (never re-calling), then — when the synced balance covers it — pay the oldest
   * held batches once each as the system actor. A batch the balance cannot cover is left for the next top-up.
   */
  async recoverUnpaid(tenantId: string, now: number = Date.now()): Promise<{ resolved: number; paid: number; skipped: number }> {
    const sql = this.ctx.storage.sql
    const out = { resolved: 0, paid: 0, skipped: 0 }
    const key = await this.keyForDispatch(tenantId)
    if (!key.ok) return out
    const client = publicClient(this.env, key.key)
    // 1. Crash between call and record: the journal says in_flight/unknown; the order itself says whether it was paid.
    const stale = sql
      .exec<{ idempotency_key: string; slug: string }>("SELECT idempotency_key, slug FROM dispatch_journal WHERE op = 'pay_unpaid' AND state IN ('in_flight','unknown') AND updated_at < ?", now - 60_000)
      .toArray()
    for (const j of stale) {
      const s = readShipment(sql, j.slug) as (ShipmentRow & { dispatch_state: string; mengantar_order_code: string | null; mengantar_batch_object_id: string | null }) | null
      if (!s?.mengantar_order_code) continue
      let item: OrderItem | null = null
      try {
        item = await client.getOrder({ orderId: s.mengantar_order_code })
      } catch {
        continue
      }
      const at = Date.now()
      this.ctx.storage.transactionSync(() => {
        if (item?.cnote_no && s.dispatch_state === "provider_unpaid_hold") {
          recordOutcome(sql, j.slug, j.idempotency_key, { kind: "issued", item, batchId: s.mengantar_batch_object_id, batchCode: item.batch ?? null }, latestQuote(sql, j.slug)?.cod_fee_idr ?? 0, at)
          this.audit(tenantId, at, "system", null, "shipment.pay_unpaid_recovered", { slug: j.slug })
        } else sql.exec("UPDATE dispatch_journal SET state = ?, updated_at = ? WHERE idempotency_key = ?", item?.cnote_no ? "done" : "failed", at, j.idempotency_key)
      })
      out.resolved++
    }
    // 2. Pay held batches the synced balance can cover (oldest first, one call per batch).
    const balance = sql.exec<{ b: number | null }>("SELECT synced_balance_idr AS b FROM mengantar_connections LIMIT 1").toArray()[0]?.b ?? null
    if (balance === null) return out
    const batches = sql
      .exec<{ batch: string; slug: string; need: number }>(
        `SELECT mengantar_batch_object_id AS batch, MIN(slug) AS slug, SUM(COALESCE(gerai_shipping_cost_idr, 0)) AS need FROM shipments
         WHERE dispatch_state = 'provider_unpaid_hold' AND mengantar_batch_object_id IS NOT NULL
           AND slug NOT IN (SELECT slug FROM dispatch_journal WHERE op = 'pay_unpaid' AND state IN ('in_flight','unknown'))
         GROUP BY mengantar_batch_object_id ORDER BY MIN(created_at)`,
      )
      .toArray()
    let left = balance
    for (const b of batches) {
      if (b.need > left) {
        out.skipped++
        continue
      }
      const r = await this.payUnpaid(tenantId, b.slug, "system", Date.now())
      if (r.ok) {
        out.paid++
        left -= b.need
      } else out.skipped++
    }
    if (out.paid) {
      await this.addNotification(tenantId, { kind: "system", audience: "owner", title: `${out.paid} kiriman yang menunggu saldo sudah terbit resinya`, link: "/kiriman?tab=pickup", dedupeKey: `recovered:${Math.floor(now / 60_000)}` }, now)
    }
    return out
  }

  private tallyInvoice(r: FinanceRun, o: ReturnType<typeof applyInvoice>): void {
    if (!o) return
    r.rows++
    if (o.isNew) r.newRows++
    r.linked += o.linked
    r.unlinked += o.unlinked
  }

  /** Arms `finance_sync` 60 s after a balance-affecting mutation (debounced: an earlier timer is kept). */
  private scheduleFinanceSync(now: number): void {
    if (tableExists(this.ctx.storage, "finance_sync_state")) setTimer(this.ctx.storage.sql, "finance_sync", now + 60_000, "earliest")
  }

  /** Local mock only: the mock seller key, so dev fixtures can be tagged to this gerai. Never a real key. */
  async devMockSellerKey(tenantId: string): Promise<VaultResult<string | null>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    if (this.env.GX_ENV !== "local" || this.env.MENGANTAR_PUBLIC_ORIGIN !== "mock") return { ok: true, value: null }
    const k = await this.sellerKey(tenantId)
    return { ok: true, value: k && /^MOCK-|^KEY-/.test(k.key) ? k.key : null }
  }

  /** Local mock only: apply a provider status observation (stands in for a Mengantar webhook in dev and e2e). */
  async devProviderStatus(tenantId: string, slug: string, category: string): Promise<VaultResult<string | null>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    if (this.env.GX_ENV !== "local" || this.env.MENGANTAR_PUBLIC_ORIGIN !== "mock") return { ok: true, value: null }
    const mapped = mapMengantarCategory(category)
    if (!mapped) return { ok: true, value: null }
    const now = Date.now()
    const r = this.ctx.storage.transactionSync(() => recordProviderObservation(this.ctx.storage.sql, { slug, eventKey: `dev:${slug}:${category}:${now}`, source: "webhook", rawCategory: category, mapped, eventAt: now + 60_000, eventAtText: null }, now))
    await this.armOutbox()
    return { ok: true, value: r.status }
  }

  /** `/keuangan` read model (owner only): summary cards + the five tabs. */
  async financeView(tenantId: string, now: number = Date.now()): Promise<VaultResult<FinanceView>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    return { ok: true, value: financeView(this.ctx.storage.sql, now) }
  }

  // ---- Mini-site (TASK-501) --------------------------------------------------------------------------------------

  async minisiteProfile(tenantId: string): Promise<VaultResult<PublicProfile | null>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    return { ok: true, value: publicProfile(this.ctx.storage.sql) }
  }

  /** Public QR pre-booking: allocates an INV slug (purpose `minisite_qr`) and stores the typed data for 48 h. */
  async createMinisiteDraft(tenantId: string, input: DraftInput, ipHash: string): Promise<{ ok: true; value: { slug: string; expires_at: number } } | { ok: false; refused?: VaultRefusal; errors?: Record<string, string> }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const parsed = parseDraft(input)
    if (!parsed.ok) return { ok: false, errors: parsed.errors }
    const now = Date.now()
    const d = this.ctx.storage.transactionSync(() => insertDraft(this.ctx.storage.sql, tenantId, allocateSlug(this.ctx.storage, "minisite_qr", now), parsed.value, ipHash, now))
    return { ok: true, value: { slug: d.slug, expires_at: d.expires_at } }
  }

  async minisiteTrack(tenantId: string, code: string): Promise<VaultResult<PublicTrack | null>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    return { ok: true, value: publicTrack(this.ctx.storage.sql, code) }
  }

  async minisiteUnlock(tenantId: string, slug: string, digits: string): Promise<VaultResult<ReturnType<typeof unlockTrack>>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    return { ok: true, value: this.ctx.storage.transactionSync(() => unlockTrack(this.ctx.storage.sql, slug, digits, Date.now())) }
  }

  /**
   * Counter claim (`Scan QR`): the QR's INV opens at the counter; contacts are created (or reused by phone) and the
   * draft is marked claimed. The counter then quotes and freezes under the SAME slug, so QR, receipt and tracking
   * share one code. Expired or already-claimed drafts are refused in Indonesian.
   */
  async claimMinisiteDraft(tenantId: string, slug: string, actorId: string): Promise<{ ok: true; value: { draft: DraftRow; senderId: string; recipientId: string } } | { ok: false; refused?: VaultRefusal; error?: { status: number; code: string; message: string } }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const now = Date.now()
    return this.ctx.storage.transactionSync(() => {
      const d = readDraft(sql, slug)
      if (!d) return { ok: false as const, error: { status: 404, code: "DRAFT_NOT_FOUND", message: "Kode QR tidak ditemukan di gerai ini." } }
      if (d.expires_at < now && !d.claimed_at) return { ok: false as const, error: { status: 410, code: "DRAFT_EXPIRED", message: "Kode QR sudah lewat 48 jam. Minta pelanggan mengisi ulang." } }
      const existingSender = sql.exec<{ id: string }>("SELECT id FROM sender_contacts WHERE true_phone = ? AND is_archived = 0 LIMIT 1", d.sender_phone).toArray()[0]
      let senderId = existingSender?.id ?? null
      if (!senderId) {
        const r = createSender(sql, tenantId, { senderKind: d.sender_store ? "reseller_dropship" : "walk_in", name: d.sender_name, phone: d.sender_phone, brandName: d.sender_store ?? undefined }, now)
        if (!r.ok) return { ok: false as const, error: { status: 422, code: "INVALID_SENDER", message: r.errors[0]!.message } }
        senderId = r.value.id
      }
      const existingRecipient = sql.exec<{ id: string }>("SELECT id FROM recipient_contacts WHERE phone = ? AND mengantar_area_id = ? AND is_archived = 0 LIMIT 1", d.recipient_phone, d.recipient_area_id).toArray()[0]
      let recipientId = existingRecipient?.id ?? null
      if (!recipientId) {
        const r = createRecipient(sql, tenantId, { name: d.recipient_name, phone: d.recipient_phone, street: d.recipient_street, areaId: d.recipient_area_id, areaLabel: d.recipient_area_label }, now)
        if (!r.ok) return { ok: false as const, error: { status: 422, code: "INVALID_RECIPIENT", message: r.errors[0]!.message } }
        recipientId = r.value.id
      }
      if (!d.claimed_at) {
        sql.exec("UPDATE minisite_drafts SET claimed_at = ?, claimed_by = ? WHERE slug = ?", now, actorId, slug)
        // The INV row may not exist yet (it is created from the frozen quote); mark it when it does.
        sql.exec("UPDATE shipments SET entry_channel = 'minisite_qr' WHERE slug = ?", slug)
        this.audit(tenantId, now, "user", actorId, "minisite.claim", { slug })
      }
      return { ok: true as const, value: { draft: readDraft(sql, slug)!, senderId, recipientId } }
    })
  }

  // ---- Kendala & Klaim (TASK-405) --------------------------------------------------------------------------------

  async exceptionsOp(
    tenantId: string,
    actor: { userId: string; role: "gerai_admin" | "cashier" },
    op:
      | { op: "list"; bucket: Bucket }
      | { op: "claim"; slug: string; kind: unknown; note: unknown; evidenceIds: string[] }
      | { op: "move"; id: string; to: unknown }
      | { op: "conflict"; slug: string; note: unknown; resolve: boolean },
  ): Promise<{ ok: true; value: ExceptionsValue } | { ok: false; refused?: VaultRefusal; error?: ExceptionError }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const now = Date.now()
    return this.ctx.storage.transactionSync((): { ok: true; value: ExceptionsValue } | { ok: false; error: ExceptionError } => {
      if (op.op === "list") return { ok: true, value: { kind: "list", counts: bucketCounts(sql, now), rows: listBucket(sql, op.bucket, now) } }
      if (op.op === "claim") {
        const keys = op.evidenceIds.filter((x) => /^[0-9a-f-]{36}$/.test(x)).map((x) => sql.exec<{ r2_key: string }>("SELECT r2_key FROM media_objects WHERE id = ?", x).toArray()[0]?.r2_key).filter((k): k is string => !!k)
        const intakePhoto = sql.exec<{ photo_r2_key: string | null }>("SELECT photo_r2_key FROM return_intakes WHERE slug = ?", op.slug).toArray()[0]?.photo_r2_key
        const r = openClaim(sql, tenantId, { slug: op.slug, kind: op.kind, note: op.note, evidence: [...(intakePhoto ? [intakePhoto] : []), ...keys], actorId: actor.userId }, now)
        if (!r.ok) return r
        this.audit(tenantId, now, "user", actor.userId, "claim.open", { slug: op.slug, kind: op.kind })
        return { ok: true, value: { kind: "claim", id: r.value.id, deadline_at: r.value.deadline_at } }
      }
      if (op.op === "move") {
        if (actor.role !== "gerai_admin" && op.to !== "submitted") return { ok: false, error: { status: 403, code: "OWNER_ONLY", message: "Hanya pemilik yang mencatat hasil klaim." } }
        const r = moveClaim(sql, op.id, op.to, now)
        if (!r.ok) return r
        this.audit(tenantId, now, "user", actor.userId, "claim.move", { id: op.id, to: op.to })
        return { ok: true, value: { kind: "moved" } }
      }
      if (actor.role !== "gerai_admin") return { ok: false, error: { status: 403, code: "OWNER_ONLY", message: "Hanya pemilik yang menangani status bertentangan." } }
      const r = noteConflict(sql, op.slug, op.note, op.resolve, now)
      if (!r.ok) return r
      this.audit(tenantId, now, "user", actor.userId, "conflict.note", { slug: op.slug, resolve: op.resolve })
      return { ok: true, value: { kind: "moved" } }
    })
  }

  /** Claim packet for Mengantar Live Chat (spec 04 §3.2): INV facts, counter weight, frozen quote, evidence links. */
  async claimPacket(tenantId: string, id: string): Promise<VaultResult<ClaimPacket | null>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const c = sql.exec<{ shipment_slug: string; kind: string; status: string; deadline_at: number | null; note: string | null; evidence_json: string }>("SELECT shipment_slug, kind, status, deadline_at, note, evidence_json FROM shipment_claims WHERE id = ?", id).toArray()[0]
    if (!c) return { ok: true, value: null }
    const s = sql.exec<{ awb_number: string; courier_code: string; mengantar_order_code: string | null; actual_weight_gram: number | null; billable_weight_gram: number | null; content_declaration_text: string | null; cod_goods_amount_idr: number | null; issued_at: number | null }>("SELECT awb_number, courier_code, mengantar_order_code, actual_weight_gram, billable_weight_gram, content_declaration_text, cod_goods_amount_idr, issued_at FROM shipments WHERE slug = ?", c.shipment_slug).one()
    return { ok: true, value: { slug: c.shipment_slug, kind: c.kind, status: c.status, deadline_at: c.deadline_at, note: c.note, evidenceKeys: JSON.parse(c.evidence_json) as string[], ...s } }
  }

  // ---- Meja Retur (TASK-404) -------------------------------------------------------------------------------------

  async returnsOp(
    tenantId: string,
    actor: { userId: string; role: "gerai_admin" | "cashier" },
    op:
      | { op: "desk" }
      | { op: "intake"; code: string; condition: unknown; photoId: string | null; note: unknown }
      | { op: "code"; slug: string }
      | { op: "handback"; slug: string; code?: unknown; override?: { reason: unknown } },
  ): Promise<{ ok: true; value: ReturnsValue } | { ok: false; refused?: VaultRefusal; error?: ReturnError }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const now = Date.now()
    if (op.op === "desk") return { ok: true, value: { kind: "desk", ...returnDesk(sql, now) } }
    if (op.op === "intake") {
      const photo = op.photoId && /^[0-9a-f-]{36}$/.test(op.photoId) ? (sql.exec<{ r2_key: string }>("SELECT r2_key FROM media_objects WHERE id = ? AND purpose IN ('return_photo','evidence')", op.photoId).toArray()[0]?.r2_key ?? null) : null
      const r = this.ctx.storage.transactionSync(() => returnIntake(sql, tenantId, { code: op.code, condition: op.condition, photoKey: photo, note: op.note, actorId: actor.userId }, now))
      if (!r.ok) return r
      // The true sender is revealed for the WhatsApp notice: always audited (ADR-0005).
      const s = sql.exec<{ true_sender_json: string | null; mask_preset: string | null; awb_number: string | null }>("SELECT true_sender_json, mask_preset, awb_number FROM shipments WHERE slug = ?", r.value.slug).one()
      this.ctx.storage.transactionSync(() => {
        this.audit(tenantId, now, "user", actor.userId, "return.intake", { slug: r.value.slug })
        this.audit(tenantId, now, "user", actor.userId, "true_sender_reveal", { slug: r.value.slug, reason: "Meja Retur", preset: s.mask_preset })
      })
      await this.armOutbox()
      const sender = s.true_sender_json ? (JSON.parse(s.true_sender_json) as { name: string; phone: string; brand?: string | null }) : null
      return { ok: true, value: { kind: "intake", slug: r.value.slug, conflict: r.value.conflict, sender: sender ? { name: sender.name, phone: sender.phone, brand: sender.brand ?? null } : null, awb: s.awb_number } }
    }
    if (op.op === "code") {
      const r = await issueReturnCode(sql, op.slug, now)
      if (!r.ok) return r
      this.ctx.storage.transactionSync(() => this.audit(tenantId, now, "user", actor.userId, "return.code_issued", { slug: op.slug }))
      return { ok: true, value: { kind: "code", code: r.value.code } }
    }
    const r = await returnHandback(sql, { slug: op.slug, code: op.code, override: op.override, role: actor.role, actorId: actor.userId }, now)
    if (!r.ok) return r
    this.ctx.storage.transactionSync(() => this.audit(tenantId, now, "user", actor.userId, "return.handback", { slug: op.slug, method: r.value.method }))
    await this.armOutbox()
    return { ok: true, value: { kind: "handback", method: r.value.method } }
  }

  // ---- Pickup manifests / Surat Jalan (TASK-403) ------------------------------------------------------------------

  async pickupOp(
    tenantId: string,
    actorId: string,
    op:
      | { op: "queue" }
      | { op: "open"; courier: string }
      | { op: "view"; batchId: string }
      | { op: "scan"; batchId: string; code: string }
      | { op: "unscan"; batchId: string; slug: string }
      | { op: "handover"; batchId: string; driverName: unknown; driverPhone: unknown; vehicleNo: unknown; signatureId: string | null; photoId: string | null; mode: "handed_over" | "dropped_at_branch" }
      | { op: "history" },
  ): Promise<{ ok: true; value: PickupValue } | { ok: false; refused?: VaultRefusal; error?: PickupError }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const now = Date.now()
    const media = (id: string | null, purpose: string) => (id && /^[0-9a-f-]{36}$/.test(id) ? (sql.exec<{ r2_key: string }>("SELECT r2_key FROM media_objects WHERE id = ? AND purpose = ?", id, purpose).toArray()[0]?.r2_key ?? null) : null)
    return this.ctx.storage.transactionSync((): { ok: true; value: PickupValue } | { ok: false; error: PickupError } => {
      switch (op.op) {
        case "queue":
          return { ok: true, value: { kind: "queue", groups: pickupQueue(sql) } }
        case "history":
          return { ok: true, value: { kind: "history", batches: listPickupBatches(sql) } }
        case "open": {
          const exists = sql.exec("SELECT 1 FROM shipments WHERE courier_code = ? LIMIT 1", op.courier).toArray().length
          if (!exists) return { ok: false, error: { status: 404, code: "COURIER_NOT_FOUND", message: "Belum ada kiriman untuk ekspedisi ini." } }
          const b = openPickupBatch(sql, tenantId, op.courier, actorId, now)
          return { ok: true, value: { kind: "batch", batch: batchView(sql, b.id)! } }
        }
        case "view": {
          const v = batchView(sql, op.batchId)
          return v ? { ok: true, value: { kind: "batch", batch: v } } : { ok: false, error: { status: 404, code: "BATCH_NOT_FOUND", message: "Manifest tidak ditemukan." } }
        }
        case "scan": {
          const r = scanParcel(sql, op.batchId, op.code, actorId, now)
          if (!r.ok) return r
          if (r.value.result === "blocked") this.audit(tenantId, now, "user", actorId, "pickup.scan_blocked", { batchId: op.batchId, code: r.value.code, slug: r.value.slug })
          return { ok: true, value: { kind: "scan", scan: r.value, batch: batchView(sql, op.batchId)! } }
        }
        case "unscan": {
          const r = unscanParcel(sql, op.batchId, op.slug)
          return r.ok ? { ok: true, value: { kind: "batch", batch: batchView(sql, op.batchId)! } } : r
        }
        case "handover": {
          const sig = media(op.signatureId, "signature")
          const photo = media(op.photoId, "evidence")
          const r = handoverBatch(sql, op.batchId, { driverName: op.driverName, driverPhone: op.driverPhone, vehicleNo: op.vehicleNo, signatureKey: sig, photoKey: photo, mode: op.mode, actorId }, now)
          if (!r.ok) return r
          this.audit(tenantId, now, "user", actorId, `pickup.${op.mode}`, { batchId: op.batchId, handed: r.value.handed })
          return { ok: true, value: { kind: "batch", batch: batchView(sql, op.batchId)! } }
        }
      }
    })
  }

  /** Surat Jalan data for the PDF (recipient initials only). */
  async manifestData(tenantId: string, batchId: string): Promise<VaultResult<{ batch: BatchView; outlet: { name: string; address: string | null; phone: string | null } } | null>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const v = batchView(sql, batchId)
    if (!v) return { ok: true, value: null }
    const o = sql.exec<{ name: string; street_address: string | null; subdistrict_name: string | null; whatsapp: string | null; pic_phone: string | null }>("SELECT name, street_address, subdistrict_name, whatsapp, pic_phone FROM tenant_outlets WHERE is_default = 1 LIMIT 1").toArray()[0]
    return { ok: true, value: { batch: v, outlet: { name: o?.name ?? "Gerai", address: [o?.street_address, o?.subdistrict_name].filter(Boolean).join(", ") || null, phone: o?.whatsapp ?? o?.pic_phone ?? null } } }
  }

  // ---- Kiriman list (TASK-311) -----------------------------------------------------------------------------------

  async shipmentList(tenantId: string, q: ListQuery): Promise<VaultResult<{ items: ListRow[]; nextCursor: string | null; counts: Record<Tab, number> }>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    return { ok: true, value: { ...listShipments(sql, q), counts: tabCounts(sql, q) } }
  }

  async shipmentCsv(tenantId: string, q: ListQuery): Promise<VaultResult<{ csv: string; rows: number; truncated: boolean }>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    return { ok: true, value: exportCsv(this.ctx.storage.sql, q) }
  }

  // ---- Settings pages (TASK-310) ---------------------------------------------------------------------------------

  /** Reads every settings section the owner pages need (NPWP masked). */
  async settingsView(tenantId: string): Promise<VaultResult<SettingsView>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const o = sql.exec<{ id: string; name: string; whatsapp: string | null; opening_hours: string | null; mengantar_area_id: string | null; subdistrict_name: string | null; street_address: string | null; postal_code: string | null; logo_media_id: string | null }>("SELECT * FROM tenant_outlets WHERE is_default = 1 LIMIT 1").toArray()[0] ?? null
    const st = sql.exec<{ default_label_format: string; unboxing_remark_text: string; show_commission_on_quick_check: number; counter_service_fee_enabled: number; counter_service_fee_default_idr: number | null; cashier_may_pay_sender_cod: number }>("SELECT * FROM tenant_settings LIMIT 1").toArray()[0]
    const bp = sql.exec<Record<string, string | null>>("SELECT * FROM tenant_business_profiles LIMIT 1").toArray()[0]
    let npwpMasked: string | null = null
    if (bp?.encrypted_npwp) npwpMasked = maskNpwp(await decryptString(this.env.KEK_SECRET, bp.encrypted_npwp, `npwp:${tenantId}`))
    const items = sql.exec<{ id: string; name: string; price_idr: number; is_active: number }>("SELECT id, name, price_idr, is_active FROM packing_items ORDER BY sort_order, name").toArray()
    return {
      ok: true,
      value: {
        profile: o ? { name: o.name, whatsapp: o.whatsapp, openingHours: o.opening_hours, areaId: o.mengantar_area_id, areaLabel: o.subdistrict_name, street: o.street_address, postalCode: o.postal_code, logoMediaId: o.logo_media_id } : null,
        business: { entityType: bp?.entity_type ?? null, legalName: bp?.legal_name ?? null, brandName: bp?.brand_name ?? null, nib: bp?.nib ?? null, npwpMasked, registeredAddress: bp?.registered_address ?? null, picName: bp?.pic_name ?? null, picRole: bp?.pic_role ?? null, picEmail: bp?.pic_email ?? null, picPhone: bp?.pic_phone ?? null },
        receipt: { defaultLabelFormat: st?.default_label_format ?? "label_10x15_with_stub", unboxingRemark: st?.unboxing_remark_text ?? "Rekam video saat buka paket untuk klaim", showCommission: st?.show_commission_on_quick_check === 1 },
        packing: { items: (items.length ? items : DEFAULT_PACKING.map((d) => ({ id: "", name: d.name, price_idr: d.priceIdr, is_active: 1 }))).map((i) => ({ id: i.id || null, name: i.name, priceIdr: i.price_idr, active: i.is_active === 1 })), serviceFeeEnabled: st?.counter_service_fee_enabled === 1, serviceFeeIdr: st?.counter_service_fee_default_idr ?? null },
        cashierMayPay: st?.cashier_may_pay_sender_cod === 1,
      },
    }
  }

  /** Writes one settings form (owner only — the API refuses Kasir before this call). Audited. */
  async settingsWrite(tenantId: string, actorId: string, form: "profile" | "business" | "receipt" | "packing" | "cashier_payout", b: Record<string, unknown>): Promise<{ ok: true } | { ok: false; refused?: VaultRefusal; error?: { status: number; code: string; message: string; fields?: Record<string, string> } }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const now = Date.now()
    const invalid = (errors: Record<string, string>) => ({ ok: false as const, error: { status: 422, code: "INVALID_SETTINGS", message: Object.values(errors)[0]!, fields: errors } })
    const ensureSettings = () => sql.exec("INSERT INTO tenant_settings (tenant_id, updated_at) VALUES (?, ?) ON CONFLICT(tenant_id) DO NOTHING", tenantId, now)
    if (form === "profile") {
      const r = parseProfile(b)
      if (!r.ok) return invalid(r.errors)
      const v = r.value
      if (v.logoMediaId && !sql.exec("SELECT 1 FROM media_objects WHERE id = ? AND purpose = 'logo'", v.logoMediaId).toArray().length) return invalid({ logoMediaId: "Logo tidak ditemukan. Unggah ulang." })
      await this.upsertDefaultOutlet(tenantId, { name: v.name, areaId: v.areaId, areaLabel: v.areaLabel, street: v.street, postalCode: v.postalCode }, now)
      this.ctx.storage.transactionSync(() => {
        sql.exec("UPDATE tenant_outlets SET whatsapp = ?, opening_hours = ?, logo_media_id = ?, updated_at = ? WHERE is_default = 1", v.whatsapp, v.openingHours, v.logoMediaId, now)
        this.audit(tenantId, now, "user", actorId, "settings.profile", {})
      })
      return { ok: true }
    }
    if (form === "business") {
      const r = parseBusiness(b)
      if (!r.ok) return invalid(r.errors)
      const v = r.value
      const enc = typeof v.npwp === "string" ? await encryptString(this.env.KEK_SECRET, v.npwp, `npwp:${tenantId}`) : v.npwp
      this.ctx.storage.transactionSync(() => {
        sql.exec(
          `INSERT INTO tenant_business_profiles (tenant_id, entity_type, legal_name, brand_name, nib, encrypted_npwp, registered_address, pic_name, pic_role, pic_email, pic_phone, updated_by, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
           ON CONFLICT(tenant_id) DO UPDATE SET entity_type = ?2, legal_name = ?3, brand_name = ?4, nib = ?5, encrypted_npwp = CASE WHEN ?14 THEN encrypted_npwp ELSE ?6 END,
             registered_address = ?7, pic_name = ?8, pic_role = ?9, pic_email = ?10, pic_phone = ?11, updated_by = ?12, updated_at = ?13`,
          tenantId,
          v.entityType,
          v.legalName,
          v.brandName,
          v.nib,
          enc ?? null,
          v.registeredAddress,
          v.picName,
          v.picRole,
          v.picEmail,
          v.picPhone,
          actorId,
          now,
          enc === undefined ? 1 : 0,
        )
        // Audit records that the NPWP changed, never its value.
        this.audit(tenantId, now, "user", actorId, "settings.business", { npwp: enc === undefined ? "kept" : enc === null ? "cleared" : "set" })
      })
      return { ok: true }
    }
    if (form === "receipt") {
      const r = parseReceipt(b)
      if (!r.ok) return invalid(r.errors)
      this.ctx.storage.transactionSync(() => {
        ensureSettings()
        sql.exec("UPDATE tenant_settings SET default_label_format = ?, unboxing_remark_text = ?, show_commission_on_quick_check = ?, updated_at = ?, updated_by = ?", r.value.defaultLabelFormat, r.value.unboxingRemark, r.value.showCommission ? 1 : 0, now, actorId)
        this.audit(tenantId, now, "user", actorId, "settings.receipt", { format: r.value.defaultLabelFormat })
      })
      return { ok: true }
    }
    if (form === "packing") {
      const r = parsePacking(b)
      if (!r.ok) return invalid(r.errors)
      this.ctx.storage.transactionSync(() => {
        ensureSettings()
        const keep = new Set<string>()
        r.value.items.forEach((it, i) => {
          const id = it.id ?? crypto.randomUUID()
          keep.add(id)
          sql.exec(
            "INSERT INTO packing_items (id, name, price_idr, is_active, sort_order, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, price_idr = excluded.price_idr, is_active = excluded.is_active, sort_order = excluded.sort_order, updated_at = excluded.updated_at",
            id,
            it.name,
            it.priceIdr,
            it.active ? 1 : 0,
            i,
            now,
          )
        })
        for (const row of sql.exec<{ id: string }>("SELECT id FROM packing_items").toArray()) if (!keep.has(row.id)) sql.exec("DELETE FROM packing_items WHERE id = ?", row.id)
        sql.exec("UPDATE tenant_settings SET counter_service_fee_enabled = ?, counter_service_fee_default_idr = ?, updated_at = ?, updated_by = ?", r.value.serviceFeeEnabled ? 1 : 0, r.value.serviceFeeIdr, now, actorId)
        this.audit(tenantId, now, "user", actorId, "settings.packing", { items: r.value.items.length, serviceFee: r.value.serviceFeeEnabled })
      })
      return { ok: true }
    }
    // `Kasir boleh bayar COD` (instant switch on Anggota).
    this.ctx.storage.transactionSync(() => {
      ensureSettings()
      sql.exec("UPDATE tenant_settings SET cashier_may_pay_sender_cod = ?, updated_at = ?, updated_by = ?", b.enabled === true ? 1 : 0, now, actorId)
      this.audit(tenantId, now, "user", actorId, "settings.cashier_payout", { enabled: b.enabled === true })
    })
    return { ok: true }
  }

  // ---- Dashboard (TASK-309) ----------------------------------------------------------------------------------------

  async dashboard(tenantId: string, q: { role: "gerai_admin" | "cashier"; userId: string; period: Period; previous: Period; today: Period }): Promise<VaultResult<{ kind: "owner"; data: OwnerDashboard } | { kind: "counter"; data: CounterHome }>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const now = Date.now()
    if (q.role === "gerai_admin") return { ok: true, value: { kind: "owner", data: ownerDashboard(sql, q.period, q.previous, now) } }
    return { ok: true, value: { kind: "counter", data: counterHome(sql, q.userId, q.today, now) } }
  }

  // ---- Paket Massal, Riwayat Massal, Cek Resi (TASK-308) ---------------------------------------------------------

  async bulkCreate(tenantId: string, p: { senderId: string; source: "manual" | "csv"; fileName: string | null; maskPreset: string; codFeeMode: string; serviceCode: string; actorId: string }, rows: Array<{ raw: Record<string, string>; valid: ValidRow | null; errors: string[] }>): Promise<{ ok: true; value: { id: string } } | { ok: false; refused?: VaultRefusal; error?: BulkError }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const sender = readSender(sql, p.senderId)
    if (!sender || sender.is_archived) return { ok: false, error: { status: 422, code: "INVALID_SENDER", message: "Pilih pengirim dari Kontak.", fields: { senderId: "Pilih pengirim dari Kontak." } } }
    if (p.codFeeMode !== "none" && !sender.wa_verified_at) return { ok: false, error: { status: 422, code: "SENDER_NOT_VERIFIED", message: "Kiriman COD butuh WhatsApp pengirim yang sudah diverifikasi.", fields: { senderId: "Verifikasi WhatsApp pengirim dulu." } } }
    const now = Date.now()
    const b = this.ctx.storage.transactionSync(() => createBatch(sql, tenantId, p, rows, now))
    this.ctx.storage.transactionSync(() => this.audit(tenantId, now, "user", p.actorId, "bulk.create", { batchId: b.id, rows: rows.length, source: p.source }))
    return { ok: true, value: { id: b.id } }
  }

  async bulkView(tenantId: string, batchId: string): Promise<VaultResult<{ batch: BatchRow; sender: { id: string; name: string; phone: string; brand: string | null } | null; rows: Array<BulkRow & { dispatch_state: string | null; awb_number: string | null; counter_payment_status: string | null }>; totals: ReturnType<typeof totalsOf> } | null>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const batch = readBatch(sql, batchId)
    if (!batch) return { ok: true, value: null }
    const sender = readSender(sql, batch.sender_contact_id)
    const rows = sql
      .exec<BulkRow & { dispatch_state: string | null; awb_number: string | null; counter_payment_status: string | null }>(
        `SELECT r.*, s.dispatch_state, s.awb_number, s.counter_payment_status FROM bulk_import_rows r LEFT JOIN shipments s ON s.slug = r.shipment_slug
         WHERE r.batch_id = ? AND r.state != 'removed' ORDER BY r.row_no`,
        batchId,
      )
      .toArray()
    return { ok: true, value: { batch, sender: sender ? { id: sender.id, name: sender.true_name, phone: sender.true_phone, brand: sender.display_brand_name } : null, rows, totals: totalsOf(rows) } }
  }

  async bulkList(tenantId: string): Promise<VaultResult<Array<BatchRow & { sender_name: string | null; total_due_idr: number }>>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    return { ok: true, value: listBatches(this.ctx.storage.sql) }
  }

  /** Rows still waiting for area match + quote (the Worker's queue consumer checks them in chunks). */
  async bulkPending(tenantId: string, batchId: string, limit: number): Promise<VaultResult<{ codFeeMode: string; serviceCode: string | null; rows: BulkRow[] } | null>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const b = readBatch(sql, batchId)
    if (!b) return { ok: true, value: null }
    const rows = sql.exec<BulkRow>("SELECT * FROM bulk_import_rows WHERE batch_id = ? AND state = 'pending' ORDER BY row_no LIMIT ?", batchId, Math.min(50, limit)).toArray()
    return { ok: true, value: { codFeeMode: b.cod_fee_mode, serviceCode: b.service_code, rows } }
  }

  async bulkApplyCheck(tenantId: string, batchId: string, rowNo: number, check: RowCheck): Promise<VaultResult<boolean>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    this.ctx.storage.transactionSync(() => applyCheck(this.ctx.storage.sql, batchId, rowNo, check, Date.now()))
    return { ok: true, value: true }
  }

  async bulkEditRow(tenantId: string, batchId: string, rowNo: number, r: { raw: Record<string, string>; valid: ValidRow | null; errors: string[] }, area: { id: string; label: string } | null): Promise<{ ok: true } | { ok: false; refused?: VaultRefusal; error?: BulkError }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    return this.ctx.storage.transactionSync(() => editRow(this.ctx.storage.sql, batchId, rowNo, r, area, Date.now()))
  }

  async bulkRemoveRow(tenantId: string, batchId: string, rowNo: number): Promise<{ ok: true } | { ok: false; refused?: VaultRefusal; error?: BulkError }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    return this.ctx.storage.transactionSync(() => removeRow(this.ctx.storage.sql, batchId, rowNo, Date.now()))
  }

  /**
   * `Buat n Kiriman`: one INV per ready row (own slug + frozen quote + recipient contact), in one transaction. An
   * expired row quote sends those rows back to `pending` and refuses the whole create (the caller re-checks).
   */
  async bulkMaterialize(tenantId: string, batchId: string, actorId: string, prohibitedAck: boolean): Promise<{ ok: true; value: { created: number } } | { ok: false; refused?: VaultRefusal; error?: BulkError }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    if (!prohibitedAck) return { ok: false, error: { status: 422, code: "PROHIBITED_ACK_REQUIRED", message: "Pastikan isi semua paket bukan barang terlarang.", fields: { prohibitedAck: "Wajib dicentang." } } }
    const sql = this.ctx.storage.sql
    const now = Date.now()
    const b = readBatch(sql, batchId)
    if (!b) return { ok: false, error: { status: 404, code: "BATCH_NOT_FOUND", message: "Batch tidak ditemukan." } }
    if (b.state !== "ready") return { ok: false, error: { status: 409, code: "BATCH_NOT_READY", message: b.state === "checking" ? "Masih memeriksa baris. Tunggu sebentar." : "Batch ini tidak bisa dibuat lagi." } }
    return this.ctx.storage.transactionSync((): { ok: true; value: { created: number } } | { ok: false; error: BulkError } => {
      const rows = sql.exec<BulkRow>("SELECT * FROM bulk_import_rows WHERE batch_id = ? AND state = 'ready' ORDER BY row_no", batchId).toArray()
      const expired = rows.filter((r) => !r.quote_json || (r.quoted_at ?? 0) + QUOTE_TTL_MS < now)
      if (expired.length) {
        for (const r of expired) sql.exec("UPDATE bulk_import_rows SET state = 'pending' WHERE batch_id = ? AND row_no = ?", batchId, r.row_no)
        refreshCounts(sql, batchId, now)
        return { ok: false, error: { status: 409, code: "QUOTE_EXPIRED", message: "Ongkir sebagian baris sudah kedaluwarsa dan sedang dihitung ulang. Tunggu sebentar lalu coba lagi." } }
      }
      let created = 0
      for (const r of rows) {
        const existing = sql
          .exec<{ id: string }>("SELECT id FROM recipient_contacts WHERE phone = ? AND mengantar_area_id = ? AND street_address = ? AND is_archived = 0 LIMIT 1", r.recipient_phone, r.area_id, r.street)
          .toArray()[0]
        const contact = existing ? { ok: true as const, value: { id: existing.id } } : createRecipient(sql, tenantId, { name: r.recipient_name, phone: r.recipient_phone, street: r.street, areaId: r.area_id, areaLabel: r.area_label, postalCode: r.postal_code, note: r.note }, now)
        if (!contact.ok) {
          sql.exec("UPDATE bulk_import_rows SET state = 'needs_fix', errors_json = ? WHERE batch_id = ? AND row_no = ?", JSON.stringify(contact.errors.map((e) => e.message)), batchId, r.row_no)
          continue
        }
        const slug = allocateSlug(this.ctx.storage, "draft", now)
        const snap = { ...(JSON.parse(r.quote_json!) as FrozenQuote), shipment_slug: slug }
        const cols = Object.keys(snap) as (keyof FrozenQuote)[]
        sql.exec(`INSERT INTO quote_snapshots (id, tenant_id, ${cols.join(", ")}) VALUES (?, ?, ${cols.map(() => "?").join(", ")})`, crypto.randomUUID(), tenantId, ...cols.map((c) => snap[c] as SqlStorageValue))
        const d = ensureDraft(sql, tenantId, slug, actorId, now)
        if (!d.ok) throw new Error(d.error.code)
        const e = setParties(sql, slug, { senderId: b.sender_contact_id, recipientId: contact.value.id, content: r.content ?? "Paket", prohibitedAck: true, maskPreset: b.mask_preset }, now)
        if (e) throw new Error(e.code)
        sql.exec("UPDATE shipments SET bulk_batch_id = ? WHERE slug = ?", batchId, slug)
        sql.exec("UPDATE bulk_import_rows SET state = 'created', shipment_slug = ? WHERE batch_id = ? AND row_no = ?", slug, batchId, r.row_no)
        created++
      }
      if (created === 0) return { ok: false, error: { status: 409, code: "NOTHING_READY", message: "Tidak ada baris yang siap dibuat." } }
      refreshCounts(sql, batchId, now)
      sql.exec("UPDATE bulk_import_batches SET state = 'dispatching', updated_at = ? WHERE id = ?", now, batchId)
      this.audit(tenantId, now, "user", actorId, "bulk.materialize", { batchId, created })
      return { ok: true, value: { created } }
    })
  }

  private bulkChain: Promise<unknown> = Promise.resolve()

  /**
   * Issues the batch INVs at Mengantar one at a time (spec 04 / ADR-0004: AWBs are generated sequentially per seller
   * account). Calls for any batch of this tenant are chained, so two batches never interleave. A failed row keeps its
   * provider error and is never retried blindly. Returns `more: true` when the issue rate limit stopped the run.
   */
  async bulkDispatch(tenantId: string, batchId: string, platform: Platform): Promise<VaultResult<{ issued: number; failed: number; more: boolean }>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const run = this.bulkChain.then(() => this.bulkDispatchRun(tenantId, batchId, platform))
    this.bulkChain = run.catch(() => undefined)
    return { ok: true, value: await run }
  }

  private async bulkDispatchRun(tenantId: string, batchId: string, platform: Platform): Promise<{ issued: number; failed: number; more: boolean }> {
    const sql = this.ctx.storage.sql
    let issued = 0
    let failed = 0
    for (;;) {
      const row = sql
        .exec<{ row_no: number; shipment_slug: string; created_by: string }>(
          "SELECT r.row_no, r.shipment_slug, b.created_by FROM bulk_import_rows r JOIN bulk_import_batches b ON b.id = r.batch_id WHERE r.batch_id = ? AND r.state = 'created' AND r.dispatch_attempted_at IS NULL ORDER BY r.row_no LIMIT 1",
          batchId,
        )
        .toArray()[0]
      if (!row) break
      const r = await this.dispatchShipment(tenantId, row.shipment_slug, row.created_by, Date.now(), platform)
      if (!r.ok && r.error && ["ISSUE_RATE_LIMITED", "KEY_ROTATING", "DISPATCH_IN_PROGRESS"].includes(r.error.code)) return { issued, failed, more: true }
      const error = r.ok ? null : (r.error?.message ?? "Gerai sedang diperbarui.")
      sql.exec("UPDATE bulk_import_rows SET dispatch_attempted_at = ?, dispatch_error = ? WHERE batch_id = ? AND row_no = ?", Date.now(), error, batchId, row.row_no)
      if (r.ok) issued++
      else failed++
    }
    const left = sql
      .exec<{ bad: number }>(
        "SELECT COUNT(*) AS bad FROM bulk_import_rows r JOIN shipments s ON s.slug = r.shipment_slug WHERE r.batch_id = ? AND r.state = 'created' AND s.dispatch_state NOT IN ('issued','provider_unpaid_hold','cancelled')",
        batchId,
      )
      .one().bad
    sql.exec("UPDATE bulk_import_batches SET state = ?, updated_at = ? WHERE id = ? AND state = 'dispatching'", left > 0 ? "partially_failed" : "done", Date.now(), batchId)
    return { issued, failed, more: false }
  }

  /** One counter payment for the whole batch (spec 01 §2.5): every INV receipt commits, or none does. */
  async bulkPay(tenantId: string, p: { batchId: string; method: unknown; cashReceivedIdr?: unknown; idempotencyKey: string; actorId: string }): Promise<{ ok: true; value: { paid: number; totalIdr: number; changeIdr: number | null; replayed: boolean } } | { ok: false; refused?: VaultRefusal; error?: BulkError }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const now = Date.now()
    try {
      return this.ctx.storage.transactionSync(() => {
        const shiftId = openShiftOf(sql, p.actorId)?.id ?? null
        const r = payBatch(sql, tenantId, { ...p, shiftId }, now)
        if (r.ok && !r.value.replayed) this.audit(tenantId, now, "user", p.actorId, "bulk.pay", { batchId: p.batchId, paid: r.value.paid, total: r.value.totalIdr, shiftId })
        return r
      })
    } catch (e) {
      if (e instanceof BatchPaymentAbort) return { ok: false, error: e.error }
      throw e
    }
  }

  /** `Batalkan yang Belum Terbit`: cancels batch INVs without an AWB (issued ones follow the normal cancel rules). */
  async bulkCancelUnissued(tenantId: string, batchId: string, actorId: string): Promise<{ ok: true; value: { cancelled: number; skipped: number } } | { ok: false; refused?: VaultRefusal; error?: BulkError }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const b = readBatch(sql, batchId)
    if (!b) return { ok: false, error: { status: 404, code: "BATCH_NOT_FOUND", message: "Batch tidak ditemukan." } }
    const now = Date.now()
    if (["draft", "checking", "ready"].includes(b.state)) {
      this.ctx.storage.transactionSync(() => {
        sql.exec("UPDATE bulk_import_batches SET state = 'cancelled', updated_at = ? WHERE id = ?", now, batchId)
        this.audit(tenantId, now, "user", actorId, "bulk.cancel", { batchId, cancelled: 0 })
      })
      return { ok: true, value: { cancelled: 0, skipped: 0 } }
    }
    const rows = sql
      .exec<{ slug: string; dispatch_state: string; awb_number: string | null; counter_payment_status: string }>(
        "SELECT s.slug, s.dispatch_state, s.awb_number, s.counter_payment_status FROM bulk_import_rows r JOIN shipments s ON s.slug = r.shipment_slug WHERE r.batch_id = ? AND r.state = 'created'",
        batchId,
      )
      .toArray()
    let cancelled = 0
    let skipped = 0
    for (const r of rows) {
      if (r.awb_number || !["draft", "failed"].includes(r.dispatch_state)) continue
      if (r.counter_payment_status === "paid") {
        skipped++
        continue
      }
      const c = await this.cancelShipment(tenantId, r.slug, actorId, "Batalkan yang belum terbit (Paket Massal)")
      if (c.ok) cancelled++
      else skipped++
    }
    const open = sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM bulk_import_rows r JOIN shipments s ON s.slug = r.shipment_slug WHERE r.batch_id = ? AND r.state = 'created' AND s.dispatch_state != 'cancelled'", batchId)
      .one().n
    sql.exec("UPDATE bulk_import_batches SET state = CASE WHEN ? = 0 THEN 'cancelled' ELSE state END, updated_at = ? WHERE id = ?", open, now, batchId)
    return { ok: true, value: { cancelled, skipped } }
  }

  private trackCache = new Map<string, { at: number; history: Array<{ date: string; status: string | null; category: string | null }> }>()

  /**
   * `Cek Resi` (spec 03 §1.4): INV, AWB or recipient phone of this gerai → shipments with their timeline (provider
   * history read through `GET /order?tracking_id=`, cached 5 min). Nothing found for an AWB-like input = `foreign`.
   */
  async trackLookup(tenantId: string, q: string): Promise<VaultResult<{ kind: "found"; items: TrackItem[] } | { kind: "foreign"; awb: string } | { kind: "none" }>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const sql = this.ctx.storage.sql
    const raw = q.trim()
    const slug = normalizeSlug(raw)
    const phone = normalizePhone08(raw)
    type S = { slug: string; awb_number: string | null; courier_code: string; service_code: string; status: string; dispatch_state: string; true_recipient_json: string | null; created_at: number; issued_at: number | null }
    const cols = "slug, awb_number, courier_code, service_code, status, dispatch_state, true_recipient_json, created_at, issued_at"
    let rows: S[] = []
    if (slug) rows = sql.exec<S>(`SELECT ${cols} FROM shipments WHERE slug = ?`, slug).toArray()
    if (!rows.length && phone) {
      rows = sql
        .exec<S>(`SELECT ${cols} FROM shipments WHERE recipient_contact_id IN (SELECT id FROM recipient_contacts WHERE phone = ?) AND dispatch_state != 'draft' ORDER BY created_at DESC LIMIT 20`, phone)
        .toArray()
    }
    const awb = raw.replace(/\s+/g, "").toUpperCase()
    if (!rows.length && /^[A-Z0-9]{8,30}$/.test(awb)) rows = sql.exec<S>(`SELECT ${cols} FROM shipments WHERE UPPER(awb_number) = ?`, awb).toArray()
    if (!rows.length) return { ok: true, value: !phone && /^[A-Z0-9]{8,30}$/.test(awb) ? { kind: "foreign", awb } : { kind: "none" } }
    const key = rows.length === 1 && rows[0]!.awb_number ? await this.sellerKey(tenantId) : null
    const items: TrackItem[] = []
    for (const r of rows) {
      let history = this.trackCache.get(r.slug)
      if (key && r.awb_number && (!history || history.at < Date.now() - 5 * 60_000)) {
        try {
          const o = await publicClient(this.env, key.key).getOrder({ trackingId: r.awb_number })
          history = { at: Date.now(), history: (o?.history ?? []).map((h) => ({ date: h.date, status: typeof h.status === "string" ? h.status.slice(0, 200) : null, category: h.statusCategory ?? null })) }
          this.trackCache.set(r.slug, history)
        } catch {
          // Provider down: show local events only.
        }
      }
      const local = sql.exec<{ source: string; raw_category: string | null; mapped_status: string | null; event_at: number }>("SELECT source, raw_category, mapped_status, event_at FROM shipment_events WHERE slug = ? ORDER BY event_at DESC LIMIT 30", r.slug).toArray()
      const rec = r.true_recipient_json ? (JSON.parse(r.true_recipient_json) as { name?: string; area?: string }) : null
      items.push({ slug: r.slug, awb: r.awb_number, courier: r.courier_code, service: r.service_code, status: r.status, dispatchState: r.dispatch_state, recipient: rec?.name ?? null, area: rec?.area ?? null, createdAt: r.created_at, history: history?.history ?? null, events: local })
    }
    return { ok: true, value: { kind: "found", items } }
  }

  // ---- Printing (TASK-306) ---------------------------------------------------------------------------------------

  /** Print settings for this gerai (default format, unboxing remark). */
  async printSettings(tenantId: string): Promise<VaultResult<{ format: LabelFormat; remark: string }>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const r = this.ctx.storage.sql.exec<{ default_label_format: LabelFormat; unboxing_remark_text: string }>("SELECT default_label_format, unboxing_remark_text FROM tenant_settings LIMIT 1").toArray()[0]
    return { ok: true, value: { format: r?.default_label_format ?? "label_10x15_with_stub", remark: r?.unboxing_remark_text ?? "Rekam video saat buka paket untuk klaim" } }
  }

  /**
   * Label data for issued INVs and a print record: the first print sets `first_printed_at`; any later print needs a
   * reason (audited). Shipments without an AWB (unpaid hold, draft, cancelled) are refused per slug.
   */
  async preparePrint(tenantId: string, p: { slugs: string[]; reason?: string; actorId: string; trackingHost: string; record: boolean }): Promise<{ ok: true; value: { items: LabelData[]; refused: Array<{ slug: string; code: string; message: string }> } } | { ok: false; refused?: VaultRefusal; error?: DispatchError }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    if (p.slugs.length === 0 || p.slugs.length > 50) return { ok: false, error: { status: 422, code: "BULK_LIMIT", message: "Pilih 1 sampai 50 kiriman untuk dicetak." } }
    const sql = this.ctx.storage.sql
    const settings = sql.exec<{ unboxing_remark_text: string }>("SELECT unboxing_remark_text FROM tenant_settings LIMIT 1").toArray()[0]
    const remark = settings?.unboxing_remark_text ?? "Rekam video saat buka paket untuk klaim"
    const now = Date.now()
    const items: LabelData[] = []
    const out: Array<{ slug: string; code: string; message: string }> = []
    const reason = (p.reason ?? "").trim()
    const reprints = p.slugs.filter((slug) => (sql.exec<{ print_count: number }>("SELECT print_count FROM shipments WHERE slug = ?", slug).toArray()[0]?.print_count ?? 0) > 0)
    if (p.record && reprints.length && (reason.length < 3 || reason.length > 200)) return { ok: false, error: { status: 422, code: "REPRINT_REASON_REQUIRED", message: "Kiriman ini sudah pernah dicetak. Tulis alasan cetak ulang.", fields: { reason: "Wajib untuk cetak ulang." } } }
    this.ctx.storage.transactionSync(() => {
      for (const slug of p.slugs) {
        const s = readShipment(sql, slug) as unknown as Record<string, SqlStorageValue> | null
        if (!s) {
          out.push({ slug, code: "SHIPMENT_NOT_FOUND", message: "Kiriman tidak ditemukan." })
          continue
        }
        if (s.dispatch_state !== "issued" || !s.awb_number) {
          out.push({ slug, code: "NO_AWB", message: s.dispatch_state === "provider_unpaid_hold" ? "Resi belum terbit (menunggu saldo Mengantar)." : "Label hanya bisa dicetak setelah resi terbit." })
          continue
        }
        const pay = sql.exec<Record<string, SqlStorageValue>>("SELECT * FROM counter_receipts WHERE shipment_slug = ? AND event = 'mark_paid' ORDER BY created_at DESC LIMIT 1", slug).toArray()[0] ?? null
        const reprint = Number(s.print_count ?? 0) > 0
        const d = labelDataFrom(s, { quote: (latestQuote(sql, slug) as unknown as Record<string, SqlStorageValue>) ?? null, lastPayment: pay, remark, trackingHost: p.trackingHost, now, reprint })
        if (!d) {
          out.push({ slug, code: "LABEL_DATA_MISSING", message: "Data label belum lengkap." })
          continue
        }
        items.push(d)
        if (p.record) {
          sql.exec("UPDATE shipments SET print_count = print_count + 1, first_printed_at = COALESCE(first_printed_at, ?), updated_at = ? WHERE slug = ?", now, now, slug)
          if (reprint) this.audit(tenantId, now, "user", p.actorId, "label.reprint", { slug, reason })
        }
      }
    })
    return { ok: true, value: { items, refused: out } }
  }

  /** INVs for `Cetak Resi Massal`: issued, optionally only never printed, newest first (max 200 listed). */
  async printableList(tenantId: string, f: { status: "belum" | "sudah" | "semua"; courier?: string | null }): Promise<VaultResult<Array<{ slug: string; awb: string; courier: string; recipient: string; print_count: number; issued_at: number }>>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const rows = this.ctx.storage.sql
      .exec<{ slug: string; awb_number: string; courier_code: string; true_recipient_json: string | null; print_count: number; issued_at: number }>(
        `SELECT slug, awb_number, courier_code, true_recipient_json, print_count, issued_at FROM shipments
         WHERE dispatch_state = 'issued' AND awb_number IS NOT NULL AND (? = 'semua' OR (? = 'belum' AND print_count = 0) OR (? = 'sudah' AND print_count > 0)) AND (? IS NULL OR courier_code = ?)
         ORDER BY issued_at DESC LIMIT 200`,
        f.status,
        f.status,
        f.status,
        f.courier ?? null,
        f.courier ?? null,
      )
      .toArray()
    return { ok: true, value: rows.map((r) => ({ slug: r.slug, awb: r.awb_number, courier: r.courier_code, recipient: (r.true_recipient_json ? (JSON.parse(r.true_recipient_json) as { name: string }).name : "—"), print_count: r.print_count, issued_at: r.issued_at })) }
  }

  // ---- Masking (TASK-305) -----------------------------------------------------------------------------------------

  async maskingState(tenantId: string, platform: Platform): Promise<VaultResult<ReturnType<typeof maskingState>>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    return { ok: true, value: maskingState(this.ctx.storage.sql, platform, Date.now()) }
  }

  async maskingSettings(tenantId: string, platform: Platform): Promise<VaultResult<ReturnType<typeof readSettings>>> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    return { ok: true, value: readSettings(this.ctx.storage.sql, platform) }
  }

  async saveMaskingSettings(tenantId: string, input: SettingsInput, actorId: string): Promise<{ ok: true } | { ok: false; refused?: VaultRefusal; error?: DispatchError }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const now = Date.now()
    const r = this.ctx.storage.transactionSync(() => {
      const w = writeSettings(this.ctx.storage.sql, tenantId, input, actorId, now)
      if (w.ok) this.audit(tenantId, now, "user", actorId, "masking.settings_saved", { offered: input.offered === true, presets: input.presetsEnabled, defaultPreset: input.defaultPreset })
      return w
    })
    return r.ok ? { ok: true } : { ok: false, error: { status: 422, code: "INVALID_SETTINGS", message: r.message, fields: { [r.field]: r.message } } }
  }

  /** `Lihat Pengirim Asli` on an issued masked INV: reason required, audit row `true_sender_reveal` (ADR-0005). */
  async revealTrueSender(tenantId: string, slug: string, actorId: string, reason: string): Promise<{ ok: true; value: { name: string; phone: string; brand: string | null } } | { ok: false; refused?: VaultRefusal; error?: DispatchError }> {
    const refused = this.refusal(tenantId)
    if (refused) return { ok: false, refused }
    const r = reason.trim()
    if (r.length < 5 || r.length > 200) return { ok: false, error: { status: 422, code: "REASON_REQUIRED", message: "Tulis alasan membuka data pengirim asli.", fields: { reason: "Wajib diisi (min. 5 huruf)." } } }
    const s = this.ctx.storage.sql.exec<{ true_sender_json: string | null; mask_preset: string }>("SELECT true_sender_json, mask_preset FROM shipments WHERE slug = ?", slug).toArray()[0]
    if (!s?.true_sender_json) return { ok: false, error: { status: 404, code: "SHIPMENT_NOT_FOUND", message: "Kiriman tidak ditemukan atau belum diterbitkan." } }
    const t = JSON.parse(s.true_sender_json) as { name: string; phone: string; brand: string | null }
    this.audit(tenantId, Date.now(), "user", actorId, "true_sender_reveal", { slug, reason: r, preset: s.mask_preset })
    return { ok: true, value: { name: t.name, phone: t.phone, brand: t.brand ?? null } }
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

  // ---- Backups (TASK-603, ADR-0006 §7) --------------------------------------------------------------------------

  /** Daily logical export to R2; skipped when today's (WIB) file exists; prunes files older than 35 days. */
  async exportBackup(tenantId: string, now: number = Date.now()): Promise<{ ok: true; value: BackupSummary & { skipped: boolean } } | { ok: false; refused: VaultRefusal }> {
    const bound = this.tenantId()
    if (bound !== tenantId) return { ok: false, refused: bound ? "TENANT_MISMATCH" : "TENANT_NOT_PROVISIONED" }
    const key = backupKey(tenantId, wibDayOf(now))
    const prefix = `t/${tenantId}/backup/`
    const cutoff = backupKey(tenantId, wibDayOf(now - BACKUP_KEEP_DAYS * 86_400_000))
    const old = await this.env.BUCKET.list({ prefix })
    const stale = old.objects.filter((o) => o.key < cutoff).map((o) => o.key)
    if (stale.length) await this.env.BUCKET.delete(stale)
    if (old.objects.some((o) => o.key === key)) return { ok: true, value: { key, bytes: 0, tables: 0, rows: 0, checksum: "", skipped: true } }
    const sql = this.ctx.storage.sql
    const tables = dumpTables(sql)
    const backup: TenantBackup = { format: BACKUP_FORMAT, tenantId, schemaVersion: readSchemaState(this.ctx.storage).version, exportedAt: now, ddl: schemaDdl(sql), tables }
    const checksum = await checksumOf(tables)
    const body = await gzipJson(backup)
    await this.env.BUCKET.put(key, body, { httpMetadata: { contentType: "application/gzip" }, customMetadata: { tenant: tenantId, checksum, format: BACKUP_FORMAT } })
    const rows = Object.values(tables).reduce((n, t) => n + t.rows.length, 0)
    return { ok: true, value: { key, bytes: body.byteLength, tables: Object.keys(tables).length, rows, checksum, skipped: false } }
  }

  /** Restore drill target: only an EMPTY object (never provisioned) accepts a backup; checksum is re-computed after. */
  async restoreBackup(key: string): Promise<{ ok: true; value: { rows: number; sourceChecksum: string; restoredChecksum: string } } | { ok: false; error: string }> {
    if (userTables(this.ctx.storage.sql).length) return { ok: false, error: "restore target is not empty" }
    if (!/^t\/[^/]+\/backup\/\d{4}-\d{2}-\d{2}\.json\.gz$/.test(key)) return { ok: false, error: "invalid backup key" }
    const obj = await this.env.BUCKET.get(key)
    if (!obj) return { ok: false, error: "backup not found" }
    const b = await gunzipJson<TenantBackup>(await obj.arrayBuffer())
    if (b.format !== BACKUP_FORMAT || !key.startsWith(`t/${b.tenantId}/`)) return { ok: false, error: "backup format or tenant mismatch" }
    const sourceChecksum = await checksumOf(b.tables)
    if (obj.customMetadata?.checksum && obj.customMetadata.checksum !== sourceChecksum) return { ok: false, error: "backup checksum mismatch" }
    const rows = this.ctx.storage.transactionSync(() => restoreTables(this.ctx.storage.sql, b.ddl, b.tables))
    return { ok: true, value: { rows, sourceChecksum, restoredChecksum: await checksumOf(dumpTables(this.ctx.storage.sql)) } }
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
    // `apikey:<id>` / `mcp:<id>` actors come from `/api/v1` and `/mcp` (spec 08 §5): recorded as their own actor type.
    const kind = actorId?.startsWith("apikey:") ? "api_key" : actorId?.startsWith("mcp:") ? "mcp_client" : actorType
    this.ctx.storage.sql.exec(
      "INSERT INTO audit_logs (id, tenant_id, at, actor_type, actor_id, action, target_type, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      crypto.randomUUID(),
      tenantId,
      at,
      kind,
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
  /** Absolute counters for yesterday and today (WIB) into the outbox → D1 `tenant_daily_stats` (version = push time). */
  private pushDailyStats(tenantId: string, now: number): void {
    const sql = this.ctx.storage.sql
    this.ctx.storage.transactionSync(() => {
      for (const p of [resolvePreset("yesterday", now), resolvePreset("today", now)]) enqueueOutbox(sql, "tenant_daily_stats", p.from, now, { ...dailyStatsOf(sql, p), updated_at: now }, now)
      sql.exec("DELETE FROM vault_timers WHERE name = 'daily_stats'")
    })
    void tenantId
  }

  protected async armOutbox(): Promise<void> {
    // Money/volume changed recently: re-push the daily counters within 5 minutes (debounced, never per event).
    if (tableExists(this.ctx.storage, "vault_timers") && tableExists(this.ctx.storage, "cashier_shifts")) setTimer(this.ctx.storage.sql, "daily_stats", Date.now() + 300_000, "earliest")
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
      if (name === "daily_stats") this.pushDailyStats(tenantId, now)
      if (name === "finance_sync") {
        this.ctx.storage.sql.exec("DELETE FROM vault_timers WHERE name = 'finance_sync'")
        await this.financeSync(tenantId, "mutation", now)
      }
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
    this.scheduleFinanceSync(now)
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
      expireClaims(sql, now)
      purgeDrafts(sql, now)
      if (conn) sql.exec("UPDATE mengantar_connections SET last_polled_at = ?, last_sync_status = ?", now, failed > 0 ? `poll_failed:${failed}` : "ok")
      if (pollCandidates(sql, 1).length > 0) setTimer(sql, "status_poll", now + (active ? POLL_INTERVAL_ACTIVE_MS : POLL_INTERVAL_INACTIVE_MS))
      else sql.exec("DELETE FROM vault_timers WHERE name = 'status_poll'")
    })
    await this.armOutbox()
    return { ok: true, value: { polled, changed, failed } }
  }
}
