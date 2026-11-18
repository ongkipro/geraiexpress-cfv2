# DEC-248 — mutations

Each mutation was applied to the named file and the named suite run. The original was then restored and checked by
SHA-256 (integrator scratchpad `mut248.py`). The e2e runs use `--project=desktop-1280`; the spec itself sets
1440×900, 1366×768 and 390×844.

| Id | File | Mutation | Suite | Result |
|---|---|---|---|---|
| D248-M1 | `apps/web-app/src/components/auth/auth-card.tsx` | the auth stage gets a page `<footer>` back | e2e `auth-stage.spec.ts` | exit 1: "app /masuk 1440x900" (footer count) |
| D248-M2 | `apps/worker/src/brand/pages.ts` | closing three-step pills restored | `vitest run test/brand` | exit 1: "home parity (DEC-247A) … quiet closing (DEC-248)" |
| D248-M3 | `apps/web-app/src/routes/daftar/page.tsx` | PIC fields stack on phones again | e2e `auth-stage.spec.ts` | exit 1: "tahap 3 390x844" (inner scroll) |
| D248-M4 | `apps/web-app/src/components/auth/text-field.tsx` | the password toggle no longer reveals | e2e `auth-stage.spec.ts` | exit 1: `toHaveAttribute("type", "text")` |
| D248-M5 | `apps/web-app/src/routes/daftar/page.tsx` | the area results pushed into the page flow | e2e `auth-stage.spec.ts` | exit 1: "tahap 3 with area results 390x844" |

## Sol R1 fixes (run `RUN-20261118T201033Z-f0ad5e98`)

All of these run e2e `auth-stage.spec.ts` (`--project=desktop-1280`) after a rebuild.

| Id | File | Mutation | Result |
|---|---|---|---|
| D248R1-M1 | `apps/web-app/src/routes/daftar/page.tsx` | consent survives a changed seller email | exit 1: `not.toBeChecked` |
| D248R1-M2 | `apps/web-app/src/routes/daftar/page.tsx` | consent says "email di atas" again | exit 1: `[data-seller-email]` not found |
| D248R1-M3 | `apps/web-app/src/routes/daftar/page.tsx` | arrow keys ignored | exit 1: listbox not visible after `ArrowDown` |
| D248R1-M4 | `apps/web-app/src/routes/daftar/page.tsx` | overlay stays open when focus leaves the picker | exit 1: listbox not hidden after `Tab` |
| D248R1-M5 | `apps/web-app/src/routes/daftar/page.tsx` | HP PIC copied only when empty | exit 1: HP PIC keeps the old WhatsApp |
| D248R1-M6 | `apps/web-app/src/routes/masuk/page.tsx` | no reserved Turnstile slot (`empty:hidden`) | exit 1: slot not reserved before the widget |
| D248R1-M7 | `apps/web-app/src/lib/turnstile.tsx` | widget at the default size | exit 1: `data-size` not `flexible` |
