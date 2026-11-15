// `/api/owner/*` on owner.geraiexpress.com (DEC-209, spec 05 §1–2). Password login gives an `aal1` session that can
// only complete TOTP; every other route needs `aal2`; sensitive reads and mutations need a TOTP within 15 minutes
// (`owner_recent`). No route here creates, pays, edits or cancels a gerai's shipments (non-impersonation scan).
import { Hono, type Context, type MiddlewareHandler } from "hono"
import { emit } from "@gx/telemetry"
import { clearSessionCookie, isSecureRequest, setSessionCookie } from "../auth/cookies"
import { sameOriginOk } from "../auth/csrf"
import { login } from "../auth/flows"
import { readSession, revokeSession, type Session } from "../auth/session"
import * as throttle from "../auth/throttle"
import { newTotpSecret, otpauthUri, verifyTotp } from "../auth/totp"
import { decryptString, encryptString } from "../crypto/aead"
import { sha256Hex } from "../crypto"
import { AppError, fail, fromError, ok } from "../http/envelope"
import { hostOrigin, ipHash } from "../http/request"
import { register, type AuthLevel } from "./registry"

export const RECENT_TOTP_MS = 15 * 60_000
const TOTP_MAX_WRONG = 5
const TOTP_LOCK_MS = 15 * 60_000

type Vars = { session: Session }
export type OwnerCtx = Context<{ Bindings: Env; Variables: Vars }>

interface AdminRow {
  user_id: string
  totp_secret_encrypted: string | null
  totp_state: "pending" | "active" | "reset"
  totp_last_step: number | null
  status: "active" | "disabled"
}

async function adminOf(env: Env, userId: string): Promise<AdminRow | null> {
  return env.DB.prepare("SELECT user_id, totp_secret_encrypted, totp_state, totp_last_step, status FROM super_admins WHERE user_id = ?").bind(userId).first<AdminRow>()
}

export function ownerGuard(level: AuthLevel): MiddlewareHandler<{ Bindings: Env; Variables: Vars }> {
  return async (c, next) => {
    if (!sameOriginOk(c.req.raw)) return fail(403, "CSRF", "Permintaan ditolak. Muat ulang halaman lalu coba lagi.")
    if (level === "public") return next()
    const s = await readSession(c.env, c.req.raw, "owner")
    if (!s) return fail(401, "UNAUTHENTICATED", "Sesi Anda berakhir. Silakan masuk lagi.")
    const admin = await adminOf(c.env, s.session.user.id)
    if (!admin || admin.status !== "active") return fail(403, "FORBIDDEN", "Akses ditolak.")
    c.set("session", s.session)
    if (level === "owner_aal1") return next()
    if (s.session.row.aal !== "aal2") return fail(401, "TOTP_REQUIRED", "Masukkan kode TOTP untuk melanjutkan.")
    if (level === "owner_recent") {
      const at = s.session.row.totp_verified_at ?? 0
      if (Date.now() - at > RECENT_TOTP_MS) return fail(401, "TOTP_RECENT_REQUIRED", "Konfirmasi ulang TOTP untuk melanjutkan.")
    }
    if (level !== "owner_aal2" && level !== "owner_recent") return fail(403, "FORBIDDEN", "Akses ditolak.")
    return next()
  }
}

async function body(c: OwnerCtx): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json()
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Audit row for platform-scope actions (D1 audit_logs). Reason is required for every Super Admin mutation. */
export function auditStatement(env: Env, input: { actorId: string; action: string; targetType?: string; targetId?: string; tenantId?: string | null; reason: string; metadata?: unknown; now: number }) {
  return env.DB.prepare(
    "INSERT INTO audit_logs (id, at, actor_type, actor_id, tenant_id, action, target_type, target_id, reason, metadata_json) VALUES (?, ?, 'super_admin', ?, ?, ?, ?, ?, ?, ?)",
  ).bind(crypto.randomUUID(), input.now, input.actorId, input.tenantId ?? null, input.action, input.targetType ?? null, input.targetId ?? null, input.reason, input.metadata ? JSON.stringify(input.metadata) : null)
}

export function requireReason(raw: unknown): string {
  const reason = typeof raw === "string" ? raw.trim() : ""
  if (reason.length < 5 || reason.length > 500) throw new AppError(422, "REASON_REQUIRED", "Alasan wajib diisi (5–500 karakter).", { reason: "Tulis alasan perubahan." })
  return reason
}

