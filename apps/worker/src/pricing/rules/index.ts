// Discount & cashback matrix (TASK-207, PR-11, spec 02 §2.1, DEC-205/226/230/233). D1 control plane: Super Admin
// sets `assigned_bps` per gerai × service within the courier band (platform fallback); the Mengantar team applies it;
// a verifier compares it with the observed discount on estimates (+15/+60/+120 min, then daily, plus every quote).
// Customers always pay the publish tariff; nothing here is exposed to a customer or cashier DTO.
import { bandForCourier, isAssignedBpsAllowed, nextVerificationState, parseDiscountBand, verificationCheckAt, type DiscountBand, type VerificationState } from "@gx/domain/money"
import type { ObservedRate } from "../../do/gerai-vault"
import { observedCargoBps, observedRegularBps } from "../quote/engine"
import { auditStatement } from "../../api/owner"
import { AppError } from "../../http/envelope"
import { sendAlert } from "../../telemetry/alerts"

export interface PlatformPolicy extends DiscountBand {
  applySlaMinutes: number
}

export interface PartnerSchedule {
  masterDiscountBps: number
  extraPromoBps: number
  extraPromoNote: string | null
  platformMarginBps: number
  targetGeraiBps: number
}

export interface RuleRow {
  tenant_id: string
  service_code: string
  courier_code: string
  service_class: "regular" | "cargo"
  assigned_bps: number
  cashback_bps: number
  effective_from: number
  apply_channel: "mengantar_team" | "partner_api"
  requested_at: number
  request_sent_at: number | null
  applied_at: number | null
  verified_at: number | null
  verification_state: VerificationState
  observed_bps: number | null
  observed_at: number | null
  next_check_at: number | null
  check_step: number
  alerted_at: number | null
  updated_at: number
  updated_by: string | null
}

export async function platformPolicy(db: D1Database): Promise<PlatformPolicy> {
  const r = await db.prepare("SELECT default_discount_bps, min_discount_bps, max_discount_bps, apply_sla_minutes FROM platform_pricing_policy WHERE id = 1").first<{ default_discount_bps: number; min_discount_bps: number; max_discount_bps: number; apply_sla_minutes: number }>()
  if (!r) throw new Error("platform_pricing_policy row missing")
  return { defaultBps: r.default_discount_bps, minBps: r.min_discount_bps, maxBps: r.max_discount_bps, applySlaMinutes: r.apply_sla_minutes }
}

export async function courierBands(db: D1Database): Promise<Map<string, DiscountBand>> {
  const rows = (await db.prepare("SELECT courier_code, default_discount_bps, min_discount_bps, max_discount_bps FROM courier_discount_policy").all<{ courier_code: string; default_discount_bps: number; min_discount_bps: number; max_discount_bps: number }>()).results
  return new Map(rows.map((r) => [r.courier_code, { defaultBps: r.default_discount_bps, minBps: r.min_discount_bps, maxBps: r.max_discount_bps }]))
}

export async function partnerSchedules(db: D1Database): Promise<Map<string, PartnerSchedule>> {
  const rows = (
    await db
      .prepare("SELECT courier_code, master_discount_bps, extra_promo_bps, extra_promo_note, platform_margin_bps FROM partner_discount_schedule")
      .all<{ courier_code: string; master_discount_bps: number; extra_promo_bps: number; extra_promo_note: string | null; platform_margin_bps: number }>()
  ).results
  return new Map(
    rows.map((r) => [
      r.courier_code,
      {
        masterDiscountBps: r.master_discount_bps,
        extraPromoBps: r.extra_promo_bps,
        extraPromoNote: r.extra_promo_note,
        platformMarginBps: r.platform_margin_bps,
        targetGeraiBps: Math.max(0, r.master_discount_bps - r.platform_margin_bps),
      },
    ]),
  )
}

/**
 * Gives a newly approved gerai a rule at the courier default (platform default when the courier has no band) for every
 * active service, state `belum_diterapkan`. Part of the approval batch and guarded by THIS approval (its
 * `decision_nonce`), so a lost race or a repeated call seeds nothing; existing rules are kept.
 */
