# ADR-0004: Per-Outlet Atomic Serialization via Durable Object (`GeraiVaultDO`)

- **Status:** Accepted (2026-11-12)
- **Related:** DEC-201, DEC-211, DEC-216

## Context
At a busy counter, two staff devices may submit the same shipment or click `Tandai Lunas & Cetak` twice on a slow mobile connection. Furthermore, Mengantar's Public API:
1. Provides **no native idempotency key** on `POST /order` or `POST /order/pay-unpaid`, and
2. Rejects concurrent batch creation on J&T Premium and SiCepat with HTTP 409 (`Batch Concurrency` rule).

Relying solely on uncoordinated Cloudflare D1 queries across external network calls would risk duplicate provider orders, double balance debits, race conditions during `/invoices` balance sync, or stale API key rotations.

## Decision
Instantiate one **Durable Object (`GeraiVaultDO`) per `tenant_id`** as the single-threaded serialization gate for all state-critical outlet operations:
1. **Provider Order Dispatch & `pay-unpaid`:** writes an `in_flight` journal entry keyed by `idempotency_key` and `INV` slug (`destinationMark`) into DO storage *before* calling Mengantar; blocks concurrent dispatches for that seller; transitions ambiguous network drops to `reconciliation_needed` (never blind retry). Immediately after a paid `POST /order` succeeds, performs one bounded `GET /order?order_id=` read-back (`<= 5s` budget) to capture `DESTINATION_CODE` into `sorting_code` before printing (if the read-back times out, prints the subdistrict/postcode fallback immediately and backfills `sorting_code` asynchronously).
2. **Per-Tenant CSPRNG `INV` Slug Allocation & Receipt/Manifest Sequencing:** generates 7-char Crockford Base32 slugs using `crypto.getRandomValues` scoped to `(tenant_id, slug)` (regenerating on a `UNIQUE` conflict in the object's own SQLite store, ADR-0006), plus immutable receipt/void and manifest sequence ordering.
3. **Cashier Shift Lifecycle:** enforces at most one open shift per cashier/drawer and atomic expected-vs-counted cash closing.
4. **Mengantar Financial Sync Cursor:** serializes incremental `GET /invoices` ingestion per outlet so no invoice is double-applied to the local mirror book.
5. **Seller Key Rotation Fence:** increments expected `key_version` before calling Partner `api-key/regenerate` and atomically persists both the new `apiKey` and rotated `callbackSecret` (when non-null).

*(Amended by ADR-0006, 2026-11-15:)* the object also **stores** all of the tenant's tables in its SQLite storage, so lists and dashboards for one gerai are RPC reads on the object. Only cross-tenant views (Super Admin search, `/lacak` lookup by AWB) use the D1 `shipment_index`; mini-site pages are edge-cached SSR; rate quotes call Mengantar and cache areas in KV.

## Consequences
- **Positive:** rock-solid per-outlet serializability with zero cross-tenant lock contention and automatic hibernation when the counter closes at night.
- **Discipline:** external `fetch` calls inside `GeraiVaultDO` must enforce explicit `AbortSignal.timeout(15_000)` deadlines after persisting the pre-call journal.
