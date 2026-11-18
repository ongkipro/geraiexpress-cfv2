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
