// TASK-305 masking (ADR-0005, DEC-206, DEC-231): settings (off → only Standar Gerai; enabled subset; default),
// kill-switch, quota 422 without silent fallback, verified WA, audited reveal, print snapshot per preset.
import { env } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import type { GeraiVaultDO } from "../../src/do/gerai-vault"
import { hostCache } from "../../src/host/lookup"
import { mockSeller, resetMock } from "../../src/mengantar/mock"
import { appGet, appPost } from "../webhooks/helpers"
import { checkoutGerai, post, readyInv } from "../dispatch/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

type State = { presets: string[]; defaultPreset: string; quotaLeft: number | null; quotaExhausted: boolean; killSwitchOff: boolean }
const state = async (cookie: string) => ((await (await appGet("/masking", cookie)).json()) as { data: State }).data
const platform = (tenantId: string, enabled: 0 | 1, quota: number | null) => env.DB.prepare("UPDATE tenants SET masking_enabled = ?, masking_daily_quota = ? WHERE id = ?").bind(enabled, quota, tenantId).run()

async function resellerGerai(slug: string) {
  const t = await checkoutGerai(slug)
  // Turn the verified sender into a reseller with a brand.
  await appPost(`/contacts/senders/${t.sender}`, t.cookie, { senderKind: "reseller_dropship", brandName: "TOKO HIJAB NISA", brandPhone: "081299990000", phone: "081234567890" })
  await appPost(`/contacts/senders/${t.sender}/verify-wa`, t.cookie, {})
  return t
}

describe("settings (Label & Privasi)", () => {
  it("off → only Standar Gerai; enabled subset; default preset; kill-switch off wins", async () => {
    const t = await checkoutGerai("maskset")
    await platform(t.tenantId, 1, 20)
    expect(await state(t.cookie)).toMatchObject({ presets: ["standar_gerai"], defaultPreset: "standar_gerai" })
    const bad = await appPost("/settings/masking", t.cookie, { offered: true, presetsEnabled: ["dropship_toko"], defaultPreset: "full_nama_gerai" })
    expect(bad.status).toBe(422)
    expect((await appPost("/settings/masking", t.cookie, { offered: true, presetsEnabled: ["dropship_toko", "privasi_penerima_cod"], defaultPreset: "dropship_toko" })).status).toBe(200)
    expect(await state(t.cookie)).toMatchObject({ presets: ["standar_gerai", "dropship_toko", "privasi_penerima_cod"], defaultPreset: "dropship_toko", quotaLeft: 20 })
    await platform(t.tenantId, 0, 20)
    expect(await state(t.cookie)).toMatchObject({ presets: ["standar_gerai"], defaultPreset: "standar_gerai", killSwitchOff: true })
  })
})

