Verdict: APPROVE

### Round-1 Fix Verification (Findings 1–7)

No open findings remain. All 7 Round-1 findings were verified directly on disk:

1. **[P1] `/healthz`, DCV host eligibility, & cross-context `404`s — Resolved** (`apps/worker/src/index.ts:11-64`, `apps/worker/src/host/classify.ts:91-97,149-153`, `apps/worker/src/http/pages.ts:28-29`, `apps/worker/test/host/routing.test.ts:49-80`)
   - `/healthz` requires `GET`/`HEAD`, a valid `normalizeHost`, and `hostShape(host, names) !== "never"`, returning `404` on `relay.`, unknown platform subdomains, tenant-zone apex, multi-label `*.gerai.cc`, and IP literals while staying storage-free on valid platform and candidate tenant hosts.
   - HTTP DCV pass-through is restricted to `GET`/`HEAD` on `tenant_candidate` hosts.
   - Tenant hosts serve `200` (with `escapeHtml(ctx.tenantSlug)`) only for `GET`/`HEAD /` until TASK-501; `app.` and `owner.` return `404` on `/api/*`, `/webhooks/*`, `/internal/*`, and `/mcp` before `serveSpa` (preserving `POST /internal/ops/do-migrate` on `owner.`).
2. **[P1] `vaultFor` placement hint, read-only probes, & `do-migrate` reconciliation/recovery — Resolved** (`apps/worker/src/do/gerai-vault/stub.ts:3-6`, `apps/worker/src/do/gerai-vault/core/migrate.ts:29-44`, `apps/worker/src/do/gerai-vault/index.ts:23-27`, `apps/worker/src/ops/do-migrate.ts:29-94`, `apps/worker/test/storage/do-migrate.test.ts:48-94`)
   - `vaultFor(env, tenantId)` (`getByName(tenantId, { locationHint: "apac" })`) is the sole `GERAI_VAULT` addressing path across the codebase.
   - `readSchemaState` and `tenantId()` check `sqlite_master` without creating tables; `--dry-run` writes zero D1 rows and zero DO tables (verified by test).
   - `handleDoMigrate` `LEFT JOIN`s `tenant_schema_versions`, reconciles lagging D1 rows when the object is already current, wraps `stub.migrate` in `try/catch`, bumps `tenants.routing_version` + clears `hostCache` both on entering and leaving `recovery`, and stops on first failure (`f-1` `200`, `f-2` `503`, `f-3` untouched → repair + re-run → `f-2` `200`).
3. **[P2] Control/tenant baseline parity & bidirectional Drizzle drift gate — Resolved** (`packages/db/migrations/control/0000_baseline.sql:7-12,48,95`, `packages/db/src/schema/control.ts`, `packages/db/src/schema/tenant.ts`, `packages/db/src/index.ts`, `apps/worker/test/migrations/schema-drift.test.ts`, `apps/worker/test/migrations/tenant.test.ts`)
   - `tenants` includes `logo_r2_key`, `contact_whatsapp`, and `operating_hours_json`; `slug` and `hostname` enforce lowercase character-set/hyphen `CHECK`s; `shipment_index_slug` index is present; Drizzle defaults and `schema/tenant.ts` mirror both SQL tracks and are verified in both directions by `schema-drift.test.ts`; tenant migration tests live at `test/migrations/tenant.test.ts`.
4. **[P2] Local Wrangler state path alignment — Resolved** (`package.json:11,20`)
   - Both `pnpm dev` and `pnpm db:migrate:local` target `--persist-to .wrangler/state-dev`.
5. **[P2] Probe HMAC separator, method/state guards, & IPv4 literal rejection — Resolved** (`apps/worker/src/host/classify.ts:48,62,167-178,195-198`, `docs/spec/11-CLOUDFLARE-SAAS-HOSTNAMES-AND-TENANT-ROUTING.md:41-47,74`, `apps/worker/test/host/classify.test.ts:33,137-152`)
   - `probeSignature` signs `${host}:${nonce}`, `classify` restricts probes to `GET` on `pending`/`active` hosts of non-suspended tenants, `TLD_RE` rejects decimal/octal/hex/shorthand IPv4 literals before lookup, and `spec 11 §3, §5` matches the implementation.
