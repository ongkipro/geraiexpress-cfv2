// Seller key rotation (TASK-205, ADR-0004 §5, spec 10 §4.3/§4.4). Runs in the Worker; every state change is an RPC
// into the tenant object, which owns the fence:
//   1. `beginKeyRotation` bumps `key_version` and sets `rotation_state = in_flight` BEFORE Partner `regenerate`, so any
//      dispatch holding the old version is rejected and new dispatches pause.
//   2. `regenerate` is called exactly once. ok → `completeKeyRotation` stores the new key, the new callback secret and
//      a new webhook path token in one transaction (old token keeps verifying for 24 h).
//   3. A lost response (`maybe_sent`) is never retried: the object goes to `unknown` and `resolveKeyRotation` reads the
//      current key with `POST /sellers/api-key`; the callback secret is then unknown → `secret_mismatch` if the webhook
//      was active (the owner copies the new secret from Mengantar).
import { emit } from "@gx/telemetry"
import { sha256Hex } from "../../../crypto"
import { AppError } from "../../../http/envelope"
import { resolvePartnerClient } from "../../../mengantar/factory"
import { quotaFor } from "../../partner-quota"
import { vaultFor } from "../stub"

export type RotationOutcome =
  | { state: "rotated"; keyVersion: number; webhookUrlChanged: boolean; secretKnown: boolean }
  | { state: "unknown"; keyVersion: number; code: string }
  | { state: "failed"; keyVersion: number; code: string }

export type KeySyncOutcome =
  | { state: "synced"; changed: boolean; keyVersion: number; webhookSecretReset: boolean }
  | { state: "restricted"; code: string }
  | { state: "failed"; code: string; retryAfterSeconds?: number }

async function markRestricted(env: Env, tenantId: string, sellerId: string | null, code: string, now: number): Promise<void> {
  const environment = env.GX_ENV === "production" ? "production" : "sandbox"
  // Authoritative tenant DO must persist the restriction before we report `restricted` (TASK-707 Sol P2).
  const doRes = await vaultFor(env, tenantId).recordOnboarding(tenantId, { environment, state: "provider_restricted", sellerId })
  if (!doRes.ok) {
    throw new AppError(503, "TENANT_NOT_READY", "Gagal mencatat pembatasan akun seller pada data gerai. Coba lagi sebentar lagi.")
  }
  await env.DB.prepare(
    `INSERT INTO tenant_onboarding (tenant_id, environment, onboarding_state, seller_id, external_user_id, last_error_code, updated_at) VALUES (?1, ?2, 'provider_restricted', ?3, ?1, ?4, ?5)
     ON CONFLICT(tenant_id) DO UPDATE SET onboarding_state = 'provider_restricted', seller_id = COALESCE(excluded.seller_id, tenant_onboarding.seller_id), last_error_code = excluded.last_error_code, updated_at = excluded.updated_at`,
  )
    .bind(tenantId, environment, sellerId, code, now)
    .run()
}

/** Registers the new path token as `active` and the previous one as `rotating` (idempotent). */
async function publishRoutes(env: Env, tenantId: string, routes: { token: string; keyVersion: number; previous: string | null }, now: number): Promise<void> {
  const stmts = [
    env.DB.prepare("INSERT INTO webhook_routes (token_hash, tenant_id, key_version, state, created_at) VALUES (?, ?, ?, 'active', ?) ON CONFLICT(token_hash) DO NOTHING").bind(await sha256Hex(routes.token), tenantId, routes.keyVersion, now),
  ]
  if (routes.previous) stmts.push(env.DB.prepare("UPDATE webhook_routes SET state = 'rotating' WHERE token_hash = ? AND tenant_id = ? AND state = 'active'").bind(await sha256Hex(routes.previous), tenantId))
  await env.DB.batch(stmts)
}

