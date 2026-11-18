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

## Sol R3 (`R3-sol.md`, REQUEST_CHANGES) — DO ordering guard verified; two P2 publisher lifecycle findings

| # | Sev | Finding | Fix | Regression | Mutations |
|---|---|---|---|---|---|
| R3-F1 | P2 | The hook skipped `publish()` when the input equalled the last acknowledged one, so returning to A after B failed left B's retry alive; it then landed and stayed | The hook declares every input change to the publisher (its `last.current` shortcut is gone). Dedup lives in the publisher: `target` (current input) vs `acked` (key the server is known to hold). Every `publish()` cancels a pending retry; the current input is skipped only when `target === acked` and nothing is in flight. A transient failure sets `acked = null` (the request may have landed), so returning to A after B failed re-sends A. | unit "A applied → B fails → back to A before B's retry…" (B's retry cancelled, even a late-firing timer sends nothing, sends `A, B, A`) and "skipped only when the server holds it and nothing else is in flight"; e2e: QRIS (A) shown → Tunai (B) aborted once at the network → back to QRIS before 1.5 s → after 5 s no Tunai publication was sent again, the display shows the QRIS card and no `Cara bayar:` | T701-R3-M1 (unit), T701-R3-M2 (e2e, hook shortcut restored) |
| R3-F2 | P2 | `lastSeq` restarted at 0 per mounted publisher while the pairing kept its high-water mark; a remount/second counter with an earlier clock was rejected and the stale answer was treated as success | The tenant object returns the pairing's stored `seq` from pair (0), status and every state answer (read after the write). The hook keeps the highest seen in `serverSeq` and gives it to the publisher as `floor`: `seq = max(clock, last + 1, floor + 1)`. `send` reports `{ applied, seq }`; a `stale` answer lifts `lastSeq` to the mark and, only while that input is still the current target, is sent once more (a second stale parks it — no loop); a stale answer for a superseded input is dropped. | worker "pair, status and state report the pairing's stored mark; a fresh counter numbered below it is told so" (A at 2000, B at 1000 → `stale` + `seq 2000`, B at 2001 applies on the same pairing); unit: floor numbering with an earlier clock, stale → one resend → acknowledged, superseded stale dropped, second stale stops | T701-R3-M3, M4 (unit), T701-R3-M5 (worker) |

