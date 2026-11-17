import { useEffect, useMemo, useState, type FormEvent } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { renderSVG } from "uqr"
import { AuthCard, FormAlert } from "@shared/components/auth/auth-card"
import { TextField } from "@shared/components/auth/text-field"
import { Button } from "@shared/components/ui/button"
import { api, ApiError } from "../../lib/api"

interface Enrolment {
  secret: string
  otpauthUri: string
}

// TOTP challenge (aal2). On first login or after a recovery reset, the enrolment QR is shown ONCE (visual 07 §3.3).
export function TotpPage() {
  const { mode, kembali } = useSearch({ strict: false }) as { mode?: "required" | "enrol"; kembali?: string }
  const navigate = useNavigate()
  const [enrol, setEnrol] = useState<Enrolment | null>(null)
  const [code, setCode] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== "enrol") return
    let alive = true
    api<Enrolment>("/auth/totp/enrol", { body: {} })
      .then((e) => alive && setEnrol(e))
      .catch((err) => alive && setError(err instanceof ApiError ? err.body.message : "Pendaftaran TOTP gagal dimuat."))
    return () => {
      alive = false
    }
  }, [mode])

  const qr = useMemo(() => (enrol ? renderSVG(enrol.otpauthUri, { border: 2 }) : null), [enrol])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await api("/auth/totp/verify", { body: { code } })
      // Back to where the step-up started (validated relative path), else the console home.
      if (kembali) window.location.assign(kembali)
      else await navigate({ to: "/" })
    } catch (err) {
      setError(err instanceof ApiError ? err.body.message : "Terjadi kesalahan. Silakan coba lagi.")
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthCard
      title={mode === "enrol" ? "Aktifkan TOTP" : "Kode TOTP"}
      description={mode === "enrol" ? "Pindai kode QR dengan aplikasi autentikator (Google Authenticator, Authy, 1Password). Kode QR hanya ditampilkan sekali." : "Masukkan 6 digit kode dari aplikasi autentikator Anda."}
    >
      {mode === "enrol" && qr ? (
        <div className="flex flex-col items-center gap-3">
          <div className="size-48" role="img" aria-label="Kode QR pendaftaran TOTP" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="text-center text-base md:text-sm text-muted-foreground">
            Tidak bisa memindai? Masukkan kunci ini: <span className="font-mono text-foreground break-all">{enrol?.secret}</span>
          </p>
        </div>
      ) : null}
      <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <TextField label="Kode TOTP" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} required />
        <Button type="submit" size="lg" disabled={pending || code.length !== 6}>{pending ? "Memeriksa…" : "Verifikasi"}</Button>
      </form>
    </AuthCard>
  )
}
