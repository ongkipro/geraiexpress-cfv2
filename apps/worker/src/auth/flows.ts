// Account lifecycles (TASK-105, PR-01, spec 05 §2, spec 12): sign-up by email OTP, login with sessions, password
// reset, Kasir invitations. Pure server logic over D1; HTTP wiring lives in routes.ts. Every user-facing message is
// Indonesian; no OTP, token, link or address is ever logged.
import { emit } from "@gx/telemetry"
import { decryptString, encryptString } from "../crypto/aead"
import { enqueueEmailStatement, emailHash, normalizeEmail } from "../email/outbox"
import { AppError } from "../http/envelope"
import { DUMMY_HASH, hashPassword, passwordProblem, verifyPassword } from "./password"
import { createSession, revokeOtherSessions } from "./session"
import * as throttle from "./throttle"
import { newOtp, newToken, tokenHash, TOKEN_RE } from "./tokens"
import type { HostContextName } from "./cookies"

export type AuthEnv = Pick<Env, "DB" | "AUTH_SESSION_PEPPER" | "KEK_SECRET" | "GX_ENV">

export const OTP_TTL_MS = 10 * 60_000
export const OTP_MAX_WRONG = 5
export const OTP_LOCK_MS = 15 * 60_000
export const OTP_PER_EMAIL = { limit: 3, windowMs: 15 * 60_000 }
export const OTP_PER_IP = { limit: 10, windowMs: 3600_000 }
export const TICKET_TTL_MS = 30 * 60_000
export const RESET_TTL_MS = 30 * 60_000
export const INVITE_TTL_MS = 7 * 24 * 3600_000
export const LOGIN_MAX_FAILS = 10
export const LOGIN_LOCK_MS = 15 * 60_000

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i

export function validEmail(raw: unknown): string {
  if (typeof raw !== "string" || !EMAIL_RE.test(raw.trim())) {
    throw new AppError(422, "INVALID_EMAIL", "Alamat email tidak valid.", { email: "Periksa kembali alamat email." })
  }
  return normalizeEmail(raw)
}

function validPassword(raw: unknown, email?: string): string {
  const pw = typeof raw === "string" ? raw : ""
  const problem = passwordProblem(pw, email)
  if (problem) throw new AppError(422, "WEAK_PASSWORD", problem, { password: problem })
  return pw
}

function validName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim() : ""
  if (name.length < 1 || name.length > 80) throw new AppError(422, "INVALID_NAME", "Nama wajib diisi (maksimal 80 karakter).", { name: "Nama wajib diisi." })
  return name
}

const tooMany = (retryAfterMs: number) =>
  new AppError(429, "TOO_MANY_ATTEMPTS", "Terlalu banyak percobaan, coba lagi dalam 15 menit.", {}, { "retry-after": String(Math.ceil(retryAfterMs / 1000)) })

// -------------------------------------------------------------------------------------------------------------
// Sign-up: request OTP → verify OTP (ticket) → complete account

