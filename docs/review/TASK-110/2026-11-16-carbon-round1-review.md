Verdict: REQUEST_CHANGES

### Findings

1. **[P1] `--env staging` probes the unprovisioned production `relay.geraiexpress.com` host (breaking TASK-109), and the probe CLI silently falls back to production on `--env` typos, false-greens bad `--force-fail` drills, and leaks `ALERT_WEBHOOK_URL` on invalid URL errors**
   - **Location:** `scripts/probes/probes-lib.mjs:13-27`, `scripts/probes/probes.mjs:19-36`
   - **Failure scenario:**
     1. `probeUrlsFor` (`probes-lib.mjs:14,24`) skips `relay-health` only when `env === "local"` and maps `"relay.geraiexpress.com": "relay.geraiexpress.com"` when `env === "staging"`. Staging uses `PARTNER_TRANSPORT: "direct"` (`wrangler.jsonc:95`, `docs/spec/07:89`), and `relay.geraiexpress.com` is not provisioned until Milestone M6 (`TASK-601`). When `TASK-109` runs `pnpm probes --env staging` after the M1 staging deploy (`TASKS.md:180`, where `scripts/probes/**` is outside `TASK-109`'s `Allowed Paths`), `relay-health` hits the non-existent production relay and exits `1`.
     2. `probeUrlsFor` (`probes-lib.mjs:13-27`) does not validate `env`: a typo such as `pnpm probes --env stg` or `--env dev` silently falls through to production `https://*.geraiexpress.com` URLs instead of failing closed (compare `scripts/do-migrate/do-migrate.mjs:25-28`). It also drops query strings (`${u.pathname}` without `${u.search}`).
     3. In `probes.mjs:19-25`, if `parseProbes` matches `0` lines in `OBSERVABILITY.md` or `--force-fail <name>` names an unknown/skipped probe (e.g. `--force-fail app_health` or `--force-fail relay-health --env local`), the script prints `probes: PASS` and exits `0` during a synthetic-breach drill without firing an alert.
     4. In `probes.mjs:33-34`, `fetch(hook, ...)` has no `try/catch` and ignores `!res.ok`: a malformed `ALERT_WEBHOOK_URL` throws Node's `TypeError [ERR_INVALID_URL]` whose `err.input` prints the full secret webhook URL to CI stderr, while an HTTP `4xx/5xx` response logs `ALERT sent: HTTP 500`.
   - **Smallest fix:**
     - Validate `env` against `"local" | "staging" | "production"` (exit `2` otherwise), skip `relay-health` unless `env === "production"`, map any `<slug>.gerai.cc` host to `<slug>-stg.gerai.cc` on staging, and preserve `${u.pathname}${u.search}`.
     - Fail closed (`exit 1` / `exit 2`) in `probes.mjs` when `targets.length === 0` or `--force-fail` matches no target probe; `.trim()` `ALERT_WEBHOOK_URL`, wrap `fetch(hook, ...)` in `try/catch` without printing `hook` or `err.input`, and report failure when `!res.ok`.

2. **[P1] Redaction bypasses leak reset/invite/webhook URLs, `spec 12` OTPs, TOTP/4-digit return OTPs, cookies in strings, and formatted Indonesian phones; `sendAlert` posts unredacted `alert.text` to the external webhook**
   - **Location:** `packages/telemetry/src/index.ts:31-67`, `apps/worker/src/telemetry/alerts.ts:24,28`
   - **Failure scenario:**
     1. **Reset links, invitation links & webhook path tokens (`OBSERVABILITY.md:52`, `docs/spec/01:107`, `docs/visual/07:111-112`):** `VALUE_RULES` (`index.ts:33-45`) masks `/api/public/{API_KEY}` (`line 35`) but has no rules for `/atur-sandi/<token>`, `/undangan/<token>`, `/webhooks/mengantar/<token>`, or sensitive query params (`?token=`, `?code=`, `?otp=`, `?secret=`, `?api_key=`, `?signature=`). Logging `{ url: "https://app.geraiexpress.com/atur-sandi/..." }`, `{ path: "/webhooks/mengantar/..." }`, or an `Error` containing those URLs leaks live single-use reset/invite links and webhook path tokens (and leaves high-cardinality tokens in `labels.route` if passed un-templated).
     2. **OTPs (`docs/spec/12:52`, `DEC-206`, `TASK-106`):** `/\b(otp|kode|code)(\D{0,12})\d{6}\b/gi` (`line 42`) fails on `spec 12 §4`'s own canonical subject `"Kode verifikasi GeraiExpress: 482915"` (`" verifikasi GeraiExpress: "` is 26 chars > 12), fails on `"TOTP: 482915"` (`\botp` rejects `totp`), and fails on all 4-digit `Meja Retur` WhatsApp pickup OTPs (`DEC-206`).
     3. **Formatted phone numbers & WhatsApp keys (`OBSERVABILITY.md:52`, `AGENTS.md`, `docs/spec/01:49,56`):** `/(?<![\d])(?:\+?62|0)8\d{4,11}(\d{4})(?!\d)/g` (`line 40`) requires contiguous digits, leaving `"+62 812-3456-7890"`, `"0812-3456-7890"`, and `"0812 3456 7890"` in plaintext; `SENSITIVE_KEY` (`line 31`) also omits `whatsapp` (`contact_whatsapp`, `support_whatsapp`).
     4. **Cookie strings, token chars & Web runtime objects:** Cookie values in strings or header tuple arrays (`"__Host-ge_app=..."`, `"__Host-ge_owner=..."`, `"dev_ge_app=..."`, `"Cookie: ..."`, `[["cookie", "__Host-ge_app=..."]]`) bypass `SENSITIVE_KEY`; `gx_live_[A-Za-z0-9]+` (`line 38`) stops at `-`/`_` and misses `gx_test_`, JWTs, and `Basic` credentials; `redact()` (`lines 58-67`) reduces `URL`, `Headers`, and `Date` instances to `{}` via `Object.entries`, expands `Uint8Array` byte-by-byte, and returns unredacted `String(value)` on line 67.
     5. **Unredacted external webhook payload (`alerts.ts:28`):** `emit("alert.fired", ...)` (`line 24`) redacts `alert.text` for Workers Logs, but line 28 posts raw `alert.text` directly to `ALERT_WEBHOOK_URL` without `redactString`.
   - **Smallest fix:**
     - Extend `VALUE_RULES` to mask `/atur-sandi/:token`, `/undangan/:token`, `/webhooks/mengantar/:token`, sensitive query parameters, `(?:__Host-ge_(?:app|owner)|dev_ge_(?:app|owner))=[^;\s"']+` and `(?:set-)?cookie:` headers, `Basic` / JWT / `gx_(?:live|test)_[A-Za-z0-9_-]+`, formatted Indonesian mobile numbers (`(?<![\d])(?:\+?62[\s.-]?|0)8(?:\d[\s.-]?){4,11}(\d{4})(?!\d)`), and OTPs covering `totp`, up to ~32 non-digit chars (`"Kode verifikasi GeraiExpress: 482915"`), and 4-digit OTP phrases (`\b(?:t?otp|kode\s*(?:otp|verifikasi|ambil|retur))\b`).
     - Add `whatsapp` to `SENSITIVE_KEY`; handle `URL` (`redactString(v.href)`), `Headers`, `Date` (`toISOString()`), and `ArrayBuffer`/`ArrayBufferView` (`"[BYTES]"`) in `redact()` with `redactString(String(value))` on fallback; pass `redactString(alert.text)` into the `ALERT_WEBHOOK_URL` payload in `alerts.ts`.

3. **[P2] Failed webhook delivery still commits the 30-minute `alert_state` suppression window, and `runChecks` aborts all later checks if one throws**
   - **Location:** `apps/worker/src/telemetry/alerts.ts:14-36`, `apps/worker/src/telemetry/checks.ts:16-22`
   - **Failure scenario:**
     1. `sendAlert` (`alerts.ts:15-22`) sets `alert_state.last_sent_at = now` in D1 *before* calling `fetchImpl(env.ALERT_WEBHOOK_URL)`. If the webhook returns `5xx`/`429` or times out (`"failed"`), `last_sent_at = now` stays committed in D1: the next five `*/5` cron runs return `"suppressed"`, dropping one-shot alerts outright and delaying outage notifications by 30 minutes per transient webhook error, with no error telemetry recorded for the failed delivery.
     2. `if (!env.ALERT_WEBHOOK_URL)` (`line 25`) does not `.trim()`, so whitespace-only values attempt `fetch` and fail instead of returning `"logged"`; `alert.key` is also not validated against `alert_state`'s `CHECK (length(alert_key) BETWEEN 1 AND 80)`.
     3. `runChecks` (`checks.ts:18-21`) runs `for (const check of CHECKS)` without `try/catch`: once downstream tasks register additional checks, a single throwing check aborts all remaining checks in the tick.
   - **Smallest fix:**
     - Keep the atomic pre-fetch claim to block concurrent duplicates, but when `fetchImpl` returns `!res.ok` or throws, roll back the claim (`UPDATE alert_state SET last_sent_at = ?1 - ?2, count = MAX(0, count - 1) WHERE alert_key = ?3 AND last_sent_at = ?1`) so the next check retries, and emit a `warn`/`error` telemetry event (never logging `ALERT_WEBHOOK_URL`). Trim `env.ALERT_WEBHOOK_URL` and bound `alert.key` to `1..80` chars.
     - Isolate each `check(env, now)` inside `try/catch` in `runChecks` and emit an error event on check failure.

4. **[P2] Missing `spec 10 §4.4` Public API anomaly signal primitives required by the TASK-110 contract**
   - **Location:** `packages/telemetry/src/index.ts:13,27-29`, `apps/worker/src/telemetry/checks.ts:1-23`
   - **Failure scenario:**
     - `TASKS.md:189-190` explicitly assigns **`Public API anomaly signals of spec 10 §4.4`** to TASK-110, and no downstream task (`TASK-201` `packages/mengantar-sdk/src/public/**`, `TASK-303`, `TASK-304`) has `packages/telemetry/**` or `apps/worker/src/telemetry/**` in its `Allowed Paths`.
     - `docs/spec/10:146-147` and `OBSERVABILITY.md:43` require three Public API anomaly signals: (1) any `403 IP_NOT_ALLOWED` on Public API → immediate owner alert, (2) per-tenant `401/403` spikes on Public API, and (3) 1-hour issue volume `> 3×` the tenant's 7-day baseline. Currently `OUTCOMES` (`index.ts:27-29`) omits `"mengantar.public_api"` and neither `@gx/telemetry` nor `apps/worker/src/telemetry/` exports anomaly evaluators or bounded-key Indonesian `Alert` builders for those three signals.
   - **Smallest fix:**
     - Define bounded `OUTCOMES["mengantar.public_api"]` (e.g. `["ok", "ip_not_allowed", "unauthorized", "forbidden", "rate_limited", "timeout", "error"]`) in `@gx/telemetry` and export pure anomaly helpers / Indonesian `Alert` builders for `403 IP_NOT_ALLOWED`, per-tenant `401/403` spike, and `1h > 3×` 7-day hourly baseline (with a minimum count floor to avoid low-volume noise, bounded `alert.key` values, and `tenantId` kept in `attrs` rather than labels).

5. **[P2] Vacuous `scheduled()` test (`expect(exports.default).toBeDefined()`), missing retry-after-failure alert test, and missing latency & real-`OBSERVABILITY.md` assertions in `probes.test.mjs`**
   - **Location:** `apps/worker/test/telemetry/alerts.test.ts:26-30,47-52`, `scripts/probes/test/probes.test.mjs:4-28`
   - **Failure scenario:**
     1. `alerts.test.ts:47-52` (`"the */5 cron runs the checks"`) runs after line 44 deleted the `'recovery'` row and asserts only `expect(exports.default).toBeDefined()`; deleting the entire body of `worker.scheduled` in `apps/worker/src/index.ts:73-76` leaves the test green, and non-`*/5` crons (`"0 * * * *"`) are untested.
     2. `alerts.test.ts:26-30` exercises HTTP 500 and network errors on distinct keys without asserting that a subsequent `sendAlert` call retries and delivers within 30 minutes.
     3. `probes.test.mjs:21` claims `"fails on status, body, latency and network errors"` but has no `ms > p.maxMs` assertion (deleting `probes-lib.mjs:39` leaves all tests green), uses a 4-line inline `MD` string instead of also parsing `OBSERVABILITY.md`, and checks staging URLs with partial `.toContain(...)` rather than `.toEqual(...)`.
   - **Smallest fix:**
     - Seed a `'recovery'` tenant in the `scheduled()` test (cleaning up in `finally`), assert `cron: "0 * * * *"` leaves `alert_state` untouched and `cron: "*/5 * * * *"` records `alert_key = 'tenant_recovery'` in `alert_state`, and add a retry-after-`"failed"` test in `alerts.test.ts`.
     - In `probes.test.mjs`, parse the repo's `OBSERVABILITY.md` (asserting all 6 probes), assert exact URL lists for `local` (5), `staging` (5), and `production` (6), and add a latency-breach assertion.

6. **[P3] English probe failure reasons appear inside Indonesian owner alert messages**
   - **Location:** `scripts/probes/probes-lib.mjs:34,37-39,49`, `scripts/probes/test/probes.test.mjs:26`
   - **Failure scenario:**
     - `alertPayload` formats Indonesian copy (`GeraiExpress [${env}] probe gagal: ...`), while `runProbe` emits English reasons (`"body mismatch"`, `"latency ... > ... ms"`, `"synthetic failure (--force-fail)"`), producing mixed English/Indonesian alert text (`AGENTS.md §2`, `DEC-217`).
   - **Smallest fix:**
     - Use concise Bahasa Indonesia reasons in `runProbe` (e.g. `"isi respons tidak sesuai"`, `"latensi ${ms} > ${p.maxMs} ms"`, `"kegagalan uji (--force-fail)"`) and update `probes.test.mjs:26`.

---

### Verified Invariants Checklist

- [x] **Bounded metric label keys (`OBSERVABILITY.md`):** `EVENTS` allowlists per-event label keys and `emit()` drops unknown keys (`tenant_id`, `phone`, `token`, `slug`, `hostname` cannot become label keys) while truncating string label values to 64 chars.
- [x] **Control D1 migration & Drizzle parity (`0001_alert_state.sql`, `packages/db/src/schema/control.ts`):** Forward-only SQLite DDL matches Drizzle `alertState` column names, nullability, primary key, and default (`apps/worker/test/migrations/schema-drift.test.ts`).
- [x] **Environment secret & Worker observability config (`wrangler.jsonc`, `.dev.vars.example`, `apps/worker/vitest.config.ts`):** `ALERT_WEBHOOK_URL` declared in top-level and `env.staging` `secrets.required`, empty default documented locally, and Workers Logs/Traces enabled with `upload_source_maps: false`.
- [ ] **Redaction completeness (`OBSERVABILITY.md`, `spec 10 §4.4`):** Mengantar `/api/public/{API_KEY}` URL path keys, `Bearer` tokens, contiguous `08`/`+628` phones, and sensitive object keys are masked, but reset/invite/webhook links, `spec 12` OTP subjects, `TOTP`/4-digit return OTPs, cookie strings, formatted phones, `whatsapp` keys, Web runtime objects, and external webhook `alert.text` have bypasses (Finding #2).
- [ ] **Public API anomaly signals (`TASKS.md` TASK-110, `spec 10 §4.4`, `OBSERVABILITY.md`):** Event key `"mengantar.public_api"` exists, but bounded outcomes and anomaly evaluators/alert builders for `403 IP_NOT_ALLOWED`, `401/403` tenant spikes, and `> 3×` 7-day baseline volume are missing (Finding #4).
- [ ] **Alert de-duplication & check isolation (`alerts.ts`, `checks.ts`):** Conditional D1 `ON CONFLICT DO UPDATE ... WHERE last_sent_at <= ?3 RETURNING` suppresses repeats across 30 min on success, but commits the 30-min suppression window on failed webhook calls and lacks per-check `try/catch` isolation (Finding #3).
- [ ] **Probe runner & staging host mapping (`scripts/probes/**`, `spec 07 §7`):** Platform staging hosts and `probe-stg.gerai.cc` match `hostClassifier`, but `--env staging` includes unprovisioned `relay.geraiexpress.com`, CLI input validation fails open on typos/bad `--force-fail`, and webhook `fetch` lacks `try/catch` + `res.ok` checks (Finding #1).
- [ ] **Test fidelity & Bahasa Indonesia alert copy (`alerts.test.ts`, `probes.test.mjs`, `probes-lib.mjs`):** Blocked by Findings #5 and #6.