// `Akun Saya` (TASK-310, DEC-229, visual 07 `/akun`, spec 05 §2, spec 12): profile, password change, email change
// by OTP to the new address, and the session list with revoke. Never logs an address, code or token.
import { emit } from "@gx/telemetry"
import { decryptString, encryptString } from "../../crypto/aead"
import { emailHash, enqueueEmailStatement } from "../../email/outbox"
import { AppError } from "../../http/envelope"
import { normalizePhone08 } from "@gx/domain/contacts"
import { hashPassword, passwordProblem, verifyPassword } from "../password"
import { revokeOtherSessions } from "../session"
import type { HostContextName } from "../cookies"
import * as throttle from "../throttle"
import { newOtp, tokenHash } from "../tokens"
import { describeDevice, OTP_LOCK_MS, OTP_MAX_WRONG, OTP_PER_EMAIL, OTP_TTL_MS, validEmail, type AuthEnv } from "../flows"

const tooMany = (ms: number) => new AppError(429, "TOO_MANY_ATTEMPTS", "Terlalu banyak percobaan, coba lagi dalam 15 menit.", {}, { "retry-after": String(Math.ceil(ms / 1000)) })

export async function updateProfile(env: AuthEnv, userId: string, b: { name?: unknown; phone?: unknown }, now: number): Promise<{ name: string; phone: string | null }> {
  const name = typeof b.name === "string" ? b.name.trim() : ""
  const errors: Record<string, string> = {}
  if (name.length < 1 || name.length > 80) errors.name = "Nama wajib diisi (maksimal 80 karakter)."
  const phone = b.phone === "" || b.phone == null ? null : normalizePhone08(b.phone)
  if (b.phone && !phone) errors.phone = "Nomor HP tidak valid."
  if (Object.keys(errors).length) throw new AppError(422, "INVALID_PROFILE", Object.values(errors)[0]!, errors)
  await env.DB.prepare("UPDATE users SET name = ?, phone = ?, updated_at = ? WHERE id = ?").bind(name, phone, now, userId).run()
  return { name, phone }
}

/** Needs the current password; on success every other session is signed out (spec 05 §2). */
export async function changePassword(env: AuthEnv, userId: string, keepHash: string, b: { current?: unknown; next?: unknown }, now: number): Promise<void> {
  const u = await env.DB.prepare("SELECT email, password_hash FROM users WHERE id = ?").bind(userId).first<{ email: string; password_hash: string }>()
  if (!u) throw new AppError(401, "UNAUTHENTICATED", "Sesi Anda berakhir. Silakan masuk lagi.")
  const limit = await throttle.hit(env.DB, `pwchange:${userId}`, 5, 15 * 60_000, now)
  if (!limit.allowed) throw tooMany(limit.retryAfterMs)
  if (typeof b.current !== "string" || !(await verifyPassword(b.current, env.AUTH_SESSION_PEPPER, u.password_hash))) throw new AppError(400, "WRONG_PASSWORD", "Kata sandi saat ini salah.", { current: "Kata sandi saat ini salah." })
  const next = typeof b.next === "string" ? b.next : ""
  const problem = passwordProblem(next, u.email)
  if (problem) throw new AppError(422, "WEAK_PASSWORD", problem, { next: problem })
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?1, password_changed_at = ?2, updated_at = ?2 WHERE id = ?3").bind(await hashPassword(next, env.AUTH_SESSION_PEPPER), now, userId),
    revokeOtherSessions(env.DB, userId, keepHash, now),
    env.DB.prepare("UPDATE password_resets SET consumed_at = ? WHERE user_id = ? AND consumed_at IS NULL").bind(now, userId),
  ])
}

export const EMAIL_CHANGE_PW_LIMIT = 5

