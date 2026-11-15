Verdict: REQUEST_CHANGES

### Findings

1. **[P1] `relay.` is served on `/healthz` & DCV, and cross-context paths return `200 OK` instead of `404`**
   - **Location:** `apps/worker/src/index.ts:14,35-46`, `apps/worker/src/assets/spa.ts:48`, `apps/worker/src/host/classify.ts:132`, `apps/worker/test/host/routing.test.ts:49-52`
   - **Failure scenario:**
     1. `index.ts:14` answers `200 {"ok":true}` before any host check, so `GET http://relay.geraiexpress.localhost:8787/healthz` (plus IP literals like `127.0.0.1/healthz` and multi-label `a.b.gerai.localhost/healthz`) returns `200`, violating `TASKS.md` TASK-102 (`relay. never served`) and masking a misrouted `relay.geraiexpress.com` against `OBSERVABILITY.md:19` (`relay-health` must verify the VPS relay, never the Worker). Likewise, `classify.ts:132` returns `{ outcome: "dcv" }` on `relay.` and `*.geraiexpress.com` Worker Custom Domains (which have no upstream origin behind `fetch(request)` and 522/loop in production), and accepts non-`GET`/`HEAD` methods.
     2. On active tenant hosts (`index.ts:35-40`), **every** path and HTTP method returns `200 OK` HTML (with `ctx.tenantSlug` interpolated unescaped). A misconfigured `POST https://berkahjaya.gerai.cc/webhooks/mengantar/<tok>` or `POST /internal/ops/do-migrate` or `GET /api/owner/gerai` or `GET /kiriman` receives `200 OK`, silently dropping webhooks; `routing.test.ts:50` (`get("berkahjaya.gerai.localhost", "/kiriman")`) received `200` and only asserted `.not.toContain('<div id="root">')` instead of `404`.
     3. On `app.` and `owner.` (`index.ts:43,46` → `spa.ts:48`), `serveSpa` returns `200 index.html` for cross-context `GET /api/owner/*` on `app.`, `GET /api/app/*` and `GET /api/v1/*` on `owner.`, `GET /webhooks/*`, and `GET /internal/*`, violating `ADR-0002` and TASK-102 `Done when` (`cross-context 404s`).
   - **Smallest fix:**
     - Validate normalised `Host` syntactically first (rejecting malformed/IP hosts, `relay.` and non-platform `*.${platformApex}`, `${tenantZone}` apex, and multi-label `*.${tenantZone}`) before answering `/healthz` (keeping `/healthz` storage-free on valid platform + candidate tenant hosts per `spec 07 §2`) and before DCV pass-through (restricting DCV to `GET`/`HEAD` on non-platform hosts).
     - On `ctx.kind === "tenant"`, serve `200` (with HTML-escaped `tenantSlug`) only for `GET`/`HEAD` on `/` until TASK-501; return `notFoundHtml()` (`404`) for all other paths/methods.
     - Reject `/api/*`, `/webhooks/*`, `/internal/*`, and `/mcp` before `serveSpa`, and assert `404` across all cross-context paths (plus `relay./healthz`) in `routing.test.ts`.

