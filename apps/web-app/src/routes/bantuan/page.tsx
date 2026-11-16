import { useEffect, useMemo, useState } from "react"
import { Link } from "@tanstack/react-router"
import { MessageCircleIcon, SearchIcon } from "lucide-react"
import { Field, FieldLabel } from "../../components/ui/field"
import { Input } from "../../components/ui/input"
import { api } from "../../lib/api"
import { PageTitle } from "../../shell/states"
import { Panel } from "../../components/admin/page"

// `Bantuan & Panduan` (visual 07 `/bantuan`): searchable guides (first setup, printer on PC, custom domain, COD flow,
// returns) and `Hubungi Bantuan` on WhatsApp (contact set by the platform; email as fallback).
interface Guide { id: string; title: string; steps: string[]; link?: { to: string; label: string } }
const GUIDES: Guide[] = [
  {
    id: "mulai",
    title: "Persiapan pertama gerai",
    steps: ["Lengkapi Profil Gerai: nama, WhatsApp, dan alamat jemput.", "Hubungkan akun Mengantar dan aktifkan webhook di Pengaturan › Mengantar.", "Pilih ekspedisi yang dipakai di Pengaturan › Ekspedisi Aktif.", "Undang kasir di Pengaturan › Anggota.", "Buka Shift Loket sebelum menerima uang tunai."],
    link: { to: "/pengaturan/profil", label: "Buka Profil Gerai" },
  },
  {
    id: "printer",
    title: "Printer thermal 100 mm di PC",
    steps: ["Pasang driver printer dari pabrikannya, lalu tes cetak dari Windows.", "Di pengaturan driver, buat ukuran kertas 100×150 mm (atau 100×100 mm sesuai label).", "Saat dialog cetak muncul, pilih printer thermal, ukuran kertas yang sama, dan skala 100% (Ukuran sebenarnya).", "Matikan header/footer browser dan margin.", "Bila barcode pudar, pilih ketebalan Tebal di Pengaturan › Printer & Struk."],
    link: { to: "/pengaturan/printer", label: "Buka Printer & Struk" },
  },
  {
    id: "cod",
    title: "Alur kiriman COD",
    steps: ["Verifikasi WhatsApp pengirim sebelum membuat kiriman COD.", "Pilih mode COD saat cek ongkir; sistem menghitung biaya COD dari Mengantar.", "Kurir menagih pembeli; dana COD masuk ke saldo Mengantar setelah paket diterima.", "Bayarkan hak COD pengirim setelah dana cair (Kiriman › detail INV › Cairkan ke Pengirim).", "Pemilik bisa membayar lebih dulu dengan alasan bila diperlukan."],
  },
  {
    id: "retur",
    title: "Paket retur",
    steps: ["Paket retur kembali ke alamat gerai, bukan ke pengirim.", "Cek status retur di Kiriman.", "Serahkan paket ke pengirim asli setelah identitasnya dicocokkan.", "Biaya retur dipotong dari saldo Mengantar sesuai tagihan ekspedisi."],
  },
  {
    id: "domain",
    title: "Domain sendiri untuk mini-site",
    steps: ["Siapkan domain atau subdomain milik gerai.", "Tambahkan domain di Pengaturan › Mini-Site (paket Pro).", "Buat record DNS sesuai petunjuk yang muncul, lalu tunggu verifikasi.", "Sertifikat HTTPS dibuat otomatis setelah DNS benar."],
  },
]

export function BantuanPage() {
  const [q, setQ] = useState("")
  const [support, setSupport] = useState<{ whatsapp: string | null; email: string } | null>(null)
  useEffect(() => {
    api<{ whatsapp: string | null; email: string }>("/support").then(setSupport).catch(() => setSupport({ whatsapp: null, email: "bantuan@geraiexpress.com" }))
  }, [])
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return GUIDES.filter((g) => words.every((w) => `${g.title} ${g.steps.join(" ")}`.toLowerCase().includes(w)))
  }, [q])
  const contact = support?.whatsapp
    ? <a href={`https://wa.me/${support.whatsapp}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground md:h-10"><MessageCircleIcon aria-hidden className="size-4" /> Hubungi Bantuan</a>
    : <a href={`mailto:${support?.email ?? "bantuan@geraiexpress.com"}`} className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground md:h-10">Hubungi Bantuan</a>
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 pb-24 md:pb-0">
      <PageTitle title="Bantuan & Panduan">{contact}</PageTitle>
      <Field>
        <FieldLabel htmlFor="cari-panduan">Cari panduan</FieldLabel>
        <div className="relative">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="cari-panduan" type="search" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="printer, COD, retur…" />
        </div>
      </Field>
      {list.length === 0 ? <p className="text-base text-muted-foreground">Tidak ada panduan yang cocok. Coba kata lain atau hubungi bantuan.</p> : null}
      <div className="flex flex-col gap-3">
        {list.map((g) => (
          <Panel as="details" key={g.id} open={q.length > 0}>
            <summary className="flex min-h-11 cursor-pointer items-center text-lg font-semibold">{g.title}</summary>
            <ol className="mt-3 flex list-decimal flex-col gap-2 pl-6 text-base">
              {g.steps.map((s) => <li key={s}>{s}</li>)}
            </ol>
            {g.link ? <Link to={g.link.to} className="mt-3 inline-flex text-base text-primary underline-offset-4 hover:underline">{g.link.label}</Link> : null}
          </Panel>
        ))}
      </div>
    </div>
  )
}
