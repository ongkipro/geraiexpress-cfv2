import { PlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { Switch } from "../../../components/ui/switch"
import { ErrorState, LoadingState } from "../../../shell/states"
import { Notice, SaveBar, SettingsLayout, useSettingsForm, type SettingsView } from "../index/shared"

// Pengaturan › Packing & Biaya (visual 08 §2.3, DEC-225): packing catalogue (outlet-kept) and the optional
// `Biaya Layanan Loket` (Rp1.000–Rp200.000, Non-COD and COD Ongkir only, printed as its own line).
type Form = SettingsView["packing"]
const pick = (s: SettingsView): Form => s.packing
const digits = (v: string) => Number(v.replace(/\D/g, "") || "0")

export function PackingPage() {
  const s = useSettingsForm(pick, "packing")
  if (s.error) return <SettingsLayout title="Packing & Biaya"><ErrorState message={s.error} onRetry={s.load} /></SettingsLayout>
  if (!s.form) return <SettingsLayout title="Packing & Biaya"><LoadingState label="Memuat packing" /></SettingsLayout>
  const f = s.form
  const setItem = (i: number, p: Partial<Form["items"][number]>) => s.setForm({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, ...p } : x)) })
  return (
    <SettingsLayout title="Packing & Biaya" description="Harga packing dan biaya layanan loket sepenuhnya milik gerai.">
      <Card>
        <CardHeader>
          <CardTitle className="text-base md:text-sm">Daftar packing</CardTitle>
          <CardDescription className="text-base md:text-sm">Item aktif muncul sebagai pilihan tambahan di kasir.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ul className="flex flex-col divide-y border-y">
            {f.items.map((it, i) => (
              <li key={it.id ?? `new-${i}`} className="grid items-end gap-3 py-3 sm:grid-cols-[1fr_10rem_auto_auto]">
                <Field data-invalid={s.fields[`items.${i}.name`] ? true : undefined}>
                  <FieldLabel htmlFor={`pk-n-${i}`}>Nama item</FieldLabel>
                  <Input id={`pk-n-${i}`} value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} />
                  {s.fields[`items.${i}.name`] ? <FieldError>{s.fields[`items.${i}.name`]}</FieldError> : null}
                </Field>
                <Field data-invalid={s.fields[`items.${i}.priceIdr`] ? true : undefined}>
                  <FieldLabel htmlFor={`pk-p-${i}`}>Harga (Rp)</FieldLabel>
                  <Input id={`pk-p-${i}`} inputMode="numeric" className="tabular-nums" value={it.priceIdr.toLocaleString("id-ID")} onChange={(e) => setItem(i, { priceIdr: digits(e.target.value) })} />
                  {s.fields[`items.${i}.priceIdr`] ? <FieldError>{s.fields[`items.${i}.priceIdr`]}</FieldError> : null}
                </Field>
                <label className="flex min-h-11 items-center gap-2 text-base md:text-sm">Aktif <Switch checked={it.active} onCheckedChange={(v) => setItem(i, { active: v })} /></label>
                <Button variant="ghost" aria-label={`Hapus ${it.name || "item"}`} onClick={() => s.setForm({ ...f, items: f.items.filter((_, j) => j !== i) })}><Trash2Icon aria-hidden /> Hapus</Button>
              </li>
            ))}
          </ul>
          <div><Button variant="outline" disabled={f.items.length >= 20} onClick={() => s.setForm({ ...f, items: [...f.items, { id: null, name: "", priceIdr: 0, active: true }] })}><PlusIcon aria-hidden /> Tambah Item</Button></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base md:text-sm">Biaya Layanan Loket</CardTitle>
          <CardDescription className="text-base md:text-sm">Opsional. Dicetak sebagai baris tersendiri di struk, hanya untuk kiriman Non-COD dan COD Ongkir.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex min-h-11 items-center justify-between gap-3 text-base md:text-sm">Aktifkan biaya layanan <Switch checked={f.serviceFeeEnabled} onCheckedChange={(v) => s.setForm({ ...f, serviceFeeEnabled: v, serviceFeeIdr: f.serviceFeeIdr ?? 2000 })} /></label>
          {f.serviceFeeEnabled ? (
            <Field data-invalid={s.fields.serviceFeeIdr ? true : undefined}>
              <FieldLabel htmlFor="fee">Nominal bawaan (Rp)</FieldLabel>
              <Input id="fee" inputMode="numeric" className="w-40 tabular-nums" value={(f.serviceFeeIdr ?? 0).toLocaleString("id-ID")} onChange={(e) => s.setForm({ ...f, serviceFeeIdr: digits(e.target.value) })} />
              {s.fields.serviceFeeIdr ? <FieldError>{s.fields.serviceFeeIdr}</FieldError> : <FieldDescription>Rp1.000–Rp200.000. Kasir bisa mengubahnya per kiriman.</FieldDescription>}
            </Field>
          ) : null}
        </CardContent>
      </Card>
      <Notice msg={s.msg} />
      <SaveBar dirty={s.dirty} pending={s.pending} onCancel={s.cancel} onSave={s.save} />
    </SettingsLayout>
  )
}
