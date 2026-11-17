import { useEffect, useState, type FormEvent } from "react"
import { Check, Copy } from "lucide-react"
import { Badge } from "../../../components/ui/badge"
import { Button } from "../../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card"
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

function StatusChip({ state }: { state: Settings["webhookState"] }) {
  const s = STATE[state ?? "unconfigured"]
  const dot = s.tone === "safe" ? "bg-safe" : s.tone === "warn" ? "bg-warn" : s.tone === "danger" ? "bg-danger" : "bg-muted-foreground"
  return (
    <Badge variant="outline" className="h-8 gap-2 px-3 text-base md:text-sm font-medium">
      <span className={`size-2 rounded-full ${dot}`} aria-hidden />
      {s.label}
    </Badge>
  )
}

export function PengaturanMengantarPage() {
  const [data, setData] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [secret, setSecret] = useState("")
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api<Settings>("/settings/mengantar")
      .then(setData)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) window.location.assign("/masuk")
        else setError(e instanceof ApiError ? e.body.message : "Pengaturan tidak dapat dimuat.")
      })
  }, [])

  async function copy() {
    if (!data?.webhookUrl) return
    await navigator.clipboard?.writeText(data.webhookUrl).catch(() => undefined)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[880px] flex-col gap-6 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl leading-tight font-semibold tracking-[-0.02em] text-slate-950 md:text-2xl">Mengantar</h1>
        <p className="text-base md:text-sm text-muted-foreground">Hubungkan kabar status kiriman dari Mengantar ke gerai Anda.</p>
      </div>

      {error ? <FormAlert>{error}</FormAlert> : null}
      {!data && !error ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat pengaturan">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : null}

      {data ? (
        <>
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-base md:text-sm">Status webhook</CardTitle>
                <CardDescription className="text-base md:text-sm">{STATE[data.webhookState ?? "unconfigured"].help}</CardDescription>
              </div>
              <StatusChip state={data.webhookState} />
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-base md:text-sm sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <dt className="text-xs text-muted-foreground">Kabar terakhir diterima</dt>
                  <dd className="tabular-nums">{fmt(data.lastEventAt)}</dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-xs text-muted-foreground">Pemeriksaan status terakhir</dt>
                  <dd className="tabular-nums">{fmt(data.lastPolledAt)}</dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-xs text-muted-foreground">Akun Mengantar</dt>
                  <dd>{data.sellerId ? `Terhubung${data.environment === "sandbox" ? " (sandbox)" : ""}` : "Belum terhubung"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {data.webhookUrl ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base md:text-sm">Atur webhook di Mengantar</CardTitle>
                <CardDescription className="text-base md:text-sm">Tiga langkah, cukup sekali.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 md:gap-5">
                <ol className="flex list-decimal flex-col gap-2 pl-6 text-base md:text-sm">
                  <li>Buka Mengantar › Pengaturan › Akun › Integrasi Public API.</li>
                  <li>Tempel URL di bawah pada kolom Webhook URL, lalu simpan.</li>
                  <li>Salin Webhook Secret yang muncul di Mengantar dan simpan di formulir ini.</li>
                </ol>
                <div className="flex flex-col gap-2">
                  <span className="text-base md:text-sm font-medium" id="wh-url-label">URL webhook gerai</span>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <code aria-labelledby="wh-url-label" className="flex min-h-11 flex-1 items-center rounded-lg border border-input bg-muted px-3 py-2 font-mono text-base md:text-sm break-all">
                      {data.webhookUrl}
                    </code>
                    <Button type="button" variant="outline" size="lg" className="h-11" onClick={copy}>
                      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                      {copied ? "Tersalin" : "Salin URL"}
                    </Button>
                  </div>
                  <p className="text-base md:text-sm text-muted-foreground">Rahasiakan URL ini; jangan bagikan ke pihak lain.</p>
                </div>
                <form onSubmit={save} className="flex flex-col gap-4" noValidate>
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
                  <div className="flex justify-end">
                    <Button type="submit" size="lg" className="h-11 w-full sm:w-auto" disabled={saving || secret.trim().length === 0}>
                      {saving ? "Menyimpan…" : "Simpan secret"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : (
            <FormAlert tone="warn">Gerai belum terhubung ke Mengantar. Pengaturan webhook tersedia setelah akun Mengantar aktif.</FormAlert>
          )}
        </>
      ) : null}
    </main>
  )
}
