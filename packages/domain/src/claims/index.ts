// Per-courier claim filing windows (TASK-405, spec 04 §3.2). Source: Mengantar Help "Ketentuan Batas Waktu Pengajuan
// Klaim" (help.mengantar.com/id/articles/8140017, updated 2026-11-05). Windows are data, not code paths; a courier
// without a row gets no countdown (never a guessed deadline). Working-day windows are counted as calendar time,
// which can only make the shown deadline earlier (safe side) — the UI says so.

export type ClaimKind = "rusak" | "hilang" | "isi_kurang"
export type Anchor = "last_status" | "lost_status" | "picked_up" | "delivered_or_rts"

export interface Window {
  hours: number
  anchor: Anchor
  workingDays: boolean
}

const d = (days: number, anchor: Anchor, workingDays = false): Window => ({ hours: days * 24, anchor, workingDays })
const h = (hours: number, anchor: Anchor, workingDays = false): Window => ({ hours, anchor, workingDays })

/** `rusak` = damage; `hilang` = lost/missing; `isi_kurang` = empty / partly missing / different contents. */
export const CLAIM_WINDOWS: Record<string, Partial<Record<ClaimKind, Window>>> = {
  JNE: { rusak: d(7, "last_status"), hilang: d(7, "lost_status"), isi_kurang: d(7, "delivered_or_rts") },
  SiCepat: { rusak: h(48, "last_status", true), hilang: d(14, "lost_status"), isi_kurang: d(2, "delivered_or_rts", true) },
  Sap: { rusak: h(48, "last_status"), hilang: d(60, "picked_up"), isi_kurang: h(48, "delivered_or_rts") },
  iDexpress: { rusak: d(2, "last_status", true), hilang: h(72, "lost_status", true), isi_kurang: h(48, "delivered_or_rts", true) },
  JT: { rusak: d(5, "last_status"), hilang: h(72, "lost_status"), isi_kurang: d(30, "delivered_or_rts") },
  lion: { rusak: d(7, "last_status"), hilang: d(30, "picked_up"), isi_kurang: d(7, "delivered_or_rts") },
  anteraja: { rusak: d(14, "last_status"), hilang: d(7, "lost_status"), isi_kurang: d(7, "delivered_or_rts") },
  pos: { rusak: h(72, "last_status"), hilang: h(72, "last_status"), isi_kurang: h(72, "last_status") },
  spx: { rusak: d(7, "delivered_or_rts"), hilang: d(14, "lost_status"), isi_kurang: d(7, "delivered_or_rts") },
}

export interface Anchors {
  lastStatusAt: number | null
  lostAt: number | null
  pickedUpAt: number | null
  deliveredOrRtsAt: number | null
}

/** Filing deadline (epoch ms) or `null` when the courier/kind has no published window or the anchor is unknown. */
export function claimDeadline(courier: string, kind: ClaimKind, a: Anchors): number | null {
  const w = CLAIM_WINDOWS[courier]?.[kind]
  if (!w) return null
  const start = w.anchor === "last_status" ? a.lastStatusAt : w.anchor === "lost_status" ? (a.lostAt ?? a.lastStatusAt) : w.anchor === "picked_up" ? a.pickedUpAt : (a.deliveredOrRtsAt ?? a.lastStatusAt)
  return start === null ? null : start + w.hours * 3600_000
}

/** Countdown chip text: `sisa 18 jam`, `sisa 3 hari`, `Kedaluwarsa`. */
export function countdown(deadline: number | null, now: number): { label: string; tone: "danger" | "warn" | "safe" | "muted"; expired: boolean } {
  if (deadline === null) return { label: "Batas tidak diketahui", tone: "muted", expired: false }
  const left = deadline - now
  if (left <= 0) return { label: "Kedaluwarsa", tone: "danger", expired: true }
  const hours = Math.floor(left / 3600_000)
  if (hours < 48) return { label: `sisa ${Math.max(1, hours)} jam`, tone: hours < 24 ? "danger" : "warn", expired: false }
  return { label: `sisa ${Math.floor(hours / 24)} hari`, tone: "safe", expired: false }
}

/** `Tidak Bergerak` age bands since the last tracking scan (spec 04 §3.1). `null` = under 48 hours. */
export function stuckBand(lastScanAt: number | null, now: number): "48j-4h" | "5-14h" | "15-30h" | ">30h" | null {
  if (lastScanAt === null) return null
  const days = (now - lastScanAt) / 86_400_000
  if (days < 2) return null
  if (days < 5) return "48j-4h"
  if (days < 15) return "5-14h"
  if (days <= 30) return "15-30h"
  return ">30h"
}
