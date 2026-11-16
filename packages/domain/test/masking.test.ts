import { describe, expect, it } from "vitest"
import { effectiveDefault, isSenderMasked, offeredPresets, printedIdentity, type MaskPreset } from "../src/masking"

const base = { platformEnabled: true, offered: true, presetsEnabled: ["dropship_toko", "privasi_penerima_cod"] as MaskPreset[], defaultPreset: "dropship_toko" as MaskPreset }

describe("offered presets (DEC-231)", () => {
  it("off → only Standar Gerai; kill-switch wins; enabled subset; default falls back", () => {
    expect(offeredPresets({ ...base, offered: false })).toEqual(["standar_gerai"])
    expect(offeredPresets({ ...base, platformEnabled: false })).toEqual(["standar_gerai"])
    expect(offeredPresets(base)).toEqual(["standar_gerai", "dropship_toko", "privasi_penerima_cod"])
    expect(effectiveDefault(base)).toBe("dropship_toko")
    expect(effectiveDefault({ ...base, defaultPreset: "full_nama_gerai" })).toBe("standar_gerai")
    expect(effectiveDefault({ ...base, offered: false })).toBe("standar_gerai")
  })
  it("quota counts sender-masked sends only (recipient privacy on a standard sender is free)", () => {
    expect(isSenderMasked("standar_gerai", true)).toBe(false)
    expect(isSenderMasked("dropship_toko", false)).toBe(true)
    expect(isSenderMasked("full_nama_gerai", false)).toBe(true)
    expect(isSenderMasked("privasi_penerima_cod", false)).toBe(false)
    expect(isSenderMasked("privasi_penerima_cod", true)).toBe(true)
  })
})

describe("what prints per preset (label snapshots)", () => {
  const x = { trueSender: { name: "Ibu Siti Nisa", phone: "081234567890" }, brand: { name: "TOKO HIJAB NISA", phone: "081299990000", hideOutlet: true }, outlet: { name: "Berkah Jaya", phone: "081211112222" }, recipientPhone: "085712348821" }
  it.each([
    ["standar_gerai", { sender: { name: "Ibu Siti Nisa", phone: "081234567890" }, recipientPhonePrinted: "085712348821", showOutletBranding: true, showShippingFee: true }],
    ["dropship_toko", { sender: { name: "TOKO HIJAB NISA", phone: "081299990000" }, recipientPhonePrinted: "085712348821", showOutletBranding: false, showShippingFee: true }],
    ["privasi_penerima_cod", { sender: { name: "TOKO HIJAB NISA", phone: "081299990000" }, recipientPhonePrinted: "0857****8821", showOutletBranding: false, showShippingFee: false }],
    ["full_nama_gerai", { sender: { name: "Berkah Jaya", phone: "081211112222" }, recipientPhonePrinted: "085712348821", showOutletBranding: true, showShippingFee: true }],
  ] as const)("%s", (preset, expected) => {
    expect(printedIdentity(preset, x)).toEqual(expected)
  })
  it("privasi penerima on a walk-in sender keeps the true sender and outlet branding, masks only the recipient phone", () => {
    expect(printedIdentity("privasi_penerima_cod", { ...x, brand: { name: null, phone: null, hideOutlet: false } })).toEqual({ sender: x.trueSender, recipientPhonePrinted: "0857****8821", showOutletBranding: true, showShippingFee: false })
  })
})
