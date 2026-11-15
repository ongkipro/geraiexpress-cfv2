import * as React from "react"
import { AlertTriangleIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useIsMobile } from "@/hooks/use-mobile"

// docs/visual/08 §2 (DEC-223): grouped settings sub-menu, one route and one short form per item.
const groups = [
  {
    label: "Gerai",
    items: [
      { id: "profil", label: "Profil Gerai", hint: "Berkah Jaya" },
      { id: "mini-site", label: "Mini-Site", hint: "berkahjaya.gerai.cc" },
      { id: "data-usaha", label: "Data Usaha", hint: "Belum diisi" },
    ],
  },
  {
    label: "Operasional",
    items: [
      { id: "ekspedisi", label: "Ekspedisi Aktif", hint: "6 aktif" },
      { id: "printer", label: "Printer & Struk", hint: "Thermal 100 mm (PC)" },
      { id: "packing", label: "Packing & Biaya Tambahan", hint: "4 item" },
    ],
  },
  {
    label: "Akun & Akses",
    items: [
      { id: "anggota", label: "Anggota", hint: "3 orang" },
      { id: "mengantar", label: "Mengantar", hint: "Webhook belum aktif", warn: true },
      { id: "api-mcp", label: "API & MCP", hint: "1 kunci" },
    ],
  },
] as const

type ItemId = (typeof groups)[number]["items"][number]["id"]
type Item = { id: ItemId; label: string; hint: string; warn?: boolean }
const all: Item[] = groups.flatMap((g) => [...g.items] as Item[])

