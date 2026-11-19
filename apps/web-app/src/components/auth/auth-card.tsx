import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"

/**
 * The brand site for an `app.` host (`app.geraiexpress.com` → `geraiexpress.com`, `app-staging.` → `staging.`,
 * `app.geraiexpress.localhost:55190` → `geraiexpress.localhost:55190`); null on `owner.`, where the mark stays static.
 */
export function brandHome(loc: Pick<Location, "protocol" | "host"> = window.location): string | null {
  const h = loc.host
  if (h.startsWith("app-staging.")) return `${loc.protocol}//staging.${h.slice("app-staging.".length)}`
  if (h.startsWith("app.")) return `${loc.protocol}//${h.slice("app.".length)}`
  return null
}

const PITCH = {
  masuk: {
    title: "Satu pintu ke meja kasir & pembukuan gerai",
    lead: "Masuk dengan email Anda; ruang kerja gerai langsung terbuka sesuai peran Pemilik atau Kasir.",
    checks: ["Tarif publik di kasir; modal & margin khusus Pemilik", "9 ekspedisi resmi jaringan Mengantar", "Cetak thermal 100 mm, 58 mm & Layar Pelanggan QRIS"],
  },
  daftar: {
    title: "Ubah toko Anda jadi loket multi\u2011ekspedisi resmi",
    lead: "Tiga langkah singkat: akun pemilik, identitas gerai, lalu titik jemput kurir.",
    checks: ["Rp 0 biaya pendaftaran & pemakaian aplikasi kasir", "Halaman publik namagerai.geraimitra.com gratis", "Rekonsiliasi 1:1 kas loket & mutasi Mengantar"],
  },
  owner: {
    title: "Konsol pengawasan platform GeraiExpress",
    lead: "Khusus Super Admin. Setiap sesi melewati kata sandi dan kode autentikator.",
    checks: ["Wajib verifikasi dua langkah TOTP + kode cadangan", "Tinjauan pengajuan gerai & domain kustom", "Audit beralasan di setiap perubahan sensitif"],
  },
} as const

// Entrance, the floating visual and the masked dot grid (AuthSplit parity); all motion stops under reduced motion.
const STAGE_CSS = `
@keyframes gx-auth-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes gx-auth-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
[data-auth-col]{animation:gx-auth-in 220ms cubic-bezier(.22,1,.36,1) both}
[data-auth-visual]{animation:gx-auth-float 6s ease-in-out infinite}
[data-auth-panel]::before{content:"";position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(rgb(15 23 42/.08) 1px,transparent 1.4px);background-size:22px 22px;-webkit-mask-image:radial-gradient(ellipse 70% 60% at 50% 45%,#000 0%,transparent 75%);mask-image:radial-gradient(ellipse 70% 60% at 50% 45%,#000 0%,transparent 75%)}
@media (prefers-reduced-motion:reduce){[data-auth-col],[data-auth-visual]{animation:none}}
`

function Mark({ home, size }: { home: string | null; size: "bar" | "panel" }) {
  const body = (
    <>
      <img src="/logo.svg" alt="" width={46} height={27} className={size === "panel" ? "h-7 w-auto" : "h-6 w-auto"} />
      <span className="flex flex-col leading-none">
        <span className={`font-bold tracking-[-0.01em] text-[#012676] ${size === "panel" ? "text-[17px]" : "text-[15px]"}`}>GeraiExpress</span>
        <span className="mt-0.5 text-[11px] font-medium text-[#64748B]">by Mengantar</span>
      </span>
    </>
  )
  const cls = "inline-flex min-h-11 items-center gap-2"
  // The brand mark stands alone: the way back is the separate `← Beranda` link, never an arrow on the logo.
  return home ? (
    <a href={home} data-auth-mark className={cls} aria-label="GeraiExpress">{body}</a>
  ) : (
    <div data-auth-mark className={cls} aria-label="GeraiExpress" role="img">{body}</div>
  )
}

function HomeLink({ home }: { home: string }) {
  return (
    <a href={home} data-auth-home className="inline-flex min-h-11 items-center text-sm font-semibold text-[#475569] hover:text-[#0B4FE3]">
      ← Beranda
    </a>
  )
}

/**
 * The 100dvh split-studio for every sign-in/sign-up route (DEC-250, `AuthSplit` parity; supersedes the DEC-248 stage):
 * no header, no footer, no page scroll. Left (5.4fr, white): the `Masuk ke Loket` / `Daftar Gerai Baru` switcher over
 * one floating card, centred. Right (4.6fr, from 960px): a porcelain studio panel — the mark and `← Beranda` on top,
 * the 3D visual with a contextual pitch in the middle, one legal line at its foot. Below 960px the panel folds away and
 * a compact mark bar sits above the card. Only the left column may scroll, and only when the viewport is too short.
 */