Verification of the R3 fixes (run `RUN-20261118T125336Z-519c2283`): migrations, isolation, e2e (30 expected, 0
unexpected, 0 flaky via the JSON report; customer-display at 390/768/1280 incl. the A→B-fail→A step), `pnpm check`
and unit (Tests  194 passed (194)) PASS. The first `worker` record was FAIL with only `[ELIFECYCLE] … exit code 1` captured (the same
uncaptured-transient pattern as TASK-701's first run); a direct re-run and a ledger re-record with the full output
teed to a file both passed 445/445 in 63 files, and `pnpm check` (which runs the same suite) passed in between. The
ledger keeps both worker records. Boundary: REVIEW_REQUIRED (R4); the run closes BLOCKED pending Sol R4.

## Sol R4 (`R4-sol.md`, REQUEST_CHANGES) — R3-F1 and R3-F2 verified; one P2

| # | Sev | Finding | Fix | Regression | Mutation |
|---|---|---|---|---|---|
| R4-F1 | P2 | A `stale` answer for a superseded input (B) left `acked = A`, although it proves something newer (another tab's C) is stored; returning to A while B was in flight was then deduplicated away | In the stale branch the publisher clears `acked` **before** the "is this input still current" check (`display-sync.ts`). The final pump then sends the current A above the server's mark. | unit "R4-F1: A applied → B in flight → back to A → B answers stale at 2000: A is sent again above 2000" (sends `A, B, A`, last seq > 2000, then a clean no-op once A is acknowledged) | T701-R4-M1 (the line removed → that test red) |

Verification (run `RUN-20261118T131308Z-6159ef9a`, outputs teed): unit 195, Workers 445, `pnpm check` (bundle-audit
PASS) and e2e (30 expected, 0 unexpected, 0 flaky) all executed PASS on the first attempt. Boundary: REVIEW_REQUIRED
(R4); the run closes BLOCKED pending Sol R5.

## Sol R5 (`R5-sol.md`) — APPROVE on `94588b5`

R4-F1 resolved with deterministic, mutation-backed coverage; no open findings, merge verdict OK. Release run
`RUN-20261118T132524Z-b80efae9` starts at the reviewed head, re-executes the required checks, carries the review and
finishes PASS before the merge commit. The fix runs before it closed BLOCKED (pending review), as the boundary contract
requires a finished run before each commit.

Release-run correction: `RUN-20261118T132524Z-b80efae9` executed every gate PASS, but its review step was refused (a
non-ASCII dash in the reviewer-route reason), `finish PASS` failed, and the record was committed anyway because the
commands were chained with `;` — HEAD moved, so that run closed BLOCKED. The next release run,
`RUN-20261118T133332Z-d154b173`, closed **FAIL**: its e2e gate caught a real defect (see "Release gate finding" below).

## Release gate finding — status race after pairing (found by the release e2e, not by review)

The release e2e (JSON report) failed once on `customer-display` at phone-390: after `Pasangkan Layar` the button never
became `Layar Pelanggan (terhubung)`. Cause: opening the dialog calls `refresh()` (`GET /customer-display/status`); when
the cashier pairs before that answer returns, the older `paired: false` answer lands after the pair result and
overwrites it, so the counter believes it is unpaired and stops publishing. Likely also the uncaptured 29/1 e2e failure
recorded in the R2 run. TASK-701 was not merged or deployed; the fix and its regression follow and need review.

| # | Sev | Finding | Fix | Regression | Mutation |
|---|---|---|---|---|---|
| REL-1 | P2 | An older `GET /customer-display/status` answer overwrote a newer pair result (counter shows unpaired, stops publishing) | The hook numbers its status reads (`generation`); pair, unpair and an unpaired state answer bump the generation, and a status answer from an older generation is dropped (`display-dialog.tsx`). | e2e: the status read issued when the dialog opens is answered by the server before pairing but delivered 1.5 s later; after pairing the button must still read `Layar Pelanggan (terhubung)` | T701-REL-M1 (generation check removed → exactly the release-gate failure: `Layar Pelanggan (terhubung)` not found) |

Verification of REL-1 (run `RUN-20261118T134151Z-e4270286`, outputs teed, e2e via JSON): unit 195, Workers 445,
`pnpm check` and e2e (30 expected, 0 unexpected, 0 flaky) PASS. Two earlier records in this run were FAIL and both
causes were captured this time: `pnpm check` — five unrelated Workers tests (pickup, listing, labels, dispatch) hit the
15 s test timeout at 22–37 s each while another repository's test suite and Postgres loaded the host (load ≈ 6 on 8
cores; the `worker` record minutes earlier passed 445/445); e2e — at phone-390 `Resi terbit` was not visible within
5 s because issuing was still running (`Memproses…`, INV in draft, no error) under the same load. Both re-recorded
PASS once the load eased. This also explains the earlier `ELIFECYCLE`-only failures. Boundary: **FAIL** — `TASKS.md`
(reverting the TASK-701 `DONE` marker to "awaiting R6") was edited without being in the run's declared surface — plus
REVIEW_REQUIRED (R4). The run closed BLOCKED pending Sol R6; the release run after R6 declares `TASKS.md`.

## Sol R6 (`R6-sol.md`, REQUEST_CHANGES, test-only) — REL-1 production fix confirmed sound

| # | Sev | Finding | Fix | Verification |
|---|---|---|---|---|
| R6-F1 | P2 | The REL-1 regression used sleeps (1.5 s delayed delivery, 2 s wait); if pairing took longer than the delay the old answer arrived first and the test passed without exercising the race | `e2e/customer-display.spec.ts` uses explicit barriers, no sleeps: only the first status request is intercepted; `route.fetch()` is awaited and its JSON asserted `paired: false`; `captured` opens before `Pasangkan Layar` is clicked; delivery is held until the pair URL and `Layar Pelanggan (terhubung)` are visible; then `release` opens, the test awaits `fulfilled` plus two animation frames and a task in the page, and asserts the button still reads `(terhubung)` and no plain `Layar Pelanggan` button exists | Spec 3/3 (390/768/1280). Mutation T701-REL-M1 (generation check removed) now fails at all three viewports, each at the post-release assertion (line 73, after `release.open()` on line 69) |

R6-F1 run `RUN-20261118T141234Z-68d34359` (test-only change): e2e (30 expected, 0 unexpected, 0 flaky, JSON) and
`pnpm check` (unit 195, Workers 445) PASS on the first attempt; boundary REVIEW_REQUIRED (R4) with nothing out of
scope. The run closes BLOCKED pending Sol R7.

