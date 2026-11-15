// Courier catalog (D1, platform) + per-outlet preferences (tenant object) → `Pengaturan › Ekspedisi Aktif` (TASK-206,
// DEC-223, spec 04 §2). The catalog is data; a courier's pickup capability bounds the outlet's choice.
import { AppError } from "../http/envelope"
import { vaultFor } from "../do/gerai-vault/stub"

export type PickupCapability = "pickup_and_drop_off" | "pickup_only" | "drop_off_only"
export type PickupMode = "scheduled_pickup" | "drop_off_only"

export interface CatalogService {
  service_code: string
  courier_code: string
  courier_name: string
  display_name: string
  service_class: "regular" | "cargo"
  pickup_capability: PickupCapability
  cod_supported: number
  is_active: number
  sort_order: number
  note: string | null
}

export interface CourierPref {
  courier_code: string
  enabled: number
  pickup_mode: PickupMode
  updated_at: number
}

export interface CourierRow {
  courierCode: string
  name: string
  enabled: boolean
  pickupMode: PickupMode
  pickupOptions: PickupMode[]
  services: Array<{ serviceCode: string; name: string; serviceClass: "regular" | "cargo"; cod: boolean }>
  note: string | null
}

export async function activeCatalog(db: D1Database): Promise<CatalogService[]> {
  return (await db.prepare("SELECT * FROM courier_service_catalog WHERE is_active = 1 ORDER BY sort_order").all<CatalogService>()).results
}

export function pickupOptions(capabilities: PickupCapability[]): PickupMode[] {
  // A courier is pickup-capable if any of its services is; drop-off likewise.
  const pickup = capabilities.some((c) => c !== "drop_off_only")
  const drop = capabilities.some((c) => c !== "pickup_only")
  return [...(pickup ? (["scheduled_pickup"] as const) : []), ...(drop ? (["drop_off_only"] as const) : [])]
}

/** Default when the outlet never changed a courier: enabled, pickup when the courier supports it. */
export function defaultPref(options: PickupMode[]): PickupMode {
  return options.includes("scheduled_pickup") ? "scheduled_pickup" : "drop_off_only"
}

export function mergeCouriers(catalog: CatalogService[], prefs: CourierPref[]): CourierRow[] {
  const byCourier = new Map<string, CatalogService[]>()
  for (const s of catalog) byCourier.set(s.courier_code, [...(byCourier.get(s.courier_code) ?? []), s])
  const prefOf = new Map(prefs.map((p) => [p.courier_code, p]))
  return [...byCourier.entries()].map(([code, services]) => {
    const options = pickupOptions(services.map((s) => s.pickup_capability))
    const p = prefOf.get(code)
    const mode = p && options.includes(p.pickup_mode) ? p.pickup_mode : defaultPref(options)
    return {
      courierCode: code,
      name: services[0]!.courier_name,
      enabled: p ? p.enabled === 1 : true,
      pickupMode: mode,
      pickupOptions: options,
      services: services.map((s) => ({ serviceCode: s.service_code, name: s.display_name, serviceClass: s.service_class, cod: s.cod_supported === 1 })),
      note: services.find((s) => s.service_class === "regular")?.note ?? null,
    }
  })
}

const refused = (): never => {
  throw new AppError(503, "TENANT_NOT_READY", "Data gerai sedang diperbarui. Coba lagi sebentar lagi.")
}

export async function listCouriers(env: Env, tenantId: string): Promise<CourierRow[]> {
  const [catalog, prefs] = await Promise.all([activeCatalog(env.DB), vaultFor(env, tenantId).courierPrefs(tenantId)])
  if (!prefs.ok) return refused()
  return mergeCouriers(catalog, prefs.value)
}

/** Instant-save toggle / pickup mode (DEC-223). Validates against the catalog; returns the updated row. */
export async function updateCourier(env: Env, tenantId: string, actorId: string, courierCode: string, patch: { enabled?: unknown; pickupMode?: unknown }): Promise<CourierRow> {
  const catalog = await activeCatalog(env.DB)
  const row = mergeCouriers(catalog, []).find((c) => c.courierCode === courierCode)
  if (!row) throw new AppError(404, "COURIER_NOT_FOUND", "Ekspedisi tidak tersedia.")
  if (patch.enabled !== undefined && typeof patch.enabled !== "boolean") throw new AppError(400, "INVALID_INPUT", "Pilihan aktif tidak valid.")
  if (patch.pickupMode !== undefined && !row.pickupOptions.includes(patch.pickupMode as PickupMode)) {
    throw new AppError(400, "PICKUP_MODE_UNSUPPORTED", `${row.name} tidak mendukung pilihan penjemputan ini.`, { pickupMode: "Pilihan tidak didukung ekspedisi ini." })
  }
  const r = await vaultFor(env, tenantId).setCourierPref(tenantId, {
    courierCode,
    enabled: patch.enabled as boolean | undefined,
    pickupMode: patch.pickupMode as PickupMode | undefined,
    defaultMode: defaultPref(row.pickupOptions),
    actorId,
  })
  if (!r.ok) return refused()
  return mergeCouriers(catalog, r.value).find((c) => c.courierCode === courierCode)!
}
