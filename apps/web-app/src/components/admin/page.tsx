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

// Shared admin kit (DEC-236): one page vocabulary for Gerai Admin (`app.`) and Super Admin (`owner.`), built only on the
// copied base-nova primitives and the comfort size contract (`design/admin-contract.json`). Both SPAs import these.

/** Page heading row: 28px title, optional one-line description, actions on the right (wrap on phones). */
export function PageHeader({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-[28px] leading-tight font-bold tracking-[-0.02em]">{title}</h2>
        {description ? <p className="text-base text-muted-foreground">{description}</p> : null}
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
    <Card className={cn("min-w-0", className)} aria-labelledby={headingId} role="region">
      <CardHeader className="border-b">
        <CardTitle>
          <h3 id={headingId}>{title}</h3>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className={cn(flush && "px-0")}>{children}</CardContent>
      {footer ? <CardFooter>{footer}</CardFooter> : null}
    </Card>
  )
}

export type Trend = { value: number; label: string; goodWhen?: "up" | "down" }

/**
 * KPI card (dashboard-01 SectionCards adapted to Direction A comfort): label, 28px value, outline trend badge with an
 * arrow (never colour alone), and one footer line with the basis. No icon tile, no gradient. `to` makes the whole card
 * a link (keyboard focus ring included).
 */
export function MetricCard({ label, value, trend, footer, to, tone }: { label: string; value: ReactNode; trend?: Trend | null; footer?: ReactNode; to?: string; tone?: "warn" }) {
  const body = (
    <Card className={cn("h-full gap-3", to && "transition-colors group-hover/metric:bg-muted/60")}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={cn("text-[28px] leading-tight font-bold tracking-[-0.01em] tabular-nums", tone === "warn" && "text-warn")}>{value}</CardTitle>
        {trend ? (
          <CardAction>
            <TrendBadge trend={trend} />
          </CardAction>
        ) : null}
      </CardHeader>
      {footer ? <CardContent className="mt-auto text-base text-muted-foreground tabular-nums">{footer}</CardContent> : null}
    </Card>
  )
  return to ? (
    <Link to={to} className="group/metric block rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
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
    <Badge variant="outline" className={cn("tabular-nums", good === true && "text-safe", good === false && "text-danger")} aria-label={`${trend.value > 0 ? "naik" : trend.value < 0 ? "turun" : "tetap"} ${Math.abs(trend.value)}% ${trend.label}`}>
      <Icon aria-hidden data-icon="inline-start" />
      {trend.value > 0 ? "+" : ""}
      {trend.value}%
    </Badge>
  )
}

/** Grid for MetricCards: 1 column on phones, 2 on tablets, `cols` on wide screens. */
export function MetricGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2", cols === 4 ? "xl:grid-cols-4" : "lg:grid-cols-3")}>{children}</div>
}

const DOT = { safe: "bg-safe", warn: "bg-warn", danger: "bg-danger", muted: "bg-muted-foreground", primary: "bg-primary" } as const
export type StatusTone = keyof typeof DOT

/** Status = dot + Indonesian label (never colour alone); a neutral outline badge keeps accent surfaces within contract. */
export function StatusBadge({ tone, children, className }: { tone: StatusTone; children: ReactNode; className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 bg-card text-foreground", className)}>
      <span className={cn("size-2 shrink-0 rounded-full", DOT[tone])} aria-hidden />
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
        <Skeleton key={i} className="h-11 w-full" />
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
      <div className="flex items-baseline justify-between gap-3 text-base">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 tabular-nums">{suffix ?? `${pct}%`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-[4px] bg-muted" aria-hidden>
        <div className="h-full rounded-[4px] bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** Label/value rows (detail cards). */
export function DetailList({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-base sm:grid-cols-[max-content_1fr]">
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
    <label htmlFor={id} className={cn("flex min-h-11 cursor-pointer gap-3 text-base has-disabled:cursor-not-allowed has-disabled:opacity-60", align === "start" ? "items-start py-2" : "items-center", className)}>
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} disabled={disabled} className={cn("size-6", align === "start" && "mt-0.5")} />
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
            "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-input bg-card px-4 py-2 text-base transition-colors hover:bg-muted has-data-checked:border-primary has-data-checked:bg-accent has-data-checked:text-accent-foreground has-data-disabled:cursor-not-allowed has-data-disabled:opacity-60",
            c.description && "items-start",
          )}
        >
          <RadioGroupItem value={c.value} disabled={c.disabled} className={c.description ? "mt-0.5" : undefined} />
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">{c.label}</span>
            {c.description ? <span className="text-muted-foreground has-data-checked:text-accent-foreground">{c.description}</span> : null}
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
    <Tag data-slot="card" className={cn("min-w-0 rounded-lg border bg-card p-4 text-base text-card-foreground md:p-6", className)} {...rest}>
      {children}
    </Tag>
  )
}

/** A card list with row dividers (DEC-236): replaces hand-rolled `ul.divide-y.rounded-lg.border.bg-card`. */
export function ItemList({ className, children, ...rest }: { className?: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <ul data-slot="card" className={cn("min-w-0 divide-y rounded-lg border bg-card text-card-foreground", className)} {...rest}>
      {children}
    </ul>
  )
}
