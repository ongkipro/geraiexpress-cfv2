// Outlet application → Super Admin approval → Mengantar seller provisioning (TASK-203, PR-01..03, DEC-203, spec 10
// §4.3). Approval needs recent TOTP + reason (route guard), activates `<slug>.geraimitra.com` (a D1 row, no Cloudflare call),
// migrates the tenant object, and enqueues exactly one `application_status` email IN THE SAME D1 batch as the state
// change. Provisioning never creates two sellers for one tenant: `externalUserId` = tenant id (idempotent at
// Mengantar), and an unknown outcome is resolved by reading back `sellers/list { externalUserId }`.
import { emit } from "@gx/telemetry"
import { vaultFor } from "../do/gerai-vault/stub"
import type { OnboardingState } from "../do/gerai-vault/connection"
import { coordinate } from "../do/gerai-vault/settings"
import { enqueueEmailStatement } from "../email/outbox"
import { hostCache, platformHostOf } from "../host/lookup"
import { AppError } from "../http/envelope"
import { partnerClient } from "../mengantar/factory"
import { quotaFor } from "../do/partner-quota"
import { platformPolicy, seedRulesOnApproval } from "../pricing/rules"

export const RESERVED_SLUGS = new Set([
  "www", "app", "api", "owner", "admin", "hq", "hooks", "relay", "custom", "mcp", "docs", "mail", "mengantar",
  "jne", "jnt", "sicepat", "spx", "pos", "lion", "sap", "paxel", "anteraja", "idexpress", "ninja", "tiki",
  "cname", "fallback", "probe", "staging", "static", "assets", "status",
])
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/

/** spec 06 §1: 3–30 chars, charset, reserved words, no `-stg` suffix. Returns an Indonesian problem or null. */
export function slugProblem(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return "Alamat gerai 3–30 karakter: huruf kecil, angka, dan tanda hubung (tidak di awal/akhir)."
  if (RESERVED_SLUGS.has(slug)) return "Alamat gerai ini tidak dapat dipakai. Pilih nama lain."
  if (slug.endsWith("-stg")) return "Alamat gerai tidak boleh berakhiran -stg."
  if (slug.includes("--")) return "Alamat gerai tidak boleh memuat dua tanda hubung berurutan."
  return null
}

const PHONE_RE = /^(?:\+?62|0)8\d{8,12}$/
export const normalizePhone = (raw: string) => raw.replace(/[\s\-().]/g, "")

export interface OutletInput {
  name: string
  picName: string
  picPhone: string
  areaId: string
  areaLabel: string
  streetAddress: string
  postalCode?: string | null
  latitude?: number | null
  longitude?: number | null
}

export interface ApplicationInput {
  slug: unknown
  businessName: unknown
  contactWhatsapp: unknown
  sellerEmail: unknown
  outlet: unknown
  consentMengantar: unknown
}

function str(v: unknown, field: string, max: number, label: string): string {
  const s = typeof v === "string" ? v.trim() : ""
  if (!s || s.length > max) throw new AppError(422, "INVALID_FIELD", `${label} wajib diisi (maksimal ${max} karakter).`, { [field]: `${label} wajib diisi.` })
  return s
}