/** Sends a 6-digit code to the NEW address (needs the current password). Same answer when the address is taken. */
export async function requestEmailChange(env: AuthEnv, userId: string, b: { email?: unknown; password?: unknown }, ip: string, now: number): Promise<{ otpId: string }> {
  const email = validEmail(b.email)
  const u = await env.DB.prepare("SELECT email, password_hash FROM users WHERE id = ?").bind(userId).first<{ email: string; password_hash: string }>()
  if (!u) throw new AppError(401, "UNAUTHENTICATED", "Sesi Anda berakhir. Silakan masuk lagi.")
  if (email === u.email) throw new AppError(422, "SAME_EMAIL", "Email baru sama dengan email sekarang.", { email: "Masukkan alamat lain." })
  // DEC-246 Sol R1 #2: bound password guesses per user BEFORE verifying (the key ignores the proposed address, so
  // changing it never resets the count). 5 attempts per 15 minutes, right or wrong.
  const guess = await throttle.hit(env.DB, `email-change-pw:${userId}`, EMAIL_CHANGE_PW_LIMIT, 15 * 60_000, now)
  if (!guess.allowed) throw tooMany(guess.retryAfterMs)
  if (typeof b.password !== "string" || !(await verifyPassword(b.password, env.AUTH_SESSION_PEPPER, u.password_hash))) throw new AppError(400, "WRONG_PASSWORD", "Kata sandi saat ini salah.", { password: "Kata sandi saat ini salah." })
  // A locked confirmation also blocks new codes (a code sent now would expire before the lock lifts).
  const locked = await throttle.lockedUntil(env.DB, `email-change-lock:${userId}`, now)
  if (locked) throw tooMany(locked - now)
  const eh = await emailHash(env.AUTH_SESSION_PEPPER, email)
  const perUser = await throttle.hit(env.DB, `email-change-send:${userId}`, OTP_PER_EMAIL.limit, OTP_PER_EMAIL.windowMs, now)
  if (!perUser.allowed) throw tooMany(perUser.retryAfterMs)
  const otpId = crypto.randomUUID()
  const expiresAt = now + OTP_TTL_MS
  const taken = await env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first()
  // A taken address gets an unmatchable row (no email): confirm then behaves exactly as for a free address.
  const code = taken ? null : newOtp()
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare("UPDATE email_otps SET expires_at = ?1 WHERE user_id = ?2 AND purpose = 'email_change' AND consumed_at IS NULL AND expires_at > ?1").bind(now, userId),
    env.DB.prepare(
      `INSERT INTO email_otps (id, purpose, email_hash, user_id, email_encrypted, code_hash, ip_hash, attempts, expires_at, created_at)
       VALUES (?1, 'email_change', ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8)`,
    ).bind(otpId, eh, userId, await encryptString(env.KEK_SECRET, email, "otp"), code ? await tokenHash(env.AUTH_SESSION_PEPPER, "otp", `${otpId}:${code}`) : `existing:${crypto.randomUUID()}`, ip, expiresAt, now),
  ]
  if (code) stmts.push((await enqueueEmailStatement(env, { templateId: "email_change_otp", toEmail: email, vars: { code }, expiresAt, now })).statement)
  await env.DB.batch(stmts)
  if (taken) {
    emit("auth.otp", { outcome: "email_change_taken" }, {}, { env: env.GX_ENV, now })
    return { otpId }
  }
  emit("auth.otp", { outcome: "email_change_sent" }, {}, { env: env.GX_ENV, now })
  return { otpId }
}

