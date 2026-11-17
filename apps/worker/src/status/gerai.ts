// Gerai `Status Operasional` (DEC-244, AdsBookCMS OperationalStatus pattern): one owner-only verdict that separates an
// unfinished setup (`setup`) from a real fault (`problem`), a readiness checklist and four signal cards. Pure builder
// over plain inputs so the rules are unit-testable; the route gathers the inputs (vault + D1) and never sends PII.
import type { HealthSnapshot } from "../do/gerai-vault"

export type Tone = "healthy" | "setup" | "problem"
export type SignalState = "healthy" | "degraded" | "unknown"

export interface StatusInputs {
  now: number
  onboardingState: string | null
  webhookState: "unconfigured" | "awaiting_seller_setup" | "active" | "secret_mismatch" | "paused" | null
  webhookLastEventAt: number | null
  health: HealthSnapshot | null
  counts: { reconciliationNeeded: number; unpaidHold: number; failed24h: number; discrepancies: number; financeLastOkAt: number | null; financeLastRunAt: number | null; financeLastError: string | null; printFormat: string | null; outletReady: boolean; hasCoordinates: boolean } | null
  miniSiteHost: string
  domains: Array<{ hostname: string; state: string; lastCheckedAt: number | null }>
}

export interface SetupStep { id: string; label: string; detail: string; done: boolean; required: boolean; to: string; ctaLabel: string }
export interface Signal { id: string; title: string; state: SignalState; detail: string; lastAt: number | null; actionTo?: string; actionLabel?: string; recheck?: "finance_sync" | "domain_check" }
export interface GeraiStatus {
  overall: { tone: Tone; title: string; summary: string; checkedAt: number }
  icon: { tone: Tone; label: string; count: number }
  setupSteps: SetupStep[]
  signals: Signal[]
}

const MIN = 60_000
const FINANCE_STALE_MS = 60 * MIN
const INBOX_STALE_MS = 15 * MIN

