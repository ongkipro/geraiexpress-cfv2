import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react"
import { Link } from "@tanstack/react-router"
import { CameraIcon, CheckIcon, CopyIcon, MessageCircleIcon } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Field, FieldError, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { api, ApiError } from "../../../lib/api"
import { courierLabel } from "../../../lib/status"
import { isOwner, useWorkspace } from "../../../shell/workspace"
import { ErrorState, LoadingState } from "../../../shell/states"
import { ChoiceGroup, Panel, ItemList } from "../../../components/admin/page"

// `Meja Retur` (spec 04 §2, ADR-0005, visual 07 `/kiriman/retur/:awb`): scan arriving return → condition + photo →
// true sender revealed (audited) → `Kirim Kode Ambil` via WhatsApp → handback by code (or owner ID check).
interface Row { slug: string; awb_number: string | null; courier_code: string; condition: string; intake_at: number; storage_deadline_at: number; code_issued_at: number | null; handback_at: number | null; handback_method: string | null; claim_offered: number; conflict: number }
interface Desk { open: Row[]; returned: Row[]; incoming: Array<{ slug: string; awb_number: string | null; courier_code: string; status: string }> }
type Intake = { slug: string; conflict: boolean; sender: { name: string; phone: string; brand: string | null } | null; awb: string | null }
const CONDITION: Array<[string, string]> = [["baik", "Baik"], ["penyok_rusak", "Penyok / rusak"], ["terbuka", "Terbuka"]]
const COND_LABEL = Object.fromEntries(CONDITION)
const when = (ms: number) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(ms)
const day = (ms: number) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(ms)
const wa = (phone: string) => {
  const digits = phone.replace(/\D/g, "")
  return digits ? `62${digits.replace(/^(62|0)/, "")}` : ""
}

export function MejaRetur() {
  const w = useWorkspace()
  const [d, setD] = useState<Desk | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: "safe" | "danger"; text: string } | null>(null)
  const [last, setLast] = useState<Intake | null>(null)
  const load = useCallback(() => {
    api<Desk>("/returns")
      .then((x) => {
        setError(null)
        setD(x)
      })
      .catch((e) => setError(e instanceof ApiError ? e.body.message : "Meja Retur tidak dapat dimuat."))
  }, [])
  useEffect(load, [load])
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!d) return <LoadingState label="Memuat Meja Retur" />
  return (
    <div className="mb-6 flex flex-col gap-6">
      <IntakeForm onDone={(r) => { setLast(r); setMsg(null); load() }} />
      {last ? <LastIntake r={last} /> : null}
      {msg ? <p role={msg.tone === "danger" ? "alert" : "status"} className={`border-l-4 py-1 pl-3 text-base md:text-sm font-medium ${msg.tone === "danger" ? "border-danger text-danger" : "border-safe text-safe"}`}>{msg.text}</p> : null}
      <section aria-labelledby="di-gerai">
        <h2 id="di-gerai" className="mb-3 text-sm font-semibold md:text-base">Di gerai, menunggu diambil ({d.open.length})</h2>
        {d.open.length === 0 ? <p className="text-base md:text-sm text-muted-foreground">Tidak ada paket retur yang menunggu.</p> : (
          <ul className="flex flex-col gap-3">
            {d.open.map((r) => <OpenRow key={r.slug} r={r} owner={isOwner(w)} onChange={(m) => { setMsg(m); load() }} />)}
          </ul>
        )}
      </section>
      {d.incoming.length ? (
        <section aria-labelledby="dalam-jalan">
          <h2 id="dalam-jalan" className="mb-3 text-sm font-semibold md:text-base">Retur dalam perjalanan ({d.incoming.length})</h2>
          <ItemList>
            {d.incoming.map((i) => <li key={i.slug} className="px-4 py-2 text-base md:text-sm tabular-nums">{i.courier_code} · {i.awb_number} · INV {i.slug.toUpperCase()}</li>)}
          </ItemList>
        </section>
      ) : null}
      {d.returned.length ? (
        <section aria-labelledby="selesai">
          <h2 id="selesai" className="mb-3 text-sm font-semibold md:text-base">Sudah diserahkan (7 hari)</h2>
          <ItemList>
            {d.returned.map((r) => <li key={r.slug} className="px-4 py-2 text-base md:text-sm tabular-nums">INV {r.slug.toUpperCase()} · {r.handback_at ? when(r.handback_at) : ""} · {r.handback_method === "code" ? "dengan Kode Ambil" : "cek identitas oleh pemilik"}</li>)}
          </ItemList>
        </section>
      ) : null}
    </div>
  )
}