/** Sends a sign-up OTP. Always answers the same way whether or not the address already has an account. */
export async function requestSignupOtp(env: AuthEnv, input: { email: unknown; ipHash: string; origin: string; now: number }): Promise<{ otpId: string }> {
  const email = validEmail(input.email)
  const eh = await emailHash(env.AUTH_SESSION_PEPPER, email)
  const perEmail = await throttle.hit(env.DB, `otp-send:${eh}`, OTP_PER_EMAIL.limit, OTP_PER_EMAIL.windowMs, input.now)
  const perIp = await throttle.hit(env.DB, `otp-send-ip:${input.ipHash}`, OTP_PER_IP.limit, OTP_PER_IP.windowMs, input.now)
  if (!perEmail.allowed || !perIp.allowed) throw tooMany(Math.max(perEmail.retryAfterMs, perIp.retryAfterMs))
  const otpId = crypto.randomUUID()
  const existing = await env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first()
  if (existing) {
    // Do not reveal registration state; the existing owner can use "Lupa kata sandi".
    emit("auth.otp", { outcome: "existing_account" }, {}, { env: env.GX_ENV, now: input.now })
    return { otpId }
  }
  const code = newOtp()
  const expiresAt = input.now + OTP_TTL_MS
  const mail = await enqueueEmailStatement(env, { templateId: "signup_otp", toEmail: email, vars: { code }, expiresAt, now: input.now })
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO email_otps (id, purpose, email_hash, email_encrypted, code_hash, ip_hash, attempts, expires_at, created_at)
       VALUES (?1, 'signup', ?2, ?3, ?4, ?5, 0, ?6, ?7)`,
    ).bind(otpId, eh, await encryptString(env.KEK_SECRET, email, "otp"), await tokenHash(env.AUTH_SESSION_PEPPER, "otp", `${otpId}:${code}`), input.ipHash, expiresAt, input.now),
    mail.statement,
  ])
  emit("auth.otp", { outcome: "sent" }, {}, { env: env.GX_ENV, now: input.now })
  return { otpId }
}

/** Verifies the 6-digit code; 5 wrong entries lock this email's OTP for 15 min. Returns a single-use ticket. */
export async function verifySignupOtp(env: AuthEnv, input: { otpId: unknown; code: unknown; now: number }): Promise<{ ticket: string }> {
  const otpId = typeof input.otpId === "string" ? input.otpId : ""
  const code = typeof input.code === "string" ? input.code.trim() : ""
  const invalid = () => new AppError(400, "OTP_INVALID", "Kode salah atau sudah kedaluwarsa. Periksa email Anda atau minta kode baru.", { code: "Kode tidak cocok." })
  if (!/^[0-9a-f-]{36}$/.test(otpId) || !/^\d{6}$/.test(code)) throw invalid()
  const row = await env.DB.prepare("SELECT id, email_hash, code_hash, attempts, expires_at, consumed_at FROM email_otps WHERE id = ? AND purpose = 'signup'")
    .bind(otpId)
    .first<{ id: string; email_hash: string; code_hash: string; attempts: number; expires_at: number; consumed_at: number | null }>()
  if (!row) throw invalid()
  const lockKey = `otp-lock:${row.email_hash}`
  const locked = await throttle.lockedUntil(env.DB, lockKey, input.now)
  if (locked) throw tooMany(locked - input.now)
  if (row.consumed_at !== null || input.now >= row.expires_at) throw invalid()
  const expected = await tokenHash(env.AUTH_SESSION_PEPPER, "otp", `${otpId}:${code}`)
  if (expected !== row.code_hash) {
    const attempts = row.attempts + 1
    const stmts = [env.DB.prepare("UPDATE email_otps SET attempts = ? WHERE id = ?").bind(attempts, otpId)]
    if (attempts >= OTP_MAX_WRONG) stmts.push(throttle.lock(env.DB, lockKey, input.now + OTP_LOCK_MS, input.now))
    await env.DB.batch(stmts)
    emit("auth.otp", { outcome: attempts >= OTP_MAX_WRONG ? "locked" : "wrong" }, {}, { env: env.GX_ENV, now: input.now })
    if (attempts >= OTP_MAX_WRONG) throw tooMany(OTP_LOCK_MS)
    throw invalid()
  }
  const ticket = newToken()
  const consumed = await env.DB.prepare(
    "UPDATE email_otps SET consumed_at = ?1, ticket_hash = ?2, ticket_expires_at = ?3 WHERE id = ?4 AND consumed_at IS NULL RETURNING id",
  )
    .bind(input.now, await tokenHash(env.AUTH_SESSION_PEPPER, "ticket", ticket), input.now + TICKET_TTL_MS, otpId)
    .first()
  if (!consumed) throw invalid() // replay of an already-consumed code
  emit("auth.otp", { outcome: "verified" }, {}, { env: env.GX_ENV, now: input.now })
  return { ticket }
}

/** Creates the account from a verified ticket (single use) and signs the user in on the app host. */
export async function completeSignup(
  env: AuthEnv,
  input: { ticket: unknown; name: unknown; password: unknown; deviceHash: string | null; userAgent: string | null; now: number },
): Promise<{ userId: string; sessionToken: string; maxAgeSeconds: number }> {
  const ticket = typeof input.ticket === "string" ? input.ticket : ""
  const expired = () => new AppError(400, "SIGNUP_TICKET_INVALID", "Sesi pendaftaran sudah berakhir. Silakan mulai lagi dari verifikasi email.")
  if (!TOKEN_RE.test(ticket)) throw expired()
  const th = await tokenHash(env.AUTH_SESSION_PEPPER, "ticket", ticket)
  const otp = await env.DB.prepare("SELECT id, email_encrypted, ticket_expires_at FROM email_otps WHERE ticket_hash = ? AND purpose = 'signup'")
    .bind(th)
    .first<{ id: string; email_encrypted: string; ticket_expires_at: number }>()
  if (!otp || input.now >= otp.ticket_expires_at) throw expired()
  const email = await decryptString(env.KEK_SECRET, otp.email_encrypted, "otp")
  const name = validName(input.name)
  const password = validPassword(input.password, email)
  const userId = crypto.randomUUID()
  const session = await createSession(env, { userId, ctx: "app", activeTenantId: null, deviceHash: input.deviceHash, userAgent: input.userAgent, now: input.now })
  const stmts = [
    // Burn the ticket first: a replay (or a double submit) matches zero rows and the batch fails on the INSERT below.
    env.DB.prepare("UPDATE email_otps SET ticket_hash = NULL, ticket_expires_at = NULL WHERE id = ? AND ticket_hash = ?").bind(otp.id, th),
    env.DB.prepare(
      `INSERT INTO users (id, email, name, password_hash, status, email_verified_at, password_changed_at, created_at, updated_at)
       SELECT ?1, ?2, ?3, ?4, 'active', ?5, ?5, ?5, ?5 WHERE changes() = 1`,
    ).bind(userId, email, name, await hashPassword(password, env.AUTH_SESSION_PEPPER), input.now),
  ]
  let results: D1Result[]
  try {
    results = await env.DB.batch(stmts)
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new AppError(409, "EMAIL_TAKEN", "Email ini sudah terdaftar. Silakan masuk atau gunakan Lupa kata sandi.")
    throw err
  }
  if ((results[1]?.meta.changes ?? 0) !== 1) throw expired()
  await env.DB.batch([
    session.statement,
    env.DB.prepare("INSERT INTO known_devices (user_id, device_hash, first_seen_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING").bind(userId, input.deviceHash ?? "unknown", input.now),
  ])
  return { userId, sessionToken: session.token, maxAgeSeconds: session.maxAgeSeconds }
}

// -------------------------------------------------------------------------------------------------------------
// Login / logout

export interface LoginResult {
  sessionToken: string
  maxAgeSeconds: number
  userId: string
  newDevice: boolean
}

/** Password login for a host context. Super Admin TOTP (aal2) is enforced by TASK-106 on the owner host. */
export async function login(
  env: AuthEnv,
  input: { email: unknown; password: unknown; ctx: HostContextName; ipHash: string; deviceHash: string | null; userAgent: string | null; origin: string; now: number; isSuperAdmin?: (userId: string) => Promise<boolean> },
): Promise<LoginResult> {
  const email = validEmail(input.email)
  const password = typeof input.password === "string" ? input.password : ""
  const eh = await emailHash(env.AUTH_SESSION_PEPPER, email)
  const lockKey = `login-lock:${eh}`
  const locked = await throttle.lockedUntil(env.DB, lockKey, input.now)
  if (locked) throw tooMany(locked - input.now)
  const ipLimit = await throttle.hit(env.DB, `login-ip:${input.ipHash}`, 50, 15 * 60_000, input.now)
  if (!ipLimit.allowed) throw tooMany(ipLimit.retryAfterMs)
  const user = await env.DB.prepare("SELECT id, name, password_hash, status FROM users WHERE email = ?").bind(email).first<{ id: string; name: string; password_hash: string; status: string }>()
  const ok = await verifyPassword(password, env.AUTH_SESSION_PEPPER, user?.password_hash ?? DUMMY_HASH)
  const allowedHere = user && ok && user.status === "active" && (input.ctx === "app" || (input.isSuperAdmin ? await input.isSuperAdmin(user.id) : false))
  if (!user || !allowedHere) {
    const fails = await throttle.hit(env.DB, `login-fail:${eh}`, LOGIN_MAX_FAILS, LOGIN_LOCK_MS, input.now)
    if (!fails.allowed) await throttle.lock(env.DB, lockKey, input.now + LOGIN_LOCK_MS, input.now).run()
    emit("auth.otp", { outcome: "login_failed" }, {}, { env: env.GX_ENV, now: input.now })
    throw new AppError(401, "LOGIN_FAILED", "Email atau kata sandi salah.")
  }
  const membership = input.ctx === "app"
    ? await env.DB.prepare("SELECT tenant_id FROM tenant_members WHERE user_id = ? AND status = 'active' ORDER BY created_at LIMIT 1").bind(user.id).first<{ tenant_id: string }>()
    : null
  const session = await createSession(env, { userId: user.id, ctx: input.ctx, activeTenantId: membership?.tenant_id ?? null, deviceHash: input.deviceHash, userAgent: input.userAgent, now: input.now })
  const device = input.deviceHash ?? "unknown"
  const known = await env.DB.prepare("SELECT 1 FROM known_devices WHERE user_id = ? AND device_hash = ?").bind(user.id, device).first()
  const stmts = [
    session.statement,
    env.DB.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(input.now, user.id),
    throttle.clear(env.DB, `login-fail:${eh}`),
    env.DB.prepare("INSERT INTO known_devices (user_id, device_hash, first_seen_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING").bind(user.id, device, input.now),
  ]
  const newDevice = !known
  // security_alert on a new device for gerai owners (app) and Super Admins (owner) — spec 12 §1.
  const isOwnerRole = input.ctx === "owner" || (await env.DB.prepare("SELECT 1 FROM tenant_members WHERE user_id = ? AND role = 'gerai_admin' AND status = 'active'").bind(user.id).first())
  if (newDevice && isOwnerRole) {
    const when = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(input.now) + " WIB"
    const mail = await enqueueEmailStatement(env, {
      templateId: "security_alert",
      toEmail: email,
      vars: { when, device: describeDevice(input.userAgent), link: `${input.origin}/akun` },
      expiresAt: input.now + 24 * 3600_000,
      now: input.now,
    })
    stmts.push(mail.statement)
  }
  await env.DB.batch(stmts)
  return { sessionToken: session.token, maxAgeSeconds: session.maxAgeSeconds, userId: user.id, newDevice }
}

export function describeDevice(ua: string | null): string {
  if (!ua) return "perangkat tidak dikenal"
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "peramban"
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "sistem lain"
  return `${browser} di ${os}`
}

// -------------------------------------------------------------------------------------------------------------
// Password reset

/** Always answers the same way (no account enumeration). */
export async function requestPasswordReset(env: AuthEnv, input: { email: unknown; ipHash: string; origin: string; now: number }): Promise<void> {
  const email = validEmail(input.email)
  const eh = await emailHash(env.AUTH_SESSION_PEPPER, email)
  const perEmail = await throttle.hit(env.DB, `reset-send:${eh}`, OTP_PER_EMAIL.limit, OTP_PER_EMAIL.windowMs, input.now)
  const perIp = await throttle.hit(env.DB, `otp-send-ip:${input.ipHash}`, OTP_PER_IP.limit, OTP_PER_IP.windowMs, input.now)
  if (!perEmail.allowed || !perIp.allowed) throw tooMany(Math.max(perEmail.retryAfterMs, perIp.retryAfterMs))
  const user = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND status = 'active'").bind(email).first<{ id: string }>()
  if (!user) return
  const token = newToken()
  const expiresAt = input.now + RESET_TTL_MS
  const mail = await enqueueEmailStatement(env, { templateId: "password_reset", toEmail: email, vars: { link: `${input.origin}/atur-sandi/${token}` }, expiresAt, now: input.now })
  await env.DB.batch([
    env.DB.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(await tokenHash(env.AUTH_SESSION_PEPPER, "reset", token), user.id, expiresAt, input.now),
    mail.statement,
  ])
}

/** Single-use; sets the new password and revokes every session of the user (spec 05 §2, TASK-105). */
export async function resetPassword(env: AuthEnv, input: { token: unknown; password: unknown; now: number }): Promise<void> {
  const token = typeof input.token === "string" ? input.token : ""
  const invalid = () => new AppError(400, "RESET_INVALID", "Tautan atur ulang kata sandi tidak berlaku atau sudah dipakai. Silakan minta tautan baru.")
  if (!TOKEN_RE.test(token)) throw invalid()
  const th = await tokenHash(env.AUTH_SESSION_PEPPER, "reset", token)
  const row = await env.DB.prepare("SELECT r.user_id, r.expires_at, r.consumed_at, u.email FROM password_resets r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ?")
    .bind(th)
    .first<{ user_id: string; expires_at: number; consumed_at: number | null; email: string }>()
  if (!row || row.consumed_at !== null || input.now >= row.expires_at) throw invalid()
  const password = validPassword(input.password, row.email)
  const results = await env.DB.batch([
    env.DB.prepare("UPDATE password_resets SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL").bind(input.now, th),
    env.DB.prepare("UPDATE users SET password_hash = ?1, password_changed_at = ?2, updated_at = ?2 WHERE id = ?3 AND changes() = 1").bind(await hashPassword(password, env.AUTH_SESSION_PEPPER), input.now, row.user_id),
    revokeOtherSessions(env.DB, row.user_id, null, input.now),
    // Outstanding reset links die with the password change.
    env.DB.prepare("UPDATE password_resets SET consumed_at = ? WHERE user_id = ? AND consumed_at IS NULL").bind(input.now, row.user_id),
  ])
  if ((results[0]?.meta.changes ?? 0) !== 1) throw invalid()
}

// -------------------------------------------------------------------------------------------------------------
// Invitations (single use, 7 days, role fixed at invite time)

export async function createInvitation(
  env: AuthEnv,
  input: { tenantId: string; tenantName: string; inviterId: string; inviterName: string; email: unknown; role?: "cashier"; origin: string; now: number },
): Promise<{ expiresAt: number }> {
  const email = validEmail(input.email)
  const member = await env.DB.prepare("SELECT 1 FROM tenant_members m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ? AND u.email = ? AND m.status = 'active'").bind(input.tenantId, email).first()
  if (member) throw new AppError(409, "ALREADY_MEMBER", "Email ini sudah menjadi anggota gerai.")
  const token = newToken()
  const expiresAt = input.now + INVITE_TTL_MS
  const mail = await enqueueEmailStatement(env, {
    templateId: "kasir_invite",
    toEmail: email,
    vars: { link: `${input.origin}/undangan/${token}`, outletName: input.tenantName, inviterName: input.inviterName },
    expiresAt,
    now: input.now,
  })
  await env.DB.batch([
    // A newer invitation to the same address replaces older open ones.
    env.DB.prepare("UPDATE invitations SET revoked_at = ? WHERE tenant_id = ? AND email = ? AND consumed_at IS NULL AND revoked_at IS NULL").bind(input.now, input.tenantId, email),
    env.DB.prepare(
      "INSERT INTO invitations (token_hash, tenant_id, email_hash, email, role, invited_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(await tokenHash(env.AUTH_SESSION_PEPPER, "invite", token), input.tenantId, await emailHash(env.AUTH_SESSION_PEPPER, email), email, input.role ?? "cashier", input.inviterId, expiresAt, input.now),
    mail.statement,
  ])
  return { expiresAt }
}

export interface InvitationView {
  outletName: string
  inviterName: string
  email: string
  role: "cashier" | "gerai_admin"
  accountExists: boolean
}

async function openInvitation(env: AuthEnv, token: string, now: number) {
  const invalid = () => new AppError(400, "INVITE_INVALID", "Undangan tidak berlaku, sudah dipakai, atau sudah kedaluwarsa. Minta pemilik gerai mengirim undangan baru.")
  if (!TOKEN_RE.test(token)) throw invalid()
  const th = await tokenHash(env.AUTH_SESSION_PEPPER, "invite", token)
  const row = await env.DB.prepare(
    `SELECT i.token_hash, i.tenant_id, i.email, i.role, i.expires_at, i.consumed_at, i.revoked_at, t.name AS outlet_name, t.status AS tenant_status, u.name AS inviter_name
     FROM invitations i JOIN tenants t ON t.id = i.tenant_id JOIN users u ON u.id = i.invited_by WHERE i.token_hash = ?`,
  )
    .bind(th)
    .first<{ token_hash: string; tenant_id: string; email: string; role: "cashier" | "gerai_admin"; expires_at: number; consumed_at: number | null; revoked_at: number | null; outlet_name: string; tenant_status: string; inviter_name: string }>()
  if (!row || row.consumed_at !== null || row.revoked_at !== null || now >= row.expires_at || row.tenant_status === "suspended") throw invalid()
  return row
}

export async function viewInvitation(env: AuthEnv, token: unknown, now: number): Promise<InvitationView> {
  const row = await openInvitation(env, typeof token === "string" ? token : "", now)
  const exists = await env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(row.email).first()
  return { outletName: row.outlet_name, inviterName: row.inviter_name, email: row.email, role: row.role, accountExists: !!exists }
}

/** Accepts once: creates the account (new email) or verifies the password (existing account), then adds the membership. */
export async function acceptInvitation(
  env: AuthEnv,
  input: { token: unknown; name: unknown; password: unknown; deviceHash: string | null; userAgent: string | null; now: number },
): Promise<{ userId: string; tenantId: string; sessionToken: string; maxAgeSeconds: number }> {
  const row = await openInvitation(env, typeof input.token === "string" ? input.token : "", input.now)
  const existing = await env.DB.prepare("SELECT id, password_hash, status FROM users WHERE email = ?").bind(row.email).first<{ id: string; password_hash: string; status: string }>()
  let userId: string
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare("UPDATE invitations SET consumed_at = ?1, consumed_by = ?2 WHERE token_hash = ?3 AND consumed_at IS NULL AND revoked_at IS NULL"),
  ]
  if (existing) {
    const ok = existing.status === "active" && (await verifyPassword(typeof input.password === "string" ? input.password : "", env.AUTH_SESSION_PEPPER, existing.password_hash))
    if (!ok) throw new AppError(401, "LOGIN_FAILED", "Kata sandi salah untuk akun dengan email ini.")
    userId = existing.id
  } else {
    userId = crypto.randomUUID()
    const name = validName(input.name)
    const password = validPassword(input.password, row.email)
    stmts.push(
      env.DB.prepare(
        `INSERT INTO users (id, email, name, password_hash, status, email_verified_at, password_changed_at, created_at, updated_at)
         SELECT ?1, ?2, ?3, ?4, 'active', ?5, ?5, ?5, ?5 WHERE changes() = 1`,
      ).bind(userId, row.email, name, await hashPassword(password, env.AUTH_SESSION_PEPPER), input.now),
    )
  }
  stmts[0] = stmts[0]!.bind(input.now, userId, row.token_hash)
  // The membership is written only if THIS request consumed the invitation (race-safe single use).
  stmts.push(
    env.DB.prepare(
      `INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at)
       SELECT ?1, ?2, ?3, 'active', ?4 WHERE EXISTS (SELECT 1 FROM invitations WHERE token_hash = ?5 AND consumed_by = ?2 AND consumed_at = ?4)
       ON CONFLICT(tenant_id, user_id) DO UPDATE SET role = excluded.role, status = 'active', revoked_at = NULL`,
    ).bind(row.tenant_id, userId, row.role, input.now, row.token_hash),
  )
  let results: D1Result[]
  try {
    results = await env.DB.batch(stmts)
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new AppError(409, "EMAIL_TAKEN", "Email ini sudah terdaftar. Masuk dengan kata sandi akun tersebut.")
    throw err
  }
  if ((results[0]?.meta.changes ?? 0) !== 1) throw new AppError(400, "INVITE_INVALID", "Undangan sudah dipakai.")
  const session = await createSession(env, { userId, ctx: "app", activeTenantId: row.tenant_id, deviceHash: input.deviceHash, userAgent: input.userAgent, now: input.now })
  await session.statement.run()
  return { userId, tenantId: row.tenant_id, sessionToken: session.token, maxAgeSeconds: session.maxAgeSeconds }
}
