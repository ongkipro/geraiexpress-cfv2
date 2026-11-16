// Super Admin `Tarif & Kurir` routes (TASK-207, visual 07 §3.3). Reads need aal2; every change needs a recent TOTP +
// reason and is audited. These routes set commercial rules only; they never touch a gerai's shipments (DEC-209).
import type { Hono } from "hono"
import { register } from "../../api/registry"
import { ownerGuard, requireReason, type OwnerCtx } from "../../api/owner"
import { ok } from "../../http/envelope"
import { courierBands, listRules, markRequested, platformPolicy, requestList, requestListCsv, updatePlatformPolicy, updateRule, upsertCourierPolicy } from "."

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
