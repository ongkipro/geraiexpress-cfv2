import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { Switch } from "../../../components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "../../../components/ui/toggle-group"
import { api } from "../../../lib/api"
import { deviceDensity, FORMAT_LABEL, PAPER_HINT, setDeviceDensity, type Format } from "../../../print/print"
import { isOwner, useWorkspace } from "../../../shell/workspace"
import { ErrorState, LoadingState } from "../../../shell/states"
import { Notice, SaveBar, SettingsLayout, useSettingsForm, type SettingsView } from "../index/shared"

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
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Printer di perangkat ini</CardTitle>
        <CardDescription className="text-base">Untuk PC: pasang driver printer thermal 100 mm, ukuran kertas sesuai label, dan skala cetak 100% (Ukuran sebenarnya). Pilihan di kartu ini langsung tersimpan di perangkat ini saja.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-base font-medium">Ketebalan cetak</p>
        <ToggleGroup value={[density]} onValueChange={(v) => {
          const d = (v[0] as "normal" | "tebal") ?? density
          setDensity(d)
          setDeviceDensity(d)
        }} variant="outline" aria-label="Ketebalan cetak">
          <ToggleGroupItem value="normal">Normal</ToggleGroupItem>
          <ToggleGroupItem value="tebal">Tebal</ToggleGroupItem>
        </ToggleGroup>
        <p className="text-base text-muted-foreground">Pilih Tebal bila barcode di kertas thermal tipis tampak pudar.</p>
      </CardContent>
    </Card>
  )
}

function KasirFormatInfo() {
  const [fmt, setFmt] = useState<Format | null>(null)
  useEffect(() => {
    api<{ format: Format }>("/print/settings").then((s) => setFmt(s.format)).catch(() => undefined)
  }, [])
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Format label gerai</CardTitle></CardHeader>
      <CardContent><p className="text-base">{fmt ? `${FORMAT_LABEL[fmt]} — ${PAPER_HINT[fmt]}.` : "Memuat…"} Format bawaan diatur oleh pemilik gerai.</p></CardContent>
    </Card>
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
      <Card>
        <CardHeader><CardTitle className="text-lg">Format label bawaan</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div role="radiogroup" aria-label="Format label bawaan" className="flex flex-col gap-2">
            {FORMATS.map((x) => (
              <button key={x} type="button" role="radio" aria-checked={f.defaultLabelFormat === x} onClick={() => set({ defaultLabelFormat: x })} className={`flex min-h-11 flex-col items-start rounded-lg border px-4 py-2 text-left text-base ${f.defaultLabelFormat === x ? "border-primary bg-primary/10" : "border-input"}`}>
                <span className="font-medium">{FORMAT_LABEL[x]}</span>
                <span className="text-muted-foreground">{PAPER_HINT[x]}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-lg">Isi struk</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field data-invalid={s.fields.unboxingRemark ? true : undefined}>
            <FieldLabel htmlFor="remark">Catatan video unboxing</FieldLabel>
            <Input id="remark" value={f.unboxingRemark} maxLength={50} onChange={(e) => set({ unboxingRemark: e.target.value })} />
            {s.fields.unboxingRemark ? <FieldError>{s.fields.unboxingRemark}</FieldError> : <FieldDescription>{f.unboxingRemark.length}/50 karakter. Kosongkan untuk menyembunyikan baris ini.</FieldDescription>}
          </Field>
          <label className="flex min-h-11 items-center justify-between gap-3 text-base">
            Tampilkan komisi di Cek Ongkir Cepat (khusus pemilik)
            <Switch checked={f.showCommission} onCheckedChange={(v) => set({ showCommission: v })} />
          </label>
        </CardContent>
      </Card>
      <Notice msg={s.msg} />
      <SaveBar dirty={s.dirty} pending={s.pending} onCancel={s.cancel} onSave={s.save} />
    </>
  )
}
