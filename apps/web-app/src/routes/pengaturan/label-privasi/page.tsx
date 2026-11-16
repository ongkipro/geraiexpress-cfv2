import { useCallback, useEffect, useState } from "react"
import { Button } from "../../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card"
import { Switch } from "../../../components/ui/switch"
import { FormAlert } from "../../../components/auth/auth-card"
import { PRESET_LABEL, type MaskPreset } from "../../../components/masking/preset-picker"
import { api, ApiError } from "../../../lib/api"
import { ErrorState, LoadingState } from "../../../shell/states"

// Pengaturan › Label & Privasi (DEC-231, visual 08 §2.3): masking on/off, offered presets, default preset, mask
// recipient phone on COD by default. Disabled with an explanation when the Super Admin kill-switch is off.
interface Settings { platformEnabled: boolean; offered: boolean; presetsEnabled: MaskPreset[]; defaultPreset: MaskPreset; maskRecipientOnCod: boolean; dailyQuota: number | null }
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
      const s = await api<Settings>("/settings/masking", { body: { offered: form!.offered, presetsEnabled: form!.presetsEnabled, defaultPreset: form!.defaultPreset, maskRecipientOnCod: form!.maskRecipientOnCod } })
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
      <nav aria-label="Breadcrumb" className="text-base text-muted-foreground"><span>Pengaturan</span> <span aria-hidden>›</span> <span className="text-foreground">Label & Privasi</span></nav>
      <div className="flex flex-col gap-2">
        <h2 className="text-[28px] leading-tight font-semibold">Label & Privasi</h2>
        <p className="text-base text-muted-foreground">Atur apa yang tercetak di label pengirim. Kurir selalu menjemput di alamat gerai, dan paket retur selalu kembali ke gerai.</p>
      </div>
      {locked ? <FormAlert tone="warn">Masking label sedang dinonaktifkan GeraiExpress untuk gerai ini. Kasir hanya bisa mencetak Standar Gerai.</FormAlert> : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Masking label</CardTitle>
          <CardDescription className="text-base">Bila nonaktif, kasir hanya mencetak Standar Gerai.{form.dailyQuota !== null ? ` Kuota masking: ${form.dailyQuota} kiriman per hari.` : ""}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex min-h-11 items-center justify-between gap-3 text-base">
            Aktifkan masking label
            <Switch checked={form.offered} disabled={locked} onCheckedChange={(v) => set({ offered: v })} />
          </label>
          <fieldset className="flex flex-col gap-1" disabled={locked || !form.offered}>
            <legend className="mb-2 text-base font-medium">Preset yang boleh dipilih kasir</legend>
            <label className="flex min-h-11 items-center justify-between gap-3 text-base text-muted-foreground">Standar Gerai (selalu aktif)<Switch checked disabled /></label>
            {OPTIONAL.map((p) => (
              <label key={p} className="flex min-h-11 items-center justify-between gap-3 text-base">
                {PRESET_LABEL[p]}
                <Switch checked={form.presetsEnabled.includes(p)} disabled={locked || !form.offered} onCheckedChange={(v) => togglePreset(p, v)} />
              </label>
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-2" disabled={locked || !form.offered}>
            <legend className="mb-1 text-base font-medium">Preset bawaan</legend>
            <div role="radiogroup" aria-label="Preset bawaan" className="flex flex-wrap gap-2">
              {(["standar_gerai", ...form.presetsEnabled] as MaskPreset[]).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={form.defaultPreset === p} onClick={() => set({ defaultPreset: p })} className={`h-11 rounded-lg border px-4 text-base ${form.defaultPreset === p ? "border-primary bg-primary/10 font-medium text-primary" : "border-input"}`}>
                  {PRESET_LABEL[p]}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex min-h-11 items-center justify-between gap-3 text-base">
            Samarkan HP penerima untuk kiriman COD
            <Switch checked={form.maskRecipientOnCod} disabled={locked || !form.offered} onCheckedChange={(v) => set({ maskRecipientOnCod: v })} />
          </label>
        </CardContent>
      </Card>
      {msg ? <FormAlert tone={msg.tone}>{msg.text}</FormAlert> : null}
      {dirty ? (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-end gap-2 border-t bg-card p-3 md:sticky md:rounded-lg md:border">
          <span className="mr-auto text-base text-muted-foreground">Ada perubahan belum disimpan</span>
          <Button variant="outline" onClick={() => setForm(saved)} disabled={pending}>Batal</Button>
          <Button onClick={save} disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</Button>
        </div>
      ) : null}
    </main>
  )
}
