import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Check, ChevronDown, Loader2, MapPin, Search, X } from "lucide-react"
import { AuthCard, FormAlert, WizardBar } from "../../components/auth/auth-card"
import { TextField } from "../../components/auth/text-field"
import { Button } from "../../components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../components/ui/field"
import { Input } from "../../components/ui/input"
import { Textarea } from "../../components/ui/textarea"
import { api, ApiError } from "../../lib/api"
import { sanitizePhone } from "../../lib/input"
import { CheckboxField } from "../../components/admin/page"

interface Area {
  id: string
  label: string
  postalCode: string | null
  subdistrict?: string | null
  district?: string | null
  city?: string | null
  province?: string | null
}

interface DistrictGroup {
  key: string
  district: string
  city: string
  province: string
  displayTitle: string
  displaySubtitle: string
  displayFull: string
  items: Area[]
  exactDistrictMatch: boolean
  matchedSubdistrict: string | null
  standalone: boolean
}

type Step = 2 | 3

const ACRONYMS = new Set(["DKI", "DI", "DIY", "NTB", "NTT", "NAD"])

/** Converts Mengantar ALL-CAPS place names (`JAWA TIMUR`, `DKI JAKARTA`) to natural Indonesian title case. */
function formatPlace(raw: string | null | undefined): string {
  const s = (raw ?? "").trim()
  if (!s) return ""
  if (s !== s.toUpperCase()) return s
  return s
    .split(/\s+/)
    .map((word) => {
      const bare = word.replace(/[^A-Z]/g, "")
      if (ACRONYMS.has(bare)) return word
      return word.toLowerCase().replace(/(^|[-/(])([a-z])/g, (_, pre: string, ch: string) => pre + ch.toUpperCase())
    })
    .join(" ")
}

function parseAreaParts(a: Area): { subdistrict: string; district: string; city: string; province: string; standalone: boolean } {
  if (a.district) {
    return {
      subdistrict: a.subdistrict?.trim() || a.label.split(",")[0]?.trim() || a.label,
      district: a.district.trim(),
      city: a.city?.trim() ?? "",
      province: a.province?.trim() ?? "",
      standalone: false,
    }
  }
  const parts = a.label.split(",").map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 4) {
    return { subdistrict: parts[0]!, district: parts[1]!, city: parts[2]!, province: parts.slice(3).join(", "), standalone: false }
  }
  return { subdistrict: a.label, district: a.label, city: "", province: "", standalone: true }
}

/** Builds a clean deduplicated keyword (`district + city`) for Mengantar `/address/search` without duplicate tokens. */
function districtLookupQuery(district: string, city: string): string {
  const seen = new Set<string>()
  const words: string[] = []
  for (const w of `${district} ${city}`.trim().split(/\s+/)) {
    const low = w.toLowerCase()
    if (!low || seen.has(low)) continue
    seen.add(low)
    words.push(w)
  }
  return words.join(" ")
}

