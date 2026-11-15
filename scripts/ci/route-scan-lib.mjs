// Route-table scan (spec 05 §4 gate 3). Public routes are an explicit allowlist (auth bootstrap only); every other
// route needs a session level, a projection, and owner routes beyond /auth need aal2.
export const PUBLIC_ALLOWLIST = {
  app: [
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
