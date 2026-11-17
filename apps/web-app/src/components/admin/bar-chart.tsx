import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "../ui/chart"

// Shared bar chart (DEC-236, DEC-239 — AdsBookCMS `DashboardRevenueChart`): solid fills from `--chart-*` tokens (no
// gradients), bars capped at 28px so a sparse range still reads as designed, dashed hairline grid, 12px slate ticks, a
// legend row of dots, and a visually hidden data table so the numbers are readable without the graphic.
export interface BarSeries {
  key: string
  label: string
  color: string
}

const nf = new Intl.NumberFormat("id-ID")

export function AdminBarChart<T extends Record<string, string | number>>({
  data,
  xKey,
  series,
  xLabel,
  caption,
  stacked,
  height = 240,
}: {
  data: T[]
  xKey: keyof T & string
  series: BarSeries[]
  /** Short label for an x value (axis ticks and the hidden table). */
  xLabel: (v: string | number) => string
  /** Accessible summary (also the hidden table caption). */
  caption: string
  stacked?: boolean
  height?: number
}) {
  const config = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }])) satisfies ChartConfig
  // The tooltip's own `label` is the series name; the x value lives on the hovered row (payload[0].payload).
  const tooltipLabel = (payload: ReadonlyArray<{ payload?: Record<string, unknown> }> | undefined) => {
    const x = payload?.[0]?.payload?.[xKey]
    return typeof x === "string" || typeof x === "number" ? xLabel(x) : ""
  }
  return (
    <figure className="flex min-w-0 flex-col gap-3">
      {series.length > 1 ? (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }} role="img" aria-label={caption}>
        <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis dataKey={xKey as string} tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} tickFormatter={xLabel} tick={{ fontSize: 12, fill: "#64748b" }} />
          <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} tick={{ fontSize: 12, fill: "#64748b" }} tickFormatter={(v: number) => nf.format(v)} />
          <ChartTooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} content={<ChartTooltipContent labelFormatter={(_, payload) => tooltipLabel(payload)} />} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId={stacked ? "a" : undefined}
              fill={`var(--color-${s.key})`}
              radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ChartContainer>
      <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Periode</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={String(row[xKey])}>
              <th scope="row">{xLabel(row[xKey] as string | number)}</th>
              {series.map((s) => (
                <td key={s.key}>{nf.format(Number(row[s.key] ?? 0))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  )
}
