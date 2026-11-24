import { useId, useState, type FormEvent, type ReactNode } from "react"
import { toast } from "@shared/components/ui/sonner"
import { Button } from "@shared/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@shared/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@shared/components/ui/field"
import { Textarea } from "@shared/components/ui/textarea"
import { api, ApiError } from "../lib/api"

/**
 * Sensitive Super Admin action (DEC-236: shadcn Dialog + Textarea): reason required, TOTP within 15 minutes
 * (server-side `owner_recent`). When the server answers TOTP_RECENT_REQUIRED, the operator is sent to re-confirm TOTP
 * (visual 07 §2 banner). Focus returns to the trigger when the dialog closes.
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
      toast.success(`${props.label} berhasil dicatat.`)
      props.onDone(data)
    } catch (err) {
      if (err instanceof ApiError && err.body.code === "TOTP_RECENT_REQUIRED") {
        window.location.assign(`/totp?mode=required&kembali=${encodeURIComponent(window.location.pathname + window.location.search)}`)
        return
      }
      setError(err instanceof ApiError ? err.body.message : "Terjadi kesalahan. Silakan coba lagi.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return
        setOpen(o)
        if (!o) setError(null)
      }}
    >
      <DialogTrigger render={<Button variant={props.variant ?? "default"} className="h-auto min-h-11 py-2 text-center whitespace-normal md:h-9 md:py-0" />}>{props.label}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{props.label}</DialogTitle>
            <DialogDescription>Tindakan ini dicatat di log audit beserta alasan Anda.</DialogDescription>
          </DialogHeader>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor={id}>Alasan (wajib, dicatat di log audit)</FieldLabel>
            <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} aria-invalid={error ? true : undefined} />
            {props.hint ? <FieldDescription>{props.hint}</FieldDescription> : null}
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Batal
            </Button>
            <Button type="submit" variant={props.variant === "destructive" ? "destructive" : "default"} disabled={pending || reason.trim().length < 5}>
              {pending ? "Memproses…" : props.confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
