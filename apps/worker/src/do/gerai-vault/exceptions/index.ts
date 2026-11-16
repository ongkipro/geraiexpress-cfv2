// `Kendala & Klaim` (TASK-405, spec 04 §3): five sub-filters over this tenant's INVs, per-courier claim countdowns
// (data in `@gx/domain/claims`), claim records with a ready-to-send packet, conflict notes, and the stuck sweep.
import { claimDeadline, countdown, stuckBand, type Anchors, type ClaimKind } from "@gx/domain/claims"

export type ExceptionError = { status: number; code: string; message: string; fields?: Record<string, string> }
const err = (status: number, code: string, message: string, fields?: Record<string, string>): { ok: false; error: ExceptionError } => ({ ok: false, error: { status, code, message, fields } })

export type Bucket = "tidak_bergerak" | "gagal_antar" | "selisih_berat" | "bisa_klaim" | "bertentangan"

export type ExceptionRow = {
  slug: string
  awb: string | null
  courier: string
  status: string
  provider_status: string | null
  recipient: string | null
  last_scan_at: number | null
  band: string | null
  claim_kind: ClaimKind | null
  deadline_at: number | null
  countdown: { label: string; tone: string; expired: boolean } | null
  claim: { id: string; status: string; kind: string } | null
  adjustment_idr: number | null
  conflict_note: string | null
}

type Ship = {
  slug: string
  awb_number: string | null
  courier_code: string
  status: string
  provider_status: string | null
  custody_stage: string
  last_provider_event_at: number | null
  issued_at: number | null
  stuck_attention_at: number | null
  provider_status_conflict_at: number | null
  conflict_note: string | null
  conflict_resolved_at: number | null
  true_recipient_json: string | null
}

function anchorsOf(sql: SqlStorage, s: Ship): Anchors {
  const ev = sql.exec<{ mapped_status: string | null; event_at: number }>("SELECT mapped_status, event_at FROM shipment_events WHERE slug = ? AND source != 'local' ORDER BY event_at", s.slug).toArray()
  const first = (m: string[]) => ev.find((e) => e.mapped_status && m.includes(e.mapped_status))?.event_at ?? null
  const pickedUp = sql.exec<{ t: number | null }>("SELECT MIN(event_at) AS t FROM shipment_events WHERE slug = ? AND (mapped_status = 'in_transit' OR raw_category = 'handed_to_courier')", s.slug).one().t
  return { lastStatusAt: s.last_provider_event_at, lostAt: first(["lost"]), pickedUpAt: pickedUp ?? s.issued_at, deliveredOrRtsAt: first(["delivered", "rts_in_transit", "provider_returned"]) }
}

/** Which claim the INV qualifies for (if any): lost → hilang; damaged at Meja Retur → rusak. */
function claimKindOf(sql: SqlStorage, s: Ship): ClaimKind | null {
  if (s.provider_status === "lost") return "hilang"
  const intake = sql.exec<{ condition: string }>("SELECT condition FROM return_intakes WHERE slug = ?", s.slug).toArray()[0]
  if (intake && intake.condition !== "baik") return "rusak"
  return null
}

const BUCKET_WHERE: Record<Bucket, string> = {
  tidak_bergerak: "s.status IN ('in_transit','handed_to_courier') AND s.last_provider_event_at IS NOT NULL AND s.last_provider_event_at < ?",
  gagal_antar: "s.status = 'undelivery_hold'",
  selisih_berat: "s.slug IN (SELECT shipment_slug FROM finance_discrepancies WHERE kind = 'adjustment' AND resolved_at IS NULL)",
  bisa_klaim: "(s.provider_status = 'lost' OR s.slug IN (SELECT slug FROM return_intakes WHERE condition != 'baik'))",
  bertentangan: "s.provider_status_conflict_at IS NOT NULL AND s.conflict_resolved_at IS NULL",
}

