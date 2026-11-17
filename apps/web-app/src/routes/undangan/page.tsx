import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate, useParams } from "@tanstack/react-router"
import { AuthCard, FormAlert } from "../../components/auth/auth-card"
import { TextField } from "../../components/auth/text-field"
import { Button } from "../../components/ui/button"
import { Skeleton } from "../../components/ui/skeleton"
import { api, ApiError } from "../../lib/api"

interface Invitation {
  outletName: string
  inviterName: string
  email: string
  role: "cashier" | "gerai_admin"
  accountExists: boolean
}

export function UndanganPage() {
  const { token } = useParams({ strict: false }) as { token: string }
  const navigate = useNavigate()
  const [inv, setInv] = useState<Invitation | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api<Invitation>(`/auth/invitations/${encodeURIComponent(token)}`)
      .then((v) => alive && setInv(v))
      .catch((err) => alive && setLoadError(err instanceof ApiError ? err.body.message : "Undangan tidak dapat dibuka."))
    return () => {
      alive = false
    }
  }, [token])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await api(`/auth/invitations/${encodeURIComponent(token)}/accept`, { body: { name, password } })
      await navigate({ to: "/" })
    } catch (err) {
      setError(err instanceof ApiError ? err.body.message : "Terjadi kesalahan. Silakan coba lagi.")
    } finally {
      setPending(false)
    }
  }

  if (loadError) {
    return (
      <AuthCard title="Gabung sebagai Kasir">
        <FormAlert>{loadError}</FormAlert>
        <Link to="/masuk" className="text-base md:text-sm font-medium text-primary underline-offset-4 hover:underline">Kembali ke Masuk</Link>
      </AuthCard>
    )
  }
  if (!inv) {
    return (
      <AuthCard title="Gabung sebagai Kasir">
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat undangan">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </AuthCard>
    )
  }
  return (
    <AuthCard title="Gabung sebagai Kasir" description={<>{inv.inviterName} mengundang Anda ke <strong className="text-foreground">{inv.outletName}</strong>.</>}>
      <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <p className="text-base md:text-sm">Email: <span className="font-medium">{inv.email}</span></p>
        {inv.accountExists ? null : <TextField label="Nama lengkap" name="name" autoComplete="name" value={name} onChange={setName} required maxLength={80} />}
        <TextField
          label={inv.accountExists ? "Kata sandi akun Anda" : "Buat kata sandi"}
          name="password"
          type="password"
          autoComplete={inv.accountExists ? "current-password" : "new-password"}
          value={password}
          onChange={setPassword}
          hint={inv.accountExists ? "Email ini sudah punya akun; masukkan kata sandinya." : "Minimal 8 karakter."}
          required
        />
        <Button type="submit" size="lg" disabled={pending}>{pending ? "Memproses…" : inv.accountExists ? "Gabung" : "Buat Akun"}</Button>
      </form>
    </AuthCard>
  )
}