export function seedRulesOnApproval(env: Env, input: { tenantId: string; applicationId: string; nonce: string; now: number; defaultBps: number }): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO tenant_discount_rules (tenant_id, service_code, courier_code, service_class, assigned_bps, cashback_bps, effective_from, apply_channel,
       requested_at, verification_state, next_check_at, check_step, updated_at, updated_by)
     SELECT ?1, c.service_code, c.courier_code, c.service_class, COALESCE(p.default_discount_bps, ?2), 0, ?3, 'mengantar_team', ?3, 'belum_diterapkan', ?4, 0, ?3, 'system'
     FROM courier_service_catalog c LEFT JOIN courier_discount_policy p ON p.courier_code = c.courier_code
     WHERE c.is_active = 1 AND (SELECT decision_nonce FROM tenant_applications WHERE id = ?5) = ?6
     ON CONFLICT(tenant_id, service_code) DO NOTHING`,
  ).bind(input.tenantId, input.defaultBps, input.now, verificationCheckAt(input.now, 0), input.applicationId, input.nonce)
}

/** Rules of one gerai with the band and DEC-256 partner master schedule that apply to each. */
export async function listRules(env: Env, tenantId: string) {
  const [policy, bands, schedules, rows, tenant] = await Promise.all([
    platformPolicy(env.DB),
    courierBands(env.DB),
    partnerSchedules(env.DB),
    env.DB.prepare(
      `SELECT r.*, c.display_name, c.courier_name FROM tenant_discount_rules r JOIN courier_service_catalog c ON c.service_code = r.service_code
       WHERE r.tenant_id = ? ORDER BY c.sort_order`,
    )
      .bind(tenantId)
      .all<RuleRow & { display_name: string; courier_name: string }>(),
    env.DB.prepare("SELECT id, name, slug, status FROM tenants WHERE id = ?").bind(tenantId).first<{ id: string; name: string; slug: string; status: string }>(),
  ])
  if (!tenant) throw new AppError(404, "TENANT_NOT_FOUND", "Gerai tidak ditemukan.")
  return {
    tenant,
    applySlaMinutes: policy.applySlaMinutes,
    items: rows.results.map((r) => ({
      ...r,
      band: bandForCourier(bands.get(r.courier_code), policy),
      schedule: schedules.get(r.courier_code) ?? null,
    })),
  }
}

/** Super Admin edit (route requires recent TOTP + reason). Resets verification to `belum_diterapkan`. */
export async function updateRule(env: Env, input: { tenantId: string; serviceCode: string; assignedBps: unknown; cashbackBps: unknown; actorId: string; reason: string; now: number }) {
  const [policy, bands] = await Promise.all([platformPolicy(env.DB), courierBands(env.DB)])
  const cur = await env.DB.prepare("SELECT * FROM tenant_discount_rules WHERE tenant_id = ? AND service_code = ?").bind(input.tenantId, input.serviceCode).first<RuleRow>()
  if (!cur) throw new AppError(404, "RULE_NOT_FOUND", "Aturan tarif tidak ditemukan.")
  const band = bandForCourier(bands.get(cur.courier_code), policy)
  const assigned = input.assignedBps
  if (typeof assigned !== "number" || !isAssignedBpsAllowed(assigned, band)) {
    throw new AppError(422, "DISCOUNT_OUT_OF_BAND", `Diskon harus antara ${band.minBps / 100}% dan ${band.maxBps / 100}%.`, { assignedBps: `Isi ${band.minBps / 100}–${band.maxBps / 100}%.` })
  }
  const cashback = input.cashbackBps === undefined ? cur.cashback_bps : input.cashbackBps
  if (typeof cashback !== "number" || !Number.isSafeInteger(cashback) || cashback < 0 || cashback > 10_000) {
    throw new AppError(422, "CASHBACK_INVALID", "Cashback tidak valid.", { cashbackBps: "Isi 0–100%." })
  }
  const changedDiscount = assigned !== cur.assigned_bps
  const res = await env.DB.batch([
    env.DB.prepare(
      `UPDATE tenant_discount_rules SET assigned_bps = ?1, cashback_bps = ?2, effective_from = ?3, updated_at = ?3, updated_by = ?4,
         requested_at = CASE WHEN ?5 THEN ?3 ELSE requested_at END,
         request_sent_at = CASE WHEN ?5 THEN NULL ELSE request_sent_at END,
         applied_at = CASE WHEN ?5 THEN NULL ELSE applied_at END,
         verified_at = CASE WHEN ?5 THEN NULL ELSE verified_at END,
         verification_state = CASE WHEN ?5 THEN 'belum_diterapkan' ELSE verification_state END,
         next_check_at = CASE WHEN ?5 THEN ?6 ELSE next_check_at END,
         check_step = CASE WHEN ?5 THEN 0 ELSE check_step END,
         alerted_at = CASE WHEN ?5 THEN NULL ELSE alerted_at END
       WHERE tenant_id = ?7 AND service_code = ?8 AND updated_at = ?9`,
    ).bind(assigned, cashback, input.now, input.actorId, changedDiscount ? 1 : 0, verificationCheckAt(input.now, 0), input.tenantId, input.serviceCode, cur.updated_at),
    auditStatement(env, {
      actorId: input.actorId,
      action: "pricing.rule_update",
      targetType: "tenant_discount_rule",
      targetId: `${input.tenantId}:${input.serviceCode}`,
      tenantId: input.tenantId,
      reason: input.reason,
      metadata: { from: { assignedBps: cur.assigned_bps, cashbackBps: cur.cashback_bps }, to: { assignedBps: assigned, cashbackBps: cashback } },
      now: input.now,
    }),
  ])
  if ((res[0]?.meta.changes ?? 0) !== 1) throw new AppError(409, "RULE_CHANGED", "Aturan baru saja diubah orang lain. Muat ulang lalu coba lagi.")
  return env.DB.prepare("SELECT * FROM tenant_discount_rules WHERE tenant_id = ? AND service_code = ?").bind(input.tenantId, input.serviceCode).first<RuleRow>()
}

/** `Tandai sudah diminta ke Mengantar` for a set of rules (request list export → Mengantar team). */
export async function markRequested(env: Env, input: { keys: Array<{ tenantId: string; serviceCode: string }>; actorId: string; reason: string; now: number }) {
  if (!Array.isArray(input.keys) || input.keys.length === 0 || input.keys.length > 500) throw new AppError(422, "INVALID_INPUT", "Pilih aturan yang sudah diminta.")
  const stmts = input.keys.map((k) =>
    env.DB.prepare("UPDATE tenant_discount_rules SET request_sent_at = ?1 WHERE tenant_id = ?2 AND service_code = ?3 AND request_sent_at IS NULL AND apply_channel = 'mengantar_team'").bind(input.now, String(k.tenantId), String(k.serviceCode)),
  )
  stmts.push(auditStatement(env, { actorId: input.actorId, action: "pricing.request_sent", targetType: "tenant_discount_rule", reason: input.reason, metadata: { count: input.keys.length }, now: input.now }))
  const res = await env.DB.batch(stmts)
  return { marked: res.slice(0, -1).reduce((n, r) => n + (r.meta.changes ?? 0), 0) }
}

/** Rules waiting for the Mengantar team (not yet `sesuai`), oldest first; CSV export uses the same rows. */
export async function requestList(env: Env) {
  return (
    await env.DB.prepare(
      `SELECT r.tenant_id, t.name AS tenant_name, t.slug, r.service_code, c.display_name, r.courier_code, r.assigned_bps, r.observed_bps, r.verification_state,
              r.requested_at, r.request_sent_at
       FROM tenant_discount_rules r JOIN tenants t ON t.id = r.tenant_id JOIN courier_service_catalog c ON c.service_code = r.service_code
       WHERE r.apply_channel = 'mengantar_team' AND r.verification_state != 'sesuai' AND t.status = 'active'
       ORDER BY r.requested_at LIMIT 1000`,
    ).all<Record<string, unknown>>()
  ).results
}

export function requestListCsv(rows: Array<Record<string, unknown>>): string {
  const head = ["gerai", "alamat_gerai", "kode_layanan", "layanan", "diskon_diminta_persen", "diskon_teramati_persen", "status", "diminta_pada"]
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v)
    // Neutralise spreadsheet formulas and quote every field.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
    return `"${safe.replace(/"/g, '""')}"`
  }
  const pct = (bps: unknown) => (typeof bps === "number" ? (bps / 100).toFixed(2) : "")
  const label: Record<string, string> = { belum_diterapkan: "Belum diterapkan", sesuai: "Sesuai", selisih: "Selisih" }
  const lines = rows.map((r) =>
    [r.tenant_name, r.slug, r.service_code, r.display_name, pct(r.assigned_bps), pct(r.observed_bps), label[String(r.verification_state)] ?? "", new Date(Number(r.requested_at)).toISOString()].map(esc).join(","),
  )
  return [head.join(","), ...lines].join("\r\n") + "\r\n"
}

