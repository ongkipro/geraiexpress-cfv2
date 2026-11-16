// Custom-domain lifecycle (TASK-505, spec 11 §5–7, DEC-228). D1 `tenant_hostnames` is the single source; Cloudflare
// for SaaS is driven from here only. Order: owner request → row `pending` → Queue `gx-hostnames` creates the custom
// hostname (≤ 15 issuances/min) BEFORE the owner saves the CNAME → poll every 10 min (+ `Periksa Lagi`) → when
// Cloudflare says active+ssl active, the HMAC probe proves the host reaches this deployment → `active`, routing_version
// bump, canonical host switches. Daily: reaper (7-day pending/failed, moved, removed) and quota snapshot (alert ≥ 80 %).
import { emit } from "@gx/telemetry"
import { hostCache, platformHostOf } from "../host/lookup"
import { normalizeHost, probeSignature } from "../host/classify"
import { AppError } from "../http/envelope"
import { hit } from "../auth/throttle"
import { sendAlert } from "../telemetry/alerts"
import { CfError, saasClient, type CfHostname, type SaasClient } from "./cloudflare"

export const CNAME_TARGET = (env: Pick<Env, "TENANT_ZONE">) => `cname.${env.TENANT_ZONE}`
export const REAP_AFTER_MS = 7 * 86_400_000
export const POLL_EVERY_MS = 10 * 60_000
export const ISSUE_PER_MINUTE = 15
export const QUOTA_ALERT_BPS = 8000
const PROBE_ALERT_AFTER = 3

export type HostMessage = { kind: "create"; hostname: string } | { kind: "refresh"; hostname: string }
export type ProbeFetch = (url: string) => Promise<Response>
type Env2 = Env

export type DomainRow = {
  hostname: string
  tenant_id: string
  role: "primary" | "redirect"
  state: "pending" | "active" | "failed" | "moved" | "suspended" | "purged"
  cf_custom_hostname_id: string | null
  cf_status: string | null
  cf_ssl_status: string | null
  verification_errors_json: string | null
  dns_branch: "subdomain" | "root_primary" | "www_primary" | null
  ssl_method: "http" | "txt" | null
  dns_records_json: string | null
  created_at: number
  state_changed_at: number | null
  activated_at: number | null
  last_checked_at: number | null
  probe_ok_at: number | null
  probe_failures: number
}
const COLS = "hostname, tenant_id, role, state, cf_custom_hostname_id, cf_status, cf_ssl_status, verification_errors_json, dns_branch, ssl_method, dns_records_json, created_at, state_changed_at, activated_at, last_checked_at, probe_ok_at, probe_failures"

// Registrable second-level suffixes common for Indonesian shops (a root under these has three labels).
const SECOND_LEVEL = new Set(["co.id", "my.id", "web.id", "biz.id", "or.id", "ac.id", "sch.id", "net.id", "ponpes.id", "desa.id", "co.uk", "com.sg", "com.my", "com.au"])
const isRoot = (h: string) => {
  const labels = h.split(".")
  return labels.length === 2 || (labels.length === 3 && SECOND_LEVEL.has(labels.slice(1).join(".")))
}

/** Normalises and validates an owner-entered domain; returns the hostnames to create and the DNS branch. */
export function planDomain(env: { TENANT_ZONE: string; PLATFORM_APEX: string }, raw: unknown, rootChoice: unknown): { hosts: Array<{ hostname: string; role: "primary" | "redirect" }>; branch: DomainRow["dns_branch"] } {
  const input = typeof raw === "string" ? raw.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "") : ""
  const h = normalizeHost(input)
  const fail = (m: string) => {
    throw new AppError(422, "INVALID_DOMAIN", m, { hostname: m })
  }
  if (!h || !h.includes(".")) return fail("Tulis domain lengkap, misalnya kirim.tokoanda.id.")
  if (h.startsWith("xn--") || h.includes(".xn--")) return fail("Domain dengan huruf non-Latin belum didukung.")
  for (const zone of [env.TENANT_ZONE, env.PLATFORM_APEX, "gerai.cc", "geraiexpress.com"]) if (h === zone || h.endsWith(`.${zone}`)) return fail("Domain ini milik GeraiExpress. Pakai domain toko Anda sendiri.")
  const www = h.startsWith("www.") ? h.slice(4) : null
  if (www && isRoot(www)) {
    // `www.tokoanda.id` entered: www is the site; the root forwards at the registrar.
    return { hosts: [{ hostname: h, role: "primary" }], branch: "www_primary" }
  }
  if (isRoot(h)) {
    if (rootChoice === "www_primary") return { hosts: [{ hostname: `www.${h}`, role: "primary" }], branch: "www_primary" }
    return { hosts: [{ hostname: h, role: "primary" }, { hostname: `www.${h}`, role: "redirect" }], branch: "root_primary" }
  }
  return { hosts: [{ hostname: h, role: "primary" }], branch: "subdomain" }
}

