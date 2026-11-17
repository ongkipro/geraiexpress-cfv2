import { useCallback, useEffect, useState } from "react"
import { Button } from "../../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card"
import { Switch } from "../../../components/ui/switch"
import { FormAlert } from "../../../components/auth/auth-card"
import { PRESET_LABEL, type MaskPreset } from "../../../components/masking/preset-picker"
import { api, ApiError } from "../../../lib/api"
import { ErrorState, LoadingState } from "../../../shell/states"
import { ChoiceGroup } from "../../../components/admin/page"

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
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!form || !saved) return <LoadingState label="Memuat pengaturan label" />
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
  return (
    <main className="mx-auto flex w-full max-w-[880px] flex-col gap-6 pb-24">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl leading-tight font-semibold tracking-[-0.02em] text-slate-950 md:text-2xl">Label & Privasi</h1>
        <p className="text-base md:text-sm text-muted-foreground">Atur apa yang tercetak di label pengirim. Kurir selalu menjemput di alamat gerai, dan paket retur selalu kembali ke gerai.</p>
      </div>
      {locked ? <FormAlert tone="warn">Masking label sedang dinonaktifkan GeraiExpress untuk gerai ini. Kasir hanya bisa mencetak Standar Gerai.</FormAlert> : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base md:text-sm">Masking label</CardTitle>
          <CardDescription className="text-base md:text-sm">Bila nonaktif, kasir hanya mencetak Standar Gerai.{form.dailyQuota !== null ? ` Kuota masking: ${form.dailyQuota} kiriman per hari.` : ""}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex min-h-11 items-center justify-between gap-3 text-base md:text-sm">
            Aktifkan masking label
            <Switch checked={form.offered} disabled={locked} onCheckedChange={(v) => set({ offered: v })} />
          </label>
          <fieldset className="flex flex-col gap-1" disabled={locked || !form.offered}>
            <legend className="mb-2 text-base md:text-sm font-medium">Preset yang boleh dipilih kasir</legend>
            <label className="flex min-h-11 items-center justify-between gap-3 text-base md:text-sm text-muted-foreground">Standar Gerai (selalu aktif)<Switch checked disabled /></label>
            {OPTIONAL.map((p) => (
              <label key={p} className="flex min-h-11 items-center justify-between gap-3 text-base md:text-sm">
                {PRESET_LABEL[p]}
                <Switch checked={form.presetsEnabled.includes(p)} disabled={locked || !form.offered} onCheckedChange={(v) => togglePreset(p, v)} />
              </label>
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-2" disabled={locked || !form.offered}>
            <legend className="mb-1 text-base md:text-sm font-medium">Preset bawaan</legend>
            <ChoiceGroup
              label="Preset bawaan"
              value={form.defaultPreset}
              onValueChange={(p) => set({ defaultPreset: p })}
              choices={(["standar_gerai", ...form.presetsEnabled] as MaskPreset[]).map((p) => ({ value: p, label: PRESET_LABEL[p], disabled: locked || !form.offered }))}
            />
          </fieldset>
          <label className="flex min-h-11 items-center justify-between gap-3 text-base md:text-sm">
            Samarkan HP penerima untuk kiriman COD
            <Switch checked={form.maskRecipientOnCod} disabled={locked || !form.offered} onCheckedChange={(v) => set({ maskRecipientOnCod: v })} />
          </label>
          <div className="flex flex-col gap-1 border-t pt-4">
            <label className="flex min-h-11 items-center justify-between gap-3 text-base md:text-sm">
              Kirim nama toko reseller ke Mengantar (Dropshipper)
              <Switch checked={form.dropshipperSync} disabled={locked || !form.offered} onCheckedChange={(v) => set({ dropshipperSync: v })} />
            </label>
            <p className="text-base md:text-sm text-muted-foreground">Nama dan HP toko juga tampil di resi dan pelacakan kurir. Fitur Dropshipper harus aktif di Seller Web Mengantar; bila belum, label gerai tetap memakai nama toko.</p>
            {form.dropshipperSync && form.dropshipperState === "disabled" ? <p role="status" className="border-l-4 border-warn py-1 pl-3 text-base md:text-sm">Mengantar menolak: fitur Dropshipper belum aktif di akun ini. Aktifkan di Seller Web Mengantar.</p> : null}
          </div>
        </CardContent>
      </Card>
      {msg ? <FormAlert tone={msg.tone}>{msg.text}</FormAlert> : null}
      {dirty ? (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-end gap-2 border-t bg-card p-3 md:sticky md:rounded-lg md:border">
          <span className="mr-auto text-base md:text-sm text-muted-foreground">Ada perubahan belum disimpan</span>
          <Button variant="outline" onClick={() => setForm(saved)} disabled={pending}>Batal</Button>
          <Button onClick={save} disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</Button>
        </div>
      ) : null}
    </main>
  )
}
