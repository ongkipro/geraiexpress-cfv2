import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { Link } from "@tanstack/react-router"
import { CheckIcon, HistoryIcon, MessageCircleIcon, PlusIcon } from "lucide-react"
import { DataTableShell } from "../../components/admin/data-table"
import { LinkButton } from "../../components/admin/link-button"
import { DEFAULT_PAGE_SIZE, PageNav } from "../../components/admin/pagination"
import { PreciseAreaPicker, type Area } from "../../components/area-picker"
import { TextField } from "../../components/auth/text-field"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../components/ui/field"
import { Input } from "../../components/ui/input"
import { Switch } from "../../components/ui/switch"
import { Textarea } from "../../components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group"
import { api, ApiError } from "../../lib/api"
import { sanitizePhone } from "../../lib/input"
import { EmptyState, ErrorState, LoadingState, PageTitle } from "../../shell/states"
import { isOwner, useWorkspace } from "../../shell/workspace"
import { ContactDialog, prefillContactQuery, rupiah } from "./shared"
import { Panel } from "../../components/admin/page"

// Kontak › Pengirim (visual 06 §2, visual 07, DEC-212): walk-in senders and reseller/dropship brands. Deposit column
// owner only (the server strips it for Kasir). WA verification = operator confirms at the counter after a click-to-chat.
interface Sender {
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
type Filter = "all" | "reseller_dropship" | "walk_in"

type SendersResp = { items: Sender[]; counts: Record<Filter, number>; total: number; page: number; pageSize: number; totalPages: number }

export function PengirimPage() {
  const w = useWorkspace()
  const owner = isOwner(w)
  const [filter, setFilter] = useState<Filter>("all")
  const [q, setQ] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<SendersResp | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Sender | "new" | null>(null)
  const gen = useRef(0)
  const load = useCallback(() => {
    const mine = ++gen.current
    setLoading(true)
    api<SendersResp>(`/contacts/senders?jenis=${filter}&q=${encodeURIComponent(q)}&page=${page}&limit=${DEFAULT_PAGE_SIZE}`)
      .then((d) => {
        if (mine !== gen.current) return
        setError(null)
        setData(d)
      })
      .catch((e) => mine === gen.current && setError(e instanceof ApiError ? e.body.message : "Daftar pengirim tidak dapat dimuat."))
      .finally(() => {
        if (mine === gen.current) setLoading(false)
      })
  }, [filter, q, page])
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [load, q])
  const filtered = q.trim().length > 0 || filter !== "all"

