import { useEffect, useState } from "react"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "../../../components/ui/toggle-group"
import { api } from "../../../lib/api"
import { deviceDensity, FORMAT_LABEL, PAPER_HINT, setDeviceDensity, type Format } from "../../../print/print"
import { isOwner, useWorkspace } from "../../../shell/workspace"
import { ErrorState, LoadingState } from "../../../shell/states"
import { Notice, SaveBar, SettingsLayout, useSettingsForm, type SettingsView } from "../index/shared"
import { ChoiceGroup, SectionCard, ToggleRow } from "../../../components/admin/page"

// Pengaturan › Printer & Struk (visual 08 §2.3, DEC-224/225): this device's density (instant, local, Kasir allowed)
// in its own card; outlet label format + receipt content (owner, Save bar). Instant and Save never share a card.
const FORMATS: Format[] = ["label_10x15_with_stub", "label_10x10", "label_10x15", "roll_58mm"]

export function PrinterPage() {
  const w = useWorkspace()
  return (
    <SettingsLayout title="Printer & Struk" description="Atur printer di perangkat ini dan isi struk pelanggan.">
      <DeviceCard />
      {isOwner(w) ? <ReceiptForm /> : <KasirFormatInfo />}
    </SettingsLayout>
  )
}

function DeviceCard() {
  const [density, setDensity] = useState(deviceDensity)
  return (
    <SectionCard title="Printer di perangkat ini" description="Langsung tersimpan di perangkat ini saja.">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <span id="density-t" className="text-sm font-medium">Ketebalan cetak</span>
            <span className="text-xs text-muted-foreground">Pilih Tebal bila barcode di kertas thermal tipis tampak pudar.</span>
          </div>
          <ToggleGroup value={[density]} onValueChange={(v) => {
            const d = (v[0] as "normal" | "tebal") ?? density
            setDensity(d)
            setDeviceDensity(d)
          }} variant="outline" aria-labelledby="density-t">
            <ToggleGroupItem value="normal" className="min-w-20">Normal</ToggleGroupItem>
            <ToggleGroupItem value="tebal" className="min-w-20">Tebal</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-muted-foreground">Untuk PC: pasang driver printer thermal 100 mm, ukuran kertas sesuai label, dan skala cetak 100% (Ukuran sebenarnya).</p>
      </div>
    </SectionCard>
  )
}

function KasirFormatInfo() {
  const [fmt, setFmt] = useState<Format | null>(null)
  useEffect(() => {
    api<{ format: Format }>("/print/settings").then((s) => setFmt(s.format)).catch(() => undefined)
  }, [])
  return (
    <SectionCard title="Format label gerai" description="Format bawaan diatur oleh pemilik gerai.">
      <p className="text-sm">{fmt ? <><span className="font-medium">{FORMAT_LABEL[fmt]}</span> — {PAPER_HINT[fmt]}.</> : "Memuat…"}</p>
    </SectionCard>
  )
}

type Form = SettingsView["receipt"]
const pick = (s: SettingsView): Form => s.receipt

function ReceiptForm() {
  const s = useSettingsForm(pick, "receipt")
  if (s.error) return <ErrorState message={s.error} onRetry={s.load} />
  if (!s.form) return <LoadingState label="Memuat pengaturan struk" />
  const f = s.form
  const set = (p: Partial<Form>) => s.setForm({ ...f, ...p })
  return (
    <>
      <SectionCard title="Format label bawaan" description="Dipakai setiap kali kasir mencetak label; bisa diganti per cetakan.">
        <ChoiceGroup label="Format label bawaan" layout="grid" value={f.defaultLabelFormat} onValueChange={(x) => set({ defaultLabelFormat: x })} choices={FORMATS.map((x) => ({ value: x, label: FORMAT_LABEL[x], description: PAPER_HINT[x] }))} />
      </SectionCard>
      <SectionCard title="Isi struk" description="Baris tambahan di struk pelanggan.">
        <div className="flex flex-col divide-y divide-slate-100">
          <Field className="pb-4" data-invalid={s.fields.unboxingRemark ? true : undefined}>
            <div className="flex items-baseline justify-between gap-3">
              <FieldLabel htmlFor="remark">Catatan video unboxing</FieldLabel>
              <span className="text-xs text-muted-foreground tabular-nums" aria-hidden>{f.unboxingRemark.length}/50</span>
            </div>
            <Input id="remark" value={f.unboxingRemark} maxLength={50} onChange={(e) => set({ unboxingRemark: e.target.value })} />
            {s.fields.unboxingRemark ? <FieldError>{s.fields.unboxingRemark}</FieldError> : <FieldDescription>Maksimal 50 karakter. Kosongkan untuk menyembunyikan baris ini.</FieldDescription>}
          </Field>
          <ToggleRow className="pt-3" id="show-commission" title="Tampilkan komisi di Cek Ongkir Cepat" description="Khusus pemilik; kasir tidak pernah melihat komisi." checked={f.showCommission} onCheckedChange={(v) => set({ showCommission: v })} />
        </div>
      </SectionCard>
      <Notice msg={s.msg} />
      <SaveBar dirty={s.dirty} pending={s.pending} onCancel={s.cancel} onSave={s.save} />
    </>
  )
}
