import { useEffect, useState } from "react"
import { api } from "../../lib/api"
import { ChoiceGroup } from "../../components/admin/page"

// Preset picker for checkout step 3 (TASK-305, visual 04 priority #4): only presets the gerai offers, a preview of
// what prints, and explicit states for an exhausted quota and the Super Admin kill-switch.
export type MaskPreset = "standar_gerai" | "dropship_toko" | "privasi_penerima_cod" | "full_nama_gerai"
export const PRESET_LABEL: Record<MaskPreset, string> = { standar_gerai: "Standar Gerai", dropship_toko: "Dropship Toko", privasi_penerima_cod: "Privasi Penerima COD", full_nama_gerai: "Full Nama Gerai" }
const PRESET_HELP: Record<MaskPreset, string> = {
  standar_gerai: "Nama pengirim asli + nama dan WhatsApp gerai.",
  dropship_toko: "Nama & HP toko reseller; nama gerai tidak dicetak.",
  privasi_penerima_cod: "HP penerima disamarkan (0857****8821) dan ongkir tidak dicetak.",
  full_nama_gerai: "Nama gerai dicetak sebagai pengirim.",
}
interface State { presets: MaskPreset[]; defaultPreset: MaskPreset; maskRecipientOnCod?: boolean; quotaLeft: number | null; quotaExhausted: boolean; killSwitchOff: boolean }

const senderMasked = (p: MaskPreset, reseller: boolean) => p === "dropship_toko" || p === "full_nama_gerai" || (p === "privasi_penerima_cod" && reseller)

export function PresetPicker({ value, onChange, preview, reseller, cod }: { value: MaskPreset; onChange: (p: MaskPreset) => void; preview: { sender: string; brand: string | null; outlet: string; recipientPhone: string | null }; reseller: boolean; cod: boolean }) {
  const [s, setS] = useState<State | null>(null)
  useEffect(() => {
    api<State>("/masking").then((x) => {
      setS(x)
      if (value === "standar_gerai" && x.defaultPreset !== "standar_gerai" && !(x.quotaExhausted && senderMasked(x.defaultPreset, reseller))) onChange(x.defaultPreset)
    }).catch(() => setS({ presets: ["standar_gerai"], defaultPreset: "standar_gerai", quotaLeft: null, quotaExhausted: false, killSwitchOff: false }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!s) return null
  // Same rule as the printed label: this preset, or any COD send when the gerai masks recipient phones on COD.
  const masked = (p: MaskPreset) => (p === "privasi_penerima_cod" || (cod && s.maskRecipientOnCod)) && preview.recipientPhone && preview.recipientPhone.length >= 8 ? `${preview.recipientPhone.slice(0, 4)}****${preview.recipientPhone.slice(-4)}` : preview.recipientPhone
  const printedSender = value === "dropship_toko" || (value === "privasi_penerima_cod" && preview.brand) ? (preview.brand ?? preview.sender) : value === "full_nama_gerai" ? preview.outlet : preview.sender
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Label pengirim</legend>
      {s.presets.length === 1 ? (
        <p className="text-base md:text-sm text-muted-foreground">{s.killSwitchOff ? "Masking label dinonaktifkan GeraiExpress untuk gerai ini." : "Gerai mencetak label Standar Gerai."}</p>
      ) : (
        <ChoiceGroup
          label="Preset label"
          layout="grid"
          value={value}
          onValueChange={onChange}
          choices={s.presets.map((p) => {
            const blocked = s.quotaExhausted && senderMasked(p, reseller)
            return { value: p, label: PRESET_LABEL[p], description: blocked ? "Kuota masking hari ini habis" : PRESET_HELP[p], disabled: blocked }
          })}
        />
      )}
      {s.quotaLeft !== null && s.presets.length > 1 ? <p className="text-xs text-muted-foreground tabular-nums">Sisa kuota masking hari ini: {s.quotaLeft}</p> : null}
      <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600" aria-live="polite">
        <span className="text-muted-foreground">Tercetak di label: </span>
        <strong>{printedSender}</strong>
        {value !== "dropship_toko" ? ` · via ${preview.outlet}` : ""}
        {preview.recipientPhone ? ` · HP penerima ${masked(value)}` : ""}
      </div>
    </fieldset>
  )
}
