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

## Sol R1 fixes (run `RUN-20261118T221923Z-14db5701`)

| Id | File | Mutation | Suite | Result |
|---|---|---|---|---|
| D249R1-M1 | `scripts/dev/clean-e2e-state.mjs` | files and symlinks are pruned too | unit `clean-e2e-state.test.mjs` | exit 1 — "never removes a regular file or a symlink…" |
| D249R1-M2 | `scripts/dev/clean-e2e-state.mjs` | `keep` compared without resolving | unit | exit 1 — "keeps the current run's folder whether `keep` is relative or absolute" |
| D249R1-M3 | `scripts/dev/clean-e2e-state.mjs` | age from the folder itself only | unit | exit 1 — "an old folder with a fresh file deep inside…" |
| D249R1-M4 | `scripts/dev/clean-e2e-state.mjs` | live `--persist-to` folders not protected | unit | exit 1 — "a folder a live process persists to is never removed" |
| D249R1-M5 | `apps/worker/src/brand/styles.ts` | pause state not honoured by CSS | `vitest run test/brand` | exit 1 — "DEC-249 home …" |
| D249R1-M6 | `apps/worker/src/brand/styles.ts` | marquee width uncapped | `vitest run test/brand` | exit 1 — "DEC-249 home …" |

## Sol R2 fixes (run `RUN-20261118T223606Z-06d5e437`)

| Id | File | Mutation | Suite | Result |
|---|---|---|---|---|
| D249R2-M1 | `scripts/dev/clean-e2e-state.mjs` | symlink aliases not resolved | unit | exit 1 — "a live process persisting through a symlink alias…" |
| D249R2-M2 | `apps/worker/src/brand/styles.ts` | marquee animated without JavaScript | e2e `-g DEC-249` desktop | exit 1 — "Brand DEC-249: beranda ramping…" |
| D249R2-M3 | `apps/worker/src/brand/pages.ts` | `data-ready` set even under reduced motion | `vitest run test/brand` | exit 1 — "DEC-249 home …" |

## Sol R3 fix (run `RUN-20261118T224644Z-e20fc6b9`)

| Id | File | Mutation | Suite | Result |
|---|---|---|---|---|
| D249R3-M1 | `apps/worker/src/brand/styles.ts` | `data-ready` rules outside the `no-preference` query | e2e `-g DEC-249 --project phone-390` | exit 1 — `toBeHidden` failed after reduced motion switched on |
| D249R3-M1 (Sol R4 re-run) | `apps/worker/src/brand/styles.ts` | same mutation, `--project desktop-1280` (viewport restored to 1280×800) | e2e `-g DEC-249` | exit 1 — `toBeHidden` failed |