export async function rotateSellerKey(env: Env, input: { tenantId: string; actorId: string; reason: string; now: number }): Promise<RotationOutcome> {
  const vault = vaultFor(env, input.tenantId)
  const fence = await vault.beginKeyRotation(input.tenantId, { actorId: input.actorId, reason: input.reason, now: input.now })
  if (!fence.ok) {
    if (fence.refused === "ROTATION_IN_PROGRESS") throw new AppError(409, "ROTATION_IN_PROGRESS", "Rotasi kunci sebelumnya belum selesai. Selesaikan pemeriksaan kunci terlebih dahulu.")
    if (fence.refused === "NO_SELLER") throw new AppError(409, "NOT_CONNECTED", "Gerai belum punya akun seller Mengantar.")
    throw new AppError(503, "TENANT_NOT_READY", "Data gerai sedang diperbarui. Coba lagi sebentar lagi.")
  }
  const { sellerId, keyVersion } = fence.value
  const quota = await quotaFor(env).reserve("call", input.now)
  if (!quota.ok) {
    await vault.abortKeyRotation(input.tenantId, keyVersion, "RATE_LIMITED")
    return { state: "failed", keyVersion, code: "RATE_LIMITED" }
  }
  const out = await (await resolvePartnerClient(env)).regenerate(sellerId)
  emit("mengantar.partner_api", { route: "/sellers/api-key/regenerate", status: "status" in out ? out.status : 0, outcome: out.kind }, { tenantId: input.tenantId }, { env: env.GX_ENV })
  if (out.kind === "ok") {
    const done = await vault.completeKeyRotation(input.tenantId, keyVersion, { apiKey: out.data.apiKey, callbackSecret: out.data.callbackSecret ?? null }, Date.now())
    if (!done.ok) return { state: "unknown", keyVersion, code: done.refused }
    await publishRoutes(env, input.tenantId, done.value.routes, Date.now())
    return { state: "rotated", keyVersion, webhookUrlChanged: done.value.routes.previous !== null, secretKnown: out.data.callbackSecret != null }
  }
  if (out.kind === "error" || out.kind === "relay_refused") {
    // Mengantar (or the relay, before Mengantar) answered: the old key is still valid.
    await vault.abortKeyRotation(input.tenantId, keyVersion, out.code)
    if (out.kind === "error" && (out.code === "SELLER_DEACTIVATED" || out.code === "API_KEY_DISABLED")) {
      await markRestricted(env, input.tenantId, sellerId, out.code, Date.now())
    }
    return { state: "failed", keyVersion, code: out.code }
  }
  // maybe_sent: never call regenerate again; read the current key back.
  await vault.markKeyRotationUnknown(input.tenantId, keyVersion, out.reason)
  return resolveKeyRotation(env, input.tenantId, Date.now())
}

/** Read-back after an unknown outcome or a crash mid-rotation (`in_flight` older than 5 min). Never regenerates. */
export async function resolveKeyRotation(env: Env, tenantId: string, now: number): Promise<RotationOutcome> {
  const vault = vaultFor(env, tenantId)
  const r = await vault.resolveKeyRotation(tenantId, now)
  if (!r.ok) throw new AppError(503, "TENANT_NOT_READY", "Data gerai sedang diperbarui. Coba lagi sebentar lagi.")
  if (r.value.state === "none") throw new AppError(409, "NO_ROTATION_PENDING", "Tidak ada rotasi kunci yang perlu diperiksa.")
  if (r.value.state === "unknown") return { state: "unknown", keyVersion: r.value.keyVersion!, code: r.value.code ?? "UNKNOWN" }
  if (r.value.state === "failed") {
    const code = r.value.code ?? "UNKNOWN"
    if (code === "SELLER_DEACTIVATED" || code === "API_KEY_DISABLED") {
      const c = await vault.connectionView(tenantId)
      await markRestricted(env, tenantId, c.ok ? (c.value?.sellerId ?? null) : null, code, now)
    }
    return { state: "failed", keyVersion: r.value.keyVersion!, code }
  }
  return { state: "rotated", keyVersion: r.value.keyVersion!, webhookUrlChanged: false, secretKnown: false }
}

