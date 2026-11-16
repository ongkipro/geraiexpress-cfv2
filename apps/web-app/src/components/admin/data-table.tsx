import type { ReactNode } from "react"
import { cn } from "cn"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"

// DataTableShell (DEC-236): one table vocabulary for both consoles. Desktop/tablet (≥ 768px) renders a shadcn `Table`
// with a muted 44px header; phones render the same rows as a stacked list (one accessible tree per viewport: the
// other is `hidden`, so assistive tech reads only the visible one). Numbers right-aligned with tabular figures.
export interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  align?: "left" | "right"
  /** Hide this column below `lg` (priority columns on tablets). */
  wide?: boolean
  className?: string
}

export function DataTableShell<T>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
  mobile,
  toolbar,
  footer,
  className,
}: {
  columns: Array<Column<T>>
  rows: T[]
  rowKey: (row: T) => string
  /** Accessible name of the table (visually hidden). */
  caption: string
  empty?: ReactNode
  /** Phone rendering of one row; defaults to label/value pairs of every column. */
  mobile?: (row: T) => ReactNode
  toolbar?: ReactNode
  footer?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
      {rows.length === 0 ? (
        (empty ?? null)
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border md:block">
            <Table>
              <caption className="sr-only">{caption}</caption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {columns.map((c) => (
                    <TableHead key={c.key} className={cn(c.align === "right" && "text-right", c.wide && "hidden lg:table-cell", c.className)}>
                      {c.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={rowKey(r)}>
                    {columns.map((c) => (
                      <TableCell key={c.key} className={cn(c.align === "right" && "text-right tabular-nums", c.wide && "hidden lg:table-cell", c.className)}>
                        {c.cell(r)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col divide-y rounded-lg border md:hidden" aria-label={caption}>
            {rows.map((r) => (
              <li key={rowKey(r)} className="px-4 py-3">
                {mobile ? (
                  mobile(r)
                ) : (
                  <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-base">
                    {columns.map((c) => (
                      <div key={c.key} className="contents">
                        <dt className="text-muted-foreground">{c.header}</dt>
                        <dd className={cn("min-w-0 break-words", c.align === "right" && "tabular-nums")}>{c.cell(r)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {footer ? <div className="flex flex-wrap items-center justify-between gap-2 text-base text-muted-foreground">{footer}</div> : null}
    </div>
  )
}