export async function domainRows(env: Env, tenantId: string): Promise<DomainRow[]> {
  return (await env.DB.prepare(`SELECT ${COLS} FROM tenant_hostnames WHERE tenant_id = ? AND kind = 'custom' AND state != 'purged' ORDER BY role, hostname`).bind(tenantId).all<DomainRow>()).results
}

/** Step 1: the owner's request. One custom domain per Pro gerai (root + www count as one). */
export async function requestDomain(env: Env2, tenantId: string, raw: unknown, rootChoice: unknown, now: number): Promise<DomainRow[]> {
  const t = await env.DB.prepare("SELECT custom_domain_enabled, status FROM tenants WHERE id = ?").bind(tenantId).first<{ custom_domain_enabled: number; status: string }>()
  if (!t || t.status !== "active") throw new AppError(409, "TENANT_NOT_ACTIVE", "Gerai belum aktif.")
  if (t.custom_domain_enabled !== 1) throw new AppError(403, "PRO_REQUIRED", "Domain sendiri tersedia untuk gerai Pro. Hubungi tim GeraiExpress untuk mengaktifkan.")
  if ((await domainRows(env, tenantId)).length) throw new AppError(409, "DOMAIN_LIMIT", "Gerai ini sudah punya domain sendiri. Hapus dulu domain lama untuk menggantinya.")
  const plan = planDomain(env, raw, rootChoice)
  const snap = await env.DB.prepare("SELECT used, hard_cap FROM custom_hostname_quota WHERE id = 1").first<{ used: number; hard_cap: number | null }>()
  if (snap?.hard_cap && snap.used + plan.hosts.length > snap.hard_cap) throw new AppError(503, "QUOTA_FULL", "Pendaftaran domain sedang ditutup sementara. Coba lagi nanti.")
  for (const x of plan.hosts) {
    const owner = await env.DB.prepare("SELECT tenant_id, state FROM tenant_hostnames WHERE hostname = ?").bind(x.hostname).first<{ tenant_id: string; state: string }>()
    if (owner && owner.state !== "purged") throw new AppError(409, "DOMAIN_TAKEN", owner.tenant_id === tenantId ? "Domain ini sudah terdaftar di gerai Anda." : "Domain ini sudah dipakai gerai lain.", { hostname: "Domain ini sudah dipakai." })
  }
  // A purged row of the same name is reused (PK); everything else inserts. Every row written carries this request's
  // id: if a concurrent request took any of the names (0 rows written), only OUR rows are undone (root + www never
  // split, and a concurrent winner's rows are never touched).
  const requestId = crypto.randomUUID()
  const res = await env.DB.batch(
    plan.hosts.map((x) =>
      env.DB.prepare(
        `INSERT INTO tenant_hostnames (hostname, tenant_id, kind, role, state, dns_branch, ssl_method, created_at, state_changed_at, probe_failures, request_id)
         VALUES (?1, ?2, 'custom', ?3, 'pending', ?4, 'http', ?5, ?5, 0, ?6)
         ON CONFLICT(hostname) DO UPDATE SET tenant_id = excluded.tenant_id, kind = 'custom', role = excluded.role, state = 'pending', dns_branch = excluded.dns_branch, request_id = excluded.request_id,
           ssl_method = 'http', cf_custom_hostname_id = NULL, cf_status = NULL, cf_ssl_status = NULL, verification_errors_json = NULL, dns_records_json = NULL,
           created_at = excluded.created_at, state_changed_at = excluded.created_at, activated_at = NULL, last_checked_at = NULL, probe_ok_at = NULL, probe_failures = 0, deleted_at = NULL
         WHERE tenant_hostnames.state = 'purged'`,
      ).bind(x.hostname, tenantId, x.role, plan.branch, now, requestId),
    ),
  )
  if (res.some((r) => (r.meta.changes ?? 0) !== 1)) {
    // Undo only rows this request wrote.
    await env.DB.batch(plan.hosts.map((x) => env.DB.prepare("UPDATE tenant_hostnames SET state = 'purged', deleted_at = ?1 WHERE hostname = ?2 AND request_id = ?3 AND state = 'pending' AND cf_custom_hostname_id IS NULL").bind(now, x.hostname, requestId)))
    throw new AppError(409, "DOMAIN_TAKEN", "Domain ini baru saja didaftarkan. Muat ulang halaman.", { hostname: "Domain ini sudah dipakai." })
  }
  await env.HOSTNAME_QUEUE.sendBatch(plan.hosts.map((x) => ({ body: { kind: "create", hostname: x.hostname } satisfies HostMessage })))
  emit("hostname.lifecycle", { state: "requested" }, { hosts: plan.hosts.length }, { env: env.GX_ENV })
  return domainRows(env, tenantId)
}

