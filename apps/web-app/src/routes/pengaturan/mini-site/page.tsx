import { useCallback, useEffect, useState, type FormEvent } from "react"
import { CopyIcon, ExternalLinkIcon } from "lucide-react"
import { Badge } from "../../../components/ui/badge"
import { Button } from "../../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { api, ApiError } from "../../../lib/api"
import { ErrorState, LoadingState } from "../../../shell/states"
import { Notice, SettingsLayout } from "../index/shared"

// Pengaturan › Mini-Site (visual 08 §2.3) with `Domain Sendiri` (spec 11 §5–6): DNS record to add, steps,
// `Periksa Lagi`, and the remedy for the current state. Cloudflare work happens server-side; this page only shows it.
type Records = { ownership: { name: string; value: string } | null; ssl: Array<{ txt_name: string | null; txt_value: string | null; http_url: string | null }> }
type Domain = { hostname: string; role: "primary" | "redirect"; state: string; branch: string | null; sslMethod: "http" | "txt" | null; cfStatus: string | null; sslStatus: string | null; records: Records | null; remedy: { code: string; text: string } | null; lastCheckedAt: number | null; activatedAt: number | null }
type View = { pro: boolean; platformHost: string; cnameTarget: string; primaryHost: string; domains: Domain[] }

const STATE: Record<string, { label: string; tone: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Menunggu DNS", tone: "secondary" },
  active: { label: "Aktif", tone: "default" },
  failed: { label: "Gagal", tone: "destructive" },
  moved: { label: "DNS berubah", tone: "destructive" },
  suspended: { label: "Dibekukan", tone: "destructive" },
}
const when = (ms: number | null) => (ms ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(ms) : "Belum")
const label = (host: string, root: string) => (host === root ? "@" : host.endsWith(`.${root}`) ? host.slice(0, -root.length - 1) : host)

function Copy({ text }: { text: string }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={`Salin ${text}`} onClick={() => void navigator.clipboard?.writeText(text)}>
      <CopyIcon aria-hidden />
    </Button>
  )
}

