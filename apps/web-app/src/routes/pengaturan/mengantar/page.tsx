import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "@tanstack/react-router"
import { ChevronDownIcon, ExternalLinkIcon, InfoIcon, KeyRoundIcon, RefreshCwIcon } from "lucide-react"
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

// Pengaturan › Mengantar (PR-02b, visual 08 §2): Mengantar account status, seller key sync (for Partner sellers who
// regenerated their own key in Seller Web), BYOK paste-your-own-key fallback, manual polling, and optional real-time
// Webhook setup (gradual per-account rollout in Mengantar production).
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
  keyVersion?: number
  rotationState?: "idle" | "in_flight" | "unknown"
  lastErrorCode?: string | null
  canSyncKey?: boolean
  canManualPoll?: boolean
}

type SyncKeyResponse = {
  result:
    | { state: "synced"; changed: boolean; keyVersion: number; webhookSecretReset: boolean }
    | { state: "restricted"; code: string }
    | { state: "failed"; code: string; retryAfterSeconds?: number }
  settings: Settings
}

type PollResponse = {
  polled: number
  changed: number
  failed: number
  settings: Settings
}

function statusMeta(data: Settings | null): { label: string; tone: "safe" | "warn" | "danger" | "muted"; help: string } {
  if (!data) return { label: "Belum diatur", tone: "muted", help: "Hubungkan akun Mengantar terlebih dahulu." }
  if (data.onboardingState === "provider_restricted") {
    return {
      label: "Dibatasi Mengantar",
      tone: "danger",
      help: "Akun seller atau API key dinonaktifkan oleh Mengantar. Hubungi tim GeraiExpress atau CS Mengantar sebelum menerbitkan resi baru.",
    }
  }
  if (data.onboardingState === "existing_account_required") {
    return {
      label: "Perlu API key sendiri",
      tone: "warn",
      help: "Email gerai sudah terdaftar di Mengantar. Tempel API key akun Mengantar Anda di bawah agar gerai langsung aktif.",
    }
  }
  if (data.rotationState && data.rotationState !== "idle") {
    return {
      label: "Rotasi kunci berjalan",
      tone: "warn",
      help: "Kunci API Mengantar sedang diperbarui. Penerbitan resi dijeda sebentar sampai selesai.",
    }
  }
  if (data.webhookState === "active") {
    return { label: "Webhook aktif", tone: "safe", help: "Akun Mengantar aktif dan status kiriman diperbarui otomatis begitu Mengantar mengirim kabar." }
  }
  if (data.webhookState === "secret_mismatch") {
    return {
      label: "Webhook Secret tidak cocok",
      tone: "danger",
      help: "Kabar webhook dari Mengantar ditolak karena Webhook Secret berbeda (misalnya setelah API key diganti). Salin ulang secret terbaru dari Mengantar lalu simpan di bawah.",
    }
  }
  if (data.webhookState === "paused") {
    return {
      label: "Webhook dijeda Mengantar",
      tone: "danger",
      help: "Mengantar menjeda pengiriman webhook. Aktifkan kembali di Pengaturan Akun › Integrasi Public API di Mengantar. Status kiriman tetap kami periksa berkala setiap jam.",
    }
  }
  const connected = data.onboardingState === "connected" || data.onboardingState === "byok_connected" || Boolean(data.sellerId)
  if (connected) {
    return {
      label: "Sinkron otomatis aktif",
      tone: "safe",
      help: "Akun Mengantar aktif untuk cek ongkir dan cetak resi. Status kiriman diperbarui otomatis secara berkala setiap jam (plus tombol Sinkronkan Status di tiap INV) — Anda tidak perlu mengatur webhook.",
    }
  }
  return { label: "Belum terhubung", tone: "muted", help: "Hubungkan akun Mengantar terlebih dahulu." }
}

