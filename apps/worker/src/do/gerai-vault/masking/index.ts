// Masking inside the tenant object (TASK-305, ADR-0005, DEC-231). Settings live in `tenant_settings`; the platform
// kill-switch and daily quota live in D1 `tenants` and are passed in by the caller. The quota is consumed in the same
// transaction as the issue, so two counters cannot both take the last slot.
import { effectiveDefault, isSenderMasked, MASK_PRESETS, offeredPresets, printedIdentity, wibDay, type MaskingSettings, type MaskPreset } from "@gx/domain/masking"

export interface Platform {
  maskingEnabled: boolean
  dailyQuota: number | null
}

export function readSettings(sql: SqlStorage, platform: Platform): MaskingSettings & { maskRecipientOnCod: boolean } {
  const r = sql.exec<{ masking_offered: number; masking_presets_enabled: string; masking_default_preset: string; mask_recipient_phone_on_cod_default: number }>(
    "SELECT masking_offered, masking_presets_enabled, masking_default_preset, mask_recipient_phone_on_cod_default FROM tenant_settings LIMIT 1",
  ).toArray()[0]
  let presets: MaskPreset[]
  try {
    presets = (JSON.parse(r?.masking_presets_enabled ?? "[]") as string[]).filter((p): p is MaskPreset => (MASK_PRESETS as readonly string[]).includes(p))
  } catch {
    presets = []
  }
  return {
    platformEnabled: platform.maskingEnabled,
    offered: r?.masking_offered === 1,
    presetsEnabled: presets,
    defaultPreset: ((MASK_PRESETS as readonly string[]).includes(r?.masking_default_preset ?? "") ? r!.masking_default_preset : "standar_gerai") as MaskPreset,
    maskRecipientOnCod: r?.mask_recipient_phone_on_cod_default === 1,
  }
}

export type SettingsInput = { offered?: unknown; presetsEnabled?: unknown; defaultPreset?: unknown; maskRecipientOnCod?: unknown }

/** Owner saves `Label & Privasi`; refuses a default that is not among the enabled presets. */
export function writeSettings(sql: SqlStorage, tenantId: string, input: SettingsInput, actorId: string, now: number): { ok: true } | { ok: false; field: string; message: string } {
  const presets = Array.isArray(input.presetsEnabled) ? (input.presetsEnabled as unknown[]).filter((p): p is MaskPreset => typeof p === "string" && (MASK_PRESETS as readonly string[]).includes(p) && p !== "standar_gerai") : []
  const def = (MASK_PRESETS as readonly string[]).includes(String(input.defaultPreset)) ? (input.defaultPreset as MaskPreset) : "standar_gerai"
  if (def !== "standar_gerai" && !presets.includes(def)) return { ok: false, field: "defaultPreset", message: "Preset bawaan harus salah satu preset yang diaktifkan." }
  sql.exec(
    `INSERT INTO tenant_settings (tenant_id, masking_offered, masking_presets_enabled, masking_default_preset, mask_recipient_phone_on_cod_default, updated_at, updated_by)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(tenant_id) DO UPDATE SET masking_offered = ?2, masking_presets_enabled = ?3, masking_default_preset = ?4, mask_recipient_phone_on_cod_default = ?5, updated_at = ?6, updated_by = ?7`,
    tenantId,
    input.offered === true ? 1 : 0,
    JSON.stringify(presets),
    def,
    input.maskRecipientOnCod === true ? 1 : 0,
    now,
    actorId,
  )
  return { ok: true }
}

export function usedToday(sql: SqlStorage, now: number): number {
  return sql.exec<{ count: number }>("SELECT count FROM masking_usage WHERE wib_day = ?", wibDay(now)).toArray()[0]?.count ?? 0
}

/** Counter view: offered presets, default, quota left (null = no cap), and whether sender-masked presets are blocked. */
export function maskingState(sql: SqlStorage, platform: Platform, now: number) {
  const s = readSettings(sql, platform)
  const used = usedToday(sql, now)
  const left = platform.dailyQuota === null ? null : Math.max(0, platform.dailyQuota - used)
  return { presets: offeredPresets(s), defaultPreset: effectiveDefault(s), maskRecipientOnCod: s.maskRecipientOnCod, quotaLeft: left, quotaExhausted: left === 0, killSwitchOff: !platform.maskingEnabled }
}

/**
 * Validates the preset at issue (ADR-0005): must be offered now; a sender-masked send needs quota left and is counted
 * here (inside the issue transaction). Never a silent fallback.
 */
export function claimPreset(sql: SqlStorage, platform: Platform, preset: MaskPreset, senderIsReseller: boolean, now: number): { ok: true } | { ok: false; status: number; code: string; message: string } {
  const s = readSettings(sql, platform)
  if (!offeredPresets(s).includes(preset)) return { ok: false, status: 422, code: "MASKING_NOT_OFFERED", message: "Preset label ini tidak aktif di gerai. Pilih Standar Gerai." }
  if (!isSenderMasked(preset, senderIsReseller)) return { ok: true }
  if (platform.dailyQuota !== null && usedToday(sql, now) >= platform.dailyQuota) {
    return { ok: false, status: 422, code: "MASKING_QUOTA_EXCEEDED", message: "Kuota masking hari ini habis. Ganti ke Standar Gerai untuk melanjutkan." }
  }
  sql.exec("INSERT INTO masking_usage (wib_day, count) VALUES (?, 1) ON CONFLICT(wib_day) DO UPDATE SET count = count + 1", wibDay(now))
  return { ok: true }
}

/** Returns a slot when an issue that claimed one did not happen (rejected by the provider). */
export function releasePreset(sql: SqlStorage, preset: MaskPreset, senderIsReseller: boolean, claimedAt: number): void {
  if (!isSenderMasked(preset, senderIsReseller)) return
  sql.exec("UPDATE masking_usage SET count = MAX(0, count - 1) WHERE wib_day = ?", wibDay(claimedAt))
}

export { printedIdentity }
