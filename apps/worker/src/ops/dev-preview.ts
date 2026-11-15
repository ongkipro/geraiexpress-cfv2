// Local development only: `GET /internal/dev/preview?token=<OPS_TOKEN>&as=<email>&to=<path>` signs in as an existing
// user on this host and redirects, so cookie-less tools (dotuiux, admin-geometry, screenshots) can render
// authenticated screens. Refused unless GX_ENV is "local". On owner. the session is aal2 (TOTP considered done).
import { setSessionCookie } from "../auth/cookies"
import { createSession } from "../auth/session"
import { timingSafeEqualStr } from "../crypto"
import { notFoundHtml } from "../http/pages"

export async function handleDevPreview(request: Request, env: Env, ctx: "app" | "owner"): Promise<Response> {
  if (env.GX_ENV !== "local") return notFoundHtml()
  const url = new URL(request.url)
  if (!(await timingSafeEqualStr(url.searchParams.get("token") ?? "", env.OPS_TOKEN))) return notFoundHtml()
  const user = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND status = 'active'").bind((url.searchParams.get("as") ?? "").toLowerCase()).first<{ id: string }>()
  if (!user) return notFoundHtml()
  const membership = ctx === "app" ? await env.DB.prepare("SELECT tenant_id FROM tenant_members WHERE user_id = ? AND status = 'active' LIMIT 1").bind(user.id).first<{ tenant_id: string }>() : null
  const now = Date.now()
  const s = await createSession(env, { userId: user.id, ctx, activeTenantId: membership?.tenant_id ?? null, deviceHash: "dev-preview", userAgent: "dev-preview", aal: ctx === "owner" ? "aal2" : "aal1", now })
  await s.statement.run()
  if (ctx === "owner") await env.DB.prepare("UPDATE sessions SET totp_verified_at = ? WHERE user_id = ? AND device_hash = 'dev-preview'").bind(now, user.id).run()
  const to = url.searchParams.get("to") ?? "/"
  return new Response(null, { status: 302, headers: { location: to.startsWith("/") && !to.startsWith("//") ? to : "/", "set-cookie": setSessionCookie(ctx, false, s.token, s.maxAgeSeconds) } })
}
