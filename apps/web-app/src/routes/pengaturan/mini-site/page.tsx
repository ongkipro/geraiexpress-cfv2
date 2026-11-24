import { useCallback, useEffect, useState, type FormEvent } from "react"
import { CheckIcon, CopyIcon, ExternalLinkIcon, GlobeIcon } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../../components/ui/alert-dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table"
import { AnchorButton, LinkButton } from "../../../components/admin/link-button"
import { Button } from "../../../components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { api, ApiError } from "../../../lib/api"
import { ErrorState, LoadingState } from "../../../shell/states"
import { useWorkspace } from "../../../shell/workspace"
import { Notice, readSettingsCache, SettingsLayout, writeSettingsCache } from "../index/shared"
import { CalloutAlert, ChoiceGroup, CopyField, SectionCard, StatusBadge, type StatusTone } from "../../../components/admin/page"

// Pengaturan › Mini-Site (visual 08 §2.3) with `Domain Sendiri` (spec 11 §5–6): DNS record to add, steps,
// `Periksa Lagi`, and the remedy for the current state. Cloudflare work happens server-side; this page only shows it.
type Records = { ownership: { name: string; value: string } | null; ssl: Array<{ txt_name: string | null; txt_value: string | null; http_url: string | null }> }
type Domain = { hostname: string; role: "primary" | "redirect"; state: string; branch: string | null; sslMethod: "http" | "txt" | null; cfStatus: string | null; sslStatus: string | null; records: Records | null; remedy: { code: string; text: string } | null; lastCheckedAt: number | null; activatedAt: number | null }
type View = { pro: boolean; platformHost: string; cnameTarget: string; primaryHost: string; domains: Domain[] }

const STATE: Record<string, { label: string }> = {
  pending: { label: "Menunggu DNS" },
  active: { label: "Aktif" },
  failed: { label: "Gagal" },
  moved: { label: "DNS berubah" },
  suspended: { label: "Dibekukan" },
}
const when = (ms: number | null) => (ms ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(ms) : "Belum")
const label = (host: string, root: string) => (host === root ? "@" : host.endsWith(`.${root}`) ? host.slice(0, -root.length - 1) : host)

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={done ? `Tersalin ${text}` : `Salin ${text}`}
      onClick={() =>
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1800)
        }).catch(() => undefined)
      }
    >
      {done ? <CheckIcon aria-hidden className="text-safe" /> : <CopyIcon aria-hidden />}
    </Button>
  )
}

