import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Button } from "../../../components/ui/button"
import { MailIcon } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../../components/ui/alert-dialog"
import { SectionCard, StatusBadge, ToggleRow } from "../../../components/admin/page"
import { Field, FieldError, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { api, ApiError } from "../../../lib/api"
import { ErrorState, LoadingState } from "../../../shell/states"
import { Notice, SettingsLayout, type SettingsView } from "../index/shared"

// Pengaturan › Anggota (visual 08 §2.3): members, invite a Kasir by email, revoke with a confirm that names the
// person (danger zone rule), and the instant switch `Kasir boleh bayar COD` (spec 03 §1.2) in its own card.
interface Member { id: string; name: string; email: string; role: "gerai_admin" | "cashier"; created_at: number; last_seen_at: number | null }
interface Invite { email: string; expires_at: number }
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join("")
const when = (ms: number | null) => (ms ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(ms) : "Belum pernah")

export function AnggotaPage() {
  const [data, setData] = useState<{ members: Member[]; invitations: Invite[] } | null>(null)
  const [mayPay, setMayPay] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: "safe" | "danger"; text: string } | null>(null)
  const [email, setEmail] = useState("")
  const [inviteErr, setInviteErr] = useState<string | null>(null)
  const [confirm, setConfirmState] = useState<Member | null>(null)
  const [revokeErr, setRevokeErr] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [toggling, setToggling] = useState(false)
  const setConfirm = (m: Member | null) => {
    setRevokeErr(null)
    setConfirmState(m)
  }
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
    if (inviting) return
    setInviting(true)
    setInviteErr(null)
    try {
      await api("/members/invitations", { body: { email } })
      setEmail("")
      setMsg({ tone: "safe", text: "Undangan terkirim. Berlaku 7 hari." })
      load()
    } catch (err) {
      setInviteErr(err instanceof ApiError ? err.body.message : "Gagal mengirim undangan.")
    } finally {
      setInviting(false)
    }
  }
  async function revoke(m: Member) {
    if (revoking) return
    setRevoking(true)
    try {
      await api(`/members/${m.id}/revoke`, { body: {} })
      setMsg({ tone: "safe", text: `Akses ${m.name} dicabut.` })
      setConfirm(null)
      load()
    } catch (err) {
      // Shown inside the still-open dialog (Sol R1 #1): the page notice would sit behind the modal.
      setRevokeErr(err instanceof ApiError ? err.body.message : "Gagal mencabut akses.")
    } finally {
      setRevoking(false)
    }
  }
  async function togglePay(v: boolean) {
    if (toggling) return
    setToggling(true)
    setMayPay(v)
    try {
      await api("/settings/cashier-payout", { body: { enabled: v } })
      setMsg({ tone: "safe", text: v ? "Kasir sekarang boleh membayar COD ke pengirim." : "Hanya pemilik yang boleh membayar COD ke pengirim." })
    } catch {
      setMayPay(!v)
      setMsg({ tone: "danger", text: "Gagal menyimpan." })
    } finally {
      setToggling(false)
    }
  }
  if (error) return <SettingsLayout title="Anggota"><ErrorState message={error} onRetry={load} /></SettingsLayout>
  if (!data) return <SettingsLayout title="Anggota"><LoadingState label="Memuat anggota" /></SettingsLayout>
  return (
    <SettingsLayout title="Anggota" description="Pemilik dan kasir yang bisa masuk ke gerai ini.">
      <SectionCard title="Daftar anggota" description={<span className="tabular-nums">{data.members.length} anggota{data.invitations.length ? ` · ${data.invitations.length} undangan` : ""}</span>} flush>
        <ul className="divide-y divide-slate-100">
          {data.members.map((m) => (
            <li key={m.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center md:px-5">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">{initials(m.name)}</span>
                <div className="flex min-w-0 flex-col">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-950">{m.name}<StatusBadge tone={m.role === "gerai_admin" ? "primary" : "muted"}>{m.role === "gerai_admin" ? "Pemilik" : "Kasir"}</StatusBadge></span>
                  <span className="truncate text-xs text-muted-foreground">{m.email}</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 pl-12 sm:justify-end sm:pl-0">
                <span className="text-xs text-muted-foreground">Terakhir aktif: {when(m.last_seen_at)}</span>
                {m.role === "cashier" ? <Button variant="outline" size="sm" onClick={() => setConfirm(m)}>Cabut Akses</Button> : null}
              </div>
            </li>
          ))}
          {data.invitations.map((i) => (
            <li key={i.email} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center md:px-5">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full border border-dashed border-slate-300 text-xs font-semibold text-slate-500">@</span>
                <div className="flex min-w-0 flex-col">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-700">{i.email}<StatusBadge tone="warn">Kasir (undangan)</StatusBadge></span>
                  <span className="text-xs text-muted-foreground">Berlaku sampai {when(i.expires_at)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>
      <SectionCard title="Undang kasir" description="Kasir menerima email berisi tautan. Undangan berlaku 7 hari.">
        <form onSubmit={invite} className="flex flex-col gap-2 sm:flex-row sm:items-start" noValidate>
          <Field className="min-w-0 flex-1" data-invalid={inviteErr ? true : undefined}>
            <FieldLabel htmlFor="inv-email" className="sr-only">Email kasir</FieldLabel>
            <Input id="inv-email" type="email" placeholder="kasir@contoh.id" value={email} onChange={(e) => setEmail(e.target.value)} />
            {inviteErr ? <FieldError>{inviteErr}</FieldError> : null}
          </Field>
          <Button type="submit" disabled={!email.trim() || inviting}><MailIcon aria-hidden /> {inviting ? "Mengirim…" : "Kirim Undangan"}</Button>
        </form>
      </SectionCard>
      <SectionCard title="Pembayaran COD ke pengirim" description="Perubahan langsung tersimpan.">
        <ToggleRow id="cashier-pay" title="Kasir boleh bayar COD" description="Bila mati, hanya pemilik yang boleh mencairkan hak COD pengirim di loket." checked={!!mayPay} disabled={toggling} onCheckedChange={togglePay} />
      </SectionCard>
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && !revoking && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cabut akses {confirm?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Kasir langsung keluar dari gerai ini dan tidak bisa masuk lagi sampai diundang ulang.</AlertDialogDescription>
          </AlertDialogHeader>
          {revokeErr ? <p role="alert" className="text-sm font-medium text-danger">{revokeErr}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Batal</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={revoking} onClick={() => confirm && revoke(confirm)}>{revoking ? "Mencabut…" : "Ya, Cabut Akses"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Notice msg={msg} />
    </SettingsLayout>
  )
}
