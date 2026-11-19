import { useEffect, useId, useState, type FormEvent } from "react"
import { useNavigate } from "@tanstack/react-router"
import { AuthCard, FormAlert, WizardBar } from "../../components/auth/auth-card"
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

/** `Gerai Berkah Jaya` → `gerai-berkah-jaya` (the 3–30 char `*.geraimitra.com` rule; the server stays the judge). */
function slugify(name: string): string {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 30).replace(/-+$/, "")
}

// Outlet application after the account (DEC-250 wizard `Langkah 2 / 3` and `3 / 3`; each step fits one viewport,
// the summary step is folded into Tahap 3). PR-01: submission is blocked until the pickup area is chosen from the
// Mengantar address search.
export function DaftarPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(2)
  const [businessName, setBusinessName] = useState("")
  const [slug, setSlug] = useState("")
  // The address follows the name until the applicant opens `Ubah` (or the server rejects it) and types their own.
  const [slugOpen, setSlugOpen] = useState(false)
  const [slugEdited, setSlugEdited] = useState(false)
  const [whatsapp, setWhatsapp] = useState("")
  const [sellerEmail, setSellerEmail] = useState("")
  const [picName, setPicName] = useState("")
  const [picPhone, setPicPhone] = useState("")
  const [street, setStreet] = useState("")
  const [lat, setLat] = useState("")
  const [lng, setLng] = useState("")
  const [query, setQuery] = useState("")
  // Results belong to the exact trimmed query that produced them (Sol R2): while a new query is pending (debounce or
  // request in flight) the old options are gone, so ArrowDown + Enter can never pick a stale area.
  const [results, setResults] = useState<{ q: string; items: Area[] }>({ q: "", items: [] })
  const areas = results.q === query.trim() ? results.items : []
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
    const q = query.trim()
    if (q.length < 3) return
    let alive = true
    const t = setTimeout(() => {
      api<{ items: Area[] }>(`/onboarding/areas?q=${encodeURIComponent(q)}`)
        .then((r) => {
          if (!alive) return
          // A new result set never keeps an index from the old one (`areas[hl]` is always defined).
          setResults({ q, items: r.items })
          setHl(-1)
        })
        .catch(() => alive && setResults({ q, items: [] }))
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
      if (fe.slug) setSlugOpen(true)
      if (fe.latitude || fe.longitude) setCoords(true)
    } finally {
      setPending(false)
    }
  }

  const showList = listOpen && !area && areas.length > 0
  // Keep the active option in view once React has rendered the (re)opened list (Sol R2; like the shell's ⌘K list).
  useEffect(() => {
    if (showList && hl >= 0) document.getElementById(`area-opt-${hl}`)?.scrollIntoView({ block: "nearest" })
  }, [showList, hl])
  const toPickup = (e: FormEvent) => {
    e.preventDefault()
    // Smart default: the pickup contact usually answers the gerai WhatsApp, until the applicant edits HP PIC.
    if (!picPhoneEdited) setPicPhone(whatsapp)
    setStep(3)
  }
  return (
    <AuthCard
      switcher="daftar"
      slug={slug}
      title={step === 2 ? "Identitas gerai" : "Titik jemput kurir"}
      progress={<WizardBar current={step} onBack={step === 3 && !pending ? () => setStep(2) : undefined} />}
      description={step === 2 ? "Nama dan alamat situs gerai, serta kontak untuk akun Mengantar." : "Tempat kurir menjemput paket gerai Anda."}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      {step === 2 ? (
        <form className="flex flex-col gap-4" onSubmit={toPickup} noValidate>
          <div className="flex flex-col gap-2">
            <TextField label="Nama gerai" name="businessName" value={businessName} onChange={(v) => { setBusinessName(v); if (!slugEdited) setSlug(slugify(v)) }} error={fieldErrors.businessName} required maxLength={80} />
            {/* DEC-250: the live address pill; `Ubah` (or a server slug error) opens the editor. */}
            <div data-domain-pill className="flex items-center gap-2 rounded-2xl bg-[#F4F6FA] py-1.5 pr-1.5 pl-3 sm:gap-3 sm:pl-3.5">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-mono text-xs font-semibold [overflow-wrap:anywhere] text-[#0F172A] sm:text-[13px]">{slug || "namagerai"}.geraimitra.com</span>
                <span className={`text-xs font-semibold ${!slugEdited && slug ? "text-[#15803D]" : "text-[#64748B]"}`}>{slugEdited ? "Diubah manual" : slug ? "✓ Otomatis" : "Diisi dari nama gerai"}</span>
              </span>
              <button type="button" aria-expanded={slugOpen || Boolean(fieldErrors.slug)} aria-controls="slug-editor" onClick={() => setSlugOpen((v) => !v)} className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-white px-3 text-[13px] sm:px-4 font-bold text-[#0B4FE3] shadow-[0_1px_2px_rgb(15_23_42/0.08)] hover:bg-[#EEF4FF] md:min-h-9">
                Ubah
              </button>
            </div>
            {slugOpen || fieldErrors.slug ? (
              <div id="slug-editor">
                <TextField label="Alamat gerai" name="slug" value={slug} onChange={(v) => { setSlug(v.toLowerCase()); setSlugEdited(true) }} error={fieldErrors.slug} suffix=".geraimitra.com" required maxLength={30} />
              </div>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="WhatsApp gerai" name="whatsapp" inputMode="numeric" value={whatsapp} onChange={setWhatsapp} error={fieldErrors.contactWhatsapp} required />
            <TextField label="Email untuk akun Mengantar" name="sellerEmail" type="email" inputMode="email" value={sellerEmail} onChange={(v) => { setSellerEmail(v); setConsent(false) }} error={fieldErrors.sellerEmail} hint="Satu-satunya jalan masuk ke akun Mengantar." required />
          </div>
          <Button type="submit" size="lg">Lanjut ke Titik Jemput →</Button>
        </form>
      ) : null}
      {step === 3 ? (
        <form className="flex flex-col gap-3.5" onSubmit={submit} noValidate>
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
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    if (!areas.length || area) return
                    e.preventDefault()
                    setListOpen(true)
                    const n = areas.length
                    const next = e.key === "ArrowDown" ? (hl + 1) % n : hl <= 0 ? n - 1 : hl - 1
                    setHl(next)
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
            <span className="text-sm leading-snug">Saya setuju GeraiExpress membuatkan akun seller Mengantar untuk gerai ini dengan email <strong className="font-semibold [overflow-wrap:anywhere] text-[#0F172A]" data-seller-email>{sellerEmail}</strong>, serta menyetujui Syarat & Ketentuan dan Kebijakan Privasi Mengantar. Saldo dan COD gerai dipegang di akun tersebut.</span>
          </CheckboxField>
          <Button type="submit" size="lg" disabled={pending || !consent || !area}>{pending ? "Mengirim…" : "Ajukan Gerai"}</Button>
        </form>
      ) : null}
    </AuthCard>
  )
}