/** Platform and per-courier policy edits (`Kebijakan Diskon`), TOTP + reason. A band change never rewrites rules. */
export async function updatePlatformPolicy(env: Env, input: { band: unknown; applySlaMinutes: unknown; actorId: string; reason: string; now: number }) {
  const b = input.band as { defaultBps: unknown; minBps: unknown; maxBps: unknown }
  const band = parseDiscountBand(b ?? {})
  const sla = input.applySlaMinutes
  if (!band) throw new AppError(422, "INVALID_BAND", "Batas diskon tidak valid: minimum ≤ default ≤ maksimum, 0–100%.")
  if (typeof sla !== "number" || !Number.isSafeInteger(sla) || sla < 1 || sla > 7 * 24 * 60) throw new AppError(422, "INVALID_SLA", "Waktu penerapan tidak valid.")
  const before = await platformPolicy(env.DB)
  await env.DB.batch([
    env.DB.prepare("UPDATE platform_pricing_policy SET default_discount_bps = ?, min_discount_bps = ?, max_discount_bps = ?, apply_sla_minutes = ?, updated_at = ?, updated_by = ? WHERE id = 1").bind(band.defaultBps, band.minBps, band.maxBps, sla, input.now, input.actorId),
    auditStatement(env, { actorId: input.actorId, action: "pricing.platform_policy_update", targetType: "platform_pricing_policy", reason: input.reason, metadata: { from: before, to: { ...band, applySlaMinutes: sla } }, now: input.now }),
  ])
  return platformPolicy(env.DB)
}