export function validateApplication(input: ApplicationInput): { slug: string; businessName: string; contactWhatsapp: string; sellerEmail: string; outlet: OutletInput } {
  const slug = typeof input.slug === "string" ? input.slug.trim().toLowerCase() : ""
  const sp = slugProblem(slug)
  if (sp) throw new AppError(422, "INVALID_SLUG", sp, { slug: sp })
  const businessName = str(input.businessName, "businessName", 80, "Nama gerai")
  if (!/^[\p{L}\p{N} '\-_.@&]+$/u.test(businessName)) throw new AppError(422, "INVALID_FIELD", "Nama gerai memuat karakter yang tidak diizinkan.", { businessName: "Gunakan huruf, angka, spasi, dan tanda ' - _ . @ &." })
  const wa = normalizePhone(typeof input.contactWhatsapp === "string" ? input.contactWhatsapp : "")
  if (!PHONE_RE.test(wa)) throw new AppError(422, "INVALID_PHONE", "Nomor WhatsApp harus nomor HP Indonesia (08…).", { contactWhatsapp: "Contoh: 0812xxxxxxxx" })
  const email = typeof input.sellerEmail === "string" ? input.sellerEmail.trim().toLowerCase() : ""
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/.test(email)) throw new AppError(422, "INVALID_EMAIL", "Email akun Mengantar tidak valid.", { sellerEmail: "Gunakan email yang Anda baca." })
  const o = (input.outlet ?? {}) as Record<string, unknown>
  const areaId = typeof o.areaId === "string" ? o.areaId : ""
  // PR-01: submission is blocked until the pickup area resolved against Mengantar address search (24-hex id).
  if (!/^[0-9a-f]{24}$/.test(areaId)) throw new AppError(422, "AREA_REQUIRED", "Pilih kelurahan/kecamatan titik jemput dari hasil pencarian.", { areaId: "Cari lalu pilih wilayah titik jemput." })
  const picPhone = normalizePhone(typeof o.picPhone === "string" ? o.picPhone : "")
  if (!PHONE_RE.test(picPhone)) throw new AppError(422, "INVALID_PHONE", "Nomor HP penanggung jawab tidak valid.", { picPhone: "Contoh: 0812xxxxxxxx" })
  if (input.consentMengantar !== true) {
    throw new AppError(422, "CONSENT_REQUIRED", "Setujui pembuatan akun Mengantar atas nama gerai Anda.", { consentMengantar: "Wajib disetujui." })
  }
  const lat = coordinate(o.latitude, 90)
  const lng = coordinate(o.longitude, 180)
  if (lat === undefined || lng === undefined || (lat === null) !== (lng === null)) throw new AppError(422, "INVALID_PINPOINT", "Titik koordinat tidak valid. Isi latitude dan longitude sekaligus, atau kosongkan keduanya.", { [lat === undefined || (lat === null && lng !== null) ? "latitude" : "longitude"]: "Contoh: -6.9456 dan 107.5703." })
  return {
    slug,
    businessName,
    contactWhatsapp: wa,
    sellerEmail: email,
    outlet: {
      name: str(o.name ?? businessName, "outletName", 80, "Nama outlet"),
      picName: str(o.picName, "picName", 80, "Nama penanggung jawab"),
      picPhone,
      areaId,
      areaLabel: str(o.areaLabel, "areaLabel", 200, "Wilayah"),
      streetAddress: str(o.streetAddress, "streetAddress", 300, "Alamat lengkap"),
      postalCode: typeof o.postalCode === "string" ? o.postalCode.slice(0, 10) : null,
      latitude: lat ?? null,
      longitude: lng ?? null,
    },
  }
}

/** Owner submits (or re-submits after a rejection) the application; creates the tenant in `pending_review`. */
export async function submitApplication(env: Env, userId: string, input: ApplicationInput, now: number): Promise<{ tenantId: string; applicationId: string }> {
  const v = validateApplication(input)
  const own = await env.DB.prepare("SELECT a.id, a.tenant_id, a.state FROM tenant_applications a WHERE a.applicant_user_id = ? ORDER BY a.created_at DESC LIMIT 1").bind(userId).first<{ id: string; tenant_id: string; state: string }>()
  if (own && (own.state === "submitted" || own.state === "approved")) throw new AppError(409, "APPLICATION_EXISTS", "Pengajuan Anda sudah dikirim. Pantau statusnya di halaman Status Pengajuan.")
  const slugOwner = await env.DB.prepare("SELECT id FROM tenants WHERE slug = ?").bind(v.slug).first<{ id: string }>()
  if (slugOwner && slugOwner.id !== own?.tenant_id) throw new AppError(409, "SLUG_TAKEN", "Alamat gerai sudah dipakai. Pilih nama lain.", { slug: "Sudah dipakai." })
  const tenantId = own?.tenant_id ?? crypto.randomUUID()
  const applicationId = own?.id ?? crypto.randomUUID()
  const stmts: D1PreparedStatement[] = []
  if (!own) {
    stmts.push(
      env.DB.prepare("INSERT INTO tenants (id, slug, name, status, owner_user_id, contact_whatsapp, created_at, updated_at) VALUES (?1, ?2, ?3, 'pending_review', ?4, ?5, ?6, ?6)").bind(tenantId, v.slug, v.businessName, userId, v.contactWhatsapp, now),
      env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'gerai_admin', 'active', ?)").bind(tenantId, userId, now),
      env.DB.prepare(
        `INSERT INTO tenant_applications (id, tenant_id, applicant_user_id, state, business_name, contact_whatsapp, seller_email, outlet_json, consent_mengantar_at, submitted_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'submitted', ?4, ?5, ?6, ?7, ?8, ?8, ?8, ?8)`,
      ).bind(applicationId, tenantId, userId, v.businessName, v.contactWhatsapp, v.sellerEmail, JSON.stringify(v.outlet), now),
    )
  } else {
    stmts.push(
      env.DB.prepare("UPDATE tenants SET slug = ?, name = ?, contact_whatsapp = ?, status = 'pending_review', updated_at = ? WHERE id = ? AND (SELECT state FROM tenant_applications WHERE id = ?) = 'rejected'").bind(v.slug, v.businessName, v.contactWhatsapp, now, tenantId, applicationId),
      env.DB.prepare(
        "UPDATE tenant_applications SET state = 'submitted', business_name = ?, contact_whatsapp = ?, seller_email = ?, outlet_json = ?, consent_mengantar_at = ?, submitted_at = ?, decided_at = NULL, decided_by = NULL, decision_reason = NULL, updated_at = ? WHERE id = ? AND state = 'rejected'",
      ).bind(v.businessName, v.contactWhatsapp, v.sellerEmail, JSON.stringify(v.outlet), now, now, now, applicationId),
    )
  }
  // The owner's session now works for this tenant (status page).
  stmts.push(env.DB.prepare("UPDATE sessions SET active_tenant_id = ? WHERE user_id = ? AND host_context = 'app' AND revoked_at IS NULL").bind(tenantId, userId))
  await env.DB.batch(stmts)
  return { tenantId, applicationId }
}

