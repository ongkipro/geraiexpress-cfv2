# DEC-247B — brand site mutations (inner pages, simulator listboxes, footer)

Each mutation was applied to the named file and the named suite was run. The original was then restored and
checked by SHA-256 (script: integrator scratchpad `mut247b.py`). The e2e runs use `--project=desktop-1280` on a
local `wrangler dev`.

| Id | File | Mutation | Suite | Result |
|---|---|---|---|---|
| T247B-M1 | `apps/worker/src/brand/pages.ts` | native `<select>` back for *Cara bayar di loket* | `vitest run test/brand` | exit 1 — "DEC-247B /simulasi-kasir: zero native <select>, four custom listboxes…" |
| T247B-M2 | `apps/worker/src/brand/pages.ts` | opening one listbox no longer closes the others | e2e `-g "dropdown custom"` | exit 1 — "Brand DEC-247B: dropdown custom simulasi kasir…" |
| T247B-M3 | `apps/worker/src/brand/index.ts` | `SEL_SCRIPT` not shipped on `/simulasi-kasir` | e2e `-g "dropdown custom"` | exit 1 — same test |
| T247B-M4 | `apps/worker/src/brand/pages.ts` | pipeline ignores `prefers-reduced-motion` | e2e `-g "halaman dalam"` | exit 1 — "Brand DEC-247B: halaman dalam…" |
| T247B-M5 | `apps/worker/src/brand/pages.ts` | inner-page head loses the eyebrow pill | `vitest run test/brand` | exit 1 — "DEC-247B inner pages: centered PageHead…" |
| T247B-M6 | `apps/worker/src/brand/styles.ts` | footer links back to `min-height:44px` | `vitest run test/brand` | exit 1 — "DEC-247B footer: compact link rhythm…" |
| T247B-M7 | `apps/worker/src/brand/pages.ts` | `/tanya-jawab` group ids drift from the pill index | `vitest run test/brand` | exit 1 — "/tanya-jawab: open hairline <details> rows…" |

The first run of M2 survived: a mouse click on a second dropdown already closes the first one through the outside-tap
handler. A step was added to the e2e: focus moves to a second dropdown without a pointer or Tab, as assistive tech
can do, and opening it must close the first. M2 then went red.
