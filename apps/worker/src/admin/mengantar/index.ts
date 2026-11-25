// Super Admin Mengantar Partner API configuration (`Sistem & Audit › Integrasi Mengantar`).
// Secrets are encrypted at rest under KEK_SECRET (AES-256-GCM) and never returned in responses or written to logs.
// Every save or connection test requires recent TOTP (`owner_recent`) and writes an audit_logs entry.
import type { Hono } from "hono"
import { register } from "../../api/registry"
import { auditStatement, ownerGuard, requireReason, type OwnerCtx } from "../../api/owner"
import { hit } from "../../auth/throttle"
import { encryptString } from "../../crypto/aead"
import { AppError, ok } from "../../http/envelope"
import { clearMengantarConfigCache, loadMengantarConfig, PARTNER_SECRET_AAD, resolvePartnerClient } from "../../mengantar/factory"
import { PER_MINUTE, quotaFor, REGISTRATIONS_PER_DAY } from "../../do/partner-quota"
import { relayHealth } from "../audit"

async function body(c: OwnerCtx): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json()
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$)/i

/** Strict HTTPS origin validation (anti-SSRF): scheme https only, no userinfo/path/query, no IP literal/localhost. */
function validHttpsOrigin(raw: string): string | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash || (u.pathname && u.pathname !== "/")) return null
  if (!u.hostname.includes(".") || PRIVATE_HOST.test(u.hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) return null
  return u.origin
}

