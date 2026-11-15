import { DurableObject } from "cloudflare:workers"
import { TENANT_MIGRATIONS, TENANT_SCHEMA_VERSION } from "@gx/db/tenant"
import { applyTenantMigrations, readSchemaState, tableExists, type MigrateResult, type SchemaState } from "./core/migrate"
import { normalizeSlug } from "@gx/domain/slug"
import { allocateSlug, slugTaken, type SlugPurpose } from "./slug"
import { readConnection, upsertConnection, viewOf, type ConnectionView, type OnboardingState } from "./connection"
import { decryptString, encryptString } from "../../crypto/aead"
import { backoffMs, d1UpsertStatement, dueOutbox, enqueueOutbox, nextOutboxAt, type OutboxTopic } from "./core/outbox"

export type VaultRefusal = "TENANT_MISMATCH" | "TENANT_NOT_PROVISIONED" | "TENANT_NOT_READY"
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

  protected async armOutbox(): Promise<void> {
    if (!tableExists(this.ctx.storage, "outbox")) return
    const at = nextOutboxAt(this.ctx.storage.sql)
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
  }
}
