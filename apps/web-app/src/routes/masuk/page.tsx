import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { AuthCard, FormAlert } from "../../components/auth/auth-card"
import { TextField } from "../../components/auth/text-field"
import { Button } from "../../components/ui/button"
import { api, ApiError } from "../../lib/api"
import { SecurityStatus, TurnstileAction, useTurnstile } from "../../lib/turnstile"

export function MasukPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [locked, setLocked] = useState(false)

  const { setContainer: turnstileBox, ...ts } = useTurnstile()

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending || !ts.token) return
    const fe: Record<string, string> = {}
    if (!email.trim()) fe.email = "Email wajib diisi."
    if (!password) fe.password = "Kata sandi wajib diisi."
    if (Object.keys(fe).length) {
      setFieldErrors(fe)
      setError(null)
      return
    }
    setPending(true)
    setError(null)
    setFieldErrors({})
    try {
      await api("/auth/login", { body: { email: email.trim(), password, turnstileToken: ts.token } })
      await navigate({ to: "/" })
    } catch (err) {
      ts.reset()
      const ae = err instanceof ApiError ? err : null
      setLocked(ae?.status === 429)
      setError(ae?.body.message ?? "Terjadi kesalahan. Silakan coba lagi.")
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthCard switcher="masuk" title="Masuk ke ruang kerja gerai" description="Email Pemilik atau Kasir gerai Anda.">
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        {error ? <FormAlert tone={locked ? "warn" : "danger"}>{error}</FormAlert> : null}
        <TextField label="Email" name="email" type="email" inputMode="email" autoComplete="email" placeholder="nama@gmail.com" value={email} onChange={setEmail} error={fieldErrors.email} required />
        <TextField label="Kata sandi" name="password" type="password" autoComplete="current-password" placeholder="Masukkan kata sandi" value={password} onChange={setPassword} error={fieldErrors.password} required />
        <div className="-mt-1 flex justify-end">
          <Link to="/lupa-sandi" className="inline-flex min-h-11 items-center text-sm font-medium text-[#64748B] underline-offset-4 hover:text-[#0F172A] hover:underline md:min-h-9">
            Lupa kata sandi?
          </Link>
        </div>
        {ts.failed ? <FormAlert tone="warn">Pemeriksaan keamanan tidak dapat dimuat. Muat ulang halaman lalu coba lagi.</FormAlert> : null}
        <TurnstileAction slot={turnstileBox} visible={ts.visible}>
          <Button type="submit" size="lg" disabled={pending || !ts.ready}>
            {pending ? "Memproses…" : "Masuk"}
          </Button>
        </TurnstileAction>
        <SecurityStatus ts={ts} />
      </form>
    </AuthCard>
  )
}
