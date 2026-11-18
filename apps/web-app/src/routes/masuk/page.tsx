import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { AuthCard, FormAlert } from "../../components/auth/auth-card"
import { TextField } from "../../components/auth/text-field"
import { Button } from "../../components/ui/button"
import { api, ApiError } from "../../lib/api"
import { useTurnstile } from "../../lib/turnstile"

export function MasukPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)

  const { setContainer: turnstileBox, ...ts } = useTurnstile()

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending || !ts.token) return
    setPending(true)
    setError(null)
    try {
      await api("/auth/login", { body: { email, password, turnstileToken: ts.token } })
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
    <AuthCard
      title="Masuk"
      description="Masuk ke ruang kerja gerai Anda."
      corner={
        <span>
          <span className="hidden sm:inline">Belum punya akun? </span><Link to="/daftar-akun">Daftar</Link>
        </span>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        {error ? <FormAlert tone={locked ? "warn" : "danger"}>{error}</FormAlert> : null}
        <TextField label="Email" name="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} required />
        <TextField label="Kata sandi" name="password" type="password" autoComplete="current-password" value={password} onChange={setPassword} required />
        <div className="-mt-1 flex justify-end">
          <Link to="/lupa-sandi" className="inline-flex min-h-11 items-center text-sm font-medium text-[#64748B] underline-offset-4 hover:text-[#0F172A] hover:underline md:min-h-9">
            Lupa kata sandi?
          </Link>
        </div>
        <div ref={turnstileBox} className="empty:hidden" />
        {ts.failed ? <FormAlert tone="warn">Pemeriksaan keamanan tidak dapat dimuat. Muat ulang halaman lalu coba lagi.</FormAlert> : null}
        <Button type="submit" size="lg" disabled={pending || !ts.ready}>
          {pending ? "Memproses…" : "Masuk"}
        </Button>
      </form>
    </AuthCard>
  )
}
