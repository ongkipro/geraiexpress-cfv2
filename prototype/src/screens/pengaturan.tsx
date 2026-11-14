import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHead } from "./shared"

export function Pengaturan({ role }: { role: "owner" | "kasir" }) {
  if (role === "kasir") {
    return (
      <div className="flex max-w-2xl flex-col gap-6">
        <PageHead title="Printer di perangkat ini" />
        <section className="rounded-lg border bg-card p-4">
          <p>POS-58 terhubung lewat Bluetooth.</p>
          <p className="mt-1 text-muted-foreground">Pengaturan ini tersimpan di perangkat ini saja.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline">Tes Cetak</Button>
            <Button variant="outline">Ganti Printer</Button>
          </div>
        </section>
      </div>
    )
  }
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHead title="Pengaturan" />
      <Tabs defaultValue="outlet">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList variant="line">
            {["Mini-Site", "Ekspedisi Aktif", "Printer & Packing", "Outlet & Mengantar", "Anggota", "API & MCP"].map((t) => (
              <TabsTrigger key={t} value={t === "Outlet & Mengantar" ? "outlet" : t}>{t}</TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      <section className="rounded-lg border bg-card p-4">
        <h3 className="mb-4 text-lg font-semibold">Data usaha (opsional)</h3>
        <p className="mb-4 text-muted-foreground">Boleh dikosongkan. Diisi jika perlu faktur atau kerja sama resmi.</p>
        <FieldGroup className="grid gap-4 md:grid-cols-2">
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
      </section>
    </div>
  )
}