interface AppRow {
  id: string
  tenant_id: string
  applicant_user_id: string
  state: string
  business_name: string
  seller_email: string
  outlet_json: string
  slug: string
  applicant_email: string
  submitted_at: number
}

async function loadApplication(env: Env, applicationId: string): Promise<AppRow> {
  const a = await env.DB.prepare(
    `SELECT a.id, a.tenant_id, a.applicant_user_id, a.state, a.business_name, a.seller_email, a.outlet_json, a.submitted_at, t.slug, u.email AS applicant_email
     FROM tenant_applications a JOIN tenants t ON t.id = a.tenant_id JOIN users u ON u.id = a.applicant_user_id WHERE a.id = ?`,
  )
    .bind(applicationId)
    .first<AppRow>()
  if (!a) throw new AppError(404, "APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.")
  return a
}

/** Audit row written only when THIS call decided the application (same guard as the transition). */
function auditStmt(env: Env, actorId: string, action: string, tenantId: string, reason: string, now: number, applicationId: string, nonce: string) {
  return env.DB.prepare(
    `INSERT INTO audit_logs (id, at, actor_type, actor_id, tenant_id, action, target_type, target_id, reason)
     SELECT ?1, ?2, 'super_admin', ?3, ?4, ?5, 'tenant', ?4, ?6
     WHERE (SELECT decision_nonce FROM tenant_applications WHERE id = ?7) = ?8`,
  ).bind(crypto.randomUUID(), now, actorId, tenantId, action, reason, applicationId, nonce)
}

/**
 * Approve: in ONE D1 batch the application becomes approved, the tenant active, `<slug>.geraimitra.com` active, the email
 * enqueued and the audit written — guarded so a second call (double click, mailer retry) changes nothing.
 * Then the tenant object is migrated and the seller provisioned (outside the batch: external call).
 */
