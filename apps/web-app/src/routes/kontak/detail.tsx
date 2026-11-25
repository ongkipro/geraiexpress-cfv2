import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useParams } from "@tanstack/react-router"
import { ArrowLeftIcon, CheckIcon, MapPinIcon, MessageCircleIcon, PencilIcon, PlusIcon } from "lucide-react"
import { DataTableShell } from "../../components/admin/data-table"
import { LinkButton } from "../../components/admin/link-button"
import { MetricCard, MetricGrid, Panel, SectionCard, StatusBadge, type StatusTone } from "../../components/admin/page"
import { DEFAULT_PAGE_SIZE, PageNav } from "../../components/admin/pagination"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { api, ApiError } from "../../lib/api"
import { courierLabel, statusLabel } from "../../lib/status"
import { EmptyState, ErrorState, LoadingState, PageTitle } from "../../shell/states"
import { isOwner, useWorkspace } from "../../shell/workspace"
import { rp } from "../kasir/quote-panel"
import { RecipientForm } from "./penerima"
import { SenderForm } from "./pengirim"
import { ContactDialog, RiskChip, rupiah, type RiskBadge } from "./shared"

interface SenderDetail {
  id: string
  sender_kind: "walk_in" | "reseller_dropship"
  true_name: string
  true_phone: string
  wa_verified_at: number | null
  true_street: string | null
  true_area_id: string | null
  true_area_label: string | null
  true_postal_code?: string | null
  display_brand_name: string | null
  display_brand_phone: string | null
  hide_gerai_branding: number
  shipments_count: number
  deposit_balance_idr?: number
}

interface RecipientDetail {
  id: string
  name: string
  phone: string
  mengantar_area_id: string | null
  subdistrict_name: string | null
  postal_code: string | null
  street_address: string
  address_note: string | null
  cod_delivered_count: number
  cod_rts_count: number
  shipments_count?: number
  risk: { badge: RiskBadge; rtsBps: number | null }
}

interface HistoryRow {
  slug: string
  created_at: number
  issued_at: number | null
  courier_code: string
  service_code: string
  awb_number: string | null
  status: string
  dispatch_state: string
  cod_fee_mode: string
  counter_due_idr: number
  cod_collection_total_idr: number
  counter_payment_status: string
  counter_payment_method: string | null
  counterparty_id: string | null
  counterparty_name: string | null
  counterparty_area: string | null
  latest_event_category: string | null
  latest_event_status: string | null
  latest_event_text: string | null
  latest_event_at: number | null
}

interface HistorySummary {
  total: number
  in_progress: number
  delivered: number
  rts: number
  cancelled: number
  total_due_idr: number
  last_shipment_at: number | null
}

