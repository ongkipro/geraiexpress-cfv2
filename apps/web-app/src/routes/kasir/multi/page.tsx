import { useEffect, useState, type ChangeEvent } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { DownloadIcon, PlusIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "../../../components/ui/toggle-group"
import { api, ApiError } from "../../../lib/api"
import { PageTitle } from "../../../shell/states"
import { PartyPicker, type Contact } from "../../kiriman/detail"

// `/kasir/multi` Paket Massal setup (visual 07, spec 03 §1.3): sender → courier + COD mode → rows by hand or CSV
// upload (≤ 200 rows, 1 MB). The server parses and validates every row; checking continues on the batch page.
interface Service { code: string; name: string; cargo: boolean; cod: boolean }
type Cells = { name: string; phone: string; street: string; areaText: string; weightGram: string; codIdr: string; content: string }
const EMPTY: Cells = { name: "", phone: "", street: "", areaText: "", weightGram: "1000", codIdr: "", content: "" }
const MODES = [
  { id: "none", label: "Tanpa COD" },
  { id: "buyer_bears_fee", label: "COD, fee ditanggung pembeli" },
  { id: "sender_bears_fee", label: "COD, fee ditanggung pengirim" },
]

export function PaketMassalPage() {
  const navigate = useNavigate()
  const [sender, setSender] = useState<Contact | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [service, setService] = useState("")
  const [mode, setMode] = useState("none")
  const [rows, setRows] = useState<Cells[]>([{ ...EMPTY }])
  const [file, setFile] = useState<{ name: string; text: string } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  useEffect(() => {
    api<{ items: Service[] }>("/bulk/services").then((r) => {
      const regular = r.items.filter((s) => !s.cargo)
      setServices(regular)
      setService((cur) => cur || regular[0]?.code || "")
    }).catch(() => setMsg("Daftar ekspedisi tidak dapat dimuat."))
  }, [])
  const set = (i: number, k: keyof Cells, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 1024 * 1024) return setErrors({ file: "Berkas lebih dari 1 MB." })
    if (!/\.csv$/i.test(f.name)) return setErrors({ file: "Untuk saat ini hanya berkas .csv. Simpan Excel sebagai CSV dulu." })
    setErrors({})
    setFile({ name: f.name, text: await f.text() })
  }
  async function submit() {
    setPending(true)
    setMsg(null)
    setErrors({})
    try {
      const body = { senderId: sender?.id, serviceCode: service, codFeeMode: mode, ...(file ? { csv: file.text, fileName: file.name } : { rows: rows.filter((r) => Object.values(r).some((v) => v && v !== "1000")) }) }
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
      <nav aria-label="Breadcrumb" className="mb-2 text-base text-muted-foreground"><Link to="/kasir" className="text-primary underline-offset-4 hover:underline">Buat Pengiriman</Link> › Paket Massal</nav>
      <PageTitle title="Paket Massal" description="Satu pengirim, banyak paket, satu kali bayar di loket. Maksimal 200 baris." />
      <div className="flex flex-col gap-6">
        <section className="rounded-lg border bg-card p-4 md:p-6" aria-labelledby="pengirim">
          <h3 id="pengirim" className="mb-3 text-lg font-semibold">1. Pengirim</h3>
          {sender ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-base"><span className="font-medium">{sender.display_brand_name ?? sender.true_name}</span> <span className="text-muted-foreground tabular-nums">{sender.true_phone}</span></p>
              <Button variant="outline" onClick={() => setSender(null)}>Ganti</Button>
            </div>
          ) : (
            <PartyPicker kind="senders" value={sender} onPick={setSender} />
          )}
          {errors.senderId ? <p role="alert" className="mt-2 text-base text-danger">{errors.senderId}</p> : null}
        </section>

        <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 md:p-6" aria-labelledby="layanan">
          <h3 id="layanan" className="text-lg font-semibold">2. Ekspedisi & COD untuk semua baris</h3>
          <div role="radiogroup" aria-label="Ekspedisi" className="flex flex-wrap gap-2">
            {services.map((s) => (
              <button key={s.code} type="button" role="radio" aria-checked={service === s.code} onClick={() => setService(s.code)} className={`h-11 rounded-lg border px-4 text-base ${service === s.code ? "border-primary bg-primary/10 font-medium text-primary" : "border-input"}`}>{s.name}</button>
            ))}
          </div>
          <ToggleGroup value={[mode]} onValueChange={(v) => v[0] && setMode(v[0])} variant="outline" aria-label="Mode COD" className="flex-wrap">
            {MODES.map((m) => <ToggleGroupItem key={m.id} value={m.id}>{m.label}</ToggleGroupItem>)}
          </ToggleGroup>
          <p className="text-base text-muted-foreground">Baris dengan nominal COD memakai mode COD di atas; baris tanpa COD dikirim biasa.</p>
        </section>

        <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 md:p-6" aria-labelledby="baris">
          <h3 id="baris" className="text-lg font-semibold">3. Daftar paket</h3>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 text-base font-medium focus-within:ring-2 focus-within:ring-ring">
              <UploadIcon aria-hidden className="size-4" /> Unggah CSV
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={pick} />
            </label>
            <a href="/api/app/bulk/template.csv" className="inline-flex h-11 items-center gap-2 px-2 text-base text-primary underline-offset-4 hover:underline"><DownloadIcon aria-hidden className="size-4" /> Unduh Template</a>
          </div>
          {errors.file ? <p role="alert" className="text-base text-danger">{errors.file}</p> : null}
          {file ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-l-4 border-primary py-1 pl-3">
              <p className="text-base">Berkas <span className="font-medium">{file.name}</span> siap diperiksa.</p>
              <Button variant="ghost" onClick={() => setFile(null)}>Pakai isian manual</Button>
            </div>
          ) : (
            <ol className="flex flex-col divide-y border-y">
              {rows.map((r, i) => (
                <li key={i} className="grid gap-3 py-4 md:grid-cols-6">
                  <p className="text-base font-medium md:col-span-6">Baris {i + 1}</p>
                  <Field className="md:col-span-2"><FieldLabel htmlFor={`n${i}`}>Nama penerima</FieldLabel><Input id={`n${i}`} value={r.name} onChange={(e) => set(i, "name", e.target.value)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel htmlFor={`p${i}`}>No HP</FieldLabel><Input id={`p${i}`} inputMode="tel" value={r.phone} onChange={(e) => set(i, "phone", e.target.value)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel htmlFor={`k${i}`}>Kecamatan/Kota</FieldLabel><Input id={`k${i}`} value={r.areaText} onChange={(e) => set(i, "areaText", e.target.value)} /></Field>
                  <Field className="md:col-span-3"><FieldLabel htmlFor={`a${i}`}>Alamat</FieldLabel><Input id={`a${i}`} value={r.street} onChange={(e) => set(i, "street", e.target.value)} /></Field>
                  <Field><FieldLabel htmlFor={`b${i}`}>Berat (gram)</FieldLabel><Input id={`b${i}`} inputMode="numeric" className="tabular-nums" value={r.weightGram} onChange={(e) => set(i, "weightGram", e.target.value.replace(/\D/g, ""))} /></Field>
                  <Field><FieldLabel htmlFor={`c${i}`}>COD (Rp)</FieldLabel><Input id={`c${i}`} inputMode="numeric" className="tabular-nums" value={r.codIdr} onChange={(e) => set(i, "codIdr", e.target.value.replace(/\D/g, ""))} /></Field>
                  <div className="flex items-end">
                    <Button variant="ghost" aria-label={`Hapus baris ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><Trash2Icon aria-hidden /> Hapus</Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {!file ? <div><Button variant="outline" disabled={rows.length >= 200} onClick={() => setRows((rs) => [...rs, { ...EMPTY }])}><PlusIcon aria-hidden /> Tambah Baris</Button></div> : null}
          {errors.rows ? <FieldError>{errors.rows}</FieldError> : <FieldDescription>Kolom template: Nama Penerima, No HP, Alamat, Kecamatan/Kota, Kode Pos, Isi Paket, Berat (gram), Panjang, Lebar, Tinggi, COD (Rp), Nilai Barang (Rp), Catatan.</FieldDescription>}
        </section>

        {msg ? <p role="alert" className="border-l-4 border-danger py-1 pl-3 text-base font-medium text-danger">{msg}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button size="lg" disabled={pending || !sender || !service} onClick={submit}>{pending ? "Memeriksa…" : "Periksa Baris"}</Button>
          <Link to="/kiriman/massal" className="inline-flex h-11 items-center px-2 text-base text-primary underline-offset-4 hover:underline">Riwayat Massal</Link>
        </div>
      </div>
    </div>
  )
}