function DnsTable({ rows }: { rows: Array<{ type: string; name: string; value: string }> }) {
  return (
    <>
    <dl className="flex flex-col divide-y text-base sm:hidden">
      {rows.map((r) => (
        <div key={`m${r.type}${r.name}`} className="flex flex-col gap-1 py-2">
          <dt className="font-medium">{r.type}</dt>
          <dd className="flex items-start gap-1"><span className="w-12 shrink-0 text-muted-foreground">Nama</span><code className="min-w-0 flex-1 break-all">{r.name}</code><Copy text={r.name} /></dd>
          <dd className="flex items-start gap-1"><span className="w-12 shrink-0 text-muted-foreground">Isi</span><code className="min-w-0 flex-1 break-all">{r.value}</code><Copy text={r.value} /></dd>
        </div>
      ))}
    </dl>
    <table className="hidden w-full table-fixed border-collapse text-base sm:table">
      <caption className="sr-only">Record DNS yang perlu ditambahkan</caption>
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th scope="col" className="w-20 py-2 pr-2 font-medium">Tipe</th>
          <th scope="col" className="py-2 pr-2 font-medium">Nama</th>
          <th scope="col" className="py-2 font-medium">Isi</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.type}${r.name}`} className="border-b align-top last:border-0">
            <td className="py-2 pr-2 font-medium">{r.type}</td>
            <td className="py-2 pr-2"><span className="flex items-start gap-1"><code className="min-w-0 break-all">{r.name}</code><Copy text={r.name} /></span></td>
            <td className="py-2"><span className="flex items-start gap-1"><code className="min-w-0 break-all">{r.value}</code><Copy text={r.value} /></span></td>
          </tr>
        ))}
      </tbody>
    </table>
    </>
  )
}

export function MiniSitePage() {
  const [v, setV] = useState<View | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: "safe" | "danger"; text: string } | null>(null)
  const [pending, setPending] = useState(false)
  const load = useCallback(() => {
    api<View>("/custom-domain")
      .then((x) => {
        setError(null)
        setV(x)
      })
      .catch((e) => setError(e instanceof ApiError ? e.body.message : "Data mini-site tidak dapat dimuat."))
  }, [])
  useEffect(load, [load])
  async function act(path: string, body: unknown, ok: string) {
    setPending(true)
    try {
      setV(await api<View>(path, { body }))
      setMsg({ tone: "safe", text: ok })
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof ApiError ? e.body.message : "Permintaan gagal. Coba lagi." })
    } finally {
      setPending(false)
    }
  }
  if (error) return <SettingsLayout title="Mini-Site"><ErrorState message={error} onRetry={load} /></SettingsLayout>
  if (!v) return <SettingsLayout title="Mini-Site"><LoadingState label="Memuat mini-site" /></SettingsLayout>
  const primary = v.domains.find((d) => d.role === "primary") ?? v.domains[0] ?? null
  return (
    <SettingsLayout title="Mini-Site" description="Halaman cek ongkir, kirim dari rumah, dan lacak paket untuk pelanggan gerai Anda.">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Alamat mini-site</CardTitle>
          <CardDescription className="text-base">Alamat ini dicetak di struk dan kode QR.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-base">
          <p className="flex flex-wrap items-center gap-2">
            <a href={`https://${v.primaryHost}`} target="_blank" rel="noreferrer" className="font-mono break-all text-primary underline-offset-4 hover:underline">{v.primaryHost}</a>
            <ExternalLinkIcon aria-hidden className="size-4 text-muted-foreground" />
          </p>
          {v.primaryHost !== v.platformHost ? <p className="text-muted-foreground">Alamat bawaan <span className="font-mono">{v.platformHost}</span> tetap bisa dipakai.</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Domain Sendiri</CardTitle>
          <CardDescription className="text-base">Pakai domain toko Anda, misalnya kirim.tokoanda.id, untuk mini-site gerai.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!v.pro ? (
            <p className="text-base text-muted-foreground">Domain sendiri tersedia untuk gerai Pro. Hubungi tim GeraiExpress lewat menu Bantuan untuk mengaktifkan.</p>
          ) : primary ? (
            <DomainStatus v={v} pending={pending} onCheck={(method) => act("/custom-domain/check", method ? { method } : {}, method === "txt" ? "Verifikasi diganti ke TXT. Pasang record TXT di bawah." : "Pemeriksaan diulang.")} onRemove={(confirm) => act("/custom-domain/remove", { confirm }, "Domain dihapus. Mini-site kembali memakai alamat bawaan.")} />
          ) : (
            <AddDomain pending={pending} onAdd={(hostname, rootChoice) => act("/custom-domain", { hostname, rootChoice }, "Domain didaftarkan. Pasang record DNS di bawah.")} />
          )}
        </CardContent>
      </Card>
      <Notice msg={msg} />
    </SettingsLayout>
  )
}

