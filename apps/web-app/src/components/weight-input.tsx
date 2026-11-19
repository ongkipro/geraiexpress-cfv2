import { useId, useState } from "react"
import { Field, FieldDescription, FieldError, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group"

// DEC-215: integer grams, default 1000, `[ gram ● | kg ]` with live conversion and unit-mistake guards.
const fmtKg = (g: number) => `${(g / 1000).toLocaleString("id-ID", { maximumFractionDigits: 3 })} kg`

export function WeightInput({ gram, onChange, error }: { gram: number; onChange: (g: number) => void; error?: string }) {
  const id = useId()
  const [unit, setUnit] = useState<"gram" | "kg">("gram")
  const [text, setText] = useState(String(gram))
  const typed = Number(text.replace(",", "."))
  const warn = Number.isFinite(typed) && typed > 0 ? (unit === "gram" && typed < 10 ? "Berat kurang dari 10 gram. Maksudnya kilogram?" : unit === "kg" && typed >= 100 ? "Berat 100 kg atau lebih. Maksudnya gram?" : null) : null
  function set(v: string, u = unit) {
    setText(v)
    const n = Number(v.replace(",", "."))
    // Sol R1-2: an empty, non-numeric or zero entry is reported as 0 g, so the form drops its quote and selection
    // instead of keeping the last valid weight behind a field the operator has cleared.
    onChange(v.trim() !== "" && Number.isFinite(n) && n > 0 ? (u === "gram" ? Math.round(n) : Math.round(n * 1000)) : 0)
  }
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>Berat paket</FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
        <Input id={id} inputMode="decimal" value={text} onChange={(e) => set(e.target.value)} className="w-24 tabular-nums" aria-describedby={`${id}-h`} />
        <ToggleGroup value={[unit]} onValueChange={(v) => { const u = (v[0] ?? unit) as "gram" | "kg"; setUnit(u); setText(u === "gram" ? String(gram) : String(gram / 1000).replace(".", ",")) }} variant="outline" aria-label="Satuan berat">
          <ToggleGroupItem value="gram">gram</ToggleGroupItem>
          <ToggleGroupItem value="kg">kg</ToggleGroupItem>
        </ToggleGroup>
        <div className="flex flex-wrap gap-1" aria-label="Pilihan cepat">
          {[500, 1000, 2000, 5000].map((g) => (
            <button key={g} type="button" onClick={() => { onChange(g); setText(unit === "gram" ? String(g) : String(g / 1000)) }} className="h-11 rounded-lg border border-slate-200 bg-white px-2.5 text-base md:text-sm text-slate-600 tabular-nums hover:bg-slate-50 hover:text-slate-900 md:h-9 md:text-sm">
              {g >= 1000 ? `${g / 1000} kg` : `${g} g`}
            </button>
          ))}
        </div>
      </div>
      {error ? <FieldError>{error}</FieldError> : <FieldDescription id={`${id}-h`} className={warn ? "text-warn" : undefined}>{warn ?? `= ${gram.toLocaleString("id-ID")} g · ${fmtKg(gram)}`}</FieldDescription>}
    </Field>
  )
}
