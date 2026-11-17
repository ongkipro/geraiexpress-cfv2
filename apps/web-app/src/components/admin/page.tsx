import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { AlertCircleIcon, ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from "lucide-react"
import { cn } from "cn"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../ui/alert"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { Checkbox } from "../ui/checkbox"
import { RadioGroup, RadioGroupItem } from "../ui/radio-group"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty"
import { Skeleton } from "../ui/skeleton"

// Shared admin kit (DEC-236, DEC-239): one page vocabulary for Gerai Admin (`app.`) and Super Admin (`owner.`), built
// only on the copied base-nova primitives and the desk size contract (`design/admin-contract.json`: 14px body, 12px
// labels, 24px figures — AdsBookCMS / TokoPhi / dashboard-01). Both SPAs import these.

/**
 * Page heading row — the page's only `h1` (the topbar breadcrumb is navigation, never a second title): 24px title,
 * one muted line, actions on the right (they wrap under the title on phones).
 */
export function PageHeader({ title, description, children, className }: { title: string; description?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-end justify-between gap-3 [.flex-col>&]:mb-0", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-xl leading-tight font-semibold tracking-[-0.02em] text-slate-950 md:text-2xl">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  )
}

/**
 * One titled region (replaces hand-rolled `rounded-lg border` sections): Card with a bordered header, optional
 * description and action, then content. `flush` removes the content padding for tables that bleed to the edge.
 */
export function SectionCard({
  title,
  description,
  action,
  children,
  footer,
  flush,
  className,
  id,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  footer?: ReactNode
  flush?: boolean
  className?: string
  id?: string
}) {
  const headingId = id ? `${id}-judul` : undefined
  return (
    <Card className={cn("min-w-0 gap-0 py-0", className)} aria-labelledby={headingId} role="region">
      <CardHeader className="border-b border-slate-100 py-3.5 md:py-4">
        <CardTitle>
          <h2 id={headingId} className="text-sm font-semibold text-slate-950 md:text-base">{title}</h2>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className={cn("py-4 md:py-5", flush && "px-0 py-0 md:py-0")}>{children}</CardContent>
      {footer ? <CardFooter>{footer}</CardFooter> : null}
    </Card>
  )
}

export type Trend = { value: number; label: string; goodWhen?: "up" | "down" }

/**
 * KPI tile (TokoPhi `kpi-tile` rhythm): header row = small muted icon + 12px label, delta pill on the right; 24px bold
 * tabular figure; one 12px caption. Padding 16/20px, 12px between groups, 4px inside a group. No icon tile, no
 * gradient; the delta pill pairs a glyph with a word (never colour alone). `to` makes the whole tile a link.
 */
export function MetricCard({ label, value, trend, footer, to, tone, icon: Icon }: { label: string; value: ReactNode; trend?: Trend | null; footer?: ReactNode; to?: string; tone?: "warn"; icon?: typeof ArrowUpRightIcon }) {
  const body = (
    <Card className={cn("h-full gap-0 p-4 md:p-5", to && "transition-colors group-hover/metric:border-slate-300 group-hover/metric:bg-slate-50/60")}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {Icon ? <Icon aria-hidden className="size-3.5 shrink-0" /> : null}
          <span className="truncate">{label}</span>
        </span>
        {trend ? <TrendBadge trend={trend} /> : null}
      </div>
      <div className={cn("mt-3 text-2xl leading-none font-bold tracking-[-0.02em] whitespace-nowrap text-slate-950 tabular-nums", tone === "warn" && "text-warn")}>{value}</div>
      {footer ? <div className="mt-1.5 line-clamp-2 text-xs text-muted-foreground tabular-nums">{footer}</div> : null}
    </Card>
  )
  return to ? (
    <Link to={to} className="group/metric block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    body
  )
}

export function TrendBadge({ trend }: { trend: Trend }) {
  const up = trend.value > 0
  const flat = trend.value === 0
  const good = flat ? null : (trend.goodWhen ?? "up") === "up" ? up : !up
  const Icon = flat ? MinusIcon : up ? ArrowUpRightIcon : ArrowDownRightIcon
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        good === true ? "bg-emerald-500/12 text-emerald-700" : good === false ? "bg-rose-500/12 text-rose-700" : "bg-slate-100 text-muted-foreground",
      )}
      aria-label={`${trend.value > 0 ? "naik" : trend.value < 0 ? "turun" : "tetap"} ${Math.abs(trend.value)}% ${trend.label}`}
    >
      <Icon aria-hidden className="size-3" />
      {trend.value > 0 ? "+" : ""}
      {trend.value.toLocaleString("id-ID")}%
    </span>
  )
}

/** Grid for MetricCards: 1 column on phones, 2 on tablets, `cols` on wide screens. */
export function MetricGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 }) {
  return <div className={cn("grid grid-cols-2 gap-2.5 sm:gap-3", cols === 4 ? "xl:grid-cols-4" : "lg:grid-cols-3")}>{children}</div>
}

const DOT = { safe: "bg-safe", warn: "bg-warn", danger: "bg-danger", muted: "bg-muted-foreground", primary: "bg-primary" } as const
export type StatusTone = keyof typeof DOT

/** Status = dot + Indonesian label (never colour alone); a neutral outline badge keeps accent surfaces within contract. */
export function StatusBadge({ tone, children, className }: { tone: StatusTone; children: ReactNode; className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 border-slate-200 bg-white text-slate-700", className)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", DOT[tone])} aria-hidden />
      {children}
    </Badge>
  )
}

