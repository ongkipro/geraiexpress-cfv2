import type { ReactNode } from "react"

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

/**
 * Auth stage for every sign-in/sign-up route (DEC-248, owner 2026-11-19): one white viewport, no page footer, no page
 * scroll. A quiet top bar holds the brand escape (left) and the contextual switch (right); the form sits dead centre.
 * Below ~560px of height (a phone keyboard, a landscape phone) the centre scrolls inside itself, never the page.
 */
export function AuthCard({
  title,
  description,
  children,
  corner,
  progress,
  wide = false,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  /** Top-right contextual switch (`Belum punya akun? Daftar`, `Keluar`, …). */
  corner?: ReactNode
  /** Above the title (the `1 · 2 · 3` register indicator). */
  progress?: ReactNode
  /** Register steps use 440px; sign-in, OTP and TOTP 380px. */
  wide?: boolean
}) {
  const home = brandHome()
  const mark = (
    <>
      <img src="/logo.svg" alt="" width={46} height={27} className="h-6 w-auto" />
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-[#012676]">GeraiExpress</span>
    </>
  )
  return (
    <div data-auth-stage className="flex h-dvh w-full flex-col overflow-hidden bg-white text-[#0F172A]">
      <div className="flex h-16 shrink-0 items-center justify-between gap-4 px-5 md:px-8">
        {home ? (
          <a href={home} className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-[#F4F6FA]" aria-label="GeraiExpress, kembali ke situs utama">
            <span aria-hidden className="text-[#64748B]">←</span>
            {mark}
          </a>
        ) : (
          <p className="inline-flex items-center gap-2">{mark}</p>
        )}
        {corner ? <div className="text-right text-sm text-[#64748B] [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:font-medium [&_a]:text-[#0F172A] [&_a]:underline-offset-4 hover:[&_a]:underline [&_button]:min-h-11">{corner}</div> : null}
      </div>
      <main data-auth-main className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-5 pb-4 md:pb-10">
        <section
          className={`my-auto flex w-full flex-col gap-6 py-4 ${wide ? "max-w-[440px]" : "max-w-[380px]"} [&_[data-slot=input]]:h-11 md:[&_[data-slot=input]]:h-10 [&_[data-slot=button][type=submit]]:bg-[#0B4FE3] [&_[data-slot=button][type=submit]:hover]:bg-[#083CB3]`}
        >
          {progress}
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl leading-tight font-semibold tracking-[-0.02em] text-[#0F172A]">{title}</h1>
            {description ? <p className="text-[15px] leading-snug text-[#64748B]">{description}</p> : null}
          </div>
          {children}
        </section>
      </main>
    </div>
  )
}

/** The register indicator `1 · Akun — 2 · Gerai — 3 · Titik Jemput` (replaces `Langkah n/5`). */
export function RegisterSteps({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["Akun", "Gerai", "Titik Jemput"]
  return (
    <ol aria-label="Tahap pendaftaran" className="flex items-center gap-2 text-[13px] font-medium text-[#64748B]">
      {steps.map((s, i) => {
        const n = i + 1
        const state = n < current ? "done" : n === current ? "now" : "next"
        return (
          <li key={s} aria-current={state === "now" ? "step" : undefined} data-state={state} className="flex items-center gap-2">
            {i ? <span aria-hidden className={`h-px w-5 ${n <= current ? "bg-[#0B4FE3]" : "bg-[#E2E8F0]"}`} /> : null}
            <span className={state === "now" ? "text-[#0F172A]" : state === "done" ? "text-[#0B4FE3]" : undefined}>
              <span className="tabular-nums">{n}</span> · {s}
            </span>
          </li>
        )
      })}
    </ol>
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
