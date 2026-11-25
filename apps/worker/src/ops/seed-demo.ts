// POST /internal/ops/seed-demo (owner host, Bearer OPS_TOKEN).
// Idempotently provisions or refreshes the locked read-only demo account (`demo@geraiexpress.com` / `geraiexpress123`)
// with a complete 45-day shipment history, contacts, analytics, Book 1/Book 2 finance, returns, claims, and mini-site.
import { TENANT_SCHEMA_VERSION } from "@gx/db/tenant"
import { hashPassword } from "../auth/password"
import { timingSafeEqualStr } from "../crypto"
import { DEMO_DEFAULT_PASSWORD, DEMO_EMAIL, DEMO_TENANT_ID, DEMO_TENANT_NAME, DEMO_TENANT_SLUG } from "../demo/constants"
import { vaultFor } from "../do/gerai-vault/stub"
import { emailHash } from "../email/outbox"
import { platformHostOf } from "../host/lookup"
import { fail, ok } from "../http/envelope"

export async function handleSeedDemo(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get("authorization") ?? ""
  const token = auth.replace(/^Bearer\s+/i, "")
  if (!token || !env.OPS_TOKEN || !(await timingSafeEqualStr(token, env.OPS_TOKEN))) {
    return fail(401, "UNAUTHORIZED", "Akses ditolak.")
  }

  const b = (await request.json().catch(() => ({}))) as { password?: unknown }
  const password = typeof b.password === "string" && b.password.length >= 8 ? b.password : DEMO_DEFAULT_PASSWORD
  const now = Date.now()
  const passwordHash = await hashPassword(password, env.AUTH_SESSION_PEPPER)

  const existingUser = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(DEMO_EMAIL).first<{ id: string }>()
  const userId = existingUser?.id ?? "demo-user-001"

  const existingTenant = await env.DB.prepare("SELECT id FROM tenants WHERE slug = ?").bind(DEMO_TENANT_SLUG).first<{ id: string }>()
  if (existingTenant && existingTenant.id !== DEMO_TENANT_ID) {
    return fail(409, "DEMO_SLUG_CONFLICT", "Slug 'demo' dimiliki gerai lain; seeder ditolak.")
  }
  const tenantId = DEMO_TENANT_ID
  const demoEh = await emailHash(env.AUTH_SESSION_PEPPER, DEMO_EMAIL)
  const hostname = platformHostOf(env, DEMO_TENANT_SLUG)
  const environment = env.GX_ENV === "production" ? "production" : "sandbox"

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, email, name, phone, password_hash, status, email_verified_at, password_changed_at, created_at, updated_at)
       VALUES (?1, ?2, 'Demo Pemilik Gerai', '08xx-xxxx-9900', ?3, 'active', ?4, ?4, ?4, ?4)
       ON CONFLICT(email) DO UPDATE SET name = 'Demo Pemilik Gerai', phone = '08xx-xxxx-9900', password_hash = ?3, status = 'active', updated_at = ?4`,
    ).bind(userId, DEMO_EMAIL, passwordHash, now),
    env.DB.prepare(
      `INSERT INTO tenants (id, slug, name, contact_whatsapp, status, masking_enabled, masking_daily_quota, tier_code, custom_domain_enabled, owner_user_id, created_at, approved_at, updated_at)
       VALUES (?1, ?2, ?3, '08xx-xxxx-9900', 'active', 1, 50, 'gold', 1, ?4, ?5, ?5, ?5)
       ON CONFLICT(slug) DO UPDATE SET name = ?3, contact_whatsapp = '08xx-xxxx-9900', status = 'active', masking_enabled = 1, masking_daily_quota = 50, tier_code = 'gold', custom_domain_enabled = 1, owner_user_id = ?4, updated_at = ?5`,
    ).bind(tenantId, DEMO_TENANT_SLUG, DEMO_TENANT_NAME, userId, now),
    env.DB.prepare(
      `INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at)
       VALUES (?1, ?2, 'gerai_admin', 'active', ?3)
       ON CONFLICT(tenant_id, user_id) DO UPDATE SET role = 'gerai_admin', status = 'active', revoked_at = NULL`,
    ).bind(tenantId, userId, now),
    env.DB.prepare(
      `INSERT INTO tenant_hostnames (hostname, tenant_id, kind, role, state, created_at, activated_at)
       VALUES (?1, ?2, 'platform_subdomain', 'primary', 'active', ?3, ?3)
       ON CONFLICT(hostname) DO UPDATE SET tenant_id = ?2, state = 'active', activated_at = ?3`,
    ).bind(hostname, tenantId, now),
    env.DB.prepare(
      `INSERT INTO tenant_onboarding (tenant_id, environment, onboarding_state, seller_id, external_user_id, last_error_code, updated_at)
       VALUES (?1, ?2, 'connected', 'demo-seller-001', ?1, NULL, ?3)
       ON CONFLICT(tenant_id) DO UPDATE SET environment = ?2, onboarding_state = 'connected', seller_id = 'demo-seller-001', last_error_code = NULL, updated_at = ?3`,
    ).bind(tenantId, environment, now),
    env.DB.prepare(
      `INSERT INTO tenant_discount_rules (tenant_id, service_code, courier_code, service_class, assigned_bps, effective_from, requested_at, applied_at, verified_at, verification_state, observed_bps, observed_at, updated_at)
       SELECT ?1, service_code, courier_code, service_class,
              CASE WHEN service_code = 'SiCepat' THEN 3000 WHEN service_class = 'cargo' THEN 2000 ELSE 2500 END,
              ?2, ?2, ?2, ?2, 'sesuai',
              CASE WHEN service_code = 'SiCepat' THEN 3000 WHEN service_class = 'cargo' THEN 2000 ELSE 2500 END,
              ?2, ?2
       FROM courier_service_catalog WHERE is_active = 1
       ON CONFLICT(tenant_id, service_code) DO UPDATE SET verification_state = 'sesuai', observed_bps = excluded.observed_bps, observed_at = ?2, updated_at = ?2`,
    ).bind(tenantId, now),
    // Clear only the demo account's own login throttle keys (never wipe other users' throttles) and guarantee zero API keys.
    env.DB.prepare("DELETE FROM auth_throttle WHERE key IN (?1, ?2)").bind(`login-fail:${demoEh}`, `login-lock:${demoEh}`),
    env.DB.prepare("DELETE FROM tenant_api_keys WHERE tenant_id = ?").bind(tenantId),
  ])

  const vault = vaultFor(env, tenantId)
  const migrated = await vault.migrate(tenantId)
  if (!migrated.ok) return fail(500, "SEED_FAILED", "Gagal menyiapkan skema penyimpanan demo.")
  await env.DB.prepare(
    `INSERT INTO tenant_schema_versions (tenant_id, schema_version, state, last_error, updated_at) VALUES (?1, ?2, 'ok', NULL, ?3)
     ON CONFLICT(tenant_id) DO UPDATE SET schema_version = excluded.schema_version, state = 'ok', last_error = NULL, updated_at = excluded.updated_at`,
  )
    .bind(tenantId, TENANT_SCHEMA_VERSION, now)
    .run()
  const seeded = await vault.seedDemo(tenantId, userId, now)
  if (!seeded.ok) return fail(500, "SEED_FAILED", "Gagal mengisi data demo.")

  // Sync D1 `shipment_index` for public tracking & cross-tenant lookup.
  await env.DB.prepare("DELETE FROM shipment_index WHERE tenant_id = ?").bind(tenantId).run()
  const idxStmts = seeded.value.shipments.map((s) =>
    env.DB.prepare(
      "INSERT INTO shipment_index (tenant_id, slug, awb_number, courier_code, status, created_at, updated_at, version) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)",
    ).bind(tenantId, s.slug, s.awbNumber, s.courierCode, s.status, s.createdAt, s.updatedAt),
  )
  for (let i = 0; i < idxStmts.length; i += 25) {
    await env.DB.batch(idxStmts.slice(i, i + 25))
  }

  return ok(
    {
      email: DEMO_EMAIL,
      tenantId,
      slug: DEMO_TENANT_SLUG,
      miniSiteHost: hostname,
      shipments: seeded.value.shipments.length,
      senders: seeded.value.senders,
      recipients: seeded.value.recipients,
    },
    201,
  )
}
