import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
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
import { Notice, readSettingsCache, SaveBar, SettingsLayout, useSettingsForm, writeSettingsCache, type SettingsView } from "../index/shared"
import { ChoiceGroup, SectionCard, ToggleRow } from "../../../components/admin/page"
import { LabelPreview } from "./preview"

// Pengaturan › Printer & Struk (visual 08 §2.3, DEC-224/225): outlet label format + live thermal preview + receipt
// remark (owner, Save bar); this device's density (instant, local, Kasir allowed) in its own card so instant and Save
// never share a card.
const FORMATS: Format[] = ["label_10x15_with_stub", "label_10x10", "label_10x15", "roll_58mm"]

export function PrinterPage() {
  const w = useWorkspace()
  const [density, setDensity] = useState<"normal" | "tebal">(deviceDensity)
  const changeDensity = (d: "normal" | "tebal") => {
    setDensity(d)
    setDeviceDensity(d)
  }
  return (
    <SettingsLayout title="Printer & Struk" description="Atur format label, lihat pratinjau cetak langsung, dan atur printer di perangkat ini.">
      {isOwner(w) ? <ReceiptForm density={density} /> : <KasirFormatInfo density={density} />}
      <DeviceCard density={density} onChange={changeDensity} />
      <QrisCard owner={isOwner(w)} />
    </SettingsLayout>
  )
}

function DeviceCard({ density, onChange }: { density: "normal" | "tebal"; onChange: (d: "normal" | "tebal") => void }) {
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
            onChange(d)
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

function KasirFormatInfo({ density }: { density: "normal" | "tebal" }) {
  const w = useWorkspace()
  const cacheKey = `print-format:${w.tenant.id}`
  const [fmt, setFmt] = useState<Format | null>(() => readSettingsCache<Format>(cacheKey))
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(() => {
    api<{ format: Format }>("/print/settings")
      .then((s) => {
        writeSettingsCache(cacheKey, s.format)
        setErr(null)
        setFmt(s.format)
      })
      .catch((e) => {
        if (!readSettingsCache<Format>(cacheKey)) setErr(e instanceof ApiError ? e.body.message : "Format label tidak dapat dimuat.")
      })
  }, [cacheKey])
  useEffect(load, [load])
  return (
    <SectionCard title="Format label gerai" description="Format bawaan diatur oleh pemilik gerai.">
      {err ? (
        <div className="flex flex-wrap items-center gap-3 text-sm text-danger">
          <span>{err}</span>
          <Button type="button" variant="outline" size="sm" onClick={load}>Coba Lagi</Button>
        </div>
      ) : fmt ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_308px]">
          <div className="flex flex-col gap-2">
            <p className="text-sm"><span className="font-medium text-slate-950">{FORMAT_LABEL[fmt]}</span> — {PAPER_HINT[fmt]}.</p>
            <p className="text-xs text-muted-foreground">Gunakan tombol Cetak Uji Contoh di samping untuk memastikan ukuran kertas dan skala 100% printer loket sudah pas sebelum mulai shift.</p>
          </div>
          <LabelPreview
            format={fmt}
            remark="Rekam video saat buka paket untuk klaim"
            density={density}
            outletName={w.tenant.name}
            outletWhatsapp={null}
            miniSiteHost={w.tenant.miniSiteHost}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Memuat…</p>
      )}
    </SectionCard>
  )
}

type Form = SettingsView["receipt"]
const pick = (s: SettingsView): Form => s.receipt

