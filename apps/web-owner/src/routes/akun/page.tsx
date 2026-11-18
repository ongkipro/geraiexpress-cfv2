import { useCallback, useEffect, useId, useState, type ComponentProps, type FormEvent, type ReactNode } from "react"
import { KeyRoundIcon, MonitorSmartphoneIcon, ShieldCheckIcon, SmartphoneIcon } from "lucide-react"
import { FormAlert } from "@shared/components/auth/auth-card"
import { ErrorState, LoadingState, PageHeader, SectionCard, StatusBadge } from "@shared/components/admin/page"
import { Button } from "@shared/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@shared/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@shared/components/ui/field"
import { Input } from "@shared/components/ui/input"
import { AuthenticatorQr } from "../../components/authenticator-qr"
import { formatDate } from "../../components/page"
import { RecoveryCodesBox } from "../../components/recovery-codes"
import { api, ApiError } from "../../lib/api"

// `Profil & Keamanan Akun` (DEC-246, visual 07 §3.3 `/akun`): the Super Admin's own profile, password, second factor
// (authenticator rotation + 8 single-use recovery codes), email and sessions. Credential changes need a TOTP within
// 15 minutes (server `owner_recent`); a stale one sends the operator to `/totp` and back here.
interface Session { id: string; host: "owner" | "app"; device: string; createdAt: number; lastSeenAt: number; current: boolean }
interface Account {
  profile: { name: string; email: string; phone: string | null }
  totp: { state: "pending" | "active" | "reset"; enrolledAt: number | null; totpRecentUntil: number }
  recoveryCodes: { remaining: number; generatedAt: number | null }
  sessions: Session[]
}
type Msg = { tone: "safe" | "danger"; text: string } | null

/** Server message + field errors; a stale TOTP goes to `/totp` and returns to `/akun` (null = navigating away). */
function handle(err: unknown, fallback: string): { msg: string; fields: Record<string, string> } | null {
  if (err instanceof ApiError && err.body.code === "TOTP_RECENT_REQUIRED") {
    window.location.assign(`/totp?mode=required&kembali=${encodeURIComponent("/akun")}`)
    return null
  }
  return err instanceof ApiError ? { msg: err.body.message, fields: err.body.field_errors ?? {} } : { msg: fallback, fields: {} }
}

export function OwnerAkunPage() {
  const [a, setA] = useState<Account | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    api<Account>("/account")
      .then((d) => {
        setError(null)
        setA(d)
      })
      .catch((e) => setError(e instanceof ApiError ? e.body.message : "Akun tidak dapat dimuat."))
  }, [])
  useEffect(load, [load])
  if (error) return <div className="flex flex-col gap-4"><PageHeader title="Profil & Keamanan Akun" /><ErrorState message={error} onRetry={load} /></div>
  if (!a) return <LoadingState label="Memuat akun" />
  return (
    <div className="flex w-full max-w-4xl flex-col gap-4 md:gap-5">
      <PageHeader title="Profil & Keamanan Akun" description={`Masuk sebagai ${a.profile.email} · Super Admin. Perubahan di sini hanya untuk akun Anda sendiri dan tercatat di log audit.`} />
      <ProfileCard p={a.profile} onSaved={load} />
      <PasswordCard />
      <SecondFactorCard a={a} onChanged={load} />
      <EmailCard current={a.profile.email} onChanged={load} />
      <SessionsCard sessions={a.sessions} onChanged={load} />
    </div>
  )
}

function TextInput({ id, label, error, hint, ...rest }: { id: string; label: string; error?: string; hint?: ReactNode } & ComponentProps<typeof Input>) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} aria-invalid={error ? true : undefined} {...rest} />
      {error ? <FieldError>{error}</FieldError> : hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  )
}

function ProfileCard({ p, onSaved }: { p: Account["profile"]; onSaved: () => void }) {
  const [name, setName] = useState(p.name)
  const [phone, setPhone] = useState(p.phone ?? "")
  const [fields, setFields] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<Msg>(null)
  const [pending, setPending] = useState(false)
  const dirty = name !== p.name || phone !== (p.phone ?? "")
  async function save(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    setPending(true)
    setFields({})
    try {
      await api("/account/profile", { body: { name, phone } })
      setMsg({ tone: "safe", text: "Profil tersimpan." })
      onSaved()
    } catch (err) {
      const x = handle(err, "Gagal menyimpan profil.")
      if (!x) return
      setFields(x.fields)
      setMsg({ tone: "danger", text: x.msg })
    } finally {
      setPending(false)
    }
  }
  return (
    <SectionCard title="Profil Saya" description="Nama tampil di log audit dan menu akun.">
      <form onSubmit={save} className="flex flex-col gap-4" noValidate>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <TextInput id="pf-name" label="Nama" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={fields.name} />
          <TextInput id="pf-phone" label="Nomor HP" inputMode="tel" autoComplete="tel" placeholder="08xx-xxxx-xxxx" value={phone} onChange={(e) => setPhone(e.target.value)} error={fields.phone} hint="Opsional." />
        </div>
        {msg ? <FormAlert tone={msg.tone}>{msg.text}</FormAlert> : null}
        <div className="flex justify-end"><Button type="submit" disabled={!dirty || pending}>{pending ? "Menyimpan…" : "Simpan"}</Button></div>
      </form>
    </SectionCard>
  )
}

