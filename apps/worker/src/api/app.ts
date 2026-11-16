// `/api/app/*` on app.geraiexpress.com (Hono). Every route is registered through `register()` with an auth level and
// a projection (spec 05 §4 gate 3). Unsafe methods require same-origin (CSRF); the tenant comes only from the session.
import { Hono, type Context, type MiddlewareHandler } from "hono"
import { acceptInvitation, completeSignup, createInvitation, login, requestPasswordReset, requestSignupOtp, resetPassword, verifySignupOtp, viewInvitation } from "../auth/flows"
import { clearSessionCookie, isSecureRequest, setSessionCookie } from "../auth/cookies"
import { sameOriginOk } from "../auth/csrf"
import { readSession, revokeSession, type Session } from "../auth/session"
import { verifyTurnstile } from "../auth/turnstile"
import { sha256Hex } from "../crypto"
import { AppError, fail, fromError, ok } from "../http/envelope"
import { clientIp, hostOrigin, ipHash } from "../http/request"
import { register, type AuthLevel } from "./registry"
import { dispatchDue } from "../email/mailer"
import { connectByok, submitApplication } from "../onboarding/service"
import { mengantarSettings, saveWebhookSecret } from "../webhooks/settings"
import { searchAreas } from "../couriers/areas"
import { projectFor } from "../dto/projection"
import type { ContactOp } from "../do/gerai-vault"
import type { RecipientInput, SenderInput } from "../do/gerai-vault/contacts"
import { MEDIA_MAX_BYTES, MEDIA_PURPOSES, MEDIA_TYPES, mediaKeyFor, signMediaUrl, sniffType, verifyMediaSignature, type MediaPurpose } from "../media"
import { listCouriers, updateCourier } from "../couriers/catalog"
import { vaultFor } from "../do/gerai-vault/stub"

export interface Membership {
  tenantId: string
  tenantName: string
  tenantSlug: string
  role: "gerai_admin" | "cashier"
}

type Vars = { session: Session; membership: Membership | null; rolledCookie: string | null }
export type AppCtx = Context<{ Bindings: Env; Variables: Vars }>

// Cloudflare's documented Turnstile test secrets look like "1x" + zeros + two letters.
const isTurnstileTestKey = (k: string) => /^[123]x0{20,}[A-Za-z]{2}$/.test(k)

async function turnstileOk(c: AppCtx, token: unknown): Promise<boolean> {
  // Cloudflare's documented test secrets locally: accept any non-empty token without a network call.
  if (c.env.GX_ENV === "local" && isTurnstileTestKey(c.env.TURNSTILE_SECRET_KEY)) return typeof token === "string" && token.length > 0
  return verifyTurnstile(c.env.TURNSTILE_SECRET_KEY, typeof token === "string" ? token : undefined, clientIp(c.req.raw))
}

async function deviceHash(c: AppCtx): Promise<string | null> {
  const ua = c.req.header("user-agent")
  return ua ? sha256Hex(`${c.env.AUTH_SESSION_PEPPER}:device:${ua}`) : null
}

async function loadMembership(env: Env, session: Session): Promise<Membership | null> {
  if (!session.row.active_tenant_id) return null
  const m = await env.DB.prepare(
    `SELECT m.tenant_id, m.role, t.name, t.slug FROM tenant_members m JOIN tenants t ON t.id = m.tenant_id
     WHERE m.user_id = ? AND m.tenant_id = ? AND m.status = 'active' AND t.status IN ('active','pending_review','draft_application')`,
  )
    .bind(session.user.id, session.row.active_tenant_id)
    .first<{ tenant_id: string; role: "gerai_admin" | "cashier"; name: string; slug: string }>()
  return m ? { tenantId: m.tenant_id, tenantName: m.name, tenantSlug: m.slug, role: m.role } : null
}

