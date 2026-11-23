// `/api/app/*` on app.geraiexpress.com (Hono). Every route is registered through `register()` with an auth level and
// a projection (spec 05 §4 gate 3). Unsafe methods require same-origin (CSRF); the tenant comes only from the session.
import { Hono, type Context, type MiddlewareHandler } from "hono"
import { acceptInvitation, completeSignup, createInvitation, login, requestPasswordReset, requestSignupOtp, resetPassword, verifySignupOtp, viewInvitation } from "../auth/flows"
import { clearSessionCookie, isSecureRequest, setSessionCookie } from "../auth/cookies"
import { sameOriginOk } from "../auth/csrf"
import { readSession, revokeSession, type Session } from "../auth/session"
import { checkTurnstile, turnstileDev } from "../auth/turnstile"
import { sha256Hex } from "../crypto"
import { AppError, fail, fromError, ok } from "../http/envelope"
import { hostOrigin, ipHash } from "../http/request"
import { ALLOWED_MIDDLEWARE, register, type AuthLevel } from "./registry"
import { dispatchDue } from "../email/mailer"
import { connectByok, submitApplication } from "../onboarding/service"
import { mengantarSettings, saveWebhookSecret } from "../webhooks/settings"
import { searchAreas } from "../couriers/areas"
import { projectFor } from "../dto/projection"
import { escposBytes, initials, labelsPdf, qrSvg, rollLines, rollText, suratJalanPdf } from "@gx/thermal-print"
import { resolvePartnerClient } from "../mengantar/factory"
import { cashierCard, frozenFrom, ownerCard, parseQuoteInput, runQuote } from "../pricing/quote/service"
import type { ContactOp, GeraiVaultDO } from "../do/gerai-vault"
import { publicationSeq, type DisplayState } from "../do/gerai-vault/customer-display"
import { STUCK_DAYS, TABS, type ListQuery, type Tab } from "../do/gerai-vault/listing"
import type { RecipientInput, SenderInput } from "../do/gerai-vault/contacts"
import { MEDIA_MAX_BYTES, MEDIA_PURPOSES, MEDIA_TYPES, mediaKeyFor, OWNER_MEDIA, QRIS_MAX_BYTES, signMediaUrl, sniffType, verifyMediaSignature, type MediaPurpose } from "../media"
import { listCouriers, updateCourier } from "../couriers/catalog"
import { enqueue, parseRow, parseRows } from "../bulk/service"
import { hashApiToken, newApiToken, parseScopes, SCOPES } from "../api-v1/keys"
import { CNAME_TARGET, domainRows, primaryHost, purgeHost, refreshHost, remedyOf, requestDomain } from "../hostnames/service"
import { CfError } from "../hostnames/cloudflare"
import { hit } from "../auth/throttle"
import { newToken } from "../auth/tokens"
import { buildGeraiStatus } from "../status/gerai"
import { platformHostOf } from "../host/lookup"
import { changePassword, confirmEmailChange, listSessions, requestEmailChange, revokeSessions, updateProfile } from "../auth/account"
import { templateCsv } from "@gx/domain/bulk"
import { periodFromParams, previousOf, resolveCustom, resolvePreset } from "@gx/domain/period"
import { vaultFor } from "../do/gerai-vault/stub"

export interface Membership {
  tenantId: string
  tenantName: string
  tenantSlug: string
  role: "gerai_admin" | "cashier"
}

type Vars = { session: Session; membership: Membership | null; rolledCookie: string | null }
export type AppCtx = Context<{ Bindings: Env; Variables: Vars }>

const turnstileOk = (c: AppCtx, token: unknown) => checkTurnstile(c.env, token, c.req.raw)

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
const COURIER_NAMES: Record<string, string> = { JT: "J&T", JNE: "JNE", SiCepat: "SiCepat", Sap: "SAP Express", iDexpress: "iDexpress", lion: "Lion Parcel", anteraja: "Anteraja", pos: "Pos Indonesia", spx: "SPX", ninja: "Ninja Xpress" }

/** Raw R2 object keys (`t/<tenant>/…`) never leave the Worker; a `has_<name>` flag replaces each one. */
function withoutStorageKeys<T>(v: T): T {
  if (Array.isArray(v)) return v.map(withoutStorageKeys) as T
  if (v === null || typeof v !== "object") return v
  const out: Record<string, unknown> = {}
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (k.endsWith("_r2_key")) out[`has_${k.slice(0, -7)}`] = x !== null && x !== undefined
    else out[k] = withoutStorageKeys(x)
  }
  return out as T
}