interface HistoryResp {
  items: HistoryRow[]
  summary: HistorySummary
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const when = (ms: number) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(ms)
const waHref = (phone: string) => {
  const digits = phone.replace(/\D/g, "")
  return digits ? `https://wa.me/62${digits.replace(/^(62|0)/, "")}` : null
}
const statusTone = (dispatchState: string, status: string): StatusTone => {
  if (dispatchState === "cancelled" || status === "cancelled") return "muted"
  if (dispatchState !== "issued") return "warn"
  if (status === "delivered") return "safe"
  if (status.startsWith("rts_") || status === "provider_returned" || status === "undelivery_hold" || status === "lost") return "danger"
  return "primary"
}
const METHOD_LABEL: Record<string, string> = { qris: "QRIS", tunai: "Tunai", transfer: "Transfer", deposit: "Deposit" }

function PaymentPill({ status, method }: { status: string; method: string | null }) {
  if (status === "paid") return <StatusBadge tone="safe">{method ? `Lunas · ${METHOD_LABEL[method] ?? method}` : "Lunas"}</StatusBadge>
  if (status === "unpaid") return <StatusBadge tone="warn">Belum dibayar</StatusBadge>
  if (status === "voided") return <StatusBadge tone="muted">Dibatalkan</StatusBadge>
  return <StatusBadge tone="muted">Tanpa tagihan</StatusBadge>
}

function ContactHistorySection({
  kind,
  id,
  onPageChange,
  history,
  loading,
  error,
  onRetry,
}: {
  kind: "sender" | "recipient"
  id: string
  onPageChange: (p: number) => void
  history: HistoryResp | null
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const otherKind = kind === "sender" ? "penerima" : "pengirim"
  const otherLabel = kind === "sender" ? "Penerima" : "Pengirim"

  return (
    <div className="flex flex-col gap-5">
      {history ? (
        <MetricGrid>
          <MetricCard label="Total kiriman" value={history.summary.total.toLocaleString("id-ID")} footer={history.summary.last_shipment_at ? `Terakhir ${when(history.summary.last_shipment_at)}` : "Belum pernah kirim"} />
          <MetricCard label="Dalam proses" value={history.summary.in_progress.toLocaleString("id-ID")} footer="Siap jemput hingga diantar kurir" />
          <MetricCard label="Terkirim" value={history.summary.delivered.toLocaleString("id-ID")} footer="Sudah diterima tujuan" />
          <MetricCard label="Retur" value={history.summary.rts.toLocaleString("id-ID")} tone={history.summary.rts > 0 ? "warn" : undefined} footer={history.summary.cancelled > 0 ? `${history.summary.cancelled} dibatalkan` : "Paket kembali ke gerai"} />
        </MetricGrid>
      ) : null}

      <SectionCard
        id={`riwayat-${kind}-${id}`}
        title={kind === "sender" ? "Riwayat pengiriman aktual" : "Riwayat penerimaan paket"}
        description="Klik INV untuk membuka detail lengkap, checkpoint kurir, dan sinkronisasi status Mengantar."
        flush
      >
        {error ? (
          <div className="p-4"><ErrorState message={error} onRetry={onRetry} /></div>
        ) : !history ? (
          <div className="p-4"><LoadingState label="Memuat riwayat kiriman" /></div>
        ) : (
          <DataTableShell
            bare
            caption="Riwayat kiriman kontak"
            rows={history.items}
            rowKey={(r) => r.slug}
            empty={
              <EmptyState
                title={kind === "sender" ? "Belum ada riwayat pengiriman" : "Belum ada riwayat penerimaan"}
                body="Kiriman yang sudah diterbitkan atau diproses untuk kontak ini akan muncul di sini lengkap dengan checkpoint terbarunya."
                action={<LinkButton to="/kasir"><PlusIcon aria-hidden data-icon="inline-start" /> Buat Pengiriman</LinkButton>}
              />
            }
            footer={
              <PageNav
                page={history.page}
                totalPages={history.totalPages}
                total={history.total}
                pageSize={history.pageSize || DEFAULT_PAGE_SIZE}
                onPageChange={onPageChange}
                itemLabel="kiriman"
                loading={loading}
              />
            }
            columns={[
              {
                key: "inv",
                header: "INV & waktu",
                cell: (r) => (
                  <div>
                    <Link to="/kiriman/$slug" params={{ slug: r.slug }} className="font-semibold text-primary underline-offset-4 hover:underline tabular-nums">
                      INV {r.slug.toUpperCase()}
                    </Link>
                    <span className="block text-xs text-muted-foreground tabular-nums">{when(r.created_at)}</span>
                  </div>
                ),
              },
              {
                key: "kurir",
                header: "Kurir & resi",
                cell: (r) => (
                  <div>
                    <span className="font-medium">{courierLabel(r.courier_code)}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">{r.awb_number ?? "Resi belum terbit"}</span>
                  </div>
                ),
              },
              {
                key: "lawan",
                header: otherLabel,
                wide: true,
                className: "whitespace-normal",
                cell: (r) => (
                  <div>
                    {r.counterparty_id ? (
                      <Link
                        to={otherKind === "penerima" ? "/kontak/penerima/$id" : "/kontak/pengirim/$id"}
                        params={{ id: r.counterparty_id }}
                        className="font-medium text-slate-900 underline-offset-4 hover:text-primary hover:underline"
                      >
                        {r.counterparty_name ?? "—"}
                      </Link>
                    ) : (
                      <span className="font-medium">{r.counterparty_name ?? "—"}</span>
                    )}
                    {r.counterparty_area ? <span className="block text-xs text-muted-foreground">{r.counterparty_area.split(",")[0]}</span> : null}
                  </div>
                ),
              },
              {
                key: "checkpoint",
                header: "Status & checkpoint terakhir",
                className: "whitespace-normal",
                cell: (r) => {
                  const effective = r.dispatch_state === "issued" ? r.status : r.dispatch_state
                  const checkpoint = r.latest_event_text ?? (r.latest_event_status ? statusLabel(r.latest_event_status) : r.latest_event_category)
                  return (
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge tone={statusTone(r.dispatch_state, r.status)}>{statusLabel(effective)}</StatusBadge>
                      {checkpoint ? (
                        <span className="line-clamp-1 max-w-xs text-xs text-muted-foreground">
                          {checkpoint}{r.latest_event_at ? ` · ${when(r.latest_event_at)}` : ""}
                        </span>
                      ) : null}
                    </div>
                  )
                },
              },
              {
                key: "tagihan",
                header: "Tagihan & bayar",
                align: "right",
                cell: (r) => (
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-medium tabular-nums">{rp(r.counter_due_idr)}</span>
                    <PaymentPill status={r.counter_payment_status} method={r.counter_payment_method} />
                  </div>
                ),
              },
            ]}
            mobile={(r) => {
              const effective = r.dispatch_state === "issued" ? r.status : r.dispatch_state
              const checkpoint = r.latest_event_text ?? (r.latest_event_status ? statusLabel(r.latest_event_status) : r.latest_event_category)
              return (
                <div className="flex flex-col gap-1.5 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link to="/kiriman/$slug" params={{ slug: r.slug }} className="font-semibold text-primary underline-offset-4 hover:underline tabular-nums">
                      INV {r.slug.toUpperCase()}
                    </Link>
                    <span className="text-xs text-muted-foreground tabular-nums">{when(r.created_at)}</span>
                  </div>
                  <p className="tabular-nums">{courierLabel(r.courier_code)} · {r.awb_number ?? "Resi belum terbit"}</p>
                  <p className="text-xs text-muted-foreground">{otherLabel}: {r.counterparty_name ?? "—"}{r.counterparty_area ? ` (${r.counterparty_area.split(",")[0]})` : ""}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone={statusTone(r.dispatch_state, r.status)}>{statusLabel(effective)}</StatusBadge>
                    <PaymentPill status={r.counter_payment_status} method={r.counter_payment_method} />
                    <span className="ml-auto font-medium tabular-nums">{rp(r.counter_due_idr)}</span>
                  </div>
                  {checkpoint ? <p className="text-xs text-muted-foreground">{checkpoint}{r.latest_event_at ? ` · ${when(r.latest_event_at)}` : ""}</p> : null}
                </div>
              )
            }}
          />
        )}
      </SectionCard>
    </div>
  )
}

export function PengirimDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string }
  const w = useWorkspace()
  const owner = isOwner(w)
  const [sender, setSender] = useState<SenderDetail | null>(null)
  const [history, setHistory] = useState<HistoryResp | null>(null)
  const [page, setPage] = useState(1)
  const [loadedKey, setLoadedKey] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [histError, setHistError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const gen = useRef(0)
  const activeKey = `${id}:${page}`
  const loading = loadedKey !== activeKey && !error

  const load = useCallback((targetPage: number) => {
    const mine = ++gen.current
    const key = `${id}:${targetPage}`
    Promise.all([
      api<{ item: SenderDetail }>(`/contacts/senders/${id}`),
      api<HistoryResp>(`/contacts/senders/${id}/shipments?page=${targetPage}&limit=${DEFAULT_PAGE_SIZE}`),
    ])
      .then(([c, h]) => {
        if (mine !== gen.current) return
        setError(null)
        setHistError(null)
        setSender(c.item)
        setHistory(h)
        setLoadedKey(key)
      })
      .catch((e) => {
        if (mine !== gen.current) return
        const msg = e instanceof ApiError ? e.body.message : "Data pengirim tidak dapat dimuat."
        setError(msg)
        setHistError(msg)
        setLoadedKey(key)
      })
  }, [id])

  useEffect(() => {
    load(page)
    const g = gen
    return () => { g.current++ }
  }, [load, page])

  if (error && !sender) {
    return (
      <div>
        <PageTitle title="Detail Pengirim" />
        <ErrorState message={error} onRetry={() => load(page)} />
      </div>
    )
  }
  if (!sender) {
    return (
      <div>
        <PageTitle title="Detail Pengirim" />
        <LoadingState label="Memuat profil pengirim" rows={4} />
      </div>
    )
  }

  const wa = waHref(sender.true_phone)
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex items-center">
        <Link to="/kontak/pengirim" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-slate-900 md:min-h-8">
          <ArrowLeftIcon aria-hidden className="size-4" /> Kembali ke Data Pengirim
        </Link>
      </div>
      <PageTitle
        title={sender.display_brand_name ?? sender.true_name}
        description={sender.sender_kind === "reseller_dropship" ? `Toko Reseller · Pengirim asli: ${sender.true_name}` : "Pengirim Walk-in"}
      >
        <Button variant="outline" onClick={() => setEditing(true)}>
          <PencilIcon aria-hidden /> Ubah Data
        </Button>
        <LinkButton to="/kasir">
          <PlusIcon aria-hidden data-icon="inline-start" /> Buat Kiriman
        </LinkButton>
      </PageTitle>

      <Panel className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-950">{sender.true_name}</span>
            {sender.sender_kind === "reseller_dropship" ? <Badge variant="outline">Toko Reseller</Badge> : <Badge variant="secondary">Walk-in</Badge>}
            {sender.wa_verified_at ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-safe">
                <CheckIcon aria-hidden className="size-3.5" /> WA terverifikasi
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">WA belum diverifikasi</span>
            )}
          </div>
          <p className="text-muted-foreground tabular-nums">
            WhatsApp: <span className="font-medium text-slate-800">{sender.true_phone}</span>
            {sender.display_brand_phone ? ` · HP label: ${sender.display_brand_phone}` : ""}
            {owner && typeof sender.deposit_balance_idr === "number" ? ` · Deposit: ${rupiah(sender.deposit_balance_idr)}` : ""}
          </p>
          {sender.true_street || sender.true_area_label ? (
            <p className="flex items-start gap-1.5 text-muted-foreground">
              <MapPinIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{[sender.true_street, sender.true_area_label, sender.true_postal_code].filter(Boolean).join(", ")}</span>
            </p>
          ) : null}
        </div>
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 md:h-9"
          >
            <MessageCircleIcon aria-hidden className="size-4 text-emerald-600" /> Chat WhatsApp
          </a>
        ) : null}
      </Panel>

      <ContactHistorySection
        kind="sender"
        id={sender.id}
        onPageChange={setPage}
        history={history}
        loading={loading}
        error={histError}
        onRetry={() => load(page)}
      />

      <ContactDialog
        open={editing}
        onOpenChange={(o) => !o && setEditing(false)}
        title="Ubah Pengirim"
        description="Perbarui data pengirim di bawah. Klik Batal jika ingin menutup tanpa menyimpan."
      >
        <SenderForm
          key={sender.id}
          sender={sender}
          owner={owner}
          onSaved={() => {
            setEditing(false)
            load(page)
          }}
          onCancel={() => setEditing(false)}
          onVerified={() => load(page)}
        />
      </ContactDialog>
    </div>
  )
}

