import { useEffect, useState, type FormEvent } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { AuthCard, FormAlert } from "@shared/components/auth/auth-card"
import { TextField } from "@shared/components/auth/text-field"
import { CheckboxField } from "@shared/components/admin/page"
import { Button } from "@shared/components/ui/button"
import { AuthenticatorQr } from "../../components/authenticator-qr"
import { RecoveryCodesBox } from "../../components/recovery-codes"
import { api, ApiError } from "../../lib/api"

interface Enrolment {
  secret: string
  otpauthUri: string
}
interface Rotation extends Enrolment {
  rotateTicket: string
}

// TOTP challenge (aal2). On first login or after an admin reset, the enrolment QR is shown ONCE (visual 07 §3.3); the
// first confirmation returns 8 recovery codes, shown once (DEC-246). `mode=required` also accepts a recovery code,
// optionally pairing a new authenticator in place (the old one stays valid until the new code verifies).
type Step = "code" | "recovery" | "rotate" | "codes"

export function TotpPage() {
  const { mode, kembali } = useSearch({ strict: false }) as { mode?: "required" | "enrol"; kembali?: string }
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>("code")
  const [enrol, setEnrol] = useState<Enrolment | null>(null)
  const [rotation, setRotation] = useState<Rotation | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [code, setCode] = useState("")
  const [recovery, setRecovery] = useState("")
  const [resetTotp, setResetTotp] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== "enrol") return
    let alive = true
    api<Enrolment>("/auth/totp/enrol", { body: {} })
      .then((e) => alive && setEnrol(e))
      .catch((err) => alive && setError(err instanceof ApiError ? err.body.message : "Pendaftaran TOTP gagal dimuat."))
    return () => {
      alive = false
    }
  }, [mode])

  // Back to where the step-up started (validated relative path), else the console home.
  async function proceed() {
    if (kembali) window.location.assign(kembali)
    else await navigate({ to: "/" })
  }

  async function run(fn: () => Promise<void>) {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof ApiError ? err.body.message : "Terjadi kesalahan. Silakan coba lagi.")
    } finally {
      setPending(false)
    }
  }

  const verify = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const r = await api<{ recoveryCodes?: string[] }>("/auth/totp/verify", { body: { code } })
      if (r.recoveryCodes?.length) {
        setCodes(r.recoveryCodes)
        setStep("codes")
      } else await proceed()
    })
  }

  const useRecovery = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const r = await api<{ remaining: number; rotation?: Rotation }>("/auth/totp/recovery", { body: { code: recovery, resetTotp } })
      setRecovery("")
      if (r.rotation) {
        setRotation(r.rotation)
        setCode("")
        setStep("rotate")
      } else await proceed()
    })
  }

  const confirmRotation = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await api("/account/totp/rotate-confirm", { body: { rotateTicket: rotation!.rotateTicket, code } })
      await proceed()
    })
  }

  if (step === "codes" && codes) {
    return (
      <AuthCard title="Simpan 8 Kode Pemulihan Cadangan Anda" description="Pakai salah satu kode ini untuk masuk bila HP atau aplikasi autentikator hilang, rusak, atau diganti. Simpan sekarang — kode tidak akan ditampilkan lagi.">
        <RecoveryCodesBox codes={codes} />
        <Button size="lg" onClick={() => void proceed()}>Saya Sudah Menyimpan, Lanjut ke Konsol</Button>
      </AuthCard>
    )
  }

  if (step === "rotate" && rotation) {
    return (
      <AuthCard title="Daftarkan Autentikator Baru" description="Pindai kode QR ini dengan aplikasi autentikator di HP baru, lalu masukkan 6 digit kodenya. Autentikator lama tetap berlaku sampai langkah ini selesai.">
        <AuthenticatorQr otpauthUri={rotation.otpauthUri} secret={rotation.secret} label="Kode QR autentikator baru" />
        <form className="flex flex-col gap-5" onSubmit={confirmRotation} noValidate>
          {error ? <FormAlert>{error}</FormAlert> : null}
          <TextField label="Kode dari autentikator baru" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} required />
          <Button type="submit" size="lg" disabled={pending || code.length !== 6}>{pending ? "Memeriksa…" : "Aktifkan Autentikator Baru"}</Button>
          <Button type="button" variant="ghost" onClick={() => void proceed()} disabled={pending}>Lewati, pakai autentikator lama</Button>
        </form>
      </AuthCard>
    )
  }

  if (step === "recovery") {
    return (
      <AuthCard title="Kode Pemulihan Cadangan" description="Masukkan salah satu dari 8 kode pemulihan yang Anda simpan saat mengaktifkan TOTP. Setiap kode hanya bisa dipakai sekali.">
        <form className="flex flex-col gap-5" onSubmit={useRecovery} noValidate>
          {error ? <FormAlert>{error}</FormAlert> : null}
          <TextField label="Kode pemulihan" name="recovery" autoComplete="off" maxLength={11} hint="Format XXXX-XXXX, huruf besar atau kecil sama saja." value={recovery} onChange={(v) => setRecovery(v.toUpperCase().slice(0, 11))} required />
          <CheckboxField id="reset-totp" checked={resetTotp} onCheckedChange={setResetTotp} align="start">
            Sekaligus daftarkan perangkat autentikator (TOTP) baru
            <span className="block text-xs text-muted-foreground">Pilih ini bila HP lama hilang atau diganti. Perangkat lain yang masuk ke konsol akan dikeluarkan.</span>
          </CheckboxField>
          <Button type="submit" size="lg" disabled={pending || recovery.replace(/[\s-]/g, "").length !== 8}>{pending ? "Memeriksa…" : "Masuk dengan Kode Pemulihan"}</Button>
          <Button type="button" variant="link" onClick={() => { setError(null); setStep("code") }}>Kembali ke kode autentikator</Button>
        </form>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={mode === "enrol" ? "Aktifkan TOTP" : "Kode TOTP"}
      description={mode === "enrol" ? "Pindai kode QR dengan aplikasi autentikator (Google Authenticator, Authy, 1Password). Kode QR hanya ditampilkan sekali." : "Masukkan 6 digit kode dari aplikasi autentikator Anda."}
    >
      {mode === "enrol" && enrol ? <AuthenticatorQr otpauthUri={enrol.otpauthUri} secret={enrol.secret} /> : null}
      <form className="flex flex-col gap-5" onSubmit={verify} noValidate>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <TextField label="Kode TOTP" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} required />
        <Button type="submit" size="lg" disabled={pending || code.length !== 6}>{pending ? "Memeriksa…" : "Verifikasi"}</Button>
        {mode !== "enrol" ? (
          <Button type="button" variant="link" className="h-auto whitespace-normal" onClick={() => { setError(null); setStep("recovery") }}>
            Tidak bisa akses autentikator? Gunakan kode pemulihan cadangan
          </Button>
        ) : null}
      </form>
    </AuthCard>
  )
}
