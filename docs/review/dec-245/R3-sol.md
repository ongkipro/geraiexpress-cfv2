## Verdict

**REQUEST_CHANGES** — merge verdict: **BLOCK**

Finding **#11 is fixed**, and the ten earlier fixes remain present. However, the new synchronous resize repaint bypasses off-screen visibility gating, introducing **P2 #12**.

Reviewed `/data/tmp/dec245/delta-r3.diff`, the current source and shipped minified bundle, both previous reviews, the focused tests, and supplied round-3 SEO/UI evidence. No repository files were written, no servers were started, and automated tests were not independently rerun.

### Status of findings #1–#11

| # | Status | On-disk verification |
|---|---|---|
| 1 | **Fixed — retained** | Playback-only `dt` still controls `sceneClock` and timeline advancement; paused drawing terminates after settling (`apps/worker/src/brand/hero/hero-studio-3d.src.js:1579–1589`). Reduced motion initializes playback off (`:1848–1858`). Freeze/resume and reduced-motion assertions remain in `e2e/brand.spec.ts:24–72`. |
| 2 | **Fixed — retained** | Preview cargo data uses supported services (`apps/worker/src/brand/pages.ts:47–51`), home copy identifies cargo as Non-COD (`:198–200`), and the courier table lists the corrected service inventory and restrictions (`:257–267`). The shipped hero retains REGULER, EKONOMI, COD and KARGO categories (`apps/web-app/public/hero-studio-3d.min.js:1`). |
| 3 | **Fixed — retained** | Volumetric copy still specifies 4,000 for JNE Reguler and iDexpress Cargo, 6,000 otherwise (`apps/worker/src/brand/pages.ts:284`). The focused assertion remains in `apps/worker/test/brand/brand.test.ts:114–120`. |
| 4 | **Fixed — retained** | The hero pill uses account-specific discount wording (`apps/worker/src/brand/pages.ts:109`); the financial explanation attributes assignment to GeraiExpress, application to Mengantar, and preserves the customer’s publish tariff (`:367`). The shipped hero contains the corrected merchant-specific wording rather than a fixed percentage (`apps/web-app/public/hero-studio-3d.min.js:1`). |
| 5 | **Fixed — retained** | The hero stage describes team review, not automatic identity verification (`apps/worker/src/brand/hero/hero-studio-3d.src.js:44–50`); the step remains “02 Tinjau” (`apps/worker/src/brand/pages.ts:119`). The shipped canvas tablet says “DISETUJUI” (`apps/web-app/public/hero-studio-3d.min.js:1`). |
| 6 | **Fixed — retained** | API/MCP access remains in Standard, with Pro inheriting Standard’s facilities (`apps/worker/src/brand/pages.ts:334–355`). |
| 7 | **Fixed — retained** | The contact page retains neutral channel wording rather than an unapproved support schedule (`apps/worker/src/brand/pages.ts:567`). |
| 8 | **Fixed — retained** | Pause remains 44×44 px and step buttons retain a 44 px minimum height (`apps/worker/src/brand/styles.ts:76,79`). Pause dimensions are asserted in `e2e/brand.spec.ts:33–35`. |
| 9 | **Fixed — retained** | Native inputs/selects and the custom Select retain the stronger `#7B879C` border on white (`apps/worker/src/brand/styles.ts:123,166`). |
| 10 | **Fixed — retained** | Asset tests retain GET/HEAD, MIME, cache, `nosniff`, cookie, denied-path, encoding, trailing-slash and method coverage (`apps/worker/test/brand/brand.test.ts:71–104`). Home-only deferred scripts and no-network demo guards remain (`:106–111`); browser coverage remains in `e2e/brand.spec.ts:24–72`. |
| 11 | **Fixed** | After resizing the drawing buffer, paused `handleResize()` now renders immediately and schedules responsive-camera settling without advancing the scene clock (`apps/worker/src/brand/hero/hero-studio-3d.src.js:1484–1501`). The deadline-plus-minimum-frame mechanism is present (`:102–108,1579–1585`). The new browser test covers ordinary pause and reduced motion, waits for drawing to stop before resizing, and checks the frozen clock plus more than 5,000 dark scene pixels (`e2e/brand.spec.ts:77–115`). The shipped bundle contains the same resize repaint and settle logic (`apps/web-app/public/hero-studio-3d.min.js:1`). |