export function guard(level: AuthLevel): MiddlewareHandler<{ Bindings: Env; Variables: Vars }> {
  return async (c, next) => {
    if (!sameOriginOk(c.req.raw)) return fail(403, "CSRF", "Permintaan ditolak. Muat ulang halaman lalu coba lagi.")
    if (level === "public") return next()
    const s = await readSession(c.env, c.req.raw, "app")
    if (!s) return fail(401, "UNAUTHENTICATED", "Sesi Anda berakhir. Silakan masuk lagi.")
    c.set("session", s.session)
    if (s.setCookie) c.set("rolledCookie", s.setCookie)
    if (level === "app_session") return next()
    const m = await loadMembership(c.env, s.session)
    if (!m) return fail(403, "NO_MEMBERSHIP", "Akun Anda belum terhubung ke gerai mana pun.")
    if (level === "app_owner" && m.role !== "gerai_admin") return fail(403, "FORBIDDEN", "Menu ini hanya untuk pemilik gerai.")
    if (level !== "app_member" && level !== "app_owner") return fail(403, "FORBIDDEN", "Akses ditolak.")
    c.set("membership", m)
    return next()
  }
}

async function body(c: AppCtx): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json()
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const now = () => Date.now()

export function appApi(): Hono<{ Bindings: Env; Variables: Vars }> {
  const app = new Hono<{ Bindings: Env; Variables: Vars }>().basePath("/api/app")
  // Handlers return plain Responses (envelope helpers); carry headers the guard set on the context (rolling cookie).
  app.use(async (c, next) => {
    await next()
    const rolled = c.get("rolledCookie")
    if (rolled && c.res) {
      const res = new Response(c.res.body, c.res)
      if (!res.headers.has("set-cookie")) res.headers.append("set-cookie", rolled)
      c.res = res
    }
  })
  app.onError((err) => {
    if (!(err instanceof AppError)) console.error("APP_API_ERROR", err instanceof Error ? err.message : String(err))
    return fromError(err)
  })
  app.notFound(() => fail(404, "NOT_FOUND", "Alamat tidak ditemukan."))
  const r = (method: "GET" | "POST", path: string, auth: AuthLevel, projection: "none" | "self" | "role", handler: (c: AppCtx) => Promise<Response>) =>
    register(app, { context: "app", method, path, auth, projection }, guard, (c) => handler(c as AppCtx))

  // Sign-up (PR-01): email → OTP → ticket → account.
  r("POST", "/auth/signup/request", "public", "none", async (c) => {
    const b = await body(c)
    if (!(await turnstileOk(c, b.turnstileToken))) throw new AppError(400, "TURNSTILE_FAILED", "Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi.")
    const r = await requestSignupOtp(c.env, { email: b.email, ipHash: await ipHash(c.env.AUTH_SESSION_PEPPER, c.req.raw), origin: hostOrigin(c.req.raw), now: now() })
    c.executionCtx.waitUntil(dispatchDue(c.env).then(() => undefined))
    return ok({ otpId: r.otpId })
  })
  r("POST", "/auth/signup/verify", "public", "none", async (c) => {
    const b = await body(c)
    return ok(await verifySignupOtp(c.env, { otpId: b.otpId, code: b.code, now: now() }))
  })
  r("POST", "/auth/signup/complete", "public", "self", async (c) => {
    const b = await body(c)
    const res = await completeSignup(c.env, { ticket: b.ticket, name: b.name, password: b.password, deviceHash: await deviceHash(c), userAgent: c.req.header("user-agent") ?? null, now: now() })
    return ok({ userId: res.userId }, 201, { "set-cookie": setSessionCookie("app", isSecureRequest(c.req.raw, c.env.GX_ENV), res.sessionToken, res.maxAgeSeconds) })
  })

  // Login / logout / me.
  r("POST", "/auth/login", "public", "self", async (c) => {
    const b = await body(c)
    if (!(await turnstileOk(c, b.turnstileToken))) throw new AppError(400, "TURNSTILE_FAILED", "Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi.")
    const res = await login(c.env, {
      email: b.email,
      password: b.password,
      ctx: "app",
      ipHash: await ipHash(c.env.AUTH_SESSION_PEPPER, c.req.raw),
      deviceHash: await deviceHash(c),
      userAgent: c.req.header("user-agent") ?? null,
      origin: hostOrigin(c.req.raw),
      now: now(),
    })
    if (res.newDevice) c.executionCtx.waitUntil(dispatchDue(c.env).then(() => undefined))
    return ok({ userId: res.userId }, 200, { "set-cookie": setSessionCookie("app", isSecureRequest(c.req.raw, c.env.GX_ENV), res.sessionToken, res.maxAgeSeconds) })
  })
  r("POST", "/auth/logout", "app_session", "none", async (c) => {
    await revokeSession(c.env.DB, c.get("session").row.token_hash, now()).run()
    return ok({ loggedOut: true }, 200, { "set-cookie": clearSessionCookie("app", isSecureRequest(c.req.raw, c.env.GX_ENV)) })
  })
  r("GET", "/auth/me", "app_session", "self", async (c) => {
    const s = c.get("session")
    const m = await loadMembership(c.env, s)
    return ok({
      user: { id: s.user.id, name: s.user.name, email: s.user.email },
      membership: m ? { tenantId: m.tenantId, tenantName: m.tenantName, tenantSlug: m.tenantSlug, role: m.role } : null,
    })
  })

  // Password reset.
  r("POST", "/auth/password/forgot", "public", "none", async (c) => {
    const b = await body(c)
    await requestPasswordReset(c.env, { email: b.email, ipHash: await ipHash(c.env.AUTH_SESSION_PEPPER, c.req.raw), origin: hostOrigin(c.req.raw), now: now() })
    c.executionCtx.waitUntil(dispatchDue(c.env).then(() => undefined))
    return ok({ sent: true })
  })
  r("POST", "/auth/password/reset", "public", "none", async (c) => {
    const b = await body(c)
    await resetPassword(c.env, { token: b.token, password: b.password, now: now() })
    return ok({ reset: true })
  })

  // Invitations.
  r("POST", "/members/invitations", "app_owner", "role", async (c) => {
    const b = await body(c)
    const m = c.get("membership")!
    const s = c.get("session")
    const res = await createInvitation(c.env, { tenantId: m.tenantId, tenantName: m.tenantName, inviterId: s.user.id, inviterName: s.user.name, email: b.email, origin: hostOrigin(c.req.raw), now: now() })
    c.executionCtx.waitUntil(dispatchDue(c.env).then(() => undefined))
    return ok({ expiresAt: res.expiresAt }, 201)
  })
  r("GET", "/auth/invitations/:token", "public", "none", async (c) => ok(await viewInvitation(c.env, c.req.param("token"), now())))
  r("POST", "/auth/invitations/:token/accept", "public", "self", async (c) => {
    const b = await body(c)
    const res = await acceptInvitation(c.env, { token: c.req.param("token"), name: b.name, password: b.password, deviceHash: await deviceHash(c), userAgent: c.req.header("user-agent") ?? null, now: now() })
    return ok({ userId: res.userId }, 201, { "set-cookie": setSessionCookie("app", isSecureRequest(c.req.raw, c.env.GX_ENV), res.sessionToken, res.maxAgeSeconds) })
  })

  // Outlet application (PR-01): pickup area search, submit, status.
  r("GET", "/onboarding/areas", "app_session", "none", async (c) => ok({ items: (await searchAreas(c.env, c.req.query("q") ?? "")).items }))
  r("POST", "/onboarding/application", "app_session", "self", async (c) => {
    const b = await body(c)
    const res = await submitApplication(c.env, c.get("session").user.id, b as never, now())
    return ok(res, 201)
  })
  r("GET", "/onboarding/status", "app_session", "self", async (c) => {
    const a = await c.env.DB.prepare(
      `SELECT a.state, a.business_name, a.submitted_at, a.decided_at, a.decision_reason, t.slug, t.status AS tenant_status, o.onboarding_state
       FROM tenant_applications a JOIN tenants t ON t.id = a.tenant_id LEFT JOIN tenant_onboarding o ON o.tenant_id = t.id
       WHERE a.applicant_user_id = ? ORDER BY a.created_at DESC LIMIT 1`,
    )
      .bind(c.get("session").user.id)
      .first()
    return ok({ application: a ?? null })
  })
  // BYOK (PR-02): owner of an approved gerai whose email already had a Mengantar account pastes their own key.
  r("POST", "/onboarding/byok", "app_owner", "self", async (c) => {
    const b = await body(c)
    const m = c.get("membership")!
    const conn = await vaultFor(c.env, m.tenantId).connectionView(m.tenantId)
    if (!conn.ok || !conn.value || !["existing_account_required", "byok_connected", "registration_pending"].includes(conn.value.onboardingState)) {
      throw new AppError(409, "BYOK_NOT_AVAILABLE", "Hubungkan akun sendiri hanya tersedia bila email Anda sudah terdaftar di Mengantar.")
    }
    return ok(await connectByok(c.env, m.tenantId, typeof b.apiKey === "string" ? b.apiKey : "", now()))
  })

  // Workspace shell (TASK-301): who am I, which menus, badge counts; never money for a cashier.
  r("GET", "/workspace", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const s = c.get("session")
    // A gerai still under review (or rejected and being corrected) has no workspace yet: the SPA shows /daftar/status.
    const status = await c.env.DB.prepare("SELECT status FROM tenants WHERE id = ?").bind(m.tenantId).first<{ status: string }>()
    if (status?.status !== "active") throw new AppError(403, "NO_MEMBERSHIP", "Gerai Anda belum aktif.")
    const vault = vaultFor(c.env, m.tenantId)
    const [notes, webhook, memberships] = await Promise.all([
      vault.listNotifications(m.tenantId, { userId: s.user.id, role: m.role }, 1),
      m.role === "gerai_admin" ? vault.webhookStatus(m.tenantId) : Promise.resolve(null),
      c.env.DB.prepare("SELECT t.id, t.name, t.slug FROM tenant_members tm JOIN tenants t ON t.id = tm.tenant_id WHERE tm.user_id = ? AND tm.status = 'active' AND t.status = 'active' ORDER BY t.name").bind(s.user.id).all<{ id: string; name: string; slug: string }>(),
    ])
    const menus = ["dashboard", "buat-pengiriman", "kiriman", "kontak", ...(m.role === "gerai_admin" ? ["keuangan"] : []), "pengaturan"]
    return ok(
      projectFor(m.role, {
        user: { id: s.user.id, name: s.user.name, email: s.user.email },
        tenant: { id: m.tenantId, name: m.tenantName, slug: m.tenantSlug, miniSiteHost: `${m.tenantSlug}.${c.env.TENANT_ZONE}` },
        role: m.role,
        menus,
        badges: { kiriman: 0, notifications: notes.ok ? notes.value.unread : 0 },
        hints: { mengantarWebhook: webhook && webhook.ok && webhook.value && webhook.value.webhookState !== "active" ? webhook.value.webhookState : null },
        tenants: memberships.results,
      }),
    )
  })
  r("GET", "/notifications", "app_member", "self", async (c) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).listNotifications(m.tenantId, { userId: c.get("session").user.id, role: m.role }, 100)
    if (!r.ok) throw new AppError(503, "TENANT_NOT_READY", "Data gerai sedang diperbarui. Coba lagi sebentar lagi.")
    return ok(r.value)
  })
  r("POST", "/notifications/read", "app_member", "self", async (c) => {
    const b = await body(c)
    const m = c.get("membership")!
    const ids = b.all === true ? "all" : Array.isArray(b.ids) ? (b.ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 200) : []
    const r = await vaultFor(c.env, m.tenantId).markNotificationsRead(m.tenantId, { userId: c.get("session").user.id, role: m.role }, ids)
    if (!r.ok) throw new AppError(503, "TENANT_NOT_READY", "Data gerai sedang diperbarui. Coba lagi sebentar lagi.")
    return ok({ marked: r.value })
  })

  // Kontak › Pengirim / Penerima (TASK-302, DEC-212). Deposit is owner-only (projection); WA verification only by an
  // interactive counter action of a signed-in member (API keys never reach these routes).
  const contacts = async (c: AppCtx, op: ContactOp, status = 200) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).contacts(m.tenantId, op, c.get("session").user.id)
    if (!r.ok) throw new AppError(503, "TENANT_NOT_READY", "Data gerai sedang diperbarui. Coba lagi sebentar lagi.")
    const v = r.value
    if (v.kind === "errors") throw new AppError(422, "INVALID_CONTACT", v.errors[0]!.message, Object.fromEntries(v.errors.map((e) => [e.field, e.message])))
    if ((v.kind === "sender" || v.kind === "recipient") && !v.item) throw new AppError(404, "CONTACT_NOT_FOUND", "Kontak tidak ditemukan.")
    return ok(projectFor(m.role, v), status)
  }
  const filterOf = (x: string | undefined) => (x === "walk_in" || x === "reseller_dropship" ? x : "all")
  r("GET", "/contacts/senders", "app_member", "role", (c) => contacts(c, { op: "list_senders", q: (c.req.query("q") ?? "").slice(0, 60), filter: filterOf(c.req.query("jenis")) }))
  r("GET", "/contacts/senders/:id", "app_member", "role", (c) => contacts(c, { op: "get_sender", id: c.req.param("id") ?? "" }))
  r("POST", "/contacts/senders", "app_member", "role", async (c) => contacts(c, { op: "create_sender", input: (await body(c)) as SenderInput }, 201))
  r("POST", "/contacts/senders/:id", "app_member", "role", async (c) => contacts(c, { op: "update_sender", id: c.req.param("id") ?? "", input: (await body(c)) as SenderInput }))
  r("POST", "/contacts/senders/:id/verify-wa", "app_member", "role", (c) => contacts(c, { op: "verify_wa", id: c.req.param("id") ?? "" }))
  r("POST", "/contacts/senders/:id/archive", "app_owner", "role", (c) => contacts(c, { op: "archive", contact: "sender", id: c.req.param("id") ?? "" }))
  r("GET", "/contacts/recipients", "app_member", "role", (c) => contacts(c, { op: "list_recipients", q: (c.req.query("q") ?? "").slice(0, 60) }))
  r("GET", "/contacts/recipients/:id", "app_member", "role", (c) => contacts(c, { op: "get_recipient", id: c.req.param("id") ?? "" }))
  r("POST", "/contacts/recipients", "app_member", "role", async (c) => contacts(c, { op: "create_recipient", input: (await body(c)) as RecipientInput }, 201))
  r("POST", "/contacts/recipients/:id", "app_member", "role", async (c) => contacts(c, { op: "update_recipient", id: c.req.param("id") ?? "", input: (await body(c)) as RecipientInput }))
  r("POST", "/contacts/recipients/:id/archive", "app_owner", "role", (c) => contacts(c, { op: "archive", contact: "recipient", id: c.req.param("id") ?? "" }))
  r("GET", "/contacts/risk-badge", "app_member", "role", (c) => contacts(c, { op: "badge", phone: c.req.query("phone") ?? "" }))

  // Media (TASK-302): upload into `t/<tenant>/…`, read through a short-lived signed URL bound to the tenant.
  r("POST", "/media", "app_member", "self", async (c) => {
    const m = c.get("membership")!
    const purpose = c.req.query("purpose") as MediaPurpose
    if (!MEDIA_PURPOSES.includes(purpose)) throw new AppError(422, "INVALID_PURPOSE", "Jenis berkas tidak dikenal.")
    if (purpose === "logo" && m.role !== "gerai_admin") throw new AppError(403, "FORBIDDEN", "Logo gerai hanya bisa diganti pemilik.")
    const declared = Number(c.req.header("content-length") ?? "0")
    if (declared > MEDIA_MAX_BYTES) throw new AppError(413, "FILE_TOO_LARGE", "Ukuran berkas maksimal 5 MB.")
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    if (bytes.byteLength === 0) throw new AppError(422, "EMPTY_FILE", "Berkas kosong.")
    if (bytes.byteLength > MEDIA_MAX_BYTES) throw new AppError(413, "FILE_TOO_LARGE", "Ukuran berkas maksimal 5 MB.")
    const type = sniffType(bytes)
    if (!type) throw new AppError(415, "UNSUPPORTED_FILE", "Hanya foto JPG, PNG, WEBP atau PDF.")
    const id = crypto.randomUUID()
    const key = mediaKeyFor(m.tenantId, purpose, id, MEDIA_TYPES[type]!)
    await c.env.BUCKET.put(key, bytes, { httpMetadata: { contentType: type }, customMetadata: { tenant: m.tenantId } })
    const reg = await vaultFor(c.env, m.tenantId).registerMedia(m.tenantId, { key, purpose, contentType: type, sizeBytes: bytes.byteLength, uploadedBy: c.get("session").user.id })
    if (!reg.ok) {
      await c.env.BUCKET.delete(key)
      throw new AppError(503, "TENANT_NOT_READY", "Data gerai sedang diperbarui. Coba lagi sebentar lagi.")
    }
    return ok({ id: reg.value, url: await signMediaUrl(c.env.KEK_SECRET, m.tenantId, reg.value, now()) }, 201)
  })
  r("GET", "/media/:id", "app_member", "self", async (c) => {
    const m = c.get("membership")!
    const id = c.req.param("id") ?? ""
    const valid = await verifyMediaSignature(c.env.KEK_SECRET, m.tenantId, id, Number(c.req.query("exp")), c.req.query("sig") ?? "", now())
    if (!valid) throw new AppError(403, "MEDIA_LINK_EXPIRED", "Tautan berkas sudah kedaluwarsa. Muat ulang halaman.")
    const k = await vaultFor(c.env, m.tenantId).mediaKey(m.tenantId, id)
    if (!k.ok || !k.value || !k.value.key.startsWith(`t/${m.tenantId}/`)) throw new AppError(404, "NOT_FOUND", "Berkas tidak ditemukan.")
    const obj = await c.env.BUCKET.get(k.value.key)
    if (!obj) throw new AppError(404, "NOT_FOUND", "Berkas tidak ditemukan.")
    return new Response(obj.body, { headers: { "content-type": k.value.contentType, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff", "content-disposition": "inline" } })
  })

  // Pengaturan › Ekspedisi Aktif (TASK-206, DEC-223): instant-save toggles and pickup mode.
  r("GET", "/settings/couriers", "app_owner", "role", async (c) => ok({ items: await listCouriers(c.env, c.get("membership")!.tenantId) }))
  r("POST", "/settings/couriers/:code", "app_owner", "role", async (c) => {
    const b = await body(c)
    return ok(await updateCourier(c.env, c.get("membership")!.tenantId, c.get("session").user.id, c.req.param("code") ?? "", { enabled: b.enabled, pickupMode: b.pickupMode }))
  })
  r("GET", "/areas", "app_member", "none", async (c) => ok({ items: (await searchAreas(c.env, c.req.query("q") ?? "")).items }))

  // Pengaturan › Mengantar (PR-02b): webhook URL, secret, status chip, polling floor.
  r("GET", "/settings/mengantar", "app_owner", "role", async (c) => ok(await mengantarSettings(c.env, c.get("membership")!.tenantId, c.req.url, now())))
  r("POST", "/settings/mengantar/webhook-secret", "app_owner", "role", async (c) => {
    const b = await body(c)
    return ok(await saveWebhookSecret(c.env, c.get("membership")!.tenantId, c.get("session").user.id, b.secret, c.req.url, now()))
  })

  // Local development only: give the signed-in user an active synthetic tenant so flows that need a gerai can be
  // exercised before the outlet application exists (TASK-203). Refused unless GX_ENV is "local".
  r("POST", "/dev/seed-tenant", "app_session", "none", async (c) => {
    if (c.env.GX_ENV !== "local") return fail(404, "NOT_FOUND", "Alamat tidak ditemukan.")
    const b = await body(c)
    const slug = typeof b.slug === "string" && /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(b.slug) ? b.slug : `dev${Date.now().toString(36)}`
    const id = crypto.randomUUID()
    const t = now()
    const s = c.get("session")
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO tenants (id, slug, name, status, owner_user_id, created_at, updated_at, approved_at) VALUES (?1, ?2, ?3, 'active', ?4, ?5, ?5, ?5)").bind(id, slug, typeof b.name === "string" ? b.name.slice(0, 80) : "Gerai Contoh", s.user.id, t),
      c.env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'gerai_admin', 'active', ?)").bind(id, s.user.id, t),
      c.env.DB.prepare("INSERT INTO tenant_hostnames (hostname, tenant_id, kind, state, created_at, activated_at) VALUES (?1, ?2, 'platform_subdomain', 'active', ?3, ?3)").bind(`${slug}.gerai.localhost`, id, t),
      c.env.DB.prepare("UPDATE sessions SET active_tenant_id = ? WHERE token_hash = ?").bind(id, s.row.token_hash),
    ])
    const { vaultFor } = await import("../do/gerai-vault/stub")
    await vaultFor(c.env, id).migrate(id)
    return ok({ tenantId: id, slug }, 201)
  })
  // Local only: add a synthetic notification to the caller's gerai (renders `/notifikasi` states).
  r("POST", "/dev/notify", "app_member", "none", async (c) => {
    if (c.env.GX_ENV !== "local") return fail(404, "NOT_FOUND", "Alamat tidak ditemukan.")
    const b = await body(c)
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).addNotification(
      m.tenantId,
      { kind: "system", audience: b.audience === "owner" ? "owner" : "all", title: typeof b.title === "string" ? b.title : "Notifikasi contoh", body: typeof b.body === "string" ? b.body : null, link: typeof b.link === "string" ? b.link : null },
      typeof b.at === "number" ? b.at : now(),
    )
    return ok(r, 201)
  })

  return app
}
