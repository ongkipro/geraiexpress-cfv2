import { useState, type FormEvent } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { Button } from "@shared/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@shared/components/ui/field"
import { Input } from "@shared/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@shared/components/ui/tabs"
import { EmptyBlock, formatDate, PageHead, Section, StatusChip } from "../../components/page"
import { api, ApiError } from "../../lib/api"
import { Textarea } from "@shared/components/ui/textarea"

// Super Admin `Pengawasan` (visual 07 §3.3): cross-tenant read-only search and the COD risk radar (risk_review +
// recent TOTP + audited read). No action here changes a gerai's shipments (DEC-209).
type Tab = "kiriman" | "risiko"

const STATUS_LABEL: Record<string, string> = {
  none: "Baru",
  ready_for_pickup: "Menunggu dijemput",
  handed_to_courier: "Diserahkan ke kurir",
  in_transit: "Dalam perjalanan",
  undelivery_hold: "Gagal kirim, ditahan",
  rts_in_transit: "Retur dalam perjalanan",
  provider_returned: "Retur sampai",
  rts_at_gerai: "Retur di gerai",
  rts_returned_to_sender: "Retur diserahkan ke pengirim",
  delivered: "Terkirim",
  cancelled: "Dibatalkan",
  lost: "Hilang",
  reconciliation_needed: "Perlu dicocokkan",
  provider_unpaid_hold: "Menunggu saldo",
}

export function PengawasanPage() {
  const { tab } = useSearch({ strict: false }) as { tab?: Tab }
  const navigate = useNavigate()
  const current: Tab = tab ?? "kiriman"
  return (
    <div className="flex flex-col gap-6">
      <PageHead title="Pengawasan" />
      <Tabs value={current} onValueChange={(v) => navigate({ to: "/pengawasan", search: { tab: v as Tab } })} className="min-w-0">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList aria-label="Bagian pengawasan">
            <TabsTrigger value="kiriman">Pantauan Kiriman & Sync</TabsTrigger>
            <TabsTrigger value="risiko">Radar Risiko COD</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
      {current === "kiriman" ? <ShipmentSearch /> : <RiskRadar />}
    </div>
  )
}

interface Hit { tenant_slug: string; tenant_name: string; slug: string; awb_number: string | null; courier_code: string | null; status: string; updated_at: number }

function ShipmentSearch() {
  const [q, setQ] = useState("")
  const [items, setItems] = useState<Hit[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function search(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      setItems((await api<{ items: Hit[] }>(`/pengawasan/kiriman?q=${encodeURIComponent(q)}`)).items)
    } catch (err) {
      setError(err instanceof ApiError ? err.body.message : "Pencarian gagal.")
    }
  }
  return (
    <Section title="Cari kiriman di semua gerai">
      <form onSubmit={search} className="flex flex-col gap-3 sm:flex-row sm:items-end" role="search">
        <Field className="flex-1">
          <FieldLabel htmlFor="cari-kiriman">INV atau nomor resi</FieldLabel>
          <Input id="cari-kiriman" value={q} onChange={(e) => setQ(e.target.value)} placeholder="INV 8K4M2P7 atau JNE0001" autoComplete="off" />
        </Field>
        <Button type="submit" disabled={q.trim().length < 4}>Cari</Button>
      </form>
      {error ? <p role="alert" className="mt-3 text-base text-danger">{error}</p> : null}
      {items === null ? null : items.length === 0 ? (
        <EmptyBlock title="Tidak ditemukan" body="Periksa kembali INV atau nomor resi." />
      ) : (
        <ul className="mt-4 divide-y">
          {items.map((h) => (
            <li key={`${h.tenant_slug}:${h.slug}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-base">
              <span className="flex flex-col">
                <span className="font-medium tabular-nums">INV {h.slug.toUpperCase()} · {h.tenant_name}</span>
                <span className="text-muted-foreground tabular-nums">{h.courier_code ?? "—"} · {h.awb_number ?? "belum ada resi"} · {formatDate(h.updated_at)}</span>
              </span>
              <StatusChip tone="muted">{STATUS_LABEL[h.status] ?? h.status}</StatusChip>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

interface RiskResult { items: Array<{ tenant_name: string; delivered_count: number; rts_count: number; last_event_at: number }>; total: { delivered: number; rts: number; rtsBps: number | null } }

function RiskRadar() {
  const [phone, setPhone] = useState("")
  const [reason, setReason] = useState("")
  const [result, setResult] = useState<RiskResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      setResult(await api<RiskResult>("/pengawasan/risiko", { body: { phone, reason } }))
    } catch (err) {
      if (err instanceof ApiError && err.body.code === "TOTP_RECENT_REQUIRED") return window.location.assign(`/totp?mode=required&kembali=${encodeURIComponent("/pengawasan?tab=risiko")}`)
      setError(err instanceof ApiError ? (err.body.field_errors.phone ?? err.body.message) : "Pencarian gagal.")
    } finally {
      setPending(false)
    }
  }
  return (
    <Section title="Radar Risiko COD">
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <p className="text-base text-muted-foreground">Nomor diubah menjadi kode acak di server; setiap pencarian dicatat di log audit beserta alasannya.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="hp-risiko">Nomor HP penerima</FieldLabel>
            <Input id="hp-risiko" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="alasan-risiko">Alasan (wajib)</FieldLabel>
            <Textarea id="alasan-risiko" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} />
            <FieldDescription>Misalnya: laporan gerai tentang penerima COD.</FieldDescription>
          </Field>
        </div>
        <div><Button type="submit" disabled={pending || phone.trim().length < 8 || reason.trim().length < 5}>{pending ? "Mencari…" : "Cari riwayat"}</Button></div>
      </form>
      {result ? (
        result.items.length === 0 ? (
          <EmptyBlock title="Belum ada riwayat" body="Nomor ini belum pernah menerima kiriman COD di jaringan." />
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-base tabular-nums">Total: {result.total.delivered} terkirim · {result.total.rts} retur{result.total.rtsBps !== null ? ` · rasio retur ${(result.total.rtsBps / 100).toLocaleString("id-ID")}%` : ""}</p>
            <ul className="divide-y">
              {result.items.map((r) => (
                <li key={r.tenant_name} className="flex flex-wrap justify-between gap-2 py-2 text-base tabular-nums">
                  <span>{r.tenant_name}</span>
                  <span>{r.delivered_count} terkirim · {r.rts_count} retur · {formatDate(r.last_event_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}
    </Section>
  )
}