2. **[P1] `do-migrate` deadlocks D1 `recovery`/`migrating` rows, mutates DO storage on `--dry-run` without `locationHint: "apac"`, and lacks failure-path coverage**
   - **Location:** `apps/worker/src/ops/do-migrate.ts:23-58`, `apps/worker/src/do/gerai-vault/index.ts:18-34`, `apps/worker/src/do/gerai-vault/core/migrate.ts:29-39`, `apps/worker/src/host/classify.ts:167`, `apps/worker/test/storage/do-migrate.test.ts:16-39`
   - **Failure scenario:**
     1. `do-migrate.ts:35-38` inspects only `stub.schemaState()` and skips (`alreadyCurrent++; continue`) whenever the DO is `{ version: TENANT_SCHEMA_VERSION, state: "ok" }`, ignoring D1 `tenant_schema_versions`. If D1 errored before line 54 (`upsertProgress(..., "ok")`) — leaving D1 in `'migrating'` — or a `'recovery'` DO was repaired out of band, re-running `pnpm do:migrate` skips the tenant forever and leaves `d1HostLookup` stuck in `'recovery'` (`503`) or `'migrating'`. In addition, `do-migrate.ts:46` has no `try/catch` around `stub.migrate(...)` (an RPC throw leaves D1 in `'migrating'` and returns raw 500), line 54 does not bump `routing_version` or clear `hostCache` when exiting `'recovery'`, and line 50 does not clear in-isolate `hostCache` when entering `'recovery'`.
     2. `do-migrate.ts:34-35` calls `env.GERAI_VAULT.getByName(id)` (omitting `{ locationHint: "apac" }` required by `ADR-0006 §6`) and `await stub.schemaState()` *before* `if (body.dryRun)` (`line 40`). Because `readSchemaState` (`migrate.ts:30`) and `tenantId()` (`gerai-vault/index.ts:19`) unconditionally execute `CREATE TABLE IF NOT EXISTS ...`, `--dry-run` mutates SQLite storage on every unprovisioned tenant DO and permanently pins its physical region outside `apac` if invoked from a non-APAC CI runner.
     3. `do-migrate.test.ts` tests only the happy path (`failed === null`); `do-migrate.ts:47-53` (stopping batch walk on first failure, marking that tenant `'recovery'` → `503` while earlier tenants serve `200`, TASK-103 `Done when`) has zero test coverage.
   - **Smallest fix:**
     - Introduce a single helper `getGeraiVault(env, tenantId)` calling `env.GERAI_VAULT.getByName(tenantId, { locationHint: "apac" })`.
     - Make `readSchemaState` and `tenantId()` read-only (check `sqlite_master` before `SELECT`; create `vault_identity` / `schema_version` only inside `migrate()`).
     - `LEFT JOIN tenant_schema_versions` in `handleDoMigrate`: when the DO is `ok` at `TENANT_SCHEMA_VERSION` but D1 differs (and `!body.dryRun`), reconcile D1 to `'ok'` and bump `routing_version` + `hostCache.clear()` if prior D1 state was `'recovery'`; wrap `stub.migrate` in `try/catch` so thrown errors also record `'recovery'`, bump `routing_version`, `hostCache.clear()`, and stop the batch.
     - Add an integration test in `do-migrate.test.ts` where tenant 2 fails migration: assert tenant 1 serves `200`, batch stops at tenant 2 (`503` + `Retry-After`), tenant 3 is untouched, and re-running after repair restores tenant 2 to `200`.

3. **[P2] Control baseline omits `spec 01 §2.1` `tenants` columns & `shipment_index(slug)` index; tenant Drizzle schema & drift check missing**
   - **Location:** `packages/db/migrations/control/0000_baseline.sql:4-18,78-89`, `packages/db/src/schema/control.ts:4-17,79-92`, `packages/db/src/index.ts:1`, `apps/worker/test/storage/schema-drift.test.ts:7-16`
   - **Failure scenario:**
     1. `spec 01 §2.1` defines `tenants` with `logo_r2_key`, `contact_whatsapp`, and `operating_hours_json` (read by cached SSR mini-sites without waking `GeraiVaultDO`, `ADR-0006` / `DEC-207`, and TASK-501 owns no control migration), yet all three columns are missing from `0000_baseline.sql` and `control.ts`. `tenants.slug` (`line 6`) only checks `length(slug) BETWEEN 3 AND 30` without enforcing lowercase `[a-z0-9-]`, and `control.ts` omits `.default(...)` on columns with SQL `DEFAULT`s (`status`, `routing_version`, `masking_enabled`, `tier_code`, `tenant_members.status`, `tenant_hostnames.role`).
     2. `shipment_index` (`0000_baseline.sql:78-89`) indexes `(tenant_id, slug)` and `(awb_number)` only; Super Admin cross-tenant search by `INV` (`spec 06 §4`: `WHERE slug = ?` without `tenant_id`) forces a full D1 table scan.
     3. `spec 01 §0` and `ARCHITECTURE.md §5` require Drizzle `sqlite-core` schemas across both tracks, but `packages/db` lacks `src/schema/tenant.ts` for `0001_baseline.sql` tables, `schema-drift.test.ts` neither checks tenant tables nor verifies reverse SQL→Drizzle table completeness, and `pnpm test:worker test/migrations/tenant.test.ts` (`docs/WORKFLOW.md §4`) fails with "No test files found".
   - **Smallest fix:**
     - Add `logo_r2_key TEXT`, `contact_whatsapp TEXT`, `operating_hours_json TEXT`, lowercase/charset `CHECK`s on `tenants.slug` and `tenant_hostnames.hostname`, and `CREATE INDEX shipment_index_slug ON shipment_index(slug)` in `0000_baseline.sql`, mirroring columns, `.default(...)`s, and the index in `control.ts`.
     - Add `packages/db/src/schema/tenant.ts` (exported from `@gx/db` and `./schema/tenant`), extend `schema-drift.test.ts` to verify bidirectional table/column/nullability parity on both D1 and migrated `GeraiVaultDO`, and place/re-export the tenant migration tests at `apps/worker/test/migrations/tenant.test.ts`.

