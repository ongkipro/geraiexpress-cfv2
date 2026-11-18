import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { AuthCard, FormAlert, RegisterSteps } from "../../components/auth/auth-card"
import { TextField } from "../../components/auth/text-field"
import { Button } from "../../components/ui/button"
import { api, ApiError } from "../../lib/api"
import { useTurnstile } from "../../lib/turnstile"

type Step = "email" | "otp" | "profile"

// Account step of `/daftar` (visual 07 §3.1: email → 6-digit OTP → password). Outlet data steps follow in TASK-203.
export function DaftarAkunPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>("email")
  const { setContainer: turnstileBox, ...ts } = useTurnstile()
  const [email, setEmail] = useState("")
  const [otpId, setOtpId] = useState("")
  const [code, setCode] = useState("")
  const [ticket, setTicket] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function run(fn: () => Promise<void>) {
    if (pending) return
    setPending(true)
    setError(null)
    setFieldErrors({})
    try {
      await fn()
    } catch (err) {
      const ae = err instanceof ApiError ? err : null
      setError(ae?.body.message ?? "Terjadi kesalahan. Silakan coba lagi.")
      setFieldErrors(ae?.body.field_errors ?? {})
    } finally {
      setPending(false)
    }
  }

  const sendCode = (e?: FormEvent) => {
    e?.preventDefault()
    return run(async () => {
      try {
        const r = await api<{ otpId: string }>("/auth/signup/request", { body: { email, turnstileToken: ts.token } })
        setOtpId(r.otpId)
        setStep("otp")
      } finally {
        ts.reset()
      }
    })
  }
  const verify = (e: FormEvent) => {
    e.preventDefault()
    return run(async () => {
      const r = await api<{ ticket: string }>("/auth/signup/verify", { body: { otpId, code } })
      setTicket(r.ticket)
      setStep("profile")
    })
  }
  const complete = (e: FormEvent) => {
    e.preventDefault()
    return run(async () => {
      await api("/auth/signup/complete", { body: { ticket, name, password } })
      await navigate({ to: "/daftar" })
    })
  }

  // DEC-248: Tahap 1 of `1 · Akun — 2 · Gerai — 3 · Titik Jemput`; its three sub-states share one calm frame.
  const quiet = "inline-flex min-h-11 items-center text-sm font-medium text-[#64748B] underline-offset-4 hover:text-[#0F172A] hover:underline disabled:opacity-50 md:min-h-9"
  return (
    <AuthCard
      wide
      title="Daftar Gerai"
      progress={<RegisterSteps current={1} />}
      description={
        step === "email" ? "Mulai dengan email pemilik. Kami kirim kode 6 digit." : step === "otp" ? `Kode dikirim ke ${email}. Berlaku 10 menit.` : "Nama dan kata sandi untuk masuk ke ruang kerja."
      }
      corner={
        <span>
          <span className="hidden sm:inline">Sudah punya akun? </span><Link to="/masuk">Masuk</Link>
        </span>
      }
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      {step === "email" ? (
        <form className="flex flex-col gap-4" onSubmit={sendCode} noValidate>
          <TextField label="Email" name="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} error={fieldErrors.email} required />
          <Button type="submit" size="lg" disabled={pending || !ts.ready}>{pending ? "Mengirim…" : "Kirim Kode"}</Button>
        </form>
      ) : null}
      {step === "otp" ? (
        <form className="flex flex-col gap-4" onSubmit={verify} noValidate>
          <TextField label="Kode verifikasi" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} error={fieldErrors.code} required otp />
          <Button type="submit" size="lg" disabled={pending || code.length !== 6}>{pending ? "Memeriksa…" : "Verifikasi"}</Button>
          <div className="-mt-1 flex items-center justify-between">
            <button type="button" className={quiet} disabled={pending} onClick={() => { setStep("email"); setCode(""); setError(null) }}>Ganti email</button>
            <button type="button" className={quiet} disabled={pending || !ts.ready} onClick={() => sendCode()}>Kirim ulang</button>
          </div>
        </form>
      ) : null}
      {step === "email" || step === "otp" ? <div ref={turnstileBox} data-turnstile-slot className={ts.hasWidget ? "min-h-[65px]" : "hidden"} /> : null}
      {ts.failed ? <FormAlert tone="warn">Pemeriksaan keamanan tidak dapat dimuat. Muat ulang halaman lalu coba lagi.</FormAlert> : null}
      {step === "profile" ? (
        <form className="flex flex-col gap-4" onSubmit={complete} noValidate>
          <TextField label="Nama lengkap" name="name" autoComplete="name" value={name} onChange={setName} error={fieldErrors.name} required maxLength={80} />
          <TextField label="Kata sandi" name="password" type="password" autoComplete="new-password" value={password} onChange={setPassword} error={fieldErrors.password} hint="Minimal 8 karakter." required />
          <Button type="submit" size="lg" disabled={pending}>{pending ? "Menyimpan…" : "Buat Akun"}</Button>
        </form>
      ) : null}
    </AuthCard>
  )
}
