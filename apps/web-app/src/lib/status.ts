// One Indonesian label per shipment status, dispatch state and local custody event (AGENTS.md §2: never show
// raw identifiers). Unknown values fall back to a neutral phrase, never the identifier itself.
export const STATUS_LABEL: Record<string, string> = {
  draft: "Draf",
  issuing_in_flight: "Sedang diterbitkan",
  reconciliation_needed: "Sedang diperiksa",
  provider_unpaid_hold: "Menunggu saldo",
  failed: "Gagal diterbitkan",
  issued: "Resi terbit",
  ready_for_pickup: "Siap dijemput",
  handed_to_courier: "Diserahkan ke kurir",
  in_transit: "Dalam perjalanan",
  undelivery_hold: "Gagal antar",
  delivered: "Terkirim",
  rts_in_transit: "Retur dalam perjalanan",
  provider_returned: "Retur diterima kurir",
  rts_at_gerai: "Retur di gerai",
  rts_returned_to_sender: "Retur sudah diambil pengirim",
  cancel_in_flight: "Sedang dibatalkan",
  cancel_unknown: "Pembatalan diperiksa",
  cancelled: "Dibatalkan",
  cancelled_local: "Dibatalkan di gerai",
  lost: "Hilang",
  received_at_gerai: "Diterima di gerai",
}

export const statusLabel = (s: string | null | undefined): string => (s ? STATUS_LABEL[s] ?? "Status lain" : "—")

const COURIER_LABEL: Record<string, string> = {
  jne: "JNE",
  jt: "J&T Express",
  sicepat: "SiCepat",
  sap: "SAP Express",
  lion: "Lion Parcel",
  anteraja: "Anteraja",
  idexpress: "iDexpress",
  pos: "Pos Indonesia",
  spx: "SPX Express",
}

export const courierLabel = (code: string | null | undefined): string => (code ? COURIER_LABEL[code.toLowerCase()] ?? code : "—")

const CLAIM_KIND_LABEL: Record<string, string> = {
  rusak: "rusak",
  hilang: "hilang",
  isi_kurang: "isi kurang",
  terlambat: "terlambat",
}

export const claimKindLabel = (kind: string | null | undefined): string => (kind ? CLAIM_KIND_LABEL[kind] ?? "lainnya" : "—")
