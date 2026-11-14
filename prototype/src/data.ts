// Sample data for the throwaway prototype (TASK-001). Every screen labels it "Data contoh".
export const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)

export type Status = "siap" | "menunggu-saldo" | "dalam-kirim" | "terkirim" | "retur"

export const shipments: {
  inv: string
  time: string
  courier: string
  awb: string | null
  sender: string
  masked: boolean
  recipient: string
  mode: "Non-COD" | "COD Barang"
  total: number
  status: Status
  // Counter payment is only recorded: the money goes to the outlet's own QRIS, drawer or bank.
  paid: null | "Tunai" | "QRIS" | "Transfer" | "Deposit"
}[] = [
  { inv: "8K4M2P7", time: "14:22", courier: "J&T EZ", awb: "JX8829104412", sender: "Toko Hijab Nisa", masked: true, recipient: "Rina K. · Bandung", mode: "Non-COD", total: 27000, status: "siap" , paid: "QRIS" },
  { inv: "5N7R3V4", time: "13:50", courier: "J&T EZ", awb: null, sender: "Bpk Hendra", masked: false, recipient: "Adi · Semarang", mode: "Non-COD", total: 19000, status: "menunggu-saldo" , paid: null },
  { inv: "9P3N7W2", time: "13:05", courier: "SiCepat REG", awb: "004918273612", sender: "Kopi Gunung", masked: false, recipient: "Dimas · Surabaya", mode: "COD Barang", total: 185000, status: "dalam-kirim" , paid: "Tunai" },
  { inv: "2K9P4M8", time: "11:40", courier: "JNE REG", awb: "JT7712390012", sender: "Ibu Wati", masked: false, recipient: "Sari · Bekasi", mode: "Non-COD", total: 22000, status: "retur" , paid: "Transfer" },
  { inv: "7H3K9Q2", time: "10:15", courier: "SPX Standard", awb: "SPXID0418827", sender: "Toko Hijab Nisa", masked: true, recipient: "Lina · Depok", mode: "COD Barang", total: 142000, status: "terkirim" , paid: "QRIS" },
]

export const statusLabel: Record<Status, string> = {
  siap: "Siap Pickup",
  "menunggu-saldo": "Menunggu Saldo",
  "dalam-kirim": "Dalam Kirim",
  terkirim: "Terkirim",
  retur: "Retur di Gerai",
}

export const quotes = [
  { courier: "J&T Express", service: "EZ", eta: "2–3 hari", price: 24000, tag: "Termurah", dropOnly: false },
  { courier: "SiCepat", service: "REG", eta: "1–2 hari", price: 26000, tag: "Tercepat", dropOnly: false },
  { courier: "SPX", service: "Standard", eta: "2–4 hari", price: 23500, tag: null, dropOnly: true },
  { courier: "JNE", service: "REG", eta: "2–3 hari", price: 27000, tag: null, dropOnly: false },
]

export const senders = [
  { name: "Ibu Siti Nisa", phone: "0812-3456-7890", verified: true, brand: "TOKO HIJAB NISA", preset: "Dropship Toko", count: 94, deposit: 250000 },
  { name: "Kopi Gunung Bandung", phone: "0813-2200-1144", verified: true, brand: "Kopi Gunung", preset: "Standar Gerai", count: 61, deposit: 0 },
  { name: "Bpk Hendra Wijaya", phone: "0857-9911-2030", verified: false, brand: "Hendra Wijaya", preset: "Standar Gerai", count: 29, deposit: 0 },
]

export const ledger = [
  { when: "12/11 14:23", inv: "INV-MGT-99281", type: "Pembayaran Batch", ref: "INV 8K4M2P7", amount: -19200, balance: 915000 },
  { when: "12/11 11:10", inv: "INV-MGT-99104", type: "Rekonsiliasi COD", ref: "4 resi COD", amount: 434200, balance: 934200 },
  { when: "11/11 19:40", inv: "INV-MGT-98812", type: "Ongkir Paket Retur", ref: "INV 2K9P4M8", amount: -14000, balance: 500000 },
  { when: "11/11 09:05", inv: "INV-MGT-98401", type: "Top-Up Saldo", ref: "—", amount: 500000, balance: 514000 },
]

// Daily history for the dashboard chart: deterministic sample, last 90 days up to 2026-11-14 (WIB).
export const daily = Array.from({ length: 90 }, (_, k) => {
  const d = new Date(Date.UTC(2026, 10, 14 - (89 - k)))
  const iso = d.toISOString().slice(0, 10)
  const dow = d.getUTCDay()
  const base = 11 + ((k * 7) % 9) + (dow === 0 ? -6 : dow === 6 ? 4 : 0)
  const cod = Math.round(base * 0.38)
  return { date: iso, nonCod: base - cod, cod, revenue: base * 26500 }
})
