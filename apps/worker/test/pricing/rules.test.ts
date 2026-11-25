// TASK-207 discount & cashback matrix (PR-11, spec 02 §2.1, DEC-205/226/230/233).
import { env, exports } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { mockDiscountBps, resetMock } from "../../src/mengantar/mock"
import { observedBpsOf, recordObservation, runDiscountVerifier } from "../../src/pricing/rules"
import { adminSession, appUser, ownerGet, ownerPost, submit } from "../onboarding/helpers"
import { appGet } from "../webhooks/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

type Rule = { service_code: string; courier_code: string; service_class: string; assigned_bps: number; verification_state: string; observed_bps: number | null; requested_at: number; next_check_at: number | null; check_step: number; band: { minBps: number; maxBps: number } }
const rules = async (admin: string, tenantId: string) => ((await (await ownerGet(`/tarif/gerai/${tenantId}`, admin)).json()) as { data: { items: Rule[] } }).data.items
const ruleOf = async (tenantId: string, service: string) => env.DB.prepare("SELECT * FROM tenant_discount_rules WHERE tenant_id = ? AND service_code = ?").bind(tenantId, service).first<Rule>()

async function approved(slug: string) {
  const s = await submit(slug, `${slug}.seller@contoh.test`)
  const admin = await adminSession()
  const r = await ownerPost(`/gerai/applications/${s.applicationId}/approve`, admin, { reason: "data lengkap dan valid" })
  expect(r.status).toBe(200)
  return { ...s, admin }
}

describe("seeding on approval (DEC-233)", () => {
  it("a newly approved gerai has 20 % rules for every active courier/service in state Belum diterapkan", async () => {
    const g = await approved("tarifsatu")
    const items = await rules(g.admin, g.tenantId)
    const active = (await env.DB.prepare("SELECT COUNT(*) AS n FROM courier_service_catalog WHERE is_active = 1").first<{ n: number }>())!.n
    expect(items).toHaveLength(active)
    expect(items.every((r) => r.assigned_bps === 2000 && r.verification_state === "belum_diterapkan")).toBe(true)
    expect(items.map((r) => r.service_code)).not.toContain("ninja")
  })
})

describe("editing rules (TOTP + reason + audit, band per courier)", () => {
  it("rejects below 20 % and above the ceiling; a change resets to Belum diterapkan with an audit row", async () => {
    const g = await approved("tarifdua")
    const edit = (bps: unknown, reason = "permintaan pemilik") => ownerPost(`/tarif/gerai/${g.tenantId}/JNE`, g.admin, { assignedBps: bps, reason })
    expect((await edit(1999)).status).toBe(422)
    const over = await edit(3001)
    expect(over.status).toBe(422)
    expect(((await over.json()) as { error: { message: string } }).error.message).toBe("Diskon harus antara 20% dan 30%.")
    expect((await edit(2500, "")).status).toBe(422) // reason required
    await env.DB.prepare("UPDATE tenant_discount_rules SET verification_state = 'sesuai', verified_at = 1 WHERE tenant_id = ? AND service_code = 'JNE'").bind(g.tenantId).run()
    expect((await edit(2500)).status).toBe(200)
    const r = await ruleOf(g.tenantId, "JNE")
    expect(r).toMatchObject({ assigned_bps: 2500, verification_state: "belum_diterapkan", check_step: 0 })
    const audit = await env.DB.prepare("SELECT reason, metadata_json FROM audit_logs WHERE action = 'pricing.rule_update' AND tenant_id = ?").bind(g.tenantId).first<{ reason: string; metadata_json: string }>()
    expect(audit!.reason).toBe("permintaan pemilik")
    expect(JSON.parse(audit!.metadata_json)).toEqual({ from: { assignedBps: 2000, cashbackBps: 0 }, to: { assignedBps: 2500, cashbackBps: 0 } })
  })

  it("changing a courier's band needs no code change; two couriers with different bands", async () => {
    const g = await approved("tarifband")
    const pol = await ownerPost("/tarif/kebijakan/kurir/JT", g.admin, { band: { defaultBps: 2200, minBps: 2200, maxBps: 3500 }, reason: "kesepakatan baru JT" })
    expect(pol.status).toBe(200)
    expect((await ownerPost(`/tarif/gerai/${g.tenantId}/JT`, g.admin, { assignedBps: 3400, reason: "naik ke 34 persen" })).status).toBe(200)
    expect((await ownerPost(`/tarif/gerai/${g.tenantId}/JNE`, g.admin, { assignedBps: 3400, reason: "naik ke 34 persen" })).status).toBe(422)
    expect((await ownerPost(`/tarif/gerai/${g.tenantId}/JT`, g.admin, { assignedBps: 2100, reason: "turun ke 21 persen" })).status).toBe(422)
    const items = await rules(g.admin, g.tenantId)
    expect(items.find((r) => r.service_code === "JT")!.band).toMatchObject({ minBps: 2200, maxBps: 3500 })
    expect(items.find((r) => r.service_code === "JNE")!.band).toMatchObject({ minBps: 2000, maxBps: 3000 })
    // A new gerai approved after the band change starts at the courier default.
    const g2 = await approved("tarifband2")
    expect((await ruleOf(g2.tenantId, "JT"))!.assigned_bps).toBe(2200)
    expect((await ownerPost("/tarif/kebijakan/kurir/JT", g.admin, { band: { defaultBps: 1000, minBps: 2000, maxBps: 3000 }, reason: "band tidak valid" })).status).toBe(422)
  })
})

