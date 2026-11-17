import { PlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table"
import { SectionCard, ToggleRow } from "../../../components/admin/page"
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
  const remove = (i: number) => s.setForm({ ...f, items: f.items.filter((_, j) => j !== i) })
  const add = () => s.setForm({ ...f, items: [...f.items, { id: null, name: "", priceIdr: 0, active: true }] })
  const err = (k: string) => s.fields[k]
  return (
    <SettingsLayout title="Packing & Biaya" description="Harga packing dan biaya layanan loket sepenuhnya milik gerai.">
      <SectionCard
        title="Daftar packing"
        description={`Item aktif muncul sebagai pilihan tambahan di kasir. ${f.items.length}/20 item.`}
        action={<Button variant="outline" size="sm" disabled={f.items.length >= 20} onClick={add}><PlusIcon aria-hidden /> Tambah Item</Button>}
        flush
      >
        {f.items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground md:px-5">Belum ada item packing. Tekan Tambah Item untuk membuat yang pertama.</p>
        ) : (
          <>
            {/* Desktop/tablet: one header row instead of a label on every field. */}
            <div className="hidden md:block">
              <Table>
                <caption className="sr-only">Daftar item packing</caption>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Nama item</TableHead>
                    <TableHead className="w-44">Harga (Rp)</TableHead>
                    <TableHead className="w-20 text-center">Aktif</TableHead>
                    <TableHead className="w-24 pr-5 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {f.items.map((it, i) => (
                    <TableRow key={it.id ?? `new-${i}`} className="align-top hover:bg-transparent">
                      <TableCell className="pl-5">
                        <Input aria-label={`Nama item ${i + 1}`} aria-invalid={err(`items.${i}.name`) ? true : undefined} value={it.name} placeholder="Bubble wrap" onChange={(e) => setItem(i, { name: e.target.value })} />
                        {err(`items.${i}.name`) ? <p className="mt-1 text-xs text-danger">{err(`items.${i}.name`)}</p> : null}
                      </TableCell>
                      <TableCell>
                        <Input aria-label={`Harga item ${i + 1} (Rp)`} aria-invalid={err(`items.${i}.priceIdr`) ? true : undefined} inputMode="numeric" className="text-right tabular-nums" value={it.priceIdr.toLocaleString("id-ID")} onChange={(e) => setItem(i, { priceIdr: digits(e.target.value) })} />
                        {err(`items.${i}.priceIdr`) ? <p className="mt-1 text-xs text-danger">{err(`items.${i}.priceIdr`)}</p> : null}
                      </TableCell>
                      <TableCell className="text-center"><span className="inline-flex h-9 items-center"><Switch aria-label={`Aktifkan ${it.name || `item ${i + 1}`}`} checked={it.active} onCheckedChange={(v) => setItem(i, { active: v })} /></span></TableCell>
                      <TableCell className="pr-5 text-right"><Button variant="ghost" size="icon" aria-label={`Hapus ${it.name || `item ${i + 1}`}`} onClick={() => remove(i)}><Trash2Icon aria-hidden /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Phones: one compact card per item. */}
            <ul className="flex flex-col divide-y divide-slate-100 md:hidden">
              {f.items.map((it, i) => (
                <li key={it.id ?? `m-${i}`} className="flex flex-col gap-3 px-4 py-3">
                  <Field data-invalid={err(`items.${i}.name`) ? true : undefined}>
                    <FieldLabel htmlFor={`pk-n-${i}`}>Nama item</FieldLabel>
                    <Input id={`pk-n-${i}`} value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} />
                    {err(`items.${i}.name`) ? <FieldError>{err(`items.${i}.name`)}</FieldError> : null}
                  </Field>
                  <div className="flex items-end gap-3">
                    <Field className="flex-1" data-invalid={err(`items.${i}.priceIdr`) ? true : undefined}>
                      <FieldLabel htmlFor={`pk-p-${i}`}>Harga (Rp)</FieldLabel>
                      <Input id={`pk-p-${i}`} inputMode="numeric" className="tabular-nums" value={it.priceIdr.toLocaleString("id-ID")} onChange={(e) => setItem(i, { priceIdr: digits(e.target.value) })} />
                      {err(`items.${i}.priceIdr`) ? <FieldError>{err(`items.${i}.priceIdr`)}</FieldError> : null}
                    </Field>
                    <label className="flex h-11 items-center gap-2 text-sm">Aktif <Switch checked={it.active} onCheckedChange={(v) => setItem(i, { active: v })} /></label>
                    <Button variant="ghost" size="icon" aria-label={`Hapus ${it.name || `item ${i + 1}`}`} onClick={() => remove(i)}><Trash2Icon aria-hidden /></Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </SectionCard>
      <SectionCard title="Biaya Layanan Loket" description="Opsional. Dicetak sebagai baris tersendiri di struk, hanya untuk kiriman Non-COD dan COD Ongkir.">
        <ToggleRow id="fee-on" title="Aktifkan biaya layanan" description="Kasir bisa mengubah nominalnya per kiriman." checked={f.serviceFeeEnabled} onCheckedChange={(v) => s.setForm({ ...f, serviceFeeEnabled: v, serviceFeeIdr: f.serviceFeeIdr ?? 2000 })}>
          {f.serviceFeeEnabled ? (
            <Field className="mt-3 w-full sm:w-56" data-invalid={s.fields.serviceFeeIdr ? true : undefined}>
              <FieldLabel htmlFor="fee">Nominal bawaan (Rp)</FieldLabel>
              <Input id="fee" inputMode="numeric" className="tabular-nums" value={(f.serviceFeeIdr ?? 0).toLocaleString("id-ID")} onChange={(e) => s.setForm({ ...f, serviceFeeIdr: digits(e.target.value) })} />
              {s.fields.serviceFeeIdr ? <FieldError>{s.fields.serviceFeeIdr}</FieldError> : <FieldDescription>Rp1.000–Rp200.000.</FieldDescription>}
            </Field>
          ) : null}
        </ToggleRow>
      </SectionCard>
      <Notice msg={s.msg} />
      <SaveBar dirty={s.dirty} pending={s.pending} onCancel={s.cancel} onSave={s.save} />
    </SettingsLayout>
  )
}