function PasswordCard() {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [fields, setFields] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<Msg>(null)
  const [pending, setPending] = useState(false)
  const mismatch = confirm.length > 0 && confirm !== next
  async function save(e: FormEvent) {
    e.preventDefault()
    if (pending || mismatch) return
    setPending(true)
    setFields({})
    try {
      await api("/account/password", { body: { current, next } })
      setCurrent("")
      setNext("")
      setConfirm("")
      setMsg({ tone: "safe", text: "Kata sandi diganti. Semua perangkat lain sudah dikeluarkan." })
    } catch (err) {
      const x = handle(err, "Gagal mengganti kata sandi.")
      if (!x) return
      setFields(x.fields)
      setMsg({ tone: "danger", text: x.msg })
    } finally {
      setPending(false)
    }
  }
  return (
    <SectionCard title="Ubah Kata Sandi" description="Setelah diganti, semua perangkat lain (konsol dan aplikasi gerai) dikeluarkan otomatis.">
      <form onSubmit={save} className="flex flex-col gap-4" noValidate>
        <div className="grid items-start gap-4 sm:grid-cols-3">
          <TextInput id="pw-cur" label="Kata sandi saat ini" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={fields.current} />
          <TextInput id="pw-new" label="Kata sandi baru" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={fields.next} hint="Minimal 8 karakter." />
          <TextInput id="pw-conf" label="Ulangi kata sandi baru" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={mismatch ? "Belum sama dengan kata sandi baru." : undefined} />
        </div>
        {msg ? <FormAlert tone={msg.tone}>{msg.text}</FormAlert> : null}
        <div className="flex justify-end"><Button type="submit" disabled={!current || !next || confirm !== next || pending}>{pending ? "Mengganti…" : "Ganti Kata Sandi"}</Button></div>
      </form>
    </SectionCard>
  )
}

function SecondFactorCard({ a, onChanged }: { a: Account; onChanged: () => void }) {
  const { remaining, generatedAt } = a.recoveryCodes
  return (
    <SectionCard title="Verifikasi 2 Langkah & Cadangan Darurat" description="Autentikator dipakai setiap masuk; kode pemulihan menggantikannya sekali pakai bila HP hilang, rusak, atau diganti." flush>
      <ul className="divide-y divide-slate-100">
        <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center md:px-5">
          <span className="flex min-w-0 flex-1 items-start gap-3">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600"><SmartphoneIcon className="size-4" /></span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2 text-sm font-medium">Aplikasi Autentikator (TOTP) <StatusBadge tone={a.totp.state === "active" ? "safe" : "warn"}>{a.totp.state === "active" ? "Aktif" : "Belum aktif"}</StatusBadge></span>
            <span className="text-xs text-muted-foreground">Perangkat baru aktif setelah kodenya terbukti benar; bila dibatalkan, autentikator lama tetap berlaku.</span>
          </span>
          </span>
          <RotateDialog onDone={onChanged} />
        </li>
        <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center md:px-5">
          <span className="flex min-w-0 flex-1 items-start gap-3">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600"><KeyRoundIcon className="size-4" /></span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
              Kode Pemulihan Cadangan
              {generatedAt ? <StatusBadge tone={remaining > 2 ? "safe" : "warn"}><span className="tabular-nums">{remaining} dari 8 kode tersisa</span></StatusBadge> : <StatusBadge tone="warn">Belum dibuat</StatusBadge>}
            </span>
            <span className={`text-xs ${generatedAt && remaining > 2 ? "text-muted-foreground" : "font-medium text-warn"}`}>
              {!generatedAt
                ? "Belum dibuat — buat sekarang untuk berjaga-jaga jika HP hilang atau rusak."
                : remaining === 0
                  ? "Semua kode sudah terpakai. Buat set baru sekarang."
                  : remaining <= 2
                    ? `Tinggal ${remaining} kode. Buat set baru agar tetap punya cadangan.`
                    : `Set dibuat ${formatDate(generatedAt)}. Membuat set baru membatalkan semua kode lama.`}
            </span>
          </span>
          </span>
          <CodesDialog email={a.profile.email} onDone={onChanged} />
        </li>
      </ul>
    </SectionCard>
  )
}