6. **[P2] Outbox safety alarm, flush coalescing, & pre-migration guards — Resolved** (`apps/worker/src/do/gerai-vault/index.ts:12,30-41,57-113`, `apps/worker/test/migrations/tenant.test.ts:34-39,99-141`)
   - `migrate` validates `tenantId` (`length > 0`) and `target` before creating `vault_identity`; `flushOutbox` is a no-op on unmigrated objects, coalesces concurrent calls via `this.flushing`, sets a safety alarm before awaiting D1, increments `attempts` atomically in SQL (`RETURNING attempts`), and exposes `enqueue` + `armOutbox` helpers.
7. **[P3] Fixed-width secret digest comparison & `.dev.vars` token parsing — Resolved** (`apps/worker/src/crypto/index.ts:21-24`, `scripts/do-migrate/do-migrate.mjs:38-43`)
   - `timingSafeEqualStr` compares 32-byte SHA-256 digests; `localOpsToken` trims CR/whitespace and strips matching quotes.

---

### Verified Invariants Checklist

- **Lightweight Cloudflare Stack & Zero KV Host Lookup (`AGENTS.md §3.1`, `ADR-0006`, `DEC-228`, `spec 11 §3`):** PASS — `d1HostLookup` queries D1 `tenant_hostnames` + `tenants` + `tenant_schema_versions` with a `<= 30 s` bounded in-isolate `HostCache`; `CACHE_KV` is never consulted for host routing; zero Next.js/OpenNext or Node-only Worker dependencies.
- **Five-Context Host Classifier & Cross-Context Isolation (`ARCHITECTURE §3`, `ADR-0002`, `spec 11 §3–5`, `spec 07 §2, §7`):** PASS — exact platform contexts (including staging labels), candidate-tenant `GET`/`HEAD` DCV pass-through, `host:nonce` probe HMAC, case/port/trailing-dot normalisation, all IPv4/IPv6 literal forms rejected, `X-Forwarded-Host` ignored, `relay.` never served (including `/healthz`), neutral Indonesian `404`/`403`/`503` responses, and cross-context API/path `404` guards verified.
- **Strict Tenant Addressing & Placement (`AGENTS.md §3.2`, `ADR-0004`, `ADR-0006 §6`):** PASS — `vaultFor(env, tenantId)` enforces non-empty `tenantId` with `{ locationHint: "apac" }`; `vault_identity` binds each `GeraiVaultDO` to its `tenant_id` on first valid `migrate` and refuses mismatches across `migrate` and `ready`.
- **Two-Track Forward-Only Migrations & Batched `do:migrate` (`ADR-0006 §4`, `spec 01 §0`, `spec 07 §6`, `docs/WORKFLOW.md §3–4`):** PASS — D1 control baseline (`0000_baseline.sql`) and `GeraiVaultDO` baseline (`0001_baseline.sql`) match Drizzle `sqlite-core` schemas in both directions (`schema-drift.test.ts`); `PRAGMA`-free `schema_version` runs per-step `transactionSync` rollbacks; `do:migrate` supports pure dry-runs, D1 state reconciliation, isolated `recovery` (`503`) on failure, and `routing_version` invalidation.
- **Versioned Absolute-Upsert DO→D1 Outbox (`ADR-0006 §3`):** PASS — `shipment_index` enforces `WHERE excluded.version > shipment_index.version` with `tenant_id` bound from `vault_identity`, pre-await safety alarms, coalesced flushes, SQL-atomic retry backoff, and delete-after-ack semantics.
- **Integer Precision, `NULL != 0`, & Language Split (`AGENTS.md §2, §3.3`, `spec 01 §0, §2`):** PASS — timestamps, Rupiah (`_idr`), and gram (`_gram`) columns use SQLite `INTEGER` with `NULL` preserved distinct from `0`; user-facing pages/errors use natural Bahasa Indonesia while code and specs use English.