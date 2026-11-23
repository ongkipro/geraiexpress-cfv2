import { useState, type FormEvent } from "react"
import { useNavigate } from "@tanstack/react-router"
import { AuthCard, FormAlert } from "@shared/components/auth/auth-card"
import { TextField } from "@shared/components/auth/text-field"
import { SecurityStatus, TurnstileAction, useTurnstile } from "@shared/lib/turnstile"
import { Button } from "@shared/components/ui/button"
import { api, ApiError } from "../../lib/api"

const loadOwnerAuthConfig = () => api<{ turnstileSiteKey: string | null }>("/auth/config")

export function OwnerMasukPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)

  const { setContainer: turnstileBox, ...ts } = useTurnstile(loadOwnerAuthConfig)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending || !ts.token) return
    setPending(true)
    setError(null)
    setLocked(false)
    try {
      const r = await api<{ totp: "required" | "enrol" }>("/auth/login", { body: { email, password, turnstileToken: ts.token } })
      await navigate({ to: "/totp", search: { mode: r.totp } })
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
    <AuthCard variant="owner" title="Masuk Super Admin" description="Konsol platform GeraiExpress. Setelah kata sandi, Anda memasukkan kode TOTP.">
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        {error ? <FormAlert tone={locked ? "warn" : "danger"}>{error}</FormAlert> : null}
        <TextField label="Email" name="email" type="email" inputMode="email" autoComplete="username" value={email} onChange={setEmail} required />
        <TextField label="Kata sandi" name="password" type="password" autoComplete="current-password" value={password} onChange={setPassword} required />
        {ts.failed ? <FormAlert tone="warn">Pemeriksaan keamanan tidak dapat dimuat. Muat ulang halaman lalu coba lagi.</FormAlert> : null}
        <TurnstileAction slot={turnstileBox} visible={ts.visible}>
          <Button type="submit" size="lg" disabled={pending || !ts.ready}>{pending ? "Memproses…" : "Lanjut"}</Button>
        </TurnstileAction>
        <SecurityStatus ts={ts} />
      </form>
    </AuthCard>
  )
}