/**
 * Fetches the current Public API key for a Partner-registered seller via `POST /sellers/api-key` (no regeneration).
 * Use when a seller regenerated their own key inside Mengantar Seller Web so the stored copy stopped working.
 */
export async function syncSellerKey(
  env: Env,
  input: { tenantId: string; actorId: string; actorType: "user" | "super_admin"; reason: string; now: number },
): Promise<KeySyncOutcome> {
  const vault = vaultFor(env, input.tenantId)
  const conn = await vault.connectionView(input.tenantId)
  if (!conn.ok) throw new AppError(503, "TENANT_NOT_READY", "Data gerai sedang diperbarui. Coba lagi sebentar lagi.")
  if (!conn.value || !conn.value.sellerId || conn.value.onboardingState !== "connected") {
    throw new AppError(
      409,
      "NOT_PARTNER_SELLER",
      conn.value?.onboardingState === "byok_connected"
        ? "Gerai ini memakai API key sendiri (BYOK). Perbarui API key langsung di formulir API key."
        : "Sinkronisasi API key otomatis hanya tersedia untuk akun seller yang terdaftar lewat GeraiExpress.",
    )
  }
  if (conn.value.rotationState !== "idle") {
    throw new AppError(409, "ROTATION_IN_PROGRESS", "Rotasi kunci sedang berlangsung. Selesaikan pemeriksaan kunci terlebih dahulu.")
  }
  const quota = await quotaFor(env).reserve("call", input.now)
  if (!quota.ok) return { state: "failed", code: "RATE_LIMITED", retryAfterSeconds: quota.retryAfterSeconds }
  const out = await (await resolvePartnerClient(env)).apiKey(conn.value.sellerId)
  emit("mengantar.partner_api", { route: "/sellers/api-key", status: "status" in out ? out.status : 0, outcome: out.kind }, { tenantId: input.tenantId }, { env: env.GX_ENV })
  if (out.kind === "ok") {
    if (!out.data.apiKey) {
      await markRestricted(env, input.tenantId, conn.value.sellerId, "API_KEY_DISABLED", Date.now())
      return { state: "restricted", code: "API_KEY_DISABLED" }
    }
    const stored = await vault.syncSellerKeyFromPartner(input.tenantId, {
      apiKey: out.data.apiKey,
      actorId: input.actorId,
      actorType: input.actorType,
      reason: input.reason,
      now: Date.now(),
    })
    if (!stored.ok) {
      if (stored.refused === "KEY_ROTATING") throw new AppError(409, "ROTATION_IN_PROGRESS", "Rotasi kunci sedang berlangsung. Coba lagi sebentar lagi.")
      throw new AppError(503, "TENANT_NOT_READY", "Data gerai sedang diperbarui. Coba lagi sebentar lagi.")
    }
    return { state: "synced", ...stored.value }
  }
  if (out.kind === "error" && (out.code === "SELLER_DEACTIVATED" || out.code === "API_KEY_DISABLED")) {
    await markRestricted(env, input.tenantId, conn.value.sellerId, out.code, Date.now())
    return { state: "restricted", code: out.code }
  }
  if (out.kind === "error") return { state: "failed", code: out.code, ...(out.retryAfterSeconds !== undefined ? { retryAfterSeconds: out.retryAfterSeconds } : {}) }
  if (out.kind === "relay_refused") return { state: "failed", code: out.code }
  return { state: "failed", code: out.reason }
}

/** Revokes `rotating` routes once the tenant's newer route is older than 24 h (spec 01 §2.7 Rotation). Hourly cron. */
export async function revokeExpiredRoutes(env: Env, now: number): Promise<number> {
  const r = await env.DB.prepare(
    `UPDATE webhook_routes SET state = 'revoked', revoked_at = ?1 WHERE state = 'rotating' AND EXISTS (
       SELECT 1 FROM webhook_routes n WHERE n.tenant_id = webhook_routes.tenant_id AND n.state = 'active' AND n.created_at <= ?2)`,
  )
    .bind(now, now - 24 * 3600_000)
    .run()
  return r.meta.changes ?? 0
}
