// Stale-chunk recovery after a fresh Cloudflare Assets deploy: when an already-open SPA tab tries to load a lazy
// route whose hashed JS/CSS chunk was replaced, reload once cleanly (guarded by a 15 s sessionStorage cooldown so it
// can never loop).
const RELOAD_KEY = "gx:chunk-reload"
const COOLDOWN_MS = 15_000

const CHUNK_ERR_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading chunk [\w-]+ failed/i

export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  return CHUNK_ERR_RE.test(msg)
}

/** Triggers a single safe reload when a stale chunk is detected; returns false if already attempted recently. */
export function recoverFromChunkError(): boolean {
  if (typeof window === "undefined") return false
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? "0")
    if (Number.isFinite(last) && Date.now() - last < COOLDOWN_MS) return false
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // Private mode / blocked storage: still attempt a reload once via location.reload.
  }
  window.location.reload()
  return true
}

/** Vite's official hook for failed module/CSS preloads after a new deployment. */
export function installChunkRecovery(): void {
  if (typeof window === "undefined") return
  window.addEventListener("vite:preloadError", (event) => {
    if (recoverFromChunkError()) event.preventDefault()
  })
}
