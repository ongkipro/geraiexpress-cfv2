import { useCallback, useEffect, useState } from "react"
import { api, ApiError } from "./api"

interface State<T> {
  key: string
  data: T | null
  error: string | null
}

/** Minimal loader with loading / error / retry states for console pages. */
export function useApi<T>(path: string | null) {
  const [tick, setTick] = useState(0)
  const key = `${path}#${tick}`
  const [state, setState] = useState<State<T>>({ key: "", data: null, error: null })
  const reload = useCallback(() => setTick((t) => t + 1), [])
  useEffect(() => {
    if (!path) return
    let alive = true
    api<T>(path)
      .then((d) => alive && setState({ key, data: d, error: null }))
      .catch((e) => alive && setState({ key, data: null, error: e instanceof ApiError ? e.body.message : "Gagal memuat data." }))
    return () => {
      alive = false
    }
  }, [path, key])
  const loading = state.key !== key
  return { data: loading ? null : state.data, error: loading ? null : state.error, loading, reload }
}