async function checkTotp(env: Env, session: Session, code: unknown, now: number): Promise<void> {
  const admin = await adminOf(env, session.user.id)
  if (!admin?.totp_secret_encrypted || admin.totp_state === "reset") throw new AppError(409, "TOTP_NOT_ENROLLED", "TOTP belum diaktifkan. Minta Super Admin lain menyiapkan pendaftaran TOTP Anda.")
  const lockKey = `totp-lock:${await sha256Hex(session.user.id)}`
  const locked = await throttle.lockedUntil(env.DB, lockKey, now)
  if (locked) throw new AppError(429, "TOO_MANY_ATTEMPTS", "Terlalu banyak percobaan, coba lagi dalam 15 menit.", {}, { "retry-after": String(Math.ceil((locked - now) / 1000)) })
  const secret = await decryptString(env.KEK_SECRET, admin.totp_secret_encrypted, "totp")
  const step = await verifyTotp(secret, typeof code === "string" ? code.trim() : "", now, admin.totp_last_step)
  if (step === null) {
    const fails = await throttle.hit(env.DB, `totp-fail:${session.user.id}`, TOTP_MAX_WRONG - 1, TOTP_LOCK_MS, now)
    if (!fails.allowed) await throttle.lock(env.DB, lockKey, now + TOTP_LOCK_MS, now).run()
    throw new AppError(400, "TOTP_INVALID", "Kode TOTP salah atau sudah dipakai.", { code: "Periksa kode di aplikasi autentikator." })
  }
  // Consume the step atomically (replay guard) and promote the session.
  const used = await env.DB.prepare("UPDATE super_admins SET totp_last_step = ?1, totp_state = 'active', updated_at = ?2 WHERE user_id = ?3 AND (totp_last_step IS NULL OR totp_last_step < ?1) RETURNING user_id")
    .bind(step, now, session.user.id)
    .first()
  if (!used) throw new AppError(400, "TOTP_INVALID", "Kode TOTP salah atau sudah dipakai.")
  await env.DB.batch([
    env.DB.prepare("UPDATE sessions SET aal = 'aal2', totp_verified_at = ? WHERE token_hash = ?").bind(now, session.row.token_hash),
    throttle.clear(env.DB, `totp-fail:${session.user.id}`),
  ])
}