export function PenerimaDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string }
  const w = useWorkspace()
  const owner = isOwner(w)
  const [recipient, setRecipient] = useState<RecipientDetail | null>(null)
  const [history, setHistory] = useState<HistoryResp | null>(null)
  const [page, setPage] = useState(1)
  const [loadedKey, setLoadedKey] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [histError, setHistError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const gen = useRef(0)
  const activeKey = `${id}:${page}`
  const loading = loadedKey !== activeKey && !error

  const load = useCallback((targetPage: number) => {
    const mine = ++gen.current
    const key = `${id}:${targetPage}`
    Promise.all([
      api<{ item: RecipientDetail }>(`/contacts/recipients/${id}`),
      api<HistoryResp>(`/contacts/recipients/${id}/shipments?page=${targetPage}&limit=${DEFAULT_PAGE_SIZE}`),
    ])
      .then(([c, h]) => {
        if (mine !== gen.current) return
        setError(null)
        setHistError(null)
        setRecipient(c.item)
        setHistory(h)
        setLoadedKey(key)
      })
      .catch((e) => {
        if (mine !== gen.current) return
        const msg = e instanceof ApiError ? e.body.message : "Data penerima tidak dapat dimuat."
        setError(msg)
        setHistError(msg)
        setLoadedKey(key)
      })
  }, [id])

  useEffect(() => {
    load(page)
    const g = gen
    return () => { g.current++ }
  }, [load, page])

  if (error && !recipient) {
    return (
      <div>
        <PageTitle title="Detail Penerima" />
        <ErrorState message={error} onRetry={() => load(page)} />
      </div>
    )
  }
  if (!recipient) {
    return (
      <div>
        <PageTitle title="Detail Penerima" />
        <LoadingState label="Memuat profil penerima" rows={4} />
      </div>
    )
  }

  const wa = waHref(recipient.phone)
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex items-center">
        <Link to="/kontak/penerima" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-slate-900 md:min-h-8">
          <ArrowLeftIcon aria-hidden className="size-4" /> Kembali ke Data Penerima
        </Link>
      </div>
      <PageTitle
        title={recipient.name}
        description={[recipient.subdistrict_name, recipient.postal_code].filter(Boolean).join(" ") || "Buku alamat penerima"}
      >
        <Button variant="outline" onClick={() => setEditing(true)}>
          <PencilIcon aria-hidden /> Ubah Data
        </Button>
        <LinkButton to="/kasir">
          <PlusIcon aria-hidden data-icon="inline-start" /> Buat Kiriman
        </LinkButton>
      </PageTitle>

      <Panel className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-950">{recipient.name}</span>
            <RiskChip badge={recipient.risk.badge} delivered={recipient.cod_delivered_count} rts={recipient.cod_rts_count} rtsBps={recipient.risk.rtsBps} />
          </div>
          <p className="text-muted-foreground tabular-nums">
            No. HP: <span className="font-medium text-slate-800">{recipient.phone}</span>
          </p>
          <p className="flex items-start gap-1.5 text-muted-foreground">
            <MapPinIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              {recipient.street_address}
              {recipient.subdistrict_name ? `, ${recipient.subdistrict_name}` : ""}
              {recipient.postal_code ? ` ${recipient.postal_code}` : ""}
              {recipient.address_note ? ` (Patokan: ${recipient.address_note})` : ""}
            </span>
          </p>
        </div>
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 md:h-9"
          >
            <MessageCircleIcon aria-hidden className="size-4 text-emerald-600" /> Chat WhatsApp
          </a>
        ) : null}
      </Panel>

      <ContactHistorySection
        kind="recipient"
        id={recipient.id}
        onPageChange={setPage}
        history={history}
        loading={loading}
        error={histError}
        onRetry={() => load(page)}
      />

      <ContactDialog
        open={editing}
        onOpenChange={(o) => !o && setEditing(false)}
        title="Ubah Penerima"
        description="Perbarui alamat atau nomor HP penerima. Klik Batal untuk menutup tanpa menyimpan."
      >
        <RecipientForm
          key={recipient.id}
          recipient={recipient}
          canArchive={owner}
          onSaved={() => {
            setEditing(false)
            load(page)
          }}
          onCancel={() => setEditing(false)}
        />
      </ContactDialog>
    </div>
  )
}