export async function upsertCourierPolicy(env: Env, input: { courierCode: string; band: unknown | null; actorId: string; reason: string; now: number }) {
  const known = await env.DB.prepare("SELECT 1 FROM courier_service_catalog WHERE courier_code = ? LIMIT 1").bind(input.courierCode).first()
  if (!known) throw new AppError(404, "COURIER_NOT_FOUND", "Ekspedisi tidak ditemukan.")
  if (input.band === null) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM courier_discount_policy WHERE courier_code = ?").bind(input.courierCode),
      auditStatement(env, { actorId: input.actorId, action: "pricing.courier_policy_reset", targetType: "courier_discount_policy", targetId: input.courierCode, reason: input.reason, now: input.now }),
    ])
    return null
  }
  const band = parseDiscountBand((input.band ?? {}) as { defaultBps: unknown; minBps: unknown; maxBps: unknown })
  if (!band) throw new AppError(422, "INVALID_BAND", "Batas diskon tidak valid: minimum ≤ default ≤ maksimum, 0–100%.")
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO courier_discount_policy (courier_code, default_discount_bps, min_discount_bps, max_discount_bps, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(courier_code) DO UPDATE SET default_discount_bps = ?2, min_discount_bps = ?3, max_discount_bps = ?4, updated_at = ?5, updated_by = ?6`,
    ).bind(input.courierCode, band.defaultBps, band.minBps, band.maxBps, input.now, input.actorId),
    auditStatement(env, { actorId: input.actorId, action: "pricing.courier_policy_update", targetType: "courier_discount_policy", targetId: input.courierCode, reason: input.reason, metadata: band, now: input.now }),
  ])
  return band
}

/** Update Mengantar partner master rate & platform margin split (DEC-256) for one courier. TOTP + reason + audit. */
export async function updatePartnerSchedule(
  env: Env,
  input: { courierCode: string; masterDiscountBps: unknown; extraPromoBps: unknown; extraPromoNote: unknown; platformMarginBps: unknown; actorId: string; reason: string; now: number },
): Promise<PartnerSchedule> {
  const known = await env.DB.prepare("SELECT 1 FROM courier_service_catalog WHERE courier_code = ? LIMIT 1").bind(input.courierCode).first()
  if (!known) throw new AppError(404, "COURIER_NOT_FOUND", "Ekspedisi tidak ditemukan.")
  const master = input.masterDiscountBps
  const extra = input.extraPromoBps === undefined ? 0 : input.extraPromoBps
  const margin = input.platformMarginBps
  if (typeof master !== "number" || !Number.isSafeInteger(master) || master < 0 || master > 10_000) {
    throw new AppError(422, "INVALID_SCHEDULE", "Diskon master Mengantar harus antara 0% dan 100%.")
  }
  if (typeof extra !== "number" || !Number.isSafeInteger(extra) || extra < 0 || extra > 10_000 || master + extra > 10_000) {
    throw new AppError(422, "INVALID_SCHEDULE", "Promo ekstra tidak valid (total master + promo maksimal 100%).")
  }
  if (typeof margin !== "number" || !Number.isSafeInteger(margin) || margin < 0 || margin > master) {
    throw new AppError(422, "INVALID_SCHEDULE", "Margin platform tidak boleh melebihi diskon master Mengantar.")
  }
  const note = typeof input.extraPromoNote === "string" && input.extraPromoNote.trim() ? input.extraPromoNote.trim().slice(0, 200) : null
  const before = (await partnerSchedules(env.DB)).get(input.courierCode) ?? null
  const next: PartnerSchedule = { masterDiscountBps: master, extraPromoBps: extra, extraPromoNote: note, platformMarginBps: margin, targetGeraiBps: master - margin }
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO partner_discount_schedule (courier_code, master_discount_bps, extra_promo_bps, extra_promo_note, platform_margin_bps, updated_at, updated_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(courier_code) DO UPDATE SET
         master_discount_bps = ?2, extra_promo_bps = ?3, extra_promo_note = ?4, platform_margin_bps = ?5, updated_at = ?6, updated_by = ?7`,
    ).bind(input.courierCode, master, extra, note, margin, input.now, input.actorId),
    auditStatement(env, {
      actorId: input.actorId,
      action: "pricing.partner_schedule_update",
      targetType: "partner_discount_schedule",
      targetId: input.courierCode,
      reason: input.reason,
      metadata: { from: before, to: next },
      now: input.now,
    }),
  ])
  return next
}

