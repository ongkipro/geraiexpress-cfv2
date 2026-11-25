// TASK-310 Pengaturan (visual 08 §2.3, DEC-218/223/225): owner forms validate in Indonesian and audit; Kasir gets
// 403 on every settings route except the printer read; NPWP is stored encrypted and only ever returned masked.
import { env } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { resetMock } from "../../src/mengantar/mock"
import { appUser } from "../onboarding/helpers"
import { appGet } from "../webhooks/helpers"
import { checkoutGerai, post } from "../dispatch/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

async function withCashier(slug: string) {
  const t = await checkoutGerai(slug)
  const k = await appUser(`kasir.${slug}@contoh.test`)
  await env.DB.batch([
    env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'cashier', 'active', ?)").bind(t.tenantId, k.id, Date.now()),
    env.DB.prepare("UPDATE sessions SET active_tenant_id = ? WHERE user_id = ?").bind(t.tenantId, k.id),
  ])
  return { t, k }
}

describe("Pengaturan", () => {
  it("Kasir: 403 on every settings route except the printer read", async () => {
    const { k } = await withCashier("aturkasir")
    for (const path of ["/settings", "/members"]) expect((await appGet(path, k.cookie)).status).toBe(403)
    for (const path of ["/settings/profile", "/settings/business", "/settings/receipt", "/settings/packing", "/settings/cashier-payout", "/members/x/revoke"]) {
      const res = await post(path, k.cookie, {})
      expect(res.status).toBe(403)
      expect(((await res.json()) as { error: { message: string } }).error.message).toBe("Menu ini hanya untuk pemilik gerai.")
    }
    expect((await appGet("/print/settings", k.cookie)).status).toBe(200)
  })

  it("Data Usaha: NPWP encrypted at rest, masked in responses and audit; omitted keeps it, empty clears it", async () => {
    const t = await checkoutGerai("aturnpwp")
    const bad = await post("/settings/business", t.cookie, { npwp: "12.345", nib: "123" })
    expect(((await bad.json()) as { error: { field_errors: Record<string, string> } }).error.field_errors).toMatchObject({ npwp: "NPWP 15 atau 16 angka.", nib: "NIB terdiri dari 13 angka." })
    const res = await post("/settings/business", t.cookie, { entityType: "ud", legalName: "UD Sinar Jaya", npwp: "01.234.567.8-901.234" })
    const text = await res.text()
    expect(text).not.toContain("012345678901234")
    expect((JSON.parse(text) as { data: { business: { npwpMasked: string } } }).data.business.npwpMasked).toBe("•••••••••••1234")
    const stored = await runInDurableObject(t.vault, (_i, s) => s.storage.sql.exec<{ encrypted_npwp: string }>("SELECT encrypted_npwp FROM tenant_business_profiles").one().encrypted_npwp)
    expect(stored).toMatch(/^v1\./)
    expect(stored).not.toContain("012345678901234")
    const audits = await runInDurableObject(t.vault, (_i, s) => s.storage.sql.exec<{ metadata_json: string }>("SELECT metadata_json FROM audit_logs WHERE action = 'settings.business'").toArray())
    expect(JSON.stringify(audits)).not.toContain("012345678901234")
    // Omitted → kept; "" → cleared.
    const kept = (await (await post("/settings/business", t.cookie, { entityType: "cv" })).json()) as { data: { business: { npwpMasked: string | null; entityType: string } } }
    expect(kept.data.business).toMatchObject({ entityType: "cv", npwpMasked: "•••••••••••1234" })
    const cleared = (await (await post("/settings/business", t.cookie, { npwp: "" })).json()) as { data: { business: { npwpMasked: string | null } } }
    expect(cleared.data.business.npwpMasked).toBeNull()
  })

  it("Profil, Printer & Struk, Packing & Biaya validate and persist", async () => {
    const t = await checkoutGerai("aturform")
    const p = await post("/settings/profile", t.cookie, { name: "Gerai Sinar Jaya", whatsapp: "0812-3456-7890", openingHours: "08.00–21.00", areaId: "5fc62f5df8f44b34aa4c0d8c", areaLabel: "Dago", street: "Jl. Dago No. 1", postalCode: "40135" })
    expect(((await p.json()) as { data: { profile: { whatsapp: string; name: string } } }).data.profile).toMatchObject({ name: "Gerai Sinar Jaya", whatsapp: "081234567890" })
    expect(((await (await post("/settings/profile", t.cookie, { name: "A", areaId: "x", street: "x" })).json()) as { error: { field_errors: Record<string, string> } }).error.field_errors).toMatchObject({ name: "Nama gerai minimal 3 huruf.", areaId: "Pilih kecamatan dari daftar." })
    const long = await post("/settings/receipt", t.cookie, { defaultLabelFormat: "label_10x10", unboxingRemark: "x".repeat(51) })
    expect(((await long.json()) as { error: { field_errors: Record<string, string> } }).error.field_errors.unboxingRemark).toBe("Maksimal 50 karakter.")
    await post("/settings/receipt", t.cookie, { defaultLabelFormat: "label_10x10", unboxingRemark: "", showCommission: true })
    expect(((await (await appGet("/print/settings", t.cookie)).json()) as { data: { format: string; remark: string; logoUrl: string | null } }).data).toEqual({ format: "label_10x10", remark: "", logoUrl: null })
    const fee = await post("/settings/packing", t.cookie, { items: [{ name: "Kardus", priceIdr: 5000 }], serviceFeeEnabled: true, serviceFeeIdr: 500 })
    expect(((await fee.json()) as { error: { field_errors: Record<string, string> } }).error.field_errors.serviceFeeIdr).toBe("Biaya layanan Rp1.000–Rp200.000.")
    const ok = (await (await post("/settings/packing", t.cookie, { items: [{ name: "Kardus", priceIdr: 5000 }, { name: "Bubble", priceIdr: 3000, active: false }], serviceFeeEnabled: true, serviceFeeIdr: 2000 })).json()) as { data: { packing: { items: Array<{ name: string; active: boolean }>; serviceFeeIdr: number } } }
    expect(ok.data.packing).toMatchObject({ serviceFeeIdr: 2000, items: [{ name: "Kardus", active: true }, { name: "Bubble", active: false }] })
  })

  it("saving Profil keeps the PIC phone, re-registers a moved pickup point, and renames the gerai in D1", async () => {
    const t = await checkoutGerai("profilaman")
    await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec("UPDATE tenant_outlets SET mengantar_address_id = 'addr-lama'"))
    const same = { name: "Gerai Profil Aman", whatsapp: "0812-3456-7890", openingHours: "08.00–21.00", areaId: "5fc62f5df8f44b34aa4c0d8c", areaLabel: "Dago", street: "Jl. Dago No. 1", postalCode: "40135" }
    expect((await post("/settings/profile", t.cookie, same)).status).toBe(200)
    const read = () => runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec<{ pic_phone: string | null; mengantar_address_id: string | null }>("SELECT pic_phone, mengantar_address_id FROM tenant_outlets WHERE is_default = 1").one())
    expect(await read()).toEqual({ pic_phone: "081200000000", mengantar_address_id: "addr-lama" })
    expect(await env.DB.prepare("SELECT name FROM tenants WHERE id = ?").bind(t.tenantId).first()).toEqual({ name: "Gerai Profil Aman" })
    expect((await post("/settings/profile", t.cookie, { ...same, street: "Jl. Baru No. 9" })).status).toBe(200)
    expect((await read()).mengantar_address_id).toBeNull()
  })

  it("Anggota: list, Kasir boleh bayar COD switch, revoke ends the Kasir's access; the owner cannot revoke self", async () => {
    const { t, k } = await withCashier("aturanggota")
    const list = ((await (await appGet("/members", t.cookie)).json()) as { data: { members: Array<{ id: string; role: string }> } }).data.members
    expect(list.map((m) => m.role).sort()).toEqual(["cashier", "gerai_admin"])
    const sw = (await (await post("/settings/cashier-payout", t.cookie, { enabled: true })).json()) as { data: { cashierMayPay: boolean } }
    expect(sw.data.cashierMayPay).toBe(true)
    const me = list.find((m) => m.role === "gerai_admin")!.id
    expect((await post(`/members/${me}/revoke`, t.cookie, {})).status).toBe(422)
    expect((await post(`/members/${k.id}/revoke`, t.cookie, {})).status).toBe(200)
    expect((await appGet("/print/settings", k.cookie)).status).toBe(401)
    expect((await post(`/members/${k.id}/revoke`, t.cookie, {})).status).toBe(404)
  })
})
