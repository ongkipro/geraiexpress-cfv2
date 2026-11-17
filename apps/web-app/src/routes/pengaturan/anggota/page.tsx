import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Button } from "../../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card"
import { Field, FieldError, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { Switch } from "../../../components/ui/switch"
import { api, ApiError } from "../../../lib/api"
import { ErrorState, LoadingState } from "../../../shell/states"
import { Notice, SettingsLayout, type SettingsView } from "../index/shared"

// Pengaturan › Anggota (visual 08 §2.3): members, invite a Kasir by email, revoke with a confirm that names the
// person (danger zone rule), and the instant switch `Kasir boleh bayar COD` (spec 03 §1.2) in its own card.
interface Member { id: string; name: string; email: string; role: "gerai_admin" | "cashier"; created_at: number; last_seen_at: number | null }
interface Invite { email: string; expires_at: number }
const when = (ms: number | null) => (ms ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(ms) : "Belum pernah")

export function AnggotaPage() {
  const [data, setData] = useState<{ members: Member[]; invitations: Invite[] } | null>(null)
  const [mayPay, setMayPay] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: "safe" | "danger"; text: string } | null>(null)
  const [email, setEmail] = useState("")
  const [inviteErr, setInviteErr] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Member | null>(null)
  const load = useCallback(() => {
    Promise.all([api<{ members: Member[]; invitations: Invite[] }>("/members"), api<SettingsView>("/settings")])
      .then(([m, s]) => {
        setError(null)
        setData(m)
        setMayPay(s.cashierMayPay)
      })
      .catch((e) => setError(e instanceof ApiError ? e.body.message : "Anggota tidak dapat dimuat."))
  }, [])
  useEffect(load, [load])
  async function invite(e: FormEvent) {
    e.preventDefault()
    setInviteErr(null)
    try {
      await api("/members/invitations", { body: { email } })
      setEmail("")
      setMsg({ tone: "safe", text: "Undangan terkirim. Berlaku 7 hari." })
      load()
    } catch (err) {
      setInviteErr(err instanceof ApiError ? err.body.message : "Gagal mengirim undangan.")
    }
  }
  async function revoke(m: Member) {
    try {
      await api(`/members/${m.id}/revoke`, { body: {} })
      setMsg({ tone: "safe", text: `Akses ${m.name} dicabut.` })
      setConfirm(null)
      load()
    } catch (err) {
      setMsg({ tone: "danger", text: err instanceof ApiError ? err.body.message : "Gagal mencabut akses." })
    }
  }
  async function togglePay(v: boolean) {
    setMayPay(v)
    try {
      await api("/settings/cashier-payout", { body: { enabled: v } })
      setMsg({ tone: "safe", text: v ? "Kasir sekarang boleh membayar COD ke pengirim." : "Hanya pemilik yang boleh membayar COD ke pengirim." })
    } catch {
      setMayPay(!v)
      setMsg({ tone: "danger", text: "Gagal menyimpan." })
    }
  }
  if (error) return <SettingsLayout title="Anggota"><ErrorState message={error} onRetry={load} /></SettingsLayout>
  if (!data) return <SettingsLayout title="Anggota"><LoadingState label="Memuat anggota" /></SettingsLayout>
  const cashiers = data.members.filter((m) => m.role === "cashier")
  return (
    <SettingsLayout title="Anggota" description="Pemilik dan kasir yang bisa masuk ke gerai ini.">
      <Card>
        <CardHeader><CardTitle className="text-base md:text-sm">Daftar anggota</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y">
            {data.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-base md:text-sm">
                <span><span className="font-medium">{m.name}</span> · {m.role === "gerai_admin" ? "Pemilik" : "Kasir"}<span className="block text-muted-foreground">{m.email}</span></span>
                <span className="text-muted-foreground">Terakhir aktif: {when(m.last_seen_at)}</span>
              </li>
            ))}
            {data.invitations.map((i) => (
              <li key={i.email} className="flex flex-wrap items-center justify-between gap-2 py-3 text-base md:text-sm text-muted-foreground">
                <span>{i.email} · Kasir (undangan)</span>
                <span>Berlaku sampai {when(i.expires_at)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base md:text-sm">Undang kasir</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={invite} className="flex flex-wrap items-end gap-2" noValidate>
            <Field className="min-w-0 flex-1" data-invalid={inviteErr ? true : undefined}>
              <FieldLabel htmlFor="inv-email">Email kasir</FieldLabel>
              <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              {inviteErr ? <FieldError>{inviteErr}</FieldError> : null}
            </Field>
            <Button type="submit" disabled={!email}>Kirim Undangan</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base md:text-sm">Pembayaran COD ke pengirim</CardTitle>
          <CardDescription className="text-base md:text-sm">Perubahan langsung tersimpan.</CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex min-h-11 items-center justify-between gap-3 text-base md:text-sm">Kasir boleh bayar COD <Switch checked={!!mayPay} onCheckedChange={togglePay} /></label>
        </CardContent>
      </Card>
      {cashiers.length ? (
        <Card className="border-danger/40">
          <CardHeader><CardTitle className="text-base md:text-sm">Zona berbahaya</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {cashiers.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-base md:text-sm">
                <span>{m.name} ({m.email})</span>
                {confirm?.id === m.id ? (
                  <span className="flex flex-wrap items-center gap-2" role="alertdialog" aria-label={`Cabut akses ${m.name}`}>
                    <span className="font-medium text-danger">Cabut akses {m.name}? Kasir langsung keluar dari gerai ini.</span>
                    <Button variant="outline" onClick={() => setConfirm(null)}>Batal</Button>
                    <Button variant="destructive" onClick={() => revoke(m)}>Ya, Cabut Akses</Button>
                  </span>
                ) : (
                  <Button variant="outline" onClick={() => setConfirm(m)}>Cabut Akses</Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <Notice msg={msg} />
    </SettingsLayout>
  )
}
