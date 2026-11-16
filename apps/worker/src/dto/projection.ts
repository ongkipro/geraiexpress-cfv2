// Role projection (AGENTS.md §3.4, DEC-209, spec 05 §1): the server strips seller cost, discount, margin, cashback and
// Mengantar balance from every response for `cashier`. Hiding with CSS is not enough, so every app route that returns
// money-bearing objects passes them through `projectFor(role, value)` before serialising.
export type AppRole = "gerai_admin" | "cashier"

/** Field names never sent to a cashier (exact keys, at any depth). Extend here when a new owner-only field appears. */
export const OWNER_ONLY_KEYS: ReadonlySet<string> = new Set([
  // seller cost / provider net (spec 02 §3.1)
  "provider_net_shipping_idr",
  "providerNetShippingIdr",
  "gerai_shipping_cost_idr",
  "geraiShippingCostIdr",
  "effective_gerai_cost_idr",
  "estimated_margin_idr",
  "estimated_profit_idr",
  "expected_provider_cod_credit_idr",
  "provider_observed_discount_bps",
  "assigned_gerai_discount_bps",
  "raw_discount_percent",
  "provider_reconciled_cost_idr",
  "estimatedSpecialPrice",
  // discount / spread / margin
  "assigned_bps",
  "assignedBps",
  "observed_bps",
  "observedBps",
  "discount_bps",
  "discountBps",
  "discountPercent",
  "gerai_discount_bps",
  "margin_idr",
  "marginIdr",
  "outlet_margin_idr",
  "estimated_profit_idr",
  "estimatedProfitIdr",
  "tariff_gap_idr",
  "cashback_bps",
  "cashbackBps",
  "cashback_idr",
  // reseller deposit (visual 07 `/kontak/pengirim`: deposit column owner only)
  "deposit_balance_idr",
  "depositBalanceIdr",
  // Mengantar account balance
  "synced_balance_idr",
  "syncedBalanceIdr",
  "balance_idr",
  "balanceIdr",
  "mengantar_balance_idr",
])

/** Owner: unchanged. Cashier: a deep copy without owner-only keys. Never mutates the input. */
export function projectFor<T>(role: AppRole, value: T): T {
  if (role === "gerai_admin") return value
  return strip(value) as T
}

function strip(v: unknown, depth = 0): unknown {
  if (depth > 12 || v === null || typeof v !== "object") return v
  if (Array.isArray(v)) return v.map((x) => strip(x, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (!OWNER_ONLY_KEYS.has(k)) out[k] = strip(x, depth + 1)
  return out
}

/** Test helper / runtime guard: the owner-only keys found anywhere in a value (empty = safe for a cashier). */
export function ownerOnlyKeysIn(v: unknown, depth = 0, found: Set<string> = new Set()): string[] {
  if (depth <= 12 && v !== null && typeof v === "object") {
    if (Array.isArray(v)) v.forEach((x) => ownerOnlyKeysIn(x, depth + 1, found))
    else for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (OWNER_ONLY_KEYS.has(k)) found.add(k)
      ownerOnlyKeysIn(x, depth + 1, found)
    }
  }
  return [...found]
}
