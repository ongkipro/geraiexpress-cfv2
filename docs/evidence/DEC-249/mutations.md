# DEC-249 — mutations

Each mutation was applied, `vitest run test/brand` was run, and the file was restored and checked by SHA-256
(integrator scratchpad `mut249.py`).

| Id | File | Mutation | Result |
|---|---|---|---|
| D249-M1 | `apps/worker/src/brand/pages.ts` | one hero tab label changed (`01 Daftar` → `01 Gabung`) | exit 1 — "DEC-249 home: hero byte-identical …" (hash) |
| D249-M2 | `apps/worker/src/brand/pages.ts` | duplicate marquee track exposed to assistive tech | exit 1 — "home: 3D hero intact … nine courier tiles …" |
| D249-M3 | `apps/worker/src/brand/styles.ts` | marquee keeps scrolling under reduced motion | exit 1 — "DEC-249 home …" |
| D249-M4 | `apps/worker/src/brand/pages.ts` | Raka motion ignores `prefers-reduced-motion` | exit 1 — "DEC-249 home …" |
| D249-M5 | `apps/worker/src/brand/pages.ts` | layered showcase back on the home page | exit 1 — "home + /fitur (DEC-247A, slimmed by DEC-249) …" |

## Supervisor pre-review upgrade (3D counter render, pricing list), run `RUN-20261118T215923Z-e1ef6987`

| Id | File | Mutation | Result |
|---|---|---|---|
| D249-M6 | `apps/worker/src/brand/index.ts` | `/loket-mitra-3d.webp` dropped from `BRAND_ASSETS` | exit 1 — "DEC-249 home …" (asset 404) |
| D249-M7 | `apps/worker/src/brand/styles.ts` | pricing feature list hidden on the home page again | exit 1 — "DEC-249 home …" |