describe("verification (fake clock)", () => {
  it("+15/+60/+120 min: Belum diterapkan → Sesuai when Mengantar applied it; → Selisih + alert after 2 × SLA when not", { timeout: 40_000 }, async () => {
    const g = await approved("tarifcek")
    const t0 = (await ruleOf(g.tenantId, "JNE"))!.requested_at
    // Mengantar gives 20 % on JNE regular, and 15 % on JT (not applied).
    mockDiscountBps.set("JT", 1500)
    await runDiscountVerifier(env, t0 + 15 * 60_000)
    expect((await ruleOf(g.tenantId, "JNE"))!.verification_state).toBe("sesuai")
    expect((await ruleOf(g.tenantId, "JT"))).toMatchObject({ verification_state: "belum_diterapkan", observed_bps: 1500 })
    await runDiscountVerifier(env, t0 + 60 * 60_000)
    expect((await ruleOf(g.tenantId, "JT"))!.verification_state).toBe("belum_diterapkan")
    await runDiscountVerifier(env, t0 + 120 * 60_000)
    const jt = await ruleOf(g.tenantId, "JT")
    expect(jt!.verification_state).toBe("selisih")
    // Next check is daily after the +120 min one.
    expect(jt!.next_check_at).toBe(t0 + 120 * 60_000 + 24 * 3600_000)
    const alert = await env.DB.prepare("SELECT alert_key FROM alert_state WHERE alert_key = ?").bind(`discount_selisih.${g.tenantId}.jt`.toLowerCase()).first()
    expect(alert).not.toBeNull()
  })

  it("a verified rule drifting to 1000 → Selisih; back within 1 bp → Sesuai; 2000 vs 1999 → Sesuai", async () => {
    const g = await approved("tarifgeser")
    const now = Date.now()
    expect(await recordObservation(env, { tenantId: g.tenantId, serviceCode: "SiCepat", observedBps: 1999, now, scheduled: false })).toBe("sesuai")
    expect(await recordObservation(env, { tenantId: g.tenantId, serviceCode: "SiCepat", observedBps: 1000, now, scheduled: false })).toBe("selisih")
    expect(await recordObservation(env, { tenantId: g.tenantId, serviceCode: "SiCepat", observedBps: 2001, now, scheduled: false })).toBe("sesuai")
  })

  it("a cargo fixture whose regular and cargo discounts differ verifies against the cargo value", async () => {
    expect(observedBpsOf("cargo", { price: 60000, discount: 0, discountPercent: 0, cargoPrice: 60000, cargoDiscount: 15000 })).toBe(2500)
    expect(observedBpsOf("regular", { price: 60000, discount: 0, discountPercent: 0, cargoPrice: 60000, cargoDiscount: 15000 })).toBe(0)
    const g = await approved("tarifkargo")
    await ownerPost(`/tarif/gerai/${g.tenantId}/JNECargo`, g.admin, { assignedBps: 2500, reason: "kargo 25" })
    mockDiscountBps.set("JNECargo", 2500)
    const r = await ruleOf(g.tenantId, "JNECargo")
    await runDiscountVerifier(env, r!.requested_at + 15 * 60_000)
    expect((await ruleOf(g.tenantId, "JNECargo"))).toMatchObject({ verification_state: "sesuai", observed_bps: 2500 })
  })
})