### New findings

| # | Sev | File:line | Finding | Fix |
|---|---|---|---|---|
| 12 | **P2** | `apps/worker/src/brand/hero/hero-studio-3d.src.js:1497–1500` | **The new resize repaint renders the paused hero even when it is off-screen.** The normal animation path returns when `stageVisible` is false (`:1573`), as set by IntersectionObserver (`:1877–1884`). The new direct `renderer.render(scene, camera)` checks only playback and scene existence, bypassing that visibility gate. Window and visual-viewport resize listeners remain active off-screen (`:1481,1874–1875`). **Source-derived repro:** pause the hero—or load with reduced motion—scroll entirely past it so the observer marks it invisible, then resize the viewport. `handleResize()` submits a full scene render despite the invisible state. This regresses the requested off-screen rendering suppression; the same bypass is present in the shipped bundle (`apps/web-app/public/hero-studio-3d.min.js:1`). | Keep scheduling the settle, but perform the immediate repaint only when `stageVisible` is true. Pending settle frames can redraw with the new framing when the observer marks the stage visible again. Add a regression for paused/reduced-motion → off-screen → resize → return, asserting no off-screen render, a frozen clock, and a visible scene on return. Rebuild the bundle. If using `data-frames` for that assertion, ensure it reflects direct renders too: currently its DOM update occurs only in `animate()` (`:1827–1832`). |

## Correct

- **The blank-canvas correction addresses the root cause.** The new render follows `setPixelRatio()` and `setSize()`, so visible paused users no longer depend on a previously exhausted animation budget to restore the cleared drawing buffer (`apps/worker/src/brand/hero/hero-studio-3d.src.js:1493–1500`).

- **Paused step selection still has a bounded camera transition.** `selectAct()` updates the timeline and schedules `settle(1500, 60)` (`:1536–1543`). The loop uses a nonzero easing timestep while keeping simulation `dt` at zero, then stops once both settling conditions are spent (`:1579–1585`). Camera interpolation remains downstream of those controls (`:1629–1638`).

- **Dragging still renders while paused.** Pointer-down sets `isDragging` (`:1433–1439`), pointer movement updates orbit offsets (`:1441–1450`), and dragging bypasses the paused early return without enabling scene-clock advancement (`:1579–1585`).

- **Resume still continues from the frozen clock.** Visible paused callbacks update `lastTick` before returning (`:1575–1581`), preventing accumulated paused wall time from entering the simulation. Returning on-screen also resets `lastTick` (`:1880–1881`).

- **Normal off-screen animation remains stopped.** The RAF visibility guard is intact (`:1571–1573`). Finding #12 is specifically the newly added direct resize-render path, not a loss of the observer or continuous off-screen animation.

- **The resize test checks actual scene output, not just bookkeeping.** It screenshots the canvas with overlays hidden and counts dark pixels (`e2e/brand.spec.ts:77–94`), in addition to checking the frozen clock after resizing (`:109–113`). The reported mutation result was not independently reproduced.

- **The asset boundary remains constrained.** Only the fixed allow-list reaches `ASSETS.fetch`, and unsupported methods are rejected (`apps/worker/src/brand/index.ts:21–55`). No asset-routing expansion accompanies this fix.

- **Supplied static evidence remains clean.** `/data/tmp/dec245/seo-check-r3.txt` reports **0 failures and 0 warnings on all ten pages**. `/data/tmp/dec245/ui-gates-r3.json` records zero horizontal overflow, no broken courier images, and no recorded errors on the exercised 1440 px and 390 px screens; keyboard Select selection returns focus to its trigger. The inspected desktop and phone hero screenshots show the revised controls and copy.

**Verification limitation:** the reported browser **10 passed / 2 skipped**, Worker **13/13**, and mutation results were not independently rerun. After correcting #12, rerun the focused brand/SPA Worker tests, `e2e/brand.spec.ts` with the off-screen resize case, and the required pre-merge gate.