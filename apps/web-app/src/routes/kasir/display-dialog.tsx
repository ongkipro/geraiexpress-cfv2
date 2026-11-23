import { useCallback, useEffect, useRef, useState } from "react"
import { ExternalLinkIcon, MonitorIcon, UnplugIcon } from "lucide-react"
import { Button } from "../../components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import { CopyField } from "../../components/admin/page"
import { LinkButton } from "../../components/admin/link-button"
import { api, ApiError } from "../../lib/api"
import { createPublisher, DISPLAY_CHANNEL, type DisplayHint } from "./display-sync"

// Layar Pelanggan on the counter (TASK-701, spec 03 §5.5): pair a second window or a phone by QR, keep it in step
// with `/kasir`, unpair. The server builds every state the display shows; this side only sends ids and amounts.

interface Status { paired: boolean; pairId: string | null; seq: number; expiresAt: number | null; shiftBound: boolean; hasQris: boolean }
interface Pairing { pairUrl: string; pairId: string; seq: number; expiresAt: number; shiftBound: boolean; hasQris: boolean; qrSvg: string }
export type DisplayInput = Record<string, unknown> & { kind: "idle" | "checkout" | "paid" }

/** A 4xx answer will not heal by itself (validation, pairing gone); only network failures and 5xx are retried. */
const permanent = (e: unknown) => e instanceof ApiError && e.status >= 400 && e.status < 500

/**
 * Pairing status for this member + a debounced declaration of the current input to one publisher. Every input change
 * reaches `publish()` — the publisher alone decides what is already on the server (Sol R3-F1). The key is pairing AND
 * input, so a new pairing (`Buat Kode Baru`) on an unchanged checkout publishes it at once (R1 F3). Numbering starts
 * above the pairing's stored mark from status/pair/state answers (R3-F2). A same-PC display is told to refresh through
 * the channel — it then reads its own view; the message carries no state (F2).
 */
export function useCustomerDisplay(tenantSlug: string, input: DisplayInput) {
  const [status, setStatus] = useState<Status | null>(null)
  // The highest stored publication mark seen from the server (status, pair, state answers); the publisher's floor.
  const serverSeq = useRef(0)
  const adopt = useCallback((s: Status) => {
    if (typeof s.seq === "number") serverSeq.current = Math.max(serverSeq.current, s.seq)
    setStatus(s)
  }, [])
  // Release-gate finding: a status read started before a pair/unpair/state answer must not overwrite it. Every
  // authoritative answer bumps the generation; a status answer from an older generation is dropped.
  const generation = useRef(0)
  const refresh = useCallback(() => {
    const g = ++generation.current
    api<Status>("/customer-display/status")
      .then((s) => {
        if (g === generation.current) adopt(s)
      })
      .catch(() => undefined)
  }, [adopt])
  const authoritative = useCallback(
    (s: Status) => {
      generation.current++
      adopt(s)
    },
    [adopt],
  )
  useEffect(refresh, [refresh])
  const key = JSON.stringify(input)
  const pairId = status?.paired ? status.pairId : null
  const slug = useRef(tenantSlug)
  useEffect(() => {
    slug.current = tenantSlug
  }, [tenantSlug])
  // One publisher per mounted counter (created before the publishing effect below runs; stopped on unmount).
  const publisher = useRef<ReturnType<typeof createPublisher<{ pairId: string; key: string }>> | null>(null)
  useEffect(() => {
    const p = createPublisher<{ pairId: string; key: string }>({
      keyOf: ({ pairId: pid, key: k }) => `${pid}|${k}`,
      floor: () => serverSeq.current,
      send: async ({ pairId: pid, key: k }, seq) => {
        try {
          const r = await api<Status & { stale?: boolean }>("/customer-display/state", { body: { ...(JSON.parse(k) as object), seq } })
          if (typeof r.seq === "number") serverSeq.current = Math.max(serverSeq.current, r.seq)
          if (!r.paired) {
            generation.current++
            setStatus((s) => (s ? { ...s, paired: false, pairId: null } : s))
          }
          if (r.stale) return { applied: false, seq: r.seq ?? null }
          try {
            const ch = new BroadcastChannel(DISPLAY_CHANNEL)
            ch.postMessage({ tenantSlug: slug.current, pairId: pid } satisfies DisplayHint)
            ch.close()
          } catch {
            // No BroadcastChannel: the display still updates on its next poll.
          }
          return { applied: true, seq: r.seq ?? null }
        } catch (e) {
          if (!permanent(e)) throw e
          return null
        }
      },
    })
    publisher.current = p
    return () => {
      p.stop()
      publisher.current = null
    }
  }, [])
  useEffect(() => {
    if (!pairId) return
    const id = setTimeout(() => publisher.current?.publish({ pairId, key }), 250)
    return () => clearTimeout(id)
  }, [key, pairId])
  const onPaired = authoritative
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
      display.onPaired({ paired: true, pairId: p.pairId, seq: p.seq, expiresAt: p.expiresAt, shiftBound: p.shiftBound, hasQris: p.hasQris })
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
  const until = (pairing?.expiresAt ?? display.status?.expiresAt) ? `${new Date(pairing?.expiresAt ?? display.status!.expiresAt!).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })} WIB` : null

  return (
    <>
      <Button type="button" variant="outline" onClick={() => { setOpen(true); display.refresh() }} aria-label={`Layar Pelanggan${paired ? " (terhubung)" : ""}`}>
        <MonitorIcon aria-hidden />
        Layar Pelanggan
        <span aria-hidden className={`size-2 rounded-full ${paired ? "bg-emerald-500" : "bg-slate-300"}`} />
      </Button>
      {/* Closing drops the one-time QR view: reopening shows the pairing status with `Buat Kode Baru` (Sol R1 F3 path). */}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setPairing(null)
        }}
      >
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
              <Button
                type="button"
                onClick={() => {
                  const win = window.open(pairing.pairUrl, "_blank", "noopener")
                  if (!win) setMsg("Browser memblokir jendela baru. Salin tautan layar di atas lalu buka di tab baru.")
                }}
              >
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