function AddDomain({ pending, onAdd }: { pending: boolean; onAdd: (hostname: string, rootChoice: string) => void }) {
  const [host, setHost] = useState("")
  const [root, setRoot] = useState<"root_primary" | "www_primary">("root_primary")
  const bare = host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  const isRoot = /^[a-z0-9-]+\.(co\.id|my\.id|web\.id|biz\.id|or\.id|ac\.id|sch\.id|net\.id|[a-z]{2,})$/.test(bare) && !bare.startsWith("www.")
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={(e: FormEvent) => (e.preventDefault(), onAdd(bare, root))}>
      <Field>
        <FieldLabel htmlFor="cd-host">Domain</FieldLabel>
        <Input id="cd-host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="kirim.tokoanda.id" autoCapitalize="none" spellCheck={false} />
        <FieldDescription>Disarankan subdomain (kirim.tokoanda.id): email dan website toko tetap aman.</FieldDescription>
      </Field>
      {isRoot ? (
        <div role="radiogroup" aria-label="Alamat utama" className="flex flex-col gap-2">
          <p className="text-base font-medium">Domain utama dipakai sebagai</p>
          {([["root_primary", `${bare} (www diarahkan ke sini)`, "Butuh pengelola DNS yang mendukung CNAME di @, misalnya Cloudflare DNS."], ["www_primary", `www.${bare}`, "Domain utama diteruskan ke www lewat pengaturan di registrar."]] as const).map(([k, t, d]) => (
            <button key={k} type="button" role="radio" aria-checked={root === k} onClick={() => setRoot(k)} className={`flex min-h-11 flex-col items-start rounded-lg border px-4 py-2 text-left text-base ${root === k ? "border-primary bg-primary/10" : "border-input"}`}>
              <span className="font-medium">{t}</span>
              <span className="text-muted-foreground">{d}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div><Button type="submit" disabled={pending || bare.length < 4}>Tambah Domain</Button></div>
    </form>
  )
}

function DomainStatus({ v, pending, onCheck, onRemove }: { v: View; pending: boolean; onCheck: (method?: "txt" | "http") => void; onRemove: (confirm: string) => void }) {
  const [confirming, setConfirming] = useState(false)
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
      <ul className="flex flex-col gap-2">
        {v.domains.map((d) => (
          <li key={d.hostname} className="flex flex-wrap items-center gap-2 text-base">
            <span className="break-all font-medium">{d.hostname}</span>
            <Badge variant={STATE[d.state]?.tone ?? "secondary"}>{STATE[d.state]?.label ?? d.state}</Badge>
            {d.role === "redirect" ? <span className="text-muted-foreground">diarahkan ke {primary.hostname}</span> : null}
          </li>
        ))}
      </ul>
      {allActive ? (
        <p className="text-base">Domain aktif sejak {when(primary.activatedAt)}. Struk dan kode QR baru memakai <span className="font-mono">{primary.hostname}</span>.</p>
      ) : (
        <>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-base">
            <li>Buka pengelola DNS domain Anda (registrar atau Cloudflare).</li>
            <li>Tambahkan record di bawah. Jangan ubah record MX atau email yang sudah ada.</li>
            <li>Tunggu beberapa menit, lalu tekan Periksa Lagi. Kami juga memeriksa otomatis tiap 10 menit.</li>
          </ol>
          <DnsTable rows={dns} />
          {remedy ? <p role="status" className="border-l-4 border-warn pl-3 text-base">{remedy.text}</p> : null}
          <p className="text-base text-muted-foreground">Terakhir diperiksa: {when(primary.lastCheckedAt)}</p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {!allActive ? <Button type="button" onClick={() => onCheck()} disabled={pending}>Periksa Lagi</Button> : null}
        {!allActive && primary.sslMethod !== "txt" && remedy?.code === "http_dcv_blocked" ? <Button type="button" variant="outline" onClick={() => onCheck("txt")} disabled={pending}>Ganti ke Verifikasi TXT</Button> : null}
        <Button type="button" variant="outline" onClick={() => setConfirming(true)} disabled={pending}>Hapus Domain</Button>
      </div>
      {confirming ? (
        <div role="alertdialog" aria-label="Hapus domain" className="flex flex-col gap-3 border-l-4 border-danger pl-3">
          <p className="text-base font-medium text-danger">Hapus {primary.hostname}? Mini-site kembali ke {v.platformHost}; kode QR yang sudah dicetak dengan domain ini berhenti bekerja.</p>
          <Field>
            <FieldLabel htmlFor="cd-confirm">Ketik {primary.hostname} untuk konfirmasi</FieldLabel>
            <Input id="cd-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="none" spellCheck={false} />
            {typed && typed !== primary.hostname ? <FieldError>Nama domain belum sama.</FieldError> : null}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>Batal</Button>
            <Button type="button" variant="destructive" disabled={typed !== primary.hostname || pending} onClick={() => onRemove(typed)}>Ya, Hapus Domain</Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
