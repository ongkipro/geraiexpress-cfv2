import { useState } from "react"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { Button } from "../../../components/ui/button"
import { ErrorState, LoadingState } from "../../../shell/states"
import { Notice, SaveBar, SettingsLayout, useSettingsForm, type SettingsView } from "../index/shared"
import { ChoiceGroup, SectionCard, StatusBadge } from "../../../components/admin/page"

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
      <SectionCard title="Badan usaha" description="Bentuk dan nama resmi usaha gerai.">
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <legend className="text-sm font-medium">Bentuk usaha</legend>
              {f.entityType ? <Button type="button" variant="ghost" size="sm" onClick={() => set({ entityType: "" })}>Kosongkan pilihan</Button> : null}
            </div>
            <ChoiceGroup label="Bentuk usaha" layout="grid" className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" value={f.entityType || null} onValueChange={(v) => set({ entityType: v })} choices={ENTITIES.map(([id, label]) => ({ value: id, label }))} />
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("legalName", "Nama resmi")}
            {field("brandName", "Nama merek")}
          </div>
          {field("registeredAddress", "Alamat terdaftar")}
        </div>
      </SectionCard>
      <SectionCard
        title="Legalitas"
        description="NPWP disimpan terenkripsi. Setelah disimpan, hanya 4 angka terakhir yang ditampilkan."
        action={f.npwpMasked && !f.clearNpwp ? <StatusBadge tone="safe" className="tabular-nums">Tersimpan: {f.npwpMasked}</StatusBadge> : null}
      >
        <div className="flex flex-col gap-3">
          <div className="grid items-start gap-4 sm:grid-cols-2">
            {field("nib", "NIB", { inputMode: "numeric", className: "tabular-nums" })}
            <Field data-invalid={s.fields.npwp ? true : undefined}>
              <FieldLabel htmlFor="npwp">{f.npwpMasked ? "Ganti NPWP" : "NPWP"}</FieldLabel>
              <Input id="npwp" type={showNpwp ? "text" : "password"} autoComplete="off" inputMode="numeric" value={f.npwp} onChange={(e) => set({ npwp: e.target.value, clearNpwp: false })} className="tabular-nums" />
              {s.fields.npwp ? <FieldError>{s.fields.npwp}</FieldError> : <FieldDescription>15 atau 16 angka. Kosongkan bila tidak ingin mengubah.</FieldDescription>}
            </Field>
          </div>
          {f.clearNpwp ? <p className="text-sm text-danger">NPWP akan dihapus saat disimpan.</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowNpwp((x) => !x)}>{showNpwp ? "Sembunyikan" : "Tampilkan isian"}</Button>
            {f.npwpMasked ? <Button variant="ghost" size="sm" onClick={() => set({ clearNpwp: true, npwp: "" })}>Hapus NPWP</Button> : null}
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Penanggung jawab" description="Orang yang dihubungi untuk urusan administrasi.">
        <div className="grid gap-4 sm:grid-cols-2">
          {field("picName", "Nama")}
          {field("picRole", "Jabatan")}
          {field("picEmail", "Email", { type: "email" })}
          {field("picPhone", "No HP", { inputMode: "tel" })}
        </div>
      </SectionCard>
      <Notice msg={s.msg} />
      <SaveBar dirty={s.dirty} pending={s.pending} onCancel={s.cancel} onSave={s.save} />
    </SettingsLayout>
  )
}