/**
 * Applies `courier_discount_policy` bands derived from the current `partner_discount_schedule` (DEC-256):
 *   default = master - margin (e.g. 25% regulars, 10% pos),
 *   min = min(platform.minBps, default) (unlocks pos 10% while keeping 20% floor for regulars),
 *   max = min(10000, master + extraPromo) (e.g. 30% regulars, 35% SPX/J&T, 15% pos).
 * Existing tenant rules are never rewritten automatically.
 */
export async function applyScheduleBands(env: Env, input: { actorId: string; reason: string; now: number }): Promise<{ applied: number }> {
  const [platform, schedules, activeCouriers] = await Promise.all([
    platformPolicy(env.DB),
    partnerSchedules(env.DB),
    env.DB.prepare("SELECT DISTINCT courier_code FROM courier_service_catalog WHERE is_active = 1").all<{ courier_code: string }>(),
  ])
  const stmts: D1PreparedStatement[] = []
  const appliedCouriers: Record<string, DiscountBand> = {}
  for (const { courier_code } of activeCouriers.results) {
    const s = schedules.get(courier_code)
    if (!s) continue
    const defaultBps = s.targetGeraiBps
    const minBps = Math.min(platform.minBps, defaultBps)
    const maxBps = Math.min(10_000, Math.max(defaultBps, s.masterDiscountBps + s.extraPromoBps))
    appliedCouriers[courier_code] = { defaultBps, minBps, maxBps }
    stmts.push(
      env.DB.prepare(
        `INSERT INTO courier_discount_policy (courier_code, default_discount_bps, min_discount_bps, max_discount_bps, updated_at, updated_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(courier_code) DO UPDATE SET default_discount_bps = ?2, min_discount_bps = ?3, max_discount_bps = ?4, updated_at = ?5, updated_by = ?6`,
      ).bind(courier_code, defaultBps, minBps, maxBps, input.now, input.actorId),
    )
  }
  if (stmts.length === 0) return { applied: 0 }
  stmts.push(
    auditStatement(env, {
      actorId: input.actorId,
      action: "pricing.courier_policy_preset_apply",
      targetType: "courier_discount_policy",
      reason: input.reason,
      metadata: { applied: stmts.length, bands: appliedCouriers },
      now: input.now,
    }),
  )
  await env.DB.batch(stmts)
  return { applied: Object.keys(appliedCouriers).length }
}

/**
 * Bulk-applies each courier's effective policy default (`band.defaultBps`) to all active rules of one gerai.
 * Changed rows reset to `belum_diterapkan` for Mengantar CS application; unchanged rows stay untouched.
 */