function groupDistricts(items: Area[], rawQuery: string): DistrictGroup[] {
  const q = rawQuery.trim().toLowerCase()
  const tokens = q.split(/\s+/).filter(Boolean)
  const map = new Map<string, DistrictGroup>()
  for (const item of items) {
    const p = parseAreaParts(item)
    const key = p.standalone ? `item:${item.id}` : `${p.district}|${p.city}|${p.province}`.toLowerCase()
    const existing = map.get(key)
    if (existing) {
      if (!existing.items.some((x) => x.id === item.id)) existing.items.push(item)
      continue
    }
    const distDisplay = formatPlace(p.district)
    const cityDisplay = formatPlace(p.city)
    const provDisplay = formatPlace(p.province)
    const displaySubtitle = [cityDisplay, provDisplay].filter(Boolean).join(", ")
    const displayTitle = p.standalone ? item.label : `Kec. ${distDisplay}`
    const displayFull = p.standalone ? item.label : [displayTitle, displaySubtitle].filter(Boolean).join(", ")
    const distLower = p.district.toLowerCase()
    const subLower = p.subdistrict.toLowerCase()
    const exactDistrictMatch = !p.standalone && tokens.length > 0 && tokens.some((t) => distLower.includes(t))
    const matchedSubdistrict = !exactDistrictMatch && !p.standalone && tokens.some((t) => subLower.includes(t)) ? formatPlace(p.subdistrict) : null
    map.set(key, {
      key,
      district: p.district,
      city: p.city,
      province: p.province,
      displayTitle,
      displaySubtitle,
      displayFull,
      items: [item],
      exactDistrictMatch,
      matchedSubdistrict,
      standalone: p.standalone,
    })
  }
  const groups = Array.from(map.values())
  for (const g of groups) {
    g.items.sort((a, b) => formatPlace(parseAreaParts(a).subdistrict).localeCompare(formatPlace(parseAreaParts(b).subdistrict), "id"))
  }
  groups.sort((a, b) => {
    if (a.exactDistrictMatch !== b.exactDistrictMatch) return a.exactDistrictMatch ? -1 : 1
    if (b.items.length !== a.items.length) return b.items.length - a.items.length
    return a.displayFull.localeCompare(b.displayFull, "id")
  })
  return groups
}

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
  const [query, setQuery] = useState("")
  // Results belong to the exact trimmed query that produced them (Sol R2): while a new query is pending (debounce or
  // request in flight) the old options are gone, so ArrowDown + Enter can never pick a stale district.
  const [results, setResults] = useState<{ q: string; items: Area[]; state: "ok" | "error"; errMsg?: string }>({ q: "", items: [], state: "ok" })
  const [retryTick, setRetryTick] = useState(0)
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictGroup | null>(null)
  const [subdistricts, setSubdistricts] = useState<Area[]>([])
  const [loadingSubdistricts, setLoadingSubdistricts] = useState(false)
  const [subOpen, setSubOpen] = useState(false)
  const [subFilter, setSubFilter] = useState("")
  const [subHl, setSubHl] = useState(-1)
  const [area, setArea] = useState<Area | null>(null)
  const areaInputRef = useRef<HTMLInputElement>(null)
  const subBtnRef = useRef<HTMLButtonElement>(null)
  const subFilterRef = useRef<HTMLInputElement>(null)
  const subdistrictReqId = useRef(0)

  const trimmedQuery = query.trim()
  const districts = useMemo(
    () => (results.q === trimmedQuery ? groupDistricts(results.items, trimmedQuery) : []),
    [results.q, results.items, trimmedQuery],
  )
  const filteredSubdistricts = useMemo(() => {
    const f = subFilter.trim().toLowerCase()
    if (!f) return subdistricts
    return subdistricts.filter((s) => {
      const p = parseAreaParts(s)
      return p.subdistrict.toLowerCase().includes(f) || (s.postalCode ?? "").includes(f)
    })
  }, [subdistricts, subFilter])

  const searchingArea = !selectedDistrict && trimmedQuery.length >= 3 && results.q !== trimmedQuery
  const areaFetchError = !selectedDistrict && trimmedQuery.length >= 3 && results.q === trimmedQuery && results.state === "error"
  const [consent, setConsent] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const consentId = useId()
  // HP PIC follows WhatsApp gerai until the applicant edits it (Sol R1).
  const [picPhoneEdited, setPicPhoneEdited] = useState(false)
  // District combobox: the list is open while typing, `hl` is the keyboard-highlighted district option.
  const [listOpen, setListOpen] = useState(false)
  const [hl, setHl] = useState(-1)

  const pickSubdistrict = (chosen: Area) => {
    setArea(chosen)
    setSubOpen(false)
    setSubFilter("")
    setSubHl(-1)
  }

  const pickDistrict = (g: DistrictGroup) => {
    setSelectedDistrict(g)
    setQuery(g.displayFull)
    setSubdistricts(g.items)
    setListOpen(false)
    setHl(-1)
    setSubOpen(false)
    setSubFilter("")
    setSubHl(-1)
    // Auto-select immediately when the district has a single subdistrict (e.g. exact postal code search or single-item mock).
    if (g.items.length === 1) {
      setArea(g.items[0]!)
    } else {
      setArea(null)
    }
    // Load the complete kelurahan list for this exact (district, city, province) from Mengantar so broad searches never miss kelurahan.
    if (!g.standalone && g.district && g.city) {
      const reqId = ++subdistrictReqId.current
      setLoadingSubdistricts(true)
      api<{ items: Area[] }>(`/onboarding/areas?q=${encodeURIComponent(districtLookupQuery(g.district, g.city))}`)
        .then((r) => {
          if (subdistrictReqId.current !== reqId) return
          const dKey = g.district.toLowerCase()
          const cKey = g.city.toLowerCase()
          const pKey = g.province.toLowerCase()
          const merged = new Map<string, Area>()
          for (const item of [...g.items, ...r.items]) {
            const p = parseAreaParts(item)
            if (p.district.toLowerCase() === dKey && (!cKey || p.city.toLowerCase() === cKey) && (!pKey || !p.province || p.province.toLowerCase() === pKey)) {
              merged.set(item.id, item)
            }
          }
          const next = Array.from(merged.values()).sort((a, b) =>
            formatPlace(parseAreaParts(a).subdistrict).localeCompare(formatPlace(parseAreaParts(b).subdistrict), "id"),
          )
          if (next.length > 0) {
            setSubdistricts(next)
            if (next.length === 1) setArea((cur) => cur ?? next[0]!)
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (subdistrictReqId.current === reqId) setLoadingSubdistricts(false)
        })
    } else {
      setLoadingSubdistricts(false)
    }
  }

  const clearDistrict = () => {
    subdistrictReqId.current++
    setSelectedDistrict(null)
    setSubdistricts([])
    setLoadingSubdistricts(false)
    setSubOpen(false)
    setSubFilter("")
    setSubHl(-1)
    setArea(null)
    setQuery("")
    setResults({ q: "", items: [], state: "ok" })
    setListOpen(false)
    setHl(-1)
    areaInputRef.current?.focus()
  }

  // Prefill rejected application so the applicant can fix fields without re-typing everything.
  useEffect(() => {
    let alive = true
    api<{
      application: {
        state: string
        business_name: string
        slug: string
        decision_reason: string | null
        contact_whatsapp?: string | null
        seller_email?: string | null
        outlet?: { picName?: string; picPhone?: string; areaId?: string; areaLabel?: string; streetAddress?: string; postalCode?: string | null } | null
      } | null
    }>("/onboarding/status")
      .then((d) => {
        if (!alive || d.application?.state !== "rejected") return
        const a = d.application
        setRejectNote(a.decision_reason || "Periksa kembali data gerai lalu ajukan ulang.")
        setBusinessName((cur) => cur || a.business_name)
        setSlug((cur) => {
          if (cur) return cur
          setSlugEdited(a.slug !== slugify(a.business_name))
          return a.slug
        })
        if (a.contact_whatsapp) setWhatsapp((cur) => cur || a.contact_whatsapp!)
        if (a.seller_email) setSellerEmail((cur) => cur || a.seller_email!)
        const o = a.outlet
        if (o) {
          if (o.picName) setPicName((cur) => cur || o.picName!)
          if (o.picPhone) {
            setPicPhone((cur) => cur || o.picPhone!)
            if (o.picPhone !== a.contact_whatsapp) setPicPhoneEdited(true)
          }
          if (o.streetAddress) setStreet((cur) => cur || o.streetAddress!)
          if (o.areaId && o.areaLabel) {
            const prefilled: Area = { id: o.areaId, label: o.areaLabel, postalCode: o.postalCode ?? null }
            const [g] = groupDistricts([prefilled], "")
            setArea((cur) => cur ?? prefilled)
            if (g) {
              setSelectedDistrict((cur) => cur ?? g)
              setSubdistricts((cur) => (cur.length ? cur : [prefilled]))
              setQuery((cur) => cur || g.displayFull)
            } else {
              setQuery((cur) => cur || o.areaLabel!)
            }
          }
        }
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3 || selectedDistrict) return
    let alive = true
    const t = setTimeout(() => {
      api<{ items: Area[] }>(`/onboarding/areas?q=${encodeURIComponent(q)}`)
        .then((r) => {
          if (!alive) return
          // A new result set never keeps an index from the old one (`districts[hl]` is always defined).
          setResults({ q, items: r.items, state: "ok" })
          setHl(-1)
        })
        .catch((err) => {
          if (!alive) return
          const errMsg = err instanceof ApiError ? err.body.message : "Pencarian wilayah gagal. Periksa koneksi lalu coba lagi."
          setResults({ q, items: [], state: "error", errMsg })
        })
    }, 300)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query, selectedDistrict, retryTick])

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
          outlet: { name: businessName, picName, picPhone, areaId: area?.id ?? "", areaLabel: area?.label ?? "", streetAddress: street, postalCode: area?.postalCode ?? null, latitude: null, longitude: null },
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
    } finally {
      setPending(false)
    }
  }

  const showList = listOpen && !selectedDistrict && districts.length > 0
  const showEmptyDropdown = listOpen && !selectedDistrict && trimmedQuery.length >= 3 && !areaFetchError && (searchingArea || (results.q === trimmedQuery && districts.length === 0))
  // Keep the active option in view once React has rendered the (re)opened list (Sol R2; like the shell's ⌘K list).
  useEffect(() => {
    if (showList && hl >= 0) document.getElementById(`area-opt-${hl}`)?.scrollIntoView({ block: "nearest" })
  }, [showList, hl])
  useEffect(() => {
    if (subOpen && subHl >= 0) document.getElementById(`sub-opt-${subHl}`)?.scrollIntoView({ block: "nearest" })
  }, [subOpen, subHl])
  useEffect(() => {
    if (subOpen && subdistricts.length > 7) subFilterRef.current?.focus()
  }, [subOpen, subdistricts.length])

  const toPickup = (e: FormEvent) => {
    e.preventDefault()
    const fe: Record<string, string> = {}
    if (businessName.trim().length < 2) fe.businessName = "Nama gerai wajib diisi."
    if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(slug.trim())) fe.slug = "Alamat gerai 3–30 karakter (huruf kecil, angka, tanda hubung)."
    if (!/^(?:\+?62|0)8\d{8,12}$/.test(whatsapp.replace(/[\s\-().]/g, ""))) fe.contactWhatsapp = "Masukkan nomor WhatsApp Indonesia (contoh: 0812xxxxxxxx)."
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i.test(sellerEmail.trim())) fe.sellerEmail = "Masukkan alamat email yang valid."
    if (Object.keys(fe).length) {
      setFieldErrors(fe)
      if (fe.slug) setSlugOpen(true)
      return
    }
    setFieldErrors({})
    setError(null)
    // Smart default: the pickup contact usually answers the gerai WhatsApp, until the applicant edits HP PIC.
    if (!picPhoneEdited) setPicPhone(whatsapp)
    setStep(3)
  }

  const selectedSubdistrictLabel = area ? formatPlace(parseAreaParts(area).subdistrict) : ""

  return (
    <AuthCard
      switcher="daftar"
      slug={slug}
      title={step === 2 ? "Identitas gerai" : "Titik jemput kurir"}
      progress={<WizardBar current={step} onBack={step === 3 && !pending ? () => setStep(2) : undefined} />}
      description={step === 2 ? "Nama dan alamat situs gerai, serta kontak untuk akun Mengantar." : "Tempat kurir menjemput paket gerai Anda."}
    >
      {rejectNote && !error ? <FormAlert tone="warn">Pengajuan sebelumnya perlu diperbaiki: {rejectNote}</FormAlert> : null}
      {error ? <FormAlert>{error}</FormAlert> : null}
      {step === 2 ? (
        <form className="flex flex-col gap-4" onSubmit={toPickup} noValidate>
          <div className="flex flex-col gap-2">
            <TextField label="Nama gerai" name="businessName" placeholder="Contoh: Gerai Berkah Jaya" value={businessName} onChange={(v) => { setBusinessName(v); if (!slugEdited) setSlug(slugify(v)) }} error={fieldErrors.businessName} required maxLength={80} />
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
                <TextField label="Alamat gerai" name="slug" placeholder="gerai-berkah-jaya" value={slug} onChange={(v) => { setSlug(v.toLowerCase()); setSlugEdited(true) }} error={fieldErrors.slug} suffix=".geraimitra.com" required maxLength={30} />
              </div>
            ) : null}
          </div>
          <TextField label="WhatsApp gerai" name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="08xx-xxxx-xxxx" value={whatsapp} onChange={(v) => setWhatsapp(sanitizePhone(v))} error={fieldErrors.contactWhatsapp} required />
          <TextField label="Email untuk akun Mengantar" name="sellerEmail" type="email" inputMode="email" placeholder="gerai@gmail.com" value={sellerEmail} onChange={(v) => { setSellerEmail(v); setConsent(false) }} error={fieldErrors.sellerEmail} hint="Satu-satunya jalan masuk ke akun Mengantar." required />
          <Button type="submit" size="lg">Lanjut ke Titik Jemput →</Button>
        </form>
      ) : null}
      {step === 3 ? (
        <form className="flex flex-col gap-3.5" onSubmit={submit} noValidate>
          <Field data-invalid={fieldErrors.areaId || areaFetchError ? true : undefined}>
            <FieldLabel htmlFor="area-search">Kecamatan</FieldLabel>
            <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setListOpen(false) }}>
              <Input
                ref={areaInputRef}
                id="area-search"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showList}
                aria-controls="area-results"
                aria-activedescendant={showList && hl >= 0 ? `area-opt-${hl}` : undefined}
                aria-invalid={fieldErrors.areaId || areaFetchError ? true : undefined}
                value={query}
                className="pr-9"
                onFocus={() => {
                  if (!selectedDistrict && (districts.length > 0 || trimmedQuery.length >= 3)) setListOpen(true)
                }}
                onChange={(e) => {
                  subdistrictReqId.current++
                  setQuery(e.target.value)
                  setSelectedDistrict(null)
                  setSubdistricts([])
                  setLoadingSubdistricts(false)
                  setSubOpen(false)
                  setSubFilter("")
                  setArea(null)
                  setListOpen(true)
                  setHl(-1)
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    if (!districts.length || selectedDistrict) return
                    e.preventDefault()
                    setListOpen(true)
                    const n = districts.length
                    const next = e.key === "ArrowDown" ? (hl + 1) % n : hl <= 0 ? n - 1 : hl - 1
                    setHl(next)
                  } else if (e.key === "Enter" && showList && hl >= 0) {
                    e.preventDefault()
                    pickDistrict(districts[hl]!)
                  } else if (e.key === "Escape" && (showList || showEmptyDropdown)) {
                    e.preventDefault()
                    setListOpen(false)
                    setHl(-1)
                  }
                }}
                autoComplete="off"
                placeholder="Ketik nama kecamatan, mis. Coblong atau Sukodono"
                aria-describedby="area-help"
              />
              {searchingArea ? (
                <span aria-hidden className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                </span>
              ) : selectedDistrict || query ? (
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={clearDistrict}
                  aria-label="Hapus pilihan kecamatan"
                  className="absolute inset-y-0 right-1 flex w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              ) : null}
              {showList ? (
                <ul
                  id="area-results"
                  role="listbox"
                  aria-label="Hasil pencarian kecamatan"
                  className="absolute inset-x-0 top-full z-30 mt-1.5 flex max-h-56 flex-col divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl ring-1 ring-slate-900/5"
                >
                  {districts.map((g, i) => (
                    <li
                      key={g.key}
                      id={`area-opt-${i}`}
                      role="option"
                      aria-selected={i === hl}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseMove={() => setHl(i)}
                      onClick={() => pickDistrict(g)}
                      className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${i === hl ? "bg-[#EEF4FF] text-[#0F172A]" : "hover:bg-slate-50"}`}
                    >
                      <span className="flex min-w-0 items-start gap-2">
                        <MapPin className={`mt-0.5 size-4 shrink-0 ${i === hl ? "text-[#0B4FE3]" : "text-slate-400"}`} aria-hidden />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-semibold text-[#0F172A]">{g.displayTitle}</span>
                          {g.displaySubtitle ? <span className="truncate text-xs text-slate-500">{g.displaySubtitle}</span> : null}
                        </span>
                      </span>
                      {!g.standalone ? (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {g.matchedSubdistrict ? `Kel. ${g.matchedSubdistrict}` : `${g.items.length} kel.`}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : showEmptyDropdown ? (
                <div className="absolute inset-x-0 top-full z-30 mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-500 shadow-xl ring-1 ring-slate-900/5">
                  {searchingArea ? (
                    <>
                      <Loader2 className="size-4 shrink-0 animate-spin text-[#0B4FE3]" aria-hidden />
                      <span>Mencari kecamatan…</span>
                    </>
                  ) : (
                    <span>Kecamatan tidak ditemukan. Coba ketik nama kecamatan lain.</span>
                  )}
                </div>
              ) : null}
            </div>
            {!area && fieldErrors.areaId ? (
              <FieldError id="area-help">{fieldErrors.areaId}</FieldError>
            ) : areaFetchError ? (
              <FieldError id="area-help" className="flex flex-wrap items-center gap-x-2">
                <span>{results.errMsg ?? "Pencarian wilayah gagal. Periksa koneksi lalu coba lagi."}</span>
                <button
                  type="button"
                  onClick={() => {
                    setResults({ q: "", items: [], state: "ok" })
                    setListOpen(true)
                    setRetryTick((n) => n + 1)
                  }}
                  className="font-semibold underline underline-offset-2"
                >
                  Coba lagi
                </button>
              </FieldError>
            ) : (
              <FieldDescription id="area-help">
                {area
                  ? `Dipilih: ${formatPlace(area.label)}`
                  : selectedDistrict
                    ? loadingSubdistricts
                      ? "Memuat daftar kelurahan dari Mengantar…"
                      : "Pilih kelurahan di bawah — kode pos akan terisi otomatis."
                    : searchingArea
                      ? "Mencari kecamatan…"
                      : trimmedQuery.length >= 3 && results.q === trimmedQuery && districts.length === 0
                        ? "Kecamatan tidak ditemukan. Coba ketik nama kecamatan lain."
                        : "Ketik minimal 3 huruf, pilih kecamatan, lalu pilih kelurahan."}
              </FieldDescription>
            )}
          </Field>
          {selectedDistrict ? (
            <div className="grid grid-cols-[1fr_7.25rem] gap-3">
              <Field>
                <FieldLabel htmlFor="area-subdistrict">Kelurahan / Desa</FieldLabel>
                <div
                  className="relative"
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                      setSubOpen(false)
                      setSubFilter("")
                      setSubHl(-1)
                    }
                  }}
                >
                  <button
                    ref={subBtnRef}
                    id="area-subdistrict"
                    type="button"
                    role="combobox"
                    aria-haspopup="listbox"
                    aria-expanded={subOpen}
                    aria-controls="subdistrict-results"
                    aria-activedescendant={subOpen && subHl >= 0 ? `sub-opt-${subHl}` : undefined}
                    disabled={loadingSubdistricts && subdistricts.length === 0}
                    onClick={() => {
                      setSubOpen((open) => {
                        const next = !open
                        if (next) {
                          const idx = area ? subdistricts.findIndex((s) => s.id === area.id) : 0
                          setSubHl(idx >= 0 ? idx : 0)
                        } else {
                          setSubFilter("")
                          setSubHl(-1)
                        }
                        return next
                      })
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                        e.preventDefault()
                        if (!subOpen) {
                          setSubOpen(true)
                          setSubHl(0)
                          return
                        }
                        const n = filteredSubdistricts.length
                        if (!n) return
                        setSubHl(e.key === "ArrowDown" ? (subHl + 1) % n : subHl <= 0 ? n - 1 : subHl - 1)
                      } else if (e.key === "Enter" && subOpen && subHl >= 0 && filteredSubdistricts[subHl]) {
                        e.preventDefault()
                        pickSubdistrict(filteredSubdistricts[subHl]!)
                      } else if (e.key === "Escape" && subOpen) {
                        e.preventDefault()
                        setSubOpen(false)
                        setSubFilter("")
                        setSubHl(-1)
                      }
                    }}
                    className={`flex h-11 md:h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-white px-2.5 text-left text-base md:text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-70 ${area ? "font-medium text-foreground" : "text-muted-foreground"}`}
                  >
                    <span className="truncate">
                      {selectedSubdistrictLabel
                        ? selectedSubdistrictLabel
                        : loadingSubdistricts && subdistricts.length === 0
                          ? "Memuat kelurahan…"
                          : `Pilih kelurahan (${subdistricts.length})`}
                    </span>
                    {loadingSubdistricts ? (
                      <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <ChevronDown aria-hidden className={`size-4 shrink-0 text-muted-foreground transition-transform ${subOpen ? "rotate-180" : ""}`} />
                    )}
                  </button>
                  {subOpen ? (
                    <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/5">
                      {subdistricts.length > 7 ? (
                        <div className="relative border-b border-slate-100 p-1.5">
                          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-slate-400" />
                          <input
                            ref={subFilterRef}
                            type="text"
                            value={subFilter}
                            onChange={(e) => {
                              setSubFilter(e.target.value)
                              setSubHl(0)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                                e.preventDefault()
                                const n = filteredSubdistricts.length
                                if (!n) return
                                setSubHl(e.key === "ArrowDown" ? (subHl + 1) % n : subHl <= 0 ? n - 1 : subHl - 1)
                              } else if (e.key === "Enter" && subHl >= 0 && filteredSubdistricts[subHl]) {
                                e.preventDefault()
                                pickSubdistrict(filteredSubdistricts[subHl]!)
                                subBtnRef.current?.focus()
                              } else if (e.key === "Escape") {
                                e.preventDefault()
                                setSubOpen(false)
                                setSubFilter("")
                                setSubHl(-1)
                                subBtnRef.current?.focus()
                              }
                            }}
                            placeholder="Filter kelurahan atau kode pos…"
                            aria-label="Filter daftar kelurahan"
                            className="h-9 md:h-8 w-full rounded-lg bg-slate-50 pr-2.5 pl-8 text-base md:text-xs text-foreground outline-none placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-ring/40"
                          />
                        </div>
                      ) : null}
                      <ul id="subdistrict-results" role="listbox" aria-label="Daftar kelurahan" className="flex max-h-52 flex-col divide-y divide-slate-100 overflow-y-auto py-1">
                        {filteredSubdistricts.length === 0 ? (
                          <li className="px-3 py-2.5 text-sm text-slate-500">Kelurahan tidak cocok.</li>
                        ) : (
                          filteredSubdistricts.map((s, i) => {
                            const p = parseAreaParts(s)
                            const selected = area?.id === s.id
                            return (
                              <li
                                key={s.id}
                                id={`sub-opt-${i}`}
                                role="option"
                                aria-selected={selected}
                                onMouseDown={(e) => e.preventDefault()}
                                onMouseMove={() => setSubHl(i)}
                                onClick={() => pickSubdistrict(s)}
                                className={`flex min-h-11 md:min-h-9 cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors ${i === subHl ? "bg-[#EEF4FF] text-[#0F172A]" : selected ? "bg-slate-50 font-medium text-[#0F172A]" : "hover:bg-slate-50"}`}
                              >
                                <span className="truncate">{formatPlace(p.subdistrict)}</span>
                                <span className="flex shrink-0 items-center gap-1.5">
                                  {s.postalCode ? <span className="font-mono text-xs tabular-nums text-slate-500">{s.postalCode}</span> : null}
                                  {selected ? <Check className="size-4 text-[#0B4FE3]" aria-hidden /> : null}
                                </span>
                              </li>
                            )
                          })
                        )}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="area-postal">Kode pos</FieldLabel>
                <Input
                  id="area-postal"
                  value={area?.postalCode ?? ""}
                  readOnly
                  placeholder="Otomatis"
                  tabIndex={-1}
                  className={area?.postalCode ? "border-emerald-200 bg-emerald-50/60 font-mono font-semibold tabular-nums text-emerald-950" : "bg-slate-50 font-mono tabular-nums text-slate-500"}
                />
              </Field>
            </div>
          ) : null}
          <Field data-invalid={fieldErrors.streetAddress ? true : undefined}>
            <FieldLabel htmlFor="daftar-street">Alamat lengkap titik jemput</FieldLabel>
            <Textarea
              id="daftar-street"
              name="street"
              rows={2}
              className="min-h-14"
              placeholder="Jl. Merdeka No. 12, RT 02/RW 05 (dekat patokan)"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              required
              maxLength={200}
              aria-invalid={fieldErrors.streetAddress ? true : undefined}
            />
            {fieldErrors.streetAddress ? <FieldError>{fieldErrors.streetAddress}</FieldError> : null}
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <TextField label="PIC penjemputan" name="picName" placeholder="Nama penanggung jawab" value={picName} onChange={setPicName} error={fieldErrors.picName} required maxLength={80} />
            <TextField label="HP PIC" name="picPhone" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="08xx-xxxx-xxxx" value={picPhone} onChange={(v) => { setPicPhone(sanitizePhone(v)); setPicPhoneEdited(true) }} error={fieldErrors.picPhone} required />
          </div>
          <CheckboxField id={consentId} align="start" checked={consent} onCheckedChange={setConsent}>
            <span className="text-sm leading-snug">Saya setuju GeraiExpress membuatkan akun seller Mengantar untuk gerai ini dengan email <strong className="font-semibold [overflow-wrap:anywhere] text-[#0F172A]" data-seller-email>{sellerEmail}</strong>, serta menyetujui Syarat & Ketentuan dan Kebijakan Privasi Mengantar. Saldo dan COD gerai dipegang di akun tersebut.</span>
          </CheckboxField>
          <Button type="submit" size="lg" disabled={pending || !consent || !area}>{pending ? "Mengirim…" : "Ajukan Gerai"}</Button>
        </form>
      ) : null}
    </AuthCard>
  )
}
