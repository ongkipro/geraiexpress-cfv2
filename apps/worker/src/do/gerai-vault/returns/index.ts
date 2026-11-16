// Meja Retur (TASK-404, spec 04 §2, ADR-0005, DEC-206). Intake records condition + photo and custody `rts_at_gerai`;
// the true sender is revealed with an audit row; a 4-digit `Kode Ambil` is shown once to the counter for the WhatsApp
// message and stored only as a salted SHA-256; handback by code (5 wrong → 15 min lock) or owner ID override with a
// reason records custody `rts_returned_to_sender`. Contradicting provider data surfaces as `Status Bertentangan`.
import { normalizeSlug } from "@gx/domain/slug"
import { recordCustody } from "../status"

export type ReturnError = { status: number; code: string; message: string; fields?: Record<string, string> }
const err = (status: number, code: string, message: string, fields?: Record<string, string>): { ok: false; error: ReturnError } => ({ ok: false, error: { status, code, message, fields } })

export const STORAGE_DAYS = 14
export const CODE_MAX_WRONG = 5
export const CODE_LOCK_MS = 15 * 60_000
const CONDITIONS = ["baik", "penyok_rusak", "terbuka"] as const
export type Condition = (typeof CONDITIONS)[number]

async function hashCode(code: string, salt: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${code}`))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/** CSPRNG 4-digit code, uniform over 0000..9999 (rejection sampling). */
export function newPickupCode(): string {
  const buf = new Uint16Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0]! < 60000) return String(buf[0]! % 10000).padStart(4, "0")
  }
}

export type IntakeRow = {
  slug: string
  condition: Condition
  photo_r2_key: string | null
  note: string | null
  intake_at: number
  code_issued_at: number | null
  code_attempts: number
  code_locked_until: number | null
  storage_deadline_at: number
  handback_at: number | null
  handback_method: string | null
  claim_offered: number
}

type ShipRow = { slug: string; awb_number: string | null; courier_code: string; status: string; provider_status: string | null; custody_stage: string; true_sender_json: string | null; mask_preset: string | null; provider_status_conflict_at: number | null }

export function findForIntake(sql: SqlStorage, code: string): ShipRow | null {
  const raw = code.trim()
  const slug = normalizeSlug(raw)
  return (
    sql
      .exec<ShipRow>(
        "SELECT slug, awb_number, courier_code, status, provider_status, custody_stage, true_sender_json, mask_preset, provider_status_conflict_at FROM shipments WHERE slug = ? OR UPPER(awb_number) = ? LIMIT 1",
        slug ?? "~",
        raw.replace(/\s+/g, "").toUpperCase(),
      )
      .toArray()[0] ?? null
  )
}

/** Step 1: intake. Allowed only for a parcel that left the outlet (custody handed or provider in transit/return). */
export function intake(sql: SqlStorage, tenantId: string, p: { code: string; condition: unknown; photoKey: string | null; note: unknown; actorId: string }, now: number): { ok: true; value: { slug: string; conflict: boolean } } | { ok: false; error: ReturnError } {
  const s = findForIntake(sql, p.code)
  if (!s) return err(404, "NOT_FOUND", "Paket ini tidak terdaftar di gerai ini.")
  if (!s.awb_number || (s.custody_stage === "none" && (!s.provider_status || s.provider_status === "ready_for_pickup"))) return err(409, "NOT_SENT", "Kiriman ini belum pernah diserahkan ke kurir; tidak bisa diterima sebagai retur.")
  if (s.custody_stage === "rts_returned_to_sender" || s.custody_stage === "cancelled_local") return err(409, "CLOSED", "Kiriman ini sudah selesai; tidak bisa diterima sebagai retur.")
  const condition = (CONDITIONS as readonly string[]).includes(String(p.condition)) ? (p.condition as Condition) : null
  if (!condition) return err(422, "INVALID_CONDITION", "Pilih kondisi paket.", { condition: "Pilih kondisi paket." })
  if ((condition === "penyok_rusak" || condition === "terbuka") && !p.photoKey) return err(422, "PHOTO_REQUIRED", "Foto paket wajib untuk paket rusak atau terbuka.", { photo: "Ambil foto paket." })
  const prior = sql.exec<{ slug: string }>("SELECT slug FROM return_intakes WHERE slug = ?", s.slug).toArray()[0]
  if (prior) return err(409, "ALREADY_INTAKEN", "Paket retur ini sudah diterima sebelumnya.")
  const note = typeof p.note === "string" ? p.note.replace(/\s+/g, " ").trim().slice(0, 200) || null : null
  sql.exec(
    `INSERT INTO return_intakes (slug, tenant_id, condition, photo_r2_key, note, intake_by, intake_at, storage_deadline_at, claim_offered) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    s.slug,
    tenantId,
    condition,
    p.photoKey,
    note,
    p.actorId,
    now,
    now + STORAGE_DAYS * 86_400_000,
    condition === "baik" ? 0 : 1,
  )
  recordCustody(sql, { slug: s.slug, stage: "rts_at_gerai", eventKey: `custody:retur:${s.slug}` }, now)
  // Provider says delivered/lost while the parcel is physically here → `Status Bertentangan` (spec 01 §3).
  const conflict = sql.exec<{ c: number | null }>("SELECT CASE WHEN conflict_resolved_at IS NULL THEN provider_status_conflict_at END AS c FROM shipments WHERE slug = ?", s.slug).one().c !== null
  return { ok: true, value: { slug: s.slug, conflict } }
}