export async function approveApplication(env: Env, input: { applicationId: string; actorId: string; reason: string; origin: string; now: number }) {
  const a = await loadApplication(env, input.applicationId)
  if (a.state !== "submitted") throw new AppError(409, "APPLICATION_NOT_PENDING", "Pengajuan ini sudah diputuskan.")
  // A per-call nonce identifies THIS call's transition inside the batch: a concurrent or repeated approve (even by the
  // same admin in the same millisecond) matches zero rows, so nothing below it (host, email, audit) happens twice.
  const nonce = crypto.randomUUID()
  const thisCall = { sql: "(SELECT decision_nonce FROM tenant_applications WHERE id = ?8) = ?9", params: [a.id, nonce] }
  const mail = await enqueueEmailStatement(env, {
    // One decision email per submission even if two decisions race in the same millisecond (PK dedupe).
    id: `app-decision:${a.id}:${a.submitted_at}`,
    templateId: "application_status",
    toEmail: a.applicant_email,
    vars: { outletName: a.business_name, decision: "approved", link: `${appOrigin(input.origin)}/` },
    expiresAt: input.now + 7 * 24 * 3600_000,
    now: input.now,
    onlyIf: thisCall,
  })
  const policy = await platformPolicy(env.DB)
  const res = await env.DB.batch([
    env.DB.prepare("UPDATE tenant_applications SET state = 'approved', decided_at = ?1, decided_by = ?2, decision_reason = ?3, decision_nonce = ?5, updated_at = ?1 WHERE id = ?4 AND state = 'submitted'").bind(input.now, input.actorId, input.reason, a.id, nonce),
    env.DB.prepare("UPDATE tenants SET status = 'active', approved_at = ?1, masking_daily_quota = COALESCE(masking_daily_quota, 20), routing_version = routing_version + 1, updated_at = ?1 WHERE id = ?2 AND (SELECT decision_nonce FROM tenant_applications WHERE id = ?3) = ?4").bind(input.now, a.tenant_id, a.id, nonce),
    env.DB.prepare(
      `INSERT INTO tenant_hostnames (hostname, tenant_id, kind, role, state, created_at, activated_at)
       SELECT ?1, ?2, 'platform_subdomain', 'primary', 'active', ?3, ?3 WHERE (SELECT decision_nonce FROM tenant_applications WHERE id = ?4) = ?5
       ON CONFLICT(hostname) DO UPDATE SET state = 'active', activated_at = ?3`,
    ).bind(platformHostOf(env, a.slug), a.tenant_id, input.now, a.id, nonce),
    mail.statement,
    auditStmt(env, input.actorId, "tenant.approve", a.tenant_id, input.reason, input.now, a.id, nonce),
    // The onboarding row exists from the approval on, so a crash after this batch is always retryable.
    env.DB.prepare(
      `INSERT INTO tenant_onboarding (tenant_id, environment, onboarding_state, seller_id, external_user_id, last_error_code, updated_at)
       SELECT ?1, ?2, 'registration_pending', NULL, ?1, NULL, ?3 WHERE (SELECT decision_nonce FROM tenant_applications WHERE id = ?4) = ?5
       ON CONFLICT(tenant_id) DO NOTHING`,
    ).bind(a.tenant_id, env.GX_ENV === "production" ? "production" : "sandbox", input.now, a.id, nonce),
    // TASK-207: every active service starts at the courier default (20 %), `Belum diterapkan` (DEC-233).
    seedRulesOnApproval(env, { tenantId: a.tenant_id, applicationId: a.id, nonce, now: input.now, defaultBps: policy.defaultBps }),
  ])
  if ((res[0]?.meta.changes ?? 0) !== 1) throw new AppError(409, "APPLICATION_NOT_PENDING", "Pengajuan ini sudah diputuskan.")
  hostCache.clear()
  const migrated = await vaultFor(env, a.tenant_id).migrate(a.tenant_id)
  if (!migrated.ok) throw new AppError(500, "TENANT_MIGRATION_FAILED", "Penyimpanan gerai gagal disiapkan. Coba lagi dari halaman gerai.")
  // The application's pickup point becomes the default outlet (quote origin, labels, pickup).
  const o = JSON.parse(a.outlet_json) as OutletInput
  await vaultFor(env, a.tenant_id).upsertDefaultOutlet(a.tenant_id, { name: o.name, picName: o.picName, picPhone: o.picPhone, areaId: o.areaId, areaLabel: o.areaLabel, street: o.streetAddress, postalCode: o.postalCode ?? null, latitude: o.latitude ?? null, longitude: o.longitude ?? null }, input.now)
  const provisioning = await provisionSeller(env, { tenantId: a.tenant_id, name: a.business_name, email: a.seller_email, outlet: JSON.parse(a.outlet_json) as OutletInput, now: input.now })
  return { tenantId: a.tenant_id, slug: a.slug, provisioning }
}