export function buildGeraiStatus(i: StatusInputs): GeraiStatus {
  const connected = i.onboardingState === "connected" || i.onboardingState === "byok_connected"
  const c = i.counts
  const h = i.health
  const activeDomain = i.domains.find((d) => d.state === "active")
  const brokenDomain = i.domains.find((d) => d.state === "failed" || d.state === "moved" || d.state === "suspended")

  const setupSteps: SetupStep[] = [
    { id: "mengantar", label: "Akun Seller Mengantar terhubung", detail: connected ? "Akun Mengantar gerai aktif." : "Hubungkan akun Mengantar agar kasir bisa menerbitkan resi.", done: connected, required: true, to: "/pengaturan/mengantar", ctaLabel: "Buka Mengantar" },
    { id: "profil", label: "Titik jemput & profil gerai lengkap", detail: c?.outletReady ? (c.hasCoordinates ? "Alamat jemput dan titik peta sudah diisi." : "Alamat sudah diisi; titik koordinat belum (wajib untuk Pos Indonesia).") : "Isi kecamatan dan alamat lengkap titik jemput.", done: !!c?.outletReady, required: true, to: "/pengaturan/profil", ctaLabel: "Lengkapi Profil" },
    { id: "webhook", label: "Webhook status kiriman aktif", detail: i.webhookState === "active" ? "Status kiriman diperbarui otomatis." : "Tempel URL webhook di Mengantar dan simpan Webhook Secret.", done: i.webhookState === "active", required: true, to: "/pengaturan/mengantar", ctaLabel: "Atur Webhook" },
    { id: "printer", label: "Format printer & struk dipilih", detail: c?.printFormat ? "Format label bawaan sudah dipilih." : "Pilih format label bawaan untuk kasir.", done: !!c?.printFormat, required: false, to: "/pengaturan/printer", ctaLabel: "Buka Printer" },
    { id: "minisite", label: "Halaman publik gerai aktif", detail: activeDomain ? `Aktif di ${activeDomain.hostname}.` : `Aktif di ${i.miniSiteHost}.`, done: true, required: false, to: "/pengaturan/mini-site", ctaLabel: "Buka Mini-Site" },
  ]

  // Signals: degraded = a real fault the owner can act on; unknown = not enough data yet (never a fault).
  const issueState: SignalState = !connected ? "unknown" : h?.failedStreak || (c?.reconciliationNeeded ?? 0) > 0 || (c?.unpaidHold ?? 0) > 0 ? "degraded" : "healthy"
  const issueDetail = !connected
    ? "Belum terhubung ke Mengantar."
    : [
        (c?.unpaidHold ?? 0) > 0 ? `${c!.unpaidHold} kiriman menunggu saldo Mengantar` : null,
        (c?.reconciliationNeeded ?? 0) > 0 ? `${c!.reconciliationNeeded} kiriman sedang dicocokkan ulang` : null,
        h?.failedStreak ? "5 penerbitan terakhir gagal berturut-turut" : null,
      ].filter(Boolean).join(" · ") || `Penerbitan resi normal${h ? ` (${h.issues30m} percobaan dalam 30 menit)` : ""}.`

  const webhookFault = i.webhookState === "secret_mismatch" || i.webhookState === "paused" || (h?.oldestInboxAgeMs ?? 0) > INBOX_STALE_MS
  const webhookState: SignalState = !connected || i.webhookState === null || i.webhookState === "unconfigured" ? "unknown" : webhookFault ? "degraded" : i.webhookState === "active" ? "healthy" : "unknown"
  const webhookDetail =
    i.webhookState === "secret_mismatch" ? "Kabar dari Mengantar ditolak: Webhook Secret berbeda."
    : i.webhookState === "paused" ? "Mengantar menjeda webhook gerai ini."
    : (h?.oldestInboxAgeMs ?? 0) > INBOX_STALE_MS ? "Ada kabar status yang belum diproses lebih dari 15 menit."
    : i.webhookState === "active" ? "Webhook aktif."
    : i.webhookState === "awaiting_seller_setup" ? "Menunggu Webhook Secret disimpan; status tetap diperiksa tiap jam."
    : "Belum diatur."

  const financeAge = c?.financeLastOkAt != null ? i.now - c.financeLastOkAt : null
  const financeFault = connected && ((c?.financeLastError ?? null) !== null || (financeAge !== null && financeAge > FINANCE_STALE_MS) || (c?.discrepancies ?? 0) > 0)
  const financeState: SignalState = !connected || c?.financeLastRunAt == null ? "unknown" : financeFault ? "degraded" : "healthy"
  const financeDetail = !connected
    ? "Belum terhubung ke Mengantar."
    : c?.financeLastRunAt == null ? "Belum pernah disinkronkan."
    : [
        c.financeLastError ? "Sinkron terakhir gagal" : null,
        financeAge !== null && financeAge > FINANCE_STALE_MS ? "Sinkron terakhir lebih dari 1 jam lalu" : null,
        c.discrepancies > 0 ? `${c.discrepancies} selisih belum diselesaikan` : null,
      ].filter(Boolean).join(" · ") || "Saldo dan mutasi tersinkron."

  const domainState: SignalState = brokenDomain ? "degraded" : "healthy"
  const domainDetail = brokenDomain ? `Domain ${brokenDomain.hostname} bermasalah (${brokenDomain.state === "moved" ? "DNS berubah" : brokenDomain.state === "suspended" ? "dibekukan" : "gagal"}).` : activeDomain ? `Aktif di ${activeDomain.hostname}.` : `Aktif di ${i.miniSiteHost}.`

  const signals: Signal[] = [
    { id: "penerbitan", title: "Koneksi & Penerbitan Resi Mengantar", state: issueState, detail: issueDetail, lastAt: null, ...((c?.unpaidHold ?? 0) > 0 ? { actionTo: "/kiriman?tab=menunggu-saldo", actionLabel: "Buka Kiriman Tertahan" } : !connected ? { actionTo: "/pengaturan/mengantar", actionLabel: "Hubungkan Mengantar" } : {}) },
    { id: "webhook", title: "Webhook Status Kiriman", state: webhookState, detail: webhookDetail, lastAt: i.webhookLastEventAt, actionTo: "/pengaturan/mengantar", actionLabel: "Atur Webhook" },
    { id: "keuangan", title: "Sinkronisasi Saldo & Mutasi", state: financeState, detail: financeDetail, lastAt: c?.financeLastOkAt ?? null, ...(connected ? { recheck: "finance_sync" as const } : {}), ...((c?.discrepancies ?? 0) > 0 ? { actionTo: "/keuangan?tab=selisih", actionLabel: "Buka Selisih Sync" } : {}) },
    { id: "domain", title: "Halaman Publik & Domain Gerai", state: domainState, detail: domainDetail, lastAt: i.domains.reduce<number | null>((m, d) => (d.lastCheckedAt && (!m || d.lastCheckedAt > m) ? d.lastCheckedAt : m), null), ...(i.domains.length ? { recheck: "domain_check" as const, actionTo: "/pengaturan/mini-site", actionLabel: "Buka Mini-Site" } : {}) },
  ]

  const faults = signals.filter((s) => s.state === "degraded").length
  const pendingSetup = setupSteps.filter((s) => s.required && !s.done).length
  const tone: Tone = faults > 0 ? "problem" : pendingSetup > 0 ? "setup" : "healthy"
  const overall =
    tone === "problem" ? { title: `${faults} sinyal perlu ditangani`, summary: "Ada gangguan yang memengaruhi kiriman atau keuangan gerai. Tangani dari kartu di bawah." }
    : tone === "setup" ? { title: "Persiapan loket belum selesai", summary: `${pendingSetup} langkah wajib lagi sebelum loket siap penuh.` }
    : { title: "Semua sinyal sehat", summary: "Penerbitan resi, webhook, sinkron saldo, dan halaman publik berjalan normal." }
  const label = tone === "problem" ? `Status operasional: ${faults} sinyal perlu ditangani` : tone === "setup" ? `Status operasional: ${pendingSetup} langkah persiapan tersisa` : "Status operasional: Semua sinyal sehat"
  return { overall: { tone, ...overall, checkedAt: i.now }, icon: { tone, label, count: tone === "problem" ? faults : tone === "setup" ? pendingSetup : 0 }, setupSteps, signals }
}
