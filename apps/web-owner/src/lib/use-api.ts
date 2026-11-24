import { useCallback, useEffect, useState } from "react"
import { api, ApiError } from "./api"

interface State<T> {
  key: string
  path: string | null
  data: T | null
  error: string | null
  errorCode: string | null
}

// Stale-while-revalidate cache so switching tabs or reloading console pages never unmounts forms or flashes skeletons.
const apiCache = new Map<string, unknown>()

/** Loader with stale-while-revalidate, non-destructive reload, errorCode, and retry states for console pages. */
export function useApi<T>(path: string | null, opts: { keepPrevious?: boolean } = {}) {
  const [tick, setTick] = useState(0)
  const key = `${path}#${tick}`
  const [state, setState] = useState<State<T>>(() => {
    const cached = path ? ((apiCache.get(path) as T | undefined) ?? null) : null
    return { key: "", path, data: cached, error: null, errorCode: null }
  })
  const reload = useCallback(() => setTick((t) => t + 1), [])
  useEffect(() => {
    if (!path) return
    let alive = true
    api<T>(path)
      .then((d) => {
        if (!alive) return
        apiCache.set(path, d)
        setState({ key, path, data: d, error: null, errorCode: null })
      })
      .catch((e) => {
        if (!alive) return
        setState((prev) => ({
          key,
          path,
          data: prev.path === path ? prev.data : null,
          error: e instanceof ApiError ? e.body.message : "Gagal memuat data.",
          errorCode: e instanceof ApiError ? e.body.code : null,
        }))
      })
    return () => {
      alive = false
    }
  }, [path, key])

  const fetching = Boolean(path) && state.key !== key
  const samePath = state.path === path
  const cachedForPath = path ? ((apiCache.get(path) as T | undefined) ?? null) : null
  const data = samePath && state.data !== null ? state.data : cachedForPath ?? (opts.keepPrevious ? state.data : null)
  const error = !fetching && samePath ? state.error : null
  const errorCode = !fetching && samePath ? state.errorCode : null
  const loading = fetching && data === null
  const refreshing = fetching && data !== null
  return { data, error, errorCode, loading, refreshing, reload }
}