const appOrigin = (ownerOrigin: string) => ownerOrigin.replace("://owner-staging.", "://app-staging.").replace("://owner.", "://app.")

export async function rejectApplication(env: Env, input: { applicationId: string; actorId: string; reason: string; origin: string; now: number }) {
  const a = await loadApplication(env, input.applicationId)
  if (a.state !== "submitted") throw new AppError(409, "APPLICATION_NOT_PENDING", "Pengajuan ini sudah diputuskan.")
  const nonce = crypto.randomUUID()
  const thisCall = { sql: "(SELECT decision_nonce FROM tenant_applications WHERE id = ?8) = ?9", params: [a.id, nonce] }
  const mail = await enqueueEmailStatement(env, {
    // One decision email per submission even if two decisions race in the same millisecond (PK dedupe).
    id: `app-decision:${a.id}:${a.submitted_at}`,
    templateId: "application_status",
    toEmail: a.applicant_email,
    vars: { outletName: a.business_name, decision: "rejected", reason: input.reason, link: `${appOrigin(input.origin)}/daftar` },
    expiresAt: input.now + 7 * 24 * 3600_000,
    now: input.now,
    onlyIf: thisCall,
  })
  const res = await env.DB.batch([
    env.DB.prepare("UPDATE tenant_applications SET state = 'rejected', decided_at = ?1, decided_by = ?2, decision_reason = ?3, decision_nonce = ?5, updated_at = ?1 WHERE id = ?4 AND state = 'submitted'").bind(input.now, input.actorId, input.reason, a.id, nonce),
    env.DB.prepare("UPDATE tenants SET status = 'draft_application', updated_at = ?1 WHERE id = ?2 AND (SELECT decision_nonce FROM tenant_applications WHERE id = ?3) = ?4").bind(input.now, a.tenant_id, a.id, nonce),
    mail.statement,
    auditStmt(env, input.actorId, "tenant.reject", a.tenant_id, input.reason, input.now, a.id, nonce),
  ])
  if ((res[0]?.meta.changes ?? 0) !== 1) throw new AppError(409, "APPLICATION_NOT_PENDING", "Pengajuan ini sudah diputuskan.")
  return { tenantId: a.tenant_id }
}

// -------------------------------------------------------------------------------------------------------------
// Seller provisioning (PR-02): never two sellers per tenant; unknown outcome → read-back; 409 → BYOK.

async function mirror(env: Env, tenantId: string, state: OnboardingState, sellerId: string | null, code: string | null, now: number) {
  await env.DB.prepare(
    `INSERT INTO tenant_onboarding (tenant_id, environment, onboarding_state, seller_id, external_user_id, last_error_code, updated_at) VALUES (?1, ?2, ?3, ?4, ?1, ?5, ?6)
     ON CONFLICT(tenant_id) DO UPDATE SET onboarding_state = excluded.onboarding_state, seller_id = COALESCE(excluded.seller_id, tenant_onboarding.seller_id), last_error_code = excluded.last_error_code, updated_at = excluded.updated_at`,
  )
    .bind(tenantId, env.GX_ENV === "production" ? "production" : "sandbox", state, sellerId, code, now)
    .run()
}