function DnsTable({ rows }: { rows: Array<{ type: string; name: string; value: string }> }) {
  return (
    <>
      <dl className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm sm:hidden">
        {rows.map((r) => (
          <div key={`m${r.type}${r.name}`} className="flex flex-col gap-1 px-3 py-2.5">
            <dt><span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-700">{r.type}</span></dt>
            <dd className="flex items-center gap-1"><span className="w-10 shrink-0 text-xs text-muted-foreground">Nama</span><code className="min-w-0 flex-1 font-mono text-xs break-all">{r.name}</code><Copy text={r.name} /></dd>
            <dd className="flex items-center gap-1"><span className="w-10 shrink-0 text-xs text-muted-foreground">Isi</span><code className="min-w-0 flex-1 font-mono text-xs break-all">{r.value}</code><Copy text={r.value} /></dd>
          </div>
        ))}
      </dl>
      <div className="hidden overflow-hidden rounded-lg border border-slate-200 sm:block">
        <Table className="table-fixed">
          <caption className="sr-only">Record DNS yang perlu ditambahkan</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-20">Tipe</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>Isi</TableHead>
              <TableHead className="w-16 text-right"><span className="sr-only">Salin</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.type}${r.name}`} className="align-top hover:bg-transparent">
                <TableCell><span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-700">{r.type}</span></TableCell>
                <TableCell className="whitespace-normal"><span className="flex items-start gap-1"><code className="min-w-0 flex-1 pt-1.5 font-mono text-xs break-all">{r.name}</code><Copy text={r.name} /></span></TableCell>
                <TableCell className="whitespace-normal" colSpan={2}><span className="flex items-start gap-1"><code className="min-w-0 flex-1 pt-1.5 font-mono text-xs break-all">{r.value}</code><Copy text={r.value} /></span></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

export function MiniSitePage() {
  const w = useWorkspace()
  const cacheKey = `custom-domain:${w.tenant.id}`
  const [v, setV] = useState<View | null>(() => readSettingsCache<View>(cacheKey))
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: "safe" | "danger"; text: string } | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const load = useCallback(() => {
    api<View>("/custom-domain")
      .then((x) => {
        writeSettingsCache(cacheKey, x)
        setError(null)
        setV(x)
      })
      .catch((e) => {
        if (!readSettingsCache<View>(cacheKey)) setError(e instanceof ApiError ? e.body.message : "Data mini-site tidak dapat dimuat.")
      })
  }, [cacheKey])
  useEffect(load, [load])
  /** Returns the error message (null on success) so a dialog can show it in place (Sol R1 #1). */
  async function act(path: string, body: unknown, ok: string, inline = false): Promise<string | null> {
    if (pending) return null
    setPending(true)
    setFieldErrors({})
    try {
      const next = await api<View>(path, { body })
      writeSettingsCache(cacheKey, next)
      setV(next)
      setMsg({ tone: "safe", text: ok })
      return null
    } catch (e) {
      const text = e instanceof ApiError ? e.body.message : "Permintaan gagal. Coba lagi."
      if (e instanceof ApiError && e.body.field_errors) setFieldErrors(e.body.field_errors)
      if (!inline) setMsg({ tone: "danger", text })
      return text
    } finally {
      setPending(false)
    }
  }
  if (error) return <SettingsLayout title="Mini-Site"><ErrorState message={error} onRetry={load} /></SettingsLayout>
  if (!v) return <SettingsLayout title="Mini-Site"><LoadingState label="Memuat mini-site" /></SettingsLayout>
  const primary = v.domains.find((d) => d.role === "primary") ?? v.domains[0] ?? null
  const tone = (d: Domain): StatusTone => (d.state === "active" ? "safe" : d.state === "pending" ? "warn" : "danger")
  return (
    <SettingsLayout title="Mini-Site" description="Halaman cek ongkir, kirim dari rumah, dan lacak paket untuk pelanggan gerai Anda.">
      <SectionCard title="Alamat mini-site" description="Alamat ini dicetak di struk dan kode QR.">
        <div className="flex flex-col gap-2">
          <CopyField label="Alamat aktif" value={`https://${v.primaryHost}`} action={<AnchorButton variant="outline" href={`https://${v.primaryHost}`} target="_blank" rel="noreferrer">Buka Mini-Site <ExternalLinkIcon aria-hidden /></AnchorButton>} />
          {v.primaryHost !== v.platformHost ? <p className="text-xs text-muted-foreground">Alamat bawaan <span className="font-mono">{v.platformHost}</span> tetap bisa dipakai.</p> : null}
        </div>
      </SectionCard>
      <SectionCard
        title="Domain Sendiri"
        description="Pakai domain toko Anda, misalnya kirim.tokoanda.id, untuk mini-site gerai."
        action={!v.pro ? <StatusBadge tone="muted">Paket Pro</StatusBadge> : primary ? <StatusBadge tone={tone(primary)}>{STATE[primary.state]?.label ?? primary.state}</StatusBadge> : null}
      >
        {!v.pro ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">Domain sendiri tersedia untuk gerai Pro. Hubungi tim GeraiExpress lewat menu Bantuan untuk mengaktifkan.</p>
            <LinkButton variant="outline" size="sm" to="/bantuan">Buka Bantuan</LinkButton>
          </div>
        ) : primary ? (
          <DomainStatus v={v} pending={pending} tone={tone} onCheck={(method) => act("/custom-domain/check", method ? { method } : {}, method === "txt" ? "Verifikasi diganti ke TXT. Pasang record TXT di bawah." : "Pemeriksaan diulang.")} onRemove={(confirm) => act("/custom-domain/remove", { confirm }, "Domain dihapus. Mini-site kembali memakai alamat bawaan.", true)} />
        ) : (
          <AddDomain pending={pending} hostnameError={fieldErrors.hostname} onAdd={(hostname, rootChoice) => act("/custom-domain", { hostname, rootChoice }, "Domain didaftarkan. Pasang record DNS di bawah.")} />
        )}
      </SectionCard>
      <Notice msg={msg} />
    </SettingsLayout>
  )
}

function AddDomain({ pending, hostnameError, onAdd }: { pending: boolean; hostnameError?: string; onAdd: (hostname: string, rootChoice: string) => void }) {
  const [host, setHost] = useState("")
  const [root, setRoot] = useState<"root_primary" | "www_primary">("root_primary")
  const bare = host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  const isRoot = /^[a-z0-9-]+\.(co\.id|my\.id|web\.id|biz\.id|or\.id|ac\.id|sch\.id|net\.id|[a-z]{2,})$/.test(bare) && !bare.startsWith("www.")
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={(e: FormEvent) => (e.preventDefault(), onAdd(bare, root))}>
      <Field data-invalid={hostnameError ? true : undefined}>
        <FieldLabel htmlFor="cd-host">Domain</FieldLabel>
        <Input id="cd-host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="kirim.tokoanda.id" autoCapitalize="none" spellCheck={false} aria-invalid={hostnameError ? true : undefined} />
        {hostnameError ? <FieldError>{hostnameError}</FieldError> : <FieldDescription>Disarankan subdomain (kirim.tokoanda.id): email dan website toko tetap aman.</FieldDescription>}
      </Field>
      {isRoot ? (
        <div className="flex flex-col gap-2">
          <p className="text-base md:text-sm font-medium">Domain utama dipakai sebagai</p>
          <ChoiceGroup
            label="Alamat utama"
            layout="column"
            value={root}
            onValueChange={setRoot}
            choices={[
              { value: "root_primary" as const, label: `${bare} (www diarahkan ke sini)`, description: "Butuh pengelola DNS yang mendukung CNAME di @, misalnya Cloudflare DNS." },
              { value: "www_primary" as const, label: `www.${bare}`, description: "Domain utama diteruskan ke www lewat pengaturan di registrar." },
            ]}
          />
        </div>
      ) : null}
      <div><Button type="submit" disabled={pending || bare.length < 4}>Tambah Domain</Button></div>
    </form>
  )
}

