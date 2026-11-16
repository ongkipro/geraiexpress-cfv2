import { useState, type FormEvent } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { Button } from "@shared/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@shared/components/ui/field"
import { Input } from "@shared/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@shared/components/ui/tabs"
import { EmptyBlock, ErrorBlock, formatDate, LoadingBlock, ONBOARDING_LABEL, PageHead, Section, StatusChip } from "../../components/page"
import { api, ApiError } from "../../lib/api"
import { useApi } from "../../lib/use-api"
import { Textarea } from "@shared/components/ui/textarea"

// Super Admin `Sistem & Audit` (visual 07 §3.3): integration & relay health, audit log, admin access, company profile.
type Tab = "kesehatan" | "audit" | "admin" | "profil"

const EMAIL_STATE: Record<string, string> = { queued: "antre", sending: "sedang dikirim", sent: "terkirim", failed: "gagal", expired: "kedaluwarsa", suppressed: "diblokir penerima" }

const totpRedirect = (back: string) => window.location.assign(`/totp?mode=required&kembali=${encodeURIComponent(back)}`)

export function SistemPage() {
  const { tab } = useSearch({ strict: false }) as { tab?: Tab }
  const navigate = useNavigate()
  const current: Tab = tab ?? "kesehatan"
  return (
    <div className="flex flex-col gap-6">
      <PageHead title="Sistem & Audit" />
      <Tabs value={current} onValueChange={(v) => navigate({ to: "/sistem", search: { tab: v as Tab } })} className="min-w-0">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList aria-label="Bagian sistem">
            <TabsTrigger value="kesehatan">Kesehatan & Relay</TabsTrigger>
            <TabsTrigger value="audit">Log Audit</TabsTrigger>
            <TabsTrigger value="admin">Akses Admin</TabsTrigger>
            <TabsTrigger value="profil">Profil Perusahaan</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
      {current === "kesehatan" ? <Health /> : current === "audit" ? <AuditLog /> : current === "admin" ? <Admins /> : <Profile />}
    </div>
  )
}

interface HealthData {
  relay: { transport: string; reachable: boolean | null; latencyMs: number | null }
  partnerQuota: { minute: number; day: number } | null
  partnerLimits: { perMinute: number; registrationsPerDay: number }
  onboarding: Array<{ onboarding_state: string; n: number }>
  email: Array<{ state: string; n: number }>
  tenantsInRecovery: number
}

function Health() {
  const { data, error, loading, reload } = useApi<HealthData>("/sistem/kesehatan")
  if (loading) return <LoadingBlock />
  if (error || !data) return <ErrorBlock message={error ?? "Gagal memuat."} onRetry={reload} />
  const relay = data.relay.reachable === null ? { tone: "muted" as const, label: data.relay.transport === "relay" ? "Belum diperiksa" : "Langsung (tanpa relay)" } : data.relay.reachable ? { tone: "safe" as const, label: `Terjangkau · ${data.relay.latencyMs} ms` } : { tone: "danger" as const, label: "Relay tidak terjangkau" }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title="Mengantar Partner API">
        <dl className="flex flex-col gap-3 text-base">
          <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Jalur</dt><dd><StatusChip tone={relay.tone}>{relay.label}</StatusChip></dd></div>
          <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Kuota menit ini</dt><dd className="tabular-nums">{data.partnerQuota?.minute ?? "—"} / {data.partnerLimits.perMinute}</dd></div>
          <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Pendaftaran seller hari ini</dt><dd className="tabular-nums">{data.partnerQuota?.day ?? "—"} / {data.partnerLimits.registrationsPerDay}</dd></div>
        </dl>
      </Section>
      <Section title="Data gerai & email">
        <dl className="flex flex-col gap-3 text-base">
          <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Gerai dalam pemulihan</dt><dd className="tabular-nums">{data.tenantsInRecovery}</dd></div>
          {data.onboarding.map((o) => (
            <div key={o.onboarding_state} className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Seller: {ONBOARDING_LABEL[o.onboarding_state]?.label ?? o.onboarding_state}</dt><dd className="tabular-nums">{o.n}</dd></div>
          ))}
          {data.email.map((e) => (
            <div key={e.state} className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Email 7 hari: {EMAIL_STATE[e.state] ?? e.state}</dt><dd className="tabular-nums">{e.n}</dd></div>
          ))}
        </dl>
      </Section>
      <Section title="Rotasi Kunci Seller">
        <RotateKey />
      </Section>
    </div>
  )
}