  return (
    <div>
      <PageTitle title="Pengirim" description="Klik nama pengirim atau Riwayat untuk melihat seluruh riwayat kiriman dan status INV.">
        <Button onClick={() => setEditing("new")}>
          <PlusIcon aria-hidden /> Tambah Pengirim
        </Button>
      </PageTitle>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <ToggleGroup
            value={[filter]}
            onValueChange={(v) => {
              if (v[0]) {
                setFilter(v[0] as Filter)
                setPage(1)
              }
            }}
            aria-label="Jenis pengirim"
            variant="outline"
          >
            <ToggleGroupItem value="all">Semua ({data?.counts.all ?? 0})</ToggleGroupItem>
            <ToggleGroupItem value="reseller_dropship">Toko Reseller ({data?.counts.reseller_dropship ?? 0})</ToggleGroupItem>
            <ToggleGroupItem value="walk_in">Walk-in ({data?.counts.walk_in ?? 0})</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <Input
          aria-label="Cari nama, toko atau nomor HP"
          placeholder="Cari nama, toko atau nomor HP"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
          className="lg:w-80"
          type="search"
        />
      </div>
      <Panel className="p-0 md:p-0">
        {error ? (
          <div className="p-4"><ErrorState message={error} onRetry={load} /></div>
        ) : !data ? (
          <div className="p-4"><LoadingState label="Memuat pengirim" /></div>
        ) : (
          <DataTableShell
            bare
            caption="Daftar pengirim"
            rows={data.items}
            rowKey={(s) => s.id}
            empty={
              filtered ? (
                <EmptyState title="Tidak ada yang cocok" body="Coba kata kunci lain atau hapus filter." action={<Button variant="outline" onClick={() => { setQ(""); setFilter("all"); setPage(1) }}>Hapus filter</Button>} />
              ) : (
                <EmptyState title="Belum ada pengirim" body="Pengirim tersimpan otomatis saat kiriman dibuat, atau tambahkan sekarang." action={<Button onClick={() => setEditing("new")}>Tambah Pengirim</Button>} />
              )
            }
            footer={
              <PageNav
                page={data.page}
                totalPages={data.totalPages}
                total={data.total}
                pageSize={data.pageSize}
                onPageChange={setPage}
                itemLabel="pengirim"
                loading={loading}
              />
            }
            columns={[
              {
                key: "pengirim",
                header: "Pengirim asli (WA retur)",
                cell: (s) => (
                  <div className="flex flex-col">
                    <Link to="/kontak/pengirim/$id" params={{ id: s.id }} className="font-medium text-primary underline-offset-4 hover:underline">
                      {s.true_name}
                    </Link>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      WA {s.true_phone} {s.wa_verified_at ? <span className="text-safe">· terverifikasi</span> : null}
                    </span>
                  </div>
                ),
              },
              {
                key: "brand",
                header: "Nama tercetak",
                cell: (s) => (
                  <span>
                    {s.display_brand_name ?? s.true_name}
                    {s.sender_kind === "reseller_dropship" ? <Badge variant="outline" className="ml-2">Reseller</Badge> : null}
                  </span>
                ),
              },
              {
                key: "kiriman",
                header: "Kiriman",
                align: "right",
                cell: (s) => (
                  <Link to="/kontak/pengirim/$id" params={{ id: s.id }} className="font-medium text-primary underline-offset-4 hover:underline tabular-nums">
                    {s.shipments_count}
                  </Link>
                ),
              },
              ...(owner
                ? [{ key: "deposit", header: "Deposit", align: "right" as const, cell: (s: Sender) => (s.deposit_balance_idr ? rupiah(s.deposit_balance_idr) : "—") }]
                : []),
              {
                key: "aksi",
                header: <span className="sr-only">Aksi</span>,
                align: "right",
                cell: (s) => (
                  <div className="flex justify-end gap-1.5">
                    <LinkButton variant="ghost" size="sm" to="/kontak/pengirim/$id" params={{ id: s.id } as never}>
                      <HistoryIcon aria-hidden data-icon="inline-start" /> Riwayat
                    </LinkButton>
                    <Button variant="outline" size="sm" onClick={() => setEditing(s)}>Ubah</Button>
                  </div>
                ),
              },
            ]}
            mobile={(s) => (
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <Link to="/kontak/pengirim/$id" params={{ id: s.id }} className="font-semibold text-primary underline-offset-4 hover:underline">
                    {s.display_brand_name ?? s.true_name}
                  </Link>
                  <span className="text-xs font-medium text-muted-foreground tabular-nums">{s.shipments_count} kiriman</span>
                </div>
                <span className="text-muted-foreground tabular-nums">
                  {s.true_name} · {s.true_phone}{s.wa_verified_at ? " · terverifikasi" : ""}
                </span>
                {owner && s.deposit_balance_idr ? <span className="text-xs text-muted-foreground tabular-nums">Deposit {rupiah(s.deposit_balance_idr)}</span> : null}
                <div className="mt-1 flex gap-2">
                  <LinkButton variant="outline" size="sm" to="/kontak/pengirim/$id" params={{ id: s.id } as never}>
                    <HistoryIcon aria-hidden data-icon="inline-start" /> Lihat Riwayat
                  </LinkButton>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(s)}>Ubah</Button>
                </div>
              </div>
            )}
          />
        )}
      </Panel>
      <ContactDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Tambah Pengirim Baru" : "Ubah Pengirim"}
        description="Lengkapi data pengirim di bawah. Klik Batal jika ingin menutup tanpa menyimpan."
      >
        {editing ? (
          <SenderForm
            key={editing === "new" ? "new" : editing.id}
            sender={editing === "new" ? null : editing}
            owner={owner}
            onSaved={() => {
              setEditing(null)
              load()
            }}
            onCancel={() => setEditing(null)}
            onVerified={load}
          />
        ) : null}
      </ContactDialog>
    </div>
  )
}

