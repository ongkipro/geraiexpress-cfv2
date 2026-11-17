import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../components/ui/field"
import { Input } from "../../components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group"
import { FormAlert } from "../../components/auth/auth-card"
import { api, ApiError } from "../../lib/api"
import { ErrorState, LoadingState, PageTitle } from "../../shell/states"
import { applyTextSize, storedTextSize, TEXT_SIZES, type TextSize } from "../../shell/workspace"

// `Akun Saya` (visual 07 `/akun`, DEC-229, spec 05 §2): profile → password → email change (OTP to the new
// address) → active sessions → text size. Each card has its own action; nothing is shared with the gerai.
interface Session { id: string; device: string; createdAt: number; lastSeenAt: number; current: boolean }
interface Account { profile: { name: string; email: string; phone: string | null }; sessions: Session[] }
type Msg = { tone: "safe" | "danger"; text: string } | null
const when = (ms: number) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(ms)
const errOf = (e: unknown, fallback: string) => (e instanceof ApiError ? { msg: e.body.message, fields: e.body.field_errors ?? {} } : { msg: fallback, fields: {} as Record<string, string> })

export function AkunPage() {
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
  if (error) return <div><PageTitle title="Akun Saya" /><ErrorState message={error} onRetry={load} /></div>
  if (!a) return <LoadingState label="Memuat akun" />
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 pb-24 md:pb-0">
      <PageTitle title="Akun Saya" description={a.profile.email} />
      <ProfileCard p={a.profile} onSaved={load} />
      <PasswordCard />
      <EmailCard current={a.profile.email} onChanged={load} />
      <SessionsCard sessions={a.sessions} onChanged={load} />
      <TextSizeCard />
    </div>
  )
}

function ProfileCard({ p, onSaved }: { p: Account["profile"]; onSaved: () => void }) {
  const [name, setName] = useState(p.name)
  const [phone, setPhone] = useState(p.phone ?? "")
  const [fields, setFields] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<Msg>(null)
  const dirty = name !== p.name || phone !== (p.phone ?? "")
  async function save(e: FormEvent) {
    e.preventDefault()
    setFields({})
    try {
      await api("/account/profile", { body: { name, phone } })
      setMsg({ tone: "safe", text: "Profil tersimpan." })
      onSaved()
    } catch (err) {
      const x = errOf(err, "Gagal menyimpan.")
      setFields(x.fields)
      setMsg({ tone: "danger", text: x.msg })
    }
  }
  return (
    <Card>
      <CardHeader><CardTitle className="text-base md:text-sm">Profil</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={save} className="flex flex-col gap-4" noValidate>
          <Field data-invalid={fields.name ? true : undefined}><FieldLabel htmlFor="ak-name">Nama</FieldLabel><Input id="ak-name" value={name} onChange={(e) => setName(e.target.value)} />{fields.name ? <FieldError>{fields.name}</FieldError> : null}</Field>
          <Field data-invalid={fields.phone ? true : undefined}><FieldLabel htmlFor="ak-phone">No HP</FieldLabel><Input id="ak-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />{fields.phone ? <FieldError>{fields.phone}</FieldError> : null}</Field>
          {msg ? <FormAlert tone={msg.tone}>{msg.text}</FormAlert> : null}
          <div><Button type="submit" disabled={!dirty}>Simpan</Button></div>
        </form>
      </CardContent>
    </Card>
  )
}

function PasswordCard() {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [fields, setFields] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<Msg>(null)
  async function save(e: FormEvent) {
    e.preventDefault()
    setFields({})
    try {
      await api("/account/password", { body: { current, next } })
      setCurrent("")
      setNext("")
      setMsg({ tone: "safe", text: "Kata sandi diganti. Perangkat lain sudah dikeluarkan." })
    } catch (err) {
      const x = errOf(err, "Gagal mengganti kata sandi.")
      setFields(x.fields)
      setMsg({ tone: "danger", text: x.msg })
    }
  }
  return (
    <Card>
      <CardHeader><CardTitle className="text-base md:text-sm">Ganti Kata Sandi</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={save} className="flex flex-col gap-4" noValidate>
          <Field data-invalid={fields.current ? true : undefined}><FieldLabel htmlFor="pw-cur">Kata sandi saat ini</FieldLabel><Input id="pw-cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />{fields.current ? <FieldError>{fields.current}</FieldError> : null}</Field>
          <Field data-invalid={fields.next ? true : undefined}><FieldLabel htmlFor="pw-new">Kata sandi baru</FieldLabel><Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />{fields.next ? <FieldError>{fields.next}</FieldError> : <FieldDescription>Minimal 8 karakter. Perangkat lain akan dikeluarkan.</FieldDescription>}</Field>
          {msg ? <FormAlert tone={msg.tone}>{msg.text}</FormAlert> : null}
          <div><Button type="submit" disabled={!current || !next}>Ganti Kata Sandi</Button></div>
        </form>
      </CardContent>
    </Card>
  )
}

