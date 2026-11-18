# TASK-701 — disposition of GPT-6.1 Sol R1 (`R1-sol.md`, REQUEST_CHANGES on `7ced83a`)

The branch was first rebased onto `main` `d7ebf4e` (TASK-701 is now `032226b`; only shared docs and
`.delivery/current.json` conflicted). All seven findings are fixed with regressions; each has at least one mutation
that turns a test red (`docs/evidence/TASK-701/mutations.md`, T701-R1-M1..M12).

| # | Sev | Finding | Fix | Regression | Mutations |
|---|---|---|---|---|---|
| F1 | P1 | Allowed text fields (`courier`, `eta`, `destination`, packing `name`, paid `courier`) carried request text into `state_json` and the public view | The counter now sends ids: `serviceCode` → `courier_service_catalog.display_name` (active only; unknown → `422`), `destinationAreaId` → the Mengantar area label with that exact id among the search results for the picked label's first segment (no match/outage → no destination). ETA kept only when it matches `N[-M] hari|jam`. A packing name shows only when it is an active item of the gerai's own `packing_items` (stored spelling), else `Packing`. `paid` names the courier from the shipment's own `service_code` via the catalog (Worker passes the active catalog map); nothing from the request. `apps/worker/src/api/app.ts` (`displayText`), `do/gerai-vault/customer-display/index.ts`, `routes/kasir/index.tsx` | worker "F1: PII in the allowed fields never reaches the stored or public state…" (street, phone, sender name in courier/eta/destination/label/packing name; asserts `state_json` and the public view, catalogue packing name, unresolved area → `null`, bad `serviceCode` → `422`); the main test now expects catalog `J&T Express`, canonical area label and `2-3 hari`, and a paid push with a phone in `courier` | M1–M4 |
| F2 | P2 | BroadcastChannel payloads overwrote any same-slug display | Pair/status/view return a non-secret `pairId` (session row id). The channel carries only `{ tenantSlug, pairId }`; the display treats it as a refresh hint (`isHintFor`) and reads its own `view` with its own `kode` — message contents are never shown | unit `isHintFor`; worker "F2: pair, status and view agree on a non-secret pairId" | M6, M7 |
| F3 | P2 | Re-pairing an unchanged checkout did not republish | Publication is keyed by `pairId|input`, so a new pairing reruns the push. The dialog also drops its one-time QR view on close, so `Buat Kode Baru` is reachable without reloading (and losing) the checkout | e2e: `Buat Kode Baru` on the same checkout → old display ends, new device shows `Rincian pembayaran` + total | M11 |
| F4 | P2 | `kind in LINE_LABELS` accepted inherited keys | `typeof kind === "string" && Object.hasOwn(LINE_LABELS, kind)` | worker "F4": `__proto__`, `constructor`, `toString`, `hasOwnProperty`, number, null, array, object → `422 DISPLAY_INVALID`, stored state unchanged | M5 |
| F5 | P2 | Overlapping polls; older responses overwrote newer screens | `createViewSync`: one request in flight, one queued; a view older (`updatedAt`) than the one shown for the same `pairId` is dropped. Poll, visibility and hints all go through it | unit "never overlaps fetches, runs one queued refresh, and drops an older response" (+ `isNewer`) | M8, M9 |
| F6 | P2 | A failed state write left the display stale | `runWithRetry` 1.5 s → 3 s → 6 s for network/5xx (4xx is permanent), cancelled on input/pairing change or unmount; a timer that fires after cancel does nothing | unit (bounded delays, recovery, cancel); e2e aborts the first state write after choosing the courier and the display still reaches checkout | M10 |
| F7 | P2 | Raw browser exception text on QRIS upload failure | Server refusals become `ApiError` (their Indonesian message is kept); any other error shows "Gagal mengunggah gambar QRIS. Periksa koneksi lalu coba lagi." | e2e aborts the upload request → Indonesian message, no `Failed to fetch`/`TypeError` | M12 |

Contract: spec 03 §5.2 (ids in, server-named text out) and §5.5 (pairId hint, keyed publication, retry, ordered
reads) updated in the same change.

Verification on the fixed tree is recorded in ledger run `RUN-20261118T114134Z-c6efb09b` (worker, migrations,
isolation, e2e, `pnpm check`), all executed PASS: unit 188, Workers 443 in 63 files, migrations and isolation suites
green, e2e 30 passed (customer-display at 390/768/1280 + checkout, pos-guards, quote, settings, shift, print), bundle-audit
PASS. Boundary: REVIEW_REQUIRED (effective R4); the run closes BLOCKED pending Sol R2 and a release run follows at the
reviewed head.

## Sol R2 (`R2-sol.md`, REQUEST_CHANGES) — all seven R1 findings confirmed resolved; one new P2

| # | Sev | Finding | Fix | Regression | Mutations |
|---|---|---|---|---|---|
| R2-F1 | P2 | The awaited area lookup let an older in-flight publication (A) reach the tenant object after a newer one (B) and overwrite it, with a newer `updatedAt` that the ordered reader then accepted | **Server:** `customer_display_sessions.state_seq` (tenant `0024`, not yet applied anywhere, so amended in place) holds the pairing's last applied publication order; `setDisplayState` writes only `WHERE state_seq < seq` and the route answers `stale: true` for a dropped write. A new pairing starts at 0. A request without `seq` (a counter page loaded before this fix) writes unconditionally as before and bumps `state_seq`. **Counter:** `createPublisher` (replaces `runWithRetry`) keeps one publication in flight, coalesces inputs published meanwhile to the newest, numbers each send `max(Date.now(), last + 1)`, and retries only the newest input (1.5 s → 3 s → 6 s; a newer input or unmount cancels). | worker "an older publication held in its area lookup cannot overwrite a newer one…" — A's area search waits on a one-shot mock gate (`mockFaults.areaSearchGate`), B commits, A is released: A answers `stale`, stored `state_json`/`state_seq` and the public view stay B; equal seq refused, higher applied, a new pairing starts fresh. Unit: no two in flight + coalescing + monotonic seq under a backwards clock; an older failed input is not retried once a newer one exists; bounded retry; cancel by newer input / stop | T701-R2-M1 (server), M2, M3 (counter) |

Both layers are needed: the counter serialises its own publications, and the tenant object enforces order for
anything that still races (two `/kasir` tabs, a retry crossing the network).

Verification of the R2-F1 fix (run `RUN-20261118T122124Z-437e69ce`): worker 444 in 63 files, migrations, isolation,
unit 190, `pnpm check` (bundle-audit PASS) all executed PASS. The first e2e record of this run was FAIL — 29 passed, 1
failed — and the reporter kept only its summary line, so the failing test was not identified. Two later runs of the
same seven specs passed 30/30 (3 desktop-only skips), the second through the ledger with a JSON report (0 unexpected,
0 flaky), and `customer-display` passed 9/9 under `--repeat-each=3`. Boundary: REVIEW_REQUIRED (R4); the run closes
BLOCKED pending Sol R3.

