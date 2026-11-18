import { useState, type FormEvent } from "react"
import { Link } from "@tanstack/react-router"
import { AuthCard, FormAlert } from "../../components/auth/auth-card"
import { TextField } from "../../components/auth/text-field"
import { Button } from "../../components/ui/button"
import { api, ApiError } from "../../lib/api"

export function LupaSandiPage() {
  const [email, setEmail] = useState("")
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await api("/auth/password/forgot", { body: { email } })
      setSent(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.body.message : "Terjadi kesalahan. Silakan coba lagi.")
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthCard title="Atur Ulang Kata Sandi" description="Kami kirim tautan untuk membuat kata sandi baru." corner={<Link to="/masuk" className="font-medium text-primary underline-offset-4 hover:underline">Kembali ke Masuk</Link>}>
      {sent ? (
        <FormAlert tone="safe">Jika email terdaftar, tautan atur ulang sudah dikirim. Periksa kotak masuk dan folder spam. Tautan berlaku 30 menit.</FormAlert>
      ) : (
        <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
          {error ? <FormAlert>{error}</FormAlert> : null}
          <TextField label="Email" name="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} required />
          <Button type="submit" size="lg" disabled={pending}>{pending ? "Mengirim…" : "Kirim Tautan"}</Button>
        </form>
      )}
    </AuthCard>
  )
}
