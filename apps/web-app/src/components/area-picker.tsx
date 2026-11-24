import { useEffect, useId, useRef, useState } from "react"
import { Loader2, MapPin, X } from "lucide-react"
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
function formatPlace(raw: string | null | undefined): string {
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
