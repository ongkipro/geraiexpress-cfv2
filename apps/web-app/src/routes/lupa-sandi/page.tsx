import { useState, type FormEvent } from "react"
import { Link } from "@tanstack/react-router"
import { AuthCard, FormAlert } from "../../components/auth/auth-card"
import { TextField } from "../../components/auth/text-field"
import { Button } from "../../components/ui/button"
import { api, ApiError } from "../../lib/api"
import { SecurityStatus, TurnstileAction, useTurnstile } from "../../lib/turnstile"

export function LupaSandiPage() {
  const [email, setEmail] = useState("")
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)

  const { setContainer: turnstileBox, ...ts } = useTurnstile()

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending || !ts.token) return
    if (!email.trim()) {
      setError("Alamat email wajib diisi.")
      return
    }
    setPending(true)
    setError(null)
    setLocked(false)
    try {
      await api("/auth/password/forgot", { body: { email: email.trim(), turnstileToken: ts.token } })
      setSent(true)
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
    <AuthCard title="Atur Ulang Kata Sandi" description="Kami kirim tautan untuk membuat kata sandi baru." corner={<Link to="/masuk" className="font-medium text-primary underline-offset-4 hover:underline">Kembali ke Masuk</Link>}>
      {sent ? (
        <div className="flex flex-col gap-4">
          <FormAlert tone="safe">Jika email terdaftar, tautan atur ulang sudah dikirim. Periksa kotak masuk dan folder spam. Tautan berlaku 30 menit.</FormAlert>
          <Link to="/masuk" className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 md:h-9">Kembali ke Halaman Masuk</Link>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          {error ? <FormAlert tone={locked ? "warn" : "danger"}>{error}</FormAlert> : null}
          <TextField label="Email" name="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} required />
          {ts.failed ? <FormAlert tone="warn">Pemeriksaan keamanan tidak dapat dimuat. Muat ulang halaman lalu coba lagi.</FormAlert> : null}
          <TurnstileAction slot={turnstileBox} visible={ts.visible}>
            <Button type="submit" size="lg" disabled={pending || !ts.ready}>{pending ? "Mengirim…" : "Kirim Tautan"}</Button>
          </TurnstileAction>
          <SecurityStatus ts={ts} />
        </form>
      )}
    </AuthCard>
  )
}
