import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Link, useRouterState } from "@tanstack/react-router"
import { ChevronRightIcon } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { FormAlert } from "../../../components/auth/auth-card"
import { isOwner, useWorkspace } from "../../../shell/workspace"
import { api, ApiError } from "../../../lib/api"
import { ItemList } from "../../../components/admin/page"

// Pengaturan sub-navigation (visual 08 §2, DEC-223): desktop left menu inside the page (≥ 1024 px), phone grouped
// list on `/pengaturan`; items are links with `aria-current`. Kasir sees only `Printer & Struk`.
export const SETTINGS_GROUPS: Array<{ label: string; items: Array<{ to: string; label: string; owner: boolean }> }> = [
  {
    label: "Gerai",
    items: [
      { to: "/pengaturan/profil", label: "Profil Gerai", owner: true },
      { to: "/pengaturan/mini-site", label: "Mini-Site", owner: true },
      { to: "/pengaturan/data-usaha", label: "Data Usaha", owner: true },
    ],
  },
  {
    label: "Operasional",
    items: [
      { to: "/pengaturan/ekspedisi", label: "Ekspedisi Aktif", owner: true },
      { to: "/pengaturan/printer", label: "Printer & Struk", owner: false },
      { to: "/pengaturan/label-privasi", label: "Label & Privasi", owner: true },
      { to: "/pengaturan/packing", label: "Packing & Biaya", owner: true },
    ],
  },
  {
    label: "Akun & Akses",
    items: [
      { to: "/pengaturan/anggota", label: "Anggota", owner: true },
      { to: "/pengaturan/mengantar", label: "Mengantar", owner: true },
      { to: "/pengaturan/api-mcp", label: "API & MCP", owner: true },
    ],
  },
]

function visibleGroups(owner: boolean) {
  return SETTINGS_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => owner || !i.owner) })).filter((g) => g.items.length)
}

/** Desktop menu + content; on phones only the content with a back link. */
export function SettingsLayout({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const w = useWorkspace()
  const path = useRouterState({ select: (s) => s.location.pathname })
  return (
    <div className="pb-24 lg:grid lg:grid-cols-[240px_1fr] lg:gap-8 md:pb-0">
      <nav aria-label="Menu pengaturan" className="hidden lg:block">
        <h2 className="mb-4 text-[28px] leading-tight font-semibold">Pengaturan</h2>
        {visibleGroups(isOwner(w)).map((g) => (
          <div key={g.label} className="mb-4">
            <p className="mb-1 px-3 text-sm font-semibold text-muted-foreground">{g.label}</p>
            <ul className="flex flex-col gap-0.5">
              {g.items.map((i) => (
                <li key={i.to}>
                  <Link to={i.to} aria-current={path === i.to ? "page" : undefined} className={`flex h-10 items-center rounded-md px-3 text-base ${path === i.to ? "bg-accent font-medium text-accent-foreground" : "hover:bg-muted"}`}>{i.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <main className="mx-auto flex w-full max-w-[880px] flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-[28px] leading-tight font-semibold">{title}</h2>
          {description ? <p className="text-base text-muted-foreground">{description}</p> : null}
        </div>
        {children}
      </main>
    </div>
  )
}

/** `/pengaturan`: phone grouped list; desktop jumps to the first item. */
export function PengaturanIndexPage() {
  const w = useWorkspace()
  return (
    <div className="pb-24 md:pb-0">
      <h2 className="mb-6 text-[28px] leading-tight font-semibold">Pengaturan</h2>
      <div className="flex max-w-[640px] flex-col gap-6">
        {visibleGroups(isOwner(w)).map((g) => (
          <section key={g.label} aria-labelledby={`g-${g.label}`}>
            <h3 id={`g-${g.label}`} className="mb-2 text-base font-semibold text-muted-foreground">{g.label}</h3>
            <ItemList>
              {g.items.map((i) => (
                <li key={i.to}>
                  <Link to={i.to} className="flex min-h-14 items-center justify-between gap-3 px-4 text-base hover:bg-muted">
                    {i.label} <ChevronRightIcon aria-hidden className="size-5 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ItemList>
          </section>
        ))}
      </div>
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
    <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-end gap-2 border-t bg-card p-3 md:sticky md:rounded-lg md:border">
      <span className="mr-auto text-base text-muted-foreground">Ada perubahan belum disimpan</span>
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
  const [saved, setSaved] = useState<T | null>(null)
  const [form, setForm] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ tone: "safe" | "danger"; text: string } | null>(null)
  const [pending, setPending] = useState(false)
  const load = useCallback(() => {
    api<SettingsView>("/settings")
      .then((s) => {
        setError(null)
        setSaved(pick(s))
        setForm(pick(s))
      })
      .catch((e) => setError(e instanceof ApiError ? e.body.message : "Pengaturan tidak dapat dimuat."))
    // `pick` is a stable module-level selector for each page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(load, [load])
  async function save() {
    if (!form) return
    setPending(true)
    setMsg(null)
    setFields({})
    try {
      const s = await api<SettingsView>(`/settings/${endpoint}`, { body: toBody(form) })
      setSaved(pick(s))
      setForm(pick(s))
      setMsg({ tone: "safe", text: "Perubahan tersimpan." })
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.body.field_errors ?? {})
        setMsg({ tone: "danger", text: e.body.message })
      } else setMsg({ tone: "danger", text: "Gagal menyimpan. Coba lagi." })
    } finally {
      setPending(false)
    }
  }
  const dirty = form !== null && JSON.stringify(form) !== JSON.stringify(saved)
  return { saved, form, setForm, error, fields, msg, pending, dirty, load, save, cancel: () => setForm(saved) }
}

export interface SettingsView {
  profile: { name: string; whatsapp: string | null; openingHours: string | null; areaId: string | null; areaLabel: string | null; street: string | null; postalCode: string | null; logoMediaId: string | null; latitude: number | null; longitude: number | null } | null
  business: { entityType: string | null; legalName: string | null; brandName: string | null; nib: string | null; npwpMasked: string | null; registeredAddress: string | null; picName: string | null; picRole: string | null; picEmail: string | null; picPhone: string | null }
  receipt: { defaultLabelFormat: string; unboxingRemark: string; showCommission: boolean }
  packing: { items: Array<{ id: string | null; name: string; priceIdr: number; active: boolean }>; serviceFeeEnabled: boolean; serviceFeeIdr: number | null }
  cashierMayPay: boolean
}
