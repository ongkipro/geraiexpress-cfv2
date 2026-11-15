// POST /internal/ops/bootstrap-admin (owner host, Bearer OPS_TOKEN). Creates the FIRST Super Admin only, when none
// exists yet: an existing user account becomes a pending admin who must enrol TOTP at first login. Every further
// admin is enrolled by another Super Admin with TOTP + reason (DEC-209). Run once per environment by the owner.
import { timingSafeEqualStr } from "../crypto"
import { fail, ok } from "../http/envelope"

export async function handleBootstrapAdmin(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get("authorization") ?? ""
  if (!(await timingSafeEqualStr(auth.replace(/^Bearer /, ""), env.OPS_TOKEN))) return fail(401, "UNAUTHORIZED", "Akses ditolak.")
  const b = (await request.json().catch(() => ({}))) as { email?: unknown }
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : ""
  const existing = await env.DB.prepare("SELECT COUNT(*) AS n FROM super_admins").first<{ n: number }>()
  // Local development may add further admins (e2e runs several independent admin flows); everywhere else the first
  // admin is the only one this endpoint can create.
  if ((existing?.n ?? 0) > 0 && env.GX_ENV !== "local") return fail(409, "ALREADY_BOOTSTRAPPED", "Super Admin pertama sudah ada. Tambahkan admin lain dari konsol.")
  const user = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND status = 'active'").bind(email).first<{ id: string }>()
  if (!user) return fail(404, "USER_NOT_FOUND", "Akun dengan email ini belum ada.")
  if (await env.DB.prepare("SELECT 1 FROM super_admins WHERE user_id = ?").bind(user.id).first()) return fail(409, "ALREADY_ADMIN", "Akun ini sudah Super Admin.")
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare("INSERT INTO super_admins (user_id, totp_state, enrolled_by, enrolled_at, status, created_at, updated_at) VALUES (?1, 'pending', 'bootstrap', ?2, 'active', ?2, ?2)").bind(user.id, now),
    env.DB.prepare("INSERT INTO audit_logs (id, at, actor_type, actor_id, action, target_type, target_id, reason) VALUES (?, ?, 'system', 'bootstrap', 'super_admin.bootstrap', 'user', ?, 'first Super Admin')").bind(crypto.randomUUID(), now, user.id),
  ])
  return ok({ userId: user.id, totp: "enrol" }, 201)
}
