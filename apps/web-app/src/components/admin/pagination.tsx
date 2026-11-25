import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { cn } from "cn"
import { Button } from "../ui/button"

export const DEFAULT_PAGE_SIZE = 20

/** Pure client-side slicer matching the server's 1-based `{ page, pageSize, total, totalPages }` contract. */
export function paginate<T>(items: readonly T[], requestedPage: number, pageSize = DEFAULT_PAGE_SIZE): {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
} {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), totalPages)
  const start = (page - 1) * pageSize
  return { items: items.slice(start, start + pageSize), page, pageSize, total, totalPages }
}

/** Builds a compact page sequence with ellipses (e.g. `[1, "…", 4, 5, 6, "…", 12]`). */
function pageRange(current: number, totalPages: number): Array<number | "…"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const out: Array<number | "…"> = [1]
  const left = Math.max(2, current - 1)
  const right = Math.min(totalPages - 1, current + 1)
  if (left > 2) out.push("…")
  for (let p = left; p <= right; p++) out.push(p)
  if (right < totalPages - 1) out.push("…")
  out.push(totalPages)
  return out
}

/**
 * Standard Indonesian counter-ergonomic pagination bar (max 20 rows/page, `h-11 md:h-9`, `tabular-nums`, keyboard
 * accessible). Fits cleanly inside `DataTableShell`'s `footer` slot or below any list card.
 */
export function PageNav({
  page,
  totalPages,
  total,
  pageSize = DEFAULT_PAGE_SIZE,
  onPageChange,
  itemLabel = "data",
  loading = false,
  className,
}: {
  page: number
  totalPages: number
  total: number
  pageSize?: number
  onPageChange: (next: number) => void
  itemLabel?: string
  loading?: boolean
  className?: string
}) {
  if (total <= 0) return null
  const safePage = Math.min(Math.max(1, page), Math.max(1, totalPages))
  const start = (safePage - 1) * pageSize + 1
  const end = Math.min(total, safePage * pageSize)
  const pages = pageRange(safePage, totalPages)

  return (
    <nav
      aria-label={`Navigasi halaman ${itemLabel}`}
      className={cn("flex w-full flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between", className)}
    >
      <p className="text-xs text-muted-foreground tabular-nums">
        Menampilkan <span className="font-medium text-slate-900">{start.toLocaleString("id-ID")}–{end.toLocaleString("id-ID")}</span> dari{" "}
        <span className="font-medium text-slate-900">{total.toLocaleString("id-ID")}</span> {itemLabel}
        {totalPages > 1 ? ` · Halaman ${safePage} dari ${totalPages}` : ""}
      </p>
      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            aria-label="Halaman sebelumnya"
            className="h-11 px-3 md:h-8 md:px-2.5"
          >
            <ChevronLeftIcon aria-hidden className="size-4" />
            <span className="hidden sm:inline">Sebelumnya</span>
          </Button>
          <div className="flex items-center gap-1" role="list">
            {pages.map((p, idx) =>
              p === "…" ? (
                <span key={`e-${idx}`} aria-hidden className="inline-flex h-11 min-w-7 items-center justify-center text-xs text-muted-foreground md:h-8">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  disabled={loading}
                  aria-current={p === safePage ? "page" : undefined}
                  aria-label={`Halaman ${p}`}
                  onClick={() => p !== safePage && onPageChange(p)}
                  className={cn(
                    "inline-flex h-11 min-w-11 items-center justify-center rounded-lg border px-2 text-sm font-medium tabular-nums transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50 md:h-8 md:min-w-8 md:text-xs",
                    p === safePage
                      ? "border-primary bg-primary text-primary-foreground shadow-xs"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                  )}
                >
                  {p}
                </button>
              ),
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            aria-label="Halaman berikutnya"
            className="h-11 px-3 md:h-8 md:px-2.5"
          >
            <span className="hidden sm:inline">Berikutnya</span>
            <ChevronRightIcon aria-hidden className="size-4" />
          </Button>
        </div>
      ) : null}
    </nav>
  )
}