/** Step 2: (re)issue the 4-digit code; the plain code is returned once for the WhatsApp message, never stored. */
export async function issueCode(sql: SqlStorage, slug: string, now: number): Promise<{ ok: true; value: { code: string } } | { ok: false; error: ReturnError }> {
  const r = sql.exec<IntakeRow>("SELECT * FROM return_intakes WHERE slug = ?", slug).toArray()[0]
  if (!r) return err(404, "NOT_INTAKEN", "Paket ini belum diterima di Meja Retur.")
  if (r.handback_at) return err(409, "ALREADY_RETURNED", "Paket ini sudah diserahkan ke pengirim.")
  const code = newPickupCode()
  const salt = crypto.randomUUID()
  sql.exec("UPDATE return_intakes SET code_hash = ?, code_salt = ?, code_issued_at = ?, code_attempts = 0, code_locked_until = NULL WHERE slug = ?", await hashCode(code, salt), salt, now, slug)
  return { ok: true, value: { code } }
}

/** Step 3: handback by code (constant-length compare on hashes; 5 wrong → 15 min lock) or owner ID override. */
export async function handback(
  sql: SqlStorage,
  p: { slug: string; code?: unknown; override?: { reason: unknown }; role: "gerai_admin" | "cashier"; actorId: string; storage: DurableObjectStorage },
  now: number,
): Promise<{ ok: true; value: { method: "code" | "id_override" } } | { ok: false; error: ReturnError }> {
  const r = sql.exec<IntakeRow & { code_hash: string | null; code_salt: string | null }>("SELECT * FROM return_intakes WHERE slug = ?", p.slug).toArray()[0]
  if (!r) return err(404, "NOT_INTAKEN", "Paket ini belum diterima di Meja Retur.")
  if (r.handback_at) return err(409, "ALREADY_RETURNED", "Paket ini sudah diserahkan ke pengirim.")
  let method: "code" | "id_override"
  let reason: string | null = null
  if (p.override) {
    if (p.role !== "gerai_admin") return err(403, "OWNER_ONLY", "Serah tanpa kode hanya bisa dilakukan pemilik gerai.")
    reason = typeof p.override.reason === "string" ? p.override.reason.replace(/\s+/g, " ").trim() : ""
    if (reason.length < 5 || reason.length > 200) return err(422, "REASON_REQUIRED", "Tulis alasan dan identitas yang dicek (min. 5 huruf).", { reason: "Wajib diisi." })
    method = "id_override"
  } else {
    if (r.code_locked_until && r.code_locked_until > now) return err(429, "CODE_LOCKED", "Terlalu banyak kode salah. Coba lagi dalam 15 menit atau kirim kode baru.")
    if (!r.code_hash || !r.code_salt) return err(409, "NO_CODE", "Kirim Kode Ambil ke pengirim dulu.")
    const code = typeof p.code === "string" ? p.code.trim() : ""
    if (!/^\d{4}$/.test(code) || (await hashCode(code, r.code_salt)) !== r.code_hash) {
      const attempts = r.code_attempts + 1
      sql.exec("UPDATE return_intakes SET code_attempts = ?, code_locked_until = ? WHERE slug = ?", attempts, attempts >= CODE_MAX_WRONG ? now + CODE_LOCK_MS : null, p.slug)
      return attempts >= CODE_MAX_WRONG ? err(429, "CODE_LOCKED", "Terlalu banyak kode salah. Coba lagi dalam 15 menit atau kirim kode baru.") : err(400, "CODE_WRONG", "Kode Ambil salah.", { code: "Kode tidak cocok." })
    }
    method = "code"
  }
  // The hash was awaited: commit only if nothing changed meanwhile (not handed back, same code), in one step.
  const res = p.storage.transactionSync(() => {
    const done = sql.exec("UPDATE return_intakes SET handback_at = ?, handback_by = ?, handback_method = ?, handback_reason = ?, code_hash = NULL, code_salt = NULL WHERE slug = ? AND handback_at IS NULL AND (? = 'id_override' OR code_hash IS ?)", now, p.actorId, method, reason, p.slug, method, r.code_hash).rowsWritten
    if (!done) return false
    recordCustody(sql, { slug: p.slug, stage: "rts_returned_to_sender", eventKey: `custody:handback:${p.slug}` }, now)
    return true
  })
  if (!res) return err(409, "ALREADY_RETURNED", "Paket ini baru saja diproses. Muat ulang halaman.")
  return { ok: true, value: { method } }
}

