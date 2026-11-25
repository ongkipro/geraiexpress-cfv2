import { useEffect, useId, useMemo, useRef, useState } from "react"
import { CheckCircle2, ChevronDown, Loader2, MapPin, Search, X } from "lucide-react"
import { Field, FieldDescription, FieldError, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { api, ApiError } from "../lib/api"

// Mengantar area search (KV-cached server side, TASK-206). The value is only set by choosing a row from the results.
export interface Area {
  id: string
  label: string
  postalCode: string | null
  subdistrict?: string | null
  district?: string | null
  city?: string | null
  province?: string | null
}

const ACRONYMS = new Set(["DKI", "DI", "DIY", "NTB", "NTT", "NAD"])
export function formatPlace(raw: string | null | undefined): string {
  const s = (raw ?? "").trim()
  if (!s || s !== s.toUpperCase()) return s
  return s
    .split(/\s+/)
    .map((w) => (ACRONYMS.has(w.replace(/[^A-Z]/g, "")) ? w : w.toLowerCase().replace(/(^|[-/(])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase())))
    .join(" ")
}

function splitLabel(a: Area): { primary: string; secondary: string } {
  if (a.subdistrict && a.district) {
    return {
      primary: `${formatPlace(a.subdistrict)}, ${formatPlace(a.district)}`,
      secondary: [formatPlace(a.city), formatPlace(a.province)].filter(Boolean).join(", "),
    }
  }
  const parts = a.label.split(",").map((p) => formatPlace(p)).filter(Boolean)
  if (parts.length >= 3) return { primary: parts.slice(0, 2).join(", "), secondary: parts.slice(2).join(", ") }
  return { primary: formatPlace(a.label), secondary: "" }
}

/** Extract district/subdistrict metadata even when an Area only carries a comma-separated `label`. */
function partsOf(a: Area): { subdistrict: string; district: string; city: string; province: string } {
  if (a.subdistrict || a.district) {
    return {
      subdistrict: formatPlace(a.subdistrict),
      district: formatPlace(a.district),
      city: formatPlace(a.city),
      province: formatPlace(a.province),
    }
  }
  const p = a.label.split(",").map((x) => formatPlace(x)).filter(Boolean)
  if (p.length >= 4) return { subdistrict: p[0]!, district: p[1]!, city: p[2]!, province: p.slice(3).join(", ") }
  if (p.length === 3) return { subdistrict: p[0]!, district: p[1]!, city: p[2]!, province: "" }
  if (p.length === 2) return { subdistrict: p[0]!, district: p[1]!, city: "", province: "" }
  return { subdistrict: p[0] ?? "", district: p[0] ?? "", city: "", province: "" }
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ")

interface DistrictGroup {
  key: string
  district: string
  city: string
  province: string
  items: Area[]
}

function groupByDistrict(items: Area[]): DistrictGroup[] {
  const map = new Map<string, DistrictGroup>()
  for (const a of items) {
    const p = partsOf(a)
    const district = p.district || p.subdistrict
    const key = `${norm(district)}|${norm(p.city)}|${norm(p.province)}`
    let g = map.get(key)
    if (!g) {
      g = { key, district, city: p.city, province: p.province, items: [] }
      map.set(key, g)
    }
    if (!g.items.some((x) => x.id === a.id)) g.items.push(a)
  }
  return [...map.values()]
}

function districtDisplay(d: { district: string; city: string; province: string }): string {
  return [d.district, d.city].filter(Boolean).join(", ")
}

export function AreaPicker({ label, value, onChange, error, endpoint = "/areas" }: { label: string; value: Area | null; onChange: (a: Area | null) => void; error?: string; endpoint?: string }) {
  const [query, setQuery] = useState(value ? formatPlace(value.label) : "")
  const [prevValueId, setPrevValueId] = useState<string | null>(value?.id ?? null)
  const [res, setRes] = useState<{ q: string; items: Area[]; err: string | null }>({ q: "", items: [], err: null })
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()

  // Sync external selection changes (e.g. picking a recipient or clearing destination) into the input box.
  const valueId = value?.id ?? null
  if (valueId !== prevValueId) {
    setPrevValueId(valueId)
    setQuery(value ? formatPlace(value.label) : "")
    setOpen(false)
    setCursor(-1)
  }

  const trimmed = query.trim()
  const activeSearch = !value && trimmed.length >= 3
  const areas = activeSearch && res.q === trimmed ? res.items : []
  const loading = activeSearch && res.q !== trimmed
  const searched = activeSearch && res.q === trimmed
  const fetchError = activeSearch && res.q === trimmed ? res.err : null
  const showList = open && !value && areas.length > 0

  useEffect(() => {
    if (!activeSearch) return
    let alive = true
    const t = setTimeout(() => {
      api<{ items: Area[] }>(`${endpoint}?q=${encodeURIComponent(trimmed)}`)
        .then((r) => {
          if (!alive) return
          setRes({ q: trimmed, items: r.items, err: null })
          setCursor(r.items.length ? 0 : -1)
        })
        .catch((err) => {
          if (!alive) return
          setRes({ q: trimmed, items: [], err: err instanceof ApiError ? err.body.message : "Pencarian wilayah gagal. Coba lagi." })
          setCursor(-1)
        })
    }, 300)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [activeSearch, trimmed, endpoint])

  useEffect(() => {
    if (showList && cursor >= 0) document.getElementById(`${id}-opt-${cursor}`)?.scrollIntoView({ block: "nearest" })
  }, [showList, cursor, id])

  function choose(a: Area) {
    setPrevValueId(a.id)
    onChange(a)
    setQuery(formatPlace(a.label))
    setOpen(false)
    setCursor(-1)
  }

  function clear() {
    setPrevValueId(null)
    onChange(null)
    setQuery("")
    setOpen(false)
    setCursor(-1)
    inputRef.current?.focus()
  }

  return (
    <Field data-invalid={error || fetchError ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div
        className="relative"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
        }}
      >
        <Input
          ref={inputRef}
          id={id}
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={`${id}-list`}
          value={query}
          className="pr-9"
          onFocus={() => {
            if (!value && areas.length > 0) setOpen(true)
          }}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            if (value) {
              setPrevValueId(null)
              onChange(null)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              if (!areas.length || value) return
              e.preventDefault()
              setOpen(true)
              setCursor((c) => (c + 1) % areas.length)
            } else if (e.key === "ArrowUp") {
              if (!areas.length || value) return
              e.preventDefault()
              setOpen(true)
              setCursor((c) => (c <= 0 ? areas.length - 1 : c - 1))
            } else if (e.key === "Enter" && showList && cursor >= 0 && areas[cursor]) {
              e.preventDefault()
              choose(areas[cursor]!)
            } else if (e.key === "Escape" && open) {
              e.preventDefault()
              setOpen(false)
              setCursor(-1)
            }
          }}
          autoComplete="off"
          aria-describedby={`${id}-help`}
          aria-invalid={error || fetchError ? true : undefined}
        />
        {loading ? (
          <span aria-hidden className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </span>
        ) : value || query ? (
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
            aria-label="Hapus pilihan wilayah"
            className="absolute inset-y-0 right-1 flex w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        ) : null}
        {showList ? (
          <ul
            id={`${id}-list`}
            className="absolute inset-x-0 top-full z-40 mt-1.5 flex max-h-60 flex-col divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl ring-1 ring-slate-900/5"
            aria-label="Hasil pencarian wilayah"
          >
            {areas.map((a, i) => {
              const { primary, secondary } = splitLabel(a)
              return (
                <li key={a.id} id={`${id}-opt-${i}`}>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-current={i === cursor ? "true" : undefined}
                    onMouseDown={(e) => e.preventDefault()}
                    className={`flex min-h-11 w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-base md:text-sm ${i === cursor ? "bg-[#EEF4FF] text-[#0F172A]" : "hover:bg-slate-50"}`}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => choose(a)}
                  >
                    <span className="flex min-w-0 items-start gap-2">
                      <MapPin aria-hidden className={`mt-0.5 size-4 shrink-0 ${i === cursor ? "text-[#0B4FE3]" : "text-slate-400"}`} />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium text-slate-950">{primary}</span>
                        {secondary ? <span className="truncate text-xs text-slate-500">{secondary}</span> : null}
                      </span>
                    </span>
                    {a.postalCode ? <span className="shrink-0 font-mono text-xs tabular-nums text-slate-500">{a.postalCode}</span> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
      {error ? (
        <FieldError>{error}</FieldError>
      ) : fetchError ? (
        <FieldError>{fetchError}</FieldError>
      ) : (
        <FieldDescription id={`${id}-help`}>
          {value ? `Dipilih: ${formatPlace(value.label)}` : loading ? "Mencari wilayah…" : searched && areas.length === 0 ? "Wilayah tidak ditemukan. Coba nama kecamatan atau kode pos lain." : "Ketik minimal 3 huruf, lalu pilih wilayah dari daftar."}
        </FieldDescription>
      )}
    </Field>
  )
}

/**
 * Two-stage precision area selector for contact forms:
 * 1. Search Kecamatan (groups matching Mengantar rows by district + city so ambiguous district names are distinct)
 * 2. Search / narrow Kelurahan within that Kecamatan (or search Kelurahan directly)
 * 3. Auto-fill Kode Pos (5 digits, still editable if a rural area has no zip code upstream).
 */
export function PreciseAreaPicker({
  kecamatanLabel,
  value,
  postalCode,
  onChange,
  onPostalCodeChange,
  error,
  postalError,
  endpoint = "/areas",
  optional = false,
}: {
  kecamatanLabel: string
  value: Area | null
  postalCode: string
  onChange: (a: Area | null) => void
  onPostalCodeChange: (zip: string) => void
  error?: string
  postalError?: string
  endpoint?: string
  optional?: boolean
}) {
  const initParts = value ? partsOf(value) : null
  const [district, setDistrict] = useState<{ district: string; city: string; province: string } | null>(
    initParts?.district ? { district: initParts.district, city: initParts.city, province: initParts.province } : null,
  )
  const [kecQuery, setKecQuery] = useState(initParts?.district ? districtDisplay(initParts) : "")
  const [kelQuery, setKelQuery] = useState(initParts?.subdistrict ?? "")
  const [prevValueId, setPrevValueId] = useState<string | null>(value?.id ?? null)

  const [kecRes, setKecRes] = useState<{ q: string; items: Area[]; err: string | null }>({ q: "", items: [], err: null })
  const [kecOpen, setKecOpen] = useState(false)
  const [kecCursor, setKecCursor] = useState(-1)

  const [districtPool, setDistrictPool] = useState<{ key: string; fetchedKey: string; items: Area[]; err: string | null }>({ key: "", fetchedKey: "", items: [], err: null })
  const [kelRemote, setKelRemote] = useState<{ q: string; items: Area[]; err: string | null }>({ q: "", items: [], err: null })
  const [kelOpen, setKelOpen] = useState(false)
  const [kelCursor, setKelCursor] = useState(-1)

  const kecInputRef = useRef<HTMLInputElement>(null)
  const kelInputRef = useRef<HTMLInputElement>(null)
  const kecId = useId()
  const kelId = useId()
  const posId = useId()

  const valueId = value?.id ?? null
  if (valueId !== prevValueId) {
    setPrevValueId(valueId)
    if (value) {
      const p = partsOf(value)
      if (p.district) {
        setDistrict({ district: p.district, city: p.city, province: p.province })
        setKecQuery(districtDisplay(p))
      } else {
        setKecQuery(formatPlace(value.label))
      }
      setKelQuery(p.subdistrict)
    }
  }

  // ---- 1. Kecamatan search ----
  const kecTrim = kecQuery.trim()
  const activeKecSearch = !district && kecTrim.length >= 3
  const kecLoading = activeKecSearch && kecRes.q !== kecTrim
  const kecSearched = activeKecSearch && kecRes.q === kecTrim
  const kecFetchError = activeKecSearch && kecRes.q === kecTrim ? kecRes.err : null
  const kecGroups = useMemo(() => (activeKecSearch && kecRes.q === kecTrim ? groupByDistrict(kecRes.items) : []), [activeKecSearch, kecRes, kecTrim])
  const showKecList = kecOpen && !district && kecGroups.length > 0

  useEffect(() => {
    if (!activeKecSearch) return
    let alive = true
    const t = setTimeout(() => {
      api<{ items: Area[] }>(`${endpoint}?q=${encodeURIComponent(kecTrim)}`)
        .then((r) => {
          if (!alive) return
          setKecRes({ q: kecTrim, items: r.items, err: null })
          setKecCursor(r.items.length ? 0 : -1)
        })
        .catch((err) => {
          if (!alive) return
          setKecRes({ q: kecTrim, items: [], err: err instanceof ApiError ? err.body.message : "Pencarian kecamatan gagal. Coba lagi." })
          setKecCursor(-1)
        })
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [activeKecSearch, kecTrim, endpoint])

  // ---- 2. Fetch full kelurahan list for the selected Kecamatan ----
  const districtKey = district ? `${norm(district.district)}|${norm(district.city)}|${norm(district.province)}` : ""
  const districtQuery = district ? [district.district, district.city].filter(Boolean).join(" ").trim() : ""
  const districtLoading = !!district && districtQuery.length >= 3 && districtPool.fetchedKey !== districtKey
  useEffect(() => {
    if (!district || !districtKey || districtQuery.length < 3) return
    let alive = true
    api<{ items: Area[] }>(`${endpoint}?q=${encodeURIComponent(districtQuery)}`)
      .then((r) => {
        if (!alive) return
        const filtered = r.items.filter((a) => {
          const p = partsOf(a)
          if (norm(p.district) !== norm(district.district)) return false
          if (district.city && p.city && norm(p.city) !== norm(district.city)) return false
          return true
        })
        const merged = filtered.length ? filtered : r.items
        setDistrictPool((cur) => {
          const seen = new Map<string, Area>()
          for (const a of cur.key === districtKey ? cur.items : []) seen.set(a.id, a)
          for (const a of merged) seen.set(a.id, a)
          return { key: districtKey, fetchedKey: districtKey, items: [...seen.values()], err: null }
        })
      })
      .catch((err) => {
        if (!alive) return
        setDistrictPool((cur) => ({ key: districtKey, fetchedKey: districtKey, items: cur.key === districtKey ? cur.items : [], err: err instanceof ApiError ? err.body.message : "Daftar kelurahan gagal dimuat." }))
      })
    return () => {
      alive = false
    }
  }, [district, districtKey, districtQuery, endpoint])

  // ---- 3. Kelurahan filtering & direct/fallback search ----
  const kelTrim = kelQuery.trim()
  const poolItems = useMemo(() => (district && districtPool.key === districtKey ? districtPool.items : []), [district, districtPool, districtKey])
  const localKelMatches = useMemo(() => {
    if (!district) return []
    if (!kelTrim || (value && norm(partsOf(value).subdistrict) === norm(kelTrim))) return poolItems
    const tokens = norm(kelTrim).split(" ").filter(Boolean)
    return poolItems.filter((a) => {
      const hay = `${norm(partsOf(a).subdistrict)} ${norm(a.label)} ${a.postalCode ?? ""}`
      return tokens.every((tk) => hay.includes(tk))
    })
  }, [district, poolItems, kelTrim, value])

  const needRemoteKel = (!district && kelTrim.length >= 3) || (!!district && !value && kelTrim.length >= 3 && localKelMatches.length === 0)
  const remoteKelQuery = district ? `${kelTrim} ${district.district}`.trim() : kelTrim
  const kelRemoteLoading = needRemoteKel && kelRemote.q !== remoteKelQuery

  useEffect(() => {
    if (!needRemoteKel) return
    let alive = true
    const t = setTimeout(() => {
      api<{ items: Area[] }>(`${endpoint}?q=${encodeURIComponent(remoteKelQuery)}`)
        .then((r) => {
          if (!alive) return
          const items = district
            ? r.items.filter((a) => {
                const p = partsOf(a)
                return norm(p.district) === norm(district.district) && (!district.city || !p.city || norm(p.city) === norm(district.city))
              })
            : r.items
          setKelRemote({ q: remoteKelQuery, items: items.length ? items : r.items, err: null })
          setKelCursor((items.length ? items : r.items).length ? 0 : -1)
        })
        .catch((err) => {
          if (!alive) return
          setKelRemote({ q: remoteKelQuery, items: [], err: err instanceof ApiError ? err.body.message : "Pencarian kelurahan gagal. Coba lagi." })
          setKelCursor(-1)
        })
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [needRemoteKel, remoteKelQuery, district, endpoint])

  const kelOptions = useMemo(() => {
    if (district && localKelMatches.length > 0) return localKelMatches
    if (needRemoteKel && kelRemote.q === remoteKelQuery) return kelRemote.items
    return []
  }, [district, localKelMatches, needRemoteKel, kelRemote, remoteKelQuery])

  const kelLoading = (district ? districtLoading && poolItems.length === 0 : false) || kelRemoteLoading
  const showKelList = kelOpen && kelOptions.length > 0

  useEffect(() => {
    if (showKecList && kecCursor >= 0) document.getElementById(`${kecId}-opt-${kecCursor}`)?.scrollIntoView({ block: "nearest" })
  }, [showKecList, kecCursor, kecId])

  useEffect(() => {
    if (showKelList && kelCursor >= 0) document.getElementById(`${kelId}-opt-${kelCursor}`)?.scrollIntoView({ block: "nearest" })
  }, [showKelList, kelCursor, kelId])

  function pickExactArea(a: Area) {
    const p = partsOf(a)
    if (p.district) {
      setDistrict({ district: p.district, city: p.city, province: p.province })
      setKecQuery(districtDisplay(p))
    } else {
      setKecQuery(formatPlace(a.label))
    }
    setKelQuery(p.subdistrict || formatPlace(a.label))
    setPrevValueId(a.id)
    onChange(a)
    onPostalCodeChange(a.postalCode ?? "")
    setKecOpen(false)
    setKelOpen(false)
    setKecCursor(-1)
    setKelCursor(-1)
  }

  function pickDistrictGroup(g: DistrictGroup) {
    if (g.items.length === 1) {
      pickExactArea(g.items[0]!)
      return
    }
    setDistrict({ district: g.district, city: g.city, province: g.province })
    setKecQuery(districtDisplay(g))
    setDistrictPool({ key: g.key, fetchedKey: "", items: g.items, err: null })
    setPrevValueId(null)
    onChange(null)
    onPostalCodeChange("")
    setKelQuery("")
    setKecOpen(false)
    setKecCursor(-1)
    setKelOpen(true)
    setKelCursor(0)
    queueMicrotask(() => kelInputRef.current?.focus())
  }

  function clearAll() {
    setDistrict(null)
    setKecQuery("")
    setKelQuery("")
    setPrevValueId(null)
    onChange(null)
    onPostalCodeChange("")
    setKecOpen(false)
    setKelOpen(false)
    setKecCursor(-1)
    setKelCursor(-1)
    kecInputRef.current?.focus()
  }

  function clearKelurahan() {
    setKelQuery("")
    setPrevValueId(null)
    onChange(null)
    onPostalCodeChange("")
    setKelOpen(!!district && poolItems.length > 0)
    setKelCursor(0)
    kelInputRef.current?.focus()
  }

  const autoPostal = !!(value?.postalCode && postalCode === value.postalCode)

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200/90 bg-slate-50/55 p-3.5">
      {/* Step 1: Kecamatan search */}
      <Field data-invalid={error || kecFetchError ? true : undefined}>
        <FieldLabel htmlFor={kecId}>{kecamatanLabel}</FieldLabel>
        <div
          className="relative"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setKecOpen(false)
          }}
        >
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            ref={kecInputRef}
            id={kecId}
            aria-autocomplete="list"
            aria-expanded={showKecList}
            aria-controls={`${kecId}-list`}
            value={kecQuery}
            placeholder="Ketik kecamatan, mis. Tebet atau Sukodono"
            className="bg-white pr-9 pl-8"
            onFocus={() => {
              if (!district && kecGroups.length > 0) setKecOpen(true)
            }}
            onChange={(e) => {
              setKecQuery(e.target.value)
              setKecOpen(true)
              if (district || value) {
                setDistrict(null)
                setKelQuery("")
                setPrevValueId(null)
                onChange(null)
                onPostalCodeChange("")
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                if (!kecGroups.length || district) return
                e.preventDefault()
                setKecOpen(true)
                setKecCursor((c) => (c + 1) % kecGroups.length)
              } else if (e.key === "ArrowUp") {
                if (!kecGroups.length || district) return
                e.preventDefault()
                setKecOpen(true)
                setKecCursor((c) => (c <= 0 ? kecGroups.length - 1 : c - 1))
              } else if (e.key === "Enter" && showKecList && kecCursor >= 0 && kecGroups[kecCursor]) {
                e.preventDefault()
                pickDistrictGroup(kecGroups[kecCursor]!)
              } else if (e.key === "Escape" && kecOpen) {
                e.preventDefault()
                e.stopPropagation()
                setKecOpen(false)
                setKecCursor(-1)
              }
            }}
            autoComplete="off"
            aria-describedby={`${kecId}-help`}
            aria-invalid={error || kecFetchError ? true : undefined}
          />
          {kecLoading ? (
            <span aria-hidden className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </span>
          ) : district || kecQuery ? (
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={clearAll}
              aria-label="Hapus pilihan kecamatan"
              className="absolute inset-y-0 right-1 flex w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          ) : null}
          {showKecList ? (
            <ul
              id={`${kecId}-list`}
              className="absolute inset-x-0 top-full z-50 mt-1.5 flex max-h-56 flex-col divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl ring-1 ring-slate-900/5"
              aria-label="Hasil pencarian wilayah"
            >
              {kecGroups.map((g, i) => {
                const only = g.items.length === 1 ? g.items[0]! : null
                const single = only ? splitLabel(only) : null
                return (
                  <li key={g.key} id={`${kecId}-opt-${i}`}>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-current={i === kecCursor ? "true" : undefined}
                      onMouseDown={(e) => e.preventDefault()}
                      className={`flex min-h-11 w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-base md:text-sm ${i === kecCursor ? "bg-[#EEF4FF] text-[#0F172A]" : "hover:bg-slate-50"}`}
                      onMouseEnter={() => setKecCursor(i)}
                      onClick={() => pickDistrictGroup(g)}
                    >
                      <span className="flex min-w-0 items-start gap-2">
                        <MapPin aria-hidden className={`mt-0.5 size-4 shrink-0 ${i === kecCursor ? "text-[#0B4FE3]" : "text-slate-400"}`} />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium text-slate-950">{single ? single.primary : `Kec. ${g.district}`}</span>
                          <span className="truncate text-xs text-slate-500">{single ? single.secondary : [g.city, g.province].filter(Boolean).join(", ")}</span>
                        </span>
                      </span>
                      {only?.postalCode ? (
                        <span className="shrink-0 font-mono text-xs tabular-nums text-slate-500">{only.postalCode}</span>
                      ) : !only ? (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 tabular-nums">{g.items.length} kelurahan</span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
        {kecFetchError ? (
          <FieldError>{kecFetchError}</FieldError>
        ) : !district && kecSearched && kecGroups.length === 0 ? (
          <FieldDescription id={`${kecId}-help`}>Kecamatan tidak ditemukan. Coba ejaan lain atau cari langsung di kolom kelurahan.</FieldDescription>
        ) : (
          <FieldDescription id={`${kecId}-help`}>
            {district ? `Kecamatan dipilih: ${districtDisplay(district)}. Pilih kelurahan di bawah untuk presisi kode pos.` : `Ketik min. 3 huruf untuk mencari kecamatan${optional ? " (opsional)" : ""}.`}
          </FieldDescription>
        )}
      </Field>

      {/* Step 2 + 3: Kelurahan / Desa + Auto-filled Kode Pos */}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8.5rem]">
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor={kelId}>Kelurahan / Desa{optional ? " (opsional)" : ""}</FieldLabel>
          <div
            className="relative"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setKelOpen(false)
            }}
          >
            <Input
              ref={kelInputRef}
              id={kelId}
              aria-autocomplete="list"
              aria-expanded={showKelList}
              aria-controls={`${kelId}-list`}
              value={kelQuery}
              placeholder={district ? `Cari kelurahan di Kec. ${district.district}…` : "Atau ketik kelurahan / kode pos…"}
              className="bg-white pr-9"
              onFocus={() => {
                if (kelOptions.length > 0) {
                  setKelOpen(true)
                  setKelCursor(0)
                }
              }}
              onChange={(e) => {
                setKelQuery(e.target.value)
                setKelOpen(true)
                setKelCursor(0)
                if (value) {
                  setPrevValueId(null)
                  onChange(null)
                  onPostalCodeChange("")
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  if (!kelOptions.length) return
                  e.preventDefault()
                  setKelOpen(true)
                  setKelCursor((c) => (c + 1) % kelOptions.length)
                } else if (e.key === "ArrowUp") {
                  if (!kelOptions.length) return
                  e.preventDefault()
                  setKelOpen(true)
                  setKelCursor((c) => (c <= 0 ? kelOptions.length - 1 : c - 1))
                } else if (e.key === "Enter" && showKelList && kelCursor >= 0 && kelOptions[kelCursor]) {
                  e.preventDefault()
                  pickExactArea(kelOptions[kelCursor]!)
                } else if (e.key === "Escape" && kelOpen) {
                  e.preventDefault()
                  e.stopPropagation()
                  setKelOpen(false)
                  setKelCursor(-1)
                }
              }}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
            />
            {kelLoading ? (
              <span aria-hidden className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
              </span>
            ) : kelQuery ? (
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={clearKelurahan}
                aria-label="Hapus pilihan kelurahan"
                className="absolute inset-y-0 right-1 flex w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            ) : district && poolItems.length > 0 ? (
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setKelOpen((o) => !o)
                  kelInputRef.current?.focus()
                }}
                aria-label="Tampilkan daftar kelurahan"
                className="absolute inset-y-0 right-1 flex w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className="size-4" />
              </button>
            ) : null}
            {showKelList ? (
              <ul
                id={`${kelId}-list`}
                className="absolute inset-x-0 top-full z-50 mt-1.5 flex max-h-56 flex-col divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl ring-1 ring-slate-900/5"
                aria-label="Hasil pencarian kelurahan"
              >
                {kelOptions.map((a, i) => {
                  const p = partsOf(a)
                  return (
                    <li key={a.id} id={`${kelId}-opt-${i}`}>
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-current={i === kelCursor ? "true" : undefined}
                        onMouseDown={(e) => e.preventDefault()}
                        className={`flex min-h-11 w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-base md:text-sm ${i === kelCursor ? "bg-[#EEF4FF] text-[#0F172A]" : "hover:bg-slate-50"}`}
                        onMouseEnter={() => setKelCursor(i)}
                        onClick={() => pickExactArea(a)}
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium text-slate-950">{p.subdistrict || formatPlace(a.label)}</span>
                          <span className="truncate text-xs text-slate-500">{[p.district ? `Kec. ${p.district}` : "", p.city].filter(Boolean).join(", ")}</span>
                        </span>
                        {a.postalCode ? <span className="shrink-0 font-mono text-xs font-medium tabular-nums text-slate-600">{a.postalCode}</span> : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>

        <Field data-invalid={postalError ? true : undefined}>
          <FieldLabel htmlFor={posId} className="flex items-center justify-between gap-1.5">
            <span>Kode pos</span>
            {autoPostal ? <span className="rounded-full bg-safe-bg px-1.5 py-px text-[11px] font-medium text-safe">Otomatis</span> : null}
          </FieldLabel>
          <Input
            id={posId}
            inputMode="numeric"
            maxLength={5}
            value={postalCode}
            onChange={(e) => onPostalCodeChange(e.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder="5 digit"
            className="bg-white font-mono tabular-nums"
            autoComplete="postal-code"
            aria-invalid={postalError ? true : undefined}
          />
          {postalError ? <FieldError>{postalError}</FieldError> : null}
        </Field>
      </div>

      {value ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-safe">
          <CheckCircle2 aria-hidden className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            {formatPlace(value.label)}
            {postalCode ? ` · ${postalCode}` : ""}
          </span>
        </p>
      ) : district && !kelLoading && poolItems.length > 0 ? (
        <p className="text-xs text-muted-foreground">Pilih salah satu kelurahan di atas agar kode pos terisi otomatis.</p>
      ) : null}
    </div>
  )
}
