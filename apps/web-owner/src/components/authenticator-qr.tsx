import { useMemo } from "react"
import { renderSVG } from "uqr"

/** Enrolment QR + the typed key fallback (first enrolment on `/totp`, DEC-246 rotation on `/totp` and `/akun`). */
export function AuthenticatorQr({ otpauthUri, secret, label = "Kode QR pendaftaran TOTP" }: { otpauthUri: string; secret: string; label?: string }) {
  const qr = useMemo(() => renderSVG(otpauthUri, { border: 2 }), [otpauthUri])
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="size-48" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: qr }} />
      <p className="text-center text-base md:text-sm text-muted-foreground">
        Tidak bisa memindai? Masukkan kunci ini: <span className="font-mono text-foreground break-all">{secret}</span>
      </p>
    </div>
  )
}