export async function provisionSeller(env: Env, input: { tenantId: string; name: string; email: string; outlet: OutletInput; now: number }): Promise<{ state: OnboardingState; code?: string }> {
  const vault = vaultFor(env, input.tenantId)
  // Idempotent preparation (a retry after a crash between approval and provisioning finds an unprepared object).
  const migrated = await vault.migrate(input.tenantId)
  if (!migrated.ok) throw new AppError(500, "TENANT_MIGRATION_FAILED", "Penyimpanan gerai gagal disiapkan. Coba lagi dari halaman gerai.")
  const hasOutlet = await vault.defaultOutlet(input.tenantId)
  if (hasOutlet.ok && !hasOutlet.value) await vault.upsertDefaultOutlet(input.tenantId, { name: input.outlet.name, picName: input.outlet.picName, picPhone: input.outlet.picPhone, areaId: input.outlet.areaId, areaLabel: input.outlet.areaLabel, street: input.outlet.streetAddress, postalCode: input.outlet.postalCode ?? null, latitude: input.outlet.latitude ?? null, longitude: input.outlet.longitude ?? null }, input.now)
  const environment = env.GX_ENV === "production" ? "production" : "sandbox"
  const record = async (state: OnboardingState, extra: { sellerId?: string | null; apiKey?: string | null } = {}, code: string | null = null) => {
    const r = await vault.recordOnboarding(input.tenantId, { environment, state, externalUserId: input.tenantId, ...extra })
    if (!r.ok) throw new AppError(500, "TENANT_NOT_READY", "Penyimpanan gerai belum siap.")
    await mirror(env, input.tenantId, state, extra.sellerId ?? null, code, input.now)
  }
  await record("registration_pending")
  const quota = await quotaFor(env).reserve("register", input.now)
  if (!quota.ok) {
    await mirror(env, input.tenantId, "registration_pending", null, quota.reason === "day" ? "DAILY_REGISTRATION_LIMIT" : "RATE_LIMITED", input.now)
    return { state: "registration_pending", code: quota.reason === "day" ? "DAILY_REGISTRATION_LIMIT" : "RATE_LIMITED" }
  }
  const client = partnerClient(env)
  const out = await client.register({ name: input.name.slice(0, 100).replace(/[^\p{L}\p{N} '\-_.@]/gu, " "), email: input.email, phone: input.outlet.picPhone, externalUserId: input.tenantId })
  emit("mengantar.partner_api", { route: "/sellers", status: "status" in out ? out.status : 0, outcome: out.kind }, { tenantId: input.tenantId }, { env: env.GX_ENV })
  if (out.kind === "ok" && out.data.apiKey) {
    await record("connected", { sellerId: out.data.sellerId, apiKey: out.data.apiKey })
    return { state: "connected" }
  }
  if (out.kind === "ok") {
    await record("provider_restricted", { sellerId: out.data.sellerId }, "API_KEY_DISABLED")
    return { state: "provider_restricted", code: "API_KEY_DISABLED" }
  }
  if (out.kind === "error") {
    // KEY_PROVISIONING_FAILED means Mengantar already created the seller: the registration unit is spent.
    if (out.code !== "KEY_PROVISIONING_FAILED") await quotaFor(env).releaseRegistration(input.now)
    if (out.code === "EMAIL_ALREADY_REGISTERED") {
      await record("existing_account_required", {}, out.code)
      return { state: "existing_account_required", code: out.code }
    }
    if (out.code === "KEY_PROVISIONING_FAILED") {
      await record("registration_unknown", {}, out.code)
      return reconcileRegistration(env, input.tenantId, input.now)
    }
    await record("registration_pending", {}, out.code)
    return { state: "registration_pending", code: out.code }
  }
  // The relay refused before calling Mengantar: nothing was created — give the unit back, stay pending.
  if (out.kind === "relay_refused") {
    await quotaFor(env).releaseRegistration(input.now)
    await record("registration_pending", {}, out.code)
    return { state: "registration_pending", code: out.code }
  }
  // maybe_sent: never register again blindly — read back.
  await record("registration_unknown", {}, out.reason)
  return reconcileRegistration(env, input.tenantId, input.now)
}

/** `registration_unknown` → `sellers/list { externalUserId }` → fetch the key → `connected`, or stay unknown. */
export async function reconcileRegistration(env: Env, tenantId: string, now: number): Promise<{ state: OnboardingState; code?: string }> {
  const client = partnerClient(env)
  const vault = vaultFor(env, tenantId)
  const environment = env.GX_ENV === "production" ? "production" : "sandbox"
  const record = async (state: OnboardingState, extra: { sellerId?: string | null; apiKey?: string | null }, code: string | null) => {
    const r = await vault.recordOnboarding(tenantId, { environment, state, externalUserId: tenantId, ...extra })
    if (!r.ok) throw new AppError(500, "TENANT_NOT_READY", "Penyimpanan gerai belum siap.")
    await mirror(env, tenantId, state, extra.sellerId ?? null, code, now)
  }
  const q1 = await quotaFor(env).reserve("call", now)
  if (!q1.ok) return { state: "registration_unknown", code: "RATE_LIMITED" }
  const listed = await client.list({ externalUserId: tenantId })
  if (listed.kind !== "ok") return { state: "registration_unknown", code: listed.kind === "error" ? listed.code : listed.kind }
  // Only the seller whose externalUserId is exactly this tenant (never another gerai's seller from a loose filter).
  const seller = listed.data.sellers.find((x) => x.externalUserId === tenantId)
  if (!seller) {
    // Mengantar never created it: back to pending (a later retry registers with the same externalUserId).
    await record("registration_pending", {}, "NOT_FOUND_ON_READBACK")
    return { state: "registration_pending", code: "NOT_FOUND_ON_READBACK" }
  }
  const q2 = await quotaFor(env).reserve("call", now)
  if (!q2.ok) return { state: "registration_unknown", code: "RATE_LIMITED" }
  const key = await client.apiKey(seller.sellerId)
  if (key.kind !== "ok") {
    await record("registration_unknown", { sellerId: seller.sellerId }, key.kind === "error" ? key.code : key.kind)
    return { state: "registration_unknown", code: key.kind === "error" ? key.code : key.kind }
  }
  if (!key.data.apiKey) {
    await record("provider_restricted", { sellerId: seller.sellerId }, "API_KEY_DISABLED")
    return { state: "provider_restricted", code: "API_KEY_DISABLED" }
  }
  await record("connected", { sellerId: seller.sellerId, apiKey: key.data.apiKey }, null)
  return { state: "connected" }
}

/** BYOK fallback (PR-02): the verified owner pastes the key of their existing Mengantar account. */
export async function connectByok(env: Env, tenantId: string, apiKey: string, now: number): Promise<{ state: OnboardingState }> {
  const key = apiKey.trim()
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) throw new AppError(422, "INVALID_KEY", "Format API key Mengantar tidak valid.", { apiKey: "Salin dari Pengaturan Akun → Integrasi Public API." })
  const vault = vaultFor(env, tenantId)
  const environment = env.GX_ENV === "production" ? "production" : "sandbox"
  // ADR-0003: a BYOK account is not a Partner seller of ours — no sellerId, no externalUserId (never reconciled
  // through `sellers/list`). A Partner-connected gerai keeps its Partner key (no overwrite).
  const cur = await vault.connectionView(tenantId)
  if (cur.ok && cur.value?.onboardingState === "connected") throw new AppError(409, "ALREADY_CONNECTED", "Gerai sudah terhubung lewat GeraiExpress. Hubungi tim bila perlu mengganti akun.")
  const r = await vault.recordOnboarding(tenantId, { environment, state: "byok_connected", apiKey: key, sellerId: null, externalUserId: null })
  if (!r.ok) {
    if (r.refused === "KEY_ROTATING") throw new AppError(409, "KEY_ROTATING", "Kunci Mengantar sedang diganti. Coba lagi sebentar lagi.")
    if (r.refused === "ALREADY_CONNECTED") throw new AppError(409, "ALREADY_CONNECTED", "Gerai sudah terhubung lewat GeraiExpress. Hubungi tim bila perlu mengganti akun.")
    throw new AppError(409, "TENANT_NOT_READY", "Gerai belum disetujui.")
  }
  await env.DB.prepare(
    // D1 mirror: `external_user_id` is NOT NULL there (it keys the row to the tenant); the authoritative BYOK record in
    // the tenant object has no externalUserId, and `seller_id` is cleared so reconciliation never targets it.
    `INSERT INTO tenant_onboarding (tenant_id, environment, onboarding_state, seller_id, external_user_id, last_error_code, updated_at) VALUES (?1, ?2, 'byok_connected', NULL, ?1, NULL, ?3)
     ON CONFLICT(tenant_id) DO UPDATE SET onboarding_state = 'byok_connected', seller_id = NULL, last_error_code = NULL, updated_at = ?3`,
  )
    .bind(tenantId, environment, now)
    .run()
  return { state: "byok_connected" }
}
