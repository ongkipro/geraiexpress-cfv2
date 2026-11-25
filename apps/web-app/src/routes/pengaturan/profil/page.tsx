import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
import { GlobeIcon, ImageUpIcon, Trash2Icon } from "lucide-react"
import { PreciseAreaPicker, type Area } from "../../../components/area-picker"
import { LocationPinPicker } from "../../../components/location-pin-picker"
import { SectionCard } from "../../../components/admin/page"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../../components/ui/alert-dialog"
import { Button } from "../../../components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { Textarea } from "../../../components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "../../../components/ui/toggle-group"
import { api, ApiError } from "../../../lib/api"
import { sanitizePhone } from "../../../lib/input"
import { ErrorState, LoadingState } from "../../../shell/states"
import { refreshTenantLogo, useWorkspace } from "../../../shell/workspace"
import { Notice, readSettingsCache, SaveBar, SettingsLayout, useSettingsForm, writeSettingsCache, type SettingsView } from "../index/shared"

// Pengaturan › Profil Gerai (visual 08 §2.3): 1:1 icon/logo (auto-applied to mini-site logo + favicon, workspace,
// customer display & thermal label), identity, and pickup address (Mengantar area + 3-line street + pinpoint).
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
const toBody = (f: Form) => ({ name: f.name, whatsapp: f.whatsapp, openingHours: f.openingHours, areaId: f.area?.id ?? "", areaLabel: f.area?.label ?? "", street: f.street, postalCode: f.postalCode, latitude: f.latitude.trim(), longitude: f.longitude.trim() })

const LOGO_MAX_BYTES = 2 * 1024 * 1024
const LOGO_UPLOAD_FAILED = "Gagal mengunggah logo gerai. Periksa koneksi lalu coba lagi."
const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"])

/**
 * Normalises an uploaded image into a crisp 512×512 (1:1) JPEG on a clean white canvas so the exact same asset renders
 * sharply as the mini-site favicon (even on dark browser tabs), mini-site header logo, sidebar icon, customer display,
 * and thermal label PDF (`/DCTDecode`). Falls back to the original file if Canvas decoding is unavailable.
 */
async function normaliseSquareLogo(file: File, mode: "contain" | "cover"): Promise<{ blob: Blob; contentType: string }> {
  try {
    const url = URL.createObjectURL(file)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error("decode"))
        el.src = url
      })
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height
      if (!w || !h) return { blob: file, contentType: file.type || "application/octet-stream" }
      const size = 512
      const canvas = document.createElement("canvas")
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext("2d")
      if (!ctx) return { blob: file, contentType: file.type || "application/octet-stream" }
      ctx.fillStyle = "#FFFFFF"
      ctx.fillRect(0, 0, size, size)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"

      const ratio = w / h
      const nearlySquare = ratio >= 0.95 && ratio <= 1.05
      if (mode === "cover" || nearlySquare) {
        const scale = Math.max(size / w, size / h)
        const dw = w * scale
        const dh = h * scale
        ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh)
      } else {
        const pad = Math.round(size * 0.06)
        const inner = size - pad * 2
        const scale = Math.min(inner / w, inner / h)
        const dw = w * scale
        const dh = h * scale
        ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh)
      }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92))
      if (!blob || blob.size === 0 || blob.size > LOGO_MAX_BYTES) return { blob: file, contentType: file.type || "application/octet-stream" }
      return { blob, contentType: "image/jpeg" }
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return { blob: file, contentType: file.type || "application/octet-stream" }
  }
}