export async function applyDefaultBandToTenant(
  env: Env,
  input: { tenantId: string; actorId: string; reason: string; now: number },
): Promise<{ tenantId: string; updated: number; unchanged: number; changes: Array<{ serviceCode: string; fromBps: number; toBps: number }> }> {
  const [tenant, policy, bands, rows] = await Promise.all([
    env.DB.prepare("SELECT id FROM tenants WHERE id = ?").bind(input.tenantId).first<{ id: string }>(),
    platformPolicy(env.DB),
    courierBands(env.DB),
    env.DB.prepare(
      `SELECT r.service_code, r.courier_code, r.assigned_bps
       FROM tenant_discount_rules r
       JOIN courier_service_catalog c ON c.service_code = r.service_code
       WHERE r.tenant_id = ? AND c.is_active = 1`,
    )
      .bind(input.tenantId)
      .all<{ service_code: string; courier_code: string; assigned_bps: number }>(),
  ])
  if (!tenant) throw new AppError(404, "TENANT_NOT_FOUND", "Gerai tidak ditemukan.")
  const stmts: D1PreparedStatement[] = []
  const changes: Array<{ serviceCode: string; fromBps: number; toBps: number }> = []
  let unchanged = 0
  const nextCheck = verificationCheckAt(input.now, 0)
  for (const r of rows.results) {
    const band = bandForCourier(bands.get(r.courier_code), policy)
    const target = band.defaultBps
    if (r.assigned_bps === target) {
      unchanged++
      continue
    }
    changes.push({ serviceCode: r.service_code, fromBps: r.assigned_bps, toBps: target })
    stmts.push(
      env.DB.prepare(
        `UPDATE tenant_discount_rules
         SET assigned_bps = ?1, effective_from = ?2, updated_at = ?2, updated_by = ?3,
             requested_at = ?2, request_sent_at = NULL, applied_at = NULL, verified_at = NULL,
             verification_state = 'belum_diterapkan', next_check_at = ?4, check_step = 0, alerted_at = NULL
         WHERE tenant_id = ?5 AND service_code = ?6`,
      ).bind(target, input.now, input.actorId, nextCheck, input.tenantId, r.service_code),
    )
  }
  stmts.push(
    auditStatement(env, {
      actorId: input.actorId,
      action: "pricing.rule_bulk_preset",
      targetType: "tenant",
      targetId: input.tenantId,
      tenantId: input.tenantId,
      reason: input.reason,
      metadata: { updated: changes.length, unchanged, changes },
      now: input.now,
    }),
  )
  await env.DB.batch(stmts)
  return { tenantId: input.tenantId, updated: changes.length, unchanged, changes }
}

/** Observed discount per service class (regular: `discountPercent` or `discount/price`; cargo: `cargoDiscount/cargoPrice` or percent). */
export function observedBpsOf(
  serviceClass: "regular" | "cargo",
  rate: Pick<
    ObservedRate,
    "price" | "discount" | "discountPercent" | "discountExtra" | "discountExtraPercent" | "cargoPrice" | "cargoDiscount" | "cargoDiscountPercent" | "cargoDiscountExtra" | "cargoDiscountExtraPercent"
  >,
): number | null {
  return serviceClass === "cargo" ? observedCargoBps(rate) : observedRegularBps(rate)
}

/**
 * Apply one observation to a rule (scheduled check or a quote). Records `observed_bps` as-is, moves the state per
 * spec 02 §2.1, schedules the next check, and alerts once when the rule becomes `selisih`.
 */
export async function recordObservation(env: Env, input: { tenantId: string; serviceCode: string; observedBps: number | null; now: number; scheduled: boolean }) {
  const [rule, policy] = await Promise.all([
    env.DB.prepare("SELECT * FROM tenant_discount_rules WHERE tenant_id = ? AND service_code = ?").bind(input.tenantId, input.serviceCode).first<RuleRow>(),
    platformPolicy(env.DB),
  ])
  if (!rule) return null
  const next = nextVerificationState({ state: rule.verification_state, assignedBps: rule.assigned_bps, observedBps: input.observedBps, requestedAt: rule.requested_at, now: input.now, applySlaMinutes: policy.applySlaMinutes })
  // A late cron run skips the checks already in the past (catch-up), so one run never schedules a past time.
  let step = rule.check_step
  if (input.scheduled) do step++
  while (verificationCheckAt(rule.requested_at, step) <= input.now)
  const nextCheck = input.scheduled ? verificationCheckAt(rule.requested_at, step) : rule.next_check_at
  const becameSesuai = next === "sesuai" && rule.verification_state !== "sesuai"
  const alert = next === "selisih" && rule.verification_state !== "selisih"
  const res = await env.DB.prepare(
    `UPDATE tenant_discount_rules SET verification_state = ?1, observed_bps = COALESCE(?2, observed_bps), observed_at = CASE WHEN ?2 IS NULL THEN observed_at ELSE ?3 END,
       verified_at = CASE WHEN ?4 THEN ?3 ELSE verified_at END, applied_at = CASE WHEN ?4 AND applied_at IS NULL THEN ?3 ELSE applied_at END,
       next_check_at = ?5, check_step = ?6, alerted_at = CASE WHEN ?7 THEN ?3 ELSE alerted_at END
     WHERE tenant_id = ?8 AND service_code = ?9 AND updated_at = ?10`,
  )
    .bind(next, input.observedBps, input.now, becameSesuai ? 1 : 0, nextCheck, step, alert ? 1 : 0, input.tenantId, input.serviceCode, rule.updated_at)
    .run()
  // A rule edited meanwhile (optimistic lock lost): this observation belongs to the old rule — no alert, no state.
  if ((res.meta.changes ?? 0) !== 1) return rule.verification_state
  if (alert) {
    await sendAlert(env, { key: `discount_selisih.${input.tenantId}.${input.serviceCode}`.toLowerCase().replace(/[^a-z0-9_.-]/g, "-").slice(0, 80), severity: "warn", text: `Diskon gerai belum sesuai di Mengantar (${input.serviceCode}): diminta ${rule.assigned_bps / 100}%, teramati ${input.observedBps === null ? "—" : `${input.observedBps / 100}%`}.` }, input.now)
  }
  return next
}

