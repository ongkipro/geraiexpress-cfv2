import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { Link } from "@tanstack/react-router"
import { HistoryIcon, PlusIcon } from "lucide-react"
import { DataTableShell } from "../../components/admin/data-table"
import { LinkButton } from "../../components/admin/link-button"
import { DEFAULT_PAGE_SIZE, PageNav } from "../../components/admin/pagination"
import { PreciseAreaPicker, type Area } from "../../components/area-picker"
import { TextField } from "../../components/auth/text-field"
import { Button } from "../../components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../components/ui/field"
import { Input } from "../../components/ui/input"
import { Textarea } from "../../components/ui/textarea"
import { api, ApiError } from "../../lib/api"
import { sanitizePhone } from "../../lib/input"
import { EmptyState, ErrorState, LoadingState, PageTitle } from "../../shell/states"
import { isOwner, useWorkspace } from "../../shell/workspace"
import { ContactDialog, prefillContactQuery, RiskChip, type RiskBadge } from "./shared"
import { Panel } from "../../components/admin/page"

// Kontak › Penerima (visual 06 §2): address book with live shipment count, COD history badge, and 20/page pagination.
interface Recipient {
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
type RecipientsResp = { items: Recipient[]; total: number; page: number; pageSize: number; totalPages: number }

export function PenerimaPage() {
  const w = useWorkspace()
  const [q, setQ] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<RecipientsResp | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Recipient | "new" | null>(null)
  const gen = useRef(0)
  const load = useCallback(() => {
    const mine = ++gen.current
    setLoading(true)
    api<RecipientsResp>(`/contacts/recipients?q=${encodeURIComponent(q)}&page=${page}&limit=${DEFAULT_PAGE_SIZE}`)
      .then((d) => {
        if (mine !== gen.current) return
        setError(null)
        setData(d)
      })
      .catch((e) => mine === gen.current && setError(e instanceof ApiError ? e.body.message : "Daftar penerima tidak dapat dimuat."))
      .finally(() => {
        if (mine === gen.current) setLoading(false)
      })
  }, [q, page])
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [load, q])
  return (
    <div>
      <PageTitle title="Penerima" description="Klik nama penerima atau Riwayat untuk melihat semua paket yang pernah diterima dan status INV.">
        <Button onClick={() => setEditing("new")}>
          <PlusIcon aria-hidden /> Tambah Penerima
        </Button>
      </PageTitle>
      <Input
        aria-label="Cari nama, nomor HP atau kecamatan"
        placeholder="Cari nama, nomor HP atau kecamatan"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setPage(1)
        }}
        className="mb-4 lg:w-96"
        type="search"
      />
      <Panel className="p-0 md:p-0">
        {error ? (
          <div className="p-4"><ErrorState message={error} onRetry={load} /></div>
        ) : !data ? (
          <div className="p-4"><LoadingState label="Memuat penerima" /></div>
        ) : (
          <DataTableShell
            bare
            caption="Daftar penerima"
            rows={data.items}
            rowKey={(r) => r.id}
            empty={
              q ? (
                <EmptyState title="Tidak ada yang cocok" body="Coba kata kunci lain." action={<Button variant="outline" onClick={() => { setQ(""); setPage(1) }}>Hapus filter</Button>} />
              ) : (
                <EmptyState title="Belum ada penerima" body="Penerima tersimpan otomatis saat kiriman dibuat, atau tambahkan sekarang." action={<Button onClick={() => setEditing("new")}>Tambah Penerima</Button>} />
              )
            }
            footer={
              <PageNav
                page={data.page}
                totalPages={data.totalPages}
                total={data.total}
                pageSize={data.pageSize}
                onPageChange={setPage}
                itemLabel="penerima"
                loading={loading}
              />
            }
            columns={[
              {
                key: "nama",
                header: "Nama & nomor HP",
                cell: (r) => (
                  <div className="flex flex-col">
                    <Link to="/kontak/penerima/$id" params={{ id: r.id }} className="font-medium text-primary underline-offset-4 hover:underline">
                      {r.name}
                    </Link>
                    <span className="text-xs text-muted-foreground tabular-nums">{r.phone}</span>
                  </div>
                ),
              },
              {
                key: "alamat",
                header: "Kecamatan & alamat",
                className: "whitespace-normal",
                cell: (r) => (
                  <div className="flex max-w-md flex-col">
                    <span>{r.subdistrict_name ?? "—"}{r.postal_code ? ` ${r.postal_code}` : ""}</span>
                    <span className="truncate text-xs text-muted-foreground">{r.street_address}</span>
                  </div>
                ),
              },
              {
                key: "kiriman",
                header: "Kiriman",
                align: "right",
                cell: (r) => (
                  <Link to="/kontak/penerima/$id" params={{ id: r.id }} className="font-medium text-primary underline-offset-4 hover:underline tabular-nums">
                    {r.shipments_count ?? 0}
                  </Link>
                ),
              },
              {
                key: "cod",
                header: "Riwayat COD",
                cell: (r) => <RiskChip badge={r.risk.badge} delivered={r.cod_delivered_count} rts={r.cod_rts_count} rtsBps={r.risk.rtsBps} />,
              },
              {
                key: "aksi",
                header: <span className="sr-only">Aksi</span>,
                align: "right",
                cell: (r) => (
                  <div className="flex justify-end gap-1.5">
                    <LinkButton variant="ghost" size="sm" to="/kontak/penerima/$id" params={{ id: r.id } as never}>
                      <HistoryIcon aria-hidden data-icon="inline-start" /> Riwayat
                    </LinkButton>
                    <Button variant="outline" size="sm" onClick={() => setEditing(r)}>Ubah</Button>
                  </div>
                ),
              },
            ]}
            mobile={(r) => (
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <Link to="/kontak/penerima/$id" params={{ id: r.id }} className="font-semibold text-primary underline-offset-4 hover:underline">
                    {r.name}
                  </Link>
                  <span className="text-xs font-medium text-muted-foreground tabular-nums">{r.shipments_count ?? 0} kiriman</span>
                </div>
                <span className="text-muted-foreground tabular-nums">{r.phone}</span>
                <span className="text-xs text-muted-foreground">{r.subdistrict_name ?? "—"} · {r.street_address}</span>
                <div><RiskChip badge={r.risk.badge} delivered={r.cod_delivered_count} rts={r.cod_rts_count} rtsBps={r.risk.rtsBps} /></div>
                <div className="mt-1 flex gap-2">
                  <LinkButton variant="outline" size="sm" to="/kontak/penerima/$id" params={{ id: r.id } as never}>
                    <HistoryIcon aria-hidden data-icon="inline-start" /> Lihat Riwayat
                  </LinkButton>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>Ubah</Button>
                </div>
              </div>
            )}
          />
        )}
      </Panel>
      <ContactDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Tambah Penerima Baru" : "Ubah Penerima"}
        description="Cari kecamatan lalu pilih kelurahan agar kode pos terisi otomatis. Klik Batal untuk menutup."
      >
        {editing ? (
          <RecipientForm
            key={editing === "new" ? "new" : editing.id}
            recipient={editing === "new" ? null : editing}
            canArchive={isOwner(w)}
            onSaved={() => {
              setEditing(null)
              load()
            }}
            onCancel={() => setEditing(null)}
          />
        ) : null}
      </ContactDialog>
    </div>
  )
}