describe("request list and exposure", () => {
  it("lists unapplied rules, exports CSV without formulas, and marks them requested", async () => {
    const g = await approved("tarifminta")
    const list = ((await (await ownerGet("/tarif/permintaan", g.admin)).json()) as { data: { items: Array<{ tenant_id: string; service_code: string }> } }).data.items
    expect(list.some((x) => x.tenant_id === g.tenantId)).toBe(true)
    const csv = await (await ownerGet("/tarif/permintaan.csv", g.admin)).text()
    expect(csv.split("\r\n")[0]).toBe("gerai,alamat_gerai,kode_layanan,layanan,diskon_diminta_persen,diskon_teramati_persen,status,diminta_pada")
    expect(csv).toContain('"20.00"')
    const mark = await ownerPost("/tarif/permintaan/tandai", g.admin, { keys: [{ tenantId: g.tenantId, serviceCode: "JNE" }], reason: "dikirim ke tim Mengantar" })
    expect(((await mark.json()) as { data: { marked: number } }).data.marked).toBe(1)
  })

  it("no customer or cashier DTO carries discount fields; the owner sees assigned % read-only", async () => {
    const g = await approved("tarifdto")
    const owner = await appGet("/settings/couriers", g.user.cookie)
    const body = (await owner.json()) as { data: { items: Array<{ services: Array<{ discount: unknown }> }> } }
    expect(body.data.items[0]!.services[0]!.discount).toMatchObject({ assignedBps: 2000 })
    // Cashier: no route that returns rules.
    const k = await appUser("kasir.tarif@contoh.test")
    await env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'cashier', 'active', ?)").bind(g.tenantId, k.id, Date.now()).run()
    expect((await appGet("/settings/couriers", k.cookie)).status).toBe(403)
    // Public/tenant host: nothing.
    const site = await exports.default.fetch(`http://tarifdto.geraimitra.localhost:8787/`)
    expect(await site.text()).not.toMatch(/assigned_bps|diskon/i)
  })
})