function EmailCard({ current, onChanged }: { current: string; onChanged: () => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [otpId, setOtpId] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [fields, setFields] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<Msg>(null)
  async function request(e: FormEvent) {
    e.preventDefault()
    setFields({})
    setMsg(null)
    try {
      const r = await api<{ otpId: string }>("/account/email/request", { body: { email, password } })
      setOtpId(r.otpId)
      setPassword("")
      setMsg({ tone: "safe", text: `Kode 6 angka dikirim ke ${email}. Berlaku 10 menit.` })
    } catch (err) {
      const x = errOf(err, "Gagal mengirim kode.")
      setFields(x.fields)
      setMsg({ tone: "danger", text: x.msg })
    }
  }
  async function confirm(e: FormEvent) {
    e.preventDefault()
    setFields({})
    try {
      await api("/account/email/confirm", { body: { otpId, code } })
      setOtpId(null)
      setCode("")
      setEmail("")
      setMsg({ tone: "safe", text: "Email akun sudah diganti. Perangkat lain sudah dikeluarkan." })
      onChanged()
    } catch (err) {
      const x = errOf(err, "Kode tidak cocok.")
      setFields(x.fields)
      setMsg({ tone: "danger", text: x.msg })
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base md:text-sm">Ganti Email</CardTitle>
        <CardDescription className="text-base md:text-sm">Email sekarang: {current}. Kode verifikasi dikirim ke email baru.</CardDescription>
      </CardHeader>
      <CardContent>
        {otpId ? (
          <form onSubmit={confirm} className="flex flex-col gap-4" noValidate>
            <Field data-invalid={fields.code ? true : undefined}><FieldLabel htmlFor="em-code">Kode dari email baru</FieldLabel><Input id="em-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="w-40 tabular-nums" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />{fields.code ? <FieldError>{fields.code}</FieldError> : null}</Field>
            {msg ? <FormAlert tone={msg.tone}>{msg.text}</FormAlert> : null}
            <div className="flex gap-2"><Button type="submit" disabled={code.length !== 6}>Konfirmasi</Button><Button variant="ghost" type="button" onClick={() => setOtpId(null)}>Batal</Button></div>
          </form>
        ) : (
          <form onSubmit={request} className="flex flex-col gap-4" noValidate>
            <Field data-invalid={fields.email ? true : undefined}><FieldLabel htmlFor="em-new">Email baru</FieldLabel><Input id="em-new" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />{fields.email ? <FieldError>{fields.email}</FieldError> : null}</Field>
            <Field data-invalid={fields.password ? true : undefined}><FieldLabel htmlFor="em-pw">Kata sandi saat ini</FieldLabel><Input id="em-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />{fields.password ? <FieldError>{fields.password}</FieldError> : null}</Field>
            {msg ? <FormAlert tone={msg.tone}>{msg.text}</FormAlert> : null}
            <div><Button type="submit" disabled={!email || !password}>Kirim Kode</Button></div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

function SessionsCard({ sessions, onChanged }: { sessions: Session[]; onChanged: () => void }) {
  const [msg, setMsg] = useState<Msg>(null)
  async function revoke(body: { id?: string; all?: boolean }) {
    try {
      const r = await api<{ revoked: number }>("/account/sessions/revoke", { body })
      setMsg({ tone: "safe", text: `${r.revoked} perangkat dikeluarkan.` })
      onChanged()
    } catch (err) {
      setMsg({ tone: "danger", text: errOf(err, "Gagal mengeluarkan perangkat.").msg })
    }
  }
  const others = sessions.filter((s) => !s.current)
  return (
    <Card>
      <CardHeader><CardTitle className="text-base md:text-sm">Perangkat yang masuk</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="divide-y">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-base md:text-sm">
              <span><span className="font-medium">{s.device}</span>{s.current ? " · perangkat ini" : ""}<span className="block text-muted-foreground">Terakhir aktif {when(s.lastSeenAt)}</span></span>
              {s.current ? null : <Button variant="outline" onClick={() => revoke({ id: s.id })}>Keluarkan</Button>}
            </li>
          ))}
        </ul>
        {msg ? <FormAlert tone={msg.tone}>{msg.text}</FormAlert> : null}
        {others.length ? <div><Button variant="outline" onClick={() => revoke({ all: true })}>Keluar dari Semua Perangkat Lain</Button></div> : null}
      </CardContent>
    </Card>
  )
}

function TextSizeCard() {
  const [size, setSize] = useState<TextSize>(storedTextSize)
  return (
    <Card>
      <CardHeader><CardTitle className="text-base md:text-sm">Ukuran teks</CardTitle><CardDescription className="text-base md:text-sm">Berlaku di perangkat ini.</CardDescription></CardHeader>
      <CardContent>
        <ToggleGroup value={[size]} onValueChange={(v) => {
          const s = (v[0] as TextSize) ?? size
          setSize(s)
          applyTextSize(s)
        }} variant="outline" aria-label="Ukuran teks" className="flex-wrap">
          {TEXT_SIZES.map((t) => <ToggleGroupItem key={t.id} value={t.id}>{t.label}</ToggleGroupItem>)}
        </ToggleGroup>
      </CardContent>
    </Card>
  )
}
