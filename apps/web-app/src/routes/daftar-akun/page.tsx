import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { AuthCard, FormAlert } from "../../components/auth/auth-card"
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

  const stepNo = step === "email" ? 1 : step === "otp" ? 2 : 3
  return (
    <AuthCard
      title="Daftar Gerai"
      description={<span className="num">Langkah {stepNo}/5 · Akun pemilik</span>}
      footer={
        <span>
          Sudah punya akun? <Link to="/masuk" className="font-medium text-primary underline-offset-4 hover:underline">Masuk</Link>
        </span>
      }
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      {step === "email" ? (
        <form className="flex flex-col gap-5" onSubmit={sendCode} noValidate>
          <TextField label="Email" name="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} error={fieldErrors.email} hint="Kode verifikasi 6 digit dikirim ke email ini." required />
          <Button type="submit" size="lg" disabled={pending || !ts.ready}>{pending ? "Mengirim…" : "Kirim Kode"}</Button>
        </form>
      ) : null}
      {step === "otp" ? (
        <form className="flex flex-col gap-5" onSubmit={verify} noValidate>
          <FormAlert tone="safe">Kode dikirim ke {email}. Berlaku 10 menit.</FormAlert>
          <TextField label="Kode verifikasi" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} error={fieldErrors.code} required />
          <Button type="submit" size="lg" disabled={pending || code.length !== 6}>{pending ? "Memeriksa…" : "Verifikasi"}</Button>
          <Button type="button" variant="outline" size="lg" disabled={pending || !ts.ready} onClick={() => sendCode()}>Kirim ulang kode</Button>
        </form>
      ) : null}
      {step === "email" || step === "otp" ? <div ref={turnstileBox} /> : null}
      {ts.failed ? <FormAlert tone="warn">Pemeriksaan keamanan tidak dapat dimuat. Muat ulang halaman lalu coba lagi.</FormAlert> : null}
      {step === "profile" ? (
        <form className="flex flex-col gap-5" onSubmit={complete} noValidate>
          <TextField label="Nama lengkap" name="name" autoComplete="name" value={name} onChange={setName} error={fieldErrors.name} required maxLength={80} />
          <TextField label="Kata sandi" name="password" type="password" autoComplete="new-password" value={password} onChange={setPassword} error={fieldErrors.password} hint="Minimal 8 karakter." required />
          <Button type="submit" size="lg" disabled={pending}>{pending ? "Menyimpan…" : "Buat Akun"}</Button>
        </form>
      ) : null}
    </AuthCard>
  )
}