/**
 * Scheduled verifier (cron, every 5 min): for each gerai with due rules, read one `courier=all` estimate through the
 * tenant object (seller key never leaves it) and record the observation per service. Rules of a gerai without an
 * estimate (not connected, fenced key, provider error) still advance their schedule; only the SLA moves them.
 */
export async function runDiscountVerifier(env: Env, now: number, limitTenants = 20, onlyTenantId: string | null = null): Promise<{ tenants: number; observed: number }> {
  // `onlyTenantId` (DEC-244 targeted recheck): verify exactly that gerai, never whichever other one is most overdue.
  const due = (
    await env.DB.prepare(
      `SELECT r.tenant_id, MIN(r.next_check_at) AS due, json_extract(a.outlet_json, '$.areaId') AS area_id
       FROM tenant_discount_rules r JOIN tenants t ON t.id = r.tenant_id AND t.status = 'active'
       LEFT JOIN tenant_applications a ON a.tenant_id = r.tenant_id AND a.state = 'approved'
       WHERE r.next_check_at IS NOT NULL AND r.next_check_at <= ?1 AND (?3 IS NULL OR r.tenant_id = ?3) GROUP BY r.tenant_id ORDER BY due LIMIT ?2`,
    )
      .bind(now, limitTenants, onlyTenantId)
      .all<{ tenant_id: string; area_id: string | null }>()
  ).results
  let observed = 0
  const { vaultFor } = await import("../../do/gerai-vault/stub")
  for (const t of due) {
    const rules = (await env.DB.prepare("SELECT service_code, service_class FROM tenant_discount_rules WHERE tenant_id = ? AND next_check_at <= ?").bind(t.tenant_id, now).all<{ service_code: string; service_class: "regular" | "cargo" }>()).results
    const vault = vaultFor(env, t.tenant_id)
    let areaId = t.area_id
    if (!areaId) {
      const def = await vault.defaultOutlet(t.tenant_id).catch(() => null)
      if (def?.ok && def.value?.areaId) areaId = def.value.areaId
    }
    let rates: Record<string, ObservedRate> | null = null
    if (areaId) {
      const r = await vault.observeRates(t.tenant_id, areaId).catch(() => null)
      if (r?.ok) rates = r.value
    }
    for (const rule of rules) {
      const rate = rates?.[rule.service_code]
      const bps = rate && !rate.unsupported ? observedBpsOf(rule.service_class, rate) : null
      if (bps !== null) observed++
      await recordObservation(env, { tenantId: t.tenant_id, serviceCode: rule.service_code, observedBps: bps, now, scheduled: true })
    }
  }
  return { tenants: due.length, observed }
}

/**
 * Pulls live per-expedition discounts from the tenant's connected Mengantar account (`observeRates`) and adopts them
 * into `tenant_discount_rules` as `sesuai` (TOTP + reason + audit). Ideal for BYOK accounts or gerai with varied
 * per-courier negotiated discounts in Mengantar.
 */
