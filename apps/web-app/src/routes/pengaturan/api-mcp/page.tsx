import { useCallback, useEffect, useState, type FormEvent } from "react"
import { CopyIcon } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { api, ApiError } from "../../../lib/api"
import { rp } from "../../kasir/quote-panel"
import { ErrorState, LoadingState } from "../../../shell/states"
import { Notice, SettingsLayout } from "../index/shared"

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
const when = (ms: number | null) => (ms ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(ms) : "Belum pernah")

export function ApiMcpPage() {
  const [d, setD] = useState<{ items: Key[]; scopes: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: "safe" | "danger"; text: string } | null>(null)
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
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
    try {
      await api(`/api-keys/${k.id}/revoke`, { body: {} })
      setMsg({ tone: "safe", text: `Kunci ${k.name} dicabut. Integrasi yang memakainya langsung berhenti.` })
      setConfirm(null)
      load()
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof ApiError ? e.body.message : "Gagal mencabut kunci." })
    }
  }
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  if (error) return <SettingsLayout title="API & MCP"><ErrorState message={error} onRetry={load} /></SettingsLayout>
  if (!d) return <SettingsLayout title="API & MCP"><LoadingState label="Memuat kunci API" /></SettingsLayout>
  const live = d.items.filter((k) => !k.revoked_at)
  return (
    <SettingsLayout title="API & MCP" description="Hubungkan toko online, bot WhatsApp, atau asisten AI ke gerai Anda.">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Alamat integrasi</CardTitle>
          <CardDescription className="text-base">Berikan alamat ini bersama kunci API kepada pengembang integrasi.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-base">
          <p>API: <span className="font-mono break-all">{origin}/api/v1</span> · <a href="/api/v1/docs" target="_blank" rel="noopener" className="text-primary underline-offset-4 hover:underline">Dokumentasi API</a></p>
          <p>MCP: <span className="font-mono break-all">{origin}/mcp</span></p>
        </CardContent>
      </Card>
      {created ? (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-lg">Kunci {created.name} dibuat</CardTitle>
            <CardDescription className="text-base">Salin sekarang. Kunci ini hanya ditampilkan sekali dan tidak bisa dilihat lagi.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="font-mono text-base break-all" aria-label="Kunci API baru">{created.token}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void navigator.clipboard?.writeText(created.token).then(() => setMsg({ tone: "safe", text: "Kunci disalin." }))}><CopyIcon aria-hidden /> Salin Kunci</Button>
              <Button variant="ghost" onClick={() => setCreated(null)}>Sudah Saya Simpan</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <CreateKey scopes={d.scopes} onCreated={(x) => { setCreated(x); setMsg(null); load() }} />
      <Card>
        <CardHeader><CardTitle className="text-lg">Kunci aktif ({live.length})</CardTitle></CardHeader>
        <CardContent>
          {live.length === 0 ? <p className="text-base text-muted-foreground">Belum ada kunci aktif.</p> : (
            <ul className="divide-y">
              {live.map((k) => (
                <li key={k.id} className="flex flex-col gap-2 py-3 text-base">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span><span className="font-medium">{k.name}</span> <span className="font-mono text-muted-foreground">{k.token_prefix}…</span></span>
                    <span className="text-muted-foreground">Terakhir dipakai: {when(k.last_used_at)}</span>
                  </div>
                  <p className="text-muted-foreground">{k.scopes.map((s) => SCOPE_LABEL[s] ?? s).join(" · ")}{k.daily_issue_cap_idr ? ` · batas harian ${rp(k.daily_issue_cap_idr)}` : ""}</p>
                  {confirm === k.id ? (
                    <div className="flex flex-wrap items-center gap-2" role="alertdialog" aria-label={`Cabut kunci ${k.name}`}>
                      <span className="font-medium text-danger">Cabut kunci {k.name}? Integrasi yang memakainya langsung berhenti.</span>
                      <Button variant="outline" onClick={() => setConfirm(null)}>Batal</Button>
                      <Button variant="destructive" onClick={() => revoke(k)}>Ya, Cabut Kunci</Button>
                    </div>
                  ) : (
                    <div><Button variant="outline" onClick={() => setConfirm(k.id)}>Cabut</Button></div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
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
    <Card>
      <CardHeader><CardTitle className="text-lg">Buat kunci baru</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field data-invalid={fields.name ? true : undefined}><FieldLabel htmlFor="key-name">Nama kunci</FieldLabel><Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Toko Shopify Nisa" />{fields.name ? <FieldError>{fields.name}</FieldError> : null}</Field>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-base font-medium">Izin</legend>
            {scopes.map((s) => (
              <label key={s} className="flex min-h-11 items-center gap-3 text-base">
                <input type="checkbox" className="size-5" checked={picked.has(s)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(s); else n.delete(s); return n })} />
                {SCOPE_LABEL[s] ?? s}
              </label>
            ))}
            {fields.scopes ? <FieldError>{fields.scopes}</FieldError> : <FieldDescription>Pencatatan pembayaran di loket tidak pernah bisa lewat API.</FieldDescription>}
          </fieldset>
          {issue ? (
            <Field data-invalid={fields.dailyIssueCapIdr ? true : undefined}><FieldLabel htmlFor="key-cap">Batas nilai kiriman per hari (Rp)</FieldLabel><Input id="key-cap" inputMode="numeric" className="w-48 tabular-nums" value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, "") ? Number(e.target.value.replace(/\D/g, "")).toLocaleString("id-ID") : "")} />{fields.dailyIssueCapIdr ? <FieldError>{fields.dailyIssueCapIdr}</FieldError> : <FieldDescription>Wajib untuk izin terbitkan resi.</FieldDescription>}</Field>
          ) : null}
          {fields.form && !Object.keys(fields).some((k) => k !== "form") ? <p role="alert" className="text-base text-danger">{fields.form}</p> : null}
          <div><Button type="submit" disabled={pending || !name.trim()}>Buat Kunci</Button></div>
        </form>
      </CardContent>
    </Card>
  )
}
