import type { ReactNode } from "react"

// Centered 440 px card without sidebar for every auth route (visual 07 §3.1).
export function AuthCard({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted px-4 py-10">
      {/* DEC-244 brand mark (official vector logo); the word stays text for screen readers and search. */}
      <p className="flex items-center gap-2.5 text-lg font-semibold text-[#012676]">
        <img src="/logo.svg" alt="" width={54} height={32} className="h-8 w-auto" />
        GeraiExpress
      </p>
      <section className="flex w-full max-w-[440px] flex-col gap-6 rounded-lg border border-border bg-card p-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] leading-tight font-semibold">{title}</h1>
          {description ? <p className="text-base text-muted-foreground">{description}</p> : null}
        </div>
        {children}
      </section>
      {footer ? <div className="text-base text-muted-foreground">{footer}</div> : null}
    </main>
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