export function AuthCard({
  title,
  description,
  children,
  corner,
  progress,
  switcher,
  variant = "app",
  slug,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  /** A quiet line under the form (`Kembali ke Masuk`, `Keluar`, …). */
  corner?: ReactNode
  /** Above the title (the `WizardBar` of the register flow). */
  progress?: ReactNode
  /** The public pill switcher above the card (app sign-in and register routes only). */
  switcher?: "masuk" | "daftar"
  /** `owner` = the internal console: static mark, no `← Beranda`, no switcher, console pitch. */
  variant?: "app" | "owner"
  /** Mirrors the store address live onto the panel badge (register routes). */
  slug?: string
}) {
  const home = variant === "owner" ? null : brandHome()
  const pitch = PITCH[variant === "owner" ? "owner" : switcher === "daftar" ? "daftar" : "masuk"]
  const year = new Date().getFullYear()
  // SPA tabs. This file is shared with `owner.` (whose router has no register routes); the switcher only renders on `app.`.
  const tab = (to: "/masuk" | "/daftar-akun" | "/daftar", on: boolean, label: string) => (
    <Link
      to={to as "/masuk"}
      aria-current={on ? "page" : undefined}
      className={`flex min-h-11 items-center justify-center rounded-full px-3 text-center text-sm font-bold transition-[color,background-color,box-shadow] duration-200 motion-reduce:transition-none ${on ? "bg-white text-[#0B4FE3] shadow-[0_1px_2px_rgb(15_23_42/0.06),0_4px_10px_-4px_rgb(15_23_42/0.12)]" : "text-[#475569] hover:text-[#0F172A]"}`}
    >
      {label}
    </Link>
  )
  return (
    <div data-auth-stage className="grid h-dvh w-full overflow-hidden bg-white text-[#0F172A] min-[960px]:grid-cols-[minmax(0,5.4fr)_minmax(0,4.6fr)]">
      <style>{STAGE_CSS}</style>
      <main data-auth-main className="flex min-h-0 flex-col overflow-y-auto px-4 py-2 min-[960px]:px-8 min-[960px]:py-6 [@media(min-width:960px)_and_(max-height:820px)]:py-3">
        <div data-auth-bar className="flex shrink-0 items-center justify-between gap-4 min-[960px]:hidden">
          <Mark home={home} size="bar" />
          {home ? <HomeLink home={home} /> : null}
        </div>
        <div data-auth-col className="mx-auto my-auto flex w-full max-w-[460px] flex-col gap-3 py-1 min-[960px]:py-2">
          {switcher && variant === "app" ? (
            <nav aria-label="Masuk atau daftar gerai" data-auth-switch className="grid grid-cols-2 gap-1 rounded-full bg-[#F4F6FA] p-1">
              {tab("/masuk", switcher === "masuk", "Masuk ke Loket")}
              {/* On `/daftar` (steps 2–3, the owner account already exists) the active tab stays on `/daftar`. */}
              {tab(slug !== undefined ? "/daftar" : "/daftar-akun", switcher === "daftar", "Daftar Gerai Baru")}
            </nav>
          ) : null}
          <section
            data-auth-card
            className="flex flex-col gap-4 rounded-[22px] border border-slate-900/[0.06] bg-white p-4 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.09),0_2px_6px_-1px_rgba(15,23,42,0.04)] min-[960px]:p-8 sm:p-5 [@media(min-width:960px)_and_(max-height:820px)]:px-7 [@media(min-width:960px)_and_(max-height:820px)]:py-6 [&_[data-slot=input]]:h-11 md:[&_[data-slot=input]]:h-10 [&_[data-slot=button][type=submit]]:bg-[#0B4FE3] [&_[data-slot=button][type=submit]:hover]:bg-[#083CB3]"
          >
            {progress}
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl leading-tight font-extrabold tracking-[-0.025em] text-[#0F172A]">
                {title}
                <span aria-hidden className="text-[#0B4FE3]">.</span>
              </h1>
              {description ? <p className="text-[15px] leading-snug text-[#64748B]">{description}</p> : null}
            </div>
            {children}
            {corner ? (
              <div className="-mt-1 border-t border-[#E2E8F0] pt-3 text-sm text-[#64748B] [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:font-semibold [&_a]:text-[#0B4FE3] md:[&_a]:min-h-9 [&_button]:min-h-11">
                {corner}
              </div>
            ) : null}
          </section>
        </div>
      </main>
      <aside data-auth-panel aria-label="Tentang GeraiExpress" className="relative m-3 hidden min-h-0 grid-rows-[auto_1fr_auto] gap-4 overflow-hidden rounded-[28px] bg-[#F4F6FA] px-9 py-7 min-[960px]:grid">
        <div className="relative flex items-center justify-between gap-4">
          <Mark home={home} size="panel" />
          {home ? <HomeLink home={home} /> : null}
        </div>
        <div className="relative flex max-w-[440px] min-h-0 flex-col gap-4 self-center">
          <img
            data-auth-visual
            src="/loket-mitra-3d.webp"
            width={1040}
            height={880}
            alt="Ilustrasi 3D Raka, mitra loket GeraiExpress, di meja loket dengan printer label thermal dan timbangan digital"
            className="max-h-[26dvh] w-auto self-start object-contain"
          />
          <h2 className="text-[26px] leading-tight font-extrabold tracking-[-0.025em] text-[#0F172A]">
            {pitch.title}
            <span aria-hidden className="text-[#0B4FE3]">.</span>
          </h2>
          <p className="text-[15px] leading-relaxed text-[#475569]">{pitch.lead}</p>
          {switcher === "daftar" && variant === "app" ? (
            <p data-auth-slug className="inline-flex w-fit max-w-full items-center gap-2 rounded-full bg-white px-3 py-1.5 font-mono text-[13px] font-semibold text-[#0F172A] shadow-[0_1px_2px_rgb(15_23_42/0.08)]">
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-[#0B4FE3]" />
              <span className="min-w-0 [overflow-wrap:anywhere]">{slug || "namagerai"}.geraimitra.com</span>
            </p>
          ) : null}
          <ul className="flex flex-col gap-2.5">
            {pitch.checks.map((c) => (
              <li key={c} className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-baseline gap-2 text-[15px] font-semibold text-[#0F172A]">
                <span aria-hidden className="font-extrabold text-[#0B4FE3]">✓</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[13px] text-[#64748B]">
          {home ? (
            <>
              © {year} GeraiExpress · <a href={`${home}/ketentuan`} className="hover:text-[#0B4FE3] hover:underline">Ketentuan Layanan</a> ·{" "}
              <a href={`${home}/privasi`} className="hover:text-[#0B4FE3] hover:underline">Kebijakan Privasi</a>
            </>
          ) : (
            "Konsol internal GeraiExpress"
          )}
        </p>
      </aside>
    </div>
  )
}

/**
 * The register wizard bar (DEC-250, AUTH-MINIMALIST-STEP-UX-SPEC §4; replaces the DEC-248 `1 · Akun` text row):
 * an optional quiet `← Kembali`, three thin segments and `Langkah n / 3`. The list keeps the step names for
 * assistive technology (`aria-current="step"`).
 */
export function WizardBar({ current, onBack }: { current: 1 | 2 | 3; onBack?: () => void }) {
  const steps = ["Akun", "Gerai", "Titik Jemput"]
  return (
    <div data-wizard className="-mb-1 flex min-h-7 items-center gap-3">
      {onBack ? (
        <button type="button" onClick={onBack} className="-my-2 inline-flex min-h-11 shrink-0 items-center text-sm font-bold text-[#64748B] hover:text-[#0B4FE3] md:min-h-9">
          ← Kembali
        </button>
      ) : null}
      <ol aria-label="Tahap pendaftaran" className="grid flex-1 grid-cols-3 gap-1.5">
        {steps.map((s, i) => {
          const n = i + 1
          return (
            <li key={s} aria-current={n === current ? "step" : undefined} data-on={n <= current} className={`h-1 rounded-full transition-colors duration-200 motion-reduce:transition-none ${n <= current ? "bg-[#0B4FE3]" : "bg-[#E2E8F0]"}`}>
              <span className="sr-only">{n} · {s}</span>
            </li>
          )
        })}
      </ol>
      <p aria-hidden className="shrink-0 font-mono text-xs font-semibold text-[#64748B] tabular-nums">Langkah {current} / 3</p>
    </div>
  )
}

// Inline status text with a coloured left rule (no nested box inside the card).
export function FormAlert({ tone = "danger", children }: { tone?: "danger" | "safe" | "warn"; children: ReactNode }) {
  const cls = tone === "safe" ? "border-safe text-safe" : tone === "warn" ? "border-warn text-warn" : "border-danger text-danger"
  return (
    <p role={tone === "danger" ? "alert" : "status"} className={`border-l-4 py-1 pl-3 text-base font-medium ${cls}`}>
      {children}
    </p>
  )
}
