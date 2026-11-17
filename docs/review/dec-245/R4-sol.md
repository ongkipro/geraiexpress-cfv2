## Verdict

**APPROVE** — merge verdict: **OK**

All findings **#1–#12 are fixed on disk**, with no open P0–P2 findings.

Reviewed `/data/tmp/dec245/delta-r4.diff`, the three previous reviews, current source and shipped minified hero bundle, relevant routing/tests, and `docs/evidence/DEC-245/`. This verdict covers the supplied delta against `9c740b1` and its relevant source seams, not an independently obtained committed range. No repository files were written, no servers were started, and tests were not independently rerun.

## Review

### Status of findings #1–#12

| # | Status | On-disk verification |
|---|---|---|
| 1 | **Fixed — retained** | Playback-only `dt` advances `sceneClock`; paused drawing stops after settling (`apps/worker/src/brand/hero/hero-studio-3d.src.js:1577–1588`). Reduced motion initializes playback off (`:1854–1862`). Freeze/resume and reduced-motion tests remain in `e2e/brand.spec.ts:24–72`. |
| 2 | **Fixed — retained** | Preview cargo data uses supported services (`apps/worker/src/brand/pages.ts:47–51`); home copy distinguishes Non-COD cargo (`:198–200`); the courier table retains the corrected inventory and restrictions (`:257–267`). Hero service categories remain REGULER, EKONOMI, COD and KARGO (`apps/worker/src/brand/hero/hero-studio-3d.src.js:289–294,935–940`). |
| 3 | **Fixed — retained** | Volumetric copy specifies 4,000 for JNE Reguler and iDexpress Cargo, 6,000 otherwise (`apps/worker/src/brand/pages.ts:284`). The focused regression assertion remains (`apps/worker/test/brand/brand.test.ts:114–120`). |
| 4 | **Fixed — retained** | The hero pill uses account-specific discount wording (`apps/worker/src/brand/pages.ts:109`). The financial explanation attributes assignment to GeraiExpress and application to Mengantar while preserving the customer’s publish tariff (`:367`). Canvas text retains “MITRA” and the nine-courier count instead of a fixed percentage (`apps/worker/src/brand/hero/hero-studio-3d.src.js:271–274,381–387`). |
| 5 | **Fixed — retained** | The hero describes team review rather than automatic identity verification (`apps/worker/src/brand/hero/hero-studio-3d.src.js:44–50`); the tablet says “DISETUJUI” (`:360–363`), and the step remains “02 Tinjau” (`apps/worker/src/brand/pages.ts:119`). |
| 6 | **Fixed — retained** | API/MCP access remains in Standard, with Pro explicitly inheriting Standard’s facilities (`apps/worker/src/brand/pages.ts:334–355`). |
| 7 | **Fixed — retained** | The contact page retains neutral communication-channel wording, without the unapproved support schedule (`apps/worker/src/brand/pages.ts:567`). |
| 8 | **Fixed — retained** | Pause remains 44×44 px, and step buttons retain a 44 px minimum height (`apps/worker/src/brand/styles.ts:76,79`). Pause dimensions remain asserted (`e2e/brand.spec.ts:33–35`). |
| 9 | **Fixed — retained** | Native inputs/selects and the custom Select retain the stronger `#7B879C` default border on white (`apps/worker/src/brand/styles.ts:123,166`), with a darker hover border (`:167`). |
| 10 | **Fixed — retained** | Asset coverage retains GET/HEAD, MIME/cache/security headers, no cookies, denied paths, normalization variants and unsupported methods (`apps/worker/test/brand/brand.test.ts:71–104`). Home-only deferred scripts and demo request-code guards remain (`:106–111`), alongside browser motion/logo/API-request coverage (`e2e/brand.spec.ts:24–72`). |
| 11 | **Fixed — retained** | Paused resize still schedules `settle(800, 40)` after resizing the drawing buffer and immediately repaints when visible (`apps/worker/src/brand/hero/hero-studio-3d.src.js:1484–1500`). The browser regression waits for stopped drawing, resizes, checks the frozen clock and requires more than 5,000 scene pixels for ordinary pause and reduced motion (`e2e/brand.spec.ts:95–115`). |
| 12 | **Fixed** | The immediate resize repaint is now guarded by `stageVisible` (`apps/worker/src/brand/hero/hero-studio-3d.src.js:1497–1499`). Both render paths use `renderFrame()`, which counts actual renders and updates the observable clock (`:1826–1837`). IntersectionObserver resets timing and schedules paused settling on return (`:1882–1891`). The regression checks unchanged frame count during off-screen resize, increased frames after return, a frozen clock and visible scene pixels in both motion modes (`e2e/brand.spec.ts:116–127`). The shipped bundle contains the same logic (`apps/web-app/public/hero-studio-3d.min.js:1`). |

### New findings

No issues found.

| # | Severity | Location | Finding | Smallest fix |
|---|---|---|---|---|
| — | — | — | None | — |

## Correct

- **The #12 correction closes both sides of the resize lifecycle.** Off-screen resize may clear the buffer and update projection, but it cannot submit the direct paused render. When visibility returns, the observer schedules enough paused frames to restore the scene and settle its responsive camera (`apps/worker/src/brand/hero/hero-studio-3d.src.js:1484–1500,1882–1891`).

- **Render accounting now covers the formerly unobserved path.** There is one `renderer.render(scene, camera)` call, inside `renderFrame()`. Both `animate()` and visible paused resize call that helper, so `data-frames` also detects accidental direct off-screen repainting (`:1499,1826–1837`).

- **Motion and visibility controls remain compatible.** The animation loop checks visibility before updating or rendering (`:1570–1572`). Paused frames use zero simulation `dt`, while a separate easing timestep permits bounded camera transitions (`:1577–1588`). Paused step selection still schedules settling (`:1535–1542`), and dragging still bypasses the stopped-drawing condition without advancing the scene clock (`:1577–1584`).

- **Resume does not absorb off-screen wall time.** Visible paused callbacks update `lastTick` before their early return, and becoming visible resets it again (`:1574–1580,1885–1888`).

- **The regression checks actual output as well as instrumentation.** The screenshot helper hides DOM overlays and counts dark canvas pixels; the test additionally verifies frame suppression off-screen and clock stability after return (`e2e/brand.spec.ts:77–92,116–127`). The documented M-e mutation targets the newly added visibility gate specifically (`docs/evidence/DEC-245/README.md:36–40`).

- **The broader delta remains focused.** The asset allow-list and method boundary remain constrained (`apps/worker/src/brand/index.ts:21–55`). Copy, accessibility styling, source lint configuration and documentation changes retain the earlier fixes without expanding application or tenant behavior.

- **Supplied static evidence is consistent with the implementation.** `docs/evidence/DEC-245/seo-check.txt:1–10` records zero failures and warnings for all ten pages. `ui-gates.json` records zero horizontal overflow, no broken courier images and no recorded errors at 1440×900 and 390×844. The inspected desktop and phone hero screenshots show the corrected copy and controls.

**Verification limitation:** the reported browser **10 passed / 2 skipped** and mutation results were not independently reproduced. Approval is the code-review verdict, not certification of the integrated gate; the required focused tests, `pnpm check`, and DEC-245 integrated gate remain subject to the repository’s recorded pre-merge workflow.