const fmt = (ms: number | null) =>
  ms ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(ms) + " WIB" : "—"

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
  const [syncingKey, setSyncingKey] = useState(false)
  const [syncKeyNote, setSyncKeyNote] = useState<{ tone: "safe" | "warn" | "danger"; text: string } | null>(null)
  const [polling, setPolling] = useState(false)
  const [pollNote, setPollNote] = useState<{ tone: "safe" | "warn" | "danger"; text: string } | null>(null)
  const [webhookExpanded, setWebhookExpanded] = useState(false)
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
    return () => {
      g.current++
    }
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

  async function syncKey() {
    if (syncingKey) return
    setSyncingKey(true)
    setSyncKeyNote(null)
    try {
      const res = await api<SyncKeyResponse>("/settings/mengantar/sync-key", { body: {} })
      gen.current++
      writeSettingsCache(cacheKey, res.settings)
      setData(res.settings)
      if (res.result.state === "synced") {
        if (res.result.changed) {
          setSyncKeyNote({
            tone: res.result.webhookSecretReset ? "warn" : "safe",
            text: res.result.webhookSecretReset
              ? `API key terbaru (v${res.result.keyVersion}) berhasil diambil dari Mengantar. Karena mengganti API key juga mengganti Webhook Secret, salin ulang Webhook Secret terbaru di formulir bawah.`
              : `API key terbaru (v${res.result.keyVersion}) berhasil disinkronkan dari Mengantar.`,
          })
        } else {
          setSyncKeyNote({ tone: "safe", text: `API key gerai (v${res.result.keyVersion}) sudah sama dengan kunci aktif di Mengantar.` })
        }
      } else if (res.result.state === "restricted") {
        setSyncKeyNote({ tone: "danger", text: `Mengantar menolak pengambilan kunci (${res.result.code}). Akun atau API key sedang dinonaktifkan Mengantar.` })
      } else {
        setSyncKeyNote({
          tone: "danger",
          text:
            res.result.code === "RATE_LIMITED"
              ? `Batas panggilan Mengantar tercapai. Coba lagi dalam ${res.result.retryAfterSeconds ?? 60} detik.`
              : `Gagal menyinkronkan API key (${res.result.code}). Coba lagi beberapa saat lagi.`,
        })
      }
      refreshCounterStatus()
      void router.invalidate()
    } catch (err) {
      setSyncKeyNote({ tone: "danger", text: err instanceof ApiError ? err.body.message : "Gagal menyinkronkan API key." })
    } finally {
      setSyncingKey(false)
    }
  }

  async function pollNow() {
    if (polling) return
    setPolling(true)
    setPollNote(null)
    try {
      const res = await api<PollResponse>("/settings/mengantar/poll", { body: {} })
      gen.current++
      writeSettingsCache(cacheKey, res.settings)
      setData(res.settings)
      if (res.polled === 0) {
        setPollNote({ tone: "safe", text: "Tidak ada kiriman aktif yang menunggu pembaruan status saat ini." })
      } else if (res.failed > 0) {
        setPollNote({ tone: "warn", text: `${res.polled} kiriman diperiksa, ${res.changed} berubah status, ${res.failed} belum dapat dijangkau.` })
      } else {
        setPollNote({ tone: "safe", text: `${res.polled} kiriman aktif diperiksa, ${res.changed} diperbarui dari Mengantar.` })
      }
      refreshCounterStatus()
    } catch (err) {
      setPollNote({ tone: "danger", text: err instanceof ApiError ? err.body.message : "Gagal memeriksa status kiriman." })
    } finally {
      setPolling(false)
    }
  }

  const st = statusMeta(data)
  const connected = Boolean(data && (data.onboardingState === "connected" || data.onboardingState === "byok_connected" || data.sellerId) && data.onboardingState !== "provider_restricted")
  const canByok = Boolean(data && ["existing_account_required", "byok_connected", "registration_pending"].includes(data.onboardingState ?? ""))
  const sellerWebUrl = data?.environment === "sandbox" ? "https://sandbox.mengantar.com" : "https://app.mengantar.com"
  const showWebhookForm =
    webhookExpanded ||
    saved ||
    Boolean(fieldError) ||
    data?.webhookState === "active" ||
    data?.webhookState === "secret_mismatch" ||
    data?.webhookState === "paused"
  const accountLabel =
    data?.onboardingState === "provider_restricted"
      ? `Dibatasi Mengantar${data.lastErrorCode ? ` (${data.lastErrorCode})` : ""}`
      : connected
        ? `${data?.onboardingState === "byok_connected" ? "API key sendiri (BYOK)" : "Terdaftar lewat GeraiExpress"}${data?.environment === "sandbox" ? " · sandbox" : ""}`
        : data?.onboardingState === "existing_account_required"
          ? "Menunggu API key sendiri"
          : "Belum terhubung"

  return (
    <SettingsLayout title="Mengantar" description="Kelola koneksi akun seller Mengantar, sinkronisasi API key, dan pembaruan status kiriman.">
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!data && !error ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat pengaturan">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : null}

      {data ? (
        <>
          <SectionCard
            title="Status koneksi"
            description={st.help}
            action={
              <div className="flex flex-wrap items-center gap-2">
                {data.canManualPoll ? (
                  <Button type="button" variant="outline" size="sm" onClick={pollNow} disabled={polling || w.demo}>
                    <RefreshCwIcon aria-hidden className={polling ? "animate-spin" : ""} />
                    {polling ? "Memeriksa…" : "Periksa Status"}
                  </Button>
                ) : null}
                <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
              </div>
            }
            flush
          >
            <dl className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="flex flex-col gap-1 px-4 py-3.5 md:px-5">
                <dt className="text-xs text-muted-foreground">Akun Mengantar</dt>
                <dd className="text-sm font-medium">{accountLabel}</dd>
                <dd className="truncate text-xs text-muted-foreground">
                  {data.sellerEmail ? data.sellerEmail : "—"}
                  {data.keyVersion ? ` · Kunci v${data.keyVersion}` : ""}
                </dd>
              </div>
              <div className="flex flex-col gap-1 px-4 py-3.5 md:px-5">
                <dt className="text-xs text-muted-foreground">Kabar webhook terakhir</dt>
                <dd className="text-sm font-medium tabular-nums">{fmt(data.lastEventAt)}</dd>
                <dd className="text-xs text-muted-foreground">{data.hasSecret ? "Webhook Secret tersimpan" : "Opsional — belum dipasang"}</dd>
              </div>
              <div className="flex flex-col gap-1 px-4 py-3.5 md:px-5">
                <dt className="text-xs text-muted-foreground">Pemeriksaan berkala terakhir</dt>
                <dd className="text-sm font-medium tabular-nums">{fmt(data.lastPolledAt)}</dd>
                <dd className="text-xs text-muted-foreground">{data.webhookState === "active" ? "Rekonsiliasi harian aktif" : "Otomatis setiap jam"}</dd>
              </div>
            </dl>
            {pollNote ? (
              <div className="border-t border-slate-100 px-4 py-3 md:px-5">
                <FormAlert tone={pollNote.tone}>{pollNote.text}</FormAlert>
              </div>
            ) : null}
          </SectionCard>

          {canByok ? (
            <Card className="gap-0 py-0 md:py-0">
              <form onSubmit={connectByok} noValidate>
                <CardHeader className="border-b border-slate-100 py-3.5 md:py-4">
                  <CardTitle>
                    <h2 className="text-sm font-semibold text-slate-950 md:text-base">
                      {data.onboardingState === "byok_connected" ? "Perbarui API Key Mengantar" : "Hubungkan Akun Mengantar Sendiri"}
                    </h2>
                  </CardTitle>
                  <CardDescription>
                    {data.onboardingState === "existing_account_required"
                      ? "Email Anda sudah terdaftar di Mengantar. Tempel API Key dari Seller Web Mengantar agar gerai langsung aktif."
                      : "Gunakan API Key (diawali API-...) dari Pengaturan Akun › Integrasi Public API di Seller Web Mengantar."}
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
                    hint="Pastikan email dan nomor HP akun Mengantar Anda sudah terverifikasi agar menu pembuatan API Key aktif di Mengantar › Pengaturan Akun › Integrasi Public API."
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
            <Card className="gap-0 py-0 md:py-0">
              <CardHeader className="flex flex-col gap-3 border-b border-slate-100 py-3.5 sm:flex-row sm:items-start sm:justify-between md:py-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <CardTitle>
                    <h2 className="text-sm font-semibold text-slate-950 md:text-base">Masuk Seller Web Mengantar &amp; Saldo</h2>
                  </CardTitle>
                  <CardDescription>Top-up saldo ongkir, pencairan COD, rekening bank, dan integrasi dikelola langsung di Seller Web Mengantar.</CardDescription>
                </div>
                <AnchorButton variant="outline" size="sm" href={sellerWebUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                  Buka Mengantar <ExternalLinkIcon aria-hidden />
                </AnchorButton>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 py-4 md:py-5">
                <div className="flex flex-col gap-2 text-sm text-slate-700">
                  <p>
                    Masuk menggunakan email{" "}
                    {data.sellerEmail ? <strong className="font-semibold text-slate-950">{data.sellerEmail}</strong> : "akun Mengantar gerai Anda"}.
                  </p>
                  {data.onboardingState === "connected" ? (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      <strong className="font-medium text-slate-800">Masuk pertama kali:</strong> Karena akun dibuat otomatis lewat GeraiExpress tanpa kata sandi awal, klik{" "}
                      <strong className="font-medium text-slate-800">Lupa Password</strong> di halaman masuk Mengantar lalu masukkan email di atas. Tautan reset berlaku ±30 menit (maks. 3 kali per jam); buat kata sandi minimal 8 karakter dengan huruf besar, huruf kecil, dan angka. Setelah selesai, email Anda otomatis terverifikasi. Untuk mencairkan saldo COD, pastikan nomor HP juga terverifikasi di Mengantar.
                    </p>
                  ) : null}
                </div>

                {data.canSyncKey ? (
                  <div className="flex flex-col gap-3 rounded-lg border border-slate-200/90 bg-slate-50/80 p-3.5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <p className="text-sm font-medium text-slate-950">Sinkronkan API Key dari Mengantar</p>
                        <p className="text-xs text-muted-foreground">
                          Gunakan tombol ini bila Anda baru mengganti (Regenerate) API Key di Seller Web Mengantar sehingga pengiriman dari GeraiExpress ditolak.
                        </p>
                      </div>
                      <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={syncKey} disabled={syncingKey || w.demo}>
                        <KeyRoundIcon aria-hidden />
                        {syncingKey ? "Menyinkronkan…" : "Sinkronkan API Key"}
                      </Button>
                    </div>
                    {syncKeyNote ? <FormAlert tone={syncKeyNote.tone}>{syncKeyNote.text}</FormAlert> : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {data.webhookUrl ? (
            <Card className="gap-0 py-0 md:py-0">
              <form onSubmit={save} noValidate>
                <CardHeader className={`flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between md:py-4 ${showWebhookForm ? "border-b border-slate-100" : ""}`}>
                  <div className="flex min-w-0 flex-col gap-1">
                    <CardTitle>
                      <h2 className="text-sm font-semibold text-slate-950 md:text-base">Opsi Lanjutan: Webhook Real-Time Mengantar (Opsional)</h2>
                    </CardTitle>
                    <CardDescription>
                      Tidak wajib diatur — status kiriman sudah diperbarui otomatis tiap jam. Buka hanya jika fitur Webhook sudah aktif di akun Mengantar Anda.
                    </CardDescription>
                  </div>
                  {data.webhookState !== "active" && data.webhookState !== "secret_mismatch" && data.webhookState !== "paused" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      aria-expanded={showWebhookForm}
                      onClick={() => setWebhookExpanded((v) => !v)}
                    >
                      {showWebhookForm ? "Tutup" : "Atur Webhook"}
                      <ChevronDownIcon aria-hidden className={`transition-transform ${showWebhookForm ? "rotate-180" : ""}`} />
                    </Button>
                  ) : null}
                </CardHeader>
                {showWebhookForm ? (
                  <>
                    <CardContent className="flex flex-col gap-5 py-4 md:py-5">
                      <div className="flex gap-2.5 rounded-lg border border-sky-200/80 bg-sky-50/70 p-3.5 text-xs leading-relaxed text-sky-950">
                        <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-sky-700" />
                        <div className="flex flex-col gap-1.5">
                          <p>
                            <strong className="font-semibold">Menu Webhook belum muncul di Mengantar?</strong> Di produksi, Mengantar mengaktifkan fitur Webhook secara bertahap per akun dan tidak menyediakan API otomatis untuk memasangnya. Anda cukup pakai sinkron otomatis bawaan GeraiExpress — atau minta CS Mengantar mengaktifkan Webhook bila ingin kabar real-time.
                          </p>
                          <p>
                            <strong className="font-semibold">Untuk apa Webhook Secret?</strong> Setelah Anda menempelkan <strong>URL webhook gerai</strong> di bawah ke Mengantar lalu menyimpannya (pakai kode verifikasi), Mengantar otomatis membuat <strong>Webhook Secret</strong>. Secret ini dipakai GeraiExpress memverifikasi tanda tangan (<code className="font-mono">x-signature</code>) agar kabar status benar-benar berasal dari Mengantar.
                          </p>
                        </div>
                      </div>

                      <ol className="flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm">
                        {[
                          "Buka Mengantar › Pengaturan Akun › Integrasi Public API (bagian Webhook).",
                          "Tempel URL webhook gerai di bawah ke kolom Webhook URL di Mengantar, lalu simpan dengan kode verifikasi.",
                          "Salin Webhook Secret yang otomatis dibuat Mengantar setelah URL disimpan, lalu tempel di formulir ini.",
                        ].map((t, i) => (
                          <li key={t} className="flex gap-2.5">
                            <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full bg-white text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                              {i + 1}
                            </span>
                            <span>{t}</span>
                          </li>
                        ))}
                      </ol>

                      <div className="flex flex-col gap-1.5">
                        <CopyField label="URL webhook gerai (pasang di Mengantar)" value={data.webhookUrl} copyLabel="Salin URL" />
                        <p className="text-xs text-muted-foreground">Rahasiakan URL ini; jangan bagikan ke pihak lain.</p>
                      </div>

                      <TextField
                        label="Webhook Secret (dibuat otomatis oleh Mengantar)"
                        name="secret"
                        type="password"
                        value={secret}
                        onChange={setSecret}
                        autoComplete="off"
                        maxLength={200}
                        required
                        error={fieldError}
                        hint={
                          data.hasSecret
                            ? "Secret sudah tersimpan. Isi ulang hanya jika Anda mengganti API Key di Mengantar (mengganti API Key otomatis mengganti Webhook Secret)."
                            : "Muncul di Mengantar tepat setelah Anda pertama kali menyimpan URL webhook gerai di atas."
                        }
                      />
                      {saved ? <FormAlert tone="safe">Webhook Secret tersimpan. Status berubah menjadi Webhook aktif setelah kabar pertama dari Mengantar diterima.</FormAlert> : null}
                    </CardContent>
                    <CardFooter className="justify-end gap-2 bg-slate-50/70">
                      <Button type="submit" className="w-full sm:w-auto" disabled={saving || secret.trim().length === 0}>
                        {saving ? "Menyimpan…" : "Simpan secret"}
                      </Button>
                    </CardFooter>
                  </>
                ) : null}
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
