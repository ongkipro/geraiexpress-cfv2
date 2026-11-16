// TASK-208 Super Admin Ringkasan / Pengawasan / Sistem & Audit: audited reads, risk_review permission, rotation action
// through the fence, legal profile NULL vs filled, non-impersonation scan.
import { env, exports } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import type { GeraiVaultDO } from "../../src/do/gerai-vault"
import { enqueueOutbox } from "../../src/do/gerai-vault/core/outbox"
import { vaultFor } from "../../src/do/gerai-vault/stub"
import { ROUTES } from "../../src/api/registry"
import { canonicalPhone, phoneHmac } from "../../src/admin/monitor"
import { hostCache } from "../../src/host/lookup"
import { resetMock } from "../../src/mengantar/mock"
import "../../src/index"
import { scanOwnerRoutes, scanOwnerVaultCalls } from "../../../../scripts/ci/route-scan-lib.mjs"
import { adminSession, ownerGet, ownerPost, submit } from "../onboarding/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

async function approved(slug: string) {
  const s = await submit(slug, `${slug}.seller@contoh.test`)
  const admin = await adminSession()
  expect((await ownerPost(`/gerai/applications/${s.applicationId}/approve`, admin, { reason: "data lengkap dan valid" })).status).toBe(200)
  return { ...s, admin }
}
const lastAudit = (action: string) => env.DB.prepare("SELECT actor_id, reason, target_id, metadata_json FROM audit_logs WHERE action = ? ORDER BY at DESC LIMIT 1").bind(action).first<{ actor_id: string; reason: string; target_id: string; metadata_json: string | null }>()

describe("Ringkasan", () => {
  it("returns KPI, a 14-day series and recent alerts without PII", async () => {
    const admin = await adminSession()
    const r = (await (await ownerGet("/overview", admin)).json()) as { data: { kpi: Record<string, unknown>; series: unknown[]; alerts: unknown[] } }
    expect(r.data.kpi).toHaveProperty("active_tenants")
    expect(r.data.kpi).toHaveProperty("pending_applications")
    expect(r.data.series).toHaveLength(14)
    expect(JSON.stringify(r.data)).not.toMatch(/@contoh\.test|08\d{8}/)
  })
})

describe("Radar Risiko COD (risk_review + recent TOTP + audited read)", () => {
  it("phone is hashed server-side; counts per tenant; the read is audited with the reason and no phone", async () => {
    const g = await approved("risikosatu")
    const key = await phoneHmac(env.AUTH_SESSION_PEPPER, canonicalPhone("0812-3456-7890")!)
    // The tenant object publishes absolute counts through its outbox; a stale version never overwrites.
    await runInDurableObject(vaultFor(env, g.tenantId), (_i: GeraiVaultDO, s) => {
      enqueueOutbox(s.storage.sql, "recipient_risk_index", key, 2, { delivered_count: 3, rts_count: 2, last_event_at: Date.now() }, 0)
      enqueueOutbox(s.storage.sql, "recipient_risk_index", key, 1, { delivered_count: 99, rts_count: 99, last_event_at: 1 }, 0)
    })
    await vaultFor(env, g.tenantId).flushOutbox(Date.now() + 1000)
    expect(await env.DB.prepare("SELECT delivered_count, rts_count, version FROM recipient_risk_index WHERE phone_hmac = ?").bind(key).first()).toEqual({ delivered_count: 3, rts_count: 2, version: 2 })
    // The test admin has no risk_review yet → 403.
    expect((await ownerPost("/pengawasan/risiko", g.admin, { phone: "0812-3456-7890", reason: "cek penerima COD" })).status).toBe(403)
    await env.DB.prepare("UPDATE super_admins SET risk_review = 1").run()
    expect((await ownerPost("/pengawasan/risiko", g.admin, { phone: "0812", reason: "cek penerima COD" })).status).toBe(422)
    expect((await ownerPost("/pengawasan/risiko", g.admin, { phone: "081234567890" })).status).toBe(422) // reason required
    const r = await ownerPost("/pengawasan/risiko", g.admin, { phone: "+62 812-3456-7890", reason: "cek penerima COD" })
    const body = (await r.json()) as { data: { items: Array<{ tenant_id: string; rts_count: number }>; total: { delivered: number; rts: number; rtsBps: number } } }
    expect(body.data.total).toEqual({ delivered: 3, rts: 2, rtsBps: 4000 })
    const audit = await lastAudit("risk.read")
    expect(audit).toMatchObject({ reason: "cek penerima COD", target_id: key.slice(0, 12) })
    expect(JSON.stringify(audit)).not.toContain("3456")
  })
})