4. **[P2] `pnpm db:migrate:local` and `pnpm dev` use different Wrangler persistence directories**
   - **Location:** `package.json:11,20`
   - **Failure scenario:**
     - `package.json:20` applies D1 migrations with `--persist-to .wrangler/state-dev`, whereas `package.json:11` runs `wrangler dev --local` without `--persist-to` (defaulting to `.wrangler/state`). Running `pnpm db:migrate:local` followed by `pnpm dev` and `pnpm do:migrate --env local` hits an unmigrated D1 database in `.wrangler/state` (`D1_ERROR: no such table: tenants`).
   - **Smallest fix:**
     - Use the same persistence path in both scripts (either add `--persist-to .wrangler/state-dev` to `"dev"` in `package.json:11` or drop `--persist-to .wrangler/state-dev` from `"db:migrate:local"` in `package.json:20`).

5. **[P2] `probeSignature` lacks host/nonce delimiter (cross-TLD HMAC oracle), accepts non-`GET`, and `normalizeHost` misses non-decimal/shorthand IPv4 literals**
   - **Location:** `apps/worker/src/host/classify.ts:48-64,156-160,176-178`, `docs/spec/11-CLOUDFLARE-SAAS-HOSTNAMES-AND-TENANT-ROUTING.md:38,67`
   - **Failure scenario:**
     1. `probeSignature` (`classify.ts:177`) signs `host + nonce` without a separator while `nonce` permits `[A-Za-z0-9_-]{16,128}`. Because real TLDs share prefixes (`.co`/`.com`, `.de`/`.dev`, `.in`/`.info`, `.or`/`.org`), a tenant owning `kirim.toko.co` can call `GET https://kirim.toko.co/.well-known/geraiexpress-probe/m<nonce>` to obtain `HMAC(PROBE_SECRET, "kirim.toko.co" + "m" + nonce)` — identical to `HMAC(PROBE_SECRET, "kirim.toko.com" + nonce)` — forging the deployment-reachability proof for `kirim.toko.com`. `classify.ts:156` also allows `POST`/`PUT` on `PROBE_PREFIX` (`spec 11 §3 step 1` specifies `GET`) and answers `200` on `suspended`/`moved` hosts.
     2. `normalizeHost` (`classify.ts:60`) rejects only `/^\d{1,3}(\.\d{1,3}){3}$/`, allowing octal (`0177.0.0.1`), hex (`0x7f.0.0.1`, `0x7f.0x0.0x0.0x1`), and shorthand (`127.1`, `127.0.1`) IPv4 literals to pass `LABEL_RE` and trigger D1 lookups + cache entries instead of returning `bad_request`.
   - **Smallest fix:**
     - Sign `${host}:${nonce}` (`:` is impossible in both normalised `host` and `nonce`), update `spec 11 §3, §5` in the same diff (`AGENTS.md §1`), require `request.method === "GET"` on `PROBE_PREFIX`, and refuse probes when `tenantStatus === "suspended"` or `hostState` is `"suspended"`/`"moved"`/`"purged"`.
     - Require the rightmost DNS label in `normalizeHost` to match `/^[a-z][a-z0-9-]{0,61}[a-z0-9]$/` (ASCII TLDs and `xn--` punycode always start with `[a-z]` and have length `>= 2`), rejecting all IPv4 literal forms before lookup; add octal/hex/shorthand test cases in `classify.test.ts`.