function recordsOf(cf: CfHostname): string {
  return JSON.stringify({ ownership: cf.ownership_verification ?? null, ssl: (cf.ssl.validation_records ?? []).map((r) => ({ txt_name: r.txt_name ?? null, txt_value: r.txt_value ?? null, http_url: r.http_url ?? null })) })
}
function errorsOf(cf: CfHostname): string | null {
  const e = [...(cf.verification_errors ?? []), ...(cf.ssl.validation_errors ?? []).map((x) => x.message)].filter(Boolean)
  return e.length ? JSON.stringify(e.slice(0, 5)) : null
}

/** Queue step 2: create at Cloudflare (idempotent: a row that already has an id only refreshes). */
export async function createAtCloudflare(env: Env2, hostname: string, now: number, saas: SaasClient = saasClient(env)): Promise<"created" | "skipped" | "throttled"> {
  const row = await env.DB.prepare(`SELECT ${COLS} FROM tenant_hostnames WHERE hostname = ? AND kind = 'custom'`).bind(hostname).first<DomainRow>()
  if (!row || row.state !== "pending" || row.cf_custom_hostname_id) return "skipped"
  const slot = await hit(env.DB, "cf-saas-issue", ISSUE_PER_MINUTE, 60_000, now)
  if (!slot.allowed) return "throttled"
  let cf: CfHostname
  try {
    cf = await saas.create(hostname, row.ssl_method ?? "http")
  } catch (e) {
    // 1406 = already exists in the zone (a previous attempt succeeded but we lost the reply, or another account
    // holds it): record and let the owner see the remedy instead of retrying forever.
    if (e instanceof CfError && e.status >= 400 && e.status < 500) {
      await env.DB.prepare("UPDATE tenant_hostnames SET state = 'failed', state_changed_at = ?1, verification_errors_json = ?2, last_checked_at = ?1 WHERE hostname = ?3 AND state = 'pending'").bind(now, JSON.stringify([e.message.slice(0, 200)]), hostname).run()
      emit("hostname.lifecycle", { state: "create_failed" }, { status: e.status }, { env: env.GX_ENV, severity: "warn" })
      return "skipped"
    }
    throw e
  }
  // Conditional: a concurrent delivery of the same message may have stored its id first; then ours is a duplicate
  // at Cloudflare and is deleted at once (each one is billed until deleted).
  const res = await env.DB.prepare("UPDATE tenant_hostnames SET cf_custom_hostname_id = ?1, cf_status = ?2, cf_ssl_status = ?3, dns_records_json = ?4, verification_errors_json = ?5, last_checked_at = ?6 WHERE hostname = ?7 AND state = 'pending' AND cf_custom_hostname_id IS NULL")
    .bind(cf.id, cf.status, cf.ssl.status, recordsOf(cf), errorsOf(cf), now, hostname)
    .run()
  if (!res.meta.changes) {
    await saas.remove(cf.id)
    return "skipped"
  }
  emit("hostname.lifecycle", { state: "created" }, {}, { env: env.GX_ENV })
  return "created"
}

/** Probe step 5: `https://<host>/.well-known/geraiexpress-probe/<nonce>` must answer our own HMAC. */
export async function probeHost(env: Pick<Env, "PROBE_SECRET">, hostname: string, probeFetch: ProbeFetch): Promise<boolean> {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, "0")).join("")
  try {
    const res = await probeFetch(`https://${hostname}/.well-known/geraiexpress-probe/${nonce}`)
    if (res.status !== 200) return false
    const body = (await res.text()).trim()
    return body === (await probeSignature(env.PROBE_SECRET, hostname, nonce))
  } catch {
    return false
  }
}

