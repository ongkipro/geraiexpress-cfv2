import { useState } from "react"
import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react"
import { Button } from "@shared/components/ui/button"

// DEC-246: the one-time view of 8 recovery codes (`/totp` after the first enrolment, `/akun` after a new set). The codes
// live only in this component's props; nothing is stored in the browser.
const fileText = (codes: string[], email?: string) =>
  [
    "GeraiExpress — Kode Pemulihan Cadangan Super Admin",
    email ? `Akun: ${email}` : null,
    `Dibuat: ${new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(Date.now())} WIB`,
    "",
    "Setiap kode hanya bisa dipakai sekali, sebagai pengganti kode TOTP saat aplikasi autentikator tidak bisa diakses.",
    "Simpan di tempat aman (pengelola kata sandi atau kertas di brankas), jangan di HP yang sama dengan autentikator.",
    "",
    ...codes.map((c, i) => `${String(i + 1).padStart(2, " ")}. ${c}`),
    "",
  ]
    .filter((l) => l !== null)
    .join("\n")

export function RecoveryCodesBox({ codes, email }: { codes: string[]; email?: string }) {
  const [copied, setCopied] = useState(false)
  function download() {
    const url = URL.createObjectURL(new Blob([fileText(codes, email)], { type: "text/plain;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url
    a.download = "kode-pemulihan-geraiexpress.txt"
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <div className="flex flex-col gap-3">
      <ol aria-label="Kode pemulihan cadangan" className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-sm tabular-nums text-slate-900 sm:text-base">
        {codes.map((c, i) => (
          <li key={c} className="flex items-baseline gap-2 rounded-md bg-white px-2.5 py-1.5 tracking-wider">
            <span aria-hidden className="w-4 text-right text-xs text-muted-foreground">{i + 1}</span>
            <span>{c}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(codes.join("\n")).catch(() => undefined)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        >
          {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
          {copied ? "Tersalin" : "Salin Semua"}
        </Button>
        <Button type="button" variant="outline" onClick={download}>
          <DownloadIcon aria-hidden /> Unduh .txt
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Setiap kode hanya berlaku sekali. Kode ini tidak akan ditampilkan lagi.</p>
    </div>
  )
}