6. **[P2] Outbox has a pre-alarm crash window before first D1 flush, unserialized concurrent flushes, and unvalidated pre-migration state**
   - **Location:** `apps/worker/src/do/gerai-vault/index.ts:25-30,44-77`
   - **Failure scenario:**
     1. `enqueueOutbox` (`core/outbox.ts:24`) inserts rows synchronously without setting an alarm, and `flushOutbox` calls `scheduleOutbox()` only *after* `for (const row of rows)` (`line 75`). If the DO is evicted or crashes while `await d1UpsertStatement(...).run()` hangs on the last shipment before closing, `getAlarm()` remains `null` and the committed outbox row is stranded until the next RPC hours later.
     2. Durable Objects release the input gate across external D1 `await`s (`line 60`), so concurrent `flushOutbox()` / `alarm()` calls read stale `row.attempts` (`const attempts = row.attempts + 1`, `line 65`) and clobber retry backoff.
     3. In `migrate()` (`lines 25-28`), an empty `tenantId` (`""`) or invalid `target` (`migrate(id, 99)`) writes `vault_identity` before validation (and `""` later fails `!bound` with `UNIQUE constraint failed`), while calling `flushOutbox()` when `schema_version = 0` (failed baseline migration) throws `no such table: outbox`.
   - **Smallest fix:**
     - Validate `tenantId.length > 0` (using `bound !== null`) and `target` before inserting `vault_identity`; return `{ delivered: 0, failed: 0 }` in `flushOutbox` when `readSchemaState(this.ctx.storage).version < 1`.
     - Persist the safety alarm *before* awaiting D1 (`await this.scheduleOutbox()` prior to the D1 loop, plus a `protected` helper on `GeraiVaultDO` for transactional enqueue + alarm scheduling), coalesce concurrent `flushOutbox` calls behind an instance promise, and compute `attempts = attempts + 1` in SQL (`RETURNING attempts` or re-read).

7. **[P3] `timingSafeEqualStr` scales dummy compare with caller input length; `do-migrate.mjs` `.dev.vars` regex retains `\r`**
   - **Location:** `apps/worker/src/crypto/index.ts:18-26`, `scripts/do-migrate/do-migrate.mjs:39`
   - **Failure scenario:**
     - `timingSafeEqualStr(a, b)` runs `crypto.subtle.timingSafeEqual(ab, ab)` on length mismatch where `a` is caller-controlled, leaking secret length timing relative to `(bb, bb)` and doing unbounded work on oversized `Authorization` headers.
     - `localOpsToken()` (`do-migrate.mjs:39`) matches `/^OPS_TOKEN="?([^"\n]+)"?$/m`, capturing `\r` on CRLF `.dev.vars` files or single quotes and causing `401 UNAUTHORIZED`.
   - **Smallest fix:**
     - Compare 32-byte SHA-256 digests (or cap `a.length` and dummy-compare `bb, bb`), and `.trim()` / strip matching `'` or `"` in `localOpsToken()`.

---

### Verified Invariants Checklist

- **Lightweight Cloudflare Stack & Zero KV Host Lookup (`AGENTS.md §3.1`, `ADR-0006`, `DEC-228`, `spec 11 §3`):** PASS — `d1HostLookup` queries D1 `tenant_hostnames` + `tenants` + `tenant_schema_versions` with a `<= 30 s` in-isolate `HostCache`; `CACHE_KV` is never read for host routing; zero Next.js/OpenNext or Node-only Worker dependencies.
- **Integer Precision & `NULL != 0` (`AGENTS.md §3.3`, `spec 01 §0, §2`):** PASS — timestamps, `counter_service_fee_default_idr`, `cargo_recommend_threshold_gram`, and `masking_daily_quota` use SQLite `INTEGER` with `NULL` preserved distinct from `0`.
- **Two-Track Migrations & Explicit Per-Object RPC (`ADR-0006 §4`, `docs/WORKFLOW.md §3`):** PARTIAL — forward-only SQL tracks, `PRAGMA`-free `schema_version`, per-step `transactionSync` rollback, and `vault_identity` tenant-mismatch refusal work as designed; blocked by Findings #2, #3, #4, #6.
- **Versioned Absolute-Upsert DO→D1 Outbox (`ADR-0006 §3`):** PARTIAL — `shipment_index` enforces `WHERE excluded.version > shipment_index.version` with `tenant_id` bound from `vault_identity` and deletes outbox rows only after D1 `run()` resolves; blocked by Finding #6.
- **Five-Context Host Classifier & Cross-Context Isolation (`ARCHITECTURE §3`, `ADR-0002`, `spec 11 §3–4`):** PARTIAL — five contexts, staging host labels, case/port/trailing-dot normalisation, ignored `X-Forwarded-Host`, and neutral Indonesian `404`/`403`/`503` responses are implemented; blocked by Findings #1, #5.