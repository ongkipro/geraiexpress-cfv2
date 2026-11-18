// `/api/owner/*` on owner.geraiexpress.com (DEC-209, spec 05 §1–2). Password login gives an `aal1` session that can
// only complete TOTP; every other route needs `aal2`; sensitive reads and mutations need a TOTP within 15 minutes
// (`owner_recent`). No route here creates, pays, edits or cancels a gerai's shipments (non-impersonation scan).
import { Hono, type Context, type MiddlewareHandler } from "hono"
import { emit } from "@gx/telemetry"
import { clearSessionCookie, isSecureRequest, setSessionCookie } from "../auth/cookies"
import { sameOriginOk } from "../auth/csrf"
import { login } from "../auth/flows"
import { changePassword, confirmEmailChange, listSessions, requestEmailChange, revokeSessions, updateProfile } from "../auth/account"
import { verifyPassword } from "../auth/password"
import { canonicalRecoveryCode, consumeRecoveryCode, issueRecoveryCodes, openRotation, recoveryStatus, sealRotation } from "../auth/recovery"
import { dispatchDue } from "../email/mailer"
import { readSession, revokeSession, type Session } from "../auth/session"
import * as throttle from "../auth/throttle"
import { newTotpSecret, otpauthUri, verifyTotp } from "../auth/totp"
import { decryptString, encryptString } from "../crypto/aead"
import { sha256Hex } from "../crypto"
import { AppError, fail, fromError, ok } from "../http/envelope"
import { hostOrigin, ipHash } from "../http/request"
import { register, type AuthLevel } from "./registry"
import { registerGeraiAdmin } from "../admin/gerai/routes"
import { registerPricingAdmin } from "../pricing/rules/routes"
import { registerOverview } from "../admin/overview"
import { registerMonitor } from "../admin/monitor"
import { registerSystem } from "../admin/audit"
import { registerLegal } from "../admin/legal"

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
    if (s.session.row.aal !== "aal2") return admin.totp_state === "active" ? fail(401, "TOTP_REQUIRED", "Masukkan kode TOTP untuk melanjutkan.") : fail(401, "TOTP_ENROL_REQUIRED", "Daftarkan aplikasi autentikator untuk melanjutkan.")
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

const notEnrolled = () => new AppError(409, "TOTP_NOT_ENROLLED", "TOTP belum diaktifkan. Minta Super Admin lain menyiapkan pendaftaran TOTP Anda.")

/** The second-factor lock shared by TOTP codes and recovery codes (DEC-246): refuses while locked. */
async function secondFactorGate(env: Env, userId: string, now: number): Promise<string> {
  const lockKey = `totp-lock:${await sha256Hex(userId)}`
  const locked = await throttle.lockedUntil(env.DB, lockKey, now)
  if (locked) throw new AppError(429, "TOO_MANY_ATTEMPTS", "Terlalu banyak percobaan, coba lagi dalam 15 menit.", {}, { "retry-after": String(Math.ceil((locked - now) / 1000)) })
  return lockKey
}

/** Counts one wrong second factor; the 5th within 15 minutes locks both TOTP and recovery codes for 15 minutes. */
async function secondFactorWrong(env: Env, userId: string, lockKey: string, now: number): Promise<void> {
  const fails = await throttle.hit(env.DB, `totp-fail:${userId}`, TOTP_MAX_WRONG - 1, TOTP_LOCK_MS, now)
  if (!fails.allowed) await throttle.lock(env.DB, lockKey, now + TOTP_LOCK_MS, now).run()
}

const promoteSession = (env: Env, session: Session, now: number) => [
  env.DB.prepare("UPDATE sessions SET aal = 'aal2', totp_verified_at = ? WHERE token_hash = ?").bind(now, session.row.token_hash),
  throttle.clear(env.DB, `totp-fail:${session.user.id}`),
]

/** Signs out the user's other owner-console sessions (authenticator change, recovery with a lost phone). */
const revokeOtherOwnerSessions = (env: Env, session: Session, now: number) =>
  env.DB.prepare("UPDATE sessions SET revoked_at = ?1 WHERE user_id = ?2 AND host_context = 'owner' AND revoked_at IS NULL AND token_hash != ?3").bind(now, session.user.id, session.row.token_hash)

