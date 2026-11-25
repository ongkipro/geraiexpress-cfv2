// Super Admin `Tarif & Kurir` routes (TASK-207, visual 07 §3.3). Reads need aal2; every change needs a recent TOTP +
// reason and is audited. These routes set commercial rules only; they never touch a gerai's shipments (DEC-209).
import type { Hono } from "hono"
import { register } from "../../api/registry"
import { auditStatement, ownerGuard, requireReason, type OwnerCtx } from "../../api/owner"
import { hit } from "../../auth/throttle"
import { AppError, ok } from "../../http/envelope"
import { courierBands, listRules, runDiscountVerifier, markRequested, platformPolicy, requestList, requestListCsv, syncDiscountsFromMengantar, updatePlatformPolicy, updateRule, upsertCourierPolicy } from "."

async function body(c: OwnerCtx): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json()
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerPricingAdmin(app: Hono<any>): void {
  const r = (method: "GET" | "POST", path: string, auth: "owner_aal2" | "owner_recent", handler: (c: OwnerCtx) => Promise<Response>) =>
    register(app, { context: "owner", method, path, auth, projection: "role" }, ownerGuard, (c) => handler(c as OwnerCtx))

  r("GET", "/tarif/gerai", "owner_aal2", async (c) => {
    const rows = await c.env.DB.prepare(
      `SELECT t.id, t.name, t.slug,
              SUM(CASE WHEN r.verification_state = 'sesuai' THEN 1 ELSE 0 END) AS sesuai,
              SUM(CASE WHEN r.verification_state = 'belum_diterapkan' THEN 1 ELSE 0 END) AS belum,
              SUM(CASE WHEN r.verification_state = 'selisih' THEN 1 ELSE 0 END) AS selisih,
              COUNT(r.service_code) AS total
       FROM tenants t LEFT JOIN tenant_discount_rules r ON r.tenant_id = t.id
       WHERE t.status IN ('active','suspended') GROUP BY t.id ORDER BY t.name LIMIT 500`,
    ).all()
    return ok({ items: rows.results })
  })
  r("GET", "/tarif/gerai/:tenantId", "owner_aal2", async (c) => ok(await listRules(c.env, c.req.param("tenantId") ?? "")))
  // `Verifikasi Ulang Diskon` (DEC-244): make the chosen gerai's rules (or every unverified rule) due now and run the
  // verifier immediately instead of waiting for the 5-minute cron. Reads Mengantar estimates only; rate-limited.
  r("POST", "/tarif/verifikasi-ulang", "owner_aal2", async (c) => {
    const now = Date.now()
    const lim = await hit(c.env.DB, `owner-discount-recheck:${c.get("session").user.id}`, 6, 60_000, now)
    if (!lim.allowed) throw new AppError(429, "RECHECK_RATE_LIMITED", "Tunggu sebentar sebelum verifikasi ulang.")
    const b = await body(c)
    const tenantId = typeof b.tenantId === "string" && b.tenantId ? b.tenantId : null
    if (tenantId) await c.env.DB.prepare("UPDATE tenant_discount_rules SET next_check_at = ? WHERE tenant_id = ?").bind(now, tenantId).run()
    else await c.env.DB.prepare("UPDATE tenant_discount_rules SET next_check_at = ? WHERE verification_state != 'sesuai'").bind(now).run()
    const r = await runDiscountVerifier(c.env, now, tenantId ? 1 : 20, tenantId)
    await auditStatement(c.env, { actorId: c.get("session").user.id, action: "pricing.discount_recheck", targetType: tenantId ? "tenant" : "platform", targetId: tenantId ?? undefined, tenantId, reason: "Verifikasi ulang diskon", metadata: r, now }).run()
    return ok({ ...r, checkedAt: now })
  })
  // Pull & adopt actual per-expedition discounts directly from the tenant's connected Mengantar account.
  // Registered before `/:serviceCode` so Hono matches the static action segment first.
  r("POST", "/tarif/gerai/:tenantId/tarik-mengantar", "owner_recent", async (c) => {
    const b = await body(c)
    const now = Date.now()
    const lim = await hit(c.env.DB, `owner-discount-sync:${c.get("session").user.id}`, 6, 60_000, now)
    if (!lim.allowed) throw new AppError(429, "RECHECK_RATE_LIMITED", "Tunggu sebentar sebelum menarik diskon ulang.")
    return ok(await syncDiscountsFromMengantar(c.env, { tenantId: c.req.param("tenantId") ?? "", actorId: c.get("session").user.id, reason: requireReason(b.reason), now }))
  })
  r("POST", "/tarif/gerai/:tenantId/:serviceCode", "owner_recent", async (c) => {
    const b = await body(c)
    const rule = await updateRule(c.env, { tenantId: c.req.param("tenantId") ?? "", serviceCode: c.req.param("serviceCode") ?? "", assignedBps: b.assignedBps, cashbackBps: b.cashbackBps, actorId: c.get("session").user.id, reason: requireReason(b.reason), now: Date.now() })
    return ok(rule)
  })
  r("GET", "/tarif/permintaan", "owner_aal2", async (c) => ok({ items: await requestList(c.env) }))
  r("GET", "/tarif/permintaan.csv", "owner_aal2", async (c) => {
    const csv = requestListCsv(await requestList(c.env))
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="permintaan-diskon-mengantar.csv"', "cache-control": "no-store" } })
  })
  r("POST", "/tarif/permintaan/tandai", "owner_recent", async (c) => {
    const b = await body(c)
    return ok(await markRequested(c.env, { keys: b.keys as Array<{ tenantId: string; serviceCode: string }>, actorId: c.get("session").user.id, reason: requireReason(b.reason), now: Date.now() }))
  })
  r("GET", "/tarif/kebijakan", "owner_aal2", async (c) => {
    const [platform, bands, couriers] = await Promise.all([
      platformPolicy(c.env.DB),
      courierBands(c.env.DB),
      c.env.DB.prepare("SELECT courier_code, MIN(courier_name) AS courier_name FROM courier_service_catalog WHERE is_active = 1 GROUP BY courier_code ORDER BY MIN(sort_order)").all<{ courier_code: string; courier_name: string }>(),
    ])
    return ok({ platform, couriers: couriers.results.map((x) => ({ courierCode: x.courier_code, name: x.courier_name, band: bands.get(x.courier_code) ?? null })) })
  })
  r("POST", "/tarif/kebijakan/platform", "owner_recent", async (c) => {
    const b = await body(c)
    return ok(await updatePlatformPolicy(c.env, { band: b.band, applySlaMinutes: b.applySlaMinutes, actorId: c.get("session").user.id, reason: requireReason(b.reason), now: Date.now() }))
  })
  r("POST", "/tarif/kebijakan/kurir/:courierCode", "owner_recent", async (c) => {
    const b = await body(c)
    return ok({ band: await upsertCourierPolicy(c.env, { courierCode: c.req.param("courierCode") ?? "", band: b.band === null ? null : b.band, actorId: c.get("session").user.id, reason: requireReason(b.reason), now: Date.now() }) })
  })
}