function DomainStatus({ v, pending, tone, onCheck, onRemove }: { v: View; pending: boolean; tone: (d: Domain) => StatusTone; onCheck: (method?: "txt" | "http") => void; onRemove: (confirm: string) => Promise<string | null> }) {
  const [confirming, setConfirming] = useState(false)
  const [removeErr, setRemoveErr] = useState<string | null>(null)
  const [typed, setTyped] = useState("")
  const primary = v.domains.find((d) => d.role === "primary") ?? v.domains[0]!
  const root = primary.branch === "subdomain" ? primary.hostname.split(".").slice(1).join(".") : primary.hostname.replace(/^www\./, "")
  const dns: Array<{ type: string; name: string; value: string }> = []
  for (const d of v.domains) {
    dns.push({ type: "CNAME", name: label(d.hostname, root), value: v.cnameTarget })
    if (d.state !== "active") {
      if (d.records?.ownership) dns.push({ type: "TXT", name: d.records.ownership.name, value: d.records.ownership.value })
      if (d.sslMethod === "txt") for (const r of d.records?.ssl ?? []) if (r.txt_name && r.txt_value) dns.push({ type: "TXT", name: r.txt_name, value: r.txt_value })
    }
  }
  const allActive = v.domains.every((d) => d.state === "active")
  const remedy = v.domains.map((d) => d.remedy).find(Boolean) ?? null
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
        {v.domains.map((d) => (
          <li key={d.hostname} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
            <GlobeIcon aria-hidden className="size-4 text-muted-foreground" />
            <span className="font-medium break-all">{d.hostname}</span>
            <StatusBadge tone={tone(d)}>{STATE[d.state]?.label ?? d.state}</StatusBadge>
            {d.role === "redirect" ? <span className="text-xs text-muted-foreground">diarahkan ke {primary.hostname}</span> : null}
          </li>
        ))}
      </ul>
      {allActive ? (
        <p className="text-sm">Domain aktif sejak {when(primary.activatedAt)}. Struk dan kode QR baru memakai <span className="font-mono">{primary.hostname}</span>.</p>
      ) : (
        <>
          <ol className="flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm">
            {["Buka pengelola DNS domain Anda (registrar atau Cloudflare).", "Tambahkan record di bawah. Jangan ubah record MX atau email yang sudah ada.", "Tunggu beberapa menit, lalu tekan Periksa Lagi. Kami juga memeriksa otomatis tiap 10 menit."].map((t, i) => (
              <li key={t} className="flex gap-2.5">
                <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full bg-white text-xs font-semibold text-slate-700 ring-1 ring-slate-200">{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          <DnsTable rows={dns} />
          {remedy ? <div role="status"><CalloutAlert title="Perlu tindakan">{remedy.text}</CalloutAlert></div> : null}
          <p className="text-xs text-muted-foreground">Terakhir diperiksa: {when(primary.lastCheckedAt)}</p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {!allActive ? <Button type="button" onClick={() => onCheck()} disabled={pending}>Periksa Lagi</Button> : null}
        {!allActive && primary.sslMethod !== "txt" && remedy?.code === "http_dcv_blocked" ? <Button type="button" variant="outline" onClick={() => onCheck("txt")} disabled={pending}>Ganti ke Verifikasi TXT</Button> : null}
        <Button type="button" variant="outline" onClick={() => setConfirming(true)} disabled={pending}>Hapus Domain</Button>
      </div>
      <AlertDialog open={confirming} onOpenChange={(o) => { setConfirming(o); setRemoveErr(null); if (!o) setTyped("") }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {primary.hostname}?</AlertDialogTitle>
            <AlertDialogDescription>Mini-site kembali ke {v.platformHost}; kode QR yang sudah dicetak dengan domain ini berhenti bekerja.</AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="cd-confirm">Ketik {primary.hostname} untuk konfirmasi</FieldLabel>
            <Input id="cd-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="none" spellCheck={false} />
            {typed && typed !== primary.hostname ? <FieldError>Nama domain belum sama.</FieldError> : null}
          </Field>
          {removeErr ? <p role="alert" className="text-sm font-medium text-danger">{removeErr}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={typed !== primary.hostname || pending} onClick={async () => setRemoveErr(await onRemove(typed))}>Ya, Hapus Domain</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