function RotateKey() {
  const [slug, setSlug] = useState("")
  const [reason, setReason] = useState("")
  const [msg, setMsg] = useState<{ tone: "safe" | "danger" | "warn"; text: string } | null>(null)
  const [pending, setPending] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    setMsg(null)
    try {
      const r = await api<{ state: "rotated" | "unknown" | "failed"; code?: string; webhookUrlChanged?: boolean }>(`/sistem/rotasi-kunci/${encodeURIComponent(slug.trim())}`, { body: { reason } })
      setMsg(
        r.state === "rotated"
          ? { tone: "safe", text: r.webhookUrlChanged ? "Kunci diganti. URL webhook gerai berubah — minta pemilik memperbarui di Mengantar." : "Kunci diganti — perbarui secret webhook." }
          : r.state === "unknown"
            ? { tone: "warn", text: "Hasil rotasi belum pasti. Sistem memeriksa kunci aktif otomatis; jangan ulangi rotasi." }
            : { tone: "danger", text: `Rotasi ditolak Mengantar (${r.code}). Kunci lama tetap berlaku.` },
      )
      setReason("")
    } catch (err) {
      if (err instanceof ApiError && err.body.code === "TOTP_RECENT_REQUIRED") return totpRedirect("/sistem")
      setMsg({ tone: "danger", text: err instanceof ApiError ? err.body.message : "Gagal merotasi kunci." })
    } finally {
      setPending(false)
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <p className="text-base text-muted-foreground">Gunakan bila kunci API seller diduga bocor. Pengiriman gerai dijeda sebentar selama rotasi.</p>
      <Field>
        <FieldLabel htmlFor="rot-slug">Alamat gerai</FieldLabel>
        <Input id="rot-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="berkahjaya" autoComplete="off" />
      </Field>
      <Field>
        <FieldLabel htmlFor="rot-reason">Alasan (wajib, dicatat di log audit)</FieldLabel>
        <Textarea id="rot-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} />
      </Field>
      <div><Button type="submit" variant="destructive" disabled={pending || slug.trim().length < 3 || reason.trim().length < 5}>{pending ? "Memproses…" : "Rotasi Kunci Seller"}</Button></div>
      {msg ? <p role="status" className={`border-l-4 py-1 pl-3 text-base font-medium ${msg.tone === "safe" ? "border-safe text-safe" : msg.tone === "warn" ? "border-warn text-warn" : "border-danger text-danger"}`}>{msg.text}</p> : null}
    </form>
  )
}

interface AuditRow { id: string; at: number; actor_type: string; actor_name: string | null; tenant_slug: string | null; action: string; target_type: string | null; reason: string | null }

