import { useCallback, useEffect, useState } from "react"
import { FormAlert } from "../../../components/auth/auth-card"
import { PRESET_HELP, PRESET_LABEL, type MaskPreset } from "../../../components/masking/preset-picker"
import { api, ApiError } from "../../../lib/api"
import { ErrorState, LoadingState } from "../../../shell/states"
import { CalloutAlert, ChoiceGroup, SectionCard, ToggleRow } from "../../../components/admin/page"
import { SaveBar, SettingsLayout } from "../index/shared"

// Pengaturan › Label & Privasi (DEC-231, visual 08 §2.3): masking on/off, offered presets, default preset, mask
// recipient phone on COD by default. Disabled with an explanation when the Super Admin kill-switch is off.
interface Settings { platformEnabled: boolean; offered: boolean; presetsEnabled: MaskPreset[]; defaultPreset: MaskPreset; maskRecipientOnCod: boolean; dropshipperSync: boolean; dropshipperState: "ok" | "disabled" | null; dailyQuota: number | null }
const OPTIONAL: MaskPreset[] = ["dropship_toko", "privasi_penerima_cod", "full_nama_gerai"]

export function LabelPrivasiPage() {
  const [saved, setSaved] = useState<Settings | null>(null)
  const [form, setForm] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: "safe" | "danger"; text: string } | null>(null)
  const [pending, setPending] = useState(false)
  const load = useCallback(() => {
    api<Settings>("/settings/masking")
      .then((s) => {
        setError(null)
        setSaved(s)
        setForm(s)
      })
      .catch((e) => setError(e instanceof ApiError ? e.body.message : "Pengaturan tidak dapat dimuat."))
  }, [])
  useEffect(load, [load])
  if (error) return <SettingsLayout title="Label & Privasi"><ErrorState message={error} onRetry={load} /></SettingsLayout>
  if (!form || !saved) return <SettingsLayout title="Label & Privasi"><LoadingState label="Memuat pengaturan label" /></SettingsLayout>
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const locked = !form.platformEnabled
  const set = (p: Partial<Settings>) => setForm({ ...form, ...p })
  const togglePreset = (p: MaskPreset, on: boolean) => {
    const presets = on ? [...form.presetsEnabled, p] : form.presetsEnabled.filter((x) => x !== p)
    set({ presetsEnabled: presets, defaultPreset: presets.includes(form.defaultPreset) || form.defaultPreset === "standar_gerai" ? form.defaultPreset : "standar_gerai" })
  }
  async function save() {
    setPending(true)
    setMsg(null)
    try {
      const s = await api<Settings>("/settings/masking", { body: { offered: form!.offered, presetsEnabled: form!.presetsEnabled, defaultPreset: form!.defaultPreset, maskRecipientOnCod: form!.maskRecipientOnCod, dropshipperSync: form!.dropshipperSync } })
      setSaved(s)
      setForm(s)
      setMsg({ tone: "safe", text: "Pengaturan label tersimpan." })
    } catch (err) {
      setMsg({ tone: "danger", text: err instanceof ApiError ? err.body.message : "Gagal menyimpan." })
    } finally {
      setPending(false)
    }
  }
  const off = locked || !form.offered
  return (
    <SettingsLayout title="Label & Privasi" description="Atur apa yang tercetak di label pengirim. Kurir selalu menjemput di alamat gerai, dan paket retur selalu kembali ke gerai.">
      {locked ? <FormAlert tone="warn">Masking label sedang dinonaktifkan GeraiExpress untuk gerai ini. Kasir hanya bisa mencetak Standar Gerai.</FormAlert> : null}
      <SectionCard title="Masking label" description={`Bila nonaktif, kasir hanya mencetak Standar Gerai.${form.dailyQuota !== null ? ` Kuota masking: ${form.dailyQuota} kiriman per hari.` : ""}`}>
        <div className="flex flex-col divide-y divide-slate-100">
          <ToggleRow id="mask-on" title="Aktifkan masking label" description="Kasir boleh memilih preset selain Standar Gerai saat mencetak." checked={form.offered} disabled={locked} onCheckedChange={(v) => set({ offered: v })} />
          <fieldset className="py-3" disabled={off}>
            <legend className="sr-only">Preset yang boleh dipilih kasir</legend>
            <p aria-hidden className="text-sm font-medium">Preset yang boleh dipilih kasir</p>
            <div className="mt-2 flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/60 px-3">
              <ToggleRow className="py-1 first:pt-1 last:pb-1" id="p-standar" title="Standar Gerai" description="Selalu aktif." checked disabled onCheckedChange={() => undefined} />
              {OPTIONAL.map((p) => (
                <ToggleRow key={p} className="py-1 first:pt-1 last:pb-1" id={`p-${p}`} title={PRESET_LABEL[p]} description={PRESET_HELP[p]} checked={form.presetsEnabled.includes(p)} disabled={off} onCheckedChange={(v) => togglePreset(p, v)} />
              ))}
            </div>
          </fieldset>
          <fieldset className="py-3" disabled={off}>
            <legend className="mb-2 text-sm font-medium">Preset bawaan</legend>
            <ChoiceGroup
              label="Preset bawaan"
              layout="grid"
              value={form.defaultPreset}
              onValueChange={(p) => set({ defaultPreset: p })}
              choices={(["standar_gerai", ...form.presetsEnabled] as MaskPreset[]).map((p) => ({ value: p, label: PRESET_LABEL[p], disabled: off }))}
            />
          </fieldset>
          <ToggleRow id="mask-cod" className="pt-3" title="Samarkan HP penerima untuk kiriman COD" description="Contoh cetak: 0857****8821." checked={form.maskRecipientOnCod} disabled={off} onCheckedChange={(v) => set({ maskRecipientOnCod: v })} />
        </div>
      </SectionCard>
      <SectionCard title="Dropshipper" description="Fitur Dropshipper harus aktif di Seller Web Mengantar; bila belum, label gerai tetap memakai nama toko.">
        <ToggleRow id="dropship" title="Kirim nama toko reseller ke Mengantar (Dropshipper)" description="Nama dan HP toko juga tampil di resi dan pelacakan kurir." checked={form.dropshipperSync} disabled={off} onCheckedChange={(v) => set({ dropshipperSync: v })}>
          {form.dropshipperSync && form.dropshipperState === "disabled" ? <div className="mt-3"><CalloutAlert title="Mengantar menolak">Fitur Dropshipper belum aktif di akun ini. Aktifkan di Seller Web Mengantar.</CalloutAlert></div> : null}
        </ToggleRow>
      </SectionCard>
      {msg ? <FormAlert tone={msg.tone}>{msg.text}</FormAlert> : null}
      <SaveBar dirty={dirty} pending={pending} onCancel={() => setForm(saved)} onSave={save} />
    </SettingsLayout>
  )
}
