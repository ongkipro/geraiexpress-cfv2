// `/pengaturan/mengantar` backend (PR-02b): the owner copies the webhook URL into Mengantar Seller Settings and pastes
// the Webhook Secret back. The token is created once per tenant and registered by hash in D1 `webhook_routes`.
import { AppError } from "../http/envelope"
import { sha256Hex } from "../crypto"
import { vaultFor } from "../do/gerai-vault/stub"
import type { WebhookView } from "../do/gerai-vault"

export function hooksOrigin(env: Pick<Env, "PLATFORM_APEX" | "GX_ENV">, requestUrl: string): string {
  const u = new URL(requestUrl)
  const host = env.GX_ENV === "staging" ? `hooks-staging.${env.PLATFORM_APEX}` : `hooks.${env.PLATFORM_APEX}`
  return env.GX_ENV === "local" ? `${u.protocol}//${host}${u.port ? `:${u.port}` : ""}` : `https://${host}`
}

export interface MengantarSettingsView {
  webhookUrl: string | null
  webhookState: WebhookView["webhookState"] | null
  hasSecret: boolean
  lastEventAt: number | null
  lastFailureAt: number | null
  lastPolledAt: number | null
  lastSyncStatus: string | null
  onboardingState: string | null
  sellerId: string | null
  sellerEmail: string | null
  environment: "sandbox" | "production" | null
}

async function refusal(r: { ok: false; refused: string }): Promise<never> {
  if (r.refused === "TENANT_NOT_PROVISIONED") throw new AppError(409, "NOT_CONNECTED", "Gerai belum terhubung ke Mengantar.")
  throw new AppError(503, "TENANT_NOT_READY", "Data gerai sedang diperbarui. Coba lagi sebentar lagi.")
}

export async function mengantarSettings(env: Env, tenantId: string, requestUrl: string, now: number): Promise<MengantarSettingsView> {
  const vault = vaultFor(env, tenantId)
  const conn = await vault.connectionView(tenantId)
  if (!conn.ok) return refusal(conn)
  let url: string | null = null
  if (conn.value?.hasKey) {
    const t = await vault.ensureWebhookToken(tenantId)
    if (!t.ok) return refusal(t)
    // Registering is idempotent, so a lost first response or a retry never leaves the URL without a route.
    await env.DB.prepare("INSERT INTO webhook_routes (token_hash, tenant_id, key_version, state, created_at) VALUES (?, ?, ?, 'active', ?) ON CONFLICT(token_hash) DO NOTHING")
      .bind(await sha256Hex(t.value.token), tenantId, t.value.keyVersion, now)
      .run()
    url = `${hooksOrigin(env, requestUrl)}/webhooks/mengantar/${t.value.token}`
  }
  const [w, app] = await Promise.all([
    vault.webhookStatus(tenantId),
    env.DB.prepare("SELECT seller_email FROM tenant_applications WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1").bind(tenantId).first<{ seller_email: string }>(),
  ])
  if (!w.ok) return refusal(w)
  return {
    webhookUrl: url,
    webhookState: w.value?.webhookState ?? null,
    hasSecret: w.value?.hasSecret ?? false,
    lastEventAt: w.value?.lastEventAt ?? null,
    lastFailureAt: w.value?.lastFailureAt ?? null,
    lastPolledAt: w.value?.lastPolledAt ?? null,
    lastSyncStatus: w.value?.lastSyncStatus ?? null,
    onboardingState: conn.value?.onboardingState ?? null,
    sellerId: conn.value?.sellerId ?? null,
    sellerEmail: app?.seller_email ?? null,
    environment: conn.value?.environment ?? null,
  }
}

export async function saveWebhookSecret(env: Env, tenantId: string, actorId: string, raw: unknown, requestUrl: string, now: number): Promise<MengantarSettingsView> {
  const secret = typeof raw === "string" ? raw.trim() : ""
  if (secret.length < 8 || secret.length > 200 || /\s/.test(secret)) {
    throw new AppError(400, "INVALID_SECRET", "Webhook Secret tidak valid. Salin ulang dari halaman Integrasi Mengantar.", { secret: "Salin persis dari Mengantar." })
  }
  const vault = vaultFor(env, tenantId)
  // Make sure the URL (and its D1 route) exists before a secret is stored.
  const before = await mengantarSettings(env, tenantId, requestUrl, now)
  if (!before.webhookUrl) throw new AppError(409, "NOT_CONNECTED", "Gerai belum terhubung ke Mengantar.")
  const r = await vault.saveWebhookSecret(tenantId, secret, actorId)
  if (!r.ok) return refusal(r)
  return mengantarSettings(env, tenantId, requestUrl, now)
}