function AuditLog() {
  const [action, setAction] = useState("")
  const [tenant, setTenant] = useState("")
  const [path, setPath] = useState("/sistem/audit")
  const { data, error, loading, reload } = useApi<{ items: AuditRow[] }>(path)
  const needsTotp = error?.includes("TOTP") || error?.toLowerCase().includes("verifikasi")
  return (
    <Section title="Log audit">
      <form onSubmit={(e) => { e.preventDefault(); setPath(`/sistem/audit?action=${encodeURIComponent(action)}&tenant=${encodeURIComponent(tenant)}`) }} className="mb-4 grid gap-3 sm:grid-cols-3 sm:items-end" role="search">
        <Field><FieldLabel htmlFor="f-aksi">Aksi (awalan)</FieldLabel><Input id="f-aksi" value={action} onChange={(e) => setAction(e.target.value)} placeholder="pricing." /></Field>
        <Field><FieldLabel htmlFor="f-gerai">Gerai</FieldLabel><Input id="f-gerai" value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="berkahjaya" /></Field>
        <Button type="submit" variant="outline">Terapkan</Button>
      </form>
      {loading ? <LoadingBlock /> : error ? (
        needsTotp ? <div className="flex flex-col items-start gap-3"><p className="text-base">Melihat log audit butuh verifikasi TOTP terbaru.</p><Button onClick={() => totpRedirect("/sistem?tab=audit")}>Verifikasi TOTP</Button></div> : <ErrorBlock message={error} onRetry={reload} />
      ) : !data?.items.length ? (
        <EmptyBlock title="Tidak ada catatan" body="Coba ubah filter." />
      ) : (
        <ul className="divide-y">
          {data.items.map((a) => (
            <li key={a.id} className="flex flex-col gap-1 py-3 text-base">
              <span className="flex flex-wrap justify-between gap-2"><span className="font-medium">{a.action}</span><span className="text-muted-foreground tabular-nums">{formatDate(a.at)}</span></span>
              <span className="text-muted-foreground">{a.actor_name ?? a.actor_type}{a.tenant_slug ? ` · ${a.tenant_slug}` : ""}{a.reason ? ` · “${a.reason}”` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

interface AdminRow { user_id: string; name: string; email: string; totp_state: string; status: string; risk_review: number }

function Admins() {
  const { data, error, loading, reload } = useApi<{ items: AdminRow[]; me: string }>("/sistem/admin")
  if (loading) return <LoadingBlock />
  if (error || !data) return <ErrorBlock message={error ?? "Gagal memuat."} onRetry={reload} />
  return (
    <Section title="Super Admin">
      <ul className="divide-y">
        {data.items.map((a) => (
          <li key={a.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-base">
            <span className="flex flex-col"><span className="font-medium">{a.name}{a.user_id === data.me ? " (Anda)" : ""}</span><span className="text-muted-foreground">{a.email}</span></span>
            <span className="flex flex-wrap gap-2">
              <StatusChip tone={a.totp_state === "active" ? "safe" : "warn"}>{a.totp_state === "active" ? "TOTP aktif" : "TOTP belum aktif"}</StatusChip>
              <StatusChip tone={a.risk_review ? "primary" : "muted"}>{a.risk_review ? "Boleh lihat radar risiko" : "Tanpa radar risiko"}</StatusChip>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

const PROFILE_LABEL: Record<string, string> = {
  legal_name: "Nama badan usaha",
  brand_name: "Nama merek",
  nib: "NIB",
  akta_number: "Nomor akta",
  akta_date: "Tanggal akta (YYYY-MM-DD)",
  sk_kemenkumham_number: "Nomor SK Kemenkumham",
  pse_registration_number: "Nomor PSE",
  registered_address: "Alamat terdaftar",
  correspondence_address: "Alamat surat-menyurat",
  support_email: "Email bantuan",
  support_whatsapp: "WhatsApp bantuan",
  privacy_contact_email: "Email kontak privasi",
  director_name: "Nama direktur",
}

function Profile() {
  const { data, error, loading, reload } = useApi<{ fields: Record<string, string | null>; npwpMasked: string | null; updatedAt: number | null }>("/sistem/profil-perusahaan")
  if (loading) return <LoadingBlock />
  if (error || !data) return <ErrorBlock message={error ?? "Gagal memuat."} onRetry={reload} />
  return <ProfileForm key={data.updatedAt ?? 0} data={data} onSaved={reload} />
}

function ProfileForm({ data, onSaved }: { data: { fields: Record<string, string | null>; npwpMasked: string | null; updatedAt: number | null }; onSaved: () => void }) {
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(Object.entries(data.fields).map(([k, x]) => [k, x ?? ""])))
  const [npwp, setNpwp] = useState("")
  const [reason, setReason] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const dirty = Object.entries(v).some(([k, x]) => x !== (data.fields[k] ?? "")) || npwp.length > 0
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    setErrors({})
    setMsg(null)
    const changed = Object.fromEntries(Object.entries(v).filter(([k, x]) => x !== (data.fields[k] ?? "")))
    try {
      await api("/sistem/profil-perusahaan", { body: { fields: changed, ...(npwp ? { npwp } : {}), reason } })
      setMsg("Profil perusahaan tersimpan.")
      onSaved()
    } catch (err) {
      if (err instanceof ApiError && err.body.code === "TOTP_RECENT_REQUIRED") return totpRedirect("/sistem?tab=profil")
      if (err instanceof ApiError) {
        setErrors(err.body.field_errors)
        setMsg(err.body.message)
      } else setMsg("Gagal menyimpan.")
    } finally {
      setPending(false)
    }
  }
  return (
    <Section title="Profil perusahaan operator">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <p className="text-base text-muted-foreground">Kosongkan bila belum ada. Halaman publik dan email hanya menampilkan isian yang sudah terisi.{data.updatedAt ? ` Terakhir diubah ${formatDate(data.updatedAt)}.` : ""}</p>
        <div className="grid gap-4 md:grid-cols-2">
          {Object.keys(PROFILE_LABEL).map((k) => (
            <Field key={k} data-invalid={errors[k] ? true : undefined}>
              <FieldLabel htmlFor={`lp-${k}`}>{PROFILE_LABEL[k]}</FieldLabel>
              <Input id={`lp-${k}`} value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} maxLength={300} aria-invalid={errors[k] ? true : undefined} />
              {errors[k] ? <FieldError>{errors[k]}</FieldError> : null}
            </Field>
          ))}
          <Field data-invalid={errors.npwp ? true : undefined}>
            <FieldLabel htmlFor="lp-npwp">NPWP</FieldLabel>
            <Input id="lp-npwp" value={npwp} onChange={(e) => setNpwp(e.target.value)} inputMode="numeric" autoComplete="off" placeholder={data.npwpMasked ?? "Belum diisi"} />
            {errors.npwp ? <FieldError>{errors.npwp}</FieldError> : <FieldDescription>Disimpan terenkripsi; hanya 4 digit terakhir yang ditampilkan.</FieldDescription>}
          </Field>
        </div>
        {dirty ? (
          <div className="sticky bottom-0 flex flex-col gap-3 border-t bg-card pt-4 sm:flex-row sm:items-end">
            <Field className="flex-1">
              <FieldLabel htmlFor="lp-reason">Alasan (wajib, dicatat di log audit)</FieldLabel>
              <Textarea id="lp-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} />
            </Field>
            <Button type="submit" disabled={pending || reason.trim().length < 5}>{pending ? "Menyimpan…" : "Simpan"}</Button>
          </div>
        ) : null}
        {msg ? <p role="status" className="text-base">{msg}</p> : null}
      </form>
    </Section>
  )
}
