import { useEffect, useId, useState } from "react"
import { Field, FieldDescription, FieldError, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { api, ApiError } from "../lib/api"

// Mengantar area search (KV-cached server side, TASK-206). The value is only set by choosing a row from the results.
export interface Area {
  id: string
  label: string
  postalCode: string | null
}

export function AreaPicker({ label, value, onChange, error, endpoint = "/areas" }: { label: string; value: Area | null; onChange: (a: Area | null) => void; error?: string; endpoint?: string }) {
  const [query, setQuery] = useState(value?.label ?? "")
  const [prevValueId, setPrevValueId] = useState<string | null>(value?.id ?? null)
  const [res, setRes] = useState<{ q: string; items: Area[]; err: string | null }>({ q: "", items: [], err: null })
  const [cursor, setCursor] = useState(-1)
  const id = useId()

  // Sync external selection changes (e.g. picking a recipient or clearing destination) into the input box.
  const valueId = value?.id ?? null
  if (valueId !== prevValueId) {
    setPrevValueId(valueId)
    setQuery(value?.label ?? "")
    setCursor(-1)
  }

  const trimmed = query.trim()
  const activeSearch = !value && trimmed.length >= 3
  const areas = activeSearch && res.q === trimmed ? res.items : []
  const loading = activeSearch && res.q !== trimmed
  const searched = activeSearch && res.q === trimmed
  const fetchError = activeSearch && res.q === trimmed ? res.err : null

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

  function choose(a: Area) {
    setPrevValueId(a.id)
    onChange(a)
    setQuery(a.label)
    setCursor(-1)
  }

  return (
    <div className="flex flex-col gap-2">
      <Field data-invalid={error || fetchError ? true : undefined}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Input
          id={id}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (value) {
              setPrevValueId(null)
              onChange(null)
            }
          }}
          onKeyDown={(e) => {
            if (!areas.length) return
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setCursor((c) => (c + 1) % areas.length)
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              setCursor((c) => (c <= 0 ? areas.length - 1 : c - 1))
            } else if (e.key === "Enter" && cursor >= 0 && areas[cursor]) {
              e.preventDefault()
              choose(areas[cursor]!)
            } else if (e.key === "Escape") {
              setRes({ q: trimmed, items: [], err: null })
              setCursor(-1)
            }
          }}
          autoComplete="off"
          aria-describedby={`${id}-help`}
          aria-invalid={error || fetchError ? true : undefined}
        />
        {error ? (
          <FieldError>{error}</FieldError>
        ) : fetchError ? (
          <FieldError>{fetchError}</FieldError>
        ) : (
          <FieldDescription id={`${id}-help`}>
            {value ? `Dipilih: ${value.label}` : loading ? "Mencari wilayah…" : searched && areas.length === 0 ? "Wilayah tidak ditemukan. Coba nama kecamatan atau kode pos lain." : "Ketik minimal 3 huruf, lalu pilih wilayah dari daftar."}
          </FieldDescription>
        )}
      </Field>
      {!value && areas.length ? (
        <ul id={`${id}-list`} className="flex max-h-60 flex-col divide-y overflow-y-auto rounded-lg border bg-white" aria-label="Hasil pencarian wilayah">
          {areas.map((a, i) => (
            <li key={a.id}>
              <button
                type="button"
                className={`flex min-h-11 w-full items-center px-3 text-left text-base md:text-sm ${i === cursor ? "bg-slate-100 font-medium text-slate-950" : "hover:bg-muted"}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(a)}
              >
                {a.label}{a.postalCode ? ` · ${a.postalCode}` : ""}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
