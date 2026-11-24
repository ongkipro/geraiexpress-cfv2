import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "@tanstack/react-router"
import { ExternalLinkIcon } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../../components/ui/card"
import { CopyField, SectionCard, StatusBadge } from "../../../components/admin/page"
import { AnchorButton } from "../../../components/admin/link-button"
import { readSettingsCache, SettingsLayout, writeSettingsCache } from "../index/shared"
import { Skeleton } from "../../../components/ui/skeleton"
import { FormAlert } from "../../../components/auth/auth-card"
import { TextField } from "../../../components/auth/text-field"
import { api, ApiError } from "../../../lib/api"
import { ErrorState } from "../../../shell/states"
import { refreshCounterStatus, useWorkspace } from "../../../shell/workspace"

// Pengaturan › Mengantar (PR-02b, visual 08 §2): copy the webhook URL into Mengantar Seller Settings, paste the
// Webhook Secret back, see the status. Hourly polling keeps statuses current until the webhook is active.
interface Settings {
  webhookUrl: string | null
  webhookState: "unconfigured" | "awaiting_seller_setup" | "active" | "secret_mismatch" | "paused" | null
  hasSecret: boolean
  lastEventAt: number | null
  lastFailureAt: number | null
  lastPolledAt: number | null
  lastSyncStatus: string | null
  onboardingState: string | null
  sellerId: string | null
  sellerEmail?: string | null
  environment: "sandbox" | "production" | null
}

const STATE: Record<NonNullable<Settings["webhookState"]>, { label: string; tone: "safe" | "warn" | "danger" | "muted"; help: string }> = {
  unconfigured: { label: "Belum diatur", tone: "muted", help: "Hubungkan akun Mengantar terlebih dahulu." },
  awaiting_seller_setup: { label: "Menunggu pengaturan", tone: "warn", help: "Tempel URL di Mengantar dan simpan Webhook Secret di bawah. Status kiriman tetap diperbarui setiap jam." },
  active: { label: "Aktif", tone: "safe", help: "Status kiriman diperbarui otomatis begitu Mengantar mengirim kabar." },
  secret_mismatch: { label: "Secret tidak cocok", tone: "danger", help: "Kabar dari Mengantar ditolak karena Webhook Secret berbeda. Salin ulang secret dari Mengantar lalu simpan." },
  paused: { label: "Dijeda Mengantar", tone: "danger", help: "Mengantar menjeda webhook. Aktifkan lagi di Pengaturan › Akun › Integrasi Public API di Mengantar. Status tetap kami periksa berkala." },
}

const fmt = (ms: number | null) => (ms ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(ms) + " WIB" : "—")