/** Poll one host (cron + `Periksa Lagi`); `restart` sends the same-method PATCH first (spec 11 §5 step 4). */
export async function refreshHost(env: Env2, hostname: string, now: number, opts: { restart?: boolean; method?: "http" | "txt"; probeFetch: ProbeFetch; saas?: SaasClient }): Promise<DomainRow | null> {
  const saas = opts.saas ?? saasClient(env)
  const row = await env.DB.prepare(`SELECT ${COLS} FROM tenant_hostnames WHERE hostname = ? AND kind = 'custom'`).bind(hostname).first<DomainRow>()
  if (!row || row.state === "purged") return null
  if (!row.cf_custom_hostname_id) {
    if (row.state === "pending") await env.HOSTNAME_QUEUE.send({ kind: "create", hostname } satisfies HostMessage)
    return row
  }
  let cf: CfHostname | null
  if (opts.restart || opts.method) {
    const method = opts.method ?? row.ssl_method ?? "http"
    cf = await saas.patch(row.cf_custom_hostname_id, method)
    if (opts.method) await env.DB.prepare("UPDATE tenant_hostnames SET ssl_method = ? WHERE hostname = ?").bind(method, hostname).run()
  } else cf = await saas.get(row.cf_custom_hostname_id)
  if (!cf) {
    // Gone at Cloudflare (deleted after 7 days moved, or by hand): the row stops routing.
    await setState(env, row, "moved", now, { cf_status: "deleted" })
    return reread(env, hostname)
  }
  await env.DB.prepare("UPDATE tenant_hostnames SET cf_status = ?1, cf_ssl_status = ?2, dns_records_json = ?3, verification_errors_json = ?4, last_checked_at = ?5 WHERE hostname = ?6")
    .bind(cf.status, cf.ssl.status, recordsOf(cf), errorsOf(cf), now, hostname)
    .run()
  if (cf.status === "moved" && row.state === "active") {
    await setState(env, row, "moved", now)
    return reread(env, hostname)
  }
  const cfReady = (cf.status === "active" || cf.status === "active_redeploying") && cf.ssl.status === "active"
  // The probe is answered only for pending/active hosts: a recovered `moved`/`failed` host goes back to pending first.
  if (cfReady && (row.state === "failed" || row.state === "moved")) {
    await setState(env, row, "pending", now)
    row.state = "pending"
  }
  if (cfReady && (row.state === "pending" || row.state === "active")) {
    const ok = await probeHost(env, hostname, opts.probeFetch)
    if (ok) {
      if (row.state !== "active") await setState(env, row, "active", now, { activated_at: now })
      await env.DB.prepare("UPDATE tenant_hostnames SET probe_ok_at = ?1, probe_failures = 0 WHERE hostname = ?2").bind(now, hostname).run()
    } else {
      const fails = row.probe_failures + 1
      await env.DB.prepare("UPDATE tenant_hostnames SET probe_failures = ?1 WHERE hostname = ?2").bind(fails, hostname).run()
      emit("hostname.lifecycle", { state: "probe_failed" }, { failures: fails }, { env: env.GX_ENV, severity: "warn" })
      if (row.state === "active" && fails >= PROBE_ALERT_AFTER) {
        await sendAlert(env, { key: `hostname_probe.${hostname.slice(0, 60).replace(/[^a-z0-9.-]/g, "-")}`, severity: "warn", text: `Domain gerai ${hostname} gagal pemeriksaan ${fails} kali berturut-turut. Periksa DNS atau status Cloudflare.` }, now)
      }
    }
  }
  return reread(env, hostname)
}

const reread = (env: Env, hostname: string) => env.DB.prepare(`SELECT ${COLS} FROM tenant_hostnames WHERE hostname = ?`).bind(hostname).first<DomainRow>()

async function setState(env: Env, row: DomainRow, state: DomainRow["state"], now: number, extra: { activated_at?: number; cf_status?: string } = {}) {
  await env.DB.batch([
    env.DB.prepare("UPDATE tenant_hostnames SET state = ?1, state_changed_at = ?2, activated_at = COALESCE(?3, activated_at), cf_status = COALESCE(?4, cf_status) WHERE hostname = ?5").bind(state, now, extra.activated_at ?? null, extra.cf_status ?? null, row.hostname),
    env.DB.prepare("UPDATE tenants SET routing_version = routing_version + 1, updated_at = ?1 WHERE id = ?2").bind(now, row.tenant_id),
  ])
  hostCache.clear()
  emit("hostname.lifecycle", { state }, {}, { env: env.GX_ENV })
}

