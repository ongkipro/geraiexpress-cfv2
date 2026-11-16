// Shared Paket Massal types and labels (spec 03 §1.3).
export interface BulkRow {
  row_no: number
  state: "pending" | "needs_fix" | "ready" | "created"
  raw: Record<string, string>
  recipient_name: string | null
  recipient_phone: string | null
  area_label: string | null
  area_text: string | null
  weight_gram: number | null
  cod_goods_idr: number
  errors: string[]
  candidates: Array<{ id: string; label: string }>
  publish_shipping_idr: number | null
  counter_due_idr: number | null
  cod_collection_total_idr: number | null
  estimated_margin_idr?: number | null
  shipment_slug: string | null
  dispatch_state: string | null
  awb_number: string | null
  dispatch_error: string | null
  counter_payment_status: string | null
}
export interface Batch {
  id: string
  state: string
  source: string
  file_name: string | null
  service_code: string | null
  cod_fee_mode: string
  row_count: number
  ready_count: number
  failed_count: number
  counter_payment_status: string
  change_idr: number | null
  created_at: number
}
export interface BulkView {
  batch: Batch
  sender: { id: string; name: string; phone: string; brand: string | null } | null
  rows: BulkRow[]
  totals: { ongkir: number; codCollected: number; codFee: number; senderPayable: number; due: number; estimated_margin_idr?: number }
}
export const BATCH_STATE: Record<string, string> = {
  draft: "Perlu diperbaiki",
  checking: "Memeriksa baris",
  ready: "Siap dibuat",
  dispatching: "Menerbitkan resi",
  done: "Selesai",
  partially_failed: "Sebagian gagal",
  cancelled: "Dibatalkan",
}
export const when = (ms: number) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(ms)
