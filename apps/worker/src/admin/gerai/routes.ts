// Super Admin `Gerai` menu (TASK-203, spec 06 §4, visual 07 §3.3). Reads need aal2; every mutation needs a recent
// TOTP + reason and is audited. No route here acts on a gerai's shipments (non-impersonation, DEC-209).
import type { Hono } from "hono"
import { register } from "../../api/registry"
import { auditStatement, ownerGuard, requireReason, type OwnerCtx } from "../../api/owner"
import { vaultFor } from "../../do/gerai-vault/stub"
import { hostCache, platformHostOf } from "../../host/lookup"
import { checkQuota, domainRows, pollHosts, purgeDomain, refreshHost } from "../../hostnames/service"
import { hit } from "../../auth/throttle"
import { runDiscountVerifier } from "../../pricing/rules"
import type { FinanceMessage } from "../../cron/finance"

const probeFetch = (url: string) => fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "GeraiExpress-Probe/1.0" } })
import { CfError } from "../../hostnames/cloudflare"
import { AppError, ok } from "../../http/envelope"
import { hostOrigin } from "../../http/request"
import { approveApplication, provisionSeller, reconcileRegistration, rejectApplication, type OutletInput } from "../../onboarding/service"

async function body(c: OwnerCtx): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json()
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerGeraiAdmin(app: Hono<any>): void {
  const r = (method: "GET" | "POST", path: string, auth: "owner_aal2" | "owner_recent", handler: (c: OwnerCtx) => Promise<Response>) =>
    register(app, { context: "owner", method, path, auth, projection: "role" }, ownerGuard, (c) => handler(c as OwnerCtx))

  r("GET", "/gerai/summary", "owner_aal2", async (c) => {
    const counts = await c.env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM tenant_applications WHERE state = 'submitted') AS pending,
              (SELECT COUNT(*) FROM tenants WHERE status = 'active') AS active,
              (SELECT COUNT(*) FROM tenants WHERE status = 'suspended') AS suspended,
              (SELECT COUNT(*) FROM tenant_onboarding WHERE onboarding_state IN ('registration_pending','registration_unknown')) AS onboarding`,
    ).first()
    return ok(counts)
  })

  r("GET", "/gerai/applications", "owner_aal2", async (c) => {
    const state = c.req.query("state") === "all" ? null : "submitted"
    const rows = await c.env.DB.prepare(
      `SELECT a.id, a.state, a.business_name, a.submitted_at, a.decided_at, t.slug, json_extract(a.outlet_json, '$.areaLabel') AS area
       FROM tenant_applications a JOIN tenants t ON t.id = a.tenant_id ${state ? "WHERE a.state = 'submitted'" : ""} ORDER BY a.submitted_at DESC LIMIT 200`,
    ).all()
    return ok({ items: rows.results })
  })

  r("GET", "/gerai/applications/:id", "owner_aal2", async (c) => {
    const a = await c.env.DB.prepare(
      `SELECT a.id, a.state, a.business_name, a.contact_whatsapp, a.seller_email, a.outlet_json, a.consent_mengantar_at, a.submitted_at, a.decided_at,
              a.decision_reason, t.id AS tenant_id, t.slug, u.name AS applicant_name, u.email AS applicant_email
       FROM tenant_applications a JOIN tenants t ON t.id = a.tenant_id JOIN users u ON u.id = a.applicant_user_id WHERE a.id = ?`,
    )
      .bind(c.req.param("id"))
      .first<Record<string, unknown> & { outlet_json: string; slug: string }>()
    if (!a) throw new AppError(404, "APPLICATION_NOT_FOUND", "Pengajuan tidak ditemukan.")
    const hostTaken = await c.env.DB.prepare("SELECT tenant_id FROM tenant_hostnames WHERE hostname = ?").bind(platformHostOf(c.env, a.slug)).first<{ tenant_id: string }>()
    const { outlet_json, ...rest } = a
    return ok({ ...rest, outlet: JSON.parse(outlet_json) as OutletInput, slugReady: !hostTaken || hostTaken.tenant_id === a.tenant_id, partnerTransport: c.env.PARTNER_TRANSPORT })
  })

  r("POST", "/gerai/applications/:id/approve", "owner_recent", async (c) => {
    const b = await body(c)
    const res = await approveApplication(c.env, { applicationId: c.req.param("id") ?? "", actorId: c.get("session").user.id, reason: requireReason(b.reason), origin: hostOrigin(c.req.raw), now: Date.now() })
    return ok(res)
  })

  r("POST", "/gerai/applications/:id/reject", "owner_recent", async (c) => {
    const b = await body(c)
    return ok(await rejectApplication(c.env, { applicationId: c.req.param("id") ?? "", actorId: c.get("session").user.id, reason: requireReason(b.reason), origin: hostOrigin(c.req.raw), now: Date.now() }))
  })

  r("GET", "/gerai", "owner_aal2", async (c) => {
    const q = (c.req.query("q") ?? "").trim().toLowerCase().slice(0, 60)
    const rows = await c.env.DB.prepare(
      `SELECT t.id, t.slug, t.name, t.status, t.masking_enabled, t.masking_daily_quota, t.approved_at, o.onboarding_state, o.last_error_code
       FROM tenants t LEFT JOIN tenant_onboarding o ON o.tenant_id = t.id
       WHERE t.status IN ('active','suspended') AND (?1 = '' OR t.slug LIKE '%' || ?1 || '%' OR lower(t.name) LIKE '%' || ?1 || '%')
       ORDER BY t.approved_at DESC LIMIT 200`,
    )
      .bind(q)
      .all()
    return ok({ items: rows.results })
  })

  r("GET", "/gerai/:slug", "owner_aal2", async (c) => {
    const t = await c.env.DB.prepare(
      `SELECT t.id, t.slug, t.name, t.status, t.masking_enabled, t.masking_daily_quota, t.custom_domain_enabled, t.routing_version, t.approved_at, o.onboarding_state, o.seller_id, o.last_error_code
       FROM tenants t LEFT JOIN tenant_onboarding o ON o.tenant_id = t.id WHERE t.slug = ?`,
    )
      .bind(c.req.param("slug"))
      .first<{ id: string } & Record<string, unknown>>()
    if (!t) throw new AppError(404, "TENANT_NOT_FOUND", "Gerai tidak ditemukan.")
    const conn = await vaultFor(c.env, t.id).connectionView(t.id)
    const hosts = await c.env.DB.prepare("SELECT hostname, kind, state FROM tenant_hostnames WHERE tenant_id = ?").bind(t.id).all()
    return ok({ ...t, connection: conn.ok ? conn.value : null, hostnames: hosts.results })
  })

  // Suspend / unsuspend: bumps routing_version; the mini-site answers 403 within the 30 s isolate cache window.
  r("POST", "/gerai/:slug/status", "owner_recent", async (c) => {
    const b = await body(c)
    const reason = requireReason(b.reason)
    const target = b.status === "suspended" ? "suspended" : b.status === "active" ? "active" : null
    if (!target) throw new AppError(422, "INVALID_STATUS", "Status harus aktif atau dibekukan.")
    const t = await c.env.DB.prepare("SELECT id, status FROM tenants WHERE slug = ?").bind(c.req.param("slug")).first<{ id: string; status: string }>()
    if (!t || (t.status !== "active" && t.status !== "suspended")) throw new AppError(404, "TENANT_NOT_FOUND", "Gerai tidak ditemukan.")
    const now = Date.now()
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE tenants SET status = ?1, routing_version = routing_version + 1, updated_at = ?2 WHERE id = ?3").bind(target, now, t.id),
      auditStatement(c.env, { actorId: c.get("session").user.id, action: target === "suspended" ? "tenant.suspend" : "tenant.unsuspend", targetType: "tenant", targetId: t.id, tenantId: t.id, reason, now }),
    ])
    hostCache.clear()
    return ok({ status: target })
  })

  // Masking kill-switch and daily quota (DEC-206, DEC-231): TOTP + reason. `null` quota = no cap.
  r("POST", "/gerai/:slug/masking", "owner_recent", async (c) => {
    const b = await body(c)
    const reason = requireReason(b.reason)
    const enabled = b.enabled === true ? 1 : b.enabled === false ? 0 : null
    const quota = b.dailyQuota === null ? null : Number(b.dailyQuota)
    if (enabled === null) throw new AppError(422, "INVALID_FIELD", "Pilih aktif atau nonaktif.")
    if (quota !== null && (!Number.isSafeInteger(quota) || quota < 0 || quota > 10_000)) throw new AppError(422, "INVALID_QUOTA", "Kuota harian 0–10.000 atau kosong (tanpa batas).", { dailyQuota: "0–10.000" })
    const t = await c.env.DB.prepare("SELECT id FROM tenants WHERE slug = ?").bind(c.req.param("slug")).first<{ id: string }>()
    if (!t) throw new AppError(404, "TENANT_NOT_FOUND", "Gerai tidak ditemukan.")
    const now = Date.now()
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE tenants SET masking_enabled = ?1, masking_daily_quota = ?2, updated_at = ?3 WHERE id = ?4").bind(enabled, quota, now, t.id),
      auditStatement(c.env, { actorId: c.get("session").user.id, action: "tenant.masking", targetType: "tenant", targetId: t.id, tenantId: t.id, reason, metadata: { enabled, quota }, now }),
    ])
    return ok({ maskingEnabled: enabled === 1, dailyQuota: quota })
  })

  // Pro custom-domain entitlement (spec 11 §5 step 1): TOTP + reason. Turning it off never deletes an existing domain;
  // `Hapus` below does (stops billing).
  r("POST", "/gerai/:slug/custom-domain", "owner_recent", async (c) => {
    const b = await body(c)
    const reason = requireReason(b.reason)
    const enabled = b.enabled === true ? 1 : b.enabled === false ? 0 : null
    if (enabled === null) throw new AppError(422, "INVALID_FIELD", "Pilih aktif atau nonaktif.")
    const t = await c.env.DB.prepare("SELECT id FROM tenants WHERE slug = ?").bind(c.req.param("slug")).first<{ id: string }>()
    if (!t) throw new AppError(404, "TENANT_NOT_FOUND", "Gerai tidak ditemukan.")
    const now = Date.now()
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE tenants SET custom_domain_enabled = ?1, updated_at = ?2 WHERE id = ?3").bind(enabled, now, t.id),
      auditStatement(c.env, { actorId: c.get("session").user.id, action: "tenant.custom_domain", targetType: "tenant", targetId: t.id, tenantId: t.id, reason, metadata: { enabled }, now }),
    ])
    return ok({ customDomainEnabled: enabled === 1 })
  })

  // `Gerai › Domain Mitra` (spec 11 §7): every custom hostname with state, Cloudflare status and last probe.
  r("GET", "/domains", "owner_aal2", async (c) => {
    const [rows, quota] = await Promise.all([
      c.env.DB.prepare(
        `SELECT h.hostname, h.role, h.state, h.cf_status, h.cf_ssl_status, h.dns_branch, h.created_at, h.last_checked_at, h.probe_ok_at, h.probe_failures, t.slug, t.name
         FROM tenant_hostnames h JOIN tenants t ON t.id = h.tenant_id WHERE h.kind = 'custom' AND h.state != 'purged' ORDER BY h.state, h.created_at DESC LIMIT 500`,
      ).all(),
      c.env.DB.prepare("SELECT used, allocated, hard_cap, checked_at FROM custom_hostname_quota WHERE id = 1").first(),
    ])
    return ok({ items: rows.results, quota })
  })
  r("POST", "/domains/:hostname/delete", "owner_recent", async (c) => {
    const b = await body(c)
    const reason = requireReason(b.reason)
    const host = c.req.param("hostname") ?? ""
    const row = await c.env.DB.prepare("SELECT tenant_id FROM tenant_hostnames WHERE hostname = ? AND kind = 'custom' AND state != 'purged'").bind(host).first<{ tenant_id: string }>()
    if (!row) throw new AppError(404, "DOMAIN_NOT_FOUND", "Domain tidak ditemukan.")
    const now = Date.now()
    try {
      // Root + www are one domain: deleting one deletes both (no orphan the gerai cannot manage).
      await purgeDomain(c.env, row.tenant_id, now)
    } catch (e) {
      if (e instanceof CfError) throw new AppError(503, "CF_UNAVAILABLE", "Cloudflare belum bisa dihubungi. Coba lagi nanti.")
      throw e
    }
    await auditStatement(c.env, { actorId: c.get("session").user.id, action: "hostname.delete", targetType: "hostname", targetId: host, tenantId: row.tenant_id, reason, now }).run()
    return ok({ deleted: true })
  })

  // `Periksa Status Domain` (DEC-244): refresh one hostname, or every pending/failing one plus the Cloudflare quota.
  r("POST", "/domains/periksa", "owner_aal2", async (c) => {
    const now = Date.now()
    const lim = await hit(c.env.DB, `owner-domain-recheck:${c.get("session").user.id}`, 4, 60_000, now)
    if (!lim.allowed) throw new AppError(429, "RECHECK_RATE_LIMITED", "Tunggu sebentar sebelum memeriksa domain lagi.")
    const b = await body(c)
    const host = typeof b.hostname === "string" && b.hostname ? b.hostname.toLowerCase() : null
    let checked: number
    try {
      if (host) {
        if (!(await refreshHost(c.env, host, now, { probeFetch }))) throw new AppError(404, "DOMAIN_NOT_FOUND", "Domain tidak ditemukan.")
        checked = 1
      } else {
        checked = await pollHosts(c.env, now, probeFetch)
        await checkQuota(c.env, now).catch(() => null)
      }
    } catch (e) {
      if (e instanceof CfError) throw new AppError(503, "CF_UNAVAILABLE", "Cloudflare belum bisa dihubungi. Coba lagi nanti.")
      throw e
    }
    await auditStatement(c.env, { actorId: c.get("session").user.id, action: "hostname.recheck", targetType: host ? "hostname" : "platform", targetId: host ?? undefined, reason: "Periksa status domain", metadata: { checked }, now }).run()
    return ok({ checked, checkedAt: now })
  })

  // `Sinkron & Periksa Ulang` per gerai (DEC-244): onboarding read-back when unknown, finance sync and discount
  // verification when connected, custom-domain refresh. Operational reads only — never touches shipments (DEC-209).
  r("POST", "/gerai/:slug/sinkron", "owner_aal2", async (c) => {
    const now = Date.now()
    const t = await c.env.DB.prepare("SELECT t.id, COALESCE(o.onboarding_state, 'not_connected') AS onboarding_state FROM tenants t LEFT JOIN tenant_onboarding o ON o.tenant_id = t.id WHERE t.slug = ?")
      .bind(c.req.param("slug"))
      .first<{ id: string; onboarding_state: string }>()
    if (!t) throw new AppError(404, "TENANT_NOT_FOUND", "Gerai tidak ditemukan.")
    const lim = await hit(c.env.DB, `owner-gerai-sync:${t.id}`, 6, 60_000, now)
    if (!lim.allowed) throw new AppError(429, "RECHECK_RATE_LIMITED", "Tunggu sebentar sebelum sinkron ulang gerai ini.")
    let onboardingState = t.onboarding_state
    if (onboardingState === "registration_unknown") onboardingState = (await reconcileRegistration(c.env, t.id, now)).state
    // Finance: queue this gerai's regular cron sync (the system runs it in the tenant object) instead of calling the
    // vault from Super Admin code — a sync may end by paying held batches, which a platform admin must never trigger
    // directly (DEC-209, non-impersonation scan).
    let financeSync: "queued" | "skipped" = "skipped"
    if (onboardingState === "connected" || onboardingState === "byok_connected") {
      await c.env.FINANCE_SYNC_QUEUE.send({ tenant_id: t.id, trigger: "cron" } satisfies FinanceMessage)
      financeSync = "queued"
      await c.env.DB.prepare("UPDATE tenant_discount_rules SET next_check_at = ? WHERE tenant_id = ?").bind(now, t.id).run()
      await runDiscountVerifier(c.env, now, 1, t.id).catch(() => null)
    }
    let domainsChecked = 0
    try {
      for (const d of await domainRows(c.env, t.id)) if (await refreshHost(c.env, d.hostname, now, { probeFetch })) domainsChecked++
    } catch (e) {
      if (!(e instanceof CfError)) throw e
    }
    await auditStatement(c.env, { actorId: c.get("session").user.id, action: "tenant.sync_recheck", targetType: "tenant", targetId: t.id, tenantId: t.id, reason: "Sinkron & periksa ulang gerai", metadata: { onboardingState, financeSync, domainsChecked }, now }).run()
    return ok({ syncedAt: now, onboardingState, financeSync, domainsChecked })
  })

  // Retry provisioning / resolve registration_unknown by read-back (never a blind re-register).
  r("POST", "/gerai/:slug/onboarding/retry", "owner_recent", async (c) => {
    const b = await body(c)
    const reason = requireReason(b.reason)
    const t = await c.env.DB.prepare(
      `SELECT t.id, t.name, COALESCE(o.onboarding_state, 'not_connected') AS onboarding_state, a.seller_email, a.outlet_json FROM tenants t LEFT JOIN tenant_onboarding o ON o.tenant_id = t.id
       JOIN tenant_applications a ON a.tenant_id = t.id WHERE t.slug = ? AND a.state = 'approved'`,
    )
      .bind(c.req.param("slug"))
      .first<{ id: string; name: string; onboarding_state: string; seller_email: string; outlet_json: string }>()
    if (!t) throw new AppError(404, "TENANT_NOT_FOUND", "Gerai tidak ditemukan.")
    const now = Date.now()
    await auditStatement(c.env, { actorId: c.get("session").user.id, action: "tenant.onboarding_retry", targetType: "tenant", targetId: t.id, tenantId: t.id, reason, now }).run()
    if (t.onboarding_state === "registration_unknown") return ok(await reconcileRegistration(c.env, t.id, now))
    if (t.onboarding_state === "registration_pending" || t.onboarding_state === "not_connected") {
      return ok(await provisionSeller(c.env, { tenantId: t.id, name: t.name, email: t.seller_email, outlet: JSON.parse(t.outlet_json) as OutletInput, now }))
    }
    throw new AppError(409, "NOTHING_TO_RETRY", "Tidak ada proses pendaftaran yang perlu diulang.")
  })
}