/** Cron every 10 min: poll pending/failed/active/moved hosts not checked in the last 9 minutes (bounded batch). */
export async function pollHosts(env: Env2, now: number, probeFetch: ProbeFetch, saas: SaasClient = saasClient(env)): Promise<number> {
  const rows = (
    await env.DB.prepare("SELECT hostname FROM tenant_hostnames WHERE kind = 'custom' AND state IN ('pending','active','failed','moved') AND cf_custom_hostname_id IS NOT NULL AND COALESCE(last_checked_at, 0) <= ? ORDER BY COALESCE(last_checked_at, 0) LIMIT 100")
      .bind(now - POLL_EVERY_MS + 60_000)
      .all<{ hostname: string }>()
  ).results
  let n = 0
  for (const r of rows) {
    try {
      await refreshHost(env, r.hostname, now, { probeFetch, saas })
      n++
    } catch (e) {
      emit("hostname.lifecycle", { state: "poll_error" }, { error: e }, { env: env.GX_ENV, severity: "warn" })
    }
  }
  return n
}

/** Purges every custom row of the gerai (root + `www` are one domain: never leave half of it behind). */
export async function purgeDomain(env: Env2, tenantId: string, now: number, saas: SaasClient = saasClient(env)): Promise<string[]> {
  const rows = await domainRows(env, tenantId)
  for (const r of rows) await purgeHost(env, r.hostname, now, saas)
  return rows.map((r) => r.hostname)
}

/** Owner removal or reaper: DELETE at Cloudflare (stops billing), then `purged`. Never relies on Cloudflare's own deletion. */
export async function purgeHost(env: Env2, hostname: string, now: number, saas: SaasClient = saasClient(env)): Promise<void> {
  const row = await env.DB.prepare(`SELECT ${COLS} FROM tenant_hostnames WHERE hostname = ? AND kind = 'custom'`).bind(hostname).first<DomainRow>()
  if (!row || row.state === "purged") return
  if (row.cf_custom_hostname_id) await saas.remove(row.cf_custom_hostname_id)
  await env.DB.batch([
    env.DB.prepare("UPDATE tenant_hostnames SET state = 'purged', state_changed_at = ?1, deleted_at = ?1, cf_custom_hostname_id = NULL WHERE hostname = ?2").bind(now, hostname),
    env.DB.prepare("UPDATE tenants SET routing_version = routing_version + 1, updated_at = ?1 WHERE id = ?2").bind(now, row.tenant_id),
  ])
  hostCache.clear()
  emit("hostname.lifecycle", { state: "purged" }, {}, { env: env.GX_ENV })
}

/** Daily reaper (spec 11 §5 step 7): pending/failed ≥ 7 days, moved, or hosts of suspended gerai ≥ 30 days. */
export async function reapHosts(env: Env2, now: number, saas: SaasClient = saasClient(env)): Promise<string[]> {
  const rows = (
    await env.DB.prepare(
      `SELECT h.hostname FROM tenant_hostnames h JOIN tenants t ON t.id = h.tenant_id
       WHERE h.kind = 'custom' AND h.state != 'purged' AND (
         (h.state IN ('pending','failed') AND COALESCE(h.state_changed_at, h.created_at) <= ?1)
         OR h.state = 'moved'
         OR (t.status = 'suspended' AND t.updated_at <= ?2)
       ) LIMIT 200`,
    )
      .bind(now - REAP_AFTER_MS, now - 30 * 86_400_000)
      .all<{ hostname: string }>()
  ).results
  const done: string[] = []
  for (const r of rows) {
    try {
      if (done.includes(r.hostname)) continue
      const tenant = await env.DB.prepare("SELECT tenant_id FROM tenant_hostnames WHERE hostname = ?").bind(r.hostname).first<{ tenant_id: string }>()
      done.push(...(tenant ? await purgeDomain(env, tenant.tenant_id, now, saas) : []))
    } catch (e) {
      emit("hostname.lifecycle", { state: "reap_error" }, { error: e }, { env: env.GX_ENV, severity: "warn" })
    }
  }
  return done
}

