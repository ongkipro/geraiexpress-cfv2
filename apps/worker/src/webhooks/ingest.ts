// `hooks.` ingest (spec 01 §2.7): token hash → D1 route → that tenant's object verifies and stores the raw body in the
// same transaction → enqueue `{ tenant_id, event_key }` → 200. Unknown or revoked tokens are a bodiless 404.
import { sha256Hex } from "../crypto"
import { vaultFor } from "../do/gerai-vault/stub"
import { PATH_TOKEN_RE } from "./verify"

const MAX_BODY_BYTES = 16 * 1024
const empty = (status: number) => new Response(null, { status, headers: { "cache-control": "no-store" } })

export interface WebhookMessage {
  tenant_id: string
  event_key: string
}

export async function handleMengantarWebhook(request: Request, env: Env, token: string): Promise<Response> {
  if (request.method !== "POST" || !PATH_TOKEN_RE.test(token)) return empty(404)
  const route = await env.DB.prepare("SELECT tenant_id FROM webhook_routes WHERE token_hash = ? AND state IN ('active','rotating')").bind(await sha256Hex(token)).first<{ tenant_id: string }>()
  if (!route) return empty(404)
  const declared = Number(request.headers.get("content-length") ?? "0")
  if (declared > MAX_BODY_BYTES) return empty(413)
  const rawBody = await request.text()
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return empty(413)
  const r = await vaultFor(env, route.tenant_id).ingestWebhook(route.tenant_id, {
    token,
    timestamp: request.headers.get("x-timestamp"),
    signature: request.headers.get("x-signature"),
    environmentHeader: request.headers.get("x-environment"),
    rawBody,
  })
  if (!r.ok) {
    // Recovery/not-ready → 503 so Mengantar retries; everything else is the caller's fault.
    if (r.refused === "TENANT_NOT_READY" || r.refused === "TENANT_NOT_PROVISIONED") return empty(503)
    return empty(r.refused === "NOT_CONFIGURED" || r.refused === "UNKNOWN_TOKEN" ? 404 : 401)
  }
  if (!r.value.duplicate) {
    try {
      await env.WEBHOOK_QUEUE.send({ tenant_id: route.tenant_id, event_key: r.value.eventKey } satisfies WebhookMessage)
    } catch {
      // The row is committed as `received`; the object's inbox sweep re-enqueues it (spec 01 §2.7).
    }
  }
  return empty(200)
}

/** Queue consumer: apply each stored event in its tenant object; retry on failure. */
export async function consumeWebhookBatch(batch: MessageBatch<WebhookMessage>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    const { tenant_id, event_key } = msg.body ?? ({} as WebhookMessage)
    if (typeof tenant_id !== "string" || typeof event_key !== "string" || !tenant_id || !/^[0-9a-f]{64}$/.test(event_key)) {
      msg.ack()
      continue
    }
    try {
      const r = await vaultFor(env, tenant_id).applyWebhook(tenant_id, event_key)
      if (!r.ok && r.refused === "TENANT_NOT_READY") msg.retry({ delaySeconds: 60 })
      else msg.ack()
    } catch {
      msg.retry({ delaySeconds: 30 })
    }
  }
}