/** Password-gated dialog shell shared by the two second-factor actions. */
function PasswordStep({ id, password, setPassword, error, children }: { id: string; password: string; setPassword: (v: string) => void; error: string | null; children?: ReactNode }) {
  return (
    <>
      {children}
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={id}>Kata sandi saat ini</FieldLabel>
        <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={error ? true : undefined} />
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
    </>
  )
}

function CodesDialog({ email, onDone }: { email: string; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [codes, setCodes] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const id = useId()
  function close() {
    setOpen(false)
    setPassword("")
    setError(null)
    if (codes) onDone()
    setCodes(null)
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const r = await api<{ codes: string[] }>("/account/recovery-codes", { body: { password } })
      setPassword("")
      setCodes(r.codes)
    } catch (err) {
      const x = handle(err, "Gagal membuat kode pemulihan.")
      if (x) setError(x.msg)
    } finally {
      setPending(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : !pending && close())}>
      <DialogTrigger render={<Button type="button" variant="outline" className="shrink-0" />}>Buat 8 Kode Pemulihan Baru</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{codes ? "Simpan 8 Kode Pemulihan Baru" : "Buat 8 Kode Pemulihan Baru"}</DialogTitle>
          <DialogDescription>{codes ? "Kode lama sudah tidak berlaku. Simpan kode ini di tempat aman, terpisah dari HP autentikator." : "Semua kode lama langsung dibatalkan. Masukkan kata sandi untuk melanjutkan."}</DialogDescription>
        </DialogHeader>
        {codes ? (
          <>
            <RecoveryCodesBox codes={codes} email={email} />
            <DialogFooter><Button type="button" onClick={close}>Saya Sudah Menyimpan</Button></DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <PasswordStep id={id} password={password} setPassword={setPassword} error={error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={pending}>Batal</Button>
              <Button type="submit" disabled={!password || pending}>{pending ? "Membuat…" : "Buat Kode"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RotateDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [ticket, setTicket] = useState<{ rotateTicket: string; secret: string; otpauthUri: string } | null>(null)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const id = useId()
  function close() {
    setOpen(false)
    setPassword("")
    setCode("")
    setTicket(null)
    setError(null)
    if (done) onDone()
    setDone(false)
  }
  async function run(fn: () => Promise<void>, fallback: string) {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      const x = handle(err, fallback)
      if (x) setError(x.msg)
    } finally {
      setPending(false)
    }
  }
  const start = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      setTicket(await api("/account/totp/rotate-start", { body: { password } }))
      setPassword("")
    }, "Gagal memulai penggantian autentikator.")
  }
  const confirm = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await api("/account/totp/rotate-confirm", { body: { rotateTicket: ticket!.rotateTicket, code } })
      setDone(true)
    }, "Kode dari autentikator baru salah.")
  }
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : !pending && close())}>
      <DialogTrigger render={<Button type="button" variant="outline" className="shrink-0" />}><ShieldCheckIcon aria-hidden /> Ganti Perangkat Autentikator</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ganti Perangkat Autentikator</DialogTitle>
          <DialogDescription>
            {done ? "Autentikator baru aktif. Perangkat lain yang masuk ke konsol sudah dikeluarkan." : ticket ? "Pindai kode QR dengan aplikasi autentikator di perangkat baru, lalu masukkan 6 digit kodenya." : "Autentikator lama tetap berlaku sampai kode dari perangkat baru terbukti benar."}
          </DialogDescription>
        </DialogHeader>
        {done ? (
          <DialogFooter><Button type="button" onClick={close}>Selesai</Button></DialogFooter>
        ) : ticket ? (
          <form onSubmit={confirm} className="flex flex-col gap-4" noValidate>
            <AuthenticatorQr otpauthUri={ticket.otpauthUri} secret={ticket.secret} label="Kode QR autentikator baru" />
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor={`${id}-code`}>Kode dari autentikator baru</FieldLabel>
              <Input id={`${id}-code`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="w-40 tabular-nums" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} aria-invalid={error ? true : undefined} />
              {error ? <FieldError>{error}</FieldError> : <FieldDescription>Berlaku 10 menit sejak kode QR dibuat.</FieldDescription>}
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={pending}>Batal</Button>
              <Button type="submit" disabled={code.length !== 6 || pending}>{pending ? "Memeriksa…" : "Aktifkan Autentikator Baru"}</Button>
            </DialogFooter>
          </form>
        ) : (
          <form onSubmit={start} className="flex flex-col gap-4" noValidate>
            <PasswordStep id={id} password={password} setPassword={setPassword} error={error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={pending}>Batal</Button>
              <Button type="submit" disabled={!password || pending}>{pending ? "Memeriksa…" : "Lanjut"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function EmailCard({ current, onChanged }: { current: string; onChanged: () => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [otpId, setOtpId] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [fields, setFields] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<Msg>(null)
  const [pending, setPending] = useState(false)
  async function run(fn: () => Promise<void>, fallback: string) {
    if (pending) return
    setPending(true)
    setFields({})
    try {
      await fn()
    } catch (err) {
      const x = handle(err, fallback)
      if (!x) return
      setFields(x.fields)
      setMsg({ tone: "danger", text: x.msg })
    } finally {
      setPending(false)
    }
  }
  const request = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const r = await api<{ otpId: string }>("/account/email/request", { body: { email, password } })
      setOtpId(r.otpId)
      setPassword("")
      setMsg({ tone: "safe", text: `Kode 6 angka dikirim ke ${email}. Berlaku 10 menit.` })
    }, "Gagal mengirim kode.")
  }
  const confirm = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await api("/account/email/confirm", { body: { otpId, code } })
      setOtpId(null)
      setCode("")
      setEmail("")
      setMsg({ tone: "safe", text: "Email akun sudah diganti. Perangkat lain sudah dikeluarkan." })
      onChanged()
    }, "Kode tidak cocok.")
  }
  return (
    <SectionCard title="Ubah Alamat Email" description={<>Email sekarang: <span className="font-medium text-slate-700">{current}</span>. Kode verifikasi dikirim ke email baru.</>}>
      {otpId ? (
        <form onSubmit={confirm} className="flex flex-col gap-4" noValidate>
          <TextInput id="em-code" label="Kode dari email baru" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="w-40 tabular-nums" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} error={fields.code} />
          {msg ? <FormAlert tone={msg.tone}>{msg.text}</FormAlert> : null}
          <div className="flex justify-end gap-2"><Button variant="ghost" type="button" onClick={() => setOtpId(null)}>Batal</Button><Button type="submit" disabled={code.length !== 6 || pending}>{pending ? "Memeriksa…" : "Konfirmasi"}</Button></div>
        </form>
      ) : (
        <form onSubmit={request} className="flex flex-col gap-4" noValidate>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <TextInput id="em-new" label="Email baru" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fields.email} />
            <TextInput id="em-pw" label="Kata sandi saat ini" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fields.password} />
          </div>
          {msg ? <FormAlert tone={msg.tone}>{msg.text}</FormAlert> : null}
          <div className="flex justify-end"><Button type="submit" disabled={!email || !password || pending}>{pending ? "Mengirim…" : "Kirim Kode"}</Button></div>
        </form>
      )}
    </SectionCard>
  )
}

