import { useEffect, useState, type FormEvent } from "react"
import { Button } from "../../../components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../../components/ui/card"
import { CopyField, SectionCard, StatusBadge } from "../../../components/admin/page"
import { SettingsLayout } from "../index/shared"
import { Skeleton } from "../../../components/ui/skeleton"
import { FormAlert } from "../../../components/auth/auth-card"
import { TextField } from "../../../components/auth/text-field"
import { api, ApiError } from "../../../lib/api"

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
  const [data, setData] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [secret, setSecret] = useState("")
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api<Settings>("/settings/mengantar")
      .then(setData)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) window.location.assign("/masuk")
        else setError(e instanceof ApiError ? e.body.message : "Pengaturan tidak dapat dimuat.")
      })
  }, [])

  async function save(e: FormEvent) {
    e.preventDefault()
    setFieldError(undefined)
    setSaved(false)
    setSaving(true)
    try {
      setData(await api<Settings>("/settings/mengantar/webhook-secret", { body: { secret } }))
      setSecret("")
      setSaved(true)
    } catch (err) {
      if (err instanceof ApiError) setFieldError(err.body.field_errors.secret ?? err.body.message)
      else setFieldError("Gagal menyimpan. Coba lagi.")
    } finally {
      setSaving(false)
    }
  }

  const st = STATE[data?.webhookState ?? "unconfigured"]
  return (
    <SettingsLayout title="Mengantar" description="Hubungkan kabar status kiriman dari Mengantar ke gerai Anda.">
      {error ? <FormAlert>{error}</FormAlert> : null}
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
                <dd className="text-sm font-medium">{data.sellerId ? `Terhubung${data.environment === "sandbox" ? " (sandbox)" : ""}` : "Belum terhubung"}</dd>
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
          ) : (
            <FormAlert tone="warn">Gerai belum terhubung ke Mengantar. Pengaturan webhook tersedia setelah akun Mengantar aktif.</FormAlert>
          )}
        </>
      ) : null}
    </SettingsLayout>
  )
}