export function SenderForm({
  sender,
  owner,
  onSaved,
  onCancel,
  onVerified,
  initialQuery,
}: {
  sender: Sender | null
  owner: boolean
  onSaved: (saved?: Sender) => void
  onCancel?: () => void
  onVerified?: () => void
  initialQuery?: string
}) {
  const pre = sender ? null : prefillContactQuery(initialQuery)
  const [kind, setKind] = useState<Sender["sender_kind"]>(sender?.sender_kind ?? "walk_in")
  const [name, setName] = useState(sender?.true_name ?? pre?.name ?? "")
  const [phone, setPhone] = useState(sender?.true_phone ?? pre?.phone ?? "")
  const [street, setStreet] = useState(sender?.true_street ?? "")
  const [area, setArea] = useState<Area | null>(sender?.true_area_id ? { id: sender.true_area_id, label: sender.true_area_label ?? "", postalCode: sender.true_postal_code ?? null } : null)
  const [postalCode, setPostalCode] = useState(sender?.true_postal_code ?? "")
  const [brand, setBrand] = useState(sender?.display_brand_name ?? "")
  const [brandPhone, setBrandPhone] = useState(sender?.display_brand_phone ?? "")
  const [hide, setHide] = useState(sender?.hide_gerai_branding === 1)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [verified, setVerified] = useState<number | null>(sender?.wa_verified_at ?? null)
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
      const body = {
        senderKind: kind,
        name,
        phone,
        street: street || null,
        areaId: area?.id ?? null,
        areaLabel: area?.label ?? null,
        postalCode: postalCode || null,
        brandName: brand || null,
        brandPhone: brandPhone || null,
        hideGeraiBranding: hide,
      }
      // The POST answers with the full contact (same shape as GET): callers use it directly, no second request.
      const r = await api<{ item: Sender }>(sender ? `/contacts/senders/${sender.id}` : "/contacts/senders", { body })
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
  async function verify() {
    if (!sender || pending) return
    setPending(true)
    setMsg(null)
    try {
      const r = await api<{ item: Sender }>(`/contacts/senders/${sender.id}/verify-wa`, { body: {} })
      setVerified(r.item.wa_verified_at)
      onVerified?.()
    } catch (err) {
      setMsg(err instanceof ApiError ? err.body.message : "Gagal memverifikasi WhatsApp.")
    } finally {
      setPending(false)
    }
  }
  async function archive() {
    if (!sender || pending) return
    if (!window.confirm(`Arsipkan pengirim “${sender.display_brand_name ?? sender.true_name}”?`)) return
    setPending(true)
    setMsg(null)
    try {
      await api(`/contacts/senders/${sender.id}/archive`, { body: {} })
      onSaved()
    } catch (err) {
      setMsg(err instanceof ApiError ? err.body.message : "Gagal mengarsipkan pengirim.")
    } finally {
      setPending(false)
    }
  }
  const waDigits = phone.replace(/\D/g, "")
  const wa = waDigits ? `62${waDigits.replace(/^(62|0)/, "")}` : ""
  return (
    <form onSubmit={submit} className="flex flex-col" noValidate>
      <div className="flex flex-col gap-4 px-5 pt-5 pb-12 sm:px-6 sm:pb-8">
        <ToggleGroup value={[kind]} onValueChange={(v) => v[0] && setKind(v[0] as Sender["sender_kind"])} aria-label="Jenis pengirim" variant="outline" spacing={0} className="grid w-full grid-cols-2">
          <ToggleGroupItem value="walk_in" className="w-full">Walk-in</ToggleGroupItem>
          <ToggleGroupItem value="reseller_dropship" className="w-full">Toko Reseller / Dropship</ToggleGroupItem>
        </ToggleGroup>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <TextField label="Nama pengirim asli" name="name" value={name} onChange={setName} error={errors.name} hint="Boleh huruf dan angka." required maxLength={80} />
          <TextField label="Nomor WhatsApp (untuk retur & COD)" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={phone} onChange={(v) => setPhone(sanitizePhone(v))} error={errors.phone} hint="Contoh: 0812-3456-7890" required />
        </div>
        {sender ? (
          <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            {verified && phone === sender.true_phone ? (
              <p className="flex items-center gap-2 text-base md:text-sm text-safe"><CheckIcon aria-hidden className="size-5" /> WhatsApp terverifikasi di loket</p>
            ) : (
              <>
                <p className="text-base md:text-sm text-muted-foreground">Kirim pesan uji, lalu tanyakan ke pengirim apakah pesan sudah diterima.</p>
                <div className="flex flex-wrap gap-2">
                  {wa ? (
                    <a href={`https://wa.me/${wa}?text=${encodeURIComponent("Halo, ini pesan uji dari gerai untuk memastikan nomor WhatsApp Anda aktif.")}`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-lg border bg-white px-4 text-base md:text-sm font-medium md:h-10">
                      <MessageCircleIcon aria-hidden className="size-5" /> Kirim pesan uji
                    </a>
                  ) : null}
                  <Button type="button" variant="outline" onClick={verify} disabled={pending || phone !== sender.true_phone}>{pending ? "Memverifikasi…" : "Pengirim sudah menerima"}</Button>
                </div>
                {phone !== sender.true_phone ? <p className="text-xs text-muted-foreground">Simpan perubahan nomor dulu sebelum memverifikasi.</p> : null}
              </>
            )}
          </div>
        ) : null}
        {kind === "reseller_dropship" ? (
          <div className="flex flex-col gap-3.5 rounded-lg border border-slate-200/90 bg-slate-50/55 p-3.5">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <TextField label="Nama toko tercetak di label" name="brandName" value={brand} onChange={setBrand} error={errors.brandName} maxLength={60} required />
              <TextField label="Nomor HP tercetak di label (opsional)" name="brandPhone" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={brandPhone} onChange={(v) => setBrandPhone(sanitizePhone(v))} error={errors.brandPhone} />
            </div>
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-base md:min-h-9 md:text-sm">
              <span>Sembunyikan nama gerai di label</span>
              <Switch checked={hide} onCheckedChange={setHide} />
            </label>
          </div>
        ) : null}
        <PreciseAreaPicker
          kecamatanLabel="Kecamatan pengirim (opsional)"
          value={area}
          postalCode={postalCode}
          onChange={setArea}
          onPostalCodeChange={setPostalCode}
          error={errors.areaId}
          postalError={errors.postalCode}
          optional
        />
        <Field data-invalid={errors.street ? true : undefined}>
          <FieldLabel htmlFor="sender-street">Alamat pengirim (opsional)</FieldLabel>
          <Textarea
            id="sender-street"
            name="street"
            rows={3}
            className="min-h-[5.5rem]"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            maxLength={200}
            placeholder="Nama jalan, nomor rumah/toko, RT/RW"
            aria-invalid={errors.street ? true : undefined}
          />
          {errors.street ? <FieldError>{errors.street}</FieldError> : <FieldDescription>Opsional; berguna untuk alamat retur.</FieldDescription>}
        </Field>
        {msg ? <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger">{msg}</p> : null}
      </div>
      <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t border-slate-200/80 bg-slate-50/95 px-5 pt-3.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
        <div>
          {sender && owner ? <Button type="button" variant="outline" disabled={pending} onClick={archive}>Arsipkan</Button> : null}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {onCancel ? <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>Batal</Button> : null}
          <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</Button>
        </div>
      </div>
    </form>
  )
}
