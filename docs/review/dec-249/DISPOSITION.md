# DEC-249 — disposition of GPT-6.2 Sol R1 (`R1-sol.md`)

Sol approved the hero lock, `/loket-mitra-3d.webp`, the geometric SVGs and the Vitest/Playwright flags. The five
findings were fixed in run `RUN-20261118T221923Z-14db5701` with focused checks (fast protocol): `pnpm check:fast`,
`vitest --project unit scripts/dev/clean-e2e-state.test.mjs` 6/6, `vitest run test/brand` 22/22, `check-page.mjs`
10/10 0 fail 0 warn, e2e `brand.spec.ts --project desktop-1280` 14/0/0.

| # | Finding | Fix | Regression | Mutation (red) |
|---|---|---|---|---|
| R1-1 | The pruner could delete files/symlinks named `state-e2e-*`, and compared `keep` as raw strings | `lstatSync`: only a real directory (`isDirectory() && !isSymbolicLink()`) is a candidate. `keep` (string or list) and the active paths are compared with `path.resolve` on both sides. | `scripts/dev/clean-e2e-state.test.mjs`: an old regular file and an old symlink (`lutimesSync`) to an old folder survive; a relative and an absolute `keep` survive; `.wrangler/state-dev` survives | D249R1-M1 (type guard removed), D249R1-M2 (`keep` not resolved) |
| R1-2 | The age came from the folder's own mtime, and a live server's folder could be removed | `newestMtime(dir)` walks the whole tree without following symlinks, so a fresh SQLite file under `v3/d1` keeps the folder. `activePersistPaths()` reads `/proc/*/cmdline` for `--persist-to <dir>` and `--persist-to=<dir>`, resolved against `/proc/<pid>/cwd`, and returns `[]` where `/proc` is missing. Those folders are never removed, by the automatic or the manual prune. `playwright.config.ts` skips the automatic prune under `GX_REUSE_SERVER`. | Tests: a fresh WAL deep inside keeps an old folder; a folder in `activePaths` survives; both `--persist-to` forms parsed from a `/proc`-like tree, resolved against the process cwd; a missing `/proc` gives `[]` | D249R1-M3 (folder mtime only), D249R1-M4 (active paths ignored) |
| R1-3 | No way to stop the marquee without hovering or focusing it (WCAG 2.2.2) | A 44px `<button class="mq-pause" aria-pressed>` (`Jeda animasi daftar ekspedisi`) sets `data-paused` on `.marquee`, so the track stays paused until the button is pressed again, wherever focus goes. The button is hidden under reduced motion, where the marquee is already static. | e2e: Enter pauses, Tab moves focus away and it stays `paused`, Space resumes (`running`); worker CSS/markup assertions | D249R1-M5 (`data-paused` not honoured) |
| R1-4 | An empty tail on wide screens | `.marquee{max-width:1476px;margin:0 auto}`, one track's width (9 × 152 px tiles + gaps) | e2e at 1920×900: marquee width ≤ one track | D249R1-M6 (width uncapped) |
| R1-5 | Finance wording promised more than the system knows | `/fitur`: "Anda melihat perhitungan Saldo Aman dari sinkronisasi terakhir setelah cadangan ongkir retur, serta paket yang menunggu dijemput kurir."; "Selisih antara laci kasir dan mutasi ekspedisi langsung terlihat per resi" | `brand.test.ts`: new sentences present, old ones absent | — (copy) |

Home height after the pause button: 6,279 px at 1440 (≤ 6,300). Note: the first run of D249R1-M1 survived because the
test's symlink was new and failed the age check anyway. The test now ages the link and its target, so only the type
guard keeps them, and M1 goes red.

# Round 2 — GPT-6.2 Sol R2 (`R2-sol.md`)

Everything else was verified resolved. The three edge cases were fixed in run `RUN-20261118T223606Z-06d5e437` with
focused checks: `pnpm check:fast`, unit `clean-e2e-state.test.mjs` 7/7, `vitest run test/brand` 22/22,
`check-page.mjs` 10/10, e2e `brand.spec.ts --project desktop-1280` 14/0/0.

| # | Finding | Fix | Regression | Mutation (red) |
|---|---|---|---|---|
| R2-1 | A live process persisting through a symlink alias did not protect the real folder | Every protected path is stored as written (`path.resolve`, which also covers one not created yet) and with symlinks resolved (`realpathSync`). A candidate is protected when either of its own spellings matches. | Unit: `active-run -> state-e2e-x` in `activePaths` keeps `state-e2e-x`; a not-yet-created path is accepted | D249R2-M1 (`realpath` dropped) |
| R2-2 | Without JavaScript the marquee moved but had no pause control | Progressive enhancement: the default CSS is a static wrap of the nine logos (duplicate track and pause button hidden, no animation). The inline script attaches the pause handler and only then sets `data-ready`, and it does nothing under reduced motion. Animation, edge fade, the duplicate track and the button all hang off `.marquee[data-ready]`. | e2e with `javaScriptEnabled: false`: animation `none`, `.mq-ctl` hidden, duplicate track hidden, nine logos visible; worker CSS/script assertions | D249R2-M2 (animated without JS → e2e red), D249R2-M3 (`data-ready` under reduced motion → worker red) |
| R2-3 | The `/fitur` proof title still overstated | "Setelah sinkronisasi, tinjau selisih kas loket dan mutasi Mengantar, termasuk per resi jika sudah tercocokkan" | `brand.test.ts` exact title | — (copy) |

# Round 3 — GPT-6.2 Sol R3 (`R3-sol.md`)

R2-1, R2-2 and R2-3 were verified resolved. The one remaining CSS item was fixed in run
`RUN-20261118T224644Z-e20fc6b9` with focused checks: `pnpm check:fast`, `vitest run test/brand` 22/22, e2e
`brand.spec.ts --project phone-390 --project desktop-1280` 26/0/0.

| # | Finding | Fix | Regression | Mutation (red) |
|---|---|---|---|---|
| R3-1 | Reduced motion switched on after load (`data-ready` already set) kept the moving, masked marquee | Every `.marquee[data-ready]` rule, including `.marquee[data-ready]+.mq-ctl{display:flex}`, now sits inside `@media(prefers-reduced-motion:no-preference)`. Turning reduced motion on falls back to the static wrap at once. | e2e at 390 and 1280: page loaded (`data-ready`), then `emulateMedia({ reducedMotion: "reduce" })` gives animation `none`, `.mq-ctl` and the duplicate track hidden, and nine logos wholly inside the viewport; restored to `no-preference`. Worker: no `[data-ready]` rule outside the query. | D249R3-M1 (query unwrapped → phone e2e red) |

# Round 4 — GPT-6.2 Sol R4 (`R4-sol.md`)

The CSS fix was confirmed sound. One test detail was fixed in run `RUN-20261118T225529Z-db3fe622`: the DEC-249 e2e
saves `page.viewportSize()` at the start and restores it after the 1440 and 1920 checks, so on `desktop-1280` the
`emulateMedia({ reducedMotion: "reduce" })` block really runs at 1280×800, where the track (1,476 px) overflows.
Focused check: `eslint e2e/brand.spec.ts` and `playwright test e2e/brand.spec.ts -g DEC-249 --project phone-390
--project desktop-1280` 2/2. The R3 mutation (no-preference query unwrapped) re-run on `desktop-1280` now goes red too
(`toBeHidden` after reduced motion).
