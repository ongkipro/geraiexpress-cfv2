import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { ImageUpIcon, Trash2Icon } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../../components/ui/alert-dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "../../../components/ui/toggle-group"
import { api, ApiError } from "../../../lib/api"
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
      <QrisCard owner={isOwner(w)} />
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

/**
 * `QRIS Loket (Layar Pelanggan)` (TASK-701, spec 03 §5.4): the outlet's static QRIS shown on the paired customer
 * display when the counter picks QRIS. Instant (no Save bar): upload replaces, delete asks first. Kasir: read-only.
 */
function QrisCard({ owner }: { owner: boolean }) {
  const [q, setQ] = useState<{ hasQris: boolean; url: string | null } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => {
    api<{ hasQris: boolean; url: string | null }>("/settings/qris").then(setQ).catch(() => setQ({ hasQris: false, url: null }))
  }, [])
  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (!f || pending) return
    setMsg(null)
    if (f.size > 2 * 1024 * 1024) return setMsg("Ukuran gambar maksimal 2 MB.")
    setPending(true)
    try {
      const up = await fetch("/api/app/media?purpose=qris", { method: "POST", credentials: "same-origin", headers: { "content-type": f.type || "application/octet-stream" }, body: f })
      const j = (await up.json().catch(() => null)) as { ok: boolean; data?: { id: string }; error?: { message: string } } | null
      if (!j?.ok) throw new Error(j?.error?.message ?? "Gagal mengunggah gambar. Coba lagi.")
      setQ(await api<{ hasQris: boolean; url: string | null }>("/settings/qris", { body: { mediaId: j.data!.id } }))
    } catch (err) {
      setMsg(err instanceof ApiError || err instanceof Error ? err.message : "Gagal mengunggah gambar. Coba lagi.")
    } finally {
      setPending(false)
    }
  }
  async function remove() {
    setPending(true)
    setMsg(null)
    try {
      setQ(await api<{ hasQris: boolean; url: string | null }>("/settings/qris", { body: { mediaId: null } }))
      setConfirm(false)
    } catch (err) {
      setMsg(err instanceof ApiError ? err.body.message : "Gagal menghapus. Coba lagi.")
    } finally {
      setPending(false)
    }
  }
  return (
    <SectionCard title="QRIS Loket (Layar Pelanggan)" description={owner ? "Gambar QRIS statis gerai. Tampil di layar pelanggan saat kasir memilih QRIS." : "Diatur oleh pemilik gerai. Tampil di layar pelanggan saat Anda memilih QRIS."}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="grid size-40 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {q?.url ? <img src={q.url} alt="QRIS gerai" className="size-full object-contain p-1.5" /> : <span className="px-3 text-center text-xs text-muted-foreground">{q ? "Belum ada QRIS" : "Memuat…"}</span>}
        </div>
        <div className="flex min-w-0 flex-col gap-2.5">
          <p className="text-sm text-slate-700">{q?.hasQris ? "QRIS sudah terpasang." : "Belum diunggah. Tanpa gambar, layar pelanggan meminta pelanggan memindai QRIS di meja kasir."}</p>
          {owner ? (
            <>
              <p className="text-xs text-muted-foreground">PNG, JPG atau WEBP, maksimal 2 MB. Pakai QRIS statis dari bank/penyedia Anda.</p>
              <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={pick} aria-label="Pilih gambar QRIS" tabIndex={-1} />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => file.current?.click()} disabled={pending}>
                  <ImageUpIcon aria-hidden /> {pending ? "Mengunggah…" : q?.hasQris ? "Ganti Gambar" : "Unggah QRIS"}
                </Button>
                {q?.hasQris ? (
                  <Button type="button" variant="outline" className="text-danger" onClick={() => setConfirm(true)} disabled={pending}>
                    <Trash2Icon aria-hidden /> Hapus
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
          {msg ? <p role="alert" className="text-sm font-medium text-danger">{msg}</p> : null}
        </div>
      </div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus QRIS gerai?</AlertDialogTitle>
            <AlertDialogDescription>Layar pelanggan tidak lagi menampilkan QRIS; pelanggan diminta memindai QRIS di meja kasir.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove} disabled={pending}>Ya, Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  )
}
