// Saldo Aman (TASK-402, spec 02 §4): synced balance minus the return and dispute exposure, never freezing the whole
// balance. Return exposure per INV in return/held = publish shipping + an estimated courier return fee (the frozen
// provider net `N` of that INV, the best per-route estimate we hold) until Mengantar's return debit is reconciled.
// Dispute exposure = open `penyesuaian` adjustments from `/invoices`. Every Rupiah links to its INV.

export type ReserveRow = {
  slug: string
  kind: "retur" | "sengketa"
  status: string
  amount_idr: number
}

export function reserveOf(sql: SqlStorage): { returnExposure: number; disputeExposure: number; total: number; rows: ReserveRow[] } {
  const returns = sql
    .exec<ReserveRow>(
      `SELECT s.slug, 'retur' AS kind, s.status, s.publish_shipping_idr + COALESCE(q.provider_net_shipping_idr, 0) AS amount_idr
       FROM shipments s LEFT JOIN quote_snapshots q ON q.id = s.quote_snapshot_id
       WHERE s.status IN ('rts_in_transit','undelivery_hold') AND s.reconciled_extra_adjustment_idr IS NULL ORDER BY s.slug`,
    )
    .toArray()
  const disputes = sql
    .exec<ReserveRow>(
      `SELECT d.shipment_slug AS slug, 'sengketa' AS kind, COALESCE(s.status, '') AS status, ABS(COALESCE(d.actual_idr, 0)) AS amount_idr
       FROM finance_discrepancies d LEFT JOIN shipments s ON s.slug = d.shipment_slug
       WHERE d.kind = 'adjustment' AND d.resolved_at IS NULL AND d.shipment_slug != '' ORDER BY d.created_at`,
    )
    .toArray()
  const sum = (r: ReserveRow[]) => r.reduce((a, x) => a + x.amount_idr, 0)
  const returnExposure = sum(returns)
  const disputeExposure = sum(disputes)
  return { returnExposure, disputeExposure, total: returnExposure + disputeExposure, rows: [...returns, ...disputes] }
}

/** Pre-flight for a Non-COD issue (spec 09 §3.1): `null` when the balance was never synced (no claim either way). */
export function balanceSufficient(sql: SqlStorage, estimatedDebitIdr: number): { sufficient: boolean | null; balance: number | null } {
  const b = sql.exec<{ b: number | null }>("SELECT synced_balance_idr AS b FROM mengantar_connections LIMIT 1").toArray()[0]?.b ?? null
  if (b === null) return { sufficient: null, balance: null }
  return { sufficient: b - reserveOf(sql).total >= estimatedDebitIdr, balance: b }
}
