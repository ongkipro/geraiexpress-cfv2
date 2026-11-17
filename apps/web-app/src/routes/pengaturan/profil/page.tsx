import { AreaPicker, type Area } from "../../../components/area-picker"
import { SectionCard } from "../../../components/admin/page"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { ErrorState, LoadingState } from "../../../shell/states"
import { Notice, SaveBar, SettingsLayout, useSettingsForm, type SettingsView } from "../index/shared"

// Pengaturan › Profil Gerai (visual 08 §2.3): name, WhatsApp, opening hours, pickup address (Mengantar area).
type Form = { name: string; whatsapp: string; openingHours: string; area: Area | null; street: string; postalCode: string; latitude: string; longitude: string }
const pick = (s: SettingsView): Form => ({
  name: s.profile?.name ?? "",
  whatsapp: s.profile?.whatsapp ?? "",
  openingHours: s.profile?.openingHours ?? "",
  area: s.profile?.areaId ? { id: s.profile.areaId, label: s.profile.areaLabel ?? "", postalCode: s.profile.postalCode } : null,
  street: s.profile?.street ?? "",
  postalCode: s.profile?.postalCode ?? "",
  latitude: s.profile?.latitude == null ? "" : String(s.profile.latitude),
  longitude: s.profile?.longitude == null ? "" : String(s.profile.longitude),
})
const toBody = (f: Form) => ({ name: f.name, whatsapp: f.whatsapp, openingHours: f.openingHours, areaId: f.area?.id ?? "", areaLabel: f.area?.label ?? "", street: f.street, postalCode: f.postalCode, latitude: f.latitude, longitude: f.longitude })

export function ProfilGeraiPage() {
  const s = useSettingsForm(pick, "profile", toBody)
  if (s.error) return <SettingsLayout title="Profil Gerai"><ErrorState message={s.error} onRetry={s.load} /></SettingsLayout>
  if (!s.form) return <SettingsLayout title="Profil Gerai"><LoadingState label="Memuat profil" /></SettingsLayout>
  const f = s.form
  const set = (p: Partial<Form>) => s.setForm({ ...f, ...p })
  const field = (id: keyof Form & string, label: string, help?: string, props: Record<string, unknown> = {}) => (
    <Field data-invalid={s.fields[id] ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} value={f[id] as string} onChange={(e) => set({ [id]: e.target.value } as Partial<Form>)} aria-invalid={s.fields[id] ? true : undefined} {...props} />
      {s.fields[id] ? <FieldError>{s.fields[id]}</FieldError> : help ? <FieldDescription>{help}</FieldDescription> : null}
    </Field>
  )
  return (
    <SettingsLayout title="Profil Gerai" description="Nama dan alamat ini dipakai untuk penjemputan kurir dan struk pelanggan.">
      <SectionCard title="Identitas gerai" description="Tampil di struk, label, dan mini-site.">
        <div className="grid gap-4 sm:grid-cols-2">
          {field("name", "Nama gerai")}
          {field("whatsapp", "WhatsApp gerai", "Tampil di struk bila pelanggan perlu menghubungi gerai.", { inputMode: "tel" })}
          {field("openingHours", "Jam buka", "Contoh: Senin–Sabtu 08.00–21.00")}
        </div>
      </SectionCard>
      <SectionCard title="Alamat jemput" description="Alamat ini dipakai kurir saat menjemput paket di gerai.">
        <div className="flex flex-col gap-4">
          <div className="grid items-start gap-4 sm:grid-cols-[2fr_1fr]">
            <AreaPicker label="Kecamatan" value={f.area} onChange={(a) => set({ area: a, postalCode: a?.postalCode ?? f.postalCode })} error={s.fields.areaId} />
            {field("postalCode", "Kode pos", undefined, { inputMode: "numeric", className: "tabular-nums" })}
          </div>
          {field("street", "Alamat lengkap")}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("latitude", "Latitude", "Contoh: -6.9456", { inputMode: "decimal", className: "tabular-nums" })}
            {field("longitude", "Longitude", "Contoh: 107.5703", { inputMode: "decimal", className: "tabular-nums" })}
          </div>
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-muted-foreground">Titik koordinat wajib untuk penjemputan Pos Indonesia. Buka Google Maps, tekan lama lokasi gerai, lalu salin dua angka yang muncul.</p>
        </div>
      </SectionCard>
      <Notice msg={s.msg} />
      <SaveBar dirty={s.dirty} pending={s.pending} onCancel={s.cancel} onSave={s.save} />
    </SettingsLayout>
  )
}
