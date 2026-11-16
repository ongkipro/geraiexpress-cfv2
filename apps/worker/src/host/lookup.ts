import type { HostLookup, HostNames, HostRow } from "./classify"
import { HostCache } from "./classify"

// Authoritative D1 read (spec 11 §3 step 4). Never KV.
export function d1HostLookup(db: D1Database): HostLookup {
  return async (hostname) => {
    const row = await db
      .prepare(
        `SELECT h.hostname, h.tenant_id, h.role, t.slug AS tenant_slug, h.state AS host_state, t.status AS tenant_status, t.routing_version,
                COALESCE(v.state, 'ok') AS schema_state
         FROM tenant_hostnames h
         JOIN tenants t ON t.id = h.tenant_id
         LEFT JOIN tenant_schema_versions v ON v.tenant_id = h.tenant_id
         WHERE h.hostname = ?`,
      )
      .bind(hostname)
      .first<{ hostname: string; tenant_id: string; role: "primary" | "redirect"; tenant_slug: string; host_state: HostRow["hostState"]; tenant_status: HostRow["tenantStatus"]; routing_version: number; schema_state: HostRow["schemaState"] }>()
    if (!row) return null
    return {
      hostname: row.hostname,
      tenantId: row.tenant_id,
      tenantSlug: row.tenant_slug,
      hostState: row.host_state,
      tenantStatus: row.tenant_status,
      schemaState: row.schema_state,
      routingVersion: row.routing_version,
      role: row.role,
    }
  }
}

// One cache per isolate (module scope is per isolate; it only holds the ≤ 30 s host map, never request state).
export const hostCache = new HostCache()

export function hostNames(env: Pick<Env, "PLATFORM_APEX" | "TENANT_ZONE" | "GX_ENV">): HostNames {
  return { platformApex: env.PLATFORM_APEX, tenantZone: env.TENANT_ZONE, stagingLabels: env.GX_ENV === "staging" }
}

/**
 * The gerai's platform subdomain (spec 07 §7, spec 11 §2): `<slug>.geraimitra.com` in production, `<slug>-stg.geraimitra.com` on
 * staging (first-level label so Universal SSL covers it; `*-stg.geraimitra.com/*` routes to the staging Worker).
 */
export function platformHostOf(env: Pick<Env, "TENANT_ZONE" | "GX_ENV">, slug: string): string {
  return `${slug}${env.GX_ENV === "staging" ? "-stg" : ""}.${env.TENANT_ZONE}`
}