/** Confirms the code; 5 wrong → 15 min lock. Replaces the email and signs out every other session. */
export async function confirmEmailChange(env: AuthEnv, userId: string, keepHash: string, b: { otpId?: unknown; code?: unknown }, now: number): Promise<{ email: string }> {
  const otpId = typeof b.otpId === "string" ? b.otpId : ""
  const code = typeof b.code === "string" ? b.code.trim() : ""
  const invalid = () => new AppError(400, "OTP_INVALID", "Kode salah atau sudah kedaluwarsa. Minta kode baru.", { code: "Kode tidak cocok." })
  if (!/^[0-9a-f-]{36}$/.test(otpId) || !/^\d{6}$/.test(code)) throw invalid()
  const lockKey = `email-change-lock:${userId}`
  const locked = await throttle.lockedUntil(env.DB, lockKey, now)
  if (locked) throw tooMany(locked - now)
  const row = await env.DB.prepare("SELECT code_hash, attempts, expires_at, consumed_at, email_encrypted FROM email_otps WHERE id = ? AND purpose = 'email_change' AND user_id = ?")
    .bind(otpId, userId)
    .first<{ code_hash: string; attempts: number; expires_at: number; consumed_at: number | null; email_encrypted: string }>()
  if (!row || row.consumed_at !== null || now >= row.expires_at) throw invalid()
  if ((await tokenHash(env.AUTH_SESSION_PEPPER, "otp", `${otpId}:${code}`)) !== row.code_hash) {
    const wrong = await throttle.hit(env.DB, `email-change-wrong:${userId}`, OTP_MAX_WRONG - 1, OTP_LOCK_MS, now)
    const stmts = [env.DB.prepare("UPDATE email_otps SET attempts = attempts + 1 WHERE id = ?").bind(otpId)]
    if (!wrong.allowed) stmts.push(throttle.lock(env.DB, lockKey, now + OTP_LOCK_MS, now), throttle.clear(env.DB, `email-change-wrong:${userId}`))
    await env.DB.batch(stmts)
    if (!wrong.allowed) throw tooMany(OTP_LOCK_MS)
    throw invalid()
  }
  const email = await decryptString(env.KEK_SECRET, row.email_encrypted, "otp")
  try {
    const res = await env.DB.batch([
      env.DB.prepare("UPDATE email_otps SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL").bind(now, otpId),
      env.DB.prepare("UPDATE users SET email = ?1, email_verified_at = ?2, updated_at = ?2 WHERE id = ?3 AND changes() = 1").bind(email, now, userId),
      revokeOtherSessions(env.DB, userId, keepHash, now),
    ])
    if ((res[0]?.meta.changes ?? 0) !== 1) throw invalid()
  } catch (e) {
    if (e instanceof AppError) throw e
    // UNIQUE(email): someone registered the address after the code was sent.
    throw new AppError(409, "EMAIL_TAKEN", "Email ini tidak bisa dipakai. Gunakan alamat lain.", { email: "Gunakan alamat lain." })
  }
  emit("auth.otp", { outcome: "email_changed" }, {}, { env: env.GX_ENV, now })
  return { email }
}

export interface SessionItem {
  id: string
  host: HostContextName
  device: string
  createdAt: number
  lastSeenAt: number
  current: boolean
}

const inContexts = (contexts: HostContextName[]) => `host_context IN (${contexts.map((c) => `'${c === "owner" ? "owner" : "app"}'`).join(",")})`

/** Live sessions of the user on the given hosts (app only by default; the Super Admin `/akun` lists owner + app).
 *  `id` is a short public handle, never the stored hash. */
export async function listSessions(env: AuthEnv, userId: string, currentHash: string, now: number, contexts: HostContextName[] = ["app"]): Promise<SessionItem[]> {
  const rows = await env.DB.prepare(
    `SELECT token_hash, host_context, user_agent, created_at, last_seen_at FROM sessions
     WHERE user_id = ? AND ${inContexts(contexts)} AND revoked_at IS NULL AND expires_at > ? AND absolute_expires_at > ? ORDER BY last_seen_at DESC LIMIT 20`,
  )
    .bind(userId, now, now)
    .all<{ token_hash: string; host_context: HostContextName; user_agent: string | null; created_at: number; last_seen_at: number }>()
  return Promise.all(
    rows.results.map(async (r) => ({ id: await handleOf(env, r.token_hash), host: r.host_context, device: describeDevice(r.user_agent), createdAt: r.created_at, lastSeenAt: r.last_seen_at, current: r.token_hash === currentHash })),
  )
}

const handleOf = async (env: AuthEnv, hash: string) => (await tokenHash(env.AUTH_SESSION_PEPPER, "session-handle", hash)).slice(0, 24)

/** Revokes one other session by handle, or every other session (`all`). The current session stays. */
export async function revokeSessions(env: AuthEnv, userId: string, currentHash: string, b: { id?: unknown; all?: unknown }, now: number, contexts: HostContextName[] = ["app"]): Promise<{ revoked: number }> {
  if (b.all === true) {
    const r = await revokeOtherSessions(env.DB, userId, currentHash, now).run()
    return { revoked: r.meta.changes ?? 0 }
  }
  const id = typeof b.id === "string" ? b.id : ""
  const rows = await env.DB.prepare(`SELECT token_hash FROM sessions WHERE user_id = ? AND ${inContexts(contexts)} AND revoked_at IS NULL`).bind(userId).all<{ token_hash: string }>()
  for (const r of rows.results) {
    if (r.token_hash === currentHash) continue
    if ((await handleOf(env, r.token_hash)) === id) {
      await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND user_id = ?").bind(now, r.token_hash, userId).run()
      return { revoked: 1 }
    }
  }
  throw new AppError(404, "SESSION_NOT_FOUND", "Sesi tidak ditemukan atau sudah keluar.")
}