/** Daily quota snapshot; alert at ≥ 80 % of `allocated` (spec 11 §7). */
export async function checkQuota(env: Env2, now: number, saas: SaasClient = saasClient(env), fetchImpl: typeof fetch = fetch): Promise<{ used: number; allocated: number; alerted: boolean }> {
  const q = await saas.quota()
  await env.DB.prepare(
    "INSERT INTO custom_hostname_quota (id, used, allocated, hard_cap, checked_at) VALUES (1, ?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET used = excluded.used, allocated = excluded.allocated, hard_cap = excluded.hard_cap, checked_at = excluded.checked_at",
  )
    .bind(q.used, q.allocated, q.hard_cap ?? null, now)
    .run()
  const alerted = q.allocated > 0 && q.used * 10_000 >= q.allocated * QUOTA_ALERT_BPS
  if (alerted) await sendAlert(env, { key: "hostname_quota", severity: "warn", text: `Kuota domain gerai ${q.used}/${q.allocated} (≥ 80 %). Tambahan hostname ditagih per unit; periksa reaper atau naikkan kuota.` }, now, fetchImpl)
  return { used: q.used, allocated: q.allocated, alerted }
}

/** Queue consumer `gx-hostnames`: issuance throttled to 15/min (spec 11 §7); a 'refresh' 30 s after create reads DCV records. */
export async function consumeHostnameBatch(batch: MessageBatch<HostMessage>, env: Env2, probeFetch: ProbeFetch): Promise<void> {
  for (const m of batch.messages) {
    try {
      if (m.body.kind === "create") {
        const r = await createAtCloudflare(env, m.body.hostname, Date.now())
        if (r === "throttled") {
          m.retry({ delaySeconds: 60 })
          continue
        }
        if (r === "created") await env.HOSTNAME_QUEUE.send({ kind: "refresh", hostname: m.body.hostname } satisfies HostMessage, { delaySeconds: 30 })
      } else await refreshHost(env, m.body.hostname, Date.now(), { probeFetch })
      m.ack()
    } catch {
      m.retry({ delaySeconds: 60 })
    }
  }
}

/** The host canonical URLs, QR posters and receipts use: the custom primary only after its probe (step 6). */
export async function primaryHost(env: Pick<Env, "DB" | "TENANT_ZONE" | "GX_ENV">, tenantId: string, slug: string): Promise<string> {
  const r = await env.DB.prepare("SELECT hostname FROM tenant_hostnames WHERE tenant_id = ? AND kind = 'custom' AND role = 'primary' AND state = 'active' AND probe_ok_at IS NOT NULL LIMIT 1").bind(tenantId).first<{ hostname: string }>()
  return r?.hostname ?? platformHostOf(env, slug)
}

/** Indonesian remedy for the owner page (spec 11 §5 remedies). */
export function remedyOf(row: DomainRow): { code: string; text: string } | null {
  if (row.state === "active") return null
  const errs = (row.verification_errors_json ? (JSON.parse(row.verification_errors_json) as string[]) : []).join(" ").toLowerCase()
  if (row.cf_status === "blocked" || errs.includes("blocked")) return { code: "blocked", text: "Domain ini sedang ditahan di Cloudflare (zone hold). Lepaskan penahanan di akun Cloudflare domain Anda, lalu tekan Periksa Lagi." }
  if (errs.includes("caa")) return { code: "caa", text: "Pengaturan CAA domain Anda menolak penerbit sertifikat. Izinkan Google Trust Services dan Let's Encrypt di record CAA, lalu tekan Periksa Lagi." }
  if (row.state === "failed") return { code: "failed", text: "Domain tidak bisa didaftarkan. Pastikan domain belum dipakai layanan lain, lalu hapus dan tambahkan lagi." }
  if (row.state === "moved") return { code: "moved", text: "CNAME domain Anda tidak lagi mengarah ke GeraiExpress. Pasang kembali record di bawah, lalu tekan Periksa Lagi." }
  if (row.ssl_method === "http" && (errs.includes("http") || errs.includes("redirect") || errs.includes("timeout") || errs.includes("dcv"))) return { code: "http_dcv_blocked", text: "Pemeriksaan sertifikat lewat HTTP terhalang (pengalihan atau firewall). Ganti ke verifikasi TXT dan pasang record TXT di bawah." }
  if (row.cf_status === "active" && row.cf_ssl_status === "active") return { code: "probe", text: "Domain sudah aktif di Cloudflare tetapi belum mengarah ke gerai ini. Periksa CNAME, lalu tekan Periksa Lagi." }
  return { code: "dns", text: "Pasang record DNS di bawah di pengelola domain Anda. Perubahan DNS bisa butuh beberapa menit sampai beberapa jam." }
}