export type DeskRow = IntakeRow & { awb_number: string | null; courier_code: string; status: string; provider_status: string | null; conflict: number }

/** Meja Retur list: open intakes first (oldest), then recent handbacks (7 days). */
export function desk(sql: SqlStorage, now: number): { open: DeskRow[]; returned: DeskRow[]; incoming: Array<{ slug: string; awb_number: string | null; courier_code: string; status: string }> } {
  const q = (where: string, ...args: SqlStorageValue[]) =>
    sql
      .exec<DeskRow>(
        `SELECT r.slug, r.condition, r.photo_r2_key, r.note, r.intake_at, r.code_issued_at, r.code_attempts, r.code_locked_until, r.storage_deadline_at, r.handback_at, r.handback_method, r.claim_offered,
                s.awb_number, s.courier_code, s.status, s.provider_status, (s.provider_status_conflict_at IS NOT NULL AND s.conflict_resolved_at IS NULL) AS conflict
         FROM return_intakes r JOIN shipments s ON s.slug = r.slug WHERE ${where}`,
        ...args,
      )
      .toArray()
  return {
    open: q("r.handback_at IS NULL ORDER BY r.intake_at"),
    returned: q("r.handback_at >= ? ORDER BY r.handback_at DESC", now - 7 * 86_400_000),
    incoming: sql
      .exec<{ slug: string; awb_number: string | null; courier_code: string; status: string }>("SELECT slug, awb_number, courier_code, status FROM shipments WHERE status IN ('rts_in_transit','provider_returned') AND slug NOT IN (SELECT slug FROM return_intakes) ORDER BY updated_at DESC LIMIT 50")
      .toArray(),
  }
}
