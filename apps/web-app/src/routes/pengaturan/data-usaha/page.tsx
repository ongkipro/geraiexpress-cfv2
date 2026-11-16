import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { Button } from "../../../components/ui/button"
import { ErrorState, LoadingState } from "../../../shell/states"
import { Notice, SaveBar, SettingsLayout, useSettingsForm, type SettingsView } from "../index/shared"

// Pengaturan › Data Usaha (DEC-218): all optional; NPWP is stored encrypted and only ever shown masked. Typing a new
// NPWP replaces it; `Hapus NPWP` clears it; leaving the field empty keeps the stored one.
const ENTITIES: Array<[string, string]> = [["perorangan", "Perorangan"], ["ud", "UD"], ["cv", "CV"], ["pt", "PT"], ["koperasi", "Koperasi"], ["lainnya", "Lainnya"]]
type Form = { entityType: string; legalName: string; brandName: string; nib: string; npwpMasked: string | null; npwp: string; clearNpwp: boolean; registeredAddress: string; picName: string; picRole: string; picEmail: string; picPhone: string }
const pick = (s: SettingsView): Form => ({
  entityType: s.business.entityType ?? "",
  legalName: s.business.legalName ?? "",
  brandName: s.business.brandName ?? "",
  nib: s.business.nib ?? "",
  npwpMasked: s.business.npwpMasked,
  npwp: "",
  clearNpwp: false,
  registeredAddress: s.business.registeredAddress ?? "",
  picName: s.business.picName ?? "",
  picRole: s.business.picRole ?? "",
  picEmail: s.business.picEmail ?? "",
  picPhone: s.business.picPhone ?? "",
})
const toBody = (f: Form) => {
  const { npwpMasked: _m, clearNpwp, npwp, ...rest } = f
  void _m
  return { ...rest, ...(clearNpwp ? { npwp: "" } : npwp ? { npwp } : {}) }
}

export function DataUsahaPage() {
  const s = useSettingsForm(pick, "business", toBody)
  const [showNpwp, setShowNpwp] = useState(false)
  if (s.error) return <SettingsLayout title="Data Usaha"><ErrorState message={s.error} onRetry={s.load} /></SettingsLayout>
  if (!s.form) return <SettingsLayout title="Data Usaha"><LoadingState label="Memuat data usaha" /></SettingsLayout>
  const f = s.form
  const set = (p: Partial<Form>) => s.setForm({ ...f, ...p })
  const field = (id: keyof Form & string, label: string, props: Record<string, unknown> = {}) => (
    <Field data-invalid={s.fields[id] ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} value={f[id] as string} onChange={(e) => set({ [id]: e.target.value } as Partial<Form>)} aria-invalid={s.fields[id] ? true : undefined} {...props} />
      {s.fields[id] ? <FieldError>{s.fields[id]}</FieldError> : null}
    </Field>
  )
  return (
    <SettingsLayout title="Data Usaha" description="Semua isian boleh dikosongkan. Data ini dipakai bila Anda meminta faktur atas nama usaha.">
      <Card>
        <CardHeader><CardTitle className="text-lg">Badan usaha</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-base font-medium">Bentuk usaha</legend>
            <div role="radiogroup" aria-label="Bentuk usaha" className="flex flex-wrap gap-2">
              {ENTITIES.map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={f.entityType === id} onClick={() => set({ entityType: f.entityType === id ? "" : id })} className={`h-11 rounded-lg border px-4 text-base ${f.entityType === id ? "border-primary bg-primary/10 font-medium text-primary" : "border-input"}`}>{label}</button>
              ))}
            </div>
          </fieldset>
          {field("legalName", "Nama resmi")}
          {field("nib", "NIB", { inputMode: "numeric", className: "tabular-nums" })}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">NPWP</CardTitle>
          <CardDescription className="text-base">Disimpan terenkripsi. Setelah disimpan, hanya 4 angka terakhir yang ditampilkan.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {f.npwpMasked && !f.clearNpwp ? <p className="text-base tabular-nums">Tersimpan: <span className="font-medium">{f.npwpMasked}</span></p> : null}
          {f.clearNpwp ? <p className="text-base text-danger">NPWP akan dihapus saat disimpan.</p> : null}
          <Field data-invalid={s.fields.npwp ? true : undefined}>
            <FieldLabel htmlFor="npwp">{f.npwpMasked ? "Ganti NPWP" : "NPWP"}</FieldLabel>
            <Input id="npwp" type={showNpwp ? "text" : "password"} autoComplete="off" inputMode="numeric" value={f.npwp} onChange={(e) => set({ npwp: e.target.value, clearNpwp: false })} className="tabular-nums" />
            {s.fields.npwp ? <FieldError>{s.fields.npwp}</FieldError> : <FieldDescription>15 atau 16 angka. Kosongkan bila tidak ingin mengubah.</FieldDescription>}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setShowNpwp((x) => !x)}>{showNpwp ? "Sembunyikan" : "Tampilkan isian"}</Button>
            {f.npwpMasked ? <Button variant="ghost" onClick={() => set({ clearNpwp: true, npwp: "" })}>Hapus NPWP</Button> : null}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-lg">Penanggung jawab</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {field("picName", "Nama")}
          {field("picRole", "Jabatan")}
          {field("picEmail", "Email", { type: "email" })}
          {field("picPhone", "No HP", { inputMode: "tel" })}
          {field("registeredAddress", "Alamat terdaftar")}
        </CardContent>
      </Card>
      <Notice msg={s.msg} />
      <SaveBar dirty={s.dirty} pending={s.pending} onCancel={s.cancel} onSave={s.save} />
    </SettingsLayout>
  )
}
