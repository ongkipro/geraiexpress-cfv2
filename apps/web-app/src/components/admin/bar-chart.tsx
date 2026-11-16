import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "../ui/chart"

// Shared bar chart (DEC-236, shadcn Chart on Recharts): solid fills from `--chart-*` tokens (no gradients), 14px+ axis
// text, tabular tooltip, and a visually hidden data table so the numbers are readable without the graphic.
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
    <figure className="flex min-w-0 flex-col">
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }} role="img" aria-label={caption}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={xKey as string} tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={xLabel} fontSize={14} />
          <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} fontSize={14} tickFormatter={(v: number) => nf.format(v)} />
          <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent labelFormatter={(_, payload) => tooltipLabel(payload)} />} />
          {series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId={stacked ? "a" : undefined}
              fill={`var(--color-${s.key})`}
              radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]}
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
