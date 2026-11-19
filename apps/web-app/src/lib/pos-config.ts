// POS defaults shared by the quote form, the pickup chip and Paket Massal (DEC-225, DEC-251): one `/pos-config`
// request per page load, shared by every consumer on the screen.
import { useEffect, useState } from "react"
import { api } from "./api"

export interface PosOutlet { name: string; streetAddress: string | null; areaLabel: string | null }
export interface PosConfig { packingItems: Array<{ name: string; priceIdr: number }>; serviceFeeIdr: number | null; showCommission: boolean; outlet: PosOutlet | null }

const EMPTY: PosConfig = { packingItems: [], serviceFeeIdr: null, showCommission: false, outlet: null }
let inflight: Promise<PosConfig> | null = null

/** Fetch once while the request is in flight; a later mount (a new screen) asks again so settings edits show up. */
export function loadPosConfig(): Promise<PosConfig> {
  inflight ??= api<PosConfig>("/pos-config")
    .catch(() => EMPTY)
    .finally(() => setTimeout(() => (inflight = null), 0))
  return inflight
}

/** `null` while loading; on failure the empty defaults (no packing, no fee, no outlet). */
export function usePosConfig(): PosConfig | null {
  const [cfg, setCfg] = useState<PosConfig | null>(null)
  useEffect(() => {
    let alive = true
    void loadPosConfig().then((c) => alive && setCfg(c))
    return () => {
      alive = false
    }
  }, [])
  return cfg
}
