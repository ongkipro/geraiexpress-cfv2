# DEC-251 review disposition

## GPT-6.2 Sol R1 (`R1-sol.md`, on `f31f46a`): REQUEST_CHANGES, 0 P0, 4 P1 + 5 P2. All fixed.

| # | Finding | Disposition | Proof |
|---|---|---|---|
| P1 R1-1 | A late `/quotes/freeze` answer (incl. `PRICE_CHANGED`) could restore checkout after `Ganti`; payment could run without a recipient. | **Fixed.** `Ganti` and `+ Baru` on both party cards are disabled while a press is pending. `submit()` requires a sender and a recipient, and a recipient area equal to the quoted destination, before any freeze, payment or dispatch. A `checkoutGen` counter (bumped by every stale edit and every recipient change) stops a superseded press after each awaited step (freeze, INV status, parties): no `setFrozen` and no `setSel` from an old answer. | e2e `pos-guards` `Sol R1-1`: a held freeze re-priced +Rp2.500; `Ganti` and `Penerima baru` disabled while held; an edit, then release; no `PRICE_CHANGED`, no INV badge, courier unselected; no recipient → `Pilih penerima dulu.` with 0 freezes. Mutations R1-1a (lock) and R1-1c (generation) red. |
| P1 R1-2 | Clearing the weight kept the old grams in the request. | **Fixed.** `WeightInput` reports an empty, non-numeric or zero entry as 0 g. `ready` uses `isWeightInBounds` (10–100,000 g, the Worker's bounds), so the edit stales the quote (the selection drops) and cancels the pending auto-quote. | e2e `Sol R1-2`: cleared while selected → summary empty, 0 requests; 1500 → 0 inside the debounce → 0 requests; back to the quoted 1000 g → cached and selectable without a request; 1200 g → 1 request. Mutation R1-2 red. |
| P1 R1-3 | The CSV built from an `.xlsx` was unbounded (shared-string amplification). | **Fixed.** `toCsv` counts UTF-8 bytes field by field before escaping or joining. A field longer than the remaining budget fails without being encoded, and the output can never exceed `BULK_MAX_BYTES` (`Berkas lebih dari 1 MB.`). | Unit: one 6 KB shared string × 190 rows (tiny ZIP, tiny inflate) is refused, while 150 rows still read. Mutation R1-3 red. |
| P1 R1-4 | Replacing an upload could submit the previous workbook. | **Fixed.** A new pick bumps `pickGen`, clears the old file and errors first (before the size/type checks), and only the latest pick publishes. `Periksa Baris` is disabled while reading (`Membaca berkas…`). | e2e `bulk`: a slowed `lambat.xlsx` replaced by `cepat.csv` → `cepat.csv` stays; a `.txt` replacement → error and no `csv` in the request. Mutation R1-4 red. |
| P2 R1-5 | Manual quote + debounce timer could send the same request twice; rows were actionable while refreshing. | **Fixed.** The timer re-reads the current, quoted and attempted keys when it fires. A manual submit cancels the timer. Row radios, arrow keys and `Buat Kiriman dari Tarif Ini` are inert while `loading` or `stale`. | e2e `Sol R1-5`: held `/quotes`, a manual `Cek Ongkir` in the debounce gives 1 request; during `Hitung Ulang` the row is `aria-disabled` and a forced click selects nothing; 2 requests total. Mutation R1-5 (row lock) red. The timer re-check and the cancel guard the same race, so removing only one survives (equivalent); together they are covered by the request count. |
| P2 R1-6 | ZIP checks used the buffer, not the declared Central Directory; flags/methods were checked only on open. | **Fixed.** The EOCD's `cdOffset + cdSize` must end at or before the EOCD. Every record is bounded by that span, the walk must end exactly at it, and an encrypted or non-stored/non-deflate entry is refused at scan time. | Unit: CD size beyond the EOCD; a self-consistent CD overlapping the EOCD; an encrypted or method-12 unused entry. Mutations R1-6 (span, scan) red. |
| P2 R1-7 | An empty Cargo tab kept a hidden Reguler service and allowed COD. | **Fixed.** Entering an empty tab clears the service. The Cargo tab itself forces Non-COD (`Kargo hanya Non-COD.`), and `Periksa Baris` requires the chosen service to belong to the open tab. | e2e `bulk`: cargo services filtered out → 0 cards, `Tanpa COD` pressed, COD disabled, `Periksa Baris` disabled. The two guards overlap (either alone survives); the double mutation is red. |
| P2 R1-8 | List rows and counts, and CSV pages, could use different cut-offs. | **Fixed.** `listShipments`, `tabCounts` and `exportCsv` take `now`. The list RPC passes one timestamp to rows and counts, and the export one for every page. | Worker `listing`: at T an INV exactly 3 days old is listed, counted and exported; at T−1 ms it is absent from all three. Mutation R1-8 red. |
| P2 R1-9 | A late `Muat Lebih Banyak` page could append unfiltered rows. | **Fixed.** `loadMore` captures the list generation and drops a page that answers after the filters changed. | e2e `kiriman`: a held next page released after `Macet ≥ 3 hari` → no row appended, still `Tidak ada yang cocok`. Mutation R1-9 red. |

Focused checks (fast protocol):
- `check:fast`.
- Vitest unit, with `xlsx-reader` at 18 tests.
- Worker `listing` + `minisite`.
- e2e `quote`, `checkout`, `bulk`, `kiriman`, `pos-guards` on desktop-1280.

Mutations restore with SHA-256 verification.

## GPT-6.2 Sol R2 (`R2-sol.md`, on `ce4c05f`): R1-2/3/5/6/8/9 resolved; 3 P1 + 1 P2 follow-ups. All fixed.

| # | Finding | Disposition | Proof |
|---|---|---|---|
| P1 R2-1 | The area check skipped recipients without a district, and the server accepted parties whose district changed after the freeze. | **Fixed.** The client is strict: no Mengantar district → `Lengkapi kecamatan penerima di Kontak dulu.`, a different one → refused, both before freeze. Server `setParties()` compares the recipient's area with `latestQuote().destination_area_id` and returns 422 at `/parties`, so `/payment` is never reached. | Worker `dispatch` `Sol R2-1` (recipient moved to ORIGIN after freeze → 422, `unpaid`, no recipient stored); e2e `pos-guards` `Sol R2-1` (held freeze, recipient moved via API, release → the refusal on screen, 0 `/payment`, INV `unpaid` + `draft`). Mutations red on both. The client `!toArea` check is a second layer over the same server refusal (`null` ≠ destination), so it has no separate mutation. |
| P1 R2-2 | `+ Baru` closed the sheet before the saved contact loaded; a late pick could change a party mid-checkout. | **Fixed.** The sheet (modal) stays open until `GET /contacts/…/:id` returns, then picks the contact only if no press is pending (`lockedRef`). Recent-contact pickers are inside `fieldset disabled` while pending. `pickSender` bumps `checkoutGen` like `pickRecipient`. | e2e `Sol R2-2`: held contact GET → sheet still open after `Simpan`; release → sheet closes, `Pak Budi Santoso` chosen. Mutation R2-2 red. |
| P1 R2-3 | Rejecting a file while another was being read left `Membaca berkas…` on. | **Fixed.** Every pick sets `reading` false first, before the size/type checks. | e2e `bulk`: `lambat.xlsx` (slowed) then `catatan.txt` → error, no `Membaca berkas…`, `Periksa Baris` enabled, and the slow read publishes nothing. Mutation R2-3 red. |
| P2 R2-4 | Services loading after the Cargo tab was opened defaulted to a hidden Reguler service. | **Fixed.** `tabRef` is read when `/bulk/services` resolves: the default is the first service of the open tab (none if it is empty). | e2e `bulk`: held `/bulk/services`, Cargo opened, release → the checked card is a Cargo one and `Tanpa COD` is pressed. Mutation R2-4 red. |

Focused checks per Sol R2:
- `check:fast`.
- Worker `dispatch` + `listing`.
- e2e `pos-guards`, `checkout`, `quote`, `bulk` on desktop-1280 (15 passed).

Test hardening in this round (host load 10 from other projects' I/O):
- The R1-1 regression now waits for the held freeze answer before navigating.
- The R1-2 and R1-5 regressions run the 500 ms debounce on Playwright's fake clock (`page.clock`), and R1-2 asserts the
  weights actually sent.
- `quote.spec` allows 20 s for a re-quote to settle.
- The recorded focused run uses `--timeout=120000` and passed 15/15.


## GPT-6.2 Sol R3 (`R3-sol.md`, on `8225354`): R2-1, R2-3, R2-4 resolved; R2-2 root cause + WA verification follow-up. Fixed.

| # | Finding | Disposition | Proof |
|---|---|---|---|
| P1 R3-1 | `PartyStep.saved()` made a second `GET /contacts/…/:id`. The sheet could close while that GET was still running, and `Simpan` could be pressed twice while the GET was held. | **Fixed at the root.** `POST /contacts/senders` and `/recipients` already return the full contact (same `readSender` / `readRecipient` shape as GET). `SenderForm` / `RecipientForm` pass that `Sender` / `Recipient` to `onSaved`, and each guards a single save (`pending` + a `saving` ref, so even a programmatic submit before the disabled state renders sends nothing). `PartyStep.saved()` is synchronous: it closes the sheet and picks the contact unless a press is pending. | e2e `Sol R3: a new sender`: POST held → `Menyimpan…` disabled; a forced click, Enter and `form.requestSubmit()` add 0 POSTs; release → the sheet closes, `Pak Budi Santoso` is picked, 0 GET `/contacts/senders/:id`. Mutations R3-get (GET back) and R3-single-save (guard removed) red. |
| P2 R3-2 | `VerifySender` went through `pickSender`, so verifying the same sender superseded a pending checkout. | **Fixed.** WA verification uses its own `onUpdate`. It replaces the sender only when `cur?.id === v.id` (a late answer for a sender already changed is ignored) and does not bump `checkoutGen`. | e2e `Sol R3: WA verification`: a held freeze, then the sender verified meanwhile, release → `Resi terbit` + AWB. Mutation R3-verify red. |

Focused checks:
- `check:fast`.
- e2e `pos-guards` + `contacts` on desktop-1280 (`--timeout=120000`).

Supervisor pre-review before Sol R4:
- **Gap:** a save still in flight from a sheet the operator closed (Escape / X) could close a reopened sheet and pick
  the old contact.
- **Fix:** `PartyStep` keeps a sheet generation. Every open or close bumps it, the form is keyed by it, and `onSaved`
  only acts for the generation it was rendered with.
- **Proof:** the e2e `Sol R3: a new sender` holds POST #1, closes the sheet with Escape, reopens `+ Baru`, then
  releases. The new sheet stays open with an empty form and `Bu Ratna Dewi` is not picked.
- **Checks:** `check:fast` + `-g "Sol R3"` (2 passed), as instructed; no mutation run this round.

## GPT-6.2 Sol R4 (`R4-sol.md`, on `84c6099`): APPROVE

Zero open findings. Release: one release ledger run (`pnpm check`, e2e `quote`, `checkout`, `pos-guards`,
`customer-display`, `courier-logos`, `bulk`, `kiriman`, `minisite` with a 120 s per-test timeout, boundary reviewed),
then `main` fast-forward and the staging + production deploy recorded in `BUILD-LOG.md` and `STATUS.md`.