function LogoCard({ outletName }: { outletName: string }) {
  const w = useWorkspace()
  const cacheKey = `logo:${w.tenant.id}`
  const [logo, setLogo] = useState<{ hasLogo: boolean; url: string | null } | null>(() => readSettingsCache<{ hasLogo: boolean; url: string | null }>(cacheKey))
  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain")
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: "safe" | "danger"; text: string } | null>(null)
  const [delErr, setDelErr] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    api<{ hasLogo: boolean; url: string | null }>("/settings/logo")
      .then((d) => {
        writeSettingsCache(cacheKey, d)
        setLoadErr(null)
        setLogo(d)
      })
      .catch((e) => {
        if (!readSettingsCache(cacheKey)) setLoadErr(e instanceof ApiError ? e.body.message : "Logo gerai tidak dapat dimuat.")
      })
  }, [cacheKey])
  useEffect(load, [load])

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (!f || pending) return
    setMsg(null)
    if (f.size > LOGO_MAX_BYTES) return setMsg({ tone: "danger", text: "Ukuran gambar maksimal 2 MB." })
    if (f.type && !ALLOWED_LOGO_TYPES.has(f.type)) return setMsg({ tone: "danger", text: "Logo gerai harus berupa gambar JPG, PNG, atau WEBP." })
    setPending(true)
    try {
      const prepared = await normaliseSquareLogo(f, fitMode)
      const up = await fetch("/api/app/media?purpose=logo", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": prepared.contentType },
        body: prepared.blob,
      })
      const j = (await up.json().catch(() => null)) as { ok: boolean; data?: { id: string }; error?: { code?: string; message: string } } | null
      if (!j?.ok) throw new ApiError(up.status, { code: j?.error?.code ?? "UPLOAD_FAILED", message: j?.error?.message ?? LOGO_UPLOAD_FAILED, field_errors: {} })
      const next = await api<{ hasLogo: boolean; url: string | null }>("/settings/logo", { body: { mediaId: j.data!.id } })
      writeSettingsCache(cacheKey, next)
      setLogo(next)
      refreshTenantLogo(next.url)
      setMsg({ tone: "safe", text: "Logo 1:1 tersimpan dan otomatis aktif di mini-site, favicon, aplikasi, serta label cetak." })
    } catch (err) {
      setMsg({ tone: "danger", text: err instanceof ApiError ? err.body.message : LOGO_UPLOAD_FAILED })
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    if (pending) return
    setPending(true)
    setMsg(null)
    setDelErr(null)
    try {
      const next = await api<{ hasLogo: boolean; url: string | null }>("/settings/logo", { body: { mediaId: null } })
      writeSettingsCache(cacheKey, next)
      setLogo(next)
      refreshTenantLogo(null)
      setConfirm(false)
      setMsg({ tone: "safe", text: "Logo dihapus. Mini-site dan aplikasi kembali memakai inisial nama gerai." })
    } catch (err) {
      setDelErr(err instanceof ApiError ? err.body.message : "Gagal menghapus logo. Coba lagi.")
    } finally {
      setPending(false)
    }
  }

  const shownName = outletName.trim() || w.tenant.name
  const initial = shownName.slice(0, 1).toUpperCase() || "G"

  return (
    <SectionCard title="Logo & Ikon Gerai (1:1)" description="Otomatis dipakai sebagai logo gerai, favicon tab browser mini-site, layar pelanggan, dan header label thermal.">
      {loadErr ? (
        <div className="flex flex-wrap items-center gap-3 text-sm text-danger">
          <span>{loadErr}</span>
          <Button type="button" variant="outline" size="sm" onClick={load}>Coba Lagi</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          {/* Live multi-context preview: 1:1 logo tile + mini-site browser favicon tab */}
          <div className="flex shrink-0 flex-col items-start gap-3">
            <div className="grid size-28 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              {logo?.url ? (
                <img src={logo.url} alt={`Logo ${shownName}`} className="size-full object-cover" />
              ) : (
                <span aria-hidden className="grid size-full place-items-center bg-primary text-3xl font-bold text-primary-foreground">
                  {initial}
                </span>
              )}
            </div>
            <div className="flex max-w-44 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700" title="Pratinjau favicon tab browser mini-site">
              {logo?.url ? (
                <img src={logo.url} alt="" aria-hidden className="size-4 shrink-0 rounded-[4px] border border-slate-200/80 bg-white object-cover" />
              ) : (
                <span aria-hidden className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-primary text-[10px] font-bold text-white">{initial}</span>
              )}
              <span className="truncate font-medium">{shownName}</span>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-slate-900">
                {logo ? (logo.hasLogo ? "Logo 1:1 sudah terpasang." : "Belum ada logo — memakai inisial nama gerai.") : "Memuat status logo…"}
              </p>
              <p className="text-xs text-muted-foreground">
                Unggah gambar <strong>rasio 1:1 (persegi)</strong> format PNG, JPG, atau WEBP, <strong>maksimal 2 MB</strong>. Gambar otomatis dikonversi ke 512×512 px untuk favicon mini-site (<span className="inline-flex items-center gap-0.5 align-middle font-mono text-[11px]"><GlobeIcon aria-hidden className="size-3" />{w.tenant.miniSiteHost}</span>) dan logo gerai.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-700">Penyesuaian gambar non-persegi:</span>
              <ToggleGroup value={[fitMode]} onValueChange={(v) => v[0] && setFitMode(v[0] as "contain" | "cover")} variant="outline" spacing={0} aria-label="Mode penyesuaian 1:1" size="sm">
                <ToggleGroupItem value="contain">Pas utuh (1:1)</ToggleGroupItem>
                <ToggleGroupItem value="cover">Potong penuh (1:1)</ToggleGroupItem>
              </ToggleGroup>
            </div>

            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onPick} aria-label="Pilih logo gerai 1:1" tabIndex={-1} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => file.current?.click()} disabled={pending}>
                <ImageUpIcon aria-hidden /> {pending ? "Mengunggah…" : logo?.hasLogo ? "Ganti Logo" : "Unggah Logo 1:1"}
              </Button>
              {logo?.hasLogo ? (
                <Button type="button" variant="outline" className="text-danger" onClick={() => setConfirm(true)} disabled={pending}>
                  <Trash2Icon aria-hidden /> Hapus
                </Button>
              ) : null}
            </div>

            {msg ? <p role={msg.tone === "danger" ? "alert" : "status"} className={msg.tone === "danger" ? "text-sm font-medium text-danger" : "text-sm font-medium text-safe"}>{msg.text}</p> : null}
          </div>
        </div>
      )}
      <AlertDialog open={confirm} onOpenChange={(o) => { if (!pending) { setConfirm(o); if (!o) setDelErr(null) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus logo gerai?</AlertDialogTitle>
            <AlertDialogDescription>Mini-site, favicon browser, layar pelanggan, dan label cetak akan kembali menampilkan inisial nama gerai.</AlertDialogDescription>
          </AlertDialogHeader>
          {delErr ? <p role="alert" className="text-sm font-medium text-danger">{delErr}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove} disabled={pending}>{pending ? "Menghapus…" : "Ya, Hapus"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  )
}

export function ProfilGeraiPage() {
  const s = useSettingsForm(pick, "profile", toBody)
  if (s.error) return <SettingsLayout title="Profil Gerai"><ErrorState message={s.error} onRetry={s.load} /></SettingsLayout>
  if (!s.form) return <SettingsLayout title="Profil Gerai"><LoadingState label="Memuat profil" /></SettingsLayout>
  const f = s.form
  const set = (p: Partial<Form>) => s.setForm({ ...f, ...p })
  const field = (id: keyof Form & string, label: string, help?: string, props: Record<string, unknown> = {}, transform?: (v: string) => string) => (
    <Field data-invalid={s.fields[id] ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={f[id] as string}
        onChange={(e) => set({ [id]: transform ? transform(e.target.value) : e.target.value } as Partial<Form>)}
        aria-invalid={s.fields[id] ? true : undefined}
        {...props}
      />
      {s.fields[id] ? <FieldError>{s.fields[id]}</FieldError> : help ? <FieldDescription>{help}</FieldDescription> : null}
    </Field>
  )
  return (
    <SettingsLayout title="Profil Gerai" description="Logo, nama, dan alamat ini dipakai untuk mini-site, penjemputan kurir, dan struk pelanggan.">
      <LogoCard outletName={f.name} />
      <SectionCard title="Identitas gerai" description="Tampil di struk, label, dan mini-site.">
        <div className="grid gap-4 sm:grid-cols-2">
          {field("name", "Nama gerai", "Boleh huruf dan angka, contoh: Gerai Express 88.", { maxLength: 80 })}
          {field("whatsapp", "WhatsApp gerai", "Tampil di struk bila pelanggan perlu menghubungi gerai.", { type: "tel", inputMode: "tel", autoComplete: "tel", maxLength: 20, placeholder: "0812-3456-7890" }, sanitizePhone)}
          {field("openingHours", "Jam buka", "Contoh: Senin–Sabtu 08.00–21.00", { maxLength: 80 })}
        </div>
      </SectionCard>
      <SectionCard title="Alamat jemput" description="Alamat ini dipakai kurir saat menjemput paket di gerai.">
        <div className="flex flex-col gap-4">
          <PreciseAreaPicker
            kecamatanLabel="Kecamatan"
            value={f.area}
            postalCode={f.postalCode}
            onChange={(a) => set({ area: a, postalCode: a?.postalCode ?? f.postalCode })}
            onPostalCodeChange={(postalCode) => set({ postalCode })}
            error={s.fields.areaId}
            postalError={s.fields.postalCode}
          />
          <Field data-invalid={s.fields.street ? true : undefined}>
            <FieldLabel htmlFor="street">Alamat lengkap</FieldLabel>
            <Textarea
              id="street"
              rows={3}
              className="min-h-[5.5rem]"
              value={f.street}
              onChange={(e) => set({ street: e.target.value })}
              maxLength={200}
              placeholder="Nama jalan, nomor ruko/rumah, RT/RW, patokan sekitar gerai"
              aria-invalid={s.fields.street ? true : undefined}
            />
            {s.fields.street ? <FieldError>{s.fields.street}</FieldError> : <FieldDescription>Tulis lengkap agar kurir mudah menemukan titik jemput gerai.</FieldDescription>}
          </Field>
          <LocationPinPicker
            latitude={f.latitude}
            longitude={f.longitude}
            onChange={(latitude, longitude) => set({ latitude, longitude })}
            latError={s.fields.latitude}
            lngError={s.fields.longitude}
            areaHint={f.area?.label ?? null}
          />
        </div>
      </SectionCard>
      <Notice msg={s.msg} />
      <SaveBar dirty={s.dirty} pending={s.pending} onCancel={s.cancel} onSave={s.save} />
    </SettingsLayout>
  )
}
