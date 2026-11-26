# `/panduan` Illustrated User Guide — Independent Review (`cx/gpt-6.2-sol`, Rounds 1–4)

- **Reviewer:** `cx/gpt-6.2-sol` (`ai-ask codex`, read-only sandbox with full source attachments)
- **Date:** 2026-11-26
- **Base:** `4d0bafc` (`main`)
- **Worktree:** `panduan-final`
- **Final Verdict:** **APPROVE** (Round 4 — zero blocking findings)

## Round 1 (`CHANGES REQUIRED`)

Reviewed in 3 full-source parts (Part 1: tracked diff + tests + docs; Part 2: `panduan.ts`, `index.ts`, `seo.ts`; Part 3: `scripts/panduan/{capture,seed,optimize}.mjs` + `README.md`):

- **Part 1 (2 P2):**
  1. `DESIGN.md:91`: `first-viewport-words` allowlist stated `≥ 768 px` TOC beside page head, while CSS places 2-column TOC above guide body `< 1000 px` and sticky beside guide body `≥ 1000 px`.
  2. `docs/visual/09` §7.3: stated JS only marks active TOC item, omitting the `≤ 700 px` zoom `href` sync to `-hp.webp` and no-JS fallback to `.webp`.
- **Part 2 (3 P1, 2 P2):**
  3. `apps/worker/src/brand/panduan.ts` (`figure`): without JS, zoom `<a>` opens `.webp` instead of `-hp.webp` on narrow screens.
  4. `apps/worker/src/brand/panduan.ts` (`renderPanduanBody`): without JS, no TOC item carries static `aria-current="location"`.
  5. `apps/worker/src/brand/index.ts` (`/sitemap.xml`): `host` interpolated into XML without `escapeHtml`.
  6. `apps/worker/src/brand/seo.ts` (`MENU_ROWS`): `"Rp 0 pendaftaran"` mentioned in menu hint.
  7. `apps/worker/src/brand/panduan.ts` (`figure`/`renderGuide`): `g.caption` and plain-text fields interpolated without `escapeHtml`.
- **Part 3 (3 P1, 3 P2):**
  8. `scripts/panduan/capture.mjs:21`: `st.slug` / `st.port` not validated before constructing `APP`/`OWNER`/`SITE`.
  9. `scripts/panduan/capture.mjs:146`: manual `b.at` badge coordinates skipped `hits()` collision check.
  10. `scripts/panduan/capture.mjs:280`: viewport bounds not enforced on markers when `region` is undefined.
  11. `scripts/panduan/capture.mjs:67`: multi-locator marks passed even when one target locator was missing.
  12. `scripts/panduan/capture.mjs:205`: phone redaction regex missed space/hyphen after `+62` and skipped `placeholder` attributes.
  13. `scripts/panduan/optimize.mjs:26` & `capture.mjs`: `capture.mjs` exited 0 on failed sections and `--merge` could pick up stale PNGs in a reused directory.

## Round 2 (`CHANGES REQUIRED` — 1 P2)

- Confirmed Part 1 fixes (`DESIGN.md`, `visual/09 §7.3`), `index.ts` XML escaping, and `capture.mjs` locator/collision/bounds/placeholder/exitCode guards.
- Remaining P2: `scripts/panduan/capture.mjs` should write an in-progress sentinel `shots.json` before writing the first PNG so a crash outside `section()` cannot leave an old valid manifest behind. (`optimize.mjs` / `seed.mjs` were truncated at the 60 KB attachment cap.)

## Round 3 (`CHANGES REQUIRED` — 3 P2)

- Confirmed sentinel manifest in `capture.mjs` and HTML escaping in `panduan.ts`.
- Remaining 3 polish findings:
  1. `scripts/panduan/optimize.mjs`: remove `readdirSync` fallback when `shots.json` is missing/invalid; require a valid completed manifest.
  2. `scripts/panduan/seed.mjs` & `capture.mjs`: validate numeric port range `1–65535` (not just digit length).
  3. `apps/worker/src/brand/styles.ts`: make `.gtoc` 2-column by default and override at `@media(min-width:1000px)` so fractional widths `999px–1000px` have no gap.

## Round 4 (**APPROVE**)

> **Verdict: APPROVE**
>
> No blocking findings. All three R3 items verified: `optimize.mjs` requires `shots.json`, rejects `inProgress`, non-empty `failed`, and missing/empty `shots`, converting only listed stems; both scripts validate port `1–65535` before forming local URLs; `.gtoc` defaults to two columns below `1000px` and switches to one sticky column at `1000px` with no breakpoint gap and full consistency with `DESIGN.md` and `docs/visual/09` §7.3.
