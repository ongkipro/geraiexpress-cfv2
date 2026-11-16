import { useEffect, useId, useState, type FormEvent } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { AuthCard, FormAlert } from "../../components/auth/auth-card"
import { TextField } from "../../components/auth/text-field"
import { Button } from "../../components/ui/button"
import { Field, FieldDescription, FieldLabel } from "../../components/ui/field"
import { Input } from "../../components/ui/input"
import { api, ApiError } from "../../lib/api"
import { CheckboxField } from "../../components/admin/page"

interface Area {
  id: string
  label: string
  postalCode: string | null
}

type Step = 3 | 4 | 5

// Outlet application after the account steps (visual 07 §3.1: … → data gerai → titik jemput (area_id) → ringkasan).
// PR-01: submission is blocked until the pickup area is chosen from Mengantar address search.
export function DaftarPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(3)
  const [businessName, setBusinessName] = useState("")
  const [slug, setSlug] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [sellerEmail, setSellerEmail] = useState("")
  const [picName, setPicName] = useState("")
  const [picPhone, setPicPhone] = useState("")
  const [street, setStreet] = useState("")
  const [lat, setLat] = useState("")
  const [lng, setLng] = useState("")
  const [query, setQuery] = useState("")
  const [areas, setAreas] = useState<Area[]>([])
  const [area, setArea] = useState<Area | null>(null)
  const [consent, setConsent] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const consentId = useId()

  useEffect(() => {
    if (query.trim().length < 3) return
    let alive = true
    const t = setTimeout(() => {
      api<{ items: Area[] }>(`/onboarding/areas?q=${encodeURIComponent(query.trim())}`)
        .then((r) => alive && setAreas(r.items))
        .catch(() => alive && setAreas([]))
    }, 300)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    setFieldErrors({})
    try {
      await api("/onboarding/application", {
        body: {
          slug,
          businessName,
          contactWhatsapp: whatsapp,
          sellerEmail,
          consentMengantar: consent,
          outlet: { name: businessName, picName, picPhone, areaId: area?.id ?? "", areaLabel: area?.label ?? "", streetAddress: street, postalCode: area?.postalCode ?? null, latitude: lat.trim() || null, longitude: lng.trim() || null },
        },
      })
      await navigate({ to: "/daftar/status" })
    } catch (err) {
      const ae = err instanceof ApiError ? err : null
      setError(ae?.body.message ?? "Terjadi kesalahan. Silakan coba lagi.")
      setFieldErrors(ae?.body.field_errors ?? {})
      if (ae?.body.field_errors?.slug || ae?.body.field_errors?.businessName || ae?.body.field_errors?.contactWhatsapp) setStep(3)
      else if (ae?.body.field_errors?.areaId || ae?.body.field_errors?.picPhone || ae?.body.field_errors?.latitude || ae?.body.field_errors?.longitude) setStep(4)
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthCard title="Daftar Gerai" description={<span className="tabular-nums">Langkah {step}/5 · {step === 3 ? "Data gerai" : step === 4 ? "Titik jemput" : "Ringkasan"}</span>} footer={<Link to="/" className="font-medium text-primary underline-offset-4 hover:underline">Kembali</Link>}>
      {error ? <FormAlert>{error}</FormAlert> : null}
      {step === 3 ? (
        <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); setStep(4) }} noValidate>
          <TextField label="Nama gerai" name="businessName" value={businessName} onChange={(v) => { setBusinessName(v); if (!slug) setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 30)) }} error={fieldErrors.businessName} required maxLength={80} />
          <TextField label="Alamat gerai" name="slug" value={slug} onChange={(v) => setSlug(v.toLowerCase())} error={fieldErrors.slug} hint={slug ? `${slug}.geraimitra.com` : "Huruf kecil, angka, tanda hubung."} required maxLength={30} />
          <TextField label="WhatsApp gerai" name="whatsapp" inputMode="numeric" value={whatsapp} onChange={setWhatsapp} error={fieldErrors.contactWhatsapp} required />
          <TextField label="Email untuk akun Mengantar" name="sellerEmail" type="email" inputMode="email" value={sellerEmail} onChange={setSellerEmail} error={fieldErrors.sellerEmail} hint="Pakai email yang Anda baca: hanya lewat email ini Anda bisa masuk ke akun Mengantar." required />
          <Button type="submit" size="lg">Lanjut</Button>
        </form>
      ) : null}
      {step === 4 ? (
        <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); if (area) setStep(5) }} noValidate>
          <Field data-invalid={fieldErrors.areaId ? true : undefined}>
            <FieldLabel htmlFor="area-search">Cari kelurahan / kecamatan / kode pos</FieldLabel>
            <Input id="area-search" value={query} onChange={(e) => { setQuery(e.target.value); setArea(null) }} autoComplete="off" aria-describedby="area-help" />
            <FieldDescription id="area-help">{area ? `Dipilih: ${area.label}` : "Ketik minimal 3 huruf, lalu pilih wilayah dari daftar."}</FieldDescription>
          </Field>
          {!area && areas.length ? (
            <ul className="flex flex-col divide-y rounded-lg border" aria-label="Hasil pencarian wilayah">
              {areas.map((a) => (
                <li key={a.id}>
                  <button type="button" className="flex min-h-11 w-full items-center px-3 text-left text-base hover:bg-muted" onClick={() => { setArea(a); setQuery(a.label) }}>
                    {a.label}{a.postalCode ? ` · ${a.postalCode}` : ""}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <TextField label="Alamat lengkap titik jemput" name="street" value={street} onChange={setStreet} hint="Nama jalan, nomor, RT/RW, patokan." required maxLength={300} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Latitude (opsional)" name="latitude" inputMode="decimal" value={lat} onChange={setLat} error={fieldErrors.latitude} hint="Contoh: -6.9456" />
            <TextField label="Longitude (opsional)" name="longitude" inputMode="decimal" value={lng} onChange={setLng} error={fieldErrors.longitude} hint="Contoh: 107.5703" />
          </div>
          <p className="text-base text-muted-foreground">Titik koordinat dibutuhkan untuk penjemputan Pos Indonesia; bisa diisi nanti di Pengaturan › Profil Gerai.</p>
          <TextField label="Nama penanggung jawab" name="picName" value={picName} onChange={setPicName} required maxLength={80} />
          <TextField label="HP penanggung jawab" name="picPhone" inputMode="numeric" value={picPhone} onChange={setPicPhone} error={fieldErrors.picPhone} required />
          <Button type="submit" size="lg" disabled={!area}>Lanjut</Button>
          <Button type="button" variant="outline" size="lg" onClick={() => setStep(3)}>Kembali</Button>
        </form>
      ) : null}
      {step === 5 ? (
        <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
          <dl className="flex flex-col gap-2 text-base">
            <div><dt className="text-muted-foreground">Gerai</dt><dd className="font-medium">{businessName} · {slug}.geraimitra.com</dd></div>
            <div><dt className="text-muted-foreground">Titik jemput</dt><dd>{street}, {area?.label}</dd></div>
            <div><dt className="text-muted-foreground">Akun Mengantar</dt><dd>{sellerEmail}</dd></div>
          </dl>
          <CheckboxField id={consentId} align="start" checked={consent} onCheckedChange={setConsent}>
            <span>Saya setuju GeraiExpress membuat akun seller Mengantar atas nama gerai saya dengan email di atas, dan saya menyetujui Syarat & Ketentuan serta Kebijakan Privasi Mengantar. Saldo dan COD gerai dipegang di akun Mengantar tersebut.</span>
          </CheckboxField>
          <Button type="submit" size="lg" disabled={pending || !consent}>{pending ? "Mengirim…" : "Kirim Pengajuan"}</Button>
          <Button type="button" variant="outline" size="lg" onClick={() => setStep(4)} disabled={pending}>Kembali</Button>
        </form>
      ) : null}
    </AuthCard>
  )
}