export function appApi(): Hono<{ Bindings: Env; Variables: Vars }> {
  const app = new Hono<{ Bindings: Env; Variables: Vars }>().basePath("/api/app")
  // Handlers return plain Responses (envelope helpers); carry headers the guard set on the context (rolling cookie).
  const rolling: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
    await next()
    const rolled = c.get("rolledCookie")
    if (rolled && c.res) {
      const res = new Response(c.res.body, c.res)
      if (!res.headers.has("set-cookie")) res.headers.append("set-cookie", rolled)
      c.res = res
    }
  }
  ALLOWED_MIDDLEWARE.add(rolling)
  app.use(rolling)
  app.onError((err) => {
    if (!(err instanceof AppError)) console.error("APP_API_ERROR", err instanceof Error ? err.message : String(err))
    return fromError(err)
  })
  app.notFound(() => fail(404, "NOT_FOUND", "Alamat tidak ditemukan."))
  const r = (method: "GET" | "POST", path: string, auth: AuthLevel, projection: "none" | "self" | "role", handler: (c: AppCtx) => Promise<Response>) =>
    register(app, { context: "app", method, path, auth, projection }, guard, (c) => handler(c as AppCtx))

  // Public auth page config (spec 05 §1): the Turnstile site key the browser renders; null = local test keys (no widget).
  r("GET", "/auth/config", "public", "none", async (c) => ok({ turnstileSiteKey: turnstileDev(c.env) ? null : c.env.TURNSTILE_SITE_KEY || null }))

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
    if (!(await turnstileOk(c, b.turnstileToken))) throw new AppError(400, "TURNSTILE_FAILED", "Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi.")
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
    const res = await acceptInvitation(c.env, { token: c.req.param("token"), name: b.name, password: b.password, deviceHash: await deviceHash(c), ipHash: await ipHash(c.env.AUTH_SESSION_PEPPER, c.req.raw), userAgent: c.req.header("user-agent") ?? null, now: now() })
    return ok({ userId: res.userId }, 201, { "set-cookie": setSessionCookie("app", isSecureRequest(c.req.raw, c.env.GX_ENV), res.sessionToken, res.maxAgeSeconds) })
  })

  // Outlet application (PR-01): pickup area search, submit, status.
  r("GET", "/onboarding/areas", "app_session", "none", async (c) => ok({ items: (await searchAreas(c.env, c.req.query("q") ?? "")).items }))
  r("POST", "/onboarding/application", "app_session", "self", async (c) => {
    const b = await body(c)
    const res = await submitApplication(c.env, c.get("session").user.id, b as never, now(), hostOrigin(c.req.raw))
    c.executionCtx.waitUntil(dispatchDue(c.env).then(() => undefined))
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
    const [notes, webhook, memberships, miniSiteHost] = await Promise.all([
      vault.listNotifications(m.tenantId, { userId: s.user.id, role: m.role }, 1),
      m.role === "gerai_admin" ? vault.webhookStatus(m.tenantId) : Promise.resolve(null),
      c.env.DB.prepare("SELECT t.id, t.name, t.slug FROM tenant_members tm JOIN tenants t ON t.id = tm.tenant_id WHERE tm.user_id = ? AND tm.status = 'active' AND t.status = 'active' ORDER BY t.name").bind(s.user.id).all<{ id: string; name: string; slug: string }>(),
      primaryHost(c.env, m.tenantId, m.tenantSlug),
    ])
    const menus = ["dashboard", "buat-pengiriman", "kiriman", "kontak", ...(m.role === "gerai_admin" ? ["keuangan"] : []), "pengaturan"]
    return ok(
      projectFor(m.role, {
        user: { id: s.user.id, name: s.user.name, email: s.user.email },
        tenant: { id: m.tenantId, name: m.tenantName, slug: m.tenantSlug, miniSiteHost },
        role: m.role,
        menus,
        badges: { kiriman: 0, notifications: notes.ok ? notes.value.unread : 0 },
        hints: { mengantarWebhook: webhook && webhook.ok && webhook.value && webhook.value.webhookState !== "active" ? webhook.value.webhookState : null, sandboxTools: c.env.GX_ENV !== "production" && m.role === "gerai_admin" },
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

  // Quotes (TASK-303). `POST /quotes` is `Cek Ongkir Cepat`: no slug, no draft, nothing stored except the discount
  // observations. `POST /quotes/freeze` re-runs the quote on the server, allocates the INV slug and freezes the
  // chosen card (create-order sends those values unchanged, TASK-304). Kasir responses carry customer prices only.
  const quoteOrigin = async (c: AppCtx) => {
    const m = c.get("membership")!
    const vault = vaultFor(c.env, m.tenantId)
    const o = await vault.defaultOutlet(m.tenantId)
    if (!o.ok) throw new AppError(503, "TENANT_NOT_READY", "Data gerai sedang diperbarui. Coba lagi sebentar lagi.")
    if (o.value?.areaId) return o.value.areaId
    // Gerai approved before the default outlet existed: take the pickup point from the approved application once.
    const a = await c.env.DB.prepare("SELECT outlet_json FROM tenant_applications WHERE tenant_id = ? AND state = 'approved' ORDER BY decided_at DESC LIMIT 1").bind(m.tenantId).first<{ outlet_json: string }>()
    const out = a ? (JSON.parse(a.outlet_json) as { name?: string; picName?: string; picPhone?: string; areaId?: string; areaLabel?: string; streetAddress?: string; postalCode?: string | null }) : null
    if (!out?.areaId) throw new AppError(409, "NO_PICKUP_AREA", "Titik jemput gerai belum diatur.")
    await vault.upsertDefaultOutlet(m.tenantId, { name: out.name ?? m.tenantName, picName: out.picName, picPhone: out.picPhone, areaId: out.areaId, areaLabel: out.areaLabel, street: out.streetAddress, postalCode: out.postalCode ?? null })
    return out.areaId
  }
  r("POST", "/quotes", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const input = parseQuoteInput(await body(c), await quoteOrigin(c))
    const q = await runQuote(c.env, m.tenantId, input, now())
    const view = m.role === "gerai_admin" ? q.cards.map(ownerCard) : q.cards.map(cashierCard)
    return ok(projectFor(m.role, { cards: view, medals: q.medals, quotedAt: q.quotedAt, expiresAt: q.expiresAt }))
  })
  r("POST", "/quotes/freeze", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const b = await body(c)
    const input = parseQuoteInput(b, await quoteOrigin(c))
    const q = await runQuote(c.env, m.tenantId, input, now())
    const card = q.cards.find((x) => x.serviceCode === b.serviceCode && x.available)
    if (!card) throw new AppError(409, "SERVICE_UNAVAILABLE", "Layanan ini tidak tersedia lagi. Pilih ekspedisi lain.")
    const vault = vaultFor(c.env, m.tenantId)
    // A claimed QR pre-booking keeps its own INV (TASK-501): the quote freezes under the same slug.
    const qr = typeof b.slug === "string" && /^[23456789abcdefghjkmnpqrstvwxyz]{7}$/.test(b.slug) ? b.slug : null
    if (qr) {
      const claim = await vault.claimMinisiteDraft(m.tenantId, qr, c.get("session").user.id)
      if (!claim.ok) return vaultErr(claim)
    }
    const slug = qr ? { ok: true as const, value: qr } : await vault.allocateSlug(m.tenantId, "draft")
    if (!slug.ok) throw new AppError(503, "TENANT_NOT_READY", "Data gerai sedang diperbarui. Coba lagi sebentar lagi.")
    const frozen = await vault.freezeQuote(m.tenantId, frozenFrom(slug.value, q, card))
    if (!frozen.ok && frozen.refused === "SHIPMENT_LOCKED") throw new AppError(409, "SHIPMENT_LOCKED", "Kiriman ini sudah dibayar, diterbitkan, atau sedang diproses. Buka kiriman untuk melanjutkan.")
    if (!frozen.ok) throw new AppError(503, "TENANT_NOT_READY", "Data gerai sedang diperbarui. Coba lagi sebentar lagi.")
    const view = m.role === "gerai_admin" ? ownerCard(card) : cashierCard(card)
    return ok(projectFor(m.role, { slug: slug.value, quoteId: frozen.value, card: view, expiresAt: q.expiresAt }), 201)
  })

  // Checkout, payment record, dispatch, cancellation (TASK-304). All state changes run in the tenant object; the
  // client sends an Idempotency-Key for money events. Kasir responses never contain cost or margin (projection).
  const slugParam = (c: AppCtx) => {
    const v = (c.req.param("slug") ?? "").toLowerCase()
    if (!/^[0-9a-hjkmnp-tv-z]{7}$/.test(v)) throw new AppError(404, "SHIPMENT_NOT_FOUND", "Kiriman tidak ditemukan.")
    return v
  }
  const vaultErr = (r: { refused?: string; error?: { status: number; code: string; message: string; fields?: Record<string, string> } }): never => {
    if (r.error) throw new AppError(r.error.status, r.error.code, r.error.message, r.error.fields ?? {})
    throw new AppError(503, "TENANT_NOT_READY", "Data gerai sedang diperbarui. Coba lagi sebentar lagi.")
  }
  const detail = async (c: AppCtx, slug: string) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).shipmentDetail(m.tenantId, slug, c.get("session").user.id)
    if (!r.ok) return vaultErr(r)
    if (!r.value) throw new AppError(404, "SHIPMENT_NOT_FOUND", "Kiriman tidak ditemukan.")
    const v = r.value
    // Kasir: no cost/margin/discount; owner sees the frozen cost and estimated margin.
    // `cod_credit_settled` is the role-safe boolean the counter needs (the amount itself is owner-only).
    const shipment = { ...v.shipment, effective_gerai_cost_idr: v.quote?.effective_gerai_cost_idr, estimated_profit_idr: v.quote?.estimated_margin_idr, cod_credit_settled: v.shipment.reconciled_provider_cod_credit_idr !== null && v.shipment.reconciled_provider_cod_credit_idr !== undefined }
    return ok(projectFor(m.role, { shipment, quote: v.quote, sender: v.sender, recipient: v.recipient, receipts: v.receipts, events: v.events, preflight: v.preflight }))
  }
  const idemKey = (c: AppCtx) => {
    const k = c.req.header("idempotency-key") ?? ""
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(k)) throw new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "Permintaan tidak lengkap. Muat ulang halaman lalu coba lagi.")
    return k
  }
  // QR pre-booking from the mini-site (TASK-501): the counter opens it, contacts are created/reused, the INV keeps
  // its slug. Returns what the quote form needs; the counter then freezes with `{ slug }` and checks out normally.
  r("POST", "/minisite-drafts/:slug/claim", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).claimMinisiteDraft(m.tenantId, slugParam(c), c.get("session").user.id)
    if (!r.ok) return vaultErr(r)
    const d = r.value.draft
    return ok({ slug: d.slug, senderId: r.value.senderId, recipientId: r.value.recipientId, destination: { id: d.recipient_area_id, label: d.recipient_area_label ?? "" }, weightGram: d.weight_gram, cod: d.cod === 1, codGoodsIdr: d.cod_goods_idr, content: d.content })
  })
  r("GET", "/shipments/:slug", "app_member", "role", (c) => detail(c, slugParam(c)))

  // Shift drawer and sender COD payout (TASK-307, spec 03 §1.2, §4). Never via API key or MCP (session routes only).
  const actorOf = (c: AppCtx) => ({ userId: c.get("session").user.id, role: c.get("membership")!.role })
  const shift = async (c: AppCtx, op: Parameters<GeraiVaultDO["shiftOp"]>[2]) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).shiftOp(m.tenantId, actorOf(c), op)
    if (!r.ok) return vaultErr(r)
    return ok(projectFor(m.role, r.value))
  }
  r("GET", "/shift", "app_member", "role", (c) => shift(c, { op: "current" }))
  r("GET", "/shifts", "app_member", "role", (c) => shift(c, { op: "list" }))
  r("POST", "/shift/open", "app_member", "role", async (c) => shift(c, { op: "open", floatIdr: (await body(c)).openingFloatIdr }))
  r("POST", "/shift/close", "app_member", "role", async (c) => {
    const b = await body(c)
    return shift(c, { op: "close", countedCashIdr: b.countedCashIdr, reasonCode: b.reasonCode, note: b.note })
  })
  r("POST", "/shipments/:slug/cod-payout", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const b = await body(c)
    const slug = slugParam(c)
    const op = b.op === "void" ? { op: "void" as const, slug, receiptId: String(b.receiptId ?? ""), reason: b.reason, idempotencyKey: idemKey(c) } : { op: "payout" as const, slug, amountIdr: b.amountIdr, method: b.method, override: b.override, idempotencyKey: idemKey(c) }
    const r = await vaultFor(c.env, m.tenantId).payoutOp(m.tenantId, actorOf(c), op)
    if (!r.ok) return vaultErr(r)
    return ok(r.value)
  })

  // Kendala & Klaim (TASK-405, spec 04 §3): buckets, claim records + packet; outcomes and conflicts are owner-only.
  const BUCKETS = ["tidak_bergerak", "gagal_antar", "selisih_berat", "bisa_klaim", "bertentangan", "perlu_tindakan"] as const
  const exceptions = async (c: AppCtx, op: Parameters<GeraiVaultDO["exceptionsOp"]>[2]) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).exceptionsOp(m.tenantId, { userId: c.get("session").user.id, role: m.role }, op)
    if (!r.ok) return vaultErr(r)
    return ok(projectFor(m.role, r.value))
  }
  r("GET", "/exceptions", "app_member", "role", (c) => {
    const b = c.req.query("bucket")
    return exceptions(c, { op: "list", bucket: (BUCKETS as readonly string[]).includes(b ?? "") ? (b as (typeof BUCKETS)[number]) : "tidak_bergerak" })
  })
  r("POST", "/shipments/:slug/claim", "app_member", "role", async (c) => {
    const b = await body(c)
    return exceptions(c, { op: "claim", slug: slugParam(c), kind: b.kind, note: b.note, evidenceIds: Array.isArray(b.evidenceIds) ? (b.evidenceIds as unknown[]).filter((x): x is string => typeof x === "string") : [] })
  })
  r("POST", "/claims/:id/status", "app_member", "role", async (c) => exceptions(c, { op: "move", id: c.req.param("id") ?? "", to: (await body(c)).status }))
  r("POST", "/shipments/:slug/conflict-note", "app_owner", "role", async (c) => {
    const b = await body(c)
    return exceptions(c, { op: "conflict", slug: slugParam(c), note: b.note, resolve: b.resolve === true })
  })
  r("GET", "/claims/:id/packet", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).claimPacket(m.tenantId, c.req.param("id") ?? "")
    if (!r.ok) return vaultErr(r)
    if (!r.value) throw new AppError(404, "CLAIM_NOT_FOUND", "Klaim tidak ditemukan.")
    const v = r.value
    // Evidence is served through short-lived signed media links (never raw R2 keys).
    const media = await vaultFor(c.env, m.tenantId).mediaIdsForKeys(m.tenantId, v.evidenceKeys)
    const links = media.ok ? await Promise.all(media.value.map((id) => signMediaUrl(c.env.KEK_SECRET, m.tenantId, id, now()))) : []
    const { evidenceKeys: _k, ...rest } = v
    void _k
    return ok(projectFor(m.role, { ...rest, evidence: links }))
  })

  // Meja Retur (TASK-404, spec 04 §2, ADR-0005): Kasir and owner; ID override is owner-only (checked in the object).
  const returns = async (c: AppCtx, op: Parameters<GeraiVaultDO["returnsOp"]>[2]) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).returnsOp(m.tenantId, { userId: c.get("session").user.id, role: m.role }, op)
    if (!r.ok) return vaultErr(r)
    return ok(projectFor(m.role, withoutStorageKeys(r.value)))
  }
  r("GET", "/returns", "app_member", "role", (c) => returns(c, { op: "desk" }))
  r("POST", "/returns/intake", "app_member", "role", async (c) => {
    const b = await body(c)
    return returns(c, { op: "intake", code: String(b.code ?? "").slice(0, 60), condition: b.condition, photoId: typeof b.photoId === "string" ? b.photoId : null, note: b.note })
  })
  r("POST", "/returns/:slug/code", "app_member", "role", (c) => returns(c, { op: "code", slug: slugParam(c) }))
  r("POST", "/returns/:slug/handback", "app_member", "role", async (c) => {
    const b = await body(c)
    return returns(c, { op: "handback", slug: slugParam(c), code: b.code, override: b.override && typeof b.override === "object" ? { reason: (b.override as { reason?: unknown }).reason } : undefined })
  })

  // Pickup & Manifest / Surat Jalan (TASK-403, spec 04 §1): Kasir and owner; scans and handover run in the object.
  const pickup = async (c: AppCtx, op: Parameters<GeraiVaultDO["pickupOp"]>[2]) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).pickupOp(m.tenantId, c.get("session").user.id, op)
    if (!r.ok) return vaultErr(r)
    return ok(projectFor(m.role, withoutStorageKeys(r.value)))
  }
  const batchId = (c: AppCtx) => {
    const v = c.req.param("batch") ?? ""
    if (!/^[0-9a-f-]{36}$/.test(v)) throw new AppError(404, "BATCH_NOT_FOUND", "Manifest tidak ditemukan.")
    return v
  }
  r("GET", "/pickup", "app_member", "role", (c) => pickup(c, { op: "queue" }))
  r("GET", "/pickup/history", "app_member", "role", (c) => pickup(c, { op: "history" }))
  r("POST", "/pickup/open", "app_member", "role", async (c) => pickup(c, { op: "open", courier: String((await body(c)).courier ?? "").slice(0, 20) }))
  r("GET", "/pickup/:batch", "app_member", "role", (c) => pickup(c, { op: "view", batchId: batchId(c) }))
  r("POST", "/pickup/:batch/scan", "app_member", "role", async (c) => pickup(c, { op: "scan", batchId: batchId(c), code: String((await body(c)).code ?? "").slice(0, 60) }))
  r("POST", "/pickup/:batch/unscan", "app_member", "role", async (c) => pickup(c, { op: "unscan", batchId: batchId(c), slug: String((await body(c)).slug ?? "").slice(0, 7) }))
  r("POST", "/pickup/:batch/handover", "app_member", "role", async (c) => {
    const b = await body(c)
    return pickup(c, { op: "handover", batchId: batchId(c), driverName: b.driverName, driverPhone: b.driverPhone, vehicleNo: b.vehicleNo, signatureId: typeof b.signatureId === "string" ? b.signatureId : null, photoId: typeof b.photoId === "string" ? b.photoId : null, mode: b.mode === "dropped_at_branch" ? "dropped_at_branch" : "handed_over" })
  })
  r("GET", "/pickup/:batch/surat-jalan.pdf", "app_member", "none", async (c) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).manifestData(m.tenantId, batchId(c))
    if (!r.ok) return vaultErr(r)
    if (!r.value) throw new AppError(404, "BATCH_NOT_FOUND", "Manifest tidak ditemukan.")
    const v = r.value.batch
    const fmt = (ms: number) => `${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(ms)} WIB`
    const pdf = suratJalanPdf({
      outlet: r.value.outlet,
      courierName: COURIER_NAMES[v.courier_code] ?? v.courier_code,
      batchId: v.id,
      handedOverAt: fmt(v.handed_over_at ?? Date.now()),
      driver: { name: v.driver_name, phone: v.driver_phone, vehicleNo: v.driver_vehicle_no },
      mode: v.status === "dropped_at_branch" ? "dropped_at_branch" : "handed_over",
      items: v.items.map((i) => ({ inv: i.slug, awb: i.awb ?? "-", recipientInitials: initials(i.recipient), weightGram: i.weight_gram })),
    })
    return new Response(pdf, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="surat-jalan-${v.courier_code}.pdf"`, "cache-control": "no-store" } })
  })

  // Keuangan (TASK-401, spec 09): owner only; manual sync limited to 1 per 30 s inside the tenant object.
  r("GET", "/finance", "app_owner", "role", async (c) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).financeView(m.tenantId)
    if (!r.ok) return vaultErr(r)
    return ok(r.value)
  })
  r("POST", "/finance/discrepancies/:id/resolve", "app_owner", "role", async (c) => {
    const m = c.get("membership")!
    const reason = String((await body(c)).reason ?? "").trim()
    if (reason.length < 5 || reason.length > 200) throw new AppError(422, "REASON_REQUIRED", "Tulis alasan (5–200 huruf), misalnya sudah dicek di Mengantar.", { reason: "Tulis alasan." })
    const r = await vaultFor(c.env, m.tenantId).resolveDiscrepancy(m.tenantId, c.req.param("id") ?? "", c.get("session").user.id, reason)
    if (!r.ok) return vaultErr(r)
    if (!r.value.resolved) throw new AppError(404, "NOT_FOUND", "Selisih tidak ditemukan atau sudah selesai.")
    return ok(r.value)
  })
  r("POST", "/finance/sync", "app_owner", "role", async (c) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).financeSync(m.tenantId, "manual")
    if (!r.ok) return vaultErr(r)
    return ok(r.value)
  })

  // Kiriman list (TASK-311, DEC-213/220): tabs with counts, search, period (default 30 days, WIB), courier and print
  // filters, keyset pages. Kasir rows lose cost/margin through the projection; the CSV is owner-only.
  const listQuery = (c: AppCtx) => {
    const t = now()
    const dari = c.req.query("dari")
    const sampai = c.req.query("sampai")
    if (dari && sampai) {
      const cst = resolveCustom(dari, sampai, t)
      if (!cst.ok) throw new AppError(422, `PERIOD_${cst.error}`, cst.message, { periode: cst.message })
    }
    const period = c.req.query("periode") || (dari && sampai) ? periodFromParams({ periode: c.req.query("periode"), dari, sampai }, t) : resolvePreset("30d", t)
    const tab = (TABS as readonly string[]).includes(c.req.query("tab") ?? "") ? (c.req.query("tab") as Tab) : "semua"
    const printed = c.req.query("cetak") === "sudah" ? "sudah" : c.req.query("cetak") === "belum" ? "belum" : "semua"
    const courier = /^[A-Za-z&]{2,20}$/.test(c.req.query("kurir") ?? "") ? c.req.query("kurir")! : null
    // DEC-251C `?macet=2|3|5|7`: only issued, still-moving shipments without a courier scan for that many days.
    const macet = Number(c.req.query("macet"))
    const stuckDays = (STUCK_DAYS as readonly number[]).includes(macet) ? (macet as (typeof STUCK_DAYS)[number]) : 0
    return { tab, q: (c.req.query("q") ?? "").slice(0, 60), fromMs: period.fromMs, toMs: period.toMs, courier, printed, cursor: c.req.query("cursor") ?? null, limit: Number(c.req.query("limit") ?? 50) || 50, stuckDays } satisfies ListQuery
  }
  r("GET", "/shipments", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).shipmentList(m.tenantId, listQuery(c))
    if (!r.ok) return vaultErr(r)
    return ok(projectFor(m.role, r.value))
  })
  r("GET", "/shipments-export.csv", "app_owner", "none", async (c) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).shipmentCsv(m.tenantId, listQuery(c))
    if (!r.ok) return vaultErr(r)
    return new Response(r.value.csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="kiriman-${m.tenantSlug}.csv"`, "cache-control": "no-store", "x-rows": String(r.value.rows), "x-truncated": String(r.value.truncated) } })
  })

  // Dashboard (TASK-309, PR-18, DEC-213/221): the period comes from the URL (WIB presets or `dari`/`sampai`, max 180
  // days, default 7 days). Owner → KPIs/charts; Kasir → counter tasks only (no money; the projection strips the rest).
  r("GET", "/dashboard", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const t = now()
    const dari = c.req.query("dari")
    const sampai = c.req.query("sampai")
    if (dari && sampai) {
      const cst = resolveCustom(dari, sampai, t)
      if (!cst.ok) throw new AppError(422, `PERIOD_${cst.error}`, cst.message, { periode: cst.message })
    }
    const period = periodFromParams({ periode: c.req.query("periode"), dari, sampai }, t)
    const r = await vaultFor(c.env, m.tenantId).dashboard(m.tenantId, { role: m.role, userId: c.get("session").user.id, period, previous: previousOf(period), today: resolvePreset("today", t) })
    if (!r.ok) return vaultErr(r)
    return ok(projectFor(m.role, { ...r.value, period }))
  })

  // Paket Massal, Riwayat Massal, Cek Resi (TASK-308, spec 03 §1.3–1.4, DEC-229). Rows are re-validated here; area
  // match + quote run in the `gx-bulk` Queue; INVs dispatch serialized inside the tenant object.
  const batchParam = (c: AppCtx) => {
    const v = c.req.param("batch") ?? ""
    if (!/^[0-9a-f-]{36}$/.test(v)) throw new AppError(404, "BATCH_NOT_FOUND", "Batch tidak ditemukan.")
    return v
  }
  const bulkView = async (c: AppCtx, id: string) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).bulkView(m.tenantId, id)
    if (!r.ok) return vaultErr(r)
    if (!r.value) throw new AppError(404, "BATCH_NOT_FOUND", "Batch tidak ditemukan.")
    const v = r.value
    // Kasir: customer prices only (no margin) — the projection strips `estimated_margin_idr`.
    const rows = v.rows.map((x) => ({ ...x, raw_json: undefined, quote_json: undefined, errors: x.errors_json ? (JSON.parse(x.errors_json) as string[]) : [], candidates: x.candidates_json ? (JSON.parse(x.candidates_json) as unknown[]) : [], errors_json: undefined, candidates_json: undefined, raw: JSON.parse(x.raw_json) as Record<string, string> }))
    return ok(projectFor(m.role, { batch: v.batch, sender: v.sender, rows, totals: v.totals }))
  }
  r("GET", "/bulk/template.csv", "app_member", "none", async () => new Response(templateCsv(), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="template-paket-massal.csv"', "cache-control": "no-store" } }))
  r("GET", "/bulk/services", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const [cat, prefs] = await Promise.all([
      c.env.DB.prepare("SELECT service_code, courier_code, display_name, service_class, cod_supported FROM courier_service_catalog WHERE is_active = 1 ORDER BY sort_order").all<{ service_code: string; courier_code: string; display_name: string; service_class: string; cod_supported: number }>(),
      vaultFor(c.env, m.tenantId).courierPrefs(m.tenantId),
    ])
    const off = new Set(prefs.ok ? prefs.value.filter((p) => p.enabled === 0).map((p) => p.courier_code) : [])
    return ok({ items: cat.results.filter((x) => !off.has(x.courier_code)).map((x) => ({ code: x.service_code, name: x.display_name, cargo: x.service_class === "cargo", cod: x.cod_supported === 1 })) })
  })
  r("GET", "/bulk", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).bulkList(m.tenantId)
    if (!r.ok) return vaultErr(r)
    return ok(projectFor(m.role, { items: r.value }))
  })
  r("POST", "/bulk", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const b = await body(c)
    const { source, rows } = parseRows(b)
    const serviceCode = typeof b.serviceCode === "string" ? b.serviceCode : ""
    const svc = await c.env.DB.prepare("SELECT service_code FROM courier_service_catalog WHERE service_code = ? AND is_active = 1").bind(serviceCode).first()
    if (!svc) throw new AppError(422, "INVALID_SERVICE", "Pilih ekspedisi untuk semua baris.", { serviceCode: "Pilih ekspedisi." })
    const codFeeMode = ["none", "buyer_bears_fee", "sender_bears_fee", "cod_all_in"].includes(String(b.codFeeMode)) ? String(b.codFeeMode) : "none"
    const maskPreset = ["standar_gerai", "dropship_toko", "privasi_penerima_cod", "full_nama_gerai"].includes(String(b.maskPreset)) ? String(b.maskPreset) : "standar_gerai"
    const fileName = typeof b.fileName === "string" ? b.fileName.replace(/[^\w .()-]/g, "").slice(0, 80) || null : null
    const r = await vaultFor(c.env, m.tenantId).bulkCreate(m.tenantId, { senderId: String(b.senderId ?? ""), source, fileName, maskPreset, codFeeMode, serviceCode, actorId: c.get("session").user.id }, rows)
    if (!r.ok) return vaultErr(r)
    c.executionCtx.waitUntil(enqueue(c.env, { kind: "check", tenant_id: m.tenantId, batch_id: r.value.id }))
    return ok({ id: r.value.id }, 201)
  })
  r("GET", "/bulk/:batch", "app_member", "role", (c) => bulkView(c, batchParam(c)))
  r("POST", "/bulk/:batch/recheck", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const id = batchParam(c)
    c.executionCtx.waitUntil(enqueue(c.env, { kind: "check", tenant_id: m.tenantId, batch_id: id }))
    return bulkView(c, id)
  })
  r("POST", "/bulk/:batch/rows/:row", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const id = batchParam(c)
    const rowNo = Number(c.req.param("row"))
    if (!Number.isSafeInteger(rowNo) || rowNo < 1 || rowNo > 200) throw new AppError(404, "ROW_NOT_FOUND", "Baris tidak ditemukan.")
    const b = await body(c)
    const vault = vaultFor(c.env, m.tenantId)
    if (b.remove === true) {
      const x = await vault.bulkRemoveRow(m.tenantId, id, rowNo)
      if (!x.ok) return vaultErr(x)
    } else {
      const parsed = parseRow((b.cells && typeof b.cells === "object" ? b.cells : {}) as Record<string, unknown>, rowNo)
      const area = typeof b.areaId === "string" && /^[0-9a-f]{24}$/.test(b.areaId) ? { id: b.areaId, label: typeof b.areaLabel === "string" ? b.areaLabel.slice(0, 160) : "" } : null
      const x = await vault.bulkEditRow(m.tenantId, id, rowNo, parsed, area)
      if (!x.ok) return vaultErr(x)
      c.executionCtx.waitUntil(enqueue(c.env, { kind: "check", tenant_id: m.tenantId, batch_id: id }))
    }
    return bulkView(c, id)
  })
  r("POST", "/bulk/:batch/create", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const id = batchParam(c)
    const b = await body(c)
    const x = await vaultFor(c.env, m.tenantId).bulkMaterialize(m.tenantId, id, c.get("session").user.id, b.prohibitedAck === true)
    if (!x.ok) {
      if (x.error?.code === "QUOTE_EXPIRED") c.executionCtx.waitUntil(enqueue(c.env, { kind: "check", tenant_id: m.tenantId, batch_id: id }))
      return vaultErr(x)
    }
    c.executionCtx.waitUntil(enqueue(c.env, { kind: "dispatch", tenant_id: m.tenantId, batch_id: id }))
    return bulkView(c, id)
  })
  r("POST", "/bulk/:batch/pay", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const id = batchParam(c)
    const b = await body(c)
    const x = await vaultFor(c.env, m.tenantId).bulkPay(m.tenantId, { batchId: id, method: b.method, cashReceivedIdr: b.cashReceivedIdr, idempotencyKey: idemKey(c), actorId: c.get("session").user.id })
    if (!x.ok) return vaultErr(x)
    return ok(x.value)
  })
  r("POST", "/bulk/:batch/cancel-unissued", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const x = await vaultFor(c.env, m.tenantId).bulkCancelUnissued(m.tenantId, batchParam(c), c.get("session").user.id)
    if (!x.ok) return vaultErr(x)
    return ok(x.value)
  })
  r("GET", "/track", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const q = (c.req.query("q") ?? "").slice(0, 40)
    if (q.trim().length < 4) throw new AppError(422, "QUERY_TOO_SHORT", "Ketik nomor INV, resi atau HP penerima.", { q: "Minimal 4 karakter." })
    const x = await vaultFor(c.env, m.tenantId).trackLookup(m.tenantId, q)
    if (!x.ok) return vaultErr(x)
    return ok(x.value)
  })

  // Printing (TASK-306, DEC-224, DEC-229): exact-size PDFs (PC-first), 58 mm ESC/POS bytes, bulk ≤ 50. The first
  // print records `first_printed_at`; reprints need a reason (audited). Label data comes from immutable snapshots.
  const trackingHost = (c: AppCtx) => primaryHost(c.env, c.get("membership")!.tenantId, c.get("membership")!.tenantSlug)
  const FORMATS = ["label_10x15_with_stub", "label_10x10", "label_10x15", "roll_58mm"] as const
  // Pengaturan › Mini-Site › Domain Sendiri (TASK-505, spec 11 §5–6): owner-only; Cloudflare calls happen in the
  // queue/cron, never inline in this request (except `Periksa Lagi`, one PATCH/GET for this gerai's own host).
  const domainView = async (c: AppCtx) => {
    const m = c.get("membership")!
    const [t, rows] = await Promise.all([
      c.env.DB.prepare("SELECT custom_domain_enabled FROM tenants WHERE id = ?").bind(m.tenantId).first<{ custom_domain_enabled: number }>(),
      domainRows(c.env, m.tenantId),
    ])
    return {
      pro: t?.custom_domain_enabled === 1,
      platformHost: platformHostOf(c.env, m.tenantSlug),
      cnameTarget: CNAME_TARGET(c.env),
      primaryHost: await primaryHost(c.env, m.tenantId, m.tenantSlug),
      domains: rows.map((r) => ({
        hostname: r.hostname,
        role: r.role,
        state: r.state,
        branch: r.dns_branch,
        sslMethod: r.ssl_method,
        cfStatus: r.cf_status,
        sslStatus: r.cf_ssl_status,
        records: r.dns_records_json ? (JSON.parse(r.dns_records_json) as unknown) : null,
        remedy: remedyOf(r),
        createdAt: r.created_at,
        lastCheckedAt: r.last_checked_at,
        activatedAt: r.activated_at,
      })),
    }
  }
  r("GET", "/custom-domain", "app_owner", "role", async (c) => ok(await domainView(c)))
  r("POST", "/custom-domain", "app_owner", "role", async (c) => {
    const m = c.get("membership")!
    const b = await body(c)
    await requestDomain(c.env, m.tenantId, b.hostname, b.rootChoice, now())
    return ok(await domainView(c), 201)
  })
  r("POST", "/custom-domain/check", "app_owner", "role", async (c) => {
    const m = c.get("membership")!
    const b = await body(c)
    const lim = await hit(c.env.DB, `cd-check:${m.tenantId}`, 6, 60_000, now())
    if (!lim.allowed) throw new AppError(429, "CHECK_RATE_LIMITED", "Tunggu sebentar sebelum memeriksa lagi.")
    const method = b.method === "txt" || b.method === "http" ? b.method : undefined
    try {
      for (const d of await domainRows(c.env, m.tenantId)) await refreshHost(c.env, d.hostname, now(), { restart: true, method, probeFetch: (u) => fetch(u, { redirect: "manual", signal: AbortSignal.timeout(10_000) }) })
    } catch (e) {
      if (e instanceof CfError) throw new AppError(503, "CF_UNAVAILABLE", "Pemeriksaan domain sedang tidak tersedia. Coba lagi beberapa menit lagi.")
      throw e
    }
    return ok(await domainView(c))
  })
  r("POST", "/custom-domain/remove", "app_owner", "role", async (c) => {
    const m = c.get("membership")!
    const b = await body(c)
    const rows = await domainRows(c.env, m.tenantId)
    if (!rows.length) throw new AppError(404, "NO_DOMAIN", "Belum ada domain sendiri.")
    const confirmName = (rows.find((x) => x.role === "primary") ?? rows[0]!).hostname
    if (b.confirm !== confirmName) throw new AppError(422, "CONFIRM_REQUIRED", "Ketik nama domain untuk konfirmasi.", { confirm: "Ketik nama domain persis." })
    try {
      for (const d of rows) await purgeHost(c.env, d.hostname, now())
    } catch (e) {
      if (e instanceof CfError) throw new AppError(503, "CF_UNAVAILABLE", "Domain belum bisa dihapus sekarang. Coba lagi beberapa menit lagi.")
      throw e
    }
    return ok(await domainView(c))
  })

  // Pengaturan › API & MCP (TASK-503, spec 08 §2): owner-only key management; the token is shown once.
  r("GET", "/api-keys", "app_owner", "role", async (c) => {
    const m = c.get("membership")!
    const rows = await c.env.DB.prepare("SELECT id, name, token_prefix, scopes_json, daily_issue_cap_idr, created_at, last_used_at, revoked_at FROM tenant_api_keys WHERE tenant_id = ? ORDER BY revoked_at IS NOT NULL, created_at DESC").bind(m.tenantId).all<{ id: string; name: string; token_prefix: string; scopes_json: string; daily_issue_cap_idr: number | null; created_at: number; last_used_at: number | null; revoked_at: number | null }>()
    return ok({ items: rows.results.map((r) => ({ ...r, scopes: JSON.parse(r.scopes_json) as string[], scopes_json: undefined })), scopes: SCOPES })
  })
  r("POST", "/api-keys", "app_owner", "role", async (c) => {
    const m = c.get("membership")!
    const b = await body(c)
    const name = typeof b.name === "string" ? b.name.replace(/\s+/g, " ").trim() : ""
    const scopes = parseScopes(b.scopes)
    const fields: Record<string, string> = {}
    if (name.length < 2 || name.length > 60) fields.name = "Nama kunci 2–60 huruf."
    if (!scopes) fields.scopes = "Pilih minimal satu izin."
    const cap = b.dailyIssueCapIdr === null || b.dailyIssueCapIdr === undefined || b.dailyIssueCapIdr === "" ? null : Number(b.dailyIssueCapIdr)
    if (scopes?.includes("shipments:issue") && (cap === null || !Number.isSafeInteger(cap) || cap < 10_000 || cap > 100_000_000)) fields.dailyIssueCapIdr = "Batas harian Rp10.000–Rp100.000.000 wajib untuk izin terbitkan resi."
    if (Object.keys(fields).length) throw new AppError(422, "INVALID_API_KEY", Object.values(fields)[0]!, fields)
    const live = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM tenant_api_keys WHERE tenant_id = ? AND revoked_at IS NULL").bind(m.tenantId).first<{ n: number }>()
    if ((live?.n ?? 0) >= 10) throw new AppError(409, "TOO_MANY_KEYS", "Maksimal 10 kunci aktif. Cabut kunci yang tidak dipakai.")
    const token = newApiToken()
    const id = crypto.randomUUID()
    await c.env.DB.prepare("INSERT INTO tenant_api_keys (id, tenant_id, name, token_hash, token_prefix, scopes_json, daily_issue_cap_idr, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, m.tenantId, name, await hashApiToken(c.env.AUTH_SESSION_PEPPER, token), token.slice(0, 12), JSON.stringify(scopes), scopes!.includes("shipments:issue") ? cap : null, c.get("session").user.id, now())
      .run()
    return ok({ id, token, prefix: token.slice(0, 12) }, 201)
  })
  r("POST", "/api-keys/:id/revoke", "app_owner", "role", async (c) => {
    const m = c.get("membership")!
    const res = await c.env.DB.prepare("UPDATE tenant_api_keys SET revoked_at = ?, revoked_by = ? WHERE id = ? AND tenant_id = ? AND revoked_at IS NULL").bind(now(), c.get("session").user.id, c.req.param("id") ?? "", m.tenantId).run()
    if (!res.meta.changes) throw new AppError(404, "API_KEY_NOT_FOUND", "Kunci tidak ditemukan atau sudah dicabut.")
    return ok({ revoked: true })
  })

  // Bantuan (TASK-310): platform support contact set by the Super Admin (`Sistem › Profil Legal`).
  r("GET", "/support", "app_session", "none", async (c) => {
    const p = await c.env.DB.prepare("SELECT support_whatsapp FROM platform_legal_profile WHERE id = 1").first<{ support_whatsapp: string | null }>()
    const wa = p?.support_whatsapp ? p.support_whatsapp.replace(/\D/g, "").replace(/^0/, "62") : null
    return ok({ whatsapp: wa, email: "bantuan@geraiexpress.com" })
  })

  // Akun Saya (TASK-310, DEC-229): every signed-in user, own account only.
  r("GET", "/account", "app_session", "self", async (c) => {
    const s = c.get("session")
    const u = await c.env.DB.prepare("SELECT name, email, phone FROM users WHERE id = ?").bind(s.user.id).first<{ name: string; email: string; phone: string | null }>()
    return ok({ profile: u, sessions: await listSessions(c.env, s.user.id, s.row.token_hash, now()) })
  })
  r("POST", "/account/profile", "app_session", "self", async (c) => ok(await updateProfile(c.env, c.get("session").user.id, await body(c), now())))
  r("POST", "/account/password", "app_session", "self", async (c) => {
    const s = c.get("session")
    await changePassword(c.env, s.user.id, s.row.token_hash, await body(c), now())
    return ok({ changed: true })
  })
  r("POST", "/account/email/request", "app_session", "self", async (c) => {
    const r = await requestEmailChange(c.env, c.get("session").user.id, await body(c), await ipHash(c.env.AUTH_SESSION_PEPPER, c.req.raw), now())
    c.executionCtx.waitUntil(dispatchDue(c.env).then(() => undefined))
    return ok(r)
  })
  r("POST", "/account/email/confirm", "app_session", "self", async (c) => {
    const s = c.get("session")
    return ok(await confirmEmailChange(c.env, s.user.id, s.row.token_hash, await body(c), now()))
  })
  r("POST", "/account/sessions/revoke", "app_session", "self", async (c) => {
    const s = c.get("session")
    return ok(await revokeSessions(c.env, s.user.id, s.row.token_hash, await body(c), now()))
  })

  // Pengaturan (TASK-310, visual 08 §2.3, DEC-223): owner forms; Kasir reaches only the printer page, which reads
  // `/print/settings` and keeps the device part locally.
  const settings = async (c: AppCtx) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).settingsView(m.tenantId)
    if (!r.ok) return vaultErr(r)
    return r.value
  }
  r("GET", "/settings", "app_owner", "role", async (c) => ok(await settings(c)))
  // POS defaults for the quote panel (owner and Kasir): active packing items, the counter service fee, whether the
  // owner chose to show the margin on quick checks, and the outlet's pickup point for the `Titik Jemput` chip (DEC-251).
  // No cost or margin values here (spec 03 §1, DEC-225).
  r("GET", "/pos-config", "app_member", "role", async (c) => {
    const v = await settings(c)
    return ok({
      packingItems: v.packing.items.filter((i) => i.active).map((i) => ({ name: i.name, priceIdr: i.priceIdr })),
      serviceFeeIdr: v.packing.serviceFeeEnabled ? v.packing.serviceFeeIdr : null,
      showCommission: v.receipt.showCommission,
      outlet: v.profile ? { name: v.profile.name, streetAddress: v.profile.street, areaLabel: v.profile.areaLabel } : null,
    })
  })
  for (const form of ["profile", "business", "receipt", "packing", "cashier_payout"] as const) {
    r("POST", `/settings/${form.replace("_", "-")}`, "app_owner", "role", async (c) => {
      const m = c.get("membership")!
      const r = await vaultFor(c.env, m.tenantId).settingsWrite(m.tenantId, c.get("session").user.id, form, await body(c))
      if (!r.ok) return vaultErr(r)
      const v = await settings(c)
      // The workspace header and Super Admin read the gerai name from D1: keep it in step with Profil Gerai.
      if (form === "profile" && v.profile?.name) await c.env.DB.prepare("UPDATE tenants SET name = ?, updated_at = ? WHERE id = ?").bind(v.profile.name, now(), m.tenantId).run()
      return ok(v)
    })
  }
  r("GET", "/members", "app_owner", "role", async (c) => {
    const m = c.get("membership")!
    const [members, invites] = await Promise.all([
      c.env.DB.prepare(
        `SELECT u.id, u.name, u.email, m.role, m.status, m.created_at, (SELECT MAX(last_seen_at) FROM sessions s WHERE s.user_id = u.id AND s.active_tenant_id = m.tenant_id) AS last_seen_at
         FROM tenant_members m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ? AND m.status = 'active' ORDER BY m.role DESC, u.name`,
      ).bind(m.tenantId).all<{ id: string; name: string; email: string; role: string; status: string; created_at: number; last_seen_at: number | null }>(),
      c.env.DB.prepare("SELECT email, role, expires_at, created_at FROM invitations WHERE tenant_id = ? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC").bind(m.tenantId, now()).all<{ email: string; role: string; expires_at: number; created_at: number }>(),
    ])
    return ok({ members: members.results, invitations: invites.results })
  })
  r("POST", "/members/:userId/revoke", "app_owner", "role", async (c) => {
    const m = c.get("membership")!
    const userId = c.req.param("userId") ?? ""
    if (userId === c.get("session").user.id) throw new AppError(422, "CANNOT_REVOKE_SELF", "Anda tidak bisa mencabut akses akun sendiri.")
    const t = now()
    const res = await c.env.DB.batch([
      c.env.DB.prepare("UPDATE tenant_members SET status = 'revoked', revoked_at = ? WHERE tenant_id = ? AND user_id = ? AND role = 'cashier' AND status = 'active'").bind(t, m.tenantId, userId),
      // The Kasir's sessions on this gerai end now (the next request has no membership).
      c.env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND active_tenant_id = ? AND revoked_at IS NULL AND changes() > 0").bind(t, userId, m.tenantId),
    ])
    if ((res[0]?.meta.changes ?? 0) === 0) throw new AppError(404, "MEMBER_NOT_FOUND", "Anggota tidak ditemukan atau sudah dicabut.")
    return ok({ revoked: true })
  })

  // `Status Operasional` (DEC-244): owner-only verdict + checklist + signals; Kasir never reaches it (app_owner).
  const statusView = async (c: AppCtx) => {
    const m = c.get("membership")!
    const vault = vaultFor(c.env, m.tenantId)
    const t = now()
    const [conn, hook, health, counts, domains, host] = await Promise.all([vault.connectionView(m.tenantId), vault.webhookStatus(m.tenantId), vault.healthSnapshot(m.tenantId, t), vault.statusCounts(m.tenantId), domainRows(c.env, m.tenantId), primaryHost(c.env, m.tenantId, m.tenantSlug)])
    return buildGeraiStatus({
      now: t,
      onboardingState: conn.ok ? (conn.value?.onboardingState ?? null) : null,
      webhookState: hook.ok ? (hook.value?.webhookState ?? null) : null,
      webhookLastEventAt: hook.ok ? (hook.value?.lastEventAt ?? null) : null,
      health: health.ok ? health.value : null,
      counts: counts.ok ? counts.value : null,
      miniSiteHost: host,
      domains: domains.map((d) => ({ hostname: d.hostname, state: d.state, lastCheckedAt: d.last_checked_at })),
    })
  }
  r("GET", "/status", "app_owner", "role", async (c) => ok(await statusView(c)))
  // `Periksa Ulang`: a real live check — finance sync (when connected) and custom-domain refresh — then the fresh view.
  r("POST", "/status/recheck", "app_owner", "role", async (c) => {
    const m = c.get("membership")!
    const lim = await hit(c.env.DB, `status-recheck:${m.tenantId}`, 6, 60_000, now())
    if (!lim.allowed) throw new AppError(429, "RECHECK_RATE_LIMITED", "Tunggu sebentar sebelum memeriksa ulang.")
    const vault = vaultFor(c.env, m.tenantId)
    const conn = await vault.connectionView(m.tenantId)
    const connected = conn.ok && (conn.value?.onboardingState === "connected" || conn.value?.onboardingState === "byok_connected")
    if (connected) await vault.financeSync(m.tenantId, "manual", now())
    try {
      for (const d of await domainRows(c.env, m.tenantId)) await refreshHost(c.env, d.hostname, now(), { probeFetch: (u) => fetch(u, { redirect: "manual", signal: AbortSignal.timeout(10_000) }) })
    } catch (e) {
      if (!(e instanceof CfError)) throw e
      // Cloudflare unavailable: the domain card keeps its last state; the rest of the check still answers.
    }
    return ok(await statusView(c))
  })

  r("GET", "/print/settings", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).printSettings(m.tenantId)
    if (!r.ok) return vaultErr(r)
    return ok(r.value)
  })
  r("POST", "/print", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const b = await body(c)
    const slugs = Array.isArray(b.slugs) ? [...new Set((b.slugs as unknown[]).filter((x): x is string => typeof x === "string" && /^[0-9a-hjkmnp-tv-z]{7}$/.test(x)))] : []
    const format = (FORMATS as readonly string[]).includes(String(b.format)) ? (b.format as (typeof FORMATS)[number]) : "label_10x15_with_stub"
    const preview = b.preview === true
    const r = await vaultFor(c.env, m.tenantId).preparePrint(m.tenantId, { slugs, reason: typeof b.reason === "string" ? b.reason : undefined, actorId: c.get("session").user.id, trackingHost: await trackingHost(c), record: !preview })
    if (!r.ok) return vaultErr(r)
    if (r.value.items.length === 0) throw new AppError(409, r.value.refused[0]?.code ?? "NOTHING_TO_PRINT", r.value.refused[0]?.message ?? "Tidak ada label yang bisa dicetak.")
    if (format === "roll_58mm") {
      const bytes = new Uint8Array(r.value.items.flatMap((d) => [...escposBytes(rollLines(d), b.density === "tebal" ? "tebal" : "normal")]))
      if (b.as === "text") return ok({ lines: r.value.items.map((d) => rollText(d)), refused: r.value.refused })
      return new Response(bytes, { headers: { "content-type": "application/octet-stream", "cache-control": "no-store", "x-refused": String(r.value.refused.length) } })
    }
    const pdf = labelsPdf(r.value.items, format)
    return new Response(pdf, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="label-${slugs.length === 1 ? slugs[0] : "massal"}.pdf"`, "cache-control": "no-store", "x-refused": String(r.value.refused.length) } })
  })
  r("GET", "/print/list", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const status = c.req.query("status") === "sudah" ? "sudah" : c.req.query("status") === "semua" ? "semua" : "belum"
    const courier = c.req.query("courier") || null
    const r = await vaultFor(c.env, m.tenantId).printableList(m.tenantId, { status, courier })
    if (!r.ok) return vaultErr(r)
    return ok({ items: r.value })
  })

  // Masking (TASK-305, ADR-0005, DEC-231): counter state, owner settings, audited reveal.
  const platformMasking = async (c: AppCtx) => {
    const t = await c.env.DB.prepare("SELECT masking_enabled, masking_daily_quota FROM tenants WHERE id = ?").bind(c.get("membership")!.tenantId).first<{ masking_enabled: number; masking_daily_quota: number | null }>()
    return { maskingEnabled: t?.masking_enabled === 1, dailyQuota: t?.masking_daily_quota ?? null }
  }
  r("GET", "/masking", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).maskingState(m.tenantId, await platformMasking(c))
    if (!r.ok) return vaultErr(r)
    return ok(projectFor(m.role, r.value))
  })
  r("GET", "/settings/masking", "app_owner", "role", async (c) => {
    const m = c.get("membership")!
    const platform = await platformMasking(c)
    const r = await vaultFor(c.env, m.tenantId).maskingSettings(m.tenantId, platform)
    if (!r.ok) return vaultErr(r)
    return ok({ ...r.value, dailyQuota: platform.dailyQuota })
  })
  r("POST", "/settings/masking", "app_owner", "role", async (c) => {
    const m = c.get("membership")!
    const b = await body(c)
    const r = await vaultFor(c.env, m.tenantId).saveMaskingSettings(m.tenantId, { offered: b.offered, presetsEnabled: b.presetsEnabled, defaultPreset: b.defaultPreset, maskRecipientOnCod: b.maskRecipientOnCod, dropshipperSync: b.dropshipperSync }, c.get("session").user.id)
    if (!r.ok) return vaultErr(r)
    const platform = await platformMasking(c)
    const s = await vaultFor(c.env, m.tenantId).maskingSettings(m.tenantId, platform)
    return ok(s.ok ? { ...s.value, dailyQuota: platform.dailyQuota } : null)
  })
  r("POST", "/shipments/:slug/reveal-sender", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const b = await body(c)
    const r = await vaultFor(c.env, m.tenantId).revealTrueSender(m.tenantId, slugParam(c), c.get("session").user.id, typeof b.reason === "string" ? b.reason : "")
    if (!r.ok) return vaultErr(r)
    return ok(projectFor(m.role, r.value))
  })
  r("POST", "/shipments/:slug/parties", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const slug = slugParam(c)
    const b = await body(c)
    const r = await vaultFor(c.env, m.tenantId).setShipmentParties(m.tenantId, slug, { senderId: b.senderId, recipientId: b.recipientId, content: b.content, prohibitedAck: b.prohibitedAck, maskPreset: b.maskPreset, quantity: b.quantity, deliveryInstruction: b.deliveryInstruction })
    if (!r.ok) return vaultErr(r)
    return detail(c, slug)
  })
  r("POST", "/shipments/:slug/payment", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const slug = slugParam(c)
    const b = await body(c)
    const op = b.op === "void_payment" ? "void_payment" : "mark_paid"
    // Kasir may void only within the same open shift (spec 03 §1.1); with no shift (TASK-307) the object refuses it.
    const r = await vaultFor(c.env, m.tenantId).recordPayment(m.tenantId, { op, slug, method: b.method, cashReceivedIdr: b.cashReceivedIdr, note: b.note, reason: b.reason, idempotencyKey: idemKey(c), actorId: c.get("session").user.id, role: m.role })
    if (!r.ok) return vaultErr(r)
    return ok({ receipt: r.value, replayed: r.replayed })
  })
  r("POST", "/shipments/:slug/dispatch", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const slug = slugParam(c)
    const r = await vaultFor(c.env, m.tenantId).dispatchShipment(m.tenantId, slug, c.get("session").user.id, Date.now(), await platformMasking(c))
    if (!r.ok) return vaultErr(r)
    return ok(r.value)
  })
  r("POST", "/shipments/:slug/reconcile", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).reconcileDispatch(m.tenantId, slugParam(c))
    if (!r.ok) return vaultErr(r)
    return ok(r.value)
  })
  r("POST", "/shipments/:slug/pay-unpaid", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).payUnpaid(m.tenantId, slugParam(c), c.get("session").user.id)
    if (!r.ok) return vaultErr(r)
    return ok(r.value)
  })
  r("POST", "/shipments/:slug/cancel", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const b = await body(c)
    const reason = typeof b.reason === "string" ? b.reason.trim() : ""
    if (reason.length < 3 || reason.length > 200) throw new AppError(422, "REASON_REQUIRED", "Tulis alasan pembatalan.", { reason: "Wajib diisi." })
    const r = await vaultFor(c.env, m.tenantId).cancelShipment(m.tenantId, slugParam(c), c.get("session").user.id, reason)
    if (!r.ok) return vaultErr(r)
    return ok(r.value)
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
  // DEC-238: Mengantar receiver score (cross-seller COD history, A..E-), cached 24 h in the tenant object.
  r("GET", "/contacts/receiver-score", "app_member", "role", async (c) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).receiverScore(m.tenantId, c.req.query("phone") ?? "")
    if (!r.ok) throw new AppError(503, "TENANT_NOT_READY", "Data gerai sedang diperbarui. Coba lagi sebentar lagi.")
    return ok(r.value)
  })

  // Media (TASK-302): upload into `t/<tenant>/…`, read through a short-lived signed URL bound to the tenant.
  r("POST", "/media", "app_member", "self", async (c) => {
    const m = c.get("membership")!
    const purpose = c.req.query("purpose") as MediaPurpose
    if (!MEDIA_PURPOSES.includes(purpose)) throw new AppError(422, "INVALID_PURPOSE", "Jenis berkas tidak dikenal.")
    if (OWNER_MEDIA.includes(purpose) && m.role !== "gerai_admin") throw new AppError(403, "FORBIDDEN", purpose === "qris" ? "QRIS gerai hanya bisa diganti pemilik." : "Logo gerai hanya bisa diganti pemilik.")
    const max = purpose === "qris" ? QRIS_MAX_BYTES : MEDIA_MAX_BYTES
    const tooLarge = () => new AppError(413, "FILE_TOO_LARGE", `Ukuran berkas maksimal ${max / 1024 / 1024} MB.`)
    if (Number(c.req.header("content-length") ?? "0") > max) throw tooLarge()
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    if (bytes.byteLength === 0) throw new AppError(422, "EMPTY_FILE", "Berkas kosong.")
    if (bytes.byteLength > max) throw tooLarge()
    const type = sniffType(bytes)
    if (!type) throw new AppError(415, "UNSUPPORTED_FILE", "Hanya foto JPG, PNG, WEBP atau PDF.")
    if (purpose === "qris" && !type.startsWith("image/")) throw new AppError(415, "UNSUPPORTED_FILE", "QRIS harus berupa gambar JPG, PNG atau WEBP.")
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

  // Layar Pelanggan (TASK-701, PR-22, spec 03 §5). The counter pairs, pushes state and unpairs with its session; the
  // paired display reads `view` and the outlet images with `?gerai&kode` only — no session is read, no cookie is set.
  const displayOp = async (c: AppCtx, op: Parameters<GeraiVaultDO["customerDisplayOp"]>[2]) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).customerDisplayOp(m.tenantId, c.get("session").user.id, op)
    if (!r.ok) return vaultErr(r)
    return r.value
  }
  /** The `paid` state carries its tracking QR so the customer can scan it off the screen. */
  const publicState = (s: DisplayState) => (s.kind === "paid" ? { ...s, trackingQrSvg: qrSvg(s.trackingUrl, { title: "QR Lacak Paket" }) } : s)
  r("POST", "/customer-display/pair", "app_member", "role", async (c) => {
    const token = newToken(32)
    const v = await displayOp(c, { op: "pair", tokenHash: await sha256Hex(token) })
    const pairUrl = `${hostOrigin(c.req.raw)}/kasir/layar-pelanggan?gerai=${encodeURIComponent(c.get("membership")!.tenantSlug)}&kode=${token}`
    return ok({ pairUrl, token, pairId: v.pairId, seq: v.seq, expiresAt: v.expiresAt, shiftBound: v.shiftBound, hasQris: v.hasQris, qrSvg: qrSvg(pairUrl, { title: "QR Layar Pelanggan" }) }, 201)
  })
  r("GET", "/customer-display/status", "app_member", "role", async (c) => ok(await displayOp(c, { op: "status" })))
  r("POST", "/customer-display/unpair", "app_member", "role", async (c) => ok(await displayOp(c, { op: "unpair" })))
  /** Sol R1 F1: the display's text comes from server data only. `checkout` names a catalog `serviceCode` (→ its display
   *  name) and a `destinationAreaId` (→ the Mengantar area label, found by searching the hint and matching the exact
   *  id; no match → no destination); `paid` gets the active catalog so the object names the shipment's own service. */
  async function displayText(c: AppCtx, input: Record<string, unknown>): Promise<{ resolved?: { courier: string; destination: string | null }; catalog?: Record<string, string> }> {
    if (input.kind === "paid") {
      const rows = await c.env.DB.prepare("SELECT service_code, display_name FROM courier_service_catalog WHERE is_active = 1").all<{ service_code: string; display_name: string }>()
      return { catalog: Object.fromEntries(rows.results.map((x) => [x.service_code, x.display_name])) }
    }
    if (input.kind !== "checkout") return {}
    const code = typeof input.serviceCode === "string" && /^[A-Za-z0-9]{1,40}$/.test(input.serviceCode) ? input.serviceCode : null
    const svc = code ? await c.env.DB.prepare("SELECT display_name FROM courier_service_catalog WHERE service_code = ? AND is_active = 1").bind(code).first<{ display_name: string }>() : null
    if (!svc) throw new AppError(422, "DISPLAY_INVALID", "Pilih ekspedisi dulu.")
    let destination: string | null = null
    const areaId = typeof input.destinationAreaId === "string" && /^[0-9a-f]{24}$/.test(input.destinationAreaId) ? input.destinationAreaId : null
    const hint = typeof input.destinationLabel === "string" ? (input.destinationLabel.split(",")[0] ?? "").trim() : ""
    if (areaId && hint.length >= 3) {
      try {
        destination = (await searchAreas(c.env, hint)).items.find((a) => a.id === areaId)?.label ?? null
      } catch {
        destination = null // area search unavailable: the display simply omits the destination
      }
    }
    return { resolved: { courier: svc.display_name, destination } }
  }
  r("POST", "/customer-display/state", "app_member", "role", async (c) => {
    const input = await body(c)
    // Sol R2-F1: the counter numbers its publications (`seq`); the tenant object applies one only if it is newer than
    // what the pairing holds, so a slow area lookup cannot let an older publication overwrite a newer one.
    const seq = publicationSeq(input.seq)
    const v = await displayOp(c, { op: "state", input, seq, trackingHost: await trackingHost(c), ...(await displayText(c, input)) })
    return ok({ ...v, state: v.state ? publicState(v.state) : null })
  })
  const DISPLAY_FAIL_LIMIT = 30
  const DISPLAY_FAIL_WINDOW_MS = 10 * 60_000
  const pairing = async (c: AppCtx) => {
    const gerai = c.req.query("gerai") ?? ""
    const kode = c.req.query("kode") ?? ""
    const t = now()
    // Only failed lookups count (a paired display polls every 2 s); 30 failures per IP per 10 min → 429.
    const ipKey = `cd-view-fail:${await ipHash(c.env.AUTH_SESSION_PEPPER, c.req.raw)}`
    const fails = await c.env.DB.prepare("SELECT count, window_started_at FROM auth_throttle WHERE key = ?").bind(ipKey).first<{ count: number; window_started_at: number }>()
    if (fails && fails.window_started_at > t - DISPLAY_FAIL_WINDOW_MS && fails.count >= DISPLAY_FAIL_LIMIT) throw new AppError(429, "DISPLAY_RATE_LIMITED", "Terlalu banyak percobaan. Tunggu beberapa menit, lalu pindai ulang QR dari layar kasir.")
    const notPaired = async () => {
      await hit(c.env.DB, ipKey, DISPLAY_FAIL_LIMIT, DISPLAY_FAIL_WINDOW_MS, t)
      return new AppError(401, "DISPLAY_NOT_PAIRED", "Layar ini belum terhubung. Pindai QR dari layar kasir.")
    }
    const ended = () => new AppError(410, "DISPLAY_ENDED", "Layar pelanggan tidak lagi terhubung. Pasangkan ulang dari layar kasir.")
    if (!/^[A-Za-z0-9_-]{43}$/.test(kode) || !/^[a-z0-9-]{1,63}$/.test(gerai)) throw await notPaired()
    // Tenant only from the slug (active gerai), token hash looked up in that gerai's object only.
    const tenant = await c.env.DB.prepare("SELECT id FROM tenants WHERE slug = ? AND status = 'active'").bind(gerai).first<{ id: string }>()
    if (!tenant) throw await notPaired()
    const v = await vaultFor(c.env, tenant.id).customerDisplayView(tenant.id, await sha256Hex(kode), t)
    if (!v.ok || v.value.kind === "none") throw await notPaired()
    if (v.value.kind === "ended") throw ended()
    // A member whose access was revoked no longer drives a display.
    const member = await c.env.DB.prepare("SELECT 1 AS x FROM tenant_members WHERE tenant_id = ? AND user_id = ? AND status = 'active'").bind(tenant.id, v.value.createdBy).first()
    if (!member) throw ended()
    return { tenantId: tenant.id, query: `gerai=${encodeURIComponent(gerai)}&kode=${kode}`, value: v.value }
  }
  r("GET", "/customer-display/view", "public", "none", async (c) => {
    const p = await pairing(c)
    const o = p.value.outlet!
    return ok(
      {
        pairId: p.value.pairId,
        state: publicState(p.value.state),
        updatedAt: p.value.updatedAt,
        outlet: { name: o.name, logoUrl: o.logo ? `/api/app/customer-display/media/logo?${p.query}` : null, qrisUrl: o.qris ? `/api/app/customer-display/media/qris?${p.query}` : null },
      },
      200,
      { "cache-control": "no-store" },
    )
  })
  r("GET", "/customer-display/media/:kind", "public", "none", async (c) => {
    const kind = c.req.param("kind")
    if (kind !== "logo" && kind !== "qris") throw new AppError(404, "NOT_FOUND", "Berkas tidak ditemukan.")
    const p = await pairing(c)
    const m = p.value.outlet?.[kind]
    const obj = m && m.key.startsWith(`t/${p.tenantId}/`) ? await c.env.BUCKET.get(m.key) : null
    if (!m || !obj) throw new AppError(404, "NOT_FOUND", "Berkas tidak ditemukan.")
    return new Response(obj.body, { headers: { "content-type": m.contentType, "cache-control": "private, max-age=60", "x-content-type-options": "nosniff", "content-disposition": "inline" } })
  })
  // Outlet static QRIS (spec 03 §5.4): every member reads it (read-only card for the Kasir); only the owner sets it.
  const qrisView = async (c: AppCtx, set?: { mediaId: string | null; actorId: string }) => {
    const m = c.get("membership")!
    const r = await vaultFor(c.env, m.tenantId).outletQris(m.tenantId, set)
    if (!r.ok) return vaultErr(r)
    return { hasQris: !!r.value, url: r.value ? await signMediaUrl(c.env.KEK_SECRET, m.tenantId, r.value, now()) : null }
  }
  r("GET", "/settings/qris", "app_member", "role", async (c) => ok(await qrisView(c)))
  r("POST", "/settings/qris", "app_owner", "role", async (c) => {
    const b = await body(c)
    if (b.mediaId !== null && (typeof b.mediaId !== "string" || !/^[0-9a-f-]{36}$/.test(b.mediaId))) throw new AppError(422, "QRIS_NOT_FOUND", "Gambar QRIS tidak ditemukan. Unggah ulang gambarnya.")
    return ok(await qrisView(c, { mediaId: b.mediaId as string | null, actorId: c.get("session").user.id }))
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
      c.env.DB.prepare("INSERT INTO tenant_hostnames (hostname, tenant_id, kind, state, created_at, activated_at) VALUES (?1, ?2, 'platform_subdomain', 'active', ?3, ?3)").bind(`${slug}.geraimitra.localhost`, id, t),
      c.env.DB.prepare("UPDATE sessions SET active_tenant_id = ? WHERE token_hash = ?").bind(id, s.row.token_hash),
    ])
    const { vaultFor } = await import("../do/gerai-vault/stub")
    const vault = vaultFor(c.env, id)
    await vault.migrate(id)
    if (b.masking === true) await c.env.DB.prepare("UPDATE tenants SET masking_enabled = 1, masking_daily_quota = 20 WHERE id = ?").bind(id).run()
    if (b.pro === true) await c.env.DB.prepare("UPDATE tenants SET custom_domain_enabled = 1 WHERE id = ?").bind(id).run()
    if (b.connect === true) {
      // Local only: a connected seller on the offline Mengantar mock, a pickup outlet and 20 % rules.
      const reg = await (await resolvePartnerClient(c.env)).register({ name: slug, email: `${slug}@seller.localhost`, phone: "081200000000", externalUserId: id })
      if (reg.kind === "ok" && reg.data.apiKey) await vault.recordOnboarding(id, { environment: "sandbox", state: "connected", sellerId: reg.data.sellerId, externalUserId: id, apiKey: reg.data.apiKey })
      await vault.upsertDefaultOutlet(id, { name: typeof b.name === "string" ? b.name.slice(0, 80) : "Gerai Contoh", picName: "Pemilik Contoh", picPhone: "081200000000", street: "Jl. Dago No. 1", areaId: "5fc62f5df8f44b34aa4c0d8c", areaLabel: "Dago, Coblong, Kota Bandung" })
      await c.env.DB.prepare(
        `INSERT INTO tenant_discount_rules (tenant_id, service_code, courier_code, service_class, assigned_bps, effective_from, requested_at, updated_at)
         SELECT ?1, service_code, courier_code, service_class, 2000, ?2, ?2, ?2 FROM courier_service_catalog WHERE is_active = 1 ON CONFLICT DO NOTHING`,
      ).bind(id, t).run()
    }
    return ok({ tenantId: id, slug }, 201)
  })
  // Local only (mock Mengantar): synthesize `/invoices` rows for this gerai's issued INVs — a top-up, one Non-COD
  // batch payment or COD payout per INV, and one unknown type — so `/keuangan` can be rendered and e2e-tested.
  r("POST", "/dev/mock-invoices", "app_owner", "none", async (c) => {
    if (c.env.GX_ENV !== "local" || c.env.MENGANTAR_PUBLIC_ORIGIN !== "mock") return fail(404, "NOT_FOUND", "Alamat tidak ditemukan.")
    const m = c.get("membership")!
    const list = await vaultFor(c.env, m.tenantId).shipmentList(m.tenantId, { tab: "semua", q: "", fromMs: 0, toMs: Date.now() + 1, courier: null, printed: "semua", cursor: null, limit: 50 })
    if (!list.ok) return vaultErr(list)
    const { mockInvoices, mockSeller } = await import("../mengantar/mock")
    const b = await body(c)
    // `{ sellerBalance }` sets the mock seller balance (0 → the next Non-COD issue is held); no rows are added.
    if (typeof b.sellerBalance === "number") {
      mockSeller.balanceIdr = b.sellerBalance
      return ok({ sellerBalance: mockSeller.balanceIdr })
    }
    // `{ topUp }` adds one cleared top-up row whose running balance continues from this gerai's newest row.
    const key = await vaultFor(c.env, m.tenantId).devMockSellerKey(m.tenantId)
    const seller = key.ok ? key.value : null
    if (!seller) return fail(409, "NOT_CONNECTED", "Gerai belum terhubung ke Mengantar.")
    if (typeof b.topUp === "number") {
      const mine = mockInvoices.filter((i) => i._seller === seller)
      const last = mine.reduce((a, i) => (String(i.createdAt) > String(a?.createdAt ?? "") ? i : a), undefined as Record<string, unknown> | undefined)
      const bal = Number(last?.balanceAmount ?? 0) + b.topUp
      mockInvoices.push({ _id: `dev-top-${crypto.randomUUID().slice(0, 8)}`, type: "typeAddBalance", status: "statusCleared", amount: b.topUp, balanceAmount: bal, createdAt: new Date().toISOString(), description: "Top up saldo", _seller: seller })
      mockSeller.balanceIdr = bal
      return ok({ balance: bal }, 201)
    }
    let balance = 500_000
    let t = Date.now() - 3600_000
    const at = () => new Date((t += 60_000)).toISOString()
    const tag = m.tenantId.slice(0, 6)
    const push = (row: Record<string, unknown>) => mockInvoices.push({ ...row, _seller: seller })
    push({ _id: `dev-${tag}-top`, inv_number: "INV-MGT-DEV-1", type: "typeAddBalance", status: "statusCleared", amount: 500_000, balanceAmount: balance, createdAt: at(), description: "Top up saldo" })
    for (const row of list.value.items.filter((x) => x.awb_number)) {
      if (row.cod_fee_mode === "none") {
        balance -= 10_000
        push({ _id: `dev-${tag}-${row.slug}`, inv_number: `INV-MGT-${row.slug.toUpperCase()}`, type: "typePayment", status: "statusCleared", amount: -10_000, balanceAmount: balance, createdAt: at(), description: "Payment for Non-COD batch", subItems: [{ cnote_no: row.awb_number, amount: -10_000 }] })
      } else {
        const credit = row.cod_collection_total_idr - 10_000
        balance += credit
        push({ _id: `dev-${tag}-${row.slug}`, inv_number: `INV-MGT-${row.slug.toUpperCase()}`, type: "typeReconciliation", status: "statusCleared", amount: credit, balanceAmount: balance, createdAt: at(), subItems: [{ cnote_no: row.awb_number, amount: credit }] })
      }
    }
    balance -= 1_000
    push({ _id: `dev-${tag}-x`, inv_number: "INV-MGT-DEV-X", type: "typeMismatchP", status: "statusCleared", amount: -1_000, balanceAmount: balance, createdAt: at(), description: "Selisih" })
    return ok({ rows: mockInvoices.filter((i) => i._seller === seller).length }, 201)
  })

  // Local only (mock Mengantar): a provider status update for one INV, standing in for a webhook.
  r("POST", "/dev/provider-status", "app_member", "none", async (c) => {
    if (c.env.GX_ENV !== "local" || c.env.MENGANTAR_PUBLIC_ORIGIN !== "mock") return fail(404, "NOT_FOUND", "Alamat tidak ditemukan.")
    const m = c.get("membership")!
    const b = await body(c)
    const r = await vaultFor(c.env, m.tenantId).devProviderStatus(m.tenantId, String(b.slug ?? ""), String(b.category ?? ""))
    if (!r.ok) return vaultErr(r)
    return ok({ status: r.value })
  })

  // Sandbox/local only (DEC-238): Mengantar `POST /order/simulation` moves one of this gerai's issued orders to
  // ON DELIVERY / DELIVERED / RTS (production answers 404, so the route is closed there). Owner only.
  r("POST", "/dev/simulate-status", "app_owner", "role", async (c) => {
    if (c.env.GX_ENV === "production") return fail(404, "NOT_FOUND", "Alamat tidak ditemukan.")
    const m = c.get("membership")!
    const b = await body(c)
    const status = String(b.status ?? "")
    if (!["ON DELIVERY", "DELIVERED", "RTS"].includes(status)) throw new AppError(422, "INVALID_STATUS", "Pilih status ON DELIVERY, DELIVERED atau RTS.")
    const r = await vaultFor(c.env, m.tenantId).simulateProviderStatus(m.tenantId, String(b.slug ?? "").toLowerCase(), status as "ON DELIVERY" | "DELIVERED" | "RTS", c.get("session").user.id)
    if (!r.ok) return vaultErr(r)
    return ok(r.value)
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
