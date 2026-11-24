import { createContext, Suspense, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router"
import { ArrowLeftIcon, Building2Icon, ChevronRightIcon, GlobeIcon, KeyRoundIcon, PackageIcon, PrinterIcon, ShieldIcon, StoreIcon, TruckIcon, UsersIcon, WebhookIcon, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { Button } from "../../../components/ui/button"
import { Card } from "../../../components/ui/card"
import { Skeleton } from "../../../components/ui/skeleton"
import { FormAlert } from "../../../components/auth/auth-card"
import { isOwner, refreshCounterStatus, useWorkspace, type Workspace } from "../../../shell/workspace"
import { api, ApiError } from "../../../lib/api"

// Tenant-scoped in-memory stale-while-revalidate cache so switching between Pengaturan sub-pages never flashes blank
// skeletons while background revalidation keeps data fresh.
const viewCache = new Map<string, unknown>()
export function readSettingsCache<T>(key: string): T | null {
  return (viewCache.get(key) as T | undefined) ?? null
}
export function writeSettingsCache<T>(key: string, value: T): void {
  viewCache.set(key, value)
}

const SettingsShellContext = createContext(false)

// Pengaturan (visual 08 §2, DEC-223, DEC-240 — TokoPhi settings rail): ≥ 1024 px a framed left rail (icon, title,
// one-line subtitle) beside the section, one card only (DEC-243: identity and Mengantar state already sit in the
// shell); `/pengaturan` itself opens the first section there. Phones
// get a grouped directory on `/pengaturan` and a `Semua Pengaturan` back link on each section. Kasir sees only
// `Printer & Struk`.
interface SettingsItem { to: string; label: string; hint: string; icon: LucideIcon; owner: boolean }
export const SETTINGS_GROUPS: Array<{ label: string; items: SettingsItem[] }> = [
  {
    label: "Gerai",
    items: [
      { to: "/pengaturan/profil", label: "Profil Gerai", hint: "Nama, WA & titik jemput", icon: StoreIcon, owner: true },
      { to: "/pengaturan/mini-site", label: "Mini-Site", hint: "Alamat & domain sendiri", icon: GlobeIcon, owner: true },
      { to: "/pengaturan/data-usaha", label: "Data Usaha", hint: "Badan usaha, NIB & NPWP", icon: Building2Icon, owner: true },
    ],
  },
  {
    label: "Operasional",
    items: [
      { to: "/pengaturan/ekspedisi", label: "Ekspedisi Aktif", hint: "Kurir & cara serah paket", icon: TruckIcon, owner: true },
      { to: "/pengaturan/printer", label: "Printer & Struk", hint: "Format label & isi struk", icon: PrinterIcon, owner: false },
      { to: "/pengaturan/label-privasi", label: "Label & Privasi", hint: "Masking & dropshipper", icon: ShieldIcon, owner: true },
      { to: "/pengaturan/packing", label: "Packing & Biaya", hint: "Item packing & biaya loket", icon: PackageIcon, owner: true },
    ],
  },
  {
    label: "Akun & Akses",
    items: [
      { to: "/pengaturan/anggota", label: "Anggota", hint: "Kasir, undangan & izin COD", icon: UsersIcon, owner: true },
      { to: "/pengaturan/mengantar", label: "Mengantar", hint: "Koneksi & webhook", icon: WebhookIcon, owner: true },
      { to: "/pengaturan/api-mcp", label: "API & MCP", hint: "Kunci API & asisten AI", icon: KeyRoundIcon, owner: true },
    ],
  },
]

function visibleGroups(owner: boolean) {
  return SETTINGS_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => owner || !i.owner) })).filter((g) => g.items.length)
}

/** Amber "needs attention" marker on the Mengantar item while its webhook is not active (owner workspace hint). */
const attention = (w: Workspace, to: string) => to === "/pengaturan/mengantar" && !!w.hints.mengantarWebhook

/** One rail / directory row: icon tile + title + one-line subtitle. The whole row is the link. */
function SettingsLink({ item, active, warn, size }: { item: SettingsItem; active: boolean; warn: boolean; size: "rail" | "list" }) {
  const Icon = item.icon
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        size === "rail" ? "px-2.5 py-1.5" : "min-h-16 px-4 py-3",
        active ? "bg-primary/8 text-primary" : "text-slate-900 hover:bg-slate-50",
      )}
    >
      <span className={cn("relative grid size-8 shrink-0 place-items-center rounded-md [&_svg]:size-4", active ? "bg-primary/12 text-primary" : "bg-slate-100 text-slate-600")}>
        <Icon aria-hidden />
        {warn ? <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-white bg-warn" aria-hidden /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{item.label}</span>
        <span className={cn("truncate text-xs", active ? "text-primary/80" : "text-muted-foreground")}>{warn ? "Webhook perlu diatur" : item.hint}</span>
      </span>
      {size === "list" ? <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : null}
    </Link>
  )
}