/** Re-authentication for credential changes (codes, authenticator): current password, 5 tries per 15 minutes. */
async function confirmPassword(env: Env, userId: string, password: unknown, now: number): Promise<void> {
  const limit = await throttle.hit(env.DB, `owner-reauth:${userId}`, 5, 15 * 60_000, now)
  if (!limit.allowed) throw new AppError(429, "TOO_MANY_ATTEMPTS", "Terlalu banyak percobaan, coba lagi dalam 15 menit.", {}, { "retry-after": String(Math.ceil(limit.retryAfterMs / 1000)) })
  const u = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(userId).first<{ password_hash: string }>()
  if (!u || typeof password !== "string" || !(await verifyPassword(password, env.AUTH_SESSION_PEPPER, u.password_hash))) {
    throw new AppError(400, "WRONG_PASSWORD", "Kata sandi saat ini salah.", { password: "Kata sandi saat ini salah." })
  }
}

/** Verifies a TOTP code and promotes the session; `wasPending` = this confirmed an enrolment. */
async function checkTotp(env: Env, session: Session, code: unknown, now: number): Promise<{ wasPending: boolean }> {
  const admin = await adminOf(env, session.user.id)
  if (!admin?.totp_secret_encrypted || admin.totp_state === "reset") throw notEnrolled()
  const lockKey = await secondFactorGate(env, session.user.id, now)
  const secret = await decryptString(env.KEK_SECRET, admin.totp_secret_encrypted, "totp")
  const step = await verifyTotp(secret, typeof code === "string" ? code.trim() : "", now, admin.totp_last_step)
  if (step === null) {
    await secondFactorWrong(env, session.user.id, lockKey, now)
    throw new AppError(400, "TOTP_INVALID", "Kode TOTP salah atau sudah dipakai.", { code: "Periksa kode di aplikasi autentikator." })
  }
  // Consume the step atomically (replay guard) and promote the session.
  const used = await env.DB.prepare("UPDATE super_admins SET totp_last_step = ?1, totp_state = 'active', updated_at = ?2 WHERE user_id = ?3 AND (totp_last_step IS NULL OR totp_last_step < ?1) RETURNING user_id")
    .bind(step, now, session.user.id)
    .first()
  if (!used) throw new AppError(400, "TOTP_INVALID", "Kode TOTP salah atau sudah dipakai.")
  await env.DB.batch(promoteSession(env, session, now))
  return { wasPending: admin.totp_state !== "active" }
}

