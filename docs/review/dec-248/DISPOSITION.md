# DEC-248 — disposition of GPT-6.2 Sol R1 (`R1-sol.md`, REQUEST_CHANGES on `e09f998`)

All four findings were fixed in the review-fix run `RUN-20261118T201033Z-f0ad5e98`. Each has an e2e regression in
`e2e/auth-stage.spec.ts` and a red mutation (`docs/evidence/DEC-248/mutations.md`, R1 section).

| # | Sev | Finding | Fix | Regression | Mutation (red) |
|---|---|---|---|---|---|
| 1 | P1 | The consent no longer named the Mengantar email it covers | The consent sentence names the exact `sellerEmail` ("… dengan email **seller@…**, dan …"; the rest of the legal wording is unchanged). Editing that email in Tahap 2 clears the consent. | Back to Tahap 2, new email, forward: the new email is shown, the checkbox is unchecked and `Ajukan Gerai` is disabled | D248R1-M1 (consent kept) and D248R1-M2 (email hidden again) |
| 2 | P1 | The area picker was not a keyboard combobox | Input `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`. Results are a `role="listbox"` of `role="option"` items (no nested buttons; mouse-down keeps focus). `ArrowDown`/`ArrowUp` wrap, `Enter` picks the highlighted option without submitting, `Escape` closes, and the list closes when focus leaves the picker container. | Keyboard-only: type, `Escape` closes (focus stays), `ArrowDown` opens with `area-opt-0` active, `Enter` picks; typing then `Tab` closes the overlay | D248R1-M3 (arrows ignored), D248R1-M4 (overlay stays open on blur) |
| 3 | P2 | HP PIC kept a stale WhatsApp number | A `picPhoneEdited` flag: HP PIC follows WhatsApp gerai every time Tahap 3 opens until the applicant edits HP PIC; after that it keeps their number | Corrected WhatsApp is copied while HP PIC is untouched; an edited HP PIC survives another WhatsApp change | D248R1-M5 (copy only when empty) |
| 4 | P2 | The Turnstile widget shifted the form when it loaded | `turnstile.render(…, { size: "flexible" })`. `useTurnstile()` exposes `hasWidget` (a real site key is configured). `/masuk` and `/daftar-akun` reserve a `min-h-[65px]` slot only then, and none locally with the test keys. | Stubbed config + widget (rendered after 300 ms, no third-party call): the 65px slot exists before the widget, the submit button does not move when it arrives, `data-size="flexible"`, and both pages still have no page or inner scroll at 1440×900, 1366×768 and 390×844 | D248R1-M6 (slot not reserved), D248R1-M7 (default size) |

Notes:
- The first D248R1-M6 run survived because the stub filled the slot immediately, so a slot that grew when filled
  looked the same as a reserved one. The stub now renders after 300 ms, and the test asserts the empty slot's height
  and that the submit button does not move. M6 then went red.
- On a phone the consent's long synthetic email broke mid-word with `break-all`. It now wraps only where needed
  (`overflow-wrap:anywhere`).

## Supervisor pre-review (before Sol R2), run `RUN-20261118T204207Z-e384cd2b`

These three details were applied with focused checks only, as the fast protocol allows (`pnpm typecheck` +
`auth-stage.spec.ts --project desktop-1280`, 2/2). The single full ledger gate runs once, before release.

| # | Detail | Change | Regression | Mutation |
|---|---|---|---|---|
| S1 | Old area results could reopen on an arrow key, or leave `hl` past a shrunk result set | Typing below 3 characters clears the results; every new result set resets `hl` to -1; arrow navigation computes the next index and scrolls that option into view (`block: "nearest"`) | Results exist (`coblong`), then `co` + `ArrowDown`: no list and no `aria-activedescendant` | D248P-M1 (results kept below 3 characters) → red. Its first run survived because the precondition (results present) was implicit; the test now makes it explicit. |
| S2 | Widget-enabled retry | — (behaviour already in `useTurnstile().reset`) | Stubbed widget on `/masuk`: a failed sign-in calls `turnstile.reset` once, `Masuk` is disabled until the fresh token arrives, then enabled; the page still fits | — |
| S3 | Short viewport with the coordinates open | — (the centre's `overflow-y-auto` fallback) | 1280×560, Tahap 3, `+ Titik koordinat peta` opened: Latitude, Longitude and `Ajukan Gerai` scroll into view inside the centre; the page itself does not scroll (`scrollHeight == innerHeight`), and no footer | — |