export function bucketCounts(sql: SqlStorage, now: number): Record<Bucket, number> {
  const out = {} as Record<Bucket, number>
  for (const b of Object.keys(BUCKET_WHERE) as Bucket[]) {
    out[b] = sql.exec<{ c: number }>(`SELECT COUNT(*) AS c FROM shipments s WHERE ${BUCKET_WHERE[b]}`, ...(b === "tidak_bergerak" ? [now - 48 * 3600_000] : [])).one().c
  }
  return out
}

export function listBucket(sql: SqlStorage, bucket: Bucket, now: number): ExceptionRow[] {
  const rows = sql
    .exec<Ship>(
      `SELECT s.slug, s.awb_number, s.courier_code, s.status, s.provider_status, s.custody_stage, s.last_provider_event_at, s.issued_at, s.stuck_attention_at,
              s.provider_status_conflict_at, s.conflict_note, s.conflict_resolved_at, s.true_recipient_json
       FROM shipments s WHERE ${BUCKET_WHERE[bucket]} ORDER BY COALESCE(s.last_provider_event_at, s.issued_at) LIMIT 200`,
      ...(bucket === "tidak_bergerak" ? [now - 48 * 3600_000] : []),
    )
    .toArray()
  return rows.map((s) => {
    const kind = claimKindOf(sql, s)
    const claim = kind ? (sql.exec<{ id: string; status: string; kind: string; deadline_at: number | null }>("SELECT id, status, kind, deadline_at FROM shipment_claims WHERE shipment_slug = ? AND kind = ?", s.slug, kind).toArray()[0] ?? null) : null
    const deadline = kind ? (claim?.deadline_at ?? claimDeadline(s.courier_code, kind, anchorsOf(sql, s))) : null
    const adj = sql.exec<{ a: number | null }>("SELECT SUM(ABS(COALESCE(actual_idr, 0))) AS a FROM finance_discrepancies WHERE shipment_slug = ? AND kind = 'adjustment' AND resolved_at IS NULL", s.slug).one().a
    return {
      slug: s.slug,
      awb: s.awb_number,
      courier: s.courier_code,
      status: s.status,
      provider_status: s.provider_status,
      recipient: s.true_recipient_json ? ((JSON.parse(s.true_recipient_json) as { name?: string }).name ?? null) : null,
      last_scan_at: s.last_provider_event_at,
      band: stuckBand(s.last_provider_event_at, now),
      claim_kind: kind,
      deadline_at: deadline,
      countdown: kind ? countdown(deadline, now) : null,
      claim: claim ? { id: claim.id, status: claim.status, kind: claim.kind } : null,
      adjustment_idr: adj,
      conflict_note: s.conflict_note,
    }
  })
}

/** Opens (or returns) a claim with the deadline frozen at creation; refused when the window already closed. */
export function openClaim(sql: SqlStorage, tenantId: string, p: { slug: string; kind: unknown; note: unknown; evidence: string[]; actorId: string }, now: number): { ok: true; value: { id: string; deadline_at: number | null } } | { ok: false; error: ExceptionError } {
  const s = sql.exec<Ship>("SELECT slug, awb_number, courier_code, status, provider_status, custody_stage, last_provider_event_at, issued_at, stuck_attention_at, provider_status_conflict_at, conflict_note, conflict_resolved_at, true_recipient_json FROM shipments WHERE slug = ?", p.slug).toArray()[0]
  if (!s) return err(404, "SHIPMENT_NOT_FOUND", "Kiriman tidak ditemukan.")
  const kind = (["rusak", "hilang", "isi_kurang"] as const).find((k) => k === p.kind)
  if (!kind) return err(422, "INVALID_KIND", "Pilih jenis klaim.", { kind: "Pilih jenis klaim." })
  if (!s.awb_number) return err(409, "NO_AWB", "Kiriman ini belum punya resi.")
  const existing = sql.exec<{ id: string; deadline_at: number | null }>("SELECT id, deadline_at FROM shipment_claims WHERE shipment_slug = ? AND kind = ?", p.slug, kind).toArray()[0]
  if (existing) return { ok: true, value: existing }
  const deadline = claimDeadline(s.courier_code, kind, anchorsOf(sql, s))
  if (deadline !== null && deadline <= now) return err(409, "CLAIM_EXPIRED", "Batas waktu klaim untuk ekspedisi ini sudah lewat.")
  const note = typeof p.note === "string" ? p.note.replace(/\s+/g, " ").trim().slice(0, 500) || null : null
  const id = crypto.randomUUID()
  sql.exec(
    "INSERT INTO shipment_claims (id, tenant_id, shipment_slug, kind, status, deadline_at, note, evidence_json, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)",
    id,
    tenantId,
    p.slug,
    kind,
    deadline,
    note,
    JSON.stringify(p.evidence.slice(0, 10)),
    p.actorId,
    now,
    now,
  )
  return { ok: true, value: { id, deadline_at: deadline } }
}

