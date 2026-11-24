import { useState } from "react"
import { CalendarIcon, CheckIcon, ChevronDownIcon } from "lucide-react"
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
  const trigger = (onClick?: () => void) => (
    <Button type="button" variant="outline" aria-label={aria} onClick={onClick} className="h-11 justify-between gap-2 px-3 text-base font-medium md:h-9 md:text-sm">
      <CalendarIcon aria-hidden /> <span className="truncate tabular-nums">{triggerLabel(value)}</span> <ChevronDownIcon aria-hidden />
    </Button>
  )
  const pick = (p: Period) => {
    onChange(p)
    setOpen(false)
  }
  if (mobile) {
    return (
      <>
        {trigger(() => setOpen(true))}
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
      <PopoverTrigger render={trigger()} />
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
        <button key={p.id} type="button" aria-pressed={value.preset === p.id} onClick={() => choosePreset(p.id)} className={`h-11 rounded-full border px-4 text-base md:text-sm ${value.preset === p.id ? "border-primary bg-primary/10 font-medium text-primary" : "border-input"}`}>{p.label}</button>
      ))}
    </div>
  ) : (
    // DEC-243 (AdsBookCMS AdminDateRangeFilter proportions): slim 160 px preset column, compact rows, check on the active one.
    <div className="flex w-40 shrink-0 flex-col gap-0.5 border-r border-slate-100 p-1.5">
      <p className="px-2.5 pt-1 pb-1.5 text-xs font-semibold text-muted-foreground">Periode (WIB)</p>
      {PRESETS.map((p) => (
        <button key={p.id} type="button" aria-pressed={value.preset === p.id} onClick={() => choosePreset(p.id)} className={`flex h-8 items-center justify-between gap-2 rounded-md px-2.5 text-left text-xs font-medium ${value.preset === p.id ? "bg-primary/10 text-primary" : "text-slate-700 hover:bg-slate-100"}`}>
          {p.label}
          {value.preset === p.id ? <CheckIcon aria-hidden className="size-3.5" /> : null}
        </button>
      ))}
    </div>
  )
  const fields = (
    <>
      <Field className={chips ? "w-36" : "w-28 gap-1"}>
        <FieldLabel htmlFor="periode-dari" className={chips ? undefined : "text-xs text-muted-foreground"}>Dari</FieldLabel>
        <Input id="periode-dari" value={dari} inputMode="numeric" placeholder="dd/mm/yyyy" className={chips ? undefined : "md:h-8 md:text-xs tabular-nums"} onChange={(e) => { setDari(e.target.value); setError(null) }} />
      </Field>
      {chips ? null : <span aria-hidden className="pb-1.5 text-xs text-muted-foreground">–</span>}
      <Field className={chips ? "w-36" : "w-28 gap-1"}>
        <FieldLabel htmlFor="periode-sampai" className={chips ? undefined : "text-xs text-muted-foreground"}>Sampai</FieldLabel>
        <Input id="periode-sampai" value={sampai} inputMode="numeric" placeholder="dd/mm/yyyy" className={chips ? undefined : "md:h-8 md:text-xs tabular-nums"} onChange={(e) => { setSampai(e.target.value); setError(null) }} />
      </Field>
    </>
  )
  const custom = chips ? (
    <div className="flex flex-col gap-3 p-3">
      <Calendar mode="range" numberOfMonths={months} locale={idLocale} weekStartsOn={1} selected={range} onSelect={onSelect} defaultMonth={toDate(value.to)} disabled={{ after: toDate(today) }} className="[--cell-size:2.75rem]" />
      <div className="flex flex-wrap items-end gap-3 border-t pt-3">{fields}</div>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  ) : (
    // ~31 px day cells (fixed: the shared Calendar stretches `w-full` cells to the column), 12 px numbers, 11 px weekday
    // heads; one footer row: Dari – Sampai · Batal Terapkan.
    <div className="flex flex-col gap-2.5 p-2.5">
      <Calendar mode="range" numberOfMonths={months} locale={idLocale} weekStartsOn={1} selected={range} onSelect={onSelect} defaultMonth={prevMonthStart(value.to)} disabled={{ after: toDate(today) }} className="p-1.5 [--cell-size:1.95rem] [&_.rdp-day]:size-(--cell-size) [&_.rdp-day]:flex-none [&_.rdp-day_button]:text-xs [&_.rdp-month]:w-auto [&_.rdp-months]:gap-3 [&_.rdp-weekday]:w-(--cell-size) [&_.rdp-weekday]:flex-none [&_.rdp-weekday]:text-[11px]" />
      <div className="flex flex-wrap items-end justify-between gap-2 border-t border-slate-100 pt-2.5">
        <div className="flex items-end gap-1.5">{fields}</div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="text-xs" onClick={onCancel}>Batal</Button>
          <Button size="sm" className="text-xs" onClick={apply}>Terapkan</Button>
        </div>
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
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
