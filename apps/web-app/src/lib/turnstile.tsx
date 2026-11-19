// Cloudflare Turnstile on the public auth forms (spec 05 §1, PR-01). The site key comes from the Worker
// (`GET /api/app/auth/config`): null locally with Cloudflare's test keys (no widget; a placeholder token is accepted
// only there), otherwise the explicit-render widget supplies the real token.
import { useCallback, useEffect, useState, type ReactNode } from "react"
import { api } from "./api"

type TurnstileApi = { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id: string) => void }
declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const DEV_TOKEN = "XXXX.DUMMY.TOKEN.XXXX"
let script: Promise<void> | null = null
function loadScript(): Promise<void> {
  script ??= new Promise((resolve, reject) => {
    const s = document.createElement("script")
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      script = null
      reject(new Error("turnstile"))
    }
    document.head.appendChild(s)
  })
  return script
}

/**
 * Returns the widget container ref, the current token (null until solved) and `reset()` for after a failed submit.
 * `ready` is false while the config loads or the widget has no token yet; forms disable submit until then.
 */
export function useTurnstile() {
  // Callback ref: the container element lives in state, so render never reads a ref object.
  const [el, setContainer] = useState<HTMLDivElement | null>(null)
  const [siteKey, setSiteKey] = useState<string | null | undefined>(undefined)
  const [token, setToken] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [widget, setWidget] = useState<string | null>(null)
  // DEC-250 Sol R1: the slot only takes space (and its gap) while the widget is visibly rendered (a challenge).
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!el) return
    const ro = new ResizeObserver(([e]) => setVisible((e?.contentRect.height ?? 0) > 0))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])

  useEffect(() => {
    api<{ turnstileSiteKey: string | null }>("/auth/config")
      .then((c) => setSiteKey(c.turnstileSiteKey))
      .catch(() => setFailed(true))
  }, [])

  useEffect(() => {
    if (!siteKey || !el) return
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !window.turnstile) return
        const id = window.turnstile.render(el, {
          sitekey: siteKey,
          language: "id",
          // DEC-250 (AUTH-MINIMALIST-STEP-UX-SPEC §1.3): the check runs silently; almost every visitor sees no box at
          // all, and a visitor Cloudflare must challenge gets a full-width widget that grows the slot only then.
          appearance: "interaction-only",
          size: "flexible",
          theme: "light",
          callback: (t: string) => setToken(t),
          "expired-callback": () => setToken(null),
          "error-callback": () => setToken(null),
        })
        setWidget(id)
      })
      .catch(() => setFailed(true))
    return () => {
      cancelled = true
      setWidget((id) => {
        if (id && window.turnstile) window.turnstile.remove(id)
        return null
      })
    }
  }, [siteKey, el])

  const reset = useCallback(() => {
    if (widget && window.turnstile) window.turnstile.reset(widget)
    if (siteKey) setToken(null)
  }, [widget, siteKey])
  const current = siteKey === null ? DEV_TOKEN : token
  // `hasWidget`: a real challenge is configured (none locally with the test keys), so forms show the security status.
  return { setContainer, token: current, ready: current !== null && siteKey !== undefined, failed, reset, hasWidget: Boolean(siteKey), visible }
}

/**
 * The widget slot and the submit as one gap-free block (DEC-250 Sol R1): a silent 0px widget adds no space; a visible
 * challenge sits right above the action with a 16px gap. DOM order = screen order.
 */
export function TurnstileAction({ slot, visible, children }: { slot: (el: HTMLDivElement | null) => void; visible: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <div ref={slot} data-turnstile-slot className={`w-full ${visible ? "mb-4" : ""}`} />
      {children}
    </div>
  )
}

/**
 * The one-line security status under a submit button (DEC-250): pending while the invisible check runs, verified once
 * the token is in; a fixed 16px line so the glyph swap never resizes (and re-centres) the card. Nothing locally (no widget) and nothing when the script failed (the form shows its own alert).
 */
export function SecurityStatus({ ts }: { ts: { hasWidget: boolean; ready: boolean; failed: boolean } }) {
  if (!ts.hasWidget || ts.failed) return null
  return (
    <p data-security-status data-state={ts.ready ? "ok" : "pending"} aria-live="polite" className="-mt-1 flex h-4 items-center justify-center gap-1.5 text-xs leading-4 font-medium text-[#64748B]">
      <span aria-hidden className={ts.ready ? "text-[#15803D]" : undefined}>{ts.ready ? "●" : "○"}</span>
      {ts.ready ? "Koneksi terverifikasi · Proteksi Cloudflare aktif" : "Memverifikasi koneksi aman…"}
    </p>
  )
}
