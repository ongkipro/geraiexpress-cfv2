import { useEffect, useId, useState } from "react"
import { Field, FieldDescription, FieldError, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { api } from "../lib/api"

// Mengantar area search (KV-cached server side, TASK-206). The value is only set by choosing a row from the results.
export interface Area {
  id: string
  label: string
  postalCode: string | null
}

export function AreaPicker({ label, value, onChange, error, endpoint = "/areas" }: { label: string; value: Area | null; onChange: (a: Area | null) => void; error?: string; endpoint?: string }) {
  const [query, setQuery] = useState(value?.label ?? "")
  const [areas, setAreas] = useState<Area[]>([])
  const id = useId()
  useEffect(() => {
    if (value || query.trim().length < 3) return
    let alive = true
    const t = setTimeout(() => {
      api<{ items: Area[] }>(`${endpoint}?q=${encodeURIComponent(query.trim())}`)
        .then((r) => alive && setAreas(r.items))
        .catch(() => alive && setAreas([]))
    }, 300)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query, value, endpoint])
  return (
    <div className="flex flex-col gap-2">
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Input id={id} value={query} onChange={(e) => { setQuery(e.target.value); onChange(null) }} autoComplete="off" aria-describedby={`${id}-help`} aria-invalid={error ? true : undefined} />
        {error ? <FieldError>{error}</FieldError> : <FieldDescription id={`${id}-help`}>{value ? `Dipilih: ${value.label}` : "Ketik minimal 3 huruf, lalu pilih wilayah dari daftar."}</FieldDescription>}
      </Field>
      {!value && areas.length ? (
        <ul className="flex flex-col divide-y rounded-lg border" aria-label="Hasil pencarian wilayah">
          {areas.map((a) => (
            <li key={a.id}>
              <button type="button" className="flex min-h-11 w-full items-center px-3 text-left text-base md:text-sm hover:bg-muted" onClick={() => { onChange(a); setQuery(a.label); setAreas([]) }}>
                {a.label}{a.postalCode ? ` · ${a.postalCode}` : ""}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
