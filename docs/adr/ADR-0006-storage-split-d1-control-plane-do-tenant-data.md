# ADR-0006: Storage Split — D1 Control Plane, One SQLite Durable Object per Gerai for Tenant Data

- **Status:** Accepted (2026-11-15, owner)
- **Related:** DEC-227, ADR-0001, ADR-0004, `docs/spec/01`, `docs/spec/11`
- **Amends:** ADR-0001 ("D1 for relational tables") and ADR-0004 ("read-heavy workloads read D1")

## Context

ADR-0001 put every relational table in one Cloudflare D1 database. Cloudflare's D1 limits page (last updated
2026-10-30) states a **10 GB maximum per database on Workers Paid that "cannot be further increased"**, 1,000 queries
per Worker invocation, and that a Worker reaches a database only through a static binding (a database created after
deploy needs a redeploy). The Durable Objects limits page (last updated 2026-11-13) gives a SQLite-backed object
**10 GB of its own**, unlimited objects per account, an 8 MB maximum row and a soft limit of about 1,000 requests per
second per object.

Rough sizing (planning estimate, not a measurement): one shipment with its events, receipts, ledger lines and invoice
mirror rows is about 5 KB, so one database holds roughly 2 million shipments. At 30 parcels a day, 100 gerai fill it in
about two years and 1,000 gerai in about two months. Tenant data must therefore not share one D1 database.

`GeraiVaultDO` already exists per tenant (ADR-0004) to serialize provider dispatch, slug allocation, shifts and the
finance cursor. Putting that tenant's rows in the same object removes a cross-store consistency gap: today a dispatch
journal lives in the DO while the shipment row lives in D1.

## Options considered

1. **One shared D1 + `tenant_id`.** Simplest, but hits the 10 GB ceiling and every tenant shares one single-threaded
   database.
2. **Sharded D1 (N databases, shard map).** Removes the ceiling, but each new shard needs a redeploy for its binding and
   tenant rebalancing is manual.
3. **One D1 per tenant.** Impossible without a redeploy per tenant (static bindings).
4. **D1 control plane + one SQLite Durable Object per gerai for tenant data (chosen).**

## Decision

1. **D1 (`DB`) = control plane only.** Tables that are global, cross-tenant or needed before a tenant is known:
   `users`, `sessions`, `email_otps`, `super_admins`, `tenants`, `tenant_members`, `tenant_hostnames` (spec 11),
   `tenant_api_keys` (hashed), `tenant_discount_rules`, `courier_service_catalog`, `platform_legal_profile`,
   `audit_logs` (platform scope), and a **thin shipment index** `shipment_index(tenant_id, slug, awb_number,
   status, created_at)` used only for Super Admin cross-tenant search and public `/lacak` lookup.
2. **`GeraiVaultDO` (SQLite storage, one per `tenant_id`, `getByName(tenant_id)`) = all tenant data:** outlets,
   contacts, quotes, shipments, events, receipts, shifts, pickup batches, returns, claims, cashback, both ledgers,
   invoice mirror, `tenant_settings`, `tenant_business_profiles`, `mengantar_connections` (encrypted), courier prefs,
   tenant-scope audit. Column definitions stay in `docs/spec/01`; each table keeps its `tenant_id` column so rows are
   self-describing in exports and backups.
3. **Access path.** Workers call typed RPC methods on the tenant's object (`createShipment`, `markPaid`,
   `listShipments`, …); no raw SQL crosses the boundary. Writes and reads that must be consistent with them go through
   the object. The object updates `shipment_index` in D1 after its own commit (outbox row in the DO, retried by
   alarm until acknowledged), so the index is eventually consistent and **never authoritative**.
4. **Schema migrations per object.** Forward-only SQL files shared by every object, applied by an explicit
   `migrate(targetVersion)` RPC (not in the constructor), with `PRAGMA`-free version tracking in a `schema_version`
   table. A failing object enters `recovery` alone; the deploy pipeline migrates objects in batches and records
   progress in D1 (`tenant_schema_versions`).
5. **Analytics across tenants** (Super Admin `Ringkasan`) read pre-aggregated daily counters that each object pushes to
   D1 (`tenant_daily_stats`), not live fan-out queries.
6. **Placement.** Objects are created with `locationHint: "apac"` (a latency hint, not data residency).
7. **Backups.** Durable Object point-in-time recovery is used per object; a daily Cron also exports each active
   object's tenant tables to R2 (`t/<tenant_id>/backup/<date>.sqlite.gz`). Restore drills are an M6 gate.

## Consequences

- **Positive:** no shared 10 GB ceiling; each gerai has its own 10 GB and its own single-threaded writer, which already
  matched ADR-0004's serialization; dispatch journal and shipment row commit in one transaction; one tenant cannot
  read another's rows even through a query bug, because the rows live in a different object.
- **Costs:** cross-tenant queries need the D1 index or pushed aggregates; every schema change runs once per object;
  local tests must cover the DO migration RPC and the index outbox.
- **Throughput:** about 1,000 requests per second per object is far above one counter's load; the mini-site's public
  reads hit cached SSR and the D1 index, not the object, except `/lacak/:kode` which reads one shipment through RPC.
- **Superseded text:** wherever older documents say a tenant table lives in D1, this ADR wins; `docs/spec/01` §0 lists
  the store per table.