export function PengaturanMengantarPage() {
  const router = useRouter()
  const w = useWorkspace()
  const cacheKey = `mengantar:${w.tenant.id}`
  const [data, setData] = useState<Settings | null>(() => readSettingsCache<Settings>(cacheKey))
  const [error, setError] = useState<string | null>(null)
  const [secret, setSecret] = useState("")
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [byokKey, setByokKey] = useState("")
  const [byokErr, setByokErr] = useState<string | undefined>()
  const [byokSaving, setByokSaving] = useState(false)
  const [byokDone, setByokDone] = useState(false)
  const gen = useRef(0)

  const load = useCallback(() => {
    const mine = ++gen.current
    api<Settings>("/settings/mengantar")
      .then((d) => {
        if (mine !== gen.current) return
        writeSettingsCache(cacheKey, d)
        setError(null)
        setData(d)
      })
      .catch((e) => {
        if (mine !== gen.current) return
        if (e instanceof ApiError && e.status === 401) window.location.assign("/masuk")
        else if (!readSettingsCache<Settings>(cacheKey)) setError(e instanceof ApiError ? e.body.message : "Pengaturan tidak dapat dimuat.")
      })
  }, [cacheKey])
  useEffect(() => {
    load()
    const g = gen
    return () => { g.current++ }
  }, [load])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setFieldError(undefined)
    setSaved(false)
    setSaving(true)
    try {
      const next = await api<Settings>("/settings/mengantar/webhook-secret", { body: { secret } })
      gen.current++
      writeSettingsCache(cacheKey, next)
      setData(next)
      setSecret("")
      setSaved(true)
      refreshCounterStatus()
      void router.invalidate()
    } catch (err) {
      if (err instanceof ApiError) setFieldError(err.body.field_errors.secret ?? err.body.message)
      else setFieldError("Gagal menyimpan. Coba lagi.")
    } finally {
      setSaving(false)
    }
  }

  async function connectByok(e: FormEvent) {
    e.preventDefault()
    if (byokSaving) return
    setByokErr(undefined)
    setByokDone(false)
    setByokSaving(true)
    try {
      await api("/onboarding/byok", { body: { apiKey: byokKey.trim() } })
      setByokKey("")
      setByokDone(true)
      refreshCounterStatus()
      void router.invalidate()
      load()
    } catch (err) {
      if (err instanceof ApiError) setByokErr(err.body.field_errors.apiKey ?? err.body.message)
      else setByokErr("Gagal menghubungkan API key. Coba lagi.")
    } finally {
      setByokSaving(false)
    }
  }

  const st = STATE[data?.webhookState ?? "unconfigured"]
  const connected = Boolean(data && (data.onboardingState === "connected" || data.onboardingState === "byok_connected" || data.sellerId))
  const canByok = Boolean(data && ["existing_account_required", "byok_connected", "registration_pending"].includes(data.onboardingState ?? ""))
  const sellerWebUrl = data?.environment === "sandbox" ? "https://sandbox.mengantar.com" : "https://app.mengantar.com"
  return (
    <SettingsLayout title="Mengantar" description="Hubungkan kabar status kiriman dari Mengantar ke gerai Anda.">
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!data && !error ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat pengaturan">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : null}

      {data ? (
        <>
          <SectionCard title="Status koneksi" description={st.help} action={<StatusBadge tone={st.tone}>{st.label}</StatusBadge>} flush>
            <dl className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="flex flex-col gap-1 px-4 py-3.5 md:px-5">
                <dt className="text-xs text-muted-foreground">Akun Mengantar</dt>
                <dd className="text-sm font-medium">
                  {connected ? `${data.onboardingState === "byok_connected" ? "Terhubung (API key sendiri)" : "Terhubung"}${data.environment === "sandbox" ? " · sandbox" : ""}` : "Belum terhubung"}
                </dd>
                {data.sellerEmail ? <dd className="truncate text-xs text-muted-foreground">{data.sellerEmail}</dd> : null}
              </div>
              <div className="flex flex-col gap-1 px-4 py-3.5 md:px-5">
                <dt className="text-xs text-muted-foreground">Kabar terakhir diterima</dt>
                <dd className="text-sm font-medium tabular-nums">{fmt(data.lastEventAt)}</dd>
              </div>
              <div className="flex flex-col gap-1 px-4 py-3.5 md:px-5">
                <dt className="text-xs text-muted-foreground">Pemeriksaan status terakhir</dt>
                <dd className="text-sm font-medium tabular-nums">{fmt(data.lastPolledAt)}</dd>
              </div>
            </dl>
          </SectionCard>

          {canByok ? (
            <Card className="gap-0 py-0 md:py-0">
              <form onSubmit={connectByok} noValidate>
                <CardHeader className="border-b border-slate-100 py-3.5 md:py-4">
                  <CardTitle><h2 className="text-sm font-semibold text-slate-950 md:text-base">{data.onboardingState === "byok_connected" ? "Perbarui API Key Mengantar" : "Hubungkan Akun Mengantar Sendiri"}</h2></CardTitle>
                  <CardDescription>
                    {data.onboardingState === "existing_account_required"
                      ? "Email Anda sudah terdaftar di Mengantar. Tempel API Key dari Seller Web Mengantar agar gerai langsung aktif."
                      : "Gunakan API Key dari Pengaturan Akun › Integrasi Public API di Seller Web Mengantar."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 py-4 md:py-5">
                  <TextField
                    label="API Key Mengantar"
                    name="apiKey"
                    type="password"
                    value={byokKey}
                    onChange={setByokKey}
                    autoComplete="off"
                    maxLength={128}
                    required
                    error={byokErr}
                    hint="Salin dari Mengantar › Pengaturan › Akun › Integrasi Public API."
                  />
                  {byokDone ? <FormAlert tone="safe">API Key Mengantar terhubung. Gerai siap cek ongkir dan terbitkan resi.</FormAlert> : null}
                </CardContent>
                <CardFooter className="justify-end gap-2 bg-slate-50/70">
                  <Button type="submit" className="w-full sm:w-auto" disabled={byokSaving || byokKey.trim().length < 8}>
                    {byokSaving ? "Menghubungkan…" : data.onboardingState === "byok_connected" ? "Perbarui API Key" : "Hubungkan Akun"}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          ) : null}

          {connected ? (
            <SectionCard
              title="Masuk Seller Web Mengantar & Top-up Saldo"
              description="Saldo ongkir, pencairan COD, dan pengaturan webhook dikelola langsung di Seller Web Mengantar."
              action={<AnchorButton variant="outline" size="sm" href={sellerWebUrl} target="_blank" rel="noopener noreferrer">Buka Mengantar <ExternalLinkIcon aria-hidden /></AnchorButton>}
            >
              <p className="text-sm text-slate-700">
                Masuk menggunakan email {data.sellerEmail ? <strong className="font-semibold text-slate-950">{data.sellerEmail}</strong> : "akun Mengantar gerai Anda"}. Bila akun dibuat otomatis oleh GeraiExpress dan belum memiliki kata sandi, klik <strong className="font-semibold text-slate-950">Lupa Password</strong> di halaman masuk Mengantar untuk membuat kata sandi baru.
              </p>
            </SectionCard>
          ) : null}

          {data.webhookUrl ? (
            <Card className="gap-0 py-0 md:py-0">
              <form onSubmit={save} noValidate>
                <CardHeader className="border-b border-slate-100 py-3.5 md:py-4">
                  <CardTitle><h2 className="text-sm font-semibold text-slate-950 md:text-base">Atur webhook di Mengantar</h2></CardTitle>
                  <CardDescription>Tiga langkah, cukup sekali.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-5 py-4 md:py-5">
                  <ol className="flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm">
                    {["Buka Mengantar › Pengaturan › Akun › Integrasi Public API.", "Tempel URL di bawah pada kolom Webhook URL, lalu simpan.", "Salin Webhook Secret yang muncul di Mengantar dan simpan di formulir ini."].map((t, i) => (
                      <li key={t} className="flex gap-2.5">
                        <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full bg-white text-xs font-semibold text-slate-700 ring-1 ring-slate-200">{i + 1}</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="flex flex-col gap-1.5">
                    <CopyField label="URL webhook gerai" value={data.webhookUrl} copyLabel="Salin URL" />
                    <p className="text-xs text-muted-foreground">Rahasiakan URL ini; jangan bagikan ke pihak lain.</p>
                  </div>
                  <TextField
                    label="Webhook Secret"
                    name="secret"
                    type="password"
                    value={secret}
                    onChange={setSecret}
                    autoComplete="off"
                    maxLength={200}
                    required
                    error={fieldError}
                    hint={data.hasSecret ? "Secret sudah tersimpan. Isi lagi hanya jika Mengantar membuat secret baru." : "Salin persis dari halaman Integrasi Mengantar."}
                  />
                  {saved ? <FormAlert tone="safe">Webhook Secret tersimpan. Status menjadi Aktif setelah kabar pertama dari Mengantar diterima.</FormAlert> : null}
                </CardContent>
                <CardFooter className="justify-end gap-2 bg-slate-50/70">
                  <Button type="submit" className="w-full sm:w-auto" disabled={saving || secret.trim().length === 0}>
                    {saving ? "Menyimpan…" : "Simpan secret"}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          ) : !canByok ? (
            <FormAlert tone="warn">Gerai belum terhubung ke Mengantar. Pengaturan webhook tersedia setelah akun Mengantar aktif.</FormAlert>
          ) : null}
        </>
      ) : null}
    </SettingsLayout>
  )
}
