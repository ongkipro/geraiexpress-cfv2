# DEC-247 §2.1 brand site — red mutations

Each mutation was applied to the file as an exact single-occurrence text replacement, the named test was run, and the
original text was written back (SHA-256 of the file verified identical afterwards; no `git checkout`/`restore`).
Runs: 2026-11-18, worktree `dec-247`, `GX_E2E_PORT=55187`, all under `heavy-run --lock geraiexpress-cfv2-env`.

| ID | File | Mutation | Command | Red test (observed failure) |
|---|---|---|---|---|
| M1 | `apps/worker/src/brand/seo.ts` (`SHELL_SCRIPT`) | `if(e.key==="Escape"&&isO())` → `if(e.key==="Esc-disabled"&&isO())` (Escape no longer closes the phone menu) | `pnpm exec playwright test e2e/brand.spec.ts --project=phone-390 -g "menu ponsel"` | `Brand DEC-247: menu ponsel [Masuk] [Menu] buka, Escape, klik luar, fokus` — `#mnav-btn` `aria-expanded` expected `"false"`, received `"true"` |
| M2 | `apps/worker/src/brand/pages.ts` (`BIAYA_SCRIPT`) | `r.addEventListener("change",sync);sync();` → `sync();` (readout `data-active` no longer follows the radio) | `pnpm exec playwright test e2e/brand.spec.ts --project=desktop-1280 -g "radio paket"` | `Brand DEC-247: radio paket mengganti panel rincian` — `.readout[data-plan="pro"]` missing `data-active` |
| M3 | `apps/worker/src/brand/styles.ts` | `footer.ftr{background:var(--tile);` → `footer.ftr{background:#061B52;` (dark band reintroduced) | `pnpm --filter @gx/worker exec vitest run test/brand` | `brand site DEC-247 > white gallery: no dark #061B52 band, …` — `/` contains `#061B52` (1 failed, 13 passed) |
| M4 | `apps/worker/src/brand/seo.ts` (`SHELL_SCRIPT`) | `var s=msg(el);el.setCustomValidity(s);ours.set(el,s);` → `var s=msg(el);ours.set(el,s);` (Indonesian message never set) | `pnpm exec playwright test e2e/brand.spec.ts --project=desktop-1280 -g "validasi form"` | `Brand DEC-247: validasi form berbahasa Indonesia di browser en-US` — received `"Please fill out this field."`, `"Please include an '@' …"`, `"Please match the requested format."` |
| M5 | `apps/worker/src/brand/styles.ts` | `,.pricing:has(input[value=pro]:checked) .readout[data-plan=pro]{display:grid}` → `{display:grid}` (CSS `:has()` readout switch for Pro removed) | `pnpm exec playwright test e2e/brand.spec.ts --project=desktop-1280 -g "radio paket"` | `Brand DEC-247: radio paket mengganti panel rincian` — `.readout[data-plan="pro"]` expected visible, received hidden |

All five commands exited non-zero under mutation and the suite is green again on the restored files
(`vitest run test/brand`: 14/14; `playwright test e2e/brand.spec.ts`: 23 passed, 7 project-scoped skips).

## Integrator mutations (DEC-247A release, after the supervisor's visual note and the owner's home-parity additions)

Applied in the file, the named suite run, the original text restored and verified by SHA-256.

| Id | File | Mutation | Command | Result |
|---|---|---|---|---|
| T247A-M1 | `apps/worker/src/brand/index.ts` | `PRODUCT_SHOT.src` dropped from `BRAND_ASSETS` | `playwright test e2e/brand.spec.ts -g "screenshot kasir" --project=desktop-1280` | exit 1 — the WebP request is not 200/`image/webp` |
| T247A-M2 | `apps/worker/src/brand/styles.ts` | footer background back to `#061B52` | `vitest run test/brand` | exit 1 — "white gallery: no dark #061B52 band…" |
| T247A-M3 | `apps/worker/src/brand/pages.ts` | closing steps removed from every page | `vitest run test/brand` | exit 1 — "home parity (DEC-247A): … closing steps" |
| T247A-M4 | `apps/worker/src/brand/pages.ts` | home FAQ drops to four rows | `vitest run test/brand` | exit 1 — "home parity (DEC-247A): … five FAQ …" |