const NEXT: Record<string, string[]> = { draft: ["submitted"], submitted: ["approved", "rejected"], approved: ["paid"], rejected: [], paid: [], expired: [] }

export function moveClaim(sql: SqlStorage, id: string, to: unknown, now: number): { ok: true } | { ok: false; error: ExceptionError } {
  const c = sql.exec<{ status: string; deadline_at: number | null }>("SELECT status, deadline_at FROM shipment_claims WHERE id = ?", id).toArray()[0]
  if (!c) return err(404, "CLAIM_NOT_FOUND", "Klaim tidak ditemukan.")
  const target = String(to)
  if (!NEXT[c.status]?.includes(target)) return err(409, "INVALID_TRANSITION", "Status klaim tidak bisa diubah ke tahap ini.")
  if (target === "submitted" && c.deadline_at !== null && c.deadline_at <= now) {
    sql.exec("UPDATE shipment_claims SET status = 'expired', updated_at = ? WHERE id = ?", now, id)
    return err(409, "CLAIM_EXPIRED", "Batas waktu klaim untuk ekspedisi ini sudah lewat.")
  }
  sql.exec(
    `UPDATE shipment_claims SET status = ?, submitted_at = CASE WHEN ? = 'submitted' THEN ? ELSE submitted_at END, decided_at = CASE WHEN ? IN ('approved','rejected') THEN ? ELSE decided_at END, updated_at = ? WHERE id = ?`,
    target,
    target,
    now,
    target,
    now,
    now,
    id,
  )
  return { ok: true }
}

/** A Mengantar `typeRefund` linked to an INV marks its approved/submitted claim paid (spec 09 §2.2). */
export function markClaimPaid(sql: SqlStorage, slug: string, invoiceId: string, now: number): number {
  return sql.exec("UPDATE shipment_claims SET status = 'paid', paid_invoice_id = ?, decided_at = COALESCE(decided_at, ?), updated_at = ? WHERE shipment_slug = ? AND status IN ('submitted','approved') RETURNING id", invoiceId, now, now, slug).toArray().length
}

/** Owner note on a `Status Bertentangan` item; `resolve` closes it (custody stays as verified). */
export function noteConflict(sql: SqlStorage, slug: string, note: unknown, resolve: boolean, now: number): { ok: true } | { ok: false; error: ExceptionError } {
  const n = typeof note === "string" ? note.replace(/\s+/g, " ").trim() : ""
  if (n.length < 5 || n.length > 300) return err(422, "NOTE_REQUIRED", "Tulis catatan hasil pengecekan (min. 5 huruf).", { note: "Wajib diisi." })
  const r = sql.exec("UPDATE shipments SET conflict_note = ?, conflict_resolved_at = ? WHERE slug = ? AND provider_status_conflict_at IS NOT NULL RETURNING slug", n, resolve ? now : null, slug).toArray()
  return r.length ? { ok: true } : err(404, "NO_CONFLICT", "Kiriman ini tidak sedang bertentangan.")
}

/** Expires drafts whose window closed (daily sweep alongside `flagStuck`). */
export function expireClaims(sql: SqlStorage, now: number): number {
  return sql.exec("UPDATE shipment_claims SET status = 'expired', updated_at = ? WHERE status = 'draft' AND deadline_at IS NOT NULL AND deadline_at <= ? RETURNING id", now, now).toArray().length
}