const maskTail = (tail: string | null) => (tail ? `••••••••${tail}` : null)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerMengantarAdmin(app: Hono<any>): void {
  const r = (method: "GET" | "POST", path: string, auth: "owner_aal2" | "owner_recent", handler: (c: OwnerCtx) => Promise<Response>) =>
    register(app, { context: "owner", method, path, auth, projection: "role" }, ownerGuard, (c) => handler(c as OwnerCtx))

  r("GET", "/sistem/mengantar", "owner_aal2", async (c) => {
    const [cfg, partnerQuota] = await Promise.all([
      loadMengantarConfig(c.env, { bypassCache: true }),
      quotaFor(c.env).usage(Date.now()).catch(() => null),
    ])
    return ok({
      environment: c.env.GX_ENV === "production" ? "production" : c.env.GX_ENV === "staging" ? "staging" : "local",
      transport: cfg.transport,
      partnerId: cfg.partnerId,
      partnerOrigin: c.env.MENGANTAR_PARTNER_ORIGIN === "mock" ? "mock" : cfg.partnerOrigin,
      publicOrigin: c.env.MENGANTAR_PUBLIC_ORIGIN === "mock" ? "mock" : cfg.publicOrigin,
      relayUrl: cfg.relayUrl,
      hasPartnerSecret: cfg.partnerSecretSource !== "placeholder",
      partnerSecretSource: cfg.partnerSecretSource,
      partnerSecretMasked: maskTail(cfg.partnerSecretTail),
      hasRelaySecret: cfg.relaySecretSource !== "placeholder",
      relaySecretSource: cfg.relaySecretSource,
      relaySecretMasked: maskTail(cfg.relaySecretTail),
      updatedAt: cfg.updatedAt,
      partnerQuota,
      partnerLimits: { perMinute: PER_MINUTE, registrationsPerDay: REGISTRATIONS_PER_DAY },
    })
  })

  r("POST", "/sistem/mengantar", "owner_recent", async (c) => {
    const b = await body(c)
    const reason = requireReason(b.reason)
    const errors: Record<string, string> = {}
    const set: Record<string, string | null> = {}

    if ("partnerId" in b) {
      const s = typeof b.partnerId === "string" ? b.partnerId.trim() : ""
      if (!s) set.partner_id = null
      else if (!/^[A-Za-z0-9_.-]{2,80}$/.test(s)) errors.partnerId = "Partner ID hanya boleh huruf, angka, titik, garis bawah, atau tanda hubung (2–80 karakter)."
      else set.partner_id = s
    }

    for (const [field, col, label] of [
      ["partnerOrigin", "partner_origin", "Partner API Origin"],
      ["publicOrigin", "public_origin", "Public API Origin"],
      ["relayUrl", "relay_url", "URL Partner Relay"],
    ] as const) {
      if (!(field in b)) continue
      const s = typeof b[field] === "string" ? b[field].trim() : ""
      if (!s) {
        set[col] = null
      } else {
        const origin = validHttpsOrigin(s)
        if (!origin) errors[field] = `${label} harus berupa origin HTTPS yang valid tanpa path (contoh: https://api-public.mengantar.com).`
        else set[col] = origin
      }
    }

    if ("partnerSecret" in b) {
      const v = b.partnerSecret
      if (v === null) {
        set.partner_secret_encrypted = null
        set.partner_secret_tail = null
      } else if (typeof v === "string" && v.trim().length > 0) {
        const s = v.trim()
        if (s.length < 8 || s.length > 256 || /\s/.test(s)) errors.partnerSecret = "Partner Secret minimal 8 karakter dan tanpa spasi."
        else {
          set.partner_secret_encrypted = await encryptString(c.env.KEK_SECRET, s, PARTNER_SECRET_AAD)
          set.partner_secret_tail = s.slice(-4)
        }
      }
    }

    if ("relaySecret" in b) {
      const v = b.relaySecret
      if (v === null) {
        set.relay_secret_encrypted = null
        set.relay_secret_tail = null
      } else if (typeof v === "string" && v.trim().length > 0) {
        const s = v.trim()
        if (s.length < 16 || s.length > 256 || /\s/.test(s)) errors.relaySecret = "Relay Secret minimal 16 karakter dan tanpa spasi."
        else {
          set.relay_secret_encrypted = await encryptString(c.env.KEK_SECRET, s, PARTNER_SECRET_AAD)
          set.relay_secret_tail = s.slice(-4)
        }
      }
    }

    if (Object.keys(errors).length) throw new AppError(422, "INVALID_INPUT", "Periksa kembali isian konfigurasi Mengantar.", errors)
    const cols = Object.keys(set)
    if (!cols.length) throw new AppError(422, "NOTHING_TO_SAVE", "Tidak ada perubahan untuk disimpan.")

    const now = Date.now()
    const actor = c.get("session").user.id
    const vals = Object.values(set)
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE platform_partner_config SET ${cols.map((col, i) => `${col} = ?${i + 1}`).join(", ")}, updated_by = ?${cols.length + 1}, updated_at = ?${cols.length + 2} WHERE id = 1`,
      ).bind(...vals, actor, now),
      // Record changed field names only — secret values never enter audit logs.
      auditStatement(c.env, { actorId: actor, action: "platform.mengantar_config_updated", targetType: "platform_partner_config", reason, metadata: { fields: cols }, now }),
    ])
    clearMengantarConfigCache()
    return ok({ saved: cols, updatedAt: now })
  })

  r("POST", "/sistem/mengantar/uji", "owner_recent", async (c) => {
    const now = Date.now()
    const actor = c.get("session").user.id
    const lim = await hit(c.env.DB, `owner-mengantar-test:${actor}`, 6, 60_000, now)
    if (!lim.allowed) throw new AppError(429, "RATE_LIMITED", "Tunggu sebentar sebelum menguji koneksi ulang.")
    const cfg = await loadMengantarConfig(c.env, { bypassCache: true })
    if (cfg.partnerSecretSource === "placeholder") {
      return ok({ ok: false, state: "secret_missing", message: "Partner Secret belum diisi. Simpan Partner Secret terlebih dahulu sebelum menguji koneksi.", latencyMs: 0, relay: null })
    }
    const relay = await relayHealth({ PARTNER_RELAY_URL: cfg.relayUrl, PARTNER_TRANSPORT: cfg.transport, GX_ENV: c.env.GX_ENV })
    const t0 = Date.now()
    const client = await resolvePartnerClient(c.env, { bypassCache: true })
    const res = await client.list({ externalUserId: "gx-config-check" })
    const latencyMs = Date.now() - t0
    let state: string
    let message: string
    let passed = false
    if (res.kind === "ok") {
      passed = true
      state = "connected"
      message = `Terhubung ke Mengantar Partner API (${latencyMs} ms).`
    } else if (res.kind === "error") {
      state = res.code
      if (res.code === "IP_NOT_ALLOWED") message = "Mengantar menolak panggilan (IP_NOT_ALLOWED). Pastikan IP egress relay sudah masuk allowlist Mengantar."
      else if (res.code === "PARTNER_DEACTIVATED") message = "Akses Partner API dinonaktifkan oleh Mengantar (PARTNER_DEACTIVATED). Hubungi tim Mengantar."
      else if (res.code === "INVALID_TIMESTAMP") message = "Timestamp ditolak Mengantar (INVALID_TIMESTAMP). Periksa sinkronisasi jam server."
      else if (res.code === "RATE_LIMITED") message = `Batas panggilan tercapai (RATE_LIMITED). Coba lagi dalam ${res.retryAfterSeconds ?? 60} detik.`
      else if (res.status >= 300 && res.status < 400) message = `Upstream Mengantar mengembalikan redirect (${res.code}). Pastikan origin relay mengarah ke host tujuan langsung (contoh: https://app.mengantar.com).`
      else if (res.status === 401 || res.status === 403) message = `Kredensial Partner ID / Secret ditolak Mengantar (${res.code}). Periksa kembali isian Anda.`
      else message = `Mengantar mengembalikan error ${res.status} (${res.code}).`
    } else if (res.kind === "relay_refused") {
      state = res.code
      message = `Relay menolak permintaan (${res.code}). Periksa Relay Secret dan konfigurasi relay.`
    } else {
      state = "unreachable"
      message = `Tidak dapat menjangkau Mengantar Partner API (${res.reason}).`
    }
    await auditStatement(c.env, { actorId: actor, action: "platform.mengantar_config_test", targetType: "platform_partner_config", reason: "Uji koneksi Mengantar Partner API", metadata: { ok: passed, state, latencyMs }, now }).run()
    return ok({ ok: passed, state, message, latencyMs, relay })
  })
}