export function RecipientForm({
  initialArea,
  initialQuery,
  recipient,
  canArchive,
  onSaved,
  onCancel,
}: {
  recipient: Recipient | null
  canArchive: boolean
  onSaved: (saved?: Recipient) => void
  onCancel?: () => void
  initialArea?: Area | null
  initialQuery?: string
}) {
  const pre = recipient ? null : prefillContactQuery(initialQuery)
  const [name, setName] = useState(recipient?.name ?? pre?.name ?? "")
  const [phone, setPhone] = useState(recipient?.phone ?? pre?.phone ?? "")
  const [street, setStreet] = useState(recipient?.street_address ?? "")
  const [note, setNote] = useState(recipient?.address_note ?? "")
  const [area, setArea] = useState<Area | null>(recipient?.mengantar_area_id ? { id: recipient.mengantar_area_id, label: recipient.subdistrict_name ?? "", postalCode: recipient.postal_code } : (initialArea ?? null))
  const [postalCode, setPostalCode] = useState(recipient?.postal_code ?? initialArea?.postalCode ?? "")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const saving = useRef(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    // DEC-251 Sol R3: one save at a time (a second Enter or click while the POST is pending sends nothing; the ref
    // also covers two clicks before the disabled state has rendered).
    if (pending || saving.current) return
    saving.current = true
    setPending(true)
    setErrors({})
    setMsg(null)
    try {
      const body = { name, phone, street, note: note || null, areaId: area?.id ?? "", areaLabel: area?.label ?? "", postalCode: postalCode || null }
      // The POST answers with the full contact (same shape as GET): callers use it directly, no second request.
      const r = await api<{ item: Recipient }>(recipient ? `/contacts/recipients/${recipient.id}` : "/contacts/recipients", { body })
      onSaved(r.item)
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.body.field_errors)
        setMsg(err.body.message)
      } else setMsg("Gagal menyimpan. Coba lagi.")
    } finally {
      saving.current = false
      setPending(false)
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col" noValidate>
      <div className="flex flex-col gap-4 px-5 pt-5 pb-12 sm:px-6 sm:pb-8">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <TextField label="Nama penerima" name="name" value={name} onChange={setName} error={errors.name} required maxLength={80} />
          <TextField label="Nomor HP penerima" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={phone} onChange={(v) => setPhone(sanitizePhone(v))} error={errors.phone} hint="Contoh: 0857-1234-5678" required />
        </div>
        <PreciseAreaPicker
          kecamatanLabel="Kecamatan tujuan"
          value={area}
          postalCode={postalCode}
          onChange={setArea}
          onPostalCodeChange={setPostalCode}
          error={errors.areaId}
          postalError={errors.postalCode}
        />
        <Field data-invalid={errors.street ? true : undefined}>
          <FieldLabel htmlFor="recipient-street">Alamat lengkap</FieldLabel>
          <Textarea
            id="recipient-street"
            name="street"
            rows={3}
            className="min-h-[5.5rem]"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            maxLength={200}
            required
            placeholder="Nama jalan, nomor rumah, RT/RW, blok atau gang"
            aria-invalid={errors.street ? true : undefined}
          />
          {errors.street ? <FieldError>{errors.street}</FieldError> : <FieldDescription>Nama jalan, nomor rumah, RT/RW.</FieldDescription>}
        </Field>
        <TextField label="Patokan (opsional)" name="note" value={note} onChange={setNote} maxLength={200} hint="Contoh: Rumah pagar hijau sebelah minimarket" />
        {msg ? <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger">{msg}</p> : null}
      </div>
      <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t border-slate-200/80 bg-slate-50/95 px-5 pt-3.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
        <div>
          {recipient && canArchive ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={async () => {
                if (pending) return
                if (!window.confirm(`Arsipkan penerima “${recipient.name}”?`)) return
                setPending(true)
                setMsg(null)
                try {
                  await api(`/contacts/recipients/${recipient.id}/archive`, { body: {} })
                  onSaved()
                } catch (err) {
                  setMsg(err instanceof ApiError ? err.body.message : "Gagal mengarsipkan penerima.")
                } finally {
                  setPending(false)
                }
              }}
            >
              Arsipkan
            </Button>
          ) : null}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {onCancel ? <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>Batal</Button> : null}
          <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</Button>
        </div>
      </div>
    </form>
  )
}
