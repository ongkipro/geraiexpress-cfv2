import * as React from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { quotes, rupiah } from "@/data"

export function Pos({ role }: { role: "owner" | "kasir" }) {
  const [unit, setUnit] = React.useState<"gram" | "kg">("gram")
  const [weight, setWeight] = React.useState("1200")
  const [mode, setMode] = React.useState("non-cod")
  const [pick, setPick] = React.useState(0)
  const grams = unit === "gram" ? Number(weight) : Math.round(Number(weight.replace(",", ".")) * 1000)
  const guard = unit === "gram" ? Number(weight) > 0 && Number(weight) < 10 : Number(weight.replace(",", ".")) >= 100
  const q = quotes[pick]
  const total = q.price + 3000

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <form className="flex flex-col gap-6" onSubmit={(e) => e.preventDefault()} aria-label="Kiriman baru INV 8K4M2P7">
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-4 text-lg font-semibold">1. Tujuan dan berat</h2>
          <FieldGroup>
            <Field>
              <FieldLabel id="mode-label">Jenis pembayaran</FieldLabel>
              <ToggleGroup aria-labelledby="mode-label" value={[mode]} onValueChange={(v) => v[0] && setMode(String(v[0]))} variant="outline" spacing={0}>
                <ToggleGroupItem value="non-cod">Non-COD</ToggleGroupItem>
                <ToggleGroupItem value="cod">COD Barang</ToggleGroupItem>
                <ToggleGroupItem value="cod-ongkir">COD Ongkir</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel htmlFor="tujuan">Kecamatan tujuan</FieldLabel>
              <Input id="tujuan" defaultValue="Coblong, Kota Bandung 40132" />
            </Field>
            <Field data-invalid={guard || undefined}>
              <FieldLabel htmlFor="berat">Berat paket</FieldLabel>
              <div className="flex flex-wrap gap-2">
                <Input id="berat" inputMode="decimal" className="w-40 tabular-nums" value={weight} onChange={(e) => setWeight(e.target.value)} aria-invalid={guard || undefined} aria-describedby="berat-help" />
                <ToggleGroup aria-label="Satuan berat" value={[unit]} onValueChange={(v) => v[0] && setUnit(v[0] as "gram" | "kg")} variant="outline" spacing={0}>
                  <ToggleGroupItem value="gram">gram</ToggleGroupItem>
                  <ToggleGroupItem value="kg">kg</ToggleGroupItem>
                </ToggleGroup>
              </div>
              <FieldDescription id="berat-help" className={guard ? "text-warn" : undefined}>
                {guard
                  ? unit === "gram"
                    ? `Yakin ${weight} gram? Kalau maksudnya ${weight} kg, ganti satuan ke kg.`
                    : `Yakin ${weight} kg? Kalau maksudnya ${weight} gram, ganti satuan ke gram.`
                  : `= ${new Intl.NumberFormat("id-ID").format(grams)} g (${(grams / 1000).toLocaleString("id-ID")} kg) · Berat tagih 2 kg (volumetrik 30×20×15)`}
              </FieldDescription>
            </Field>
          </FieldGroup>
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-4 text-lg font-semibold">2. Pilih ekspedisi</h2>
          <fieldset>
            <legend className="sr-only">Ekspedisi</legend>
            <ul className="flex flex-col gap-2">
              {quotes.map((x, i) => (
                <li key={x.courier}>
                  <label className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 ${pick === i ? "border-primary bg-accent" : "border-input"}`}>
                    <input type="radio" name="kurir" className="size-5 accent-[var(--primary)]" checked={pick === i} onChange={() => setPick(i)} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium">{x.courier} · {x.service}</span>
                      <span className="text-sm text-muted-foreground">
                        {x.eta}
                        {x.tag ? ` · ${x.tag}` : ""}
                        {x.dropOnly ? " · Drop-off saja" : ""}
                      </span>
                    </span>
                    <span className="text-lg font-semibold tabular-nums">{rupiah(x.price)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-4 text-lg font-semibold">3. Pengirim dan penerima</h2>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="pengirim">Pengirim</FieldLabel>
              <Input id="pengirim" defaultValue="Toko Hijab Nisa · 0812-3456-7890" />
              <FieldDescription>WA terverifikasi · tercetak sebagai TOKO HIJAB NISA (Dropship Toko)</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="hp">HP penerima</FieldLabel>
              <Input id="hp" inputMode="tel" defaultValue="0857-2233-8821" />
              <FieldDescription>Riwayat aman: 6 kali terkirim, 0 retur</FieldDescription>
            </Field>
          </FieldGroup>
        </section>
      </form>

      <aside aria-label="Ringkasan dan pembayaran" className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-lg font-semibold">Ringkasan · <span className="font-mono">INV 8K4M2P7</span></h2>
          <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 tabular-nums">
            <dt className="text-muted-foreground">Ekspedisi</dt><dd className="text-right">{q.courier} {q.service}</dd>
            <dt className="text-muted-foreground">Berat tagih</dt><dd className="text-right">2 kg</dd>
            <dt className="text-muted-foreground">Ongkir</dt><dd className="text-right">{rupiah(q.price)}</dd>
            <dt className="text-muted-foreground">Asuransi</dt><dd className="text-right">–</dd>
            <dt className="text-muted-foreground">Kardus M</dt><dd className="text-right">{rupiah(3000)}</dd>
            {role === "owner" ? (<><dt className="text-muted-foreground">Modal gerai</dt><dd className="text-right">{rupiah(19200)}</dd></>) : null}
          </dl>
          <div className="mt-4 flex items-baseline justify-between border-t pt-4">
            <span className="text-lg font-semibold">Total bayar</span>
            <span className="text-[1.75rem] font-bold tabular-nums">{rupiah(total)}</span>
          </div>
        </section>
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-lg font-semibold">Pembayaran</h2>
          <ToggleGroup aria-label="Metode bayar" defaultValue={["tunai"]} variant="outline" spacing={0} className="flex-wrap">
            <ToggleGroupItem value="tunai">Tunai</ToggleGroupItem>
            <ToggleGroupItem value="qris">QRIS</ToggleGroupItem>
            <ToggleGroupItem value="transfer">Transfer</ToggleGroupItem>
            <ToggleGroupItem value="deposit">Deposit</ToggleGroupItem>
          </ToggleGroup>
          <Field className="mt-4">
            <FieldLabel htmlFor="diterima">Uang diterima</FieldLabel>
            <Input id="diterima" inputMode="numeric" defaultValue="50.000" className="tabular-nums" />
            <FieldDescription>Kembalian {rupiah(50000 - total)}</FieldDescription>
          </Field>
        </section>
        <div className="sticky bottom-0 -mx-4 border-t bg-card p-4 lg:static lg:mx-0 lg:rounded-lg lg:border">
          <Button size="lg" className="w-full">Bayar & Cetak · {rupiah(total)}</Button>
          <p className="mt-2 text-center text-sm text-muted-foreground">Cetak 58 mm label + struk · Ctrl+Enter</p>
        </div>
      </aside>
    </div>
  )
}
