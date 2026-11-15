import { useId, useState, type FormEvent, type ReactNode } from "react"
import { Button } from "@shared/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@shared/components/ui/field"
import { api, ApiError } from "../lib/api"

/**
 * Sensitive Super Admin action: reason required, TOTP within 15 minutes (server-side `owner_recent`). When the server
 * answers TOTP_RECENT_REQUIRED, the operator is sent to re-confirm TOTP (visual 07 §2 banner).
 */
export function ReasonAction(props: {
  label: string
  confirmLabel: string
  path: string
  extra?: Record<string, unknown>
  variant?: "default" | "outline" | "destructive"
  onDone: (data: unknown) => void
  hint?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const data = await api(props.path, { body: { ...props.extra, reason } })
      setOpen(false)
      setReason("")
      props.onDone(data)
    } catch (err) {
      if (err instanceof ApiError && err.body.code === "TOTP_RECENT_REQUIRED") {
        window.location.assign(`/totp?mode=required&kembali=${encodeURIComponent(window.location.pathname)}`)
        return
      }
      setError(err instanceof ApiError ? err.body.message : "Terjadi kesalahan. Silakan coba lagi.")
    } finally {
      setPending(false)
    }
  }

  if (!open) {
    return (
      <Button variant={props.variant ?? "default"} onClick={() => setOpen(true)}>
        {props.label}
      </Button>
    )
  }
  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-3 border-t pt-4" noValidate>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={id}>Alasan (wajib, dicatat di log audit)</FieldLabel>
        <textarea
          id={id}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          className="min-h-24 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-invalid={error ? true : undefined}
        />
        {props.hint ? <FieldDescription>{props.hint}</FieldDescription> : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={props.variant === "destructive" ? "destructive" : "default"} disabled={pending || reason.trim().length < 5}>
          {pending ? "Memproses…" : props.confirmLabel}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
          Batal
        </Button>
      </div>
    </form>
  )
}
