import { useEffect, useId, useState, type FormEvent } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { AuthCard, FormAlert, RegisterSteps } from "../../components/auth/auth-card"
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

type Step = 2 | 3

// Outlet application after the account (DEC-248 `1 · Akun — 2 · Gerai — 3 · Titik Jemput`; each step fits one viewport,
// the summary step is folded into Tahap 3). PR-01: submission is blocked until the pickup area is chosen from the
// Mengantar address search.
export function DaftarPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(2)
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
  const [coords, setCoords] = useState(false)
  // HP PIC follows WhatsApp gerai until the applicant edits it (Sol R1).
  const [picPhoneEdited, setPicPhoneEdited] = useState(false)
  // Area combobox: the list is open while typing, `hl` is the keyboard-highlighted option.
  const [listOpen, setListOpen] = useState(false)
  const [hl, setHl] = useState(-1)
  const pickArea = (a: Area) => {
    setArea(a)
    setQuery(a.label)
    setListOpen(false)
    setHl(-1)
  }

  useEffect(() => {
    if (query.trim().length < 3) return
    let alive = true
    const t = setTimeout(() => {
      api<{ items: Area[] }>(`/onboarding/areas?q=${encodeURIComponent(query.trim())}`)
        .then((r) => {
          if (!alive) return
          // A new result set never keeps an index from the old one (`areas[hl]` is always defined).
          setAreas(r.items)
          setHl(-1)
        })
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
      const fe = ae?.body.field_errors ?? {}
      if (fe.slug || fe.businessName || fe.contactWhatsapp || fe.sellerEmail) setStep(2)
      if (fe.latitude || fe.longitude) setCoords(true)
    } finally {
      setPending(false)
    }
  }

  const showList = listOpen && !area && areas.length > 0
  const toPickup = (e: FormEvent) => {
    e.preventDefault()
    // Smart default: the pickup contact usually answers the gerai WhatsApp, until the applicant edits HP PIC.
    if (!picPhoneEdited) setPicPhone(whatsapp)
    setStep(3)
  }
  return (
    <AuthCard
      wide
      title={step === 2 ? "Identitas gerai" : "Titik jemput kurir"}
      progress={<RegisterSteps current={step} />}
      description={step === 2 ? "Nama dan alamat situs gerai, serta kontak untuk akun Mengantar." : "Lokasi tempat kurir menjemput paket dari gerai Anda."}
      corner={<Link to="/">Kembali</Link>}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      {step === 2 ? (
        <form className="flex flex-col gap-4" onSubmit={toPickup} noValidate>
          <TextField label="Nama gerai" name="businessName" value={businessName} onChange={(v) => { setBusinessName(v); if (!slug) setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 30)) }} error={fieldErrors.businessName} required maxLength={80} />
          <TextField label="Alamat gerai" name="slug" value={slug} onChange={(v) => setSlug(v.toLowerCase())} error={fieldErrors.slug} suffix=".geraimitra.com" required maxLength={30} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="WhatsApp gerai" name="whatsapp" inputMode="numeric" value={whatsapp} onChange={setWhatsapp} error={fieldErrors.contactWhatsapp} required />
            <TextField label="Email untuk akun Mengantar" name="sellerEmail" type="email" inputMode="email" value={sellerEmail} onChange={(v) => { setSellerEmail(v); setConsent(false) }} error={fieldErrors.sellerEmail} hint="Satu-satunya jalan masuk ke akun Mengantar." required />
          </div>
          <Button type="submit" size="lg">Lanjut ke Titik Jemput →</Button>
        </form>
      ) : null}
      {step === 3 ? (
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <Field data-invalid={fieldErrors.areaId ? true : undefined}>
            <FieldLabel htmlFor="area-search">Cari kelurahan / kecamatan / kode pos</FieldLabel>
            <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setListOpen(false) }}>
              <Input
                id="area-search"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showList}
                aria-controls="area-results"
                aria-activedescendant={showList && hl >= 0 ? `area-opt-${hl}` : undefined}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setArea(null)
                  setListOpen(true)
                  setHl(-1)
                  // Below 3 characters there is no search: stale results must not reopen on an arrow key.
                  if (e.target.value.trim().length < 3) setAreas([])
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    if (!areas.length || area) return
                    e.preventDefault()
                    setListOpen(true)
                    const n = areas.length
                    const next = e.key === "ArrowDown" ? (hl + 1) % n : hl <= 0 ? n - 1 : hl - 1
                    setHl(next)
                    document.getElementById(`area-opt-${next}`)?.scrollIntoView({ block: "nearest" })
                  } else if (e.key === "Enter" && showList && hl >= 0) {
                    e.preventDefault()
                    pickArea(areas[hl]!)
                  } else if (e.key === "Escape" && showList) {
                    e.preventDefault()
                    setListOpen(false)
                    setHl(-1)
                  }
                }}
                autoComplete="off"
                aria-describedby="area-help"
              />
              {showList ? (
                <ul id="area-results" role="listbox" aria-label="Hasil pencarian wilayah" className="absolute inset-x-0 top-full z-20 mt-1 flex max-h-52 flex-col divide-y overflow-y-auto rounded-lg border bg-white shadow-lg">
                  {areas.map((a, i) => (
                    <li
                      key={a.id}
                      id={`area-opt-${i}`}
                      role="option"
                      aria-selected={i === hl}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseMove={() => setHl(i)}
                      onClick={() => pickArea(a)}
                      className={`flex min-h-11 cursor-pointer items-center px-3 text-left text-base md:text-sm ${i === hl ? "bg-muted" : ""}`}
                    >
                      {a.label}{a.postalCode ? ` · ${a.postalCode}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <FieldDescription id="area-help">{area ? `Dipilih: ${area.label}` : fieldErrors.areaId ?? "Ketik minimal 3 huruf, lalu pilih dari daftar."}</FieldDescription>
          </Field>
          <TextField label="Alamat lengkap titik jemput" name="street" value={street} onChange={setStreet} required maxLength={300} />
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <TextField label="PIC penjemputan" name="picName" value={picName} onChange={setPicName} required maxLength={80} />
            <TextField label="HP PIC" name="picPhone" inputMode="numeric" value={picPhone} onChange={(v) => { setPicPhone(v); setPicPhoneEdited(true) }} error={fieldErrors.picPhone} required />
          </div>
          <details open={coords} onToggle={(e) => setCoords((e.target as HTMLDetailsElement).open)} className="group">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-[#64748B] hover:text-[#0F172A] md:min-h-9 [&::-webkit-details-marker]:hidden">
              <span aria-hidden className="mr-1 group-open:hidden">+</span><span aria-hidden className="mr-1 hidden group-open:inline">−</span>Titik koordinat peta (opsional)
            </summary>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <TextField label="Latitude" name="latitude" inputMode="decimal" value={lat} onChange={setLat} error={fieldErrors.latitude} hint="Contoh: -6.9456" />
              <TextField label="Longitude" name="longitude" inputMode="decimal" value={lng} onChange={setLng} error={fieldErrors.longitude} hint="Contoh: 107.5703" />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Dibutuhkan untuk penjemputan Pos Indonesia; bisa diisi nanti di Pengaturan › Profil Gerai.</p>
          </details>
          <CheckboxField id={consentId} align="start" checked={consent} onCheckedChange={setConsent}>
            <span className="text-sm leading-snug">Saya setuju GeraiExpress membuat akun seller Mengantar atas nama gerai saya dengan email <strong className="font-semibold [overflow-wrap:anywhere] text-[#0F172A]" data-seller-email>{sellerEmail}</strong>, dan saya menyetujui Syarat & Ketentuan serta Kebijakan Privasi Mengantar. Saldo dan COD gerai dipegang di akun Mengantar tersebut.</span>
          </CheckboxField>
          <div className="flex gap-3">
            <Button type="button" variant="outline" size="lg" onClick={() => setStep(2)} disabled={pending}>← Kembali</Button>
            <Button type="submit" size="lg" className="flex-1" disabled={pending || !consent || !area}>{pending ? "Mengirim…" : "Ajukan Gerai"}</Button>
          </div>
        </form>
      ) : null}
    </AuthCard>
  )
}
