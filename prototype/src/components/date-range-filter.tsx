import * as React from "react"
import { id as localeId } from "date-fns/locale"
import type { DateRange } from "react-day-picker"
import { CalendarDaysIcon, ChevronDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"
import { DATE_PRESETS, MAX_RANGE_DAYS, daysInclusive, rangeLabel, resolvePreset, toIso, todayWib, type Period } from "@/lib/date-range"

// docs/visual/08 §1: presets apply at once; a custom range needs Terapkan. Popover on desktop, bottom sheet on phones.
export function DateRangeFilter({ value, onChange }: { value: Period; onChange: (v: Period) => void }) {
  const mobile = useIsMobile()
  const [open, setOpen] = React.useState(false)
  const r = value.kind === "preset" ? resolvePreset(value.preset) : value
  const presetLabel = value.kind === "preset" ? DATE_PRESETS.find((p) => p.value === value.preset)?.label : null
  const [draft, setDraft] = React.useState<DateRange | undefined>()

  React.useEffect(() => {
    if (open) setDraft({ from: new Date(`${r.start}T00:00:00`), to: new Date(`${r.end}T00:00:00`) })
  }, [open, r.start, r.end])

  const today = new Date(`${todayWib()}T00:00:00`)
  const span = draft?.from && draft?.to ? daysInclusive(toIso(draft.from), toIso(draft.to)) : 0
  const tooLong = span > MAX_RANGE_DAYS
  const pickPreset = (p: (typeof DATE_PRESETS)[number]["value"]) => {
    onChange({ kind: "preset", preset: p })
    setOpen(false)
  }
  const apply = () => {
    if (!draft?.from || !draft?.to || tooLong) return
    onChange({ kind: "custom", start: toIso(draft.from), end: toIso(draft.to) })
    setOpen(false)
  }

  const trigger = (
    <Button variant="outline" className="gap-2" aria-label={`Periode: ${presetLabel ?? "rentang tanggal"}, ${rangeLabel(r.start, r.end)}`} />
  )
  const triggerContent = (
    <>
      <CalendarDaysIcon data-icon="inline-start" />
      {presetLabel ? <span>{presetLabel}</span> : null}
      <span className={presetLabel ? "hidden text-muted-foreground sm:inline" : undefined}>{presetLabel ? "· " : ""}{rangeLabel(r.start, r.end, true)}</span>
      <ChevronDownIcon data-icon="inline-end" />
    </>
  )

  const presets = (
    <div role="group" aria-label="Pilihan cepat" className={mobile ? "flex flex-wrap gap-2" : "flex w-48 flex-col gap-1 border-r pr-3"}>
      {!mobile ? <p className="px-2 pb-1 text-sm font-medium text-muted-foreground">Periode (WIB)</p> : null}
      {DATE_PRESETS.map((p) => {
        const active = value.kind === "preset" && value.preset === p.value
        return (
          <Button key={p.value} variant={active ? "secondary" : mobile ? "outline" : "ghost"} aria-pressed={active} className={mobile ? "" : "justify-start"} onClick={() => pickPreset(p.value)}>
            {p.label}
          </Button>
        )
      })}
    </div>
  )

  const range = (
    <div className="flex min-w-0 flex-col gap-3">
      <Calendar
        mode="range"
        locale={localeId}
        weekStartsOn={1}
        numberOfMonths={mobile ? 1 : 2}
        defaultMonth={draft?.from}
        selected={draft}
        onSelect={setDraft}
        disabled={{ after: today }}
        className={mobile ? "w-full bg-transparent p-0 [--cell-size:--spacing(11)]" : "bg-transparent p-0"}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="dari">Dari</FieldLabel>
          <Input id="dari" readOnly value={draft?.from ? draft.from.toLocaleDateString("id-ID") : ""} />
        </Field>
        <Field>
          <FieldLabel htmlFor="sampai">Sampai</FieldLabel>
          <Input id="sampai" readOnly value={draft?.to ? draft.to.toLocaleDateString("id-ID") : ""} />
        </Field>
      </div>
      <p className={tooLong ? "text-warn" : "text-muted-foreground"} role={tooLong ? "alert" : undefined}>
        {tooLong ? `Maksimal ${MAX_RANGE_DAYS} hari` : span ? `${span} hari dipilih` : "Pilih tanggal awal lalu tanggal akhir"}
      </p>
    </div>
  )

  const actions = (
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
      <Button onClick={apply} disabled={!draft?.to || tooLong}>Terapkan</Button>
    </div>
  )

  if (mobile)
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={trigger}>{triggerContent}</SheetTrigger>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-lg font-semibold">Pilih periode</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4">
            {presets}
            {range}
          </div>
          <SheetFooter className="sticky bottom-0 border-t bg-popover">{actions}</SheetFooter>
        </SheetContent>
      </Sheet>
    )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger}>{triggerContent}</PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-4">
        <div className="flex gap-4">
          {presets}
          <div className="flex flex-col gap-3">
            {range}
            {actions}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
