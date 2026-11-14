import { CalendarDaysIcon, ChevronDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DATE_PRESETS, rangeLabel, resolvePreset, type DatePreset } from "@/lib/date-range"

// shadcn DropdownMenu with preset radio items. A custom range (two-month calendar, as in AdsBookCMS
// AdminDateRangeFilter) is the M3 follow-up; the prototype shows presets only.
export function DateRangeFilter({ value, onChange }: { value: DatePreset; onChange: (v: DatePreset) => void }) {
  const label = DATE_PRESETS.find((p) => p.value === value)?.label ?? ""
  const r = resolvePreset(value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="gap-2" aria-label={`Periode: ${label}, ${rangeLabel(r.start, r.end)}`} />}>
        <CalendarDaysIcon data-icon="inline-start" />
        <span>{label}</span>
        <span className="hidden text-muted-foreground sm:inline">· {rangeLabel(r.start, r.end)}</span>
        <ChevronDownIcon data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Periode (WIB)</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as DatePreset)}>
            {DATE_PRESETS.map((p) => (
              <DropdownMenuRadioItem key={p.value} value={p.value}>
                {p.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