describe("sync actual Mengantar discounts per expedition (BYOK / varied discounts)", () => {
  it("pulls varied per-courier regular & cargo discounts from Mengantar, adopts them as sesuai, audits, and exposes them in GET /gerai/:slug", async () => {
    const g = await approved("tariftarik")
    mockDiscountBps.set("JNE", 2500)
    mockDiscountBps.set("JT", 1500)
    mockDiscountBps.set("SiCepat", 3200)
    mockDiscountBps.set("JNECargo", 2700)

    const res = await ownerPost(`/tarif/gerai/${g.tenantId}/tarik-mengantar`, g.admin, { reason: "sinkron diskon akun BYOK" })
    expect(res.status).toBe(200)
    const out = (await res.json()) as { data: { synced: number; skipped: number; changes: Array<{ serviceCode: string; fromBps: number; toBps: number }> } }
    expect(out.data.synced).toBeGreaterThanOrEqual(4)
    expect(out.data.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ serviceCode: "JNE", toBps: 2500 }),
        expect.objectContaining({ serviceCode: "JT", toBps: 1500 }),
        expect.objectContaining({ serviceCode: "SiCepat", toBps: 3200 }),
        expect.objectContaining({ serviceCode: "JNECargo", toBps: 2700 }),
      ]),
    )
    expect(await ruleOf(g.tenantId, "JNE")).toMatchObject({ assigned_bps: 2500, observed_bps: 2500, verification_state: "sesuai" })
    expect(await ruleOf(g.tenantId, "JT")).toMatchObject({ assigned_bps: 1500, observed_bps: 1500, verification_state: "sesuai" })
    expect(await ruleOf(g.tenantId, "SiCepat")).toMatchObject({ assigned_bps: 3200, observed_bps: 3200, verification_state: "sesuai" })
    expect(await ruleOf(g.tenantId, "JNECargo")).toMatchObject({ assigned_bps: 2700, observed_bps: 2700, verification_state: "sesuai" })

    const audit = await env.DB.prepare("SELECT action, reason FROM audit_logs WHERE action = 'pricing.sync_from_mengantar' AND tenant_id = ?").bind(g.tenantId).first<{ action: string; reason: string }>()
    expect(audit).toEqual({ action: "pricing.sync_from_mengantar", reason: "sinkron diskon akun BYOK" })

    const detail = (await (await ownerGet(`/gerai/tariftarik`, g.admin)).json()) as {
      data: { discounts: { summary: { sesuai: number; selisih: number }; items: Array<{ service_code: string; assigned_bps: number; observed_bps: number | null }> } }
    }
    expect(detail.data.discounts.summary.selisih).toBe(0)
    expect(detail.data.discounts.items.find((x) => x.service_code === "SiCepat")).toMatchObject({ assigned_bps: 3200, observed_bps: 3200 })

    // DEC-255 (TASK-708): a later manual edit on an adopted out-of-band rule is still bounded by the platform/courier band.
    const manualOob = await ownerPost(`/tarif/gerai/${g.tenantId}/JT`, g.admin, { assignedBps: 1600, reason: "coba ubah manual di luar batas" })
    expect(manualOob.status).toBe(422)
    expect(((await manualOob.json()) as { error: { code: string } }).error.code).toBe("DISCOUNT_OUT_OF_BAND")
    const manualInBand = await ownerPost(`/tarif/gerai/${g.tenantId}/JT`, g.admin, { assignedBps: 2500, reason: "ubah manual dalam batas" })
    expect(manualInBand.status).toBe(200)
  })

  it("preserves exact per-expedition Mengantar discount bps without ±1 bp rounding drift while never masking real discrepancies", () => {
    // Rp 7.500 * 12.5% = 937.5 -> Mengantar rounds discount to Rp 938; naive floor(938*10000/7500) = 1250, Rp 939 would be 1252.
    expect(
      observedBpsOf("regular", {
        price: 7500,
        discount: 938,
        discountPercent: 12.5,
        discountExtra: null,
        discountExtraPercent: null,
        cargoPrice: null,
        cargoDiscount: null,
        cargoDiscountPercent: null,
        cargoDiscountExtra: null,
        cargoDiscountExtraPercent: null,
      }),
    ).toBe(1250)
    // Rp 9.000 * 17.5% = 1575; Rp 11.500 * 22.5% = 2587.5 -> rounded to 2588 (naive floor = 2250, 2587 = 2249 -> snaps cleanly to 2250).
    expect(
      observedBpsOf("regular", {
        price: 11500,
        discount: 2587,
        discountPercent: 22.5,
        discountExtra: null,
        discountExtraPercent: null,
        cargoPrice: null,
        cargoDiscount: null,
        cargoDiscountPercent: null,
        cargoDiscountExtra: null,
        cargoDiscountExtraPercent: null,
      }),
    ).toBe(2250)
    // Base + extra promo snaps cleanly when Rupiah total matches within ±1 Rp.
    expect(
      observedBpsOf("cargo", {
        price: null,
        discount: null,
        discountPercent: null,
        discountExtra: null,
        discountExtraPercent: null,
        cargoPrice: 43_000,
        cargoDiscount: 9_675,
        cargoDiscountPercent: 22.5,
        cargoDiscountExtra: 2_150,
        cargoDiscountExtraPercent: 5,
      }),
    ).toBe(2750)
    // Real discrepancy (> 1 Rp difference between declared percent and Rupiah discount) is NEVER masked.
    expect(
      observedBpsOf("regular", {
        price: 10_000,
        discount: 2500,
        discountPercent: 20,
        discountExtra: null,
        discountExtraPercent: null,
        cargoPrice: null,
        cargoDiscount: null,
        cargoDiscountPercent: null,
        cargoDiscountExtra: null,
        cargoDiscountExtraPercent: null,
      }),
    ).toBe(2500)
    // Invalid Rupiah discount (< 0 or > price) is rejected (null), never snapped to 0 or 10000 bps.
    expect(
      observedBpsOf("regular", {
        price: 10_000,
        discount: -1,
        discountPercent: 0,
        discountExtra: null,
        discountExtraPercent: null,
        cargoPrice: null,
        cargoDiscount: null,
        cargoDiscountPercent: null,
        cargoDiscountExtra: null,
        cargoDiscountExtraPercent: null,
      }),
    ).toBeNull()
    expect(
      observedBpsOf("regular", {
        price: 10_000,
        discount: 10_001,
        discountPercent: 100,
        discountExtra: null,
        discountExtraPercent: null,
        cargoPrice: null,
        cargoDiscount: null,
        cargoDiscountPercent: null,
        cargoDiscountExtra: null,
        cargoDiscountExtraPercent: null,
      }),
    ).toBeNull()
  })
})
