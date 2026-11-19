import { useState, type FormEvent } from "react"
import { useNavigate } from "@tanstack/react-router"
import { AuthCard, FormAlert } from "@shared/components/auth/auth-card"
import { TextField } from "@shared/components/auth/text-field"
import { Button } from "@shared/components/ui/button"
import { api, ApiError } from "../../lib/api"

export function OwnerMasukPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const r = await api<{ totp: "required" | "enrol" }>("/auth/login", { body: { email, password } })
      await navigate({ to: "/totp", search: { mode: r.totp } })
    } catch (err) {
      setError(err instanceof ApiError ? err.body.message : "Terjadi kesalahan. Silakan coba lagi.")
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthCard variant="owner" title="Masuk Super Admin" description="Konsol platform GeraiExpress. Setelah kata sandi, Anda memasukkan kode TOTP.">
      <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <TextField label="Email" name="email" type="email" inputMode="email" autoComplete="username" value={email} onChange={setEmail} required />
        <TextField label="Kata sandi" name="password" type="password" autoComplete="current-password" value={password} onChange={setPassword} required />
        <Button type="submit" size="lg" disabled={pending}>{pending ? "Memproses…" : "Lanjut"}</Button>
      </form>
    </AuthCard>
  )
}