export function ownerApi(): Hono<{ Bindings: Env; Variables: Vars }> {
  const app = new Hono<{ Bindings: Env; Variables: Vars }>().basePath("/api/owner")
  app.onError((err) => fromError(err))
  app.notFound(() => fail(404, "NOT_FOUND", "Alamat tidak ditemukan."))
  const r = (method: "GET" | "POST", path: string, auth: AuthLevel, projection: "none" | "self" | "role", handler: (c: OwnerCtx) => Promise<Response>) =>
    register(app, { context: "owner", method, path, auth, projection }, ownerGuard, (c) => handler(c as OwnerCtx))
  const now = () => Date.now()

  r("POST", "/auth/login", "public", "self", async (c) => {
    const b = await body(c)
    const res = await login(c.env, {
      email: b.email,
      password: b.password,
      ctx: "owner",
      ipHash: await ipHash(c.env.AUTH_SESSION_PEPPER, c.req.raw),
      deviceHash: c.req.header("user-agent") ? await sha256Hex(`${c.env.AUTH_SESSION_PEPPER}:device:${c.req.header("user-agent")}`) : null,
      userAgent: c.req.header("user-agent") ?? null,
      origin: hostOrigin(c.req.raw),
      now: now(),
      isSuperAdmin: async (userId) => (await adminOf(c.env, userId))?.status === "active",
    })
    const admin = await adminOf(c.env, res.userId)
    return ok({ totp: admin?.totp_state === "active" ? "required" : "enrol" }, 200, {
      "set-cookie": setSessionCookie("owner", isSecureRequest(c.req.raw, c.env.GX_ENV), res.sessionToken, res.maxAgeSeconds),
    })
  })

  // First enrolment / after a recovery reset: the secret is shown once (QR + text), then confirmed with a code.
  r("POST", "/auth/totp/enrol", "owner_aal1", "self", async (c) => {
    const s = c.get("session")
    const admin = await adminOf(c.env, s.user.id)
    if (admin?.totp_state === "active") throw new AppError(409, "TOTP_ALREADY_ACTIVE", "TOTP sudah aktif. Gunakan kode dari aplikasi autentikator Anda.")
    const secret = newTotpSecret()
    await c.env.DB.prepare("UPDATE super_admins SET totp_secret_encrypted = ?, totp_state = 'pending', totp_last_step = NULL, updated_at = ? WHERE user_id = ?")
      .bind(await encryptString(c.env.KEK_SECRET, secret, "totp"), now(), s.user.id)
      .run()
    return ok({ secret, otpauthUri: otpauthUri(secret, s.user.email) })
  })

  r("POST", "/auth/totp/verify", "owner_aal1", "self", async (c) => {
    const b = await body(c)
    await checkTotp(c.env, c.get("session"), b.code, now())
    emit("auth.otp", { outcome: "totp_verified" }, {}, { env: c.env.GX_ENV })
    return ok({ aal: "aal2" })
  })

  r("POST", "/auth/logout", "owner_aal1", "none", async (c) => {
    await revokeSession(c.env.DB, c.get("session").row.token_hash, now()).run()
    return ok({ loggedOut: true }, 200, { "set-cookie": clearSessionCookie("owner", isSecureRequest(c.req.raw, c.env.GX_ENV)) })
  })

  r("GET", "/auth/me", "owner_aal2", "self", async (c) => {
    const s = c.get("session")
    const recentUntil = (s.row.totp_verified_at ?? 0) + RECENT_TOTP_MS
    return ok({ user: { id: s.user.id, name: s.user.name, email: s.user.email }, aal: s.row.aal, totpRecentUntil: recentUntil, sessionExpiresAt: s.row.absolute_expires_at })
  })

  // Sensitive READ example used by later screens (audit log viewer, risk search): needs a recent TOTP.
  r("GET", "/audit", "owner_recent", "role", async (c) => {
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 50))
    const rows = await c.env.DB.prepare("SELECT id, at, actor_type, actor_id, tenant_id, action, target_type, target_id, reason FROM audit_logs ORDER BY at DESC LIMIT ?").bind(limit).all()
    await auditStatement(c.env, { actorId: c.get("session").user.id, action: "audit.read", reason: "lihat log audit", now: now() }).run()
    return ok({ items: rows.results })
  })

  // Super Admin access management: enrol a new admin or reset another admin's TOTP (recovery). Never self.
  r("POST", "/admins", "owner_recent", "role", async (c) => {
    const b = await body(c)
    const reason = requireReason(b.reason)
    const actor = c.get("session").user
    const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : ""
    const user = await c.env.DB.prepare("SELECT id FROM users WHERE email = ? AND status = 'active'").bind(email).first<{ id: string }>()
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "Akun dengan email ini belum ada. Minta orang tersebut membuat akun terlebih dahulu.")
    if (user.id === actor.id) throw new AppError(409, "SELF_FORBIDDEN", "Tidak dapat mengubah akses Anda sendiri.")
    const t = now()
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO super_admins (user_id, totp_state, enrolled_by, enrolled_at, status, created_at, updated_at) VALUES (?1, 'pending', ?2, ?3, 'active', ?3, ?3)
         ON CONFLICT(user_id) DO UPDATE SET status = 'active', updated_at = ?3`,
      ).bind(user.id, actor.id, t),
      auditStatement(c.env, { actorId: actor.id, action: "super_admin.enrol", targetType: "user", targetId: user.id, reason, now: t }),
    ])
    return ok({ userId: user.id, totp: "enrol" }, 201)
  })

  r("POST", "/admins/:userId/totp-reset", "owner_recent", "role", async (c) => {
    const b = await body(c)
    const reason = requireReason(b.reason)
    const actor = c.get("session").user
    const target = c.req.param("userId")
    if (target === actor.id) throw new AppError(409, "SELF_FORBIDDEN", "Tidak dapat mengubah akses Anda sendiri.")
    const t = now()
    const res = await c.env.DB.batch([
      c.env.DB.prepare("UPDATE super_admins SET totp_secret_encrypted = NULL, totp_state = 'reset', totp_last_step = NULL, updated_at = ? WHERE user_id = ?").bind(t, target),
      // The reset admin's sessions end immediately.
      c.env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND host_context = 'owner' AND revoked_at IS NULL").bind(t, target),
      auditStatement(c.env, { actorId: actor.id, action: "super_admin.totp_reset", targetType: "user", targetId: target, reason, now: t }),
    ])
    if ((res[0]?.meta.changes ?? 0) !== 1) throw new AppError(404, "ADMIN_NOT_FOUND", "Super Admin tidak ditemukan.")
    return ok({ reset: true })
  })

  return app
}

/** Paths a Super Admin route may never take (DEC-209 non-impersonation), checked by test and CI. */
export const IMPERSONATION_PATTERNS = [/\/shipments?(\/|$)/, /\/kiriman/, /\/orders?(\/|$)/, /pay-unpaid|mark-paid|tandai-lunas/i, /\/dispatch/, /\/cancel/, /\/receipts?/, /\/shift/, /impersonat/i, /\/login-as/]
