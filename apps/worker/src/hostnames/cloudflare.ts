// Cloudflare for SaaS custom-hostname client (spec 11 §5, §7). Zone-scoped token `CF_SAAS_API_TOKEN` (custom hostname
// edit + quota read only). `CF_SAAS_ZONE_ID = "mock"` (local, tests) uses the in-process fake below; nothing here is
// ever called against a real zone without owner-provisioned staging/production values.
export type CfStatus = "pending" | "active" | "active_redeploying" | "moved" | "pending_deletion" | "deleted" | "blocked" | string
export interface CfHostname {
  id: string
  hostname: string
  status: CfStatus
  ssl: { status: string; method: "http" | "txt"; validation_records?: Array<{ txt_name?: string; txt_value?: string; http_url?: string; http_body?: string }>; validation_errors?: Array<{ message: string }> }
  ownership_verification?: { type: string; name: string; value: string }
  verification_errors?: string[]
}
export interface CfQuota { allocated: number; used: number; exceeded: boolean; hard_cap: number }

export interface SaasClient {
  create(hostname: string, method: "http" | "txt"): Promise<CfHostname>
  get(id: string): Promise<CfHostname | null>
  /** Same `ssl` → restart validation; a different method switches DCV (spec 11 §5 step 4). */
  patch(id: string, method: "http" | "txt"): Promise<CfHostname>
  remove(id: string): Promise<void>
  quota(): Promise<CfQuota>
}

export class CfError extends Error {
  constructor(
    readonly status: number,
    readonly codes: number[],
    message: string,
  ) {
    super(message)
  }
}

const SSL = (method: "http" | "txt") => ({ method, type: "dv", settings: { min_tls_version: "1.2" } })

export function saasClient(env: Pick<Env, "CF_SAAS_API_TOKEN" | "GX_ENV"> & { CF_SAAS_ZONE_ID: string }, fetchImpl: typeof fetch = fetch): SaasClient {
  const zone = env.CF_SAAS_ZONE_ID ?? ""
  if (zone === "mock" && env.GX_ENV === "local") return mockSaas
  // DEC-255 (TASK-709): staging never creates or mutates custom hostnames in the production SaaS zone.
  if (env.GX_ENV === "staging") return unconfigured
  // Not provisioned (production before the owner sets the zone id + token): fail closed, never the fake.
  if (!/^[0-9a-f]{32}$/.test(zone) || !env.CF_SAAS_API_TOKEN) return unconfigured
  const base = `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zone)}/custom_hostnames`
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${env.CF_SAAS_API_TOKEN}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
    const j = (await res.json().catch(() => null)) as { success?: boolean; result?: T; errors?: Array<{ code: number; message: string }> } | null
    if (!res.ok || !j?.success) throw new CfError(res.status, (j?.errors ?? []).map((e) => e.code), (j?.errors ?? []).map((e) => e.message).join("; ") || `HTTP ${res.status}`)
    return j.result as T
  }
  return {
    create: (hostname, method) => call<CfHostname>("POST", "", { hostname, ssl: SSL(method) }),
    get: async (id) => {
      try {
        return await call<CfHostname>("GET", `/${encodeURIComponent(id)}`)
      } catch (e) {
        if (e instanceof CfError && e.status === 404) return null
        throw e
      }
    },
    patch: (id, method) => call<CfHostname>("PATCH", `/${encodeURIComponent(id)}`, { ssl: SSL(method) }),
    remove: async (id) => {
      try {
        await call("DELETE", `/${encodeURIComponent(id)}`)
      } catch (e) {
        if (!(e instanceof CfError && e.status === 404)) throw e
      }
    },
    quota: () => call<CfQuota>("GET", "/quota"),
  }
}

const notReady = async (): Promise<never> => {
  throw new CfError(503, [], "Cloudflare for SaaS is not configured for this environment")
}
const unconfigured: SaasClient = { create: notReady, get: notReady, patch: notReady, remove: notReady, quota: notReady }

// ---- deterministic fake (tests + local) ---------------------------------------------------------------------------

export const mockCf = {
  hosts: new Map<string, CfHostname>(),
  quota: { allocated: 100, hard_cap: 50_000 } as { allocated: number; hard_cap: number },
  calls: [] as string[],
  fail: null as null | "create" | "get" | "quota",
  /** Next status for a host on the next GET (test hook). */
  advance(hostname: string, status: CfStatus, sslStatus: string) {
    for (const h of mockCf.hosts.values()) if (h.hostname === hostname) Object.assign(h, { status, ssl: { ...h.ssl, status: sslStatus } })
  },
  reset() {
    mockCf.hosts.clear()
    mockCf.calls = []
    mockCf.fail = null
    mockCf.quota = { allocated: 100, hard_cap: 50_000 }
  },
}

const records = (hostname: string, method: "http" | "txt") =>
  method === "txt" ? [{ txt_name: `_acme-challenge.${hostname}`, txt_value: "mock-dcv-token-0001" }] : [{ http_url: `http://${hostname}/.well-known/pki-validation/mock.txt`, http_body: "mock-dcv-body" }]

const mockSaas: SaasClient = {
  async create(hostname, method) {
    mockCf.calls.push(`create ${hostname} ${method}`)
    if (mockCf.fail === "create") throw new CfError(400, [1406], "Duplicate custom hostname found.")
    const h: CfHostname = { id: crypto.randomUUID(), hostname, status: "pending", ssl: { status: "initializing", method, validation_records: records(hostname, method) }, ownership_verification: { type: "txt", name: `_cf-custom-hostname.${hostname}`, value: "mock-ownership-0001" } }
    mockCf.hosts.set(h.id, h)
    return structuredClone(h)
  },
  async get(id) {
    mockCf.calls.push(`get ${id}`)
    if (mockCf.fail === "get") throw new CfError(503, [], "unavailable")
    const h = mockCf.hosts.get(id)
    return h ? structuredClone(h) : null
  },
  async patch(id, method) {
    mockCf.calls.push(`patch ${id} ${method}`)
    const h = mockCf.hosts.get(id)
    if (!h) throw new CfError(404, [1436], "not found")
    h.ssl = { ...h.ssl, method, status: h.ssl.status === "active" ? "active" : "pending_validation", validation_records: records(h.hostname, method), validation_errors: [] }
    return structuredClone(h)
  },
  async remove(id) {
    mockCf.calls.push(`delete ${id}`)
    mockCf.hosts.delete(id)
  },
  async quota() {
    mockCf.calls.push("quota")
    if (mockCf.fail === "quota") throw new CfError(503, [], "unavailable")
    return { allocated: mockCf.quota.allocated, used: mockCf.hosts.size, exceeded: mockCf.hosts.size > mockCf.quota.allocated, hard_cap: mockCf.quota.hard_cap }
  },
}
