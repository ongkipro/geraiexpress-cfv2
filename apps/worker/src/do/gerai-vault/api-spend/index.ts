// Per-API-key daily Rupiah cap (spec 08 §2), accounted inside the tenant object: one row per INV, written in the SAME
// transaction as the dispatch / pay-unpaid journal or the bulk materialization that spends it, and deleted in the
// same transaction that establishes non-issue (rejected, read back as not found, cancelled). No request can release
// another request's reservation, and an INV is never counted twice (a held order keeps its row until it resolves).
export type ApiSpend = { keyId: string; capIdr: number | null }

const wibDay = (now: number) => new Date(now + 7 * 3600_000).toISOString().slice(0, 10)

/** Amount an INV spends against the cap: counter total + gerai shipping cost of its frozen quote. */
export const spendAmount = (q: { counter_due_idr?: number | null; effective_gerai_cost_idr?: number | null } | null | undefined): number =>
  Math.max(0, Number(q?.counter_due_idr ?? 0)) + Math.max(0, Number(q?.effective_gerai_cost_idr ?? 0))

/** Call inside a transaction. "already" = this INV is counted (by any key); "cap" = it would exceed today's cap. */
export function reserveApiSpend(sql: SqlStorage, spend: ApiSpend, items: Array<{ slug: string; amount: number }>, now: number): "reserved" | "already" | "cap" {
  const fresh = items.filter((i) => sql.exec("SELECT 1 FROM api_key_spend WHERE slug = ?", i.slug).toArray().length === 0)
  if (!fresh.length) return "already"
  const day = wibDay(now)
  const add = fresh.reduce((a, i) => a + i.amount, 0)
  if (spend.capIdr !== null) {
    const used = sql.exec<{ n: number }>("SELECT COALESCE(SUM(amount_idr), 0) AS n FROM api_key_spend WHERE key_id = ? AND wib_day = ?", spend.keyId, day).one().n
    if (used + add > spend.capIdr) return "cap"
  }
  for (const i of fresh) sql.exec("INSERT INTO api_key_spend (slug, key_id, wib_day, amount_idr, created_at) VALUES (?, ?, ?, ?, ?)", i.slug, spend.keyId, day, i.amount, now)
  return "reserved"
}

/** Non-issue established for this INV: its reservation (if any) no longer counts. Call inside the same transaction. */
export function releaseApiSpend(sql: SqlStorage, slug: string): void {
  sql.exec("DELETE FROM api_key_spend WHERE slug = ?", slug)
}

export const CAP_REACHED = { status: 429, code: "DAILY_CAP_REACHED", message: "Batas nilai kiriman harian kunci API ini sudah tercapai." } as const
