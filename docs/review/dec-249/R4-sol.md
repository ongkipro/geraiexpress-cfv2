## Review

DEC-249 Round 4 — `9098c31..0af557b` on `dec-249`. Reviewed the supplied delta, Round 3 review, disposition, and affected source. No files were modified and no tests were rerun.

- **Finding: P2 — The desktop regression runs at 1440 px, not 1280 px.** The `desktop-1280` project starts at 1280 px (`playwright.config.ts:32`), but the test resizes to 1440 px for the home-height check and returns to 1440 px after the wide-screen check (`e2e/brand.spec.ts:477`, `e2e/brand.spec.ts:507`). It then calls `emulateMedia` without another resize (`e2e/brand.spec.ts:522`). The recorded passing run therefore covers the transition at 390 and 1440 px, not the 390 and 1280 px claimed in `docs/review/dec-249/DISPOSITION.md:40`. Save the project’s initial viewport and restore it before the dynamic reduced-motion block, then rerun the focused test in both projects.
- **Correct — The R3-1 CSS fix is sound.** All `.marquee[data-ready]` rules, including the pause-control display rule, are inside the `no-preference` query (`apps/worker/src/brand/styles.ts:214`, `apps/worker/src/brand/styles.ts:219`). Switching to reduced motion restores the wrapping list and removes the mask, animation, duplicate track, and pause control even while `data-ready` remains set (`apps/worker/src/brand/styles.ts:209`, `apps/worker/src/brand/styles.ts:222`). The new test exercises that transition without reloading (`e2e/brand.spec.ts:521`), and the mutation record shows it catches the original failure at 390 px (`docs/evidence/DEC-249/mutations.md:44`).

No other P0–P2 issues found in the supplied delta.

**Merge verdict: BLOCK** — the required 1280 px regression coverage is still missing.

Verdict: REQUEST_CHANGES