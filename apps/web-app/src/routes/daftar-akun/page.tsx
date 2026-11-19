import { useState, type FormEvent } from "react"
import { useNavigate } from "@tanstack/react-router"
import { AuthCard, FormAlert, WizardBar } from "../../components/auth/auth-card"
import { TextField } from "../../components/auth/text-field"
import { Button } from "../../components/ui/button"
import { api, ApiError } from "../../lib/api"
import { SecurityStatus, useTurnstile } from "../../lib/turnstile"

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

  // DEC-250: Langkah 1 / 3 of the wizard; its three sub-states share one card, `← Kembali` returns from the OTP to the email.
  const quiet = "inline-flex min-h-11 items-center text-sm font-medium text-[#64748B] underline-offset-4 hover:text-[#0F172A] hover:underline disabled:opacity-50 md:min-h-9"
  const backToEmail = () => { setStep("email"); setCode(""); setError(null) }
  return (
    <AuthCard
      switcher="daftar"
      title="Buat akun pemilik"
      progress={<WizardBar current={1} onBack={step === "otp" && !pending ? backToEmail : undefined} />}
      description={
        step === "email" ? "Mulai dengan email pemilik. Kami kirim kode 6 digit." : step === "otp" ? `Kode dikirim ke ${email}. Berlaku 10 menit.` : "Nama dan kata sandi untuk masuk ke ruang kerja."
      }
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      {/* One flex column for the email and OTP sub-states: the forms are `display: contents`, so the single Turnstile
          slot (never unmounted between the two; `Kirim ulang` needs a fresh token) sits right above the action via
          `order`, and the security status closes the column. 0px unless Cloudflare challenges the visitor. */}
      {step === "email" || step === "otp" ? (
        <div className="flex flex-col gap-4">
          {step === "email" ? (
            <form className="contents" onSubmit={sendCode} noValidate>
              <div className="order-1">
                <TextField label="Email" name="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} error={fieldErrors.email} required />
              </div>
              <Button type="submit" size="lg" className="order-3" disabled={pending || !ts.ready}>{pending ? "Mengirim…" : "Kirim Kode"}</Button>
            </form>
          ) : (
            <form className="contents" onSubmit={verify} noValidate>
              <div className="order-1">
                <TextField label="Kode verifikasi" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} error={fieldErrors.code} required otp />
              </div>
              <Button type="submit" size="lg" className="order-3" disabled={pending || code.length !== 6}>{pending ? "Memeriksa…" : "Verifikasi"}</Button>
              <div className="order-4 -mt-1 flex items-center justify-between">
                <button type="button" className={quiet} disabled={pending} onClick={backToEmail}>Ganti email</button>
                <button type="button" className={quiet} disabled={pending || !ts.ready} onClick={() => sendCode()}>Kirim ulang</button>
              </div>
            </form>
          )}
          <div ref={turnstileBox} data-turnstile-slot className="order-2 w-full empty:hidden" />
          <div className="order-5 empty:hidden">
            <SecurityStatus ts={ts} />
          </div>
        </div>
      ) : null}
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
