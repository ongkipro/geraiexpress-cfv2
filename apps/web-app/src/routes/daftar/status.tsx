import { useCallback, useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"
import { AuthCard, FormAlert } from "../../components/auth/auth-card"
import { Button } from "../../components/ui/button"
import { Skeleton } from "../../components/ui/skeleton"
import { api, ApiError } from "../../lib/api"

interface StatusData {
  application: { state: string; business_name: string; slug: string; decision_reason: string | null; onboarding_state: string | null; tenant_status: string } | null
}

const STEPS = ["Diajukan", "Ditinjau", "Akun Mengantar", "Aktif"]

async function logout() {
  await api("/auth/logout", { body: {} }).catch(() => undefined)
  window.location.assign("/masuk")
}

const LogoutLink = () => (
  <button type="button" onClick={logout} className="h-11 text-base md:text-sm text-primary underline-offset-4 hover:underline">
    Keluar
  </button>
)

export function DaftarStatusPage() {
  const [data, setData] = useState<StatusData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    api<StatusData>("/onboarding/status")
      .then((d) => {
        setError(null)
        setData(d)
      })
      .catch((e) => setError(e instanceof ApiError ? e.body.message : "Status tidak dapat dimuat."))
  }, [])
  useEffect(load, [load])
  if (error) return <AuthCard title="Status Pengajuan" corner={<LogoutLink />}><FormAlert>{error}</FormAlert><Button variant="outline" onClick={() => { setError(null); load() }}>Coba lagi</Button></AuthCard>
  if (!data) return <AuthCard title="Status Pengajuan"><div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat status"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-11 w-full" /></div></AuthCard>
  const a = data.application
  if (!a) return <AuthCard title="Status Pengajuan" description="Anda belum mengirim pengajuan gerai." corner={<LogoutLink />}><Link to="/daftar" className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-base md:text-sm font-medium text-primary-foreground">Isi pengajuan</Link></AuthCard>
  const connected = a.onboarding_state === "connected" || a.onboarding_state === "byok_connected"
  const reached = a.state === "approved" ? (connected ? 4 : 3) : a.state === "rejected" ? 2 : 1
  return (
    <AuthCard title="Status Pengajuan" description={`${a.business_name} · ${a.slug}.geraimitra.com`} corner={<LogoutLink />}>
      <ol className="flex flex-col gap-3" aria-label="Tahap pengajuan">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-3 text-base md:text-sm">
            <span className={`flex size-8 items-center justify-center rounded-full border text-base md:text-sm font-semibold tabular-nums ${i < reached ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`} aria-hidden>{i + 1}</span>
            <span className={i < reached ? "font-medium" : "text-muted-foreground"}>{s}</span>
          </li>
        ))}
      </ol>
      {a.state === "rejected" ? (
        <div className="flex flex-col gap-3">
          <FormAlert>Pengajuan belum dapat disetujui{a.decision_reason ? `: ${a.decision_reason}` : "."}</FormAlert>
          <Link to="/daftar" className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-base md:text-sm font-medium text-primary-foreground">Perbaiki pengajuan</Link>
        </div>
      ) : a.onboarding_state === "existing_account_required" ? (
        <div className="flex flex-col gap-3">
          <FormAlert tone="warn">Email ini sudah punya akun Mengantar. Hubungkan dengan API key akun Anda di Pengaturan › Mengantar.</FormAlert>
          <Link to="/pengaturan/mengantar" className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-base md:text-sm font-medium text-primary-foreground">Hubungkan di Pengaturan › Mengantar</Link>
        </div>
      ) : a.state === "approved" && a.tenant_status === "active" ? (
        <div className="flex flex-col gap-3">
          <p className="text-base md:text-sm text-muted-foreground">{connected ? "Gerai Anda sudah aktif dan terhubung ke Mengantar." : "Gerai Anda sudah disetujui dan siap digunakan sambil menyelesaikan koneksi Mengantar."}</p>
          <Link to="/" className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-base md:text-sm font-medium text-primary-foreground">Masuk ke Ruang Kerja</Link>
        </div>
      ) : (
        <p className="text-base md:text-sm text-muted-foreground">Kami kirim email saat ada keputusan. Butuh bantuan? Hubungi bantuan@geraiexpress.com.</p>
      )}
    </AuthCard>
  )
}