describe("issue with a masked preset", () => {
  it("Dropship Toko prints the reseller brand, never the outlet; snapshot stored; quota counted", async () => {
    const t = await resellerGerai("maskdrop")
    await platform(t.tenantId, 1, 5)
    await appPost("/settings/masking", t.cookie, { offered: true, presetsEnabled: ["dropship_toko"], defaultPreset: "dropship_toko" })
    const slug = await readyInv(t)
    await appPost(`/shipments/${slug}/parties`, t.cookie, { maskPreset: "dropship_toko" })
    const r = await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    expect(r.status).toBe(200)
    const snap = await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec<{ mask_preset: string; mask_snapshot_json: string; true_sender_json: string }>("SELECT mask_preset, mask_snapshot_json, true_sender_json FROM shipments WHERE slug = ?", slug).one())
    expect(snap.mask_preset).toBe("dropship_toko")
    expect(JSON.parse(snap.mask_snapshot_json)).toEqual({ preset: "dropship_toko", sender: { name: "TOKO HIJAB NISA", phone: "081299990000" }, recipientPhonePrinted: "085712348821", showOutletBranding: false, showShippingFee: true })
    expect(JSON.parse(snap.true_sender_json)).toMatchObject({ name: "Ibu Siti", phone: "081234567890" })
    expect((await state(t.cookie)).quotaLeft).toBe(4)
  })

  it("issued masked INV: detail and list never carry the true sender (only the audited reveal does)", async () => {
    const t = await resellerGerai("masksembunyi")
    await platform(t.tenantId, 1, 5)
    await appPost("/settings/masking", t.cookie, { offered: true, presetsEnabled: ["dropship_toko"], defaultPreset: "dropship_toko" })
    const slug = await readyInv(t)
    await appPost(`/shipments/${slug}/parties`, t.cookie, { maskPreset: "dropship_toko" })
    await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    const det = await (await appGet(`/shipments/${slug}`, t.cookie)).text()
    const list = await (await appGet("/shipments?tab=semua", t.cookie)).text()
    for (const body of [det, list]) {
      expect(body).not.toContain("Ibu Siti")
      expect(body).not.toContain("081234567890")
    }
    expect(list).toContain("TOKO HIJAB NISA")
  })

  it("quota exhausted → 422 MASKING_QUOTA_EXCEEDED, no Mengantar call, never a silent fallback; switching to Standar Gerai issues", async () => {
    const t = await resellerGerai("maskkuota")
    await platform(t.tenantId, 1, 1)
    await appPost("/settings/masking", t.cookie, { offered: true, presetsEnabled: ["dropship_toko"], defaultPreset: "dropship_toko" })
    const a = await readyInv(t)
    await appPost(`/shipments/${a}/parties`, t.cookie, { maskPreset: "dropship_toko" })
    expect((await post(`/shipments/${a}/dispatch`, t.cookie, {})).status).toBe(200)
    expect(await state(t.cookie)).toMatchObject({ quotaLeft: 0, quotaExhausted: true })
    const b = await readyInv(t)
    await appPost(`/shipments/${b}/parties`, t.cookie, { maskPreset: "dropship_toko" })
    const calls = mockSeller.createCalls
    const r = await post(`/shipments/${b}/dispatch`, t.cookie, {})
    expect(r.status).toBe(422)
    expect(((await r.json()) as { error: { code: string; message: string } }).error).toEqual(expect.objectContaining({ code: "MASKING_QUOTA_EXCEEDED", message: "Kuota masking hari ini habis. Ganti ke Standar Gerai untuk melanjutkan." }))
    expect(mockSeller.createCalls).toBe(calls)
    const s = await runInDurableObject(t.vault, (_i: GeraiVaultDO, st) => st.storage.sql.exec<{ dispatch_state: string; mask_preset: string }>("SELECT dispatch_state, mask_preset FROM shipments WHERE slug = ?", b).one())
    expect(s).toEqual({ dispatch_state: "draft", mask_preset: "dropship_toko" }) // unchanged, not silently downgraded
    // Recipient privacy on a WALK-IN sender is never capped… but this sender is a reseller → still capped.
    await appPost(`/shipments/${b}/parties`, t.cookie, { maskPreset: "standar_gerai" })
    expect((await post(`/shipments/${b}/dispatch`, t.cookie, {})).status).toBe(200)
  })

  it("preset not offered → 422; masked send needs a verified WhatsApp; Dropship needs a brand", async () => {
    const t = await checkoutGerai("masktolak")
    await platform(t.tenantId, 1, 20)
    const slug = await readyInv(t)
    await appPost(`/shipments/${slug}/parties`, t.cookie, { maskPreset: "full_nama_gerai" })
    const r = await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe("MASKING_NOT_OFFERED")
    await appPost("/settings/masking", t.cookie, { offered: true, presetsEnabled: ["dropship_toko", "full_nama_gerai"], defaultPreset: "standar_gerai" })
    await appPost(`/shipments/${slug}/parties`, t.cookie, { maskPreset: "dropship_toko" })
    const d = await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    expect(((await d.json()) as { error: { field_errors: Record<string, string> } }).error.field_errors.maskPreset).toBe("Dropship Toko butuh nama toko di data pengirim.")
    // Changing the phone clears verification → masked send refused.
    await appPost(`/contacts/senders/${t.sender}`, t.cookie, { phone: "081277778888" })
    await appPost(`/shipments/${slug}/parties`, t.cookie, { maskPreset: "full_nama_gerai" })
    const v = await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    expect(((await v.json()) as { error: { field_errors: Record<string, string> } }).error.field_errors.senderId).toBe("Label masking butuh WhatsApp pengirim yang sudah diverifikasi.")
  })
})

describe("reveal true sender (ADR-0005)", () => {
  it("needs a reason and writes a true_sender_reveal audit row", async () => {
    const t = await resellerGerai("maskbuka")
    await platform(t.tenantId, 1, 20)
    await appPost("/settings/masking", t.cookie, { offered: true, presetsEnabled: ["dropship_toko"], defaultPreset: "dropship_toko" })
    const slug = await readyInv(t)
    await appPost(`/shipments/${slug}/parties`, t.cookie, { maskPreset: "dropship_toko" })
    await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    expect((await appPost(`/shipments/${slug}/reveal-sender`, t.cookie, { reason: "" })).status).toBe(422)
    const r = await appPost(`/shipments/${slug}/reveal-sender`, t.cookie, { reason: "paket retur, hubungi pengirim" })
    expect(((await r.json()) as { data: unknown }).data).toEqual({ name: "Ibu Siti", phone: "081234567890", brand: "TOKO HIJAB NISA" })
    const audit = await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec<{ action: string; metadata_json: string }>("SELECT action, metadata_json FROM audit_logs WHERE action = 'true_sender_reveal'").toArray())
    expect(audit).toHaveLength(1)
    expect(JSON.parse(audit[0]!.metadata_json)).toMatchObject({ slug, reason: "paket retur, hubungi pengirim", preset: "dropship_toko" })
  })
})