function SessionsCard({ sessions, onChanged }: { sessions: Session[]; onChanged: () => void }) {
  const [msg, setMsg] = useState<Msg>(null)
  const [pending, setPending] = useState(false)
  async function revoke(body: { id?: string; allOthers?: boolean }) {
    if (pending) return
    setPending(true)
    try {
      const r = await api<{ revoked: number }>("/account/sessions/revoke", { body })
      setMsg({ tone: "safe", text: `${r.revoked} perangkat dikeluarkan.` })
      onChanged()
    } catch (err) {
      const x = handle(err, "Gagal mengeluarkan perangkat.")
      if (x) setMsg({ tone: "danger", text: x.msg })
    } finally {
      setPending(false)
    }
  }
  const others = sessions.filter((s) => !s.current)
  return (
    <SectionCard
      title="Sesi Perangkat Aktif"
      description={<span className="tabular-nums">{sessions.length} perangkat masuk ke konsol atau aplikasi gerai</span>}
      flush
    >
      <ul className="divide-y divide-slate-100">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-3 md:px-5">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600"><MonitorSmartphoneIcon className="size-4" /></span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {s.device}
                <StatusBadge tone="muted">{s.host === "owner" ? "Konsol Super Admin" : "Aplikasi Gerai"}</StatusBadge>
                {s.current ? <span className="text-xs font-medium text-safe">· perangkat ini</span> : null}
              </span>
              <span className="text-xs text-muted-foreground">Masuk {formatDate(s.createdAt)} · terakhir aktif {formatDate(s.lastSeenAt)}</span>
            </span>
            {s.current ? null : <Button variant="outline" size="sm" disabled={pending} onClick={() => void revoke({ id: s.id })}>Keluarkan</Button>}
          </li>
        ))}
      </ul>
      {others.length || msg ? (
        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5">
          {msg ? <FormAlert tone={msg.tone}>{msg.text}</FormAlert> : <span />}
          {others.length ? <Button variant="outline" disabled={pending} onClick={() => void revoke({ allOthers: true })}>Keluarkan Semua Perangkat Lain</Button> : null}
        </div>
      ) : null}
    </SectionCard>
  )
}
