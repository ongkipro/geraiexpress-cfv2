import { useCallback, useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"
import { Button } from "../../components/ui/button"
import { api, ApiError } from "../../lib/api"
import { EmptyState, ErrorState, LoadingState, PageTitle } from "../../shell/states"
import { Panel } from "../../components/admin/page"

// `/notifikasi` (visual 07 §3.2): grouped by WIB day, each item deep-links; `Tandai Semua Dibaca`.
interface Item { id: string; kind: string; title: string; body: string | null; link: string | null; createdAt: number; readAt: number | null }

const dayKey = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(ms)
const dayLabel = (ms: number) => {
  const today = dayKey(Date.now())
  const yesterday = dayKey(Date.now() - 86_400_000)
  const k = dayKey(ms)
  if (k === today) return "Hari ini"
  if (k === yesterday) return "Kemarin"
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" }).format(ms)
}
const time = (ms: number) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(ms)

export function NotifikasiPage() {
  const [data, setData] = useState<{ items: Item[]; unread: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const load = useCallback(() => {
    api<{ items: Item[]; unread: number }>("/notifications")
      .then((d) => {
        setError(null)
        setData(d)
      })
      .catch((e) => setError(e instanceof ApiError ? e.body.message : "Notifikasi tidak dapat dimuat."))
  }, [])
  useEffect(load, [load])

  async function markAll() {
    setPending(true)
    try {
      await api("/notifications/read", { body: { all: true } })
      load()
    } finally {
      setPending(false)
    }
  }
  async function open(item: Item) {
    if (!item.readAt) await api("/notifications/read", { body: { ids: [item.id] } }).catch(() => undefined)
  }

  const groups = new Map<string, Item[]>()
  for (const i of data?.items ?? []) groups.set(dayKey(i.createdAt), [...(groups.get(dayKey(i.createdAt)) ?? []), i])

  return (
    <div>
      <PageTitle title="Notifikasi">
        <Button onClick={markAll} disabled={pending || !data?.unread}>
          Tandai Semua Dibaca
        </Button>
      </PageTitle>
      {error ? <ErrorState message={error} onRetry={load} /> : !data ? <LoadingState label="Memuat notifikasi" /> : data.items.length === 0 ? (
        <Panel className="p-0 md:p-0"><EmptyState title="Belum ada notifikasi" body="Kabar penting soal kiriman, penjemputan dan akun Mengantar akan tampil di sini." /></Panel>
      ) : (
        <div className="flex flex-col gap-4 md:gap-5">
          {[...groups.entries()].map(([k, items]) => (
            <Panel key={k} aria-labelledby={`hari-${k}`} className="p-0 md:p-0">
              <h2 id={`hari-${k}`} className="border-b px-4 py-3 text-sm font-semibold md:text-base">{dayLabel(items[0]!.createdAt)}</h2>
              <ul className="divide-y">
                {items.map((i) => {
                  const inner = (
                    <span className="flex items-start gap-3">
                      <span className={`mt-2 size-2 shrink-0 rounded-full ${i.readAt ? "bg-transparent" : "bg-primary"}`} aria-hidden />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className={`text-base md:text-sm ${i.readAt ? "" : "font-semibold"}`}>{i.title}</span>
                        {i.body ? <span className="text-base md:text-sm text-muted-foreground">{i.body}</span> : null}
                      </span>
                      <span className="shrink-0 text-base md:text-sm text-muted-foreground tabular-nums">{time(i.createdAt)}</span>
                      <span className="sr-only">{i.readAt ? "sudah dibaca" : "belum dibaca"}</span>
                    </span>
                  )
                  return (
                    <li key={i.id}>
                      {i.link ? (
                        <Link to={i.link} onClick={() => open(i)} className="block min-h-11 px-4 py-3 hover:bg-muted">{inner}</Link>
                      ) : (
                        <button type="button" onClick={async () => { await open(i); load() }} className="block min-h-11 w-full px-4 py-3 text-left hover:bg-muted">{inner}</button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Panel>
          ))}
        </div>
      )}
    </div>
  )
}