export function ownerApi(): Hono<{ Bindings: Env; Variables: Vars }> {
  const app = new Hono<{ Bindings: Env; Variables: Vars }>().basePath("/api/owner")
  app.onError((err) => {
    if (!(err instanceof AppError)) console.error("OWNER_API_ERROR", err instanceof Error ? err.stack : err)
    return fromError(err)
  })
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
    if (res.newDevice) c.executionCtx.waitUntil(dispatchDue(c.env).then(() => undefined))
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
    const s = c.get("session")
    const t = now()
    const { wasPending } = await checkTotp(c.env, s, b.code, t)
    emit("auth.otp", { outcome: "totp_verified" }, {}, { env: c.env.GX_ENV })
    // DEC-246: the first confirmed enrolment comes with the backup codes, shown once.
    if (wasPending && (await recoveryStatus(c.env, s.user.id)).remaining === 0) {
      const { codes, statements } = await issueRecoveryCodes(c.env, s.user.id, t)
      await c.env.DB.batch([...statements, auditStatement(c.env, { actorId: s.user.id, action: "super_admin.recovery_codes_regenerate", targetType: "user", targetId: s.user.id, reason: "kode pemulihan pertama saat pendaftaran TOTP", now: t })])
      return ok({ aal: "aal2", recoveryCodes: codes })
    }
    return ok({ aal: "aal2" })
  })

  // DEC-246: a single-use recovery code instead of the TOTP code (phone lost or replaced). Same lock as TOTP.
  // `resetTotp` also returns a sealed new authenticator secret to pair at once and signs out the other owner sessions;
  // the active secret stays until a code from the new one verifies (rotate-confirm), so the account never reverts to
  // `pending` (where a password alone could enrol).
  r("POST", "/auth/totp/recovery", "owner_aal1", "self", async (c) => {
    const b = await body(c)
    const s = c.get("session")
    const t = now()
    const admin = await adminOf(c.env, s.user.id)
    if (!admin?.totp_secret_encrypted || admin.totp_state !== "active") throw notEnrolled()
    const lockKey = await secondFactorGate(c.env, s.user.id, t)
    const canonical = canonicalRecoveryCode(b.code)
    if (!canonical || !(await consumeRecoveryCode(c.env, s.user.id, canonical, t))) {
      await secondFactorWrong(c.env, s.user.id, lockKey, t)
      throw new AppError(400, "RECOVERY_CODE_INVALID", "Kode pemulihan salah atau sudah dipakai.", { code: "Periksa lagi kode pemulihan Anda." })
    }
    const resetTotp = b.resetTotp === true
    const { remaining } = await recoveryStatus(c.env, s.user.id)
    await c.env.DB.batch([
      ...promoteSession(c.env, s, t),
      ...(resetTotp ? [revokeOtherOwnerSessions(c.env, s, t)] : []),
      auditStatement(c.env, { actorId: s.user.id, action: "super_admin.recovery_code_used", targetType: "user", targetId: s.user.id, reason: "masuk dengan kode pemulihan cadangan", metadata: { remaining, resetTotp }, now: t }),
    ])
    emit("auth.otp", { outcome: "recovery_code_used" }, {}, { env: c.env.GX_ENV })
    if (!resetTotp) return ok({ aal: "aal2", remaining })
    const secret = newTotpSecret()
    return ok({ aal: "aal2", remaining, rotation: { ...(await sealRotation(c.env, s.user.id, secret, t)), secret, otpauthUri: otpauthUri(secret, s.user.email) } })
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
      // DEC-246: the old backup codes belong to the old enrolment; a new set comes with the next confirmation.
      c.env.DB.prepare("DELETE FROM super_admin_recovery_codes WHERE user_id = ?").bind(target),
      auditStatement(c.env, { actorId: actor.id, action: "super_admin.totp_reset", targetType: "user", targetId: target, reason, now: t }),
    ])
    if ((res[0]?.meta.changes ?? 0) !== 1) throw new AppError(404, "ADMIN_NOT_FOUND", "Super Admin tidak ditemukan.")
    return ok({ reset: true })
  })

  // DEC-246 `Profil & Keamanan Akun` (`/akun`): the Super Admin's own account. Reads and profile need aal2; credential
  // changes need a TOTP within 15 minutes plus the current password (email and password check it inside the helper).
  const SELF = "akun sendiri"
  const audit = (c: OwnerCtx, action: string, t: number, metadata?: unknown) =>
    auditStatement(c.env, { actorId: c.get("session").user.id, action, targetType: "user", targetId: c.get("session").user.id, reason: SELF, metadata, now: t })

  r("GET", "/account", "owner_aal2", "self", async (c) => {
    const s = c.get("session")
    const t = now()
    const admin = await c.env.DB.prepare("SELECT totp_state, enrolled_at, created_at FROM super_admins WHERE user_id = ?").bind(s.user.id).first<{ totp_state: string; enrolled_at: number | null; created_at: number }>()
    return ok({
      profile: { name: s.user.name, email: s.user.email, phone: s.user.phone },
      totp: { state: admin?.totp_state ?? "pending", enrolledAt: admin?.enrolled_at ?? admin?.created_at ?? null, totpRecentUntil: (s.row.totp_verified_at ?? 0) + RECENT_TOTP_MS },
      recoveryCodes: await recoveryStatus(c.env, s.user.id),
      sessions: await listSessions(c.env, s.user.id, s.row.token_hash, t, ["owner", "app"]),
    })
  })

  r("POST", "/account/profile", "owner_aal2", "self", async (c) => {
    const t = now()
    const profile = await updateProfile(c.env, c.get("session").user.id, await body(c), t)
    await audit(c, "super_admin.profile_updated", t).run()
    return ok({ profile })
  })

  r("POST", "/account/password", "owner_recent", "self", async (c) => {
    const s = c.get("session")
    const t = now()
    await changePassword(c.env, s.user.id, s.row.token_hash, await body(c), t)
    await audit(c, "super_admin.password_changed", t).run()
    return ok({ changed: true })
  })

  r("POST", "/account/email/request", "owner_recent", "self", async (c) => {
    return ok(await requestEmailChange(c.env, c.get("session").user.id, await body(c), await ipHash(c.env.AUTH_SESSION_PEPPER, c.req.raw), now()))
  })

  r("POST", "/account/email/confirm", "owner_recent", "self", async (c) => {
    const s = c.get("session")
    const t = now()
    const res = await confirmEmailChange(c.env, s.user.id, s.row.token_hash, await body(c), t)
    await audit(c, "super_admin.email_changed", t).run()
    return ok(res)
  })

  r("POST", "/account/recovery-codes", "owner_recent", "self", async (c) => {
    const s = c.get("session")
    const t = now()
    await confirmPassword(c.env, s.user.id, (await body(c)).password, t)
    const { codes, statements } = await issueRecoveryCodes(c.env, s.user.id, t)
    await c.env.DB.batch([...statements, auditStatement(c.env, { actorId: s.user.id, action: "super_admin.recovery_codes_regenerate", targetType: "user", targetId: s.user.id, reason: "buat ulang kode pemulihan cadangan", now: t })])
    return ok({ codes, generatedAt: t })
  })

  r("POST", "/account/totp/rotate-start", "owner_recent", "self", async (c) => {
    const s = c.get("session")
    const t = now()
    await confirmPassword(c.env, s.user.id, (await body(c)).password, t)
    const admin = await adminOf(c.env, s.user.id)
    if (!admin?.totp_secret_encrypted || admin.totp_state !== "active") throw notEnrolled()
    const secret = newTotpSecret()
    return ok({ ...(await sealRotation(c.env, s.user.id, secret, t)), secret, otpauthUri: otpauthUri(secret, s.user.email) })
  })

  r("POST", "/account/totp/rotate-confirm", "owner_recent", "self", async (c) => {
    const b = await body(c)
    const s = c.get("session")
    const t = now()
    const secret = await openRotation(c.env, b.rotateTicket, s.user.id, t)
    const admin = await adminOf(c.env, s.user.id)
    if (!admin?.totp_secret_encrypted || admin.totp_state !== "active") throw notEnrolled()
    // A ticket that was already confirmed carries the active secret: refuse the replay.
    if ((await decryptString(c.env.KEK_SECRET, admin.totp_secret_encrypted, "totp")) === secret) throw new AppError(400, "ROTATE_TICKET_INVALID", "Sesi penggantian autentikator sudah berakhir. Mulai lagi dari awal.")
    const step = await verifyTotp(secret, typeof b.code === "string" ? b.code.trim() : "", t, null)
    if (step === null) throw new AppError(400, "TOTP_INVALID", "Kode dari autentikator baru salah. Pastikan Anda memindai kode QR yang baru.", { code: "Periksa kode di autentikator baru." })
    // Swap only if nobody changed the secret meanwhile (optimistic check on the ciphertext we read).
    const swapped = await c.env.DB.prepare("UPDATE super_admins SET totp_secret_encrypted = ?1, totp_state = 'active', totp_last_step = ?2, updated_at = ?3 WHERE user_id = ?4 AND totp_secret_encrypted = ?5 RETURNING user_id")
      .bind(await encryptString(c.env.KEK_SECRET, secret, "totp"), step, t, s.user.id, admin.totp_secret_encrypted)
      .first()
    if (!swapped) throw new AppError(409, "TOTP_CHANGED", "Autentikator baru saja diganti dari sesi lain. Muat ulang halaman.")
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE sessions SET totp_verified_at = ? WHERE token_hash = ?").bind(t, s.row.token_hash),
      revokeOtherOwnerSessions(c.env, s, t),
      audit(c, "super_admin.totp_rotated", t),
    ])
    return ok({ rotated: true })
  })

  r("POST", "/account/sessions/revoke", "owner_aal2", "self", async (c) => {
    const b = await body(c)
    const s = c.get("session")
    return ok(await revokeSessions(c.env, s.user.id, s.row.token_hash, { id: b.id, all: b.all === true || b.allOthers === true }, now(), ["owner", "app"]))
  })

  registerGeraiAdmin(app)
  registerPricingAdmin(app)
  registerOverview(app)
  registerMonitor(app)
  registerSystem(app)
  registerLegal(app)

  return app
}

/** Paths a Super Admin route may never take (DEC-209 non-impersonation), checked by test and CI. */
export const IMPERSONATION_PATTERNS = [/\/shipments?(\/|$)/, /\/kiriman/, /\/orders?(\/|$)/, /pay-unpaid|mark-paid|tandai-lunas/i, /\/dispatch/, /\/cancel/, /\/receipts?/, /\/shift/, /impersonat/i, /\/login-as/]