function IntakeForm({ onDone }: { onDone: (r: Intake) => void }) {
  const [code, setCode] = useState("")
  const [condition, setCondition] = useState("baik")
  const [photo, setPhoto] = useState<{ id: string; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [note, setNote] = useState("")
  const [fields, setFields] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (!f) return
    setUploading(true)
    setFields((cur) => ({ ...cur, photo: "" }))
    try {
      const up = await fetch("/api/app/media?purpose=return_photo", { method: "POST", credentials: "same-origin", headers: { "content-type": f.type || "image/jpeg" }, body: f })
      const j = (await up.json().catch(() => null)) as { ok: boolean; data?: { id: string }; error?: { message: string } } | null
      if (j?.ok) setPhoto({ id: j.data!.id, name: f.name })
      else setFields((cur) => ({ ...cur, photo: j?.error?.message ?? "Foto gagal diunggah. Coba lagi." }))
    } catch {
      setFields((cur) => ({ ...cur, photo: "Koneksi terputus saat mengunggah foto." }))
    } finally {
      setUploading(false)
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending || uploading) return
    setPending(true)
    setFields({})
    setMsg(null)
    try {
      const r = await api<Intake>("/returns/intake", { body: { code, condition, photoId: photo?.id, note } })
      setCode("")
      setPhoto(null)
      setNote("")
      setCondition("baik")
      onDone(r)
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.body.field_errors ?? {})
        setMsg(err.body.message)
      } else setMsg("Gagal menerima paket retur.")
    } finally {
      setPending(false)
    }
  }
  return (
    <Panel as="form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <h2 className="text-sm font-semibold md:text-base">Terima paket retur</h2>
      <Field data-invalid={fields.code ? true : undefined}>
        <FieldLabel htmlFor="retur-code">Pindai resi atau INV</FieldLabel>
        <Input id="retur-code" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
        {fields.code ? <FieldError>{fields.code}</FieldError> : null}
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-base md:text-sm font-medium">Kondisi paket</legend>
        <ChoiceGroup label="Kondisi paket" value={condition} onValueChange={setCondition} choices={CONDITION.map(([id, label]) => ({ value: id, label }))} />
        {fields.condition ? <FieldError>{fields.condition}</FieldError> : null}
      </fieldset>
      <div className="flex flex-col gap-1">
        <label className="inline-flex h-11 w-fit cursor-pointer items-center gap-2 rounded-lg border px-4 text-base md:text-sm font-medium focus-within:ring-2 focus-within:ring-ring">
          <CameraIcon aria-hidden className="size-4" /> {uploading ? "Mengunggah foto…" : photo ? `Foto: ${photo.name}` : "Ambil foto paket"}
          <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={uploading} onChange={pick} />
        </label>
        {fields.photo ? <FieldError>{fields.photo}</FieldError> : <p className="text-base md:text-sm text-muted-foreground">Wajib untuk paket penyok, rusak, atau terbuka.</p>}
      </div>
      <Field><FieldLabel htmlFor="retur-note">Catatan (opsional)</FieldLabel><Input id="retur-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>
      {msg ? <p role="alert" className="border-l-4 border-danger py-1 pl-3 text-base md:text-sm font-medium text-danger">{msg}</p> : null}
      <div><Button type="submit" size="lg" disabled={pending || uploading || !code.trim()}>{pending ? "Menyimpan…" : uploading ? "Mengunggah foto…" : "Terima Paket Retur"}</Button></div>
    </Panel>
  )
}

function LastIntake({ r }: { r: Intake }) {
  return (
    <section role="status" className="rounded-lg border-l-4 border-safe bg-safe-bg p-4 text-base md:text-sm">
      <p className="font-medium">INV {r.slug.toUpperCase()} diterima di gerai.</p>
      {r.sender ? <p>Pengirim asli: <span className="font-medium">{r.sender.brand ? `${r.sender.brand} (${r.sender.name})` : r.sender.name}</span> · <span className="tabular-nums">{r.sender.phone}</span></p> : null}
      {r.conflict ? <p className="mt-1 font-medium text-danger">Status Mengantar bertentangan dengan paket yang ada di gerai. Pemilik akan melihatnya di Kendala & Klaim.</p> : null}
    </section>
  )
}

