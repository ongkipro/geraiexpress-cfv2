// Shipment status = two order-independent projections + one pure combine (spec 01 §3). Provider observations are
// reduced to the maximum key (is_terminal, minute_bucket, rank); custody is a monotone local maximum; the effective
// status = combine(provider, custody). Both inputs are maxima, so arrival order and restarts never change the result.

export type ProviderStatus = "ready_for_pickup" | "in_transit" | "undelivery_hold" | "rts_in_transit" | "provider_returned" | "cancelled" | "lost" | "delivered"
export type CustodyStage = "none" | "handed_to_courier" | "rts_at_gerai" | "rts_returned_to_sender" | "cancelled_local"
export type EffectiveStatus = ProviderStatus | "handed_to_courier" | "rts_at_gerai" | "rts_returned_to_sender" | "none"

export const PROVIDER_RANK: Record<ProviderStatus, number> = {
  ready_for_pickup: 10,
  in_transit: 30,
  undelivery_hold: 40,
  rts_in_transit: 50,
  provider_returned: 60,
  cancelled: 90,
  lost: 91,
  delivered: 92,
}
const TERMINAL = new Set<ProviderStatus>(["cancelled", "lost", "delivered"])
export const CUSTODY_LEVEL: Record<CustodyStage, number> = { none: 0, handed_to_courier: 1, rts_at_gerai: 2, rts_returned_to_sender: 3, cancelled_local: 3 }

export interface ProviderObservation {
  status: ProviderStatus
  /** UTC epoch ms. */
  eventAt: number
}

export interface ProviderKey {
  terminal: 0 | 1
  bucket: number
  rank: number
}

export const keyOf = (o: ProviderObservation): ProviderKey => ({ terminal: TERMINAL.has(o.status) ? 1 : 0, bucket: Math.floor(o.eventAt / 60_000), rank: PROVIDER_RANK[o.status] })

export function compareKeys(a: ProviderKey, b: ProviderKey): number {
  return a.terminal - b.terminal || a.bucket - b.bucket || a.rank - b.rank
}

/** The provider projection: the observation with the largest key (a maximum over a total order). */
export function reduceProvider(current: ProviderObservation | null, next: ProviderObservation): ProviderObservation {
  if (!current) return next
  return compareKeys(keyOf(next), keyOf(current)) > 0 ? next : current
}

// Total order used by the reducer: level first; at the shared top level a verified physical handback outranks a
// local cancel, so the maximum is the same in every arrival order.
const CUSTODY_ORDER: Record<CustodyStage, number> = { none: 0, handed_to_courier: 1, rts_at_gerai: 2, cancelled_local: 3, rts_returned_to_sender: 4 }

/** Custody never decreases; `cancelled_local` and `rts_returned_to_sender` share level 3 (tie → handback wins). */
export function reduceCustody(current: CustodyStage, next: CustodyStage): CustodyStage {
  return CUSTODY_ORDER[next] > CUSTODY_ORDER[current] ? next : current
}

export interface Combined {
  status: EffectiveStatus
  conflict: boolean
}

/** spec 01 §3 combine table. */
export function combine(provider: ProviderStatus | null, custody: CustodyStage): Combined {
  const rank = provider ? PROVIDER_RANK[provider] : 0
  switch (custody) {
    case "rts_returned_to_sender":
      return { status: "rts_returned_to_sender", conflict: provider === "delivered" || provider === "lost" }
    case "cancelled_local":
      return { status: "cancelled", conflict: provider === "delivered" || provider === "lost" || rank >= 30 }
    case "rts_at_gerai":
      return { status: "rts_at_gerai", conflict: provider === "delivered" || provider === "lost" }
    case "handed_to_courier":
      return { status: provider && rank >= 30 ? provider : "handed_to_courier", conflict: false }
    case "none":
      return { status: provider ?? "none", conflict: false }
  }
}

/**
 * Maps a Mengantar `status_category` (webhook) or history `statusCategory` (polling) to a provider status.
 * Both spellings of cancellation are handled; unknown categories return null (kept in history, no transition).
 */
export function mapMengantarCategory(raw: string | null | undefined): ProviderStatus | null {
  const c = (raw ?? "").trim().toUpperCase()
  switch (c) {
    case "PENDING PICKUP":
    case "ACTIVE":
    case "ACTIVE/WAITING NEXT PROCESS":
    case "PICKUP FAILED":
      return "ready_for_pickup"
    case "PICKED UP":
    case "ON DELIVERY":
    case "DELIVERY COURIER":
      return "in_transit"
    case "UNDELIVERED":
      return "undelivery_hold"
    case "RTS":
    case "RETURN":
    case "ON RETURN":
      return "rts_in_transit"
    case "RETURNED":
    case "RTS DELIVERED":
    case "RETURN DELIVERED":
      return "provider_returned"
    case "CANCELED":
    case "CANCELLED":
      return "cancelled"
    case "LOST":
      return "lost"
    case "DELIVERED":
      return "delivered"
    default:
      return null
  }
}

/** Polling `history[].date` `DD-MM-YYYY HH:mm` in Asia/Jakarta (UTC+7, no DST) → UTC epoch ms; null when malformed. */
export function parseJakartaMinute(text: string): number | null {
  const m = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})$/.exec(text.trim())
  if (!m) return null
  const [, dd, mm, yyyy, hh, mi] = m.map(Number) as [number, number, number, number, number, number]
  const ms = Date.UTC(yyyy, mm - 1, dd, hh - 7, mi)
  const d = new Date(ms + 7 * 3600_000)
  if (d.getUTCDate() !== dd || d.getUTCMonth() !== mm - 1 || d.getUTCHours() !== hh) return null
  return ms
}