function SettingsRail() {
  const w = useWorkspace()
  const owner = isOwner(w)
  const path = useRouterState({ select: (s) => s.location.pathname })
  return (
    <aside aria-label="Navigasi pengaturan" data-settings-rail className="thin-scrollbar hidden lg:sticky lg:top-[5.25rem] lg:block lg:max-h-[calc(100dvh-6.5rem)] lg:overflow-y-auto lg:overscroll-y-contain lg:pr-1">
      <Card className="gap-0 p-1.5 md:p-1.5">
        <nav aria-label="Menu pengaturan">
          {visibleGroups(owner).map((g) => (
            <div key={g.label} className="not-first:mt-1 not-first:border-t not-first:border-slate-100 not-first:pt-1">
              <p className="px-2.5 pt-1.5 pb-1 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">{g.label}</p>
              <ul className="flex flex-col gap-0.5">
                {g.items.map((i) => (
                  <li key={i.to}>
                    <SettingsLink item={i} active={path === i.to} warn={attention(w, i.to)} size="rail" />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </Card>
    </aside>
  )
}

/**
 * Persistent parent shell for all `/pengaturan/*` routes: keeps `<aside data-settings-rail>` mounted across sub-page
 * switches (zero flicker, preserves rail scroll, and scopes Suspense fallbacks to the right content column).
 */
export function SettingsShell() {
  const path = useRouterState({ select: (s) => s.location.pathname })
  if (path === "/pengaturan" || path === "/pengaturan/") {
    return (
      <Suspense fallback={<div className="flex max-w-2xl flex-col gap-3" aria-busy="true" aria-label="Memuat pengaturan"><Skeleton className="h-10 w-48" /><Skeleton className="h-40 w-full" /></div>}>
        <Outlet />
      </Suspense>
    )
  }
  return (
    <SettingsShellContext.Provider value={true}>
      <div className="grid items-start gap-6 pb-24 md:pb-0 lg:-mb-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* DEC-242: a secondary sidebar — pinned 84 px down (64 px topbar + 20 px) and bounded to the viewport
            (100dvh − 6.5rem), so scrolling the form never moves it, while the rail itself scrolls when it is taller than
            the screen. The grid row reaches over the main area's 32 px bottom padding (grid `lg:-mb-8`, content column `lg:pb-8`):
            sticky is bounded by its grid area, and without that the rail is pushed up 12 px at the end of the page. */}
        <SettingsRail />
        <div className="flex w-full max-w-4xl min-w-0 flex-col gap-4 md:gap-5 lg:pb-8">
          <Suspense fallback={<div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat halaman pengaturan"><Skeleton className="h-12 w-56" /><Skeleton className="h-44 w-full" /></div>}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </SettingsShellContext.Provider>
  )
}

/** Section page frame: header + content inside persistent SettingsShell (falls back to full rail if rendered standalone). */
export function SettingsLayout({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  const inShell = useContext(SettingsShellContext)
  const content = (
    <>
      <div className="flex flex-col gap-3">
        <Link to="/pengaturan" className="inline-flex h-11 w-fit items-center gap-1.5 rounded-lg pr-2 text-sm font-medium text-muted-foreground hover:text-slate-950 lg:hidden">
          <ArrowLeftIcon aria-hidden className="size-4" /> Semua Pengaturan
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-xl leading-tight font-semibold tracking-[-0.02em] text-slate-950 md:text-2xl">{title}</h1>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </div>
      {children}
    </>
  )
  if (inShell) return content
  return (
    <div className="grid items-start gap-6 pb-24 md:pb-0 lg:-mb-8 lg:grid-cols-[260px_minmax(0,1fr)]">
      <SettingsRail />
      <div className="flex w-full max-w-4xl min-w-0 flex-col gap-4 md:gap-5 lg:pb-8">{content}</div>
    </div>
  )
}

const DESKTOP = "(min-width: 1024px)"
/** Live `(min-width: 1024px)`: re-renders when the window crosses the breakpoint (Sol R1 #2), not only on mount. */
const subscribeDesktop = (cb: () => void) => {
  const m = window.matchMedia(DESKTOP)
  m.addEventListener("change", cb)
  return () => m.removeEventListener("change", cb)
}
const useDesktop = () => useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => false)

/** `/pengaturan`: ≥ 1024 px opens the first section (replace); phones and tablets get the grouped directory. */
export function PengaturanIndexPage() {
  const w = useWorkspace()
  const groups = visibleGroups(isOwner(w))
  const desktop = useDesktop()
  if (desktop) return <Navigate to={groups[0]!.items[0]!.to} replace />
  return (
    <div className="flex max-w-2xl flex-col gap-5 pb-24 md:pb-0">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl leading-tight font-semibold tracking-[-0.02em] text-slate-950 md:text-2xl">Pengaturan</h1>
        <p className="text-sm text-muted-foreground">Kelola profil gerai, ekspedisi, label struk, domain mini-site, dan integrasi API.</p>
      </div>
      {groups.map((g) => (
        <section key={g.label} aria-labelledby={`g-${g.label}`} className="flex flex-col gap-2">
          <h2 id={`g-${g.label}`} className="px-1 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">{g.label}</h2>
          <Card className="gap-0 py-0 md:py-0">
            <ul className="divide-y divide-slate-100">
              {g.items.map((i) => (
                <li key={i.to}>
                  <SettingsLink item={i} active={false} warn={attention(w, i.to)} size="list" />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  )
}

/** Sticky save bar shown only when the form is dirty; warns before leaving with unsaved changes. */
export function SaveBar({ dirty, pending, onCancel, onSave }: { dirty: boolean; pending: boolean; onCancel: () => void; onSave: () => void }) {
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", h)
    return () => window.removeEventListener("beforeunload", h)
  }, [dirty])
  if (!dirty) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex flex-wrap items-center justify-end gap-2 border-t bg-white p-3 shadow-[0_-1px_2px_rgba(15,23,42,0.04)] md:sticky md:bottom-4 md:rounded-xl md:border md:border-slate-200 md:px-4">
      <span className="mr-auto flex items-center gap-2 text-sm text-muted-foreground"><span aria-hidden className="size-2 rounded-full bg-warn" />Ada perubahan belum disimpan</span>
      <Button variant="outline" onClick={onCancel} disabled={pending}>Batal</Button>
      <Button onClick={onSave} disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</Button>
    </div>
  )
}

export function Notice({ msg }: { msg: { tone: "safe" | "danger"; text: string } | null }) {
  return msg ? <FormAlert tone={msg.tone}>{msg.text}</FormAlert> : null
}

/**
 * One owner settings form: loads `/settings`, keeps a saved copy and an editable copy (dirty = they differ), posts the
 * form to `/settings/<endpoint>` and adopts the server's answer. Field errors come back keyed by field name.
 */
export function useSettingsForm<T>(pick: (s: SettingsView) => T, endpoint: string, toBody: (f: T) => unknown = (f) => f) {
  const w = useWorkspace()
  const cacheKey = `settings:${w.tenant.id}`
  const [{ saved, form }, setPair] = useState<{ saved: T | null; form: T | null }>(() => {
    const initial = readSettingsCache<SettingsView>(cacheKey)
    if (!initial) return { saved: null, form: null }
    const p = pick(initial)
    return { saved: p, form: p }
  })
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ tone: "safe" | "danger"; text: string } | null>(null)
  const [pending, setPending] = useState(false)
  const gen = useRef(0)
  const load = useCallback(() => {
    const mine = ++gen.current
    api<SettingsView>("/settings")
      .then((s) => {
        if (mine !== gen.current) return
        writeSettingsCache(cacheKey, s)
        setError(null)
        const picked = pick(s)
        setPair((prev) => ({
          saved: picked,
          form: prev.form === null || JSON.stringify(prev.form) === JSON.stringify(prev.saved) ? picked : prev.form,
        }))
      })
      .catch((e) => {
        if (mine !== gen.current) return
        if (!readSettingsCache<SettingsView>(cacheKey)) setError(e instanceof ApiError ? e.body.message : "Pengaturan tidak dapat dimuat.")
      })
    // `pick` is a stable module-level selector for each page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey])
  useEffect(() => {
    load()
    const g = gen
    return () => {
      g.current++
    }
  }, [load])
  const setForm = useCallback((next: T | null) => setPair((prev) => ({ ...prev, form: next })), [])
  const cancel = useCallback(() => setPair((prev) => ({ ...prev, form: prev.saved })), [])
  async function save() {
    if (!form || pending) return
    const mine = ++gen.current
    setPending(true)
    setMsg(null)
    setFields({})
    try {
      const s = await api<SettingsView>(`/settings/${endpoint}`, { body: toBody(form) })
      if (mine !== gen.current) return
      writeSettingsCache(cacheKey, s)
      refreshCounterStatus()
      const picked = pick(s)
      setPair({ saved: picked, form: picked })
      setMsg({ tone: "safe", text: "Perubahan tersimpan." })
    } catch (e) {
      if (mine !== gen.current) return
      if (e instanceof ApiError) {
        setFields(e.body.field_errors ?? {})
        setMsg({ tone: "danger", text: e.body.message })
      } else setMsg({ tone: "danger", text: "Gagal menyimpan. Coba lagi." })
    } finally {
      if (mine === gen.current) setPending(false)
    }
  }
  const dirty = form !== null && JSON.stringify(form) !== JSON.stringify(saved)
  return { saved, form, setForm, error, fields, msg, pending, dirty, load, save, cancel }
}

export interface SettingsView {
  profile: { name: string; whatsapp: string | null; openingHours: string | null; areaId: string | null; areaLabel: string | null; street: string | null; postalCode: string | null; logoMediaId: string | null; latitude: number | null; longitude: number | null } | null
  business: { entityType: string | null; legalName: string | null; brandName: string | null; nib: string | null; npwpMasked: string | null; registeredAddress: string | null; picName: string | null; picRole: string | null; picEmail: string | null; picPhone: string | null }
  receipt: { defaultLabelFormat: string; unboxingRemark: string; showCommission: boolean }
  packing: { items: Array<{ id: string | null; name: string; priceIdr: number; active: boolean }>; serviceFeeEnabled: boolean; serviceFeeIdr: number | null }
  cashierMayPay: boolean
}