function OpenRow({ r, owner, onChange }: { r: Row; owner: boolean; onChange: (m: { tone: "safe" | "danger"; text: string }) => void }) {
  const [code, setCode] = useState("")
  const [reason, setReason] = useState("")
  const [override, setOverride] = useState(false)
  const [share, setShare] = useState<{ url: string; pickupCode: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [fieldErr, setFieldErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function sendCode() {
    // One request at a time: a double tap would issue a second code and void the one already sent.
    if (busy) return
    setBusy(true)
    try {
      const x = await api<{ code: string }>(`/returns/${r.slug}/code`, { body: {} })
      const sender = await api<{ name: string; phone: string; brand: string | null }>(`/shipments/${r.slug}/reveal-sender`, { body: { reason: "Kirim Kode Ambil retur" } })
      const text = `Halo ${sender.brand ?? sender.name}, paket retur ${courierLabel(r.courier_code)} resi ${r.awb_number} (INV ${r.slug.toUpperCase()}) sudah tiba di gerai dalam kondisi ${COND_LABEL[r.condition]?.toLowerCase() ?? r.condition}. Ambil sebelum ${day(r.storage_deadline_at)} dengan menyebutkan Kode Ambil: ${x.code}. Jangan bagikan kode ini ke orang lain.`
      const phoneWa = wa(sender.phone)
      setShare({ url: phoneWa ? `https://wa.me/${phoneWa}?text=${encodeURIComponent(text)}` : "", pickupCode: x.code })
      setCopied(false)
    } catch (e) {
      onChange({ tone: "danger", text: e instanceof ApiError ? e.body.message : "Gagal membuat Kode Ambil." })
    } finally {
      setBusy(false)
    }
  }
  async function handback(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setFieldErr(null)
    try {
      await api(`/returns/${r.slug}/handback`, { body: override ? { override: { reason } } : { code } })
      onChange({ tone: "safe", text: `INV ${r.slug.toUpperCase()} sudah diserahkan ke pengirim.` })
    } catch (err) {
      setFieldErr(err instanceof ApiError ? err.body.message : "Gagal menyerahkan paket.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel as="li" className="flex flex-col gap-3 md:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link to="/kiriman/$slug" params={{ slug: r.slug }} className="inline-flex min-h-6 items-center font-medium text-primary underline-offset-4 hover:underline tabular-nums">INV {r.slug.toUpperCase()}</Link>
        <span className="text-base md:text-sm text-muted-foreground tabular-nums">{courierLabel(r.courier_code)} · {r.awb_number} · diterima {when(r.intake_at)}</span>
      </div>
      <p className="text-base md:text-sm">Kondisi: {COND_LABEL[r.condition] ?? r.condition} · simpan sampai {day(r.storage_deadline_at)}{r.conflict ? <span className="font-medium text-danger"> · status bertentangan</span> : null}</p>
      {r.claim_offered ? <p className="border-l-4 border-warn pl-3 text-base md:text-sm">Paket rusak/terbuka: ajukan klaim retur rusak sebelum batas waktu ekspedisi (Kiriman › Kendala & Klaim).</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={busy} onClick={sendCode}><MessageCircleIcon aria-hidden /> {r.code_issued_at ? "Kirim Ulang Kode Ambil" : "Kirim Kode Ambil"}</Button>
        {share?.url ? <a href={share.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-base md:text-sm font-medium text-primary-foreground md:h-10">Buka WhatsApp</a> : null}
        {share ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard?.writeText(share.pickupCode).then(
                () => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                },
                () => undefined,
              )
            }}
          >
            {copied ? <><CheckIcon aria-hidden /> Kode {share.pickupCode} tersalin</> : <><CopyIcon aria-hidden /> Salin Kode: {share.pickupCode}</>}
          </Button>
        ) : null}
      </div>
      <form onSubmit={handback} className="flex flex-wrap items-end gap-2" noValidate>
        {override ? (
          <Field className="min-w-0 flex-1"><FieldLabel htmlFor={`alasan-${r.slug}`}>Identitas yang dicek dan alasan (min. 5 karakter)</FieldLabel><Input id={`alasan-${r.slug}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} /></Field>
        ) : (
          <Field className="w-40"><FieldLabel htmlFor={`kode-${r.slug}`}>Kode Ambil</FieldLabel><Input id={`kode-${r.slug}`} inputMode="numeric" maxLength={4} className="tabular-nums" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></Field>
        )}
        <Button type="submit" disabled={busy || (override ? reason.trim().length < 5 : code.length !== 4)}>{busy ? "Memproses…" : "Serahkan ke Pengirim"}</Button>
        {owner ? <Button type="button" variant="ghost" disabled={busy} onClick={() => setOverride((x) => !x)}>{override ? "Pakai Kode Ambil" : "Tanpa kode (cek KTP)"}</Button> : null}
      </form>
      {fieldErr ? <p role="alert" className="text-base md:text-sm font-medium text-danger">{fieldErr}</p> : null}
    </Panel>
  )
}