function ReceiptForm({ density }: { density: "normal" | "tebal" }) {
  const w = useWorkspace()
  const s = useSettingsForm(pick, "receipt")
  if (s.error) return <ErrorState message={s.error} onRetry={s.load} />
  if (!s.form) return <LoadingState label="Memuat pengaturan struk" />
  const f = s.form
  const cached = readSettingsCache<SettingsView>(`settings:${w.tenant.id}`)
  const activeFormat: Format = FORMATS.includes(f.defaultLabelFormat as Format) ? (f.defaultLabelFormat as Format) : "label_10x15_with_stub"
  const set = (p: Partial<Form>) => s.setForm({ ...f, ...p })
  return (
    <>
      <SectionCard title="Format label & isi struk" description="Dipakai setiap kali kasir mencetak label; pratinjau di samping berubah langsung sesuai pilihan Anda.">
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_308px]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-950">Format label bawaan</span>
              <ChoiceGroup
                label="Format label bawaan"
                layout="grid"
                className="xl:grid-cols-1"
                value={activeFormat}
                onValueChange={(x) => set({ defaultLabelFormat: x })}
                choices={FORMATS.map((x) => ({ value: x, label: FORMAT_LABEL[x], description: PAPER_HINT[x] }))}
              />
            </div>
            <div className="border-t border-slate-100 pt-4">
              <Field data-invalid={s.fields.unboxingRemark ? true : undefined}>
                <div className="flex items-baseline justify-between gap-3">
                  <FieldLabel htmlFor="remark">Catatan video unboxing (di label)</FieldLabel>
                  <span className="text-xs text-muted-foreground tabular-nums" aria-hidden>{f.unboxingRemark.length}/50</span>
                </div>
                <Input id="remark" value={f.unboxingRemark} maxLength={50} onChange={(e) => set({ unboxingRemark: e.target.value })} />
                {s.fields.unboxingRemark ? <FieldError>{s.fields.unboxingRemark}</FieldError> : <FieldDescription>Maksimal 50 karakter. Kosongkan untuk menyembunyikan baris ini di label paket.</FieldDescription>}
              </Field>
            </div>
          </div>
          <div className="xl:sticky xl:top-24">
            <LabelPreview
              format={activeFormat}
              remark={f.unboxingRemark}
              density={density}
              outletName={cached?.profile?.name ?? w.tenant.name}
              outletWhatsapp={cached?.profile?.whatsapp ?? null}
              miniSiteHost={w.tenant.miniSiteHost}
            />
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Tampilan layar kasir" description="Hanya tampil di layar pemilik; tidak pernah dicetak di struk pelanggan maupun terlihat oleh kasir.">
        <ToggleRow
          id="show-commission"
          title="Tampilkan Modal & Laba saat cek ongkir"
          description="Menampilkan harga modal Mengantar dan estimasi laba gerai secara otomatis di layar Kasir & Cek Ongkir Cepat. Tidak dicetak di struk; khusus pemilik."
          checked={f.showCommission}
          onCheckedChange={(v) => set({ showCommission: v })}
        />
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
const QRIS_UPLOAD_FAILED = "Gagal mengunggah gambar QRIS. Periksa koneksi lalu coba lagi."

function QrisCard({ owner }: { owner: boolean }) {
  const w = useWorkspace()
  const cacheKey = `qris:${w.tenant.id}`
  const [q, setQ] = useState<{ hasQris: boolean; url: string | null } | null>(() => readSettingsCache<{ hasQris: boolean; url: string | null }>(cacheKey))
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const load = useCallback(() => {
    api<{ hasQris: boolean; url: string | null }>("/settings/qris")
      .then((d) => {
        writeSettingsCache(cacheKey, d)
        setLoadErr(null)
        setQ(d)
      })
      .catch((e) => {
        if (!readSettingsCache(cacheKey)) setLoadErr(e instanceof ApiError ? e.body.message : "Status QRIS tidak dapat dimuat.")
      })
  }, [cacheKey])
  useEffect(load, [load])
  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (!f || pending) return
    setMsg(null)
    if (f.size > 2 * 1024 * 1024) return setMsg("Ukuran gambar maksimal 2 MB.")
    setPending(true)
    try {
      const up = await fetch("/api/app/media?purpose=qris", { method: "POST", credentials: "same-origin", headers: { "content-type": f.type || "application/octet-stream" }, body: f })
      const j = (await up.json().catch(() => null)) as { ok: boolean; data?: { id: string }; error?: { code?: string; message: string } } | null
      // A server refusal (size, type, role) keeps its own Indonesian message; an unreadable answer gets the fallback.
      if (!j?.ok) throw new ApiError(up.status, { code: j?.error?.code ?? "UPLOAD_FAILED", message: j?.error?.message ?? QRIS_UPLOAD_FAILED, field_errors: {} })
      const next = await api<{ hasQris: boolean; url: string | null }>("/settings/qris", { body: { mediaId: j.data!.id } })
      writeSettingsCache(cacheKey, next)
      setQ(next)
    } catch (err) {
      // Sol R1 F7: only the server's own (Indonesian) message is shown; a browser/network error never leaks its English text.
      setMsg(err instanceof ApiError ? err.body.message : QRIS_UPLOAD_FAILED)
    } finally {
      setPending(false)
    }
  }
  async function remove() {
    setPending(true)
    setMsg(null)
    try {
      const next = await api<{ hasQris: boolean; url: string | null }>("/settings/qris", { body: { mediaId: null } })
      writeSettingsCache(cacheKey, next)
      setQ(next)
      setConfirm(false)
    } catch (err) {
      setMsg(err instanceof ApiError ? err.body.message : "Gagal menghapus. Coba lagi.")
    } finally {
      setPending(false)
    }
  }
  return (
    <SectionCard title="QRIS Loket (Layar Pelanggan)" description={owner ? "Gambar QRIS statis gerai. Tampil di layar pelanggan saat kasir memilih QRIS." : "Diatur oleh pemilik gerai. Tampil di layar pelanggan saat Anda memilih QRIS."}>
      {loadErr ? (
        <div className="flex flex-wrap items-center gap-3 text-sm text-danger">
          <span>{loadErr}</span>
          <Button type="button" variant="outline" size="sm" onClick={load}>Coba Lagi</Button>
        </div>
      ) : (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="grid size-40 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {q?.url ? <img src={q.url} alt="QRIS gerai" className="size-full object-contain p-1.5" /> : <span className="px-3 text-center text-xs text-muted-foreground">{q ? "Belum ada QRIS" : "Memuat…"}</span>}
        </div>
        <div className="flex min-w-0 flex-col gap-2.5">
          <p className="text-sm text-slate-700">{q ? (q.hasQris ? "QRIS sudah terpasang." : "Belum diunggah. Tanpa gambar, layar pelanggan meminta pelanggan memindai QRIS di meja kasir.") : "Memuat status QRIS…"}</p>
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
      )}
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
