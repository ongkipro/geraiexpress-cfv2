import { useCallback, useEffect, useState, type FormEvent } from "react"
import { CopyIcon, ExternalLinkIcon } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../../components/ui/alert-dialog"
import { AnchorButton } from "../../../components/admin/link-button"
import { DataTableShell } from "../../../components/admin/data-table"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { api, ApiError } from "../../../lib/api"
import { rp } from "../../kasir/quote-panel"
import { ErrorState, LoadingState } from "../../../shell/states"
import { Notice, SettingsLayout } from "../index/shared"
import { CheckboxField, CopyField, SectionCard } from "../../../components/admin/page"

// Pengaturan › API & MCP (spec 08 §2, visual 08 §2.3): keys table, `Buat Kunci` (the token is shown once), revoke with
// a confirm naming the key, links to the API reference and the MCP endpoint.
interface Key { id: string; name: string; token_prefix: string; scopes: string[]; daily_issue_cap_idr: number | null; created_at: number; last_used_at: number | null; revoked_at: number | null }
const SCOPE_LABEL: Record<string, string> = {
  "rates:read": "Cek tarif",
  "shipments:draft": "Buat draf INV (disarankan untuk toko online)",
  "tracking:read": "Lihat status kiriman",
  "contacts:read": "Lihat kontak",
  "contacts:write": "Tambah/ubah kontak",
  "shipments:issue": "Terbitkan resi (memakai saldo Mengantar)",
  "finance:read": "Lihat biaya, laba, dan saldo",
  "finance:sync": "Sinkronkan keuangan",
}
function ScopeList({ k }: { k: Key }) {
  return (
    <span className="flex flex-wrap gap-1">
      {k.scopes.map((s) => <span key={s} className="rounded-full border border-slate-200 bg-white px-2 py-px text-xs text-slate-700">{SCOPE_SHORT[s] ?? s}</span>)}
      {k.daily_issue_cap_idr ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-px text-xs text-slate-700 tabular-nums">batas {rp(k.daily_issue_cap_idr)}/hari</span> : null}
    </span>
  )
}
const SCOPE_SHORT: Record<string, string> = { "rates:read": "Cek tarif", "shipments:draft": "Draf INV", "tracking:read": "Status kiriman", "contacts:read": "Lihat kontak", "contacts:write": "Ubah kontak", "shipments:issue": "Terbitkan resi", "finance:read": "Lihat keuangan", "finance:sync": "Sinkron keuangan" }
const SCOPE_HINT: Record<string, string> = {
  "rates:read": "Ongkir semua ekspedisi aktif.",
  "shipments:draft": "Disarankan untuk toko online.",
  "tracking:read": "Status & riwayat pelacakan.",
  "contacts:read": "Daftar pengirim dan penerima.",
  "contacts:write": "Tambah atau ubah kontak.",
  "shipments:issue": "Memakai saldo Mengantar; wajib batas harian.",
  "finance:read": "Biaya, laba, dan saldo.",
  "finance:sync": "Tarik ulang data keuangan.",
}
const when = (ms: number | null) => (ms ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(ms) : "Belum pernah")

export function ApiMcpPage() {
  const [d, setD] = useState<{ items: Key[]; scopes: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: "safe" | "danger"; text: string } | null>(null)
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null)
  const [confirm, setConfirmState] = useState<string | null>(null)
  const [revokeErr, setRevokeErr] = useState<string | null>(null)
  const [revoking, setRevoking] = useState(false)
  const setConfirm = (id: string | null) => {
    setRevokeErr(null)
    setConfirmState(id)
  }
  const load = useCallback(() => {
    api<{ items: Key[]; scopes: string[] }>("/api-keys")
      .then((x) => {
        setError(null)
        setD(x)
      })
      .catch((e) => setError(e instanceof ApiError ? e.body.message : "Kunci API tidak dapat dimuat."))
  }, [])
  useEffect(load, [load])
  async function revoke(k: Key) {
    if (revoking) return
    setRevoking(true)
    try {
      await api(`/api-keys/${k.id}/revoke`, { body: {} })
      setMsg({ tone: "safe", text: `Kunci ${k.name} dicabut. Integrasi yang memakainya langsung berhenti.` })
      setConfirm(null)
      load()
    } catch (e) {
      // Shown inside the still-open dialog (Sol R1 #1): the page notice would sit behind the modal.
      setRevokeErr(e instanceof ApiError ? e.body.message : "Gagal mencabut kunci.")
    } finally {
      setRevoking(false)
    }
  }
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  if (error) return <SettingsLayout title="API & MCP"><ErrorState message={error} onRetry={load} /></SettingsLayout>
  if (!d) return <SettingsLayout title="API & MCP"><LoadingState label="Memuat kunci API" /></SettingsLayout>
  const live = d.items.filter((k) => !k.revoked_at)
  const confirmed = live.find((k) => k.id === confirm) ?? null
  return (
    <SettingsLayout title="API & MCP" description="Hubungkan toko online, bot WhatsApp, atau asisten AI ke gerai Anda.">
      <SectionCard title="Alamat integrasi" description="Berikan alamat ini bersama kunci API kepada pengembang integrasi.">
        <div className="flex flex-col gap-4">
          <CopyField label="REST API (OpenAPI v1)" value={`${origin}/api/v1`} action={<AnchorButton variant="outline" href="/api/v1/docs" target="_blank" rel="noopener">Dokumentasi <ExternalLinkIcon aria-hidden /></AnchorButton>} />
          <CopyField label="MCP Server" value={`${origin}/mcp`} />
        </div>
      </SectionCard>
      {created ? (
        <SectionCard title={`Kunci ${created.name} dibuat`} description="Salin sekarang. Kunci ini hanya ditampilkan sekali dan tidak bisa dilihat lagi." className="border-primary/50">
          <div className="flex flex-col gap-3">
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-sm break-all" aria-label="Kunci API baru">{created.token}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void navigator.clipboard?.writeText(created.token).then(() => setMsg({ tone: "safe", text: "Kunci disalin." })).catch(() => setMsg({ tone: "danger", text: "Gagal menyalin kunci. Salin manual dari kotak di atas." }))}><CopyIcon aria-hidden /> Salin Kunci</Button>
              <Button variant="ghost" onClick={() => setCreated(null)}>Sudah Saya Simpan</Button>
            </div>
          </div>
        </SectionCard>
      ) : null}
      <CreateKey scopes={d.scopes} onCreated={(x) => { setCreated(x); setMsg(null); load() }} />
      <SectionCard title="Kunci aktif" description={<span className="tabular-nums">{live.length} kunci</span>} flush>
        {live.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground md:px-5">Belum ada kunci aktif.</p> : (
          <DataTableShell
            bare
            caption="Kunci API aktif"
            rows={live}
            rowKey={(k) => k.id}
            columns={[
              { key: "nama", header: "Nama", cell: (k) => <span className="flex flex-col"><span className="font-medium">{k.name}</span><span className="font-mono text-xs text-muted-foreground">{k.token_prefix}…</span></span> },
              { key: "izin", header: "Izin", cell: (k) => <ScopeList k={k} /> },
              { key: "pakai", header: "Terakhir dipakai", cell: (k) => <span className="text-muted-foreground">{when(k.last_used_at)}</span>, wide: true },
              { key: "aksi", header: <span className="sr-only">Aksi</span>, align: "right", cell: (k) => <Button variant="outline" size="sm" onClick={() => setConfirm(k.id)}>Cabut</Button> },
            ]}
            mobile={(k) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex flex-col"><span className="font-medium">{k.name}</span><span className="font-mono text-xs text-muted-foreground">{k.token_prefix}…</span></span>
                  <Button variant="outline" size="sm" onClick={() => setConfirm(k.id)}>Cabut</Button>
                </div>
                <ScopeList k={k} />
                <span className="text-xs text-muted-foreground">Terakhir dipakai: {when(k.last_used_at)}</span>
              </div>
            )}
          />
        )}
      </SectionCard>
      <AlertDialog open={!!confirmed} onOpenChange={(o) => !o && !revoking && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cabut kunci {confirmed?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Integrasi yang memakainya langsung berhenti.</AlertDialogDescription>
          </AlertDialogHeader>
          {revokeErr ? <p role="alert" className="text-sm font-medium text-danger">{revokeErr}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Batal</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={revoking} onClick={() => confirmed && revoke(confirmed)}>{revoking ? "Mencabut…" : "Ya, Cabut Kunci"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Notice msg={msg} />
    </SettingsLayout>
  )
}

function CreateKey({ scopes, onCreated }: { scopes: string[]; onCreated: (x: { name: string; token: string }) => void }) {
  const [name, setName] = useState("")
  const [picked, setPicked] = useState<Set<string>>(new Set(["rates:read", "shipments:draft", "tracking:read"]))
  const [cap, setCap] = useState("")
  const [fields, setFields] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const issue = picked.has("shipments:issue")
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    setPending(true)
    setFields({})
    try {
      const r = await api<{ token: string }>("/api-keys", { body: { name, scopes: [...picked], dailyIssueCapIdr: issue ? Number(cap.replace(/\D/g, "")) : null } })
      onCreated({ name, token: r.token })
      setName("")
    } catch (err) {
      setFields(err instanceof ApiError ? { ...(err.body.field_errors ?? {}), form: err.body.message } : { form: "Gagal membuat kunci." })
    } finally {
      setPending(false)
    }
  }
  return (
    <SectionCard title="Buat kunci baru" description="Satu kunci per integrasi agar mudah dicabut.">
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field className="sm:max-w-md" data-invalid={fields.name ? true : undefined}><FieldLabel htmlFor="key-name">Nama kunci</FieldLabel><Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Toko Shopify Nisa" />{fields.name ? <FieldError>{fields.name}</FieldError> : null}</Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Izin</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {scopes.map((s) => (
                <CheckboxField key={s} align="start" className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 hover:bg-slate-50 has-data-checked:border-primary has-data-checked:bg-accent/50 md:py-2.5" checked={picked.has(s)} onCheckedChange={(on) => setPicked((p) => { const n = new Set(p); if (on) n.add(s); else n.delete(s); return n })}>
                  <span className="flex flex-col gap-0.5"><span className="font-medium">{SCOPE_LABEL[s] ?? s}</span>{SCOPE_HINT[s] ? <span className="text-xs text-muted-foreground">{SCOPE_HINT[s]}</span> : null}</span>
                </CheckboxField>
              ))}
            </div>
            {fields.scopes ? <FieldError>{fields.scopes}</FieldError> : <FieldDescription>Pencatatan pembayaran di loket tidak pernah bisa lewat API.</FieldDescription>}
          </fieldset>
          {issue ? (
            <Field data-invalid={fields.dailyIssueCapIdr ? true : undefined}><FieldLabel htmlFor="key-cap">Batas nilai kiriman per hari (Rp)</FieldLabel><Input id="key-cap" inputMode="numeric" className="w-48 tabular-nums" value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, "") ? Number(e.target.value.replace(/\D/g, "")).toLocaleString("id-ID") : "")} />{fields.dailyIssueCapIdr ? <FieldError>{fields.dailyIssueCapIdr}</FieldError> : <FieldDescription>Wajib untuk izin terbitkan resi.</FieldDescription>}</Field>
          ) : null}
          {fields.form && !Object.keys(fields).some((k) => k !== "form") ? <p role="alert" className="text-base md:text-sm text-danger">{fields.form}</p> : null}
          <div><Button type="submit" disabled={pending || !name.trim()}>{pending ? "Membuat…" : "Buat Kunci"}</Button></div>
        </form>
    </SectionCard>
  )
}
