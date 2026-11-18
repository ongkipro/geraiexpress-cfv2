import { useCallback, useEffect, useRef, useState } from "react"
import { ExternalLinkIcon, MonitorIcon, UnplugIcon } from "lucide-react"
import { Button } from "../../components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import { CopyField } from "../../components/admin/page"
import { LinkButton } from "../../components/admin/link-button"
import { api, ApiError } from "../../lib/api"

// Layar Pelanggan on the counter (TASK-701, spec 03 §5.5): pair a second window or a phone by QR, keep it in step
// with `/kasir`, unpair. The server builds every state the display shows; this side only sends customer inputs.
export const DISPLAY_CHANNEL = "gx-layar-pelanggan"

interface Status { paired: boolean; expiresAt: number | null; shiftBound: boolean; hasQris: boolean }
interface Pairing { pairUrl: string; expiresAt: number; shiftBound: boolean; hasQris: boolean; qrSvg: string }
export type DisplayInput = Record<string, unknown> & { kind: "idle" | "checkout" | "paid" }

/** Pairing status for this member + a debounced push that also tells a same-PC window at once. */
export function useCustomerDisplay(tenantSlug: string, input: DisplayInput) {
  const [status, setStatus] = useState<Status | null>(null)
  const refresh = useCallback(() => {
    api<Status>("/customer-display/status").then(setStatus).catch(() => undefined)
  }, [])
  useEffect(refresh, [refresh])
  const key = JSON.stringify(input)
  const last = useRef<string | null>(null)
  useEffect(() => {
    if (!status?.paired || last.current === key) return
    const id = setTimeout(() => {
      api<Status & { state: unknown }>("/customer-display/state", { body: JSON.parse(key) })
        .then((r) => {
          last.current = key
          try {
            const ch = new BroadcastChannel(DISPLAY_CHANNEL)
            ch.postMessage({ tenantSlug, state: r.state, updatedAt: Date.now() })
            ch.close()
          } catch {
            // No BroadcastChannel: the display still updates on its next poll.
          }
          if (!r.paired) setStatus((s) => (s ? { ...s, paired: false } : s))
        })
        .catch(() => undefined)
    }, 250)
    return () => clearTimeout(id)
  }, [key, status?.paired, tenantSlug])
  // A new pairing starts idle on the server: send the current state again.
  const onPaired = (s: Status) => {
    last.current = null
    setStatus(s)
  }
  return { status, refresh, onPaired }
}

export function CustomerDisplayButton({ display, owner }: { display: ReturnType<typeof useCustomerDisplay>; owner: boolean }) {
  const [open, setOpen] = useState(false)
  const [pairing, setPairing] = useState<Pairing | null>(null)
  const [pending, setPending] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const paired = display.status?.paired === true

  async function pair() {
    if (pending) return
    setPending(true)
    setMsg(null)
    try {
      const p = await api<Pairing>("/customer-display/pair", { body: {} })
      setPairing(p)
      display.onPaired({ paired: true, expiresAt: p.expiresAt, shiftBound: p.shiftBound, hasQris: p.hasQris })
    } catch (err) {
      setMsg(err instanceof ApiError ? err.body.message : "Gagal membuat kode layar. Coba lagi.")
    } finally {
      setPending(false)
    }
  }
  async function unpair() {
    if (pending) return
    setPending(true)
    setMsg(null)
    try {
      display.onPaired(await api<Status>("/customer-display/unpair", { body: {} }))
      setPairing(null)
    } catch (err) {
      setMsg(err instanceof ApiError ? err.body.message : "Gagal memutuskan layar. Coba lagi.")
    } finally {
      setPending(false)
    }
  }
  const hasQris = pairing?.hasQris ?? display.status?.hasQris ?? false
  const until = (pairing?.expiresAt ?? display.status?.expiresAt) ? new Date(pairing?.expiresAt ?? display.status!.expiresAt!).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : null

  return (
    <>
      <Button type="button" variant="outline" onClick={() => { setOpen(true); display.refresh() }} aria-label={`Layar Pelanggan${paired ? " (terhubung)" : ""}`}>
        <MonitorIcon aria-hidden />
        Layar Pelanggan
        <span aria-hidden className={`size-2 rounded-full ${paired ? "bg-emerald-500" : "bg-slate-300"}`} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Layar Pelanggan</DialogTitle>
            <DialogDescription>Tampilkan rincian ongkir, total dan QRIS gerai ke pelanggan di layar kedua atau tablet/HP loket. Biaya modal dan laba tidak pernah tampil.</DialogDescription>
          </DialogHeader>
          {pairing ? (
            <div className="flex flex-col gap-4">
              <div className="mx-auto w-full max-w-[220px] rounded-xl border border-slate-200 bg-white p-2">
                <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(pairing.qrSvg)}`} alt="QR untuk memasangkan layar pelanggan" className="aspect-square w-full" />
              </div>
              <p className="text-center text-xs text-muted-foreground">Pindai dengan kamera tablet/HP loket, atau buka tautan di jendela kedua PC ini.</p>
              <CopyField label="Tautan layar" value={pairing.pairUrl} />
              <Button type="button" onClick={() => window.open(pairing.pairUrl, "_blank", "noopener")}>
                <ExternalLinkIcon aria-hidden /> Buka di Jendela Baru
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {paired ? (
                <p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  <span aria-hidden className="size-2 rounded-full bg-emerald-500" />
                  Layar pelanggan terhubung{until ? ` sampai ${until}` : ""}{display.status?.shiftBound ? " atau sampai shift ditutup" : ""}.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Belum ada layar yang terhubung. Buat kode baru untuk memasangkan layar.</p>
              )}
              <Button type="button" onClick={pair} disabled={pending}>{pending ? "Memproses…" : paired ? "Buat Kode Baru" : "Pasangkan Layar"}</Button>
              {paired ? <p className="text-xs text-muted-foreground">Kode baru memutus layar yang lama.</p> : null}
            </div>
          )}
          {!hasQris ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
              QRIS gerai belum diunggah, jadi layar menampilkan “Tunjukkan kode QRIS gerai di meja kasir”.
              {owner ? <> Unggah di <LinkButton variant="link" size="sm" className="h-auto p-0 text-xs" to="/pengaturan/printer">Pengaturan › Printer &amp; Struk</LinkButton>.</> : " Minta pemilik mengunggahnya."}
            </p>
          ) : null}
          {msg ? <p role="alert" className="text-sm text-danger">{msg}</p> : null}
          {paired ? (
            <Button type="button" variant="outline" onClick={unpair} disabled={pending} className="text-danger">
              <UnplugIcon aria-hidden /> Putuskan Layar
            </Button>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
