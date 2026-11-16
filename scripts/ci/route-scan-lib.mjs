// Route-table scan (spec 05 §4 gate 3). Public routes are an explicit allowlist (auth bootstrap only); every other
// route needs a session level, a projection, and owner routes beyond /auth need aal2.
export const PUBLIC_ALLOWLIST = {
  app: [
    "GET /auth/config",
    "POST /auth/signup/request",
    "POST /auth/signup/verify",
    "POST /auth/signup/complete",
    "POST /auth/login",
    "POST /auth/password/forgot",
    "POST /auth/password/reset",
    "GET /auth/invitations/:token",
    "POST /auth/invitations/:token/accept",
  ],
  owner: ["POST /auth/login"],
}
const LEVELS = new Set(["public", "app_session", "app_member", "app_owner", "owner_aal1", "owner_aal2", "owner_recent"])

export function scanRoutes(routes) {
  const problems = []
  const seen = new Set()
  for (const r of routes) {
    const id = `${r.context} ${r.method} ${r.path}`
    if (seen.has(id)) problems.push(`${id}: registered twice`)
    seen.add(id)
    if (!LEVELS.has(r.auth)) problems.push(`${id}: missing or unknown auth level`)
    if (!["none", "self", "role"].includes(r.projection)) problems.push(`${id}: missing projection`)
    if (r.auth === "public" && !(PUBLIC_ALLOWLIST[r.context] ?? []).includes(`${r.method} ${r.path}`)) problems.push(`${id}: public route outside the allowlist`)
    if (r.context === "app" && r.auth.startsWith("owner_")) problems.push(`${id}: owner auth level on an app route`)
    if (r.context === "owner" && r.auth.startsWith("app_")) problems.push(`${id}: app auth level on an owner route`)
    if (r.context === "owner" && r.auth === "owner_aal1" && !r.path.startsWith("/auth/")) problems.push(`${id}: aal1 is only allowed on /auth routes`)
  }
  return problems
}

// Partner API scan (TASK-503, spec 08 §2): every `/api/v1` route declares a known scope and none exposes a counter
// payment/payout mutation (those stay POS-only).
export const V1_FORBIDDEN_PATH = /\/(payments?|payouts?|cod-payout|mark-paid|void|refund|shift)(\/|$)/i
export function scanApiV1(routes, scopes) {
  const problems = []
  for (const r of routes) {
    const id = `v1 ${r.method} ${r.path}`
    if (!scopes.includes(r.scope)) problems.push(`${id}: missing or unknown scope`)
    if (V1_FORBIDDEN_PATH.test(r.path)) problems.push(`${id}: counter payment is POS-only`)
  }
  return problems
}

// Non-impersonation scan (DEC-209, AGENTS.md §3.4): Super Admin routes never create, pay, edit or cancel a gerai's
// shipments. Two checks: (1) no owner route path names a shipment action; (2) owner-side source files never call a
// tenant-object method that mutates shipments or money (allowlist of read/admin RPCs instead of a denylist guess).
export const OWNER_FORBIDDEN_PATH = /\/(kiriman|shipments?|orders?|dispatch|bayar|pay|cancel|batal|labels?|resi|refund|topup)(\/|$)/i
export const OWNER_ALLOWED_VAULT_CALLS = new Set([
  "connectionView",
  "migrate",
  "schemaState",
  "recordOnboarding",
  // approval provisions the gerai's own pickup outlet from the owner's application (no shipment, no money)
  "upsertDefaultOutlet",
  // read-only: provisioning retry checks whether that outlet exists before creating it
  "defaultOutlet",
  "webhookStatus",
  "courierPrefs",
  "observeRates",
  "beginKeyRotation",
  "abortKeyRotation",
  "markKeyRotationUnknown",
  "pendingKeyRotation",
  "resolveKeyRotation",
  "completeKeyRotation",
])

/** Read-only cross-tenant views (GET) are allowed; any mutating method on a shipment/payment path is not. */
export function scanOwnerRoutes(routes) {
  return routes
    .filter((r) => r.context === "owner" && r.method !== "GET" && OWNER_FORBIDDEN_PATH.test(r.path))
    .map((r) => `owner ${r.method} ${r.path}: Super Admin route mutates a shipment/payment resource`)
}

/** `files` = [{ path, source }] of owner-side modules; returns vault method calls outside the allowlist. */
export function scanOwnerVaultCalls(files) {
  const problems = []
  for (const f of files) {
    const names = [...f.source.matchAll(/(?:const|let)\s+([A-Za-z_]\w*)\s*=\s*vaultFor\(/g)].map((m) => m[1])
    const callee = names.length ? `(?:vaultFor\\([^)]*\\)|\\b(?:${names.join("|")}))` : "vaultFor\\([^)]*\\)"
    for (const m of f.source.matchAll(new RegExp(`${callee}\\s*(?:\\)\\s*)?\\.\\s*([A-Za-z_]\\w*)\\s*\\(`, "g"))) {
      if (!OWNER_ALLOWED_VAULT_CALLS.has(m[1])) problems.push(`${f.path}: Super Admin code calls vault.${m[1]}()`)
    }
  }
  return problems
}
