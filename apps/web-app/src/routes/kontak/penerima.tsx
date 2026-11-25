import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { PlusIcon } from "lucide-react"
import { PreciseAreaPicker, type Area } from "../../components/area-picker"
import { TextField } from "../../components/auth/text-field"
import { Button } from "../../components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../components/ui/field"
import { Input } from "../../components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"
import { Textarea } from "../../components/ui/textarea"
import { api, ApiError } from "../../lib/api"
import { EmptyState, ErrorState, LoadingState, PageTitle } from "../../shell/states"
import { isOwner, useWorkspace } from "../../shell/workspace"
import { ContactDialog, RiskChip, type RiskBadge } from "./shared"
import { Panel } from "../../components/admin/page"

// Kontak › Penerima (visual 06 §2): address book with this gerai's own COD history badge.
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
  risk: { badge: RiskBadge; rtsBps: number | null }
}

export function PenerimaPage() {
  const w = useWorkspace()
  const [q, setQ] = useState("")
  const [items, setItems] = useState<Recipient[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Recipient | "new" | null>(null)
  const gen = useRef(0)
  const load = useCallback(() => {
    const mine = ++gen.current
    api<{ items: Recipient[] }>(`/contacts/recipients?q=${encodeURIComponent(q)}`)
      .then((d) => {
        if (mine !== gen.current) return
        setError(null)
        setItems(d.items)
      })
      .catch((e) => mine === gen.current && setError(e instanceof ApiError ? e.body.message : "Daftar penerima tidak dapat dimuat."))
  }, [q])
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [load, q])
  return (
    <div>
      <PageTitle title="Penerima">
        <Button onClick={() => setEditing("new")}>
          <PlusIcon aria-hidden /> Tambah Penerima
        </Button>
      </PageTitle>
      <Input aria-label="Cari nama, nomor HP atau kecamatan" placeholder="Cari nama, nomor HP atau kecamatan" value={q} onChange={(e) => setQ(e.target.value)} className="mb-4 lg:w-96" type="search" />
      <Panel className="p-0 md:p-0">
        {error ? <div className="p-4"><ErrorState message={error} onRetry={load} /></div> : !items ? <div className="p-4"><LoadingState label="Memuat penerima" /></div> : items.length === 0 ? (
          q ? (
            <EmptyState title="Tidak ada yang cocok" body="Coba kata kunci lain." action={<Button variant="outline" onClick={() => setQ("")}>Hapus filter</Button>} />
          ) : (
            <EmptyState title="Belum ada penerima" body="Penerima tersimpan otomatis saat kiriman dibuat, atau tambahkan sekarang." action={<Button onClick={() => setEditing("new")}>Tambah Penerima</Button>} />
          )
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-xl border border-slate-200/85 md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama & nomor HP</TableHead>
                    <TableHead>Kecamatan & alamat</TableHead>
                    <TableHead>Riwayat COD</TableHead>
                    <TableHead><span className="sr-only">Aksi</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell><div className="flex flex-col"><span className="font-medium">{r.name}</span><span className="text-muted-foreground tabular-nums">{r.phone}</span></div></TableCell>
                      <TableCell><div className="flex max-w-md flex-col"><span>{r.subdistrict_name ?? "—"}{r.postal_code ? ` ${r.postal_code}` : ""}</span><span className="truncate text-muted-foreground">{r.street_address}</span></div></TableCell>
                      <TableCell><RiskChip badge={r.risk.badge} delivered={r.cod_delivered_count} rts={r.cod_rts_count} rtsBps={r.risk.rtsBps} /></TableCell>
                      <TableCell className="text-right"><Button variant="outline" onClick={() => setEditing(r)}>Ubah</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="divide-y md:hidden">
              {items.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setEditing(r)} className="flex min-h-11 w-full flex-col items-start gap-2 px-4 py-3 text-left">
                    <span className="font-medium">{r.name} <span className="font-normal text-muted-foreground tabular-nums">· {r.phone}</span></span>
                    <span className="text-base md:text-sm text-muted-foreground">{r.subdistrict_name ?? "—"} · {r.street_address}</span>
                    <RiskChip badge={r.risk.badge} delivered={r.cod_delivered_count} rts={r.cod_rts_count} rtsBps={r.risk.rtsBps} />
                  </button>
                </li>
              ))}
            </ul>
          </>
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
}) {
  const [name, setName] = useState(recipient?.name ?? "")
  const [phone, setPhone] = useState(recipient?.phone ?? "")
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
      <div className="flex flex-col gap-4 px-6 py-5">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <TextField label="Nama penerima" name="name" value={name} onChange={setName} error={errors.name} required maxLength={80} />
          <TextField label="Nomor HP penerima" name="phone" inputMode="numeric" value={phone} onChange={setPhone} error={errors.phone} hint="Contoh: 0857-1234-5678" required />
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
            rows={2}
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
      <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t border-slate-200/80 bg-slate-50/95 px-6 py-3.5 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
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
