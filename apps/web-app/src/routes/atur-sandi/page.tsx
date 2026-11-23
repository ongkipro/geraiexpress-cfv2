import { useState, type FormEvent } from "react"
import { Link, useParams } from "@tanstack/react-router"
import { AuthCard, FormAlert } from "../../components/auth/auth-card"
import { TextField } from "../../components/auth/text-field"
import { Button } from "../../components/ui/button"
import { api, ApiError } from "../../lib/api"

export function AturSandiPage() {
  const { token } = useParams({ strict: false }) as { token: string }
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    if (password.length < 8) {
      setError("Kata sandi minimal 8 karakter.")
      return
    }
    if (password !== confirm) {
      setError("Konfirmasi kata sandi tidak sama.")
      return
    }
    setPending(true)
    setError(null)
    try {
      await api("/auth/password/reset", { body: { token, password } })
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.body.message : "Terjadi kesalahan. Silakan coba lagi.")
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthCard title="Atur Ulang Kata Sandi" description="Buat kata sandi baru untuk akun Anda.">
      {done ? (
        <div className="flex flex-col gap-5">
          <FormAlert tone="safe">Kata sandi sudah diganti. Semua perangkat lain sudah dikeluarkan dari akun.</FormAlert>
          <Link to="/masuk" className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-base md:text-sm font-medium text-primary-foreground">Masuk</Link>
        </div>
      ) : (
        <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
          {error ? <FormAlert>{error}</FormAlert> : null}
          <TextField label="Kata sandi baru" name="password" type="password" autoComplete="new-password" value={password} onChange={setPassword} hint="Minimal 8 karakter." required />
          <TextField label="Ulangi kata sandi baru" name="confirm" type="password" autoComplete="new-password" value={confirm} onChange={setConfirm} required />
          <Button type="submit" size="lg" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</Button>
          <p className="text-center text-xs text-[#64748B]">
            Tautan kedaluwarsa?{" "}
            <Link to="/lupa-sandi" className="font-medium text-primary underline-offset-4 hover:underline">Minta tautan baru</Link>
          </p>
        </form>
      )}
    </AuthCard>
  )
}
