// Cloudflare Turnstile on the public auth forms (spec 05 §1, PR-01). The site key comes from the Worker
// (`GET /api/app/auth/config`): null locally with Cloudflare's test keys (no widget; a placeholder token is accepted
// only there), otherwise the explicit-render widget supplies the real token.
import { useCallback, useEffect, useState } from "react"
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
          // DEC-248: fills the 380/440px form column (narrow screens included) inside a reserved 65px slot.
          size: "flexible",
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
  // `hasWidget`: a real challenge is configured, so forms reserve its slot (none locally with the test keys).
  return { setContainer, token: current, ready: current !== null && siteKey !== undefined, failed, reset, hasWidget: Boolean(siteKey) }
}