export async function syncDiscountsFromMengantar(
  env: Env,
  input: { tenantId: string; actorId: string; reason: string; now: number },
): Promise<{
  tenantId: string
  total: number
  synced: number
  unchanged: number
  skipped: number
  observedAt: number
  changes: Array<{ serviceCode: string; fromBps: number; toBps: number }>
}> {
  const tenant = await env.DB.prepare("SELECT id, status FROM tenants WHERE id = ?").bind(input.tenantId).first<{ id: string; status: string }>()
  if (!tenant) throw new AppError(404, "TENANT_NOT_FOUND", "Gerai tidak ditemukan.")

  // Validate area and fetch live Mengantar rates BEFORE writing any default rule rows so a failed sync never leaves
  // unaudited tenant_discount_rules rows behind (TASK-707 Sol P2).
  const policy = await platformPolicy(env.DB)
  const { vaultFor } = await import("../../do/gerai-vault/stub")
  const vault = vaultFor(env, input.tenantId)
  const [outlet, appRow, rulesRes] = await Promise.all([
    vault.defaultOutlet(input.tenantId).catch(() => null),
    env.DB.prepare("SELECT json_extract(outlet_json, '$.areaId') AS area_id FROM tenant_applications WHERE tenant_id = ? AND state = 'approved' ORDER BY created_at DESC LIMIT 1")
      .bind(input.tenantId)
      .first<{ area_id: string | null }>(),
    env.DB.prepare(
      `SELECT c.service_code, c.service_class,
              COALESCE(r.assigned_bps, p.default_discount_bps, ?2) AS assigned_bps,
              COALESCE(r.verification_state, 'belum_diterapkan') AS verification_state
       FROM courier_service_catalog c
       LEFT JOIN courier_discount_policy p ON p.courier_code = c.courier_code
       LEFT JOIN tenant_discount_rules r ON r.tenant_id = ?1 AND r.service_code = c.service_code
       WHERE c.is_active = 1`,
    )
      .bind(input.tenantId, policy.defaultBps)
      .all<{ service_code: string; service_class: "regular" | "cargo"; assigned_bps: number; verification_state: VerificationState }>(),
  ])
  const areaId = (outlet?.ok ? outlet.value?.areaId : null) ?? appRow?.area_id ?? null
  if (!areaId) throw new AppError(422, "AREA_REQUIRED", "Wilayah titik jemput gerai belum diatur sehingga diskon Mengantar tidak dapat dibaca.")

  const ratesRes = await vault.observeRates(input.tenantId, areaId)
  if (!ratesRes.ok) {
    if (ratesRes.refused === "NO_KEY") throw new AppError(409, "NOT_CONNECTED", "Gerai belum terhubung ke API Mengantar atau kunci API sedang dirotasi.")
    throw new AppError(503, "TENANT_NOT_READY", "Gagal membaca tarif dari Mengantar. Coba lagi sebentar lagi.")
  }

  const nextDaily = input.now + 24 * 3600_000
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO tenant_discount_rules (tenant_id, service_code, courier_code, service_class, assigned_bps, cashback_bps, effective_from, apply_channel,
         requested_at, verification_state, next_check_at, check_step, updated_at, updated_by)
       SELECT ?1, c.service_code, c.courier_code, c.service_class, COALESCE(p.default_discount_bps, ?2), 0, ?3, 'mengantar_team', ?3, 'belum_diterapkan', ?4, 0, ?3, 'system'
       FROM courier_service_catalog c LEFT JOIN courier_discount_policy p ON p.courier_code = c.courier_code
       WHERE c.is_active = 1
       ON CONFLICT(tenant_id, service_code) DO NOTHING`,
    ).bind(input.tenantId, policy.defaultBps, input.now, verificationCheckAt(input.now, 0)),
  ]
  const changes: Array<{ serviceCode: string; fromBps: number; toBps: number }> = []
  let synced = 0
  let unchanged = 0
  let skipped = 0

  for (const rule of rulesRes.results) {
    const rate = ratesRes.value[rule.service_code]
    const observedBps = rate && !rate.unsupported ? observedBpsOf(rule.service_class, rate) : null
    if (observedBps === null || !Number.isSafeInteger(observedBps) || observedBps < 0 || observedBps > 10_000) {
      skipped++
      continue
    }
    const changed = observedBps !== rule.assigned_bps || rule.verification_state !== "sesuai"
    if (observedBps !== rule.assigned_bps) {
      changes.push({ serviceCode: rule.service_code, fromBps: rule.assigned_bps, toBps: observedBps })
    }
    if (changed) synced++
    else unchanged++
    stmts.push(
      env.DB.prepare(
        `UPDATE tenant_discount_rules
         SET assigned_bps = ?1, observed_bps = ?1, observed_at = ?2, verified_at = ?2,
             applied_at = COALESCE(applied_at, ?2), verification_state = 'sesuai',
             effective_from = CASE WHEN assigned_bps != ?1 THEN ?2 ELSE effective_from END,
             next_check_at = ?3, alerted_at = NULL, updated_at = ?2, updated_by = ?4
         WHERE tenant_id = ?5 AND service_code = ?6`,
      ).bind(observedBps, input.now, nextDaily, input.actorId, input.tenantId, rule.service_code),
    )
  }

  stmts.push(
    auditStatement(env, {
      actorId: input.actorId,
      action: "pricing.sync_from_mengantar",
      targetType: "tenant",
      targetId: input.tenantId,
      tenantId: input.tenantId,
      reason: input.reason,
      metadata: { total: rulesRes.results.length, synced, unchanged, skipped, changes },
      now: input.now,
    }),
  )
  await env.DB.batch(stmts)
  return { tenantId: input.tenantId, total: rulesRes.results.length, synced, unchanged, skipped, observedAt: input.now, changes }
}
