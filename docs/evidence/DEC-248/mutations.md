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
