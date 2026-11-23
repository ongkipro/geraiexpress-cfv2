import { useEffect, useMemo, useState } from "react"
import { BookOpenIcon, ChevronDownIcon, LifeBuoyIcon, MessageCircleIcon, SearchIcon } from "lucide-react"
import { Field, FieldLabel } from "../../components/ui/field"
import { Input } from "../../components/ui/input"
import { api } from "../../lib/api"
import { PageTitle } from "../../shell/states"
import { isOwner, useWorkspace } from "../../shell/workspace"
import { Panel, SectionCard } from "../../components/admin/page"
import { AnchorButton, LinkButton } from "../../components/admin/link-button"

// `Bantuan & Panduan` (visual 07 `/bantuan`): searchable guides (first setup, printer on PC, custom domain, COD flow,
// returns) and `Hubungi Bantuan` on WhatsApp (contact set by the platform; email as fallback).
interface Guide { id: string; title: string; steps: string[]; link?: { to: string; label: string; ownerOnly?: boolean } }
const GUIDES: Guide[] = [
  {
    id: "mulai",
    title: "Persiapan pertama gerai",
    steps: ["Lengkapi Profil Gerai: nama, WhatsApp, dan alamat jemput.", "Hubungkan akun Mengantar dan aktifkan webhook di Pengaturan › Mengantar.", "Pilih ekspedisi yang dipakai di Pengaturan › Ekspedisi Aktif.", "Undang kasir di Pengaturan › Anggota."],
    link: { to: "/pengaturan/profil", label: "Buka Profil Gerai", ownerOnly: true },
  },
  {
    id: "mengantar",
    title: "Masuk Seller Web Mengantar & Top-up Saldo",
    steps: [
      "Buka app.mengantar.com lalu masuk memakai email akun Mengantar yang Anda daftarkan.",
      "Bila akun dibuat otomatis oleh GeraiExpress dan belum punya kata sandi, klik Lupa Password di Mengantar untuk membuat kata sandi.",
      "Isi saldo Mengantar melalui menu Saldo / Top-up agar kiriman Non-COD langsung terbit resi otomatis.",
      "Untuk kabar status otomatis, salin URL webhook dari Pengaturan › Mengantar ke Integrasi Public API di Mengantar, lalu simpan Webhook Secret-nya.",
    ],
    link: { to: "/pengaturan/mengantar", label: "Buka Pengaturan Mengantar", ownerOnly: true },
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
    link: { to: "/pengaturan/mini-site", label: "Buka Pengaturan Mini-Site", ownerOnly: true },
  },
]

export function BantuanPage() {
  const w = useWorkspace()
  const owner = isOwner(w)
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
    ? <AnchorButton href={`https://wa.me/${support.whatsapp}`} target="_blank" rel="noopener noreferrer"><MessageCircleIcon aria-hidden /> Hubungi Bantuan</AnchorButton>
    : <AnchorButton href={`mailto:${support?.email ?? "bantuan@geraiexpress.com"}`}><MessageCircleIcon aria-hidden /> Hubungi Bantuan</AnchorButton>
  return (
    <div className="flex w-full max-w-4xl flex-col gap-4 pb-24 md:gap-5 md:pb-0">
      <PageTitle title="Bantuan & Panduan" description="Panduan singkat untuk pekerjaan sehari-hari di loket." />
      <Panel className="flex flex-col gap-2">
        <Field>
          <FieldLabel htmlFor="cari-panduan">Cari panduan</FieldLabel>
          <div className="relative">
            <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="cari-panduan" type="search" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="printer, COD, retur…" />
          </div>
        </Field>
      </Panel>
      <SectionCard title="Panduan" description={<span className="tabular-nums">{list.length} dari {GUIDES.length} panduan</span>} flush>
        {list.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground md:px-5">Tidak ada panduan yang cocok. Coba kata lain atau hubungi bantuan.</p> : null}
        <ul className="divide-y divide-slate-100">
          {list.map((g) => (
            <li key={g.id}>
              <details open={q.length > 0} className="group px-4 md:px-5">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 py-2 [&::-webkit-details-marker]:hidden">
                  <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-600"><BookOpenIcon className="size-4" /></span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-semibold text-slate-950">{g.title}</span>
                    <span className="text-xs text-muted-foreground">{g.steps.length} langkah</span>
                  </span>
                  <ChevronDownIcon aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="pb-4 pl-11">
                  <ol className="flex flex-col gap-2 text-sm">
                    {g.steps.map((s, i) => (
                      <li key={s} className="flex gap-2.5">
                        <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">{i + 1}</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                  {g.link && (!g.link.ownerOnly || owner) ? <LinkButton variant="outline" size="sm" className="mt-3" to={g.link.to}>{g.link.label}</LinkButton> : null}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </SectionCard>
      <Panel className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600"><LifeBuoyIcon className="size-4" /></span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-sm font-semibold md:text-base">Masih butuh bantuan?</h2>
            <p className="text-sm text-muted-foreground">Tim GeraiExpress siap membantu lewat WhatsApp atau email.</p>
          </div>
        </div>
        {contact}
      </Panel>
    </div>
  )
}
