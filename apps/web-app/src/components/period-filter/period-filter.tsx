import { useMemo, useState } from "react"
import { CalendarIcon, ChevronDownIcon } from "lucide-react"
import { id as idLocale } from "react-day-picker/locale"
import type { DateRange } from "react-day-picker"
import { PRESETS, rangeLabel, resolveCustom, resolvePreset, wibDay, type Period, type Preset } from "@gx/domain/period"
import { Button } from "../ui/button"
import { Calendar } from "../ui/calendar"
import { Field, FieldError, FieldLabel } from "../ui/field"
import { Input } from "../ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "../ui/sheet"
import { useIsMobile } from "../../hooks/use-mobile"

// `PeriodFilter` (DEC-221, visual 08 §1): WIB presets apply at once; a custom range needs `Terapkan`. Desktop =
// popover with preset list + two-month calendar; phone = bottom sheet with chips + one month. No future days,
// max 180 days. The caller owns URL state (`?periode=` or `?dari=&sampai=`).
const toDate = (day: string) => new Date(`${day}T00:00:00`)
const toDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
// Two months show the previous and the current month (future days are disabled).
const prevMonthStart = (day: string) => {
  const d = toDate(day)
  return new Date(d.getFullYear(), d.getMonth() - 1, 1)
}
const toInput = (day: string) => day.split("-").reverse().join("/")
const fromInput = (s: string) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim())
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : null
}

export function triggerLabel(p: Period): string {
  const preset = PRESETS.find((x) => x.id === p.preset)
  return preset ? `${preset.label} · ${rangeLabel(p)}` : rangeLabel(p)
}

export function PeriodFilter({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const mobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const preset = PRESETS.find((x) => x.id === value.preset)
  const aria = `Periode: ${preset ? `${preset.label}, ` : ""}${rangeLabel(value, true)}`
  const trigger = (
    <Button variant="outline" aria-label={aria} className="h-11 justify-between gap-2 text-base md:h-10">
      <CalendarIcon aria-hidden /> <span className="tabular-nums">{triggerLabel(value)}</span> <ChevronDownIcon aria-hidden />
    </Button>
  )
  const pick = (p: Period) => {
    onChange(p)
    setOpen(false)
  }
  if (mobile) {
    return (
      <>
        <span onClick={() => setOpen(true)}>{trigger}</span>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
            <SheetHeader><SheetTitle>Pilih periode</SheetTitle></SheetHeader>
            <Body value={value} onPick={pick} onCancel={() => setOpen(false)} months={1} chips />
          </SheetContent>
        </Sheet>
      </>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align="end" className="w-auto max-w-[calc(100vw-2rem)] p-0">
        <Body value={value} onPick={pick} onCancel={() => setOpen(false)} months={2} chips={false} />
      </PopoverContent>
    </Popover>
  )
}

function Body({ value, onPick, onCancel, months, chips }: { value: Period; onPick: (p: Period) => void; onCancel: () => void; months: 1 | 2; chips: boolean }) {
  const [now] = useState(() => Date.now())
  const today = wibDay(now)
  const [range, setRange] = useState<DateRange | undefined>({ from: toDate(value.from), to: toDate(value.to) })
  const [dari, setDari] = useState(toInput(value.from))
  const [sampai, setSampai] = useState(toInput(value.to))
  const [error, setError] = useState<string | null>(null)
  const span = useMemo(() => {
    const a = fromInput(dari)
    const b = fromInput(sampai)
    if (!a || !b) return null
    const r = resolveCustom(a, b, now)
    return r.ok ? r.period.days : null
  }, [dari, sampai, now])
  const choosePreset = (id: Preset) => onPick(resolvePreset(id, now))
  const onSelect = (r: DateRange | undefined) => {
    setRange(r)
    setError(null)
    if (r?.from) setDari(toInput(toDay(r.from)))
    setSampai(r?.to ? toInput(toDay(r.to)) : r?.from ? toInput(toDay(r.from)) : "")
  }
  const apply = () => {
    const a = fromInput(dari)
    const b = fromInput(sampai)
    if (!a || !b) return setError("Tanggal tidak valid")
    const r = resolveCustom(a, b, now)
    if (!r.ok) return setError(r.message)
    onPick(r.period)
  }
  const presetList = chips ? (
    <div role="group" aria-label="Pilihan cepat" className="flex flex-wrap gap-2 px-4">
      {PRESETS.map((p) => (
        <button key={p.id} type="button" aria-pressed={value.preset === p.id} onClick={() => choosePreset(p.id)} className={`h-11 rounded-full border px-4 text-base ${value.preset === p.id ? "border-primary bg-primary/10 font-medium text-primary" : "border-input"}`}>{p.label}</button>
      ))}
    </div>
  ) : (
    <div className="flex w-48 flex-col gap-1 border-r p-3">
      <p className="px-2 pb-1 text-sm font-semibold text-muted-foreground">Periode (WIB)</p>
      {PRESETS.map((p) => (
        <button key={p.id} type="button" aria-pressed={value.preset === p.id} onClick={() => choosePreset(p.id)} className={`h-10 rounded-md px-2 text-left text-base ${value.preset === p.id ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}>{p.label}</button>
      ))}
    </div>
  )
  const custom = (
    <div className="flex flex-col gap-3 p-3">
      <Calendar mode="range" numberOfMonths={months} locale={idLocale} weekStartsOn={1} selected={range} onSelect={onSelect} defaultMonth={months === 2 ? prevMonthStart(value.to) : toDate(value.to)} disabled={{ after: toDate(today) }} className="[--cell-size:2.75rem] md:[--cell-size:2.5rem]" />
      <div className="flex flex-wrap items-end gap-3 border-t pt-3">
        <Field className="w-36"><FieldLabel htmlFor="periode-dari">Dari</FieldLabel><Input id="periode-dari" value={dari} inputMode="numeric" placeholder="dd/mm/yyyy" onChange={(e) => { setDari(e.target.value); setError(null) }} /></Field>
        <Field className="w-36"><FieldLabel htmlFor="periode-sampai">Sampai</FieldLabel><Input id="periode-sampai" value={sampai} inputMode="numeric" placeholder="dd/mm/yyyy" onChange={(e) => { setSampai(e.target.value); setError(null) }} /></Field>
        {span ? <p className="pb-2 text-base text-muted-foreground tabular-nums">{span} hari</p> : null}
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
      {chips ? null : (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Batal</Button>
          <Button onClick={apply}>Terapkan</Button>
        </div>
      )}
    </div>
  )
  if (chips) {
    return (
      <>
        {presetList}
        {custom}
        <SheetFooter className="sticky bottom-0 grid grid-cols-2 gap-2 border-t bg-popover">
          <Button variant="outline" size="lg" onClick={onCancel}>Batal</Button>
          <Button size="lg" onClick={apply}>Terapkan</Button>
        </SheetFooter>
      </>
    )
  }
  return (
    <div className="flex">
      {presetList}
      {custom}
    </div>
  )
}
