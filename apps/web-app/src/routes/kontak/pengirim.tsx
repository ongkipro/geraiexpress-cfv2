import { useCallback, useEffect, useState, type FormEvent } from "react"
import { CheckIcon, MessageCircleIcon, PlusIcon } from "lucide-react"
import { AreaPicker, type Area } from "../../components/area-picker"
import { TextField } from "../../components/auth/text-field"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../../components/ui/sheet"
import { Switch } from "../../components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group"
import { api, ApiError } from "../../lib/api"
import { EmptyState, ErrorState, LoadingState, PageTitle } from "../../shell/states"
import { isOwner, useWorkspace } from "../../shell/workspace"
import { rupiah } from "./shared"
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
  display_brand_name: string | null
  display_brand_phone: string | null
  hide_gerai_branding: number
  shipments_count: number
  deposit_balance_idr?: number
}
type Filter = "all" | "reseller_dropship" | "walk_in"

export function PengirimPage() {
  const w = useWorkspace()
  const owner = isOwner(w)
  const [filter, setFilter] = useState<Filter>("all")
  const [q, setQ] = useState("")
  const [data, setData] = useState<{ items: Sender[]; counts: Record<Filter, number> } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Sender | "new" | null>(null)
  const load = useCallback(() => {
    api<{ items: Sender[]; counts: Record<Filter, number> }>(`/contacts/senders?jenis=${filter}&q=${encodeURIComponent(q)}`)
      .then((d) => {
        setError(null)
        setData(d)
      })
      .catch((e) => setError(e instanceof ApiError ? e.body.message : "Daftar pengirim tidak dapat dimuat."))
  }, [filter, q])
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [load, q])
  const filtered = q.trim().length > 0 || filter !== "all"

  return (
    <div>
      <PageTitle title="Pengirim">
        <Button onClick={() => setEditing("new")}>
          <PlusIcon aria-hidden /> Tambah Pengirim
        </Button>
      </PageTitle>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <ToggleGroup value={[filter]} onValueChange={(v) => v[0] && setFilter(v[0] as Filter)} aria-label="Jenis pengirim" variant="outline">
            <ToggleGroupItem value="all">Semua ({data?.counts.all ?? 0})</ToggleGroupItem>
            <ToggleGroupItem value="reseller_dropship">Toko Reseller ({data?.counts.reseller_dropship ?? 0})</ToggleGroupItem>
            <ToggleGroupItem value="walk_in">Walk-in ({data?.counts.walk_in ?? 0})</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <Input aria-label="Cari nama, toko atau nomor HP" placeholder="Cari nama, toko atau nomor HP" value={q} onChange={(e) => setQ(e.target.value)} className="lg:w-80" type="search" />
      </div>
      <Panel className="p-0 md:p-0">
        {error ? <div className="p-4"><ErrorState message={error} onRetry={load} /></div> : !data ? <div className="p-4"><LoadingState label="Memuat pengirim" /></div> : data.items.length === 0 ? (
          filtered ? (
            <EmptyState title="Tidak ada yang cocok" body="Coba kata kunci lain atau hapus filter." action={<Button variant="outline" onClick={() => { setQ(""); setFilter("all") }}>Hapus filter</Button>} />
          ) : (
            <EmptyState title="Belum ada pengirim" body="Pengirim tersimpan otomatis saat kiriman dibuat, atau tambahkan sekarang." action={<Button onClick={() => setEditing("new")}>Tambah Pengirim</Button>} />
          )
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-xl border border-slate-200/85 md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pengirim asli (WA retur)</TableHead>
                    <TableHead>Nama tercetak</TableHead>
                    <TableHead className="text-right">Kiriman</TableHead>
                    {owner ? <TableHead className="text-right">Deposit</TableHead> : null}
                    <TableHead><span className="sr-only">Aksi</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{s.true_name}</span>
                          <span className="text-muted-foreground tabular-nums">WA {s.true_phone} {s.wa_verified_at ? <span className="text-safe">· terverifikasi</span> : null}</span>
                        </div>
                      </TableCell>
                      <TableCell>{s.display_brand_name ?? s.true_name}{s.sender_kind === "reseller_dropship" ? <Badge variant="outline" className="ml-2">Reseller</Badge> : null}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.shipments_count}</TableCell>
                      {owner ? <TableCell className="text-right tabular-nums">{s.deposit_balance_idr ? rupiah(s.deposit_balance_idr) : "—"}</TableCell> : null}
                      <TableCell className="text-right"><Button variant="outline" onClick={() => setEditing(s)}>Ubah</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="divide-y md:hidden">
              {data.items.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => setEditing(s)} className="flex min-h-11 w-full flex-col items-start gap-1 px-4 py-3 text-left">
                    <span className="font-medium">{s.display_brand_name ?? s.true_name}</span>
                    <span className="text-base md:text-sm text-muted-foreground tabular-nums">{s.true_name} · {s.true_phone}{s.wa_verified_at ? " · terverifikasi" : ""}</span>
                    <span className="text-base md:text-sm text-muted-foreground tabular-nums">{s.shipments_count} kiriman{owner && s.deposit_balance_idr ? ` · deposit ${rupiah(s.deposit_balance_idr)}` : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
      <Sheet open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{editing === "new" ? "Tambah Pengirim" : "Ubah Pengirim"}</SheetTitle>
          </SheetHeader>
          {editing ? <SenderForm key={editing === "new" ? "new" : editing.id} sender={editing === "new" ? null : editing} owner={owner} onSaved={() => { setEditing(null); load() }} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}

export function SenderForm({ sender, owner, onSaved }: { sender: Sender | null; owner: boolean; onSaved: (saved?: { id: string }) => void }) {
  const [kind, setKind] = useState<Sender["sender_kind"]>(sender?.sender_kind ?? "walk_in")
  const [name, setName] = useState(sender?.true_name ?? "")
  const [phone, setPhone] = useState(sender?.true_phone ?? "")
  const [street, setStreet] = useState(sender?.true_street ?? "")
  const [area, setArea] = useState<Area | null>(sender?.true_area_id ? { id: sender.true_area_id, label: sender.true_area_label ?? "", postalCode: null } : null)
  const [brand, setBrand] = useState(sender?.display_brand_name ?? "")
  const [brandPhone, setBrandPhone] = useState(sender?.display_brand_phone ?? "")
  const [hide, setHide] = useState(sender?.hide_gerai_branding === 1)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [verified, setVerified] = useState<number | null>(sender?.wa_verified_at ?? null)
  const [pending, setPending] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    setErrors({})
    setMsg(null)
    try {
      const body = { senderKind: kind, name, phone, street: street || null, areaId: area?.id ?? null, areaLabel: area?.label ?? null, brandName: brand || null, brandPhone: brandPhone || null, hideGeraiBranding: hide }
      const r = await api<{ item: { id: string } }>(sender ? `/contacts/senders/${sender.id}` : "/contacts/senders", { body })
      onSaved(r.item)
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.body.field_errors)
        setMsg(err.body.message)
      } else setMsg("Gagal menyimpan. Coba lagi.")
    } finally {
      setPending(false)
    }
  }
  async function verify() {
    if (!sender) return
    const r = await api<{ item: Sender }>(`/contacts/senders/${sender.id}/verify-wa`, { body: {} })
    setVerified(r.item.wa_verified_at)
  }
  async function archive() {
    if (!sender) return
    await api(`/contacts/senders/${sender.id}/archive`, { body: {} })
    onSaved()
  }
  const wa = phone.replace(/\D/g, "").replace(/^0/, "62")
  return (
    <form onSubmit={submit} className="flex flex-col gap-4 px-4 pb-6" noValidate>
      <ToggleGroup value={[kind]} onValueChange={(v) => v[0] && setKind(v[0] as Sender["sender_kind"])} aria-label="Jenis pengirim" variant="outline">
        <ToggleGroupItem value="walk_in">Walk-in</ToggleGroupItem>
        <ToggleGroupItem value="reseller_dropship">Toko Reseller / Dropship</ToggleGroupItem>
      </ToggleGroup>
      <TextField label="Nama pengirim asli" name="name" value={name} onChange={setName} error={errors.name} required maxLength={80} />
      <TextField label="Nomor WhatsApp (untuk retur & COD)" name="phone" inputMode="numeric" value={phone} onChange={setPhone} error={errors.phone} hint="Contoh: 0812-3456-7890" required />
      {sender ? (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          {verified && phone === sender.true_phone ? (
            <p className="flex items-center gap-2 text-base md:text-sm text-safe"><CheckIcon aria-hidden className="size-5" /> WhatsApp terverifikasi di loket</p>
          ) : (
            <>
              <p className="text-base md:text-sm text-muted-foreground">Kirim pesan uji, lalu tanyakan ke pengirim apakah pesan sudah diterima.</p>
              <div className="flex flex-wrap gap-2">
                <a href={`https://wa.me/${wa}?text=${encodeURIComponent("Halo, ini pesan uji dari gerai untuk memastikan nomor WhatsApp Anda aktif.")}`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-base md:text-sm font-medium md:h-10">
                  <MessageCircleIcon aria-hidden className="size-5" /> Kirim pesan uji
                </a>
                <Button type="button" variant="outline" onClick={verify} disabled={phone !== sender.true_phone}>Pengirim sudah menerima</Button>
              </div>
            </>
          )}
        </div>
      ) : null}
      <TextField label="Alamat pengirim (opsional)" name="street" value={street} onChange={setStreet} error={errors.street} maxLength={200} />
      <AreaPicker label="Kecamatan pengirim (opsional)" value={area} onChange={setArea} error={errors.areaId} />
      {kind === "reseller_dropship" ? (
        <>
          <TextField label="Nama toko tercetak di label" name="brandName" value={brand} onChange={setBrand} error={errors.brandName} maxLength={60} required />
          <TextField label="Nomor HP tercetak di label (opsional)" name="brandPhone" inputMode="numeric" value={brandPhone} onChange={setBrandPhone} error={errors.brandPhone} />
          <label className="flex min-h-11 items-center justify-between gap-3 text-base md:text-sm">
            Sembunyikan nama gerai di label
            <Switch checked={hide} onCheckedChange={setHide} />
          </label>
        </>
      ) : null}
      {msg ? <p role="alert" className="border-l-4 border-danger py-1 pl-3 text-base md:text-sm font-medium text-danger">{msg}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</Button>
        {sender && owner ? <Button type="button" variant="outline" onClick={archive}>Arsipkan</Button> : null}
      </div>
    </form>
  )
}
