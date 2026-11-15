import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { AuthCard, FormAlert } from "../../components/auth/auth-card"
import { TextField } from "../../components/auth/text-field"
import { Button } from "../../components/ui/button"
import { api, ApiError } from "../../lib/api"
import { devTurnstileToken } from "../../lib/turnstile"

export function MasukPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await api("/auth/login", { body: { email, password, turnstileToken: devTurnstileToken() } })
      await navigate({ to: "/" })
    } catch (err) {
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
      footer={
        <span>
          Belum punya akun? <Link to="/daftar-akun" className="font-medium text-primary underline-offset-4 hover:underline">Daftar gerai</Link>
        </span>
      }
    >
      <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
        {error ? <FormAlert tone={locked ? "warn" : "danger"}>{error}</FormAlert> : null}
        <TextField label="Email" name="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} required />
        <TextField label="Kata sandi" name="password" type="password" autoComplete="current-password" value={password} onChange={setPassword} required />
        <div className="flex justify-end">
          <Link to="/lupa-sandi" className="text-base font-medium text-primary underline-offset-4 hover:underline">
            Lupa kata sandi?
          </Link>
        </div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Memproses…" : "Masuk"}
        </Button>
      </form>
    </AuthCard>
  )
}
