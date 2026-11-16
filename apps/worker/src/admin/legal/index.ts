// Platform operator legal profile (DEC-218, spec 01 §2.1b): every field NULL until the owner fills it; NPWP is
// encrypted and shown masked to Super Admin only. Edits need recent TOTP + reason and are audited.
import type { Hono } from "hono"
import { register } from "../../api/registry"
import { auditStatement, ownerGuard, requireReason, type OwnerCtx } from "../../api/owner"
import { decryptString, encryptString } from "../../crypto/aead"
import { AppError, ok } from "../../http/envelope"

export const LEGAL_FIELDS = [
  "legal_name",
  "brand_name",
  "nib",
  "akta_number",
  "akta_date",
  "sk_kemenkumham_number",
  "pse_registration_number",
  "registered_address",
  "correspondence_address",
  "support_email",
  "support_whatsapp",
  "privacy_contact_email",
  "director_name",
] as const
type LegalField = (typeof LEGAL_FIELDS)[number]

const maskNpwp = (npwp: string) => (npwp.length <= 4 ? "••••" : `${"•".repeat(Math.max(0, npwp.length - 4))}${npwp.slice(-4)}`)

async function body(c: OwnerCtx): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json()
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerLegal(app: Hono<any>): void {
  register(app, { context: "owner", method: "GET", path: "/sistem/profil-perusahaan", auth: "owner_aal2", projection: "role" }, ownerGuard, async (c) => {
    const ctx = c as OwnerCtx
    const row = await ctx.env.DB.prepare("SELECT * FROM platform_legal_profile WHERE id = 1").first<Record<string, string | null> & { encrypted_npwp: string | null; updated_at: number | null }>()
    if (!row) return ok({ fields: {}, npwpMasked: null, updatedAt: null })
    const fields = Object.fromEntries(LEGAL_FIELDS.map((f) => [f, row[f] ?? null])) as Record<LegalField, string | null>
    const npwp = row.encrypted_npwp ? await decryptString(ctx.env.KEK_SECRET, row.encrypted_npwp, "platform-npwp").catch(() => null) : null
    return ok({ fields, npwpMasked: npwp ? maskNpwp(npwp) : null, updatedAt: row.updated_at })
  })

  register(app, { context: "owner", method: "POST", path: "/sistem/profil-perusahaan", auth: "owner_recent", projection: "role" }, ownerGuard, async (c) => {
    const ctx = c as OwnerCtx
    const b = await body(ctx)
    const reason = requireReason(b.reason)
    const input = (b.fields ?? {}) as Record<string, unknown>
    const set: Record<string, string | null> = {}
    const errors: Record<string, string> = {}
    for (const f of LEGAL_FIELDS) {
      if (!(f in input)) continue
      const v = input[f]
      if (v === null || v === "") {
        set[f] = f === "brand_name" ? "GeraiExpress" : null
        continue
      }
      if (typeof v !== "string" || v.trim().length > 300) {
        errors[f] = "Maksimal 300 karakter."
        continue
      }
      const s = v.trim()
      if ((f === "support_email" || f === "privacy_contact_email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) errors[f] = "Email tidak valid."
      else if (f === "nib" && !/^\d{13}$/.test(s)) errors[f] = "NIB terdiri dari 13 angka."
      else if (f === "support_whatsapp" && !/^(\+62|62|0)8\d{7,12}$/.test(s.replace(/[\s-]/g, ""))) errors[f] = "Nomor WhatsApp tidak valid."
      else if (f === "akta_date" && !/^\d{4}-\d{2}-\d{2}$/.test(s)) errors[f] = "Gunakan format tanggal YYYY-MM-DD."
      else set[f] = s
    }
    let npwpEnc: string | null | undefined
    if ("npwp" in input) {
      const v = input.npwp
      if (v === null || v === "") npwpEnc = null
      else if (typeof v === "string" && /^\d{15,16}$/.test(v.replace(/[.\-\s]/g, ""))) npwpEnc = await encryptString(ctx.env.KEK_SECRET, v.replace(/[.\-\s]/g, ""), "platform-npwp")
      else errors.npwp = "NPWP terdiri dari 15–16 angka."
    }
    if (Object.keys(errors).length) throw new AppError(422, "INVALID_INPUT", "Periksa kembali isian profil perusahaan.", errors)
    const cols = Object.keys(set)
    if (npwpEnc !== undefined) cols.push("encrypted_npwp")
    if (cols.length === 0) throw new AppError(422, "NOTHING_TO_SAVE", "Tidak ada perubahan untuk disimpan.")
    const now = Date.now()
    const actor = ctx.get("session").user.id
    const values = [...Object.values(set), ...(npwpEnc !== undefined ? [npwpEnc] : [])]
    await ctx.env.DB.batch([
      ctx.env.DB.prepare(`UPDATE platform_legal_profile SET ${cols.map((col, i) => `${col} = ?${i + 1}`).join(", ")}, updated_by = ?${cols.length + 1}, updated_at = ?${cols.length + 2} WHERE id = 1`).bind(...values, actor, now),
      // The audit row names the fields changed, never their values (NPWP and addresses stay out of logs).
      auditStatement(ctx.env, { actorId: actor, action: "legal_profile.update", targetType: "platform_legal_profile", reason, metadata: { fields: cols }, now }),
    ])
    return ok({ saved: cols })
  })
}
