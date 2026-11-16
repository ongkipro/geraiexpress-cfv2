// Three-way identity masking (ADR-0005, DEC-206, DEC-231): which presets a counter may offer, what each prints, and
// whether a send counts against the per-day masking quota. Pickup is always the outlet (never part of a preset).
export type MaskPreset = "standar_gerai" | "dropship_toko" | "privasi_penerima_cod" | "full_nama_gerai"
export const MASK_PRESETS: readonly MaskPreset[] = ["standar_gerai", "dropship_toko", "privasi_penerima_cod", "full_nama_gerai"]
export const PRESET_LABEL: Record<MaskPreset, string> = {
  standar_gerai: "Standar Gerai",
  dropship_toko: "Dropship Toko",
  privasi_penerima_cod: "Privasi Penerima COD",
  full_nama_gerai: "Full Nama Gerai",
}

export interface MaskingSettings {
  /** Super Admin kill-switch (`tenants.masking_enabled`). */
  platformEnabled: boolean
  /** Gerai choice (`tenant_settings.masking_offered`). */
  offered: boolean
  /** Optional presets the gerai allows (`standar_gerai` is always allowed). */
  presetsEnabled: MaskPreset[]
  defaultPreset: MaskPreset
}

/** Presets the counter may offer right now: only `standar_gerai` unless both switches are on. */
export function offeredPresets(s: MaskingSettings): MaskPreset[] {
  if (!s.platformEnabled || !s.offered) return ["standar_gerai"]
  return MASK_PRESETS.filter((p) => p === "standar_gerai" || s.presetsEnabled.includes(p))
}

export function effectiveDefault(s: MaskingSettings): MaskPreset {
  const offered = offeredPresets(s)
  return offered.includes(s.defaultPreset) ? s.defaultPreset : "standar_gerai"
}

/** A send counts against `masking_daily_quota` when its sender base is not the standard one (ADR-0005). */
export function isSenderMasked(preset: MaskPreset, senderIsReseller: boolean): boolean {
  if (preset === "dropship_toko" || preset === "full_nama_gerai") return true
  if (preset === "privasi_penerima_cod") return senderIsReseller
  return false
}

export interface Party { name: string; phone: string | null }
export interface PrintedIdentity {
  /** Sender block on the parcel label and on the sender stub. */
  sender: Party
  /** Recipient phone as printed (masked middle digits for `privasi_penerima_cod`); the courier payload keeps it full. */
  recipientPhonePrinted: string
  /** Outlet name/logo/WhatsApp on the label and stub (never on `dropship_toko`). */
  showOutletBranding: boolean
  /** Non-COD shipping fee on the label (hidden for `privasi_penerima_cod` to prevent COD scams). */
  showShippingFee: boolean
}

export const maskPhone = (p: string) => (p.length >= 8 ? `${p.slice(0, 4)}****${p.slice(-4)}` : "****")

/**
 * What prints (spec ADR-0005 §1): resolves the preset against the immutable true parties and the outlet. The true
 * sender and recipient stay in `true_*_json` regardless of what prints.
 */
export function printedIdentity(
  preset: MaskPreset,
  x: { trueSender: Party; brand: { name: string | null; phone: string | null; hideOutlet: boolean }; outlet: Party; recipientPhone: string },
): PrintedIdentity {
  switch (preset) {
    case "standar_gerai":
      return { sender: x.trueSender, recipientPhonePrinted: x.recipientPhone, showOutletBranding: true, showShippingFee: true }
    case "dropship_toko":
      return { sender: { name: x.brand.name ?? x.trueSender.name, phone: x.brand.phone ?? x.trueSender.phone }, recipientPhonePrinted: x.recipientPhone, showOutletBranding: false, showShippingFee: true }
    case "privasi_penerima_cod": {
      const reseller = x.brand.name !== null
      return {
        sender: reseller ? { name: x.brand.name!, phone: x.brand.phone ?? x.trueSender.phone } : x.trueSender,
        recipientPhonePrinted: maskPhone(x.recipientPhone),
        showOutletBranding: !reseller || !x.brand.hideOutlet,
        showShippingFee: false,
      }
    }
    case "full_nama_gerai":
      return { sender: x.outlet, recipientPhonePrinted: x.recipientPhone, showOutletBranding: true, showShippingFee: true }
  }
}

/** WIB calendar day of an instant (`YYYY-MM-DD`), the quota window. */
export { wibDay } from "../period"