/** Page-level condition (banner): Alert with title, description and an optional action. Not for toasts. */
export function CalloutAlert({ title, children, action, tone = "default" }: { title: string; children?: ReactNode; action?: ReactNode; tone?: "default" | "destructive" }) {
  return (
    <Alert variant={tone}>
      <AlertCircleIcon aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      {children ? <AlertDescription>{children}</AlertDescription> : null}
      {action ? <AlertAction>{action}</AlertAction> : null}
    </Alert>
  )
}

export function LoadingState({ label = "Memuat…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label={label}>
      <Skeleton className="h-6 w-1/3" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertCircleIcon aria-hidden />
      <AlertTitle>{message}</AlertTitle>
      {onRetry ? (
        <AlertDescription>
          <Button variant="outline" onClick={onRetry} className="mt-2">
            Coba lagi
          </Button>
        </AlertDescription>
      ) : null}
    </Alert>
  )
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <Empty className="border-0 py-10">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{body}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  )
}

/** Proportional bar for a share of a total (e.g. order sources); value text is always shown beside it. */
export function ShareBar({ label, value, total, suffix }: { label: string; value: number; total: number; suffix?: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 tabular-nums">{suffix ?? `${pct}%`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** Label/value rows (detail cards). */
export function DetailList({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[max-content_1fr]">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="min-w-0 break-words">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Checkbox with its label as a full ≥ 44px row (comfort `labelTarget`): base-nova `Checkbox` keeps a native input
 * underneath, so `getByLabel(...)`/`.check()` and form semantics behave like the native control it replaces.
 */
export function CheckboxField({
  checked,
  onCheckedChange,
  children,
  disabled,
  id,
  align = "center",
  className,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  children: ReactNode
  disabled?: boolean
  id?: string
  align?: "center" | "start"
  className?: string
}) {
  return (
    <label htmlFor={id} className={cn("flex min-h-11 cursor-pointer gap-2.5 text-base md:text-sm has-disabled:cursor-not-allowed has-disabled:opacity-60 md:min-h-9 md:text-sm", align === "start" ? "items-start py-1.5" : "items-center", className)}>
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} disabled={disabled} className={cn("size-6 md:size-[18px]", align === "start" && "mt-0.5")} />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  )
}

export interface Choice<V extends string> {
  value: V
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
}

/**
 * Single choice from 2–7 options as selectable option cards (DEC-236 replaces hand-rolled `role="radio"` pills):
 * base-nova `RadioGroup` (arrow-key navigation, one tab stop, `role="radio"` named by its label), each option a full
 * ≥ 44px row with a visible radio dot, so the whole card is the hit area.
 */
export function ChoiceGroup<V extends string>({
  label,
  value,
  onValueChange,
  choices,
  layout = "row",
  className,
}: {
  label: string
  value: V | null
  onValueChange: (v: V) => void
  choices: Array<Choice<V>>
  layout?: "row" | "column" | "grid"
  className?: string
}) {
  return (
    <RadioGroup
      aria-label={label}
      value={value ?? ""}
      onValueChange={(v) => onValueChange(v as V)}
      className={cn(layout === "row" ? "flex flex-wrap gap-2" : layout === "grid" ? "grid gap-2 sm:grid-cols-2" : "flex flex-col gap-2", className)}
    >
      {choices.map((c) => (
        <label
          key={c.value}
          className={cn(
            "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-base md:text-sm transition-colors hover:bg-slate-50 has-data-checked:border-primary has-data-checked:bg-accent has-data-checked:text-accent-foreground has-data-disabled:cursor-not-allowed has-data-disabled:opacity-60 md:min-h-9 md:text-sm",
            c.description && "items-start",
          )}
        >
          <RadioGroupItem value={c.value} disabled={c.disabled} className={c.description ? "mt-0.5" : undefined} />
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">{c.label}</span>
            {c.description ? <span className="text-xs text-muted-foreground">{c.description}</span> : null}
          </span>
        </label>
      ))}
    </RadioGroup>
  )
}

/**
 * A plain card surface for a region whose heading lives inside it (forms, step panels, read-only blocks): the shared
 * Card primitive with comfort padding. Use SectionCard when the region has a title row of its own.
 */
export function Panel({ as = "section", className, children, ...rest }: { as?: "section" | "div" | "form" | "li" | "details" | "dl"; className?: string; children: ReactNode } & Record<string, unknown>) {
  const Tag = as as "section"
  return (
    <Tag data-slot="card" className={cn("min-w-0 rounded-xl border border-slate-200/85 bg-card p-4 text-sm text-card-foreground shadow-[0_1px_2px_rgba(15,23,42,0.03)] md:p-5", className)} {...rest}>
      {children}
    </Tag>
  )
}

/** A card list with row dividers (DEC-236): replaces hand-rolled `ul.divide-y.rounded-lg.border.bg-card`. */
export function ItemList({ className, children, ...rest }: { className?: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <ul data-slot="card" className={cn("min-w-0 divide-y divide-slate-100 rounded-xl border border-slate-200/85 bg-card text-sm text-card-foreground shadow-[0_1px_2px_rgba(15,23,42,0.03)]", className)} {...rest}>
      {children}
    </ul>
  )
}
