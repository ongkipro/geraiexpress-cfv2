import { useEffect, useId, useRef, useState } from "react"
import { Field, FieldDescription, FieldError, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group"
import { sanitizeDecimal } from "../lib/input"

// DEC-215: integer grams, default 1000, `[ gram ● | kg ]` with live conversion and unit-mistake guards.
const fmtKg = (g: number) => `${(g / 1000).toLocaleString("id-ID", { maximumFractionDigits: 3 })} kg`
const fmtForUnit = (g: number, u: "gram" | "kg") => (u === "gram" ? String(g) : String(g / 1000).replace(".", ","))

/** Parse weight input per unit: in gram mode treat Indonesian thousand separators (`1.500` → 1500 g). */
function parseWeight(raw: string, u: "gram" | "kg"): number {
  const s = raw.trim()
  if (!s) return 0
  if (u === "gram") {
    // Strip dot thousand grouping (`1.500`, `10.000`) while still tolerating a decimal comma (`1000,5`).
    const normalized = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s.replace(",", ".")
    const n = Number(normalized)
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
  }
  const n = Number(s.replace(",", "."))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : 0
}

export function WeightInput({ gram, onChange, error }: { gram: number; onChange: (g: number) => void; error?: string }) {
  const id = useId()
  const [unit, setUnit] = useState<"gram" | "kg">("gram")
  const [text, setText] = useState(String(gram))
  const lastEmitted = useRef(gram)
  // Sync external gram changes (e.g. QR pre-booking claim or reset) without fighting the operator's in-progress text.
  useEffect(() => {
    if (gram !== lastEmitted.current) {
      lastEmitted.current = gram
      setText(gram > 0 ? fmtForUnit(gram, unit) : "")
    }
  }, [gram, unit])
  const parsed = parseWeight(text, unit)
  const displayNum = unit === "gram" ? parsed : parsed / 1000
  const warn = parsed > 0 ? (unit === "gram" && displayNum < 10 ? "Berat kurang dari 10 gram. Maksudnya kilogram?" : unit === "kg" && displayNum >= 100 ? "Berat 100 kg atau lebih. Maksudnya gram?" : null) : null
  function set(v: string, u = unit) {
    setText(v)
    // Sol R1-2: an empty, non-numeric or zero entry is reported as 0 g, so the form drops its quote and selection
    // instead of keeping the last valid weight behind a field the operator has cleared.
    const next = parseWeight(v, u)
    lastEmitted.current = next
    onChange(next)
  }
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>Berat paket</FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
        <Input id={id} inputMode="decimal" value={text} onChange={(e) => set(sanitizeDecimal(e.target.value))} className="w-24 tabular-nums" aria-describedby={`${id}-h`} />
        <ToggleGroup
          value={[unit]}
          onValueChange={(v) => {
            const u = (v[0] ?? unit) as "gram" | "kg"
            setUnit(u)
            setText(gram > 0 ? fmtForUnit(gram, u) : "")
          }}
          variant="outline"
          aria-label="Satuan berat"
        >
          <ToggleGroupItem value="gram">gram</ToggleGroupItem>
          <ToggleGroupItem value="kg">kg</ToggleGroupItem>
        </ToggleGroup>
        <div className="flex flex-wrap gap-1" aria-label="Pilihan cepat">
          {[500, 1000, 2000, 5000].map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={gram === g}
              onClick={() => {
                lastEmitted.current = g
                onChange(g)
                setText(fmtForUnit(g, unit))
              }}
              className={`h-11 rounded-lg border px-2.5 text-base tabular-nums transition-colors md:h-9 md:text-sm ${gram === g ? "border-primary bg-primary/10 font-medium text-primary" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
            >
              {g >= 1000 ? `${g / 1000} kg` : `${g} g`}
            </button>
          ))}
        </div>
      </div>
      {error ? <FieldError>{error}</FieldError> : <FieldDescription id={`${id}-h`} className={warn ? "text-warn" : undefined}>{warn ?? `= ${gram.toLocaleString("id-ID")} g · ${fmtKg(gram)}`}</FieldDescription>}
    </Field>
  )
}
