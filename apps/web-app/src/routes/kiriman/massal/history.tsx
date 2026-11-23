import { useCallback, useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"
import { api, ApiError } from "../../../lib/api"
import { EmptyState, ErrorState, LoadingState, PageTitle } from "../../../shell/states"
import { rp } from "../../kasir/quote-panel"
import { BATCH_STATE, when, type Batch } from "./shared"
import { ItemList } from "../../../components/admin/page"

// `Kiriman › Riwayat Massal` (spec 03 §1.3 step 6): batches with date, sender, rows, ready/failed, total, status.
type Item = Batch & { sender_name: string | null; total_due_idr: number }

export function RiwayatMassalPage() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    api<{ items: Item[] }>("/bulk")
      .then((d) => {
        setError(null)
        setItems(d.items)
      })
      .catch((e) => setError(e instanceof ApiError ? e.body.message : "Riwayat tidak dapat dimuat."))
  }, [])
  useEffect(load, [load])
  if (error) return <div><PageTitle title="Riwayat Massal" /><ErrorState message={error} onRetry={load} /></div>
  if (!items) return <LoadingState label="Memuat riwayat" />
  return (
    <div className="pb-24 md:pb-0">
      <PageTitle title="Riwayat Massal" description="Semua batch Paket Massal gerai ini.">
        <Link to="/kasir/multi" className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-base md:text-sm font-medium text-primary-foreground md:h-10">Paket Massal Baru</Link>
      </PageTitle>
      {items.length === 0 ? (
        <EmptyState title="Belum ada batch" body="Batch Paket Massal yang dibuat akan muncul di sini." />
      ) : (
        <ItemList>
          {items.map((b) => (
            <li key={b.id}>
              <Link to="/kiriman/massal/$batch" params={{ batch: b.id }} className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-4 py-3 text-base md:text-sm hover:bg-muted">
                <span><span className="font-medium">{when(b.created_at)}</span> · {b.sender_name ?? "—"} · {b.row_count} baris</span>
                <span className="tabular-nums">{b.ready_count} siap{b.failed_count ? ` · ${b.failed_count} perlu diperbaiki` : ""} · {rp(b.total_due_idr)} · <span className={b.state === "partially_failed" ? "font-medium text-danger" : "text-muted-foreground"}>{BATCH_STATE[b.state] ?? b.state}</span>{b.counter_payment_status === "paid" ? " · Lunas" : ""}</span>
              </Link>
            </li>
          ))}
        </ItemList>
      )}
    </div>
  )
}