describe("Sistem & Audit", () => {
  it("audit viewer filters and audits the read; health has no secrets", async () => {
    const admin = await adminSession()
    const r = await ownerGet("/sistem/audit?action=tenant.", admin)
    expect(r.status).toBe(200)
    const items = ((await r.json()) as { data: { items: Array<{ action: string }> } }).data.items
    expect(items.every((x) => x.action.startsWith("tenant."))).toBe(true)
    expect(await lastAudit("audit.read")).not.toBeNull()
    // Underscores are literal (escaped), not stripped: `risk_review` finds `admin.risk_review_*` only.
    const { env } = await import("cloudflare:workers")
    await env.DB.prepare("INSERT INTO audit_logs (id, at, actor_type, actor_id, action, reason) VALUES ('a-us', ?, 'system', 'x', 'admin.risk_review_grant', 'uji')").bind(Date.now()).run()
    const u = ((await (await ownerGet("/sistem/audit?action=admin.risk_review", admin)).json()) as { data: { items: Array<{ action: string }> } }).data.items
    expect(u.map((x) => x.action)).toContain("admin.risk_review_grant")
    const none = ((await (await ownerGet("/sistem/audit?action=admin.riskxreview", admin)).json()) as { data: { items: unknown[] } }).data.items
    expect(none).toEqual([])
    const h = await (await ownerGet("/sistem/kesehatan", admin)).text()
    expect(h).not.toMatch(/test-relay-secret|test-partner-secret|KEY-|MOCK-/)
  })

  it("Rotasi Kunci Seller needs a reason, uses the fence and audits", async () => {
    const g = await approved("rotasiadmin")
    expect((await ownerPost("/sistem/rotasi-kunci/rotasiadmin", g.admin, {})).status).toBe(422)
    const before = await vaultFor(env, g.tenantId).connectionView(g.tenantId)
    const r = await ownerPost("/sistem/rotasi-kunci/rotasiadmin", g.admin, { reason: "dugaan kebocoran kunci" })
    expect(r.status).toBe(200)
    expect(((await r.json()) as { data: { state: string } }).data.state).toBe("rotated")
    const after = await vaultFor(env, g.tenantId).connectionView(g.tenantId)
    expect(after.ok && before.ok && after.value!.keyVersion).toBe(before.ok ? before.value!.keyVersion + 1 : -1)
    expect(await lastAudit("seller_key.rotate")).toMatchObject({ reason: "dugaan kebocoran kunci" })
  })

  it("risk_review grant is audited and never self-service", async () => {
    const admin = await adminSession()
    const list = ((await (await ownerGet("/sistem/admin", admin)).json()) as { data: { items: Array<{ user_id: string }>; me: string } }).data
    expect((await ownerPost(`/sistem/admin/${list.me}/risk-review`, admin, { enabled: true, reason: "izin radar" })).status).toBe(409)
  })
})

describe("Profil Perusahaan (DEC-218)", () => {
  it("renders NULL until filled; validates; NPWP stored encrypted and shown masked; audit names fields only", async () => {
    const admin = await adminSession()
    const empty = ((await (await ownerGet("/sistem/profil-perusahaan", admin)).json()) as { data: { fields: Record<string, string | null>; npwpMasked: string | null } }).data
    expect(empty.fields.legal_name).toBeNull()
    expect(empty.npwpMasked).toBeNull()
    const bad = await ownerPost("/sistem/profil-perusahaan", admin, { fields: { nib: "123", support_email: "x" }, reason: "isi profil" })
    expect(bad.status).toBe(422)
    expect(((await bad.json()) as { error: { field_errors: Record<string, string> } }).error.field_errors).toMatchObject({ nib: "NIB terdiri dari 13 angka.", support_email: "Email tidak valid." })
    const okRes = await ownerPost("/sistem/profil-perusahaan", admin, { fields: { legal_name: "PT Contoh Ekspres Indonesia", nib: "1234567890123", npwp: "01.234.567.8-901.000" }, reason: "isi profil" })
    expect(okRes.status).toBe(200)
    const filled = ((await (await ownerGet("/sistem/profil-perusahaan", admin)).json()) as { data: { fields: Record<string, string | null>; npwpMasked: string } }).data
    expect(filled.fields.legal_name).toBe("PT Contoh Ekspres Indonesia")
    expect(filled.npwpMasked).toMatch(/^•+1000$/)
    const raw = await env.DB.prepare("SELECT encrypted_npwp FROM platform_legal_profile WHERE id = 1").first<{ encrypted_npwp: string }>()
    expect(raw!.encrypted_npwp).not.toContain("012345678901000")
    const audit = await lastAudit("legal_profile.update")
    expect(JSON.parse(audit!.metadata_json!)).toEqual({ fields: ["legal_name", "nib", "encrypted_npwp"] })
  })
})

describe("non-impersonation scan (DEC-209)", () => {
  it("no owner route names a shipment/payment action and owner code calls only read/admin vault RPCs", () => {
    expect(scanOwnerRoutes(ROUTES)).toEqual([])
    expect(scanOwnerRoutes([{ context: "owner", method: "POST", path: "/gerai/:slug/kiriman" }])).toHaveLength(1)
    // The source scan of owner-side modules runs in Node (scripts/ci/non-impersonation.test.mjs).
    expect(scanOwnerVaultCalls([{ path: "fixture.ts", source: "const v = vaultFor(env, id)\nawait v.payUnpaid()" }])).toHaveLength(1)
  })

  it("owner host never serves app or tenant-mutating APIs", async () => {
    for (const p of ["/api/app/settings/couriers", "/api/owner/kiriman", "/api/owner/gerai/x/kiriman"]) {
      expect((await exports.default.fetch(`http://owner.geraiexpress.localhost:8787${p}`, { method: "POST" })).status).toBe(404)
    }
  })
})
