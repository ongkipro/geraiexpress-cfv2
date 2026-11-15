// Declarative route table for /api/app/* and /api/owner/* (spec 05 §4 gate 3). Every route states its auth level and
// DTO projection; the CI route-table scan (TASK-109) fails when a route is registered without both.
import type { Context, Hono, MiddlewareHandler } from "hono"

export type AuthLevel =
  | "public" // anonymous (still same-origin + rate limited where relevant)
  | "app_session" // signed-in app user, any membership state
  | "app_member" // signed-in app user with an active membership in the session's tenant
  | "app_owner" // ... whose role is gerai_admin
  | "owner_aal1" // Super Admin password step done, TOTP pending (owner host)
  | "owner_aal2" // Super Admin with TOTP
  | "owner_recent" // Super Admin with TOTP verified within 15 min (sensitive reads and mutations)
export type Projection = "none" | "self" | "role"

export interface RouteMeta {
  context: "app" | "owner"
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  /** Path relative to the API base (`/api/app` or `/api/owner`). */
  path: string
  auth: AuthLevel
  projection: Projection
}

export const ROUTES: RouteMeta[] = []

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHono = Hono<any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (c: Context<any>) => Response | Promise<Response>

export function register(
  app: AnyHono,
  meta: RouteMeta,
  guard: (level: AuthLevel) => MiddlewareHandler,
  handler: Handler,
): void {
  if (!meta.auth || !meta.projection) throw new Error(`route ${meta.method} ${meta.path} lacks auth/projection`)
  ROUTES.push(meta)
  app.on(meta.method, meta.path, guard(meta.auth), handler)
}