export function Pengaturan({ role, item, href }: { role: "owner" | "kasir"; item: string | null; href: (p: string) => string }) {
  const mobile = useIsMobile()
  if (role === "kasir") return <PrinterPage role={role} />
  const current = (all.find((i) => i.id === item)?.id ?? (mobile ? null : "printer")) as ItemId | null

  if (mobile) {
    if (!current) return <SettingsList href={href} />
    return (
      <div className="flex flex-col gap-4">
        <a href={href("/pengaturan")} className="inline-flex min-h-11 items-center gap-1 text-primary">
          <ChevronLeftIcon className="size-5" aria-hidden /> Pengaturan
        </a>
        <ItemPage id={current} role={role} />
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="Menu pengaturan" className="flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="px-3 pb-1 text-sm font-semibold text-muted-foreground">{g.label}</p>
            <ul className="flex flex-col gap-0.5">
              {g.items.map((i) => {
                const active = i.id === current
                return (
                  <li key={i.id}>
                    <a
                      href={href(`/pengaturan/${i.id}`)}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-10 items-center justify-between gap-2 rounded-md px-3 ${active ? "bg-accent font-medium text-accent-foreground" : "hover:bg-muted"}`}
                    >
                      <span>{i.label}</span>
                      {"warn" in i && i.warn ? <AlertTriangleIcon className="size-5 text-warn" aria-label="Perlu tindakan" /> : null}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="min-w-0">{current ? <ItemPage id={current} role={role} /> : null}</div>
    </div>
  )
}

function SettingsList({ href }: { href: (p: string) => string }) {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-[1.75rem] leading-tight font-bold tracking-[-0.02em]">Pengaturan</h2>
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h3 className="mb-2 font-semibold text-muted-foreground">{g.label}</h3>
          <ul className="divide-y rounded-lg border bg-card">
            {g.items.map((i) => (
              <li key={i.id}>
                <a href={href(`/pengaturan/${i.id}`)} className="flex min-h-14 items-center gap-3 px-4 py-2">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{i.label}</span>
                    <span className={`truncate text-sm ${"warn" in i && i.warn ? "text-warn" : "text-muted-foreground"}`}>{i.hint}</span>
                  </span>
                  <ChevronRightIcon className="size-5 text-muted-foreground" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        {desc ? <p className="text-muted-foreground">{desc}</p> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function SaveBar({ dirty, reset }: { dirty: boolean; reset: () => void }) {
  if (!dirty) return null
  return (
    <div role="region" aria-label="Simpan perubahan" className="sticky bottom-16 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 md:bottom-4">
      <span>Ada perubahan yang belum disimpan.</span>
      <span className="flex gap-2">
        <Button variant="outline" onClick={reset}>Batal</Button>
        <Button onClick={reset}>Simpan</Button>
      </span>
    </div>
  )
}

function ItemPage({ id, role }: { id: ItemId; role: "owner" | "kasir" }) {
  const label = all.find((i) => i.id === id)!.label
  if (id === "printer") return <PrinterPage role={role} />
  if (id === "ekspedisi") return <EkspedisiPage />
  if (id === "data-usaha") return <DataUsahaPage />
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[1.75rem] leading-tight font-bold tracking-[-0.02em]">{label}</h2>
      <Card title={label} desc="Isi halaman ini mengikuti docs/visual/08 §2.3.">
        <p className="text-muted-foreground">Prototipe: halaman ini belum dibuat.</p>
      </Card>
    </div>
  )
}

function PrinterPage({ role }: { role: "owner" | "kasir" }) {
  const [paper, setPaper] = React.useState("58")
  const [density, setDensity] = React.useState("normal")
  const dirty = paper !== "58" || density !== "normal"
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[1.75rem] leading-tight font-bold tracking-[-0.02em]">Printer & Struk</h2>
        <p className="text-muted-foreground">Atur printer kasir dan isi struk pelanggan.</p>
      </div>
      <Card title="Printer di perangkat ini" desc="Tersimpan di perangkat ini saja.">
        <p>Thermal 100 mm · USB di PC · siap</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline">Tes Cetak</Button>
          <Button variant="outline">Ganti Printer</Button>
        </div>
      </Card>
      <Card title="Format cetak">
        <FieldGroup>
          <Field>
            <FieldLabel id="kertas">Ukuran kertas</FieldLabel>
            <ToggleGroup aria-labelledby="kertas" value={[paper]} onValueChange={(v) => v[0] && setPaper(String(v[0]))} variant="outline" spacing={0}>
              <ToggleGroupItem value="58">58 mm</ToggleGroupItem>
              <ToggleGroupItem value="80">80 mm</ToggleGroupItem>
              <ToggleGroupItem value="10x15">10×15</ToggleGroupItem>
            </ToggleGroup>
          </Field>
          <Field>
            <FieldLabel id="tebal">Ketebalan cetak</FieldLabel>
            <ToggleGroup aria-labelledby="tebal" value={[density]} onValueChange={(v) => v[0] && setDensity(String(v[0]))} variant="outline" spacing={0}>
              <ToggleGroupItem value="normal">Normal</ToggleGroupItem>
              <ToggleGroupItem value="tebal">Tebal</ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>Pilih Tebal kalau kertas thermal murah hasilnya pudar.</FieldDescription>
          </Field>
        </FieldGroup>
      </Card>
      {role === "owner" ? (
        <Card title="Isi struk pelanggan">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="kaki">Catatan kaki</FieldLabel>
              <Input id="kaki" defaultValue="Terima kasih sudah kirim di Berkah Jaya" />
            </Field>
          </FieldGroup>
        </Card>
      ) : null}
      <SaveBar dirty={dirty} reset={() => { setPaper("58"); setDensity("normal") }} />
    </div>
  )
}

function EkspedisiPage() {
  const [on, setOn] = React.useState<Record<string, boolean>>({ "J&T Express": true, SiCepat: true, JNE: true, SPX: true, "Lion Parcel": true, "ID Express": true, Paxel: false })
  const [toast, setToast] = React.useState("")
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[1.75rem] leading-tight font-bold tracking-[-0.02em]">Ekspedisi Aktif</h2>
        <p className="text-muted-foreground">Perubahan langsung tersimpan. Diskon diatur oleh GeraiExpress.</p>
      </div>
      <Card title="Ekspedisi di kasir dan mini-site">
        <ul className="divide-y">
          {Object.entries(on).map(([name, v]) => (
            <li key={name}>
              <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 py-2">
                <span className="flex flex-col">
                  <span className="font-medium">{name}</span>
                  <span className="text-sm text-muted-foreground">{v ? "Tampil di kasir dan mini-site" : "Tidak ditampilkan"}</span>
                </span>
                <Switch checked={v} onCheckedChange={(c) => { setOn({ ...on, [name]: c }); setToast(`${name} ${c ? "diaktifkan" : "dinonaktifkan"}`) }} aria-label={`${name} aktif`} />
              </label>
            </li>
          ))}
        </ul>
      </Card>
      <p role="status" aria-live="polite" className={toast ? "rounded-md border bg-card p-3" : "sr-only"}>{toast}</p>
    </div>
  )
}

function DataUsahaPage() {
  const [dirty, setDirty] = React.useState(false)
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[1.75rem] leading-tight font-bold tracking-[-0.02em]">Data Usaha</h2>
        <p className="text-muted-foreground">Boleh dikosongkan. Diisi jika perlu faktur atau kerja sama resmi.</p>
      </div>
      <Card title="Identitas usaha">
        <FieldGroup className="grid gap-4 md:grid-cols-2" onInput={() => setDirty(true)}>
          <Field>
            <FieldLabel htmlFor="nama-resmi">Nama resmi</FieldLabel>
            <Input id="nama-resmi" placeholder="Contoh: CV Berkah Jaya" />
          </Field>
          <Field>
            <FieldLabel htmlFor="nib">NIB</FieldLabel>
            <Input id="nib" inputMode="numeric" />
          </Field>
          <Field>
            <FieldLabel htmlFor="npwp">NPWP</FieldLabel>
            <Input id="npwp" inputMode="numeric" />
            <FieldDescription>Disimpan terenkripsi, tidak tampil ke kasir atau publik.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="pj">Penanggung jawab</FieldLabel>
            <Input id="pj" />
          </Field>
        </FieldGroup>
      </Card>
      <SaveBar dirty={dirty} reset={() => setDirty(false)} />
    </div>
  )
}
