import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { DownloadIcon, PlusIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "../../../components/ui/toggle-group"
import { api, ApiError } from "../../../lib/api"
import { PageTitle } from "../../../shell/states"
import { PartyPicker, type Contact } from "../../kiriman/detail"
import { SectionCard } from "../../../components/admin/page"
import { CourierLogo } from "../../../components/admin/courier-logo"
import { PickupChip } from "../pickup-chip"
import { usePosConfig } from "../../../lib/pos-config"
import { readXlsxToCsv, XLSX_MIME } from "../../../lib/xlsx-reader"
import { isOwner, useWorkspace } from "../../../shell/workspace"
import { cn } from "cn"

// `/kasir/multi` Paket Massal setup (visual 07, spec 03 §1.3): sender → courier + COD mode → rows by hand or CSV
// upload (≤ 200 rows, 1 MB). The server parses and validates every row; checking continues on the batch page.
// DEC-251: pickup chip in the header, courier cards (Reguler / Cargo tabs; cargo is Non-COD only, `service_class` from
// `GET /bulk/services`), and `.xlsx` read in the browser into the same CSV the endpoint already accepts.
interface Service { code: string; name: string; cargo: boolean; cod: boolean }
type Cells = { id: string; name: string; phone: string; street: string; areaText: string; weightGram: string; codIdr: string; content: string }
let nextRowId = 1
const makeRow = (): Cells => ({ id: `r${nextRowId++}`, name: "", phone: "", street: "", areaText: "", weightGram: "1000", codIdr: "", content: "" })
const MODES = [
  { id: "none", label: "Tanpa COD" },
  { id: "buyer_bears_fee", label: "COD, fee ditanggung pembeli" },
  { id: "sender_bears_fee", label: "COD, fee ditanggung pengirim" },
]

export function PaketMassalPage() {
  const navigate = useNavigate()
  const w = useWorkspace()
  const cfg = usePosConfig()
  const [sender, setSender] = useState<Contact | null>(null)
  const [services, setServices] = useState<Service[] | null>(null)
  const [service, setService] = useState("")
  const [tab, setTab] = useState<"regular" | "cargo">("regular")
  const [mode, setMode] = useState("none")
  const [rows, setRows] = useState<Cells[]>(() => [makeRow()])
  const [file, setFile] = useState<{ name: string; text: string } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [servicesError, setServicesError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const svcGen = useRef(0)
  // Sol R2-4: the services may arrive after the operator already opened the Cargo tab — the default comes from the tab
  // open at that moment (none when that tab is empty), never a hidden Reguler service.
  const tabRef = useRef(tab)
  useLayoutEffect(() => {
    tabRef.current = tab
  })
  const fetchServices = useCallback(() => {
    const mine = ++svcGen.current
    api<{ items: Service[] }>("/bulk/services").then((r) => {
      if (mine !== svcGen.current) return
      setServicesError(null)
      setServices(r.items)
      const cargo = tabRef.current === "cargo"
      setService((cur) => cur || r.items.find((s) => s.cargo === cargo)?.code || "")
    }).catch((e) => {
      if (mine !== svcGen.current) return
      setServicesError(e instanceof ApiError ? e.body.message : "Daftar ekspedisi tidak dapat dimuat.")
    })
  }, [])
  const loadServices = useCallback(() => {
    setServicesError(null)
    fetchServices()
  }, [fetchServices])
  useEffect(() => {
    fetchServices()
    const g = svcGen
    return () => { g.current++ }
  }, [fetchServices])
  const chosen = services?.find((s) => s.code === service)
  // Cargo (and any service without COD) ships Non-COD only: the COD choice is locked to `none`.
  // Sol R1-7: the Cargo tab is Non-COD even before (or without) a card; the chosen service must belong to the open tab.
  const codLock = tab === "cargo" || chosen?.cargo ? "Kargo hanya Non-COD." : chosen && !chosen.cod ? "Layanan ini tidak mendukung COD." : null
  const serviceOk = !!chosen && chosen.cargo === (tab === "cargo")
  const cards = (services ?? []).filter((s) => s.cargo === (tab === "cargo"))
  function choose(s: Service) {
    setService(s.code)
    if (s.cargo || !s.cod) setMode("none")
  }
  function switchTab(t: "regular" | "cargo") {
    setTab(t)
    if (t === "cargo") setMode("none")
    // Keep the chosen service visible: a tab switch picks the first service of that tab unless one is already there;
    // an empty tab (every cargo courier switched off) keeps NO hidden selection from the other tab (Sol R1-7).
    const first = (services ?? []).find((s) => s.cargo === (t === "cargo"))
    if (!first) setService("")
    else if (chosen?.cargo !== (t === "cargo")) choose(first)
  }
  function onCardKey(e: KeyboardEvent<HTMLDivElement>) {
    // WAI-ARIA radio group: arrows move from the focused card (wrapping) and select it.
    if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key) || !cards.length) return
    e.preventDefault()
    const at = cards.findIndex((s) => `layanan-${s.code}` === (document.activeElement as HTMLElement | null)?.id)
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1
    const next = cards[at < 0 ? 0 : (at + step + cards.length) % cards.length]!
    choose(next)
    document.getElementById(`layanan-${next.code}`)?.focus()
  }
  const set = (i: number, k: keyof Cells, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  // Sol R1-4: a new pick replaces the previous file at once (even when it is then rejected), only the latest pick
  // may publish its result, and `Periksa Baris` waits while a file is being read.
  const pickGen = useRef(0)
  const [reading, setReading] = useState(false)
  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = "" // picking the same file again (after fixing it) fires `change` again
    if (!f) return
    const mine = ++pickGen.current
    // Sol R2-3: a new pick ends any earlier read's `Membaca berkas…` state at once, even when this file is rejected.
    setReading(false)
    setFile(null)
    setErrors({})
    if (f.size > 1024 * 1024) return setErrors({ file: "Berkas lebih dari 1 MB." })
    const xlsx = /\.xlsx$/i.test(f.name) || f.type === XLSX_MIME
    if (!xlsx && !/\.csv$/i.test(f.name) && f.type !== "text/csv") return setErrors({ file: "Pilih berkas Excel .xlsx atau .csv." })
    setReading(true)
    try {
      const text = xlsx ? await readXlsxToCsv(await f.arrayBuffer()) : await f.text()
      if (mine !== pickGen.current) return
      setFile({ name: f.name, text })
    } catch (err) {
      if (mine !== pickGen.current) return
      setErrors({ file: err instanceof Error ? err.message : "Berkas tidak dapat dibaca." })
    } finally {
      if (mine === pickGen.current) setReading(false)
    }
  }
  async function submit() {
    setPending(true)
    setMsg(null)
    setErrors({})
    try {
      const body = {
        senderId: sender?.id,
        serviceCode: service,
        codFeeMode: mode,
        ...(file
          ? { csv: file.text, fileName: file.name }
          : {
              rows: rows
                .map(({ id: _id, ...rest }) => ({ ...rest, codIdr: mode === "none" ? "" : rest.codIdr }))
                .filter((r) => Object.values(r).some((v) => v && v !== "1000")),
            }),
      }
      const r = await api<{ id: string }>("/bulk", { body })
      await navigate({ to: "/kiriman/massal/$batch", params: { batch: r.id } })
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.body.field_errors ?? {})
        setMsg(e.body.message)
      } else setMsg("Gagal menyimpan. Coba lagi.")
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="pb-24 md:pb-0">
      <PageTitle title="Paket Massal" description="Satu pengirim, banyak paket, satu kali bayar di loket. Maksimal 200 baris.">
        <PickupChip outlet={cfg?.outlet} owner={isOwner(w)} loaded={cfg !== null} />
      </PageTitle>
      <div className="flex flex-col gap-4 md:gap-5">
        <SectionCard id="pengirim" title="1. Pengirim">
          {sender ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-base md:text-sm"><span className="font-medium">{sender.display_brand_name ?? sender.true_name}</span> <span className="text-muted-foreground tabular-nums">{sender.true_phone}</span></p>
              <Button variant="outline" onClick={() => setSender(null)}>Ganti</Button>
            </div>
          ) : (
            <PartyPicker kind="senders" value={sender} onPick={setSender} />
          )}
          {errors.senderId ? <p role="alert" className="mt-2 text-base md:text-sm text-danger">{errors.senderId}</p> : null}
        </SectionCard>

        <SectionCard id="layanan" title="2. Ekspedisi & COD untuk semua baris">
          <div className="flex flex-col gap-4">
          <ToggleGroup value={[tab]} onValueChange={(v) => v[0] && switchTab(v[0] as typeof tab)} variant="outline" spacing={0} aria-label="Kategori layanan" className="flex-wrap">
            <ToggleGroupItem value="regular">Reguler</ToggleGroupItem>
            <ToggleGroupItem value="cargo" className="whitespace-normal text-center leading-tight">Cargo ≥ 5 kg (Non-COD)</ToggleGroupItem>
          </ToggleGroup>
          {servicesError ? (
            <div className="flex flex-wrap items-center gap-3 text-sm text-danger">
              <span>{servicesError}</span>
              <Button type="button" variant="outline" size="sm" onClick={loadServices}>Coba Lagi</Button>
            </div>
          ) : services === null ? (
            <p className="text-base md:text-sm text-muted-foreground">Memuat ekspedisi…</p>
          ) : cards.length === 0 ? (
            <p className="text-base md:text-sm text-muted-foreground">Tidak ada layanan pada kategori ini.</p>
          ) : (
            <div role="radiogroup" aria-label="Ekspedisi untuk semua baris" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4" onKeyDown={onCardKey}>
              {cards.map((s) => {
                const checked = s.code === service
                // One tab stop: the chosen card when it is in this tab, else the first card.
                const tabStop = cards.some((x) => x.code === service) ? checked : s === cards[0]
                return (
                  <div
                    key={s.code}
                    id={`layanan-${s.code}`}
                    role="radio"
                    aria-checked={checked}
                    tabIndex={tabStop ? 0 : -1}
                    onClick={() => choose(s)}
                    onKeyDown={(e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), choose(s))}
                    className={cn(
                      "flex min-h-11 cursor-pointer flex-col items-start gap-2 rounded-lg border p-3 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      checked ? "border-primary bg-accent/60" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70",
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <CourierLogo code={s.code} name={s.name} decorative />
                      <span aria-hidden className={cn("grid size-4 shrink-0 place-items-center rounded-full border", checked ? "border-primary" : "border-slate-300")}>
                        {checked ? <span className="size-2 rounded-full bg-primary" /> : null}
                      </span>
                    </span>
                    <span className="text-base font-medium text-slate-900 md:text-sm">{s.name}</span>
                  </div>
                )
              })}
            </div>
          )}
          {errors.serviceCode ? <p role="alert" className="text-base md:text-sm text-danger">{errors.serviceCode}</p> : null}
          <ToggleGroup value={[mode]} onValueChange={(v) => v[0] && setMode(v[0])} variant="outline" aria-label="Mode COD" aria-describedby="mode-cod-info" className="flex-wrap">
            {MODES.map((m) => <ToggleGroupItem key={m.id} value={m.id} disabled={!!codLock && m.id !== "none"}>{m.label}</ToggleGroupItem>)}
          </ToggleGroup>
          <p id="mode-cod-info" className={cn("text-base md:text-sm", codLock ? "font-medium text-slate-900" : "text-muted-foreground")}>
            {codLock ?? "Baris dengan nominal COD memakai mode COD di atas; baris tanpa COD dikirim biasa."}
          </p>
        </div>
        </SectionCard>

        <SectionCard id="baris" title="3. Daftar paket">
          <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-base font-medium focus-within:ring-2 focus-within:ring-ring md:h-9 md:text-sm">
              <UploadIcon aria-hidden className="size-4" /> Unggah Excel/CSV
              <input type="file" accept={`.csv,.xlsx,text/csv,${XLSX_MIME}`} className="sr-only" onChange={pick} />
            </label>
            <a href="/api/app/bulk/template.csv" className="inline-flex h-11 items-center gap-2 px-2 text-base md:text-sm text-primary underline-offset-4 hover:underline"><DownloadIcon aria-hidden className="size-4" /> Unduh Template</a>
          </div>
          {errors.file ? <p role="alert" className="text-base md:text-sm text-danger">{errors.file}</p> : <p className="text-base md:text-sm text-muted-foreground">Berkas Excel .xlsx atau .csv, maksimal 1 MB dan 200 baris. Excel dibaca dari sheet pertama.</p>}
          {file ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-l-4 border-primary py-1 pl-3">
              <p className="text-base md:text-sm">Berkas <span className="font-medium">{file.name}</span> siap diperiksa.</p>
              <Button variant="ghost" onClick={() => setFile(null)}>Pakai isian manual</Button>
            </div>
          ) : (
            <ol className="flex flex-col divide-y border-y">
              {rows.map((r, i) => (
                <li key={r.id} className="grid gap-3 py-4 md:grid-cols-6">
                  <p className="text-base md:text-sm font-medium md:col-span-6">Baris {i + 1}</p>
                  <Field className="md:col-span-2"><FieldLabel htmlFor={`n${r.id}`}>Nama penerima</FieldLabel><Input id={`n${r.id}`} value={r.name} onChange={(e) => set(i, "name", e.target.value)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel htmlFor={`p${r.id}`}>No HP</FieldLabel><Input id={`p${r.id}`} inputMode="tel" value={r.phone} onChange={(e) => set(i, "phone", e.target.value)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel htmlFor={`k${r.id}`}>Kecamatan/Kota</FieldLabel><Input id={`k${r.id}`} value={r.areaText} onChange={(e) => set(i, "areaText", e.target.value)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel htmlFor={`a${r.id}`}>Alamat</FieldLabel><Input id={`a${r.id}`} value={r.street} onChange={(e) => set(i, "street", e.target.value)} /></Field>
                  <Field><FieldLabel htmlFor={`i${r.id}`}>Isi paket</FieldLabel><Input id={`i${r.id}`} value={r.content} placeholder="Pakaian" maxLength={100} onChange={(e) => set(i, "content", e.target.value)} /></Field>
                  <Field><FieldLabel htmlFor={`b${r.id}`}>Berat (gram)</FieldLabel><Input id={`b${r.id}`} inputMode="numeric" className="tabular-nums" value={r.weightGram} onChange={(e) => set(i, "weightGram", e.target.value.replace(/\D/g, ""))} /></Field>
                  <Field><FieldLabel htmlFor={`c${r.id}`}>COD (Rp)</FieldLabel><Input id={`c${r.id}`} inputMode="numeric" className="tabular-nums" disabled={mode === "none" || !!codLock} placeholder={mode === "none" || codLock ? "Non-COD" : "0"} value={mode === "none" || codLock ? "" : r.codIdr} onChange={(e) => set(i, "codIdr", e.target.value.replace(/\D/g, ""))} /></Field>
                  <div className="flex items-end">
                    <Button variant="ghost" aria-label={`Hapus baris ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><Trash2Icon aria-hidden /> Hapus</Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {!file ? <div><Button variant="outline" disabled={rows.length >= 200} onClick={() => setRows((rs) => [...rs, makeRow()])}><PlusIcon aria-hidden /> Tambah Baris</Button></div> : null}
          {errors.rows ? <FieldError>{errors.rows}</FieldError> : <FieldDescription>Kolom template: Nama Penerima, No HP, Alamat, Kecamatan/Kota, Kode Pos, Isi Paket, Berat (gram), Panjang, Lebar, Tinggi, COD (Rp), Nilai Barang (Rp), Catatan.</FieldDescription>}
        </div>
        </SectionCard>

        {msg ? <p role="alert" className="border-l-4 border-danger py-1 pl-3 text-base md:text-sm font-medium text-danger">{msg}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="lg" disabled={pending || reading || !sender || !serviceOk} onClick={submit}>{pending ? "Memeriksa…" : reading ? "Membaca berkas…" : "Periksa Baris"}</Button>
          <Link to="/kiriman/massal" className="inline-flex h-11 items-center px-2 text-base md:text-sm text-primary underline-offset-4 hover:underline">Riwayat Massal</Link>
          {!sender ? <span className="text-xs text-muted-foreground">Pilih pengirim dulu untuk mengaktifkan tombol.</span> : !serviceOk ? <span className="text-xs text-muted-foreground">Pilih ekspedisi pada kategori yang aktif.</span> : null}
        </div>
      </div>
    </div>
  )
}